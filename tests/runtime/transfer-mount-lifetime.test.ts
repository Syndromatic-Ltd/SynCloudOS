/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { afterEach, describe, expect, it } from "vitest";
import { createPasteboardRegistry, getPasteboardRuntimeControl } from "../../src/SynCloudOS/Pasteboard/Pasteboard";
import { authoriseTestRuntime, createTestBundle, createTestRuntime } from "./helpers";

const runtimes: Array<ReturnType<typeof createTestRuntime>> = [];

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose("test cleanup")));
});

function fixture() {
  const runtime = authoriseTestRuntime(createTestRuntime({
    id: "p10:repair-4-transfer",
    initialBundles: [createTestBundle({ bundleIdentifier: "com.example.source", route: "/source" })],
  }));
  runtimes.push(runtime);
  const app = runtime.apps.getApp("com.example.source")!;
  const root = "application:com.example.source";
  const sibling = "application:com.example.source:sibling";
  runtime.responders.register({ id: root, kind: "application", parentId: "workspace", scopeId: root });
  runtime.responders.register({ id: sibling, kind: "view", parentId: root, scopeId: sibling });
  return { runtime, app, root, sibling };
}

describe("transfer mount lifetime", () => {
  it("keeps an app-private board alive for a sibling mount and clears it once the final owner retires", async () => {
    const { runtime, app, root, sibling } = fixture();
    const first = runtime.transfers.mountApp(app, { responderId: root });
    const second = runtime.transfers.mountApp(app, { responderId: sibling });
    const board = first.scope.pasteboards.named("app:com.example.source");

    await board.write([{ type: "text/plain", value: "survives first mount" }]);
    first.dispose();
    await expect(second.scope.pasteboards.named("app:com.example.source").snapshot()).resolves.toEqual([
      { type: "text/plain", value: "survives first mount" },
    ]);

    second.dispose();
    const reopened = runtime.transfers.mountApp(app, { responderId: root });
    await expect(reopened.scope.pasteboards.named("app:com.example.source").snapshot()).resolves.toEqual([]);
    reopened.dispose();
  });

  it("retires explicit mount drag resources when the application closes", async () => {
    const { runtime, app, root } = fixture();
    const mount = runtime.transfers.mountApp(app, { responderId: root });
    const session = mount.scope.drag.manager.begin({
      source: mount.scope.drag.endpoint(),
      representations: [{ type: "text/plain", value: "close me" }],
      operations: ["copy"],
    });
    expect(runtime.drag.snapshot().active?.id).toBe(session.id);

    await runtime.lifecycle.launch(app.bundleIdentifier, { reason: "transfer lifecycle setup" }).result;
    let abortedAtClosedNotification: boolean | undefined;
    const stopObserving = runtime.store.subscribe(() => {
      if (abortedAtClosedNotification === undefined && runtime.lifecycle.getState(app.bundleIdentifier) === "closed") {
        abortedAtClosedNotification = mount.signal.aborted;
      }
    });
    await runtime.lifecycle.close(app.bundleIdentifier, { reason: "transfer lifecycle test" }).result;
    stopObserving();
    expect(abortedAtClosedNotification).toBe(true);
    expect(runtime.drag.snapshot().active).toBeNull();
    await expect(mount.scope.pasteboards.find.write([{ type: "text/plain", value: "stale" }]))
      .rejects.toMatchObject({ name: "SecurityError" });
  });

  it("refuses replacement mounts issued from a closing mount's abort listener", async () => {
    const { runtime, app, root, sibling } = fixture();
    await runtime.lifecycle.launch(app.bundleIdentifier, { reason: "mount revocation setup" }).result;
    const activeApp = runtime.apps.getApp(app.bundleIdentifier)!;
    const mount = runtime.transfers.mountApp(activeApp, { responderId: root });
    let remintError: unknown;
    mount.signal.addEventListener("abort", () => {
      try {
        runtime.transfers.mountApp(activeApp, { responderId: sibling });
      } catch (error) {
        remintError = error;
      }
    }, { once: true });

    const outcome = await runtime.lifecycle.close(app.bundleIdentifier, { reason: "mount revocation test" }).result;
    expect(outcome).toMatchObject({ status: "completed", committed: true, postCommit: "completed" });
    expect(remintError).toMatchObject({ name: "SecurityError" });
  });

  it("does not let a final old lease clear a reopened mount's private board while teardown awaits authorisation", async () => {
    const lifetime = new AbortController();
    let enteredClear!: () => void;
    const clearEntered = new Promise<void>((resolve) => { enteredClear = resolve; });
    let releaseClear!: () => void;
    const clearGate = new Promise<void>((resolve) => { releaseClear = resolve; });
    const registry = createPasteboardRegistry({
      runtimeId: "p10:repair-4-private-board-race" as never,
      signal: lifetime.signal,
      authorise: async (request) => {
        if (request.operation === "clear") {
          enteredClear();
          await clearGate;
        }
        return true;
      },
    });
    const control = getPasteboardRuntimeControl(registry);
    const context = { appId: "com.example.source", responderId: "application:com.example.source" };
    const first = control.issueLease(context, () => context, { ownsPrivateBoard: true });
    await control.forLease(first).named("app:com.example.source").write([{ type: "text/plain", value: "old generation" }]);

    const clearing = control.clearLease(first);
    await clearEntered;
    const reopened = control.issueLease(context, () => context, { ownsPrivateBoard: true });
    const board = control.forLease(reopened).named("app:com.example.source");
    await expect(board.snapshot()).resolves.toEqual([]);
    await expect(board.readFirst(["text/plain"])).resolves.toBeNull();
    await board.write([{ type: "text/plain", value: "new generation" }]);
    releaseClear();

    await expect(clearing).rejects.toMatchObject({ name: "AbortError" });
    await expect(board.snapshot()).resolves.toEqual([{ type: "text/plain", value: "new generation" }]);
    await control.clearLease(reopened);
    registry.dispose();
  });

  it("does not materialise a second lazy entry after the first provider retires and reopens its private-board generation", async () => {
    const lifetime = new AbortController();
    let enteredClear!: () => void;
    const clearEntered = new Promise<void>((resolve) => { enteredClear = resolve; });
    let releaseClear!: () => void;
    const clearGate = new Promise<void>((resolve) => { releaseClear = resolve; });
    const registry = createPasteboardRegistry({
      runtimeId: "p10:repair-4-private-board-lazy-race" as never,
      signal: lifetime.signal,
      authorise: async (request) => {
        if (request.operation === "clear") {
          enteredClear();
          await clearGate;
        }
        return true;
      },
    });
    const control = getPasteboardRuntimeControl(registry);
    const context = { appId: "com.example.source", responderId: "application:com.example.source" };
    const first = control.issueLease(context, () => context, { ownsPrivateBoard: true });
    let clearing: Promise<void> | undefined;
    let reopened: ReturnType<typeof control.issueLease> | undefined;
    let staleProviderCalls = 0;
    const board = control.forLease(first).named("app:com.example.source");
    await board.write([
      {
        type: "text/plain",
        provide: () => {
          clearing = control.clearLease(first);
          reopened = control.issueLease(context, () => context, { ownsPrivateBoard: true });
          return "first provider retired its generation";
        },
      },
      {
        type: "text/html",
        provide: () => {
          staleProviderCalls += 1;
          return new Promise<string>(() => undefined);
        },
      },
    ]);

    const reader = new AbortController();
    const reading = board.read(["text/plain", "text/html"], reader.signal);
    try {
      await clearEntered;
      expect(staleProviderCalls).toBe(0);
      await expect(reading).rejects.toMatchObject({ name: "AbortError" });
    } finally {
      reader.abort();
      await expect(reading).rejects.toMatchObject({ name: "AbortError" });
      releaseClear();
      await expect(clearing).rejects.toMatchObject({ name: "AbortError" });
      if (reopened) await control.clearLease(reopened);
      registry.dispose();
    }
  });
});
