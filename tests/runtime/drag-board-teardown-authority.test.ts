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

import { describe, expect, it } from "vitest";
import { createDragSessionManager } from "../../src/SynCloudOS/Drag";
import { createPasteboardRegistry } from "../../src/SynCloudOS/Pasteboard/Pasteboard";
import { createRuntimeOwnerToken } from "../../src/SynCloudOS/Runtime/runtimeOwner";
import { authoriseTestRuntime, createTestBundle, createTestRuntime } from "./helpers";

async function awaitDragPublication(): Promise<void> {
  // A scoped endpoint crosses the lease facade and the asynchronous
  // pasteboard write before the kernel mirror commits.
  for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
}

describe("authoritative drag-board teardown", () => {
  it("clears through kernel authority after source revocation and never lets an old delayed clear erase a newer generation", async () => {
    const lifetime = new AbortController();
    const boards = createPasteboardRegistry({ runtimeId: "repair-5-drag" as never, signal: lifetime.signal });
    const sourceToken = Object.freeze({});
    const endpoint = Object.freeze({ appId: "com.example.source", windowId: "source-window", responderId: "source-responder" });
    let sourceLive = true;
    let releaseDelayedClear!: () => void;
    const delayedClear = new Promise<void>((resolve) => { releaseDelayedClear = resolve; });
    let delayedClearCalls = 0;
    const sourceBoard = {
      write: (values: readonly { readonly type: "text/plain"; readonly value: string }[]) => boards.drag.write(values),
      async clear() {
        delayedClearCalls += 1;
        await delayedClear;
        boards.drag.clear();
      },
    };
    const manager = createDragSessionManager({
      runtimeId: "repair-5-drag" as never,
      ownerToken: createRuntimeOwnerToken(),
      signal: lifetime.signal,
      pasteboard: boards.drag,
      randomUUID: () => `repair-5-${Math.random()}`,
      resolveEndpoint(value, role) {
        if (role !== "source" || value !== sourceToken) return null;
        return { endpoint, pasteboard: sourceBoard as never, isLive: () => sourceLive };
      },
    });

    const old = manager.begin({
      source: sourceToken as never,
      representations: [{ type: "text/plain", value: "old payload" }],
      operations: ["copy"],
    });
    await Promise.resolve();
    sourceLive = false;
    manager.cancel(old.id, "source mount revoked");
    expect(boards.drag.snapshot()).toEqual([]);

    sourceLive = true;
    const fresh = manager.begin({
      source: sourceToken as never,
      representations: [{ type: "text/plain", value: "new payload" }],
      operations: ["copy"],
    });
    await Promise.resolve();
    releaseDelayedClear();
    await Promise.resolve();

    expect(delayedClearCalls).toBe(0);
    expect(manager.snapshot().active?.id).toBe(fresh.id);
    expect(boards.drag.snapshot()).toEqual([{ type: "text/plain", value: "new payload" }]);
    manager.dispose();
    boards.dispose();
  });

  it("clears the shared drag board when an actual transfer mount retires before a same-app mount publishes again", async () => {
    const appId = "com.example.repair-5-drag-mounted";
    const runtime = authoriseTestRuntime(createTestRuntime({ initialBundles: [createTestBundle({ bundleIdentifier: appId, route: `/${appId}` })] }));
    const responderId = `application:${appId}`;
    runtime.responders.register({ id: responderId, kind: "application", parentId: "workspace", scopeId: responderId });
    const app = runtime.apps.getApp(appId)!;

    try {
      const first = runtime.transfers.mountApp(app, { responderId });
      const old = first.scope.drag.manager.begin({
        source: first.scope.drag.endpoint(),
        representations: [{ type: "text/plain", value: "departing mount" }],
        operations: ["copy"],
      });
      await awaitDragPublication();
      expect(runtime.pasteboards.drag.snapshot()).toEqual([{ type: "text/plain", value: "departing mount" }]);

      first.dispose();
      expect(runtime.pasteboards.drag.snapshot()).toEqual([]);

      const fresh = runtime.transfers.mountApp(app, { responderId });
      const next = fresh.scope.drag.manager.begin({
        source: fresh.scope.drag.endpoint(),
        representations: [{ type: "text/plain", value: "fresh mount" }],
        operations: ["copy"],
      });
      await awaitDragPublication();
      expect(old.id).not.toBe(next.id);
      expect(runtime.pasteboards.drag.snapshot()).toEqual([{ type: "text/plain", value: "fresh mount" }]);
      fresh.dispose();
      expect(runtime.pasteboards.drag.snapshot()).toEqual([]);
    } finally {
      await runtime.dispose("mounted drag teardown test complete");
    }
  });
});
