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

import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  WindowContentController,
  WindowContentDescriptor,
  WindowRestorationSnapshot,
} from "../../src/SynCloudOS/Windows";
import {
  createWindowTestDependencies,
  modalWindow,
  standardWindow,
} from "../fixtures/windowTestDependencies";
import { createTestRuntime, createTestRuntimeEnvironment } from "./helpers";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

function readyContent(
  descriptor: WindowContentDescriptor,
  id: string,
  overrides: Partial<WindowContentController> = {},
): WindowContentController {
  return {
    mountKey: `review:${id}`,
    responderId: `control:${id}:review`,
    load: vi.fn(async () => undefined),
    prepareClose: vi.fn(async () => ({
      status: "ready" as const,
      token: id,
      commit: vi.fn(),
      rollback: vi.fn(),
    })),
    unload: vi.fn(),
    dispose: vi.fn(),
    ...overrides,
  };
}

describe("window transition authority", () => {
  it("associates before deferred load and fences a close that settles while open is suspended", async () => {
    const load = deferred<void>();
    const entered = deferred<void>();
    const fixture = createWindowTestDependencies({
      contentFactory: (descriptor, id) => readyContent(descriptor, id, {
        load: vi.fn(async () => {
          entered.resolve();
          await load.promise;
        }),
      }),
    });
    cleanups.push(fixture.cleanup);
    await fixture.createDocument("deferred-document");
    const controller = fixture.manager.create(standardWindow("deferred-window", {
      documentId: "deferred-document",
      documentAssociationRole: "primary",
    }));

    const opening = fixture.manager.open(controller.id);
    await entered.promise;
    expect(fixture.documents.getDocument("deferred-document")?.windowAssociations).toEqual([
      { windowControllerId: controller.id, role: "primary" },
    ]);

    fixture.documents.registerCloseReviewer({ review: vi.fn(async () => "discard") });
    await expect(fixture.manager.requestClose(controller.id, { reason: "command" })).resolves.toMatchObject({ outcome: "closed" });
    load.resolve();
    await expect(opening).rejects.toThrow(/stale|closed|transition/i);
    expect(fixture.manager.list()).toEqual([]);
    expect(fixture.documents.getDocument("deferred-document")).toBeNull();
  });

  it("includes an opening controller in application-close transition authority", async () => {
    const load = deferred<void>();
    const entered = deferred<void>();
    const fixture = createWindowTestDependencies({
      contentFactory: (descriptor, id) => readyContent(descriptor, id, {
        load: vi.fn(async () => {
          entered.resolve();
          await load.promise;
        }),
      }),
    });
    cleanups.push(fixture.cleanup);
    const controller = fixture.manager.create(standardWindow("opening-application-window"));
    const opening = fixture.manager.open(controller.id);
    await entered.promise;

    await expect(fixture.manager.requestCloseApplication("com.syndromatic.Notes", {
      reason: "application-quit",
    })).resolves.toMatchObject({ outcome: "closed" });
    load.resolve();
    await expect(opening).rejects.toThrow(/stale|closed|transition/i);
    expect(fixture.manager.list()).toEqual([]);
  });

  it("fully removes a deferred opening controller and its document association on manager disposal", async () => {
    const load = deferred<void>();
    const entered = deferred<void>();
    const fixture = createWindowTestDependencies({
      contentFactory: (descriptor, id) => readyContent(descriptor, id, {
        load: vi.fn(async () => {
          entered.resolve();
          await load.promise;
        }),
      }),
    });
    cleanups.push(fixture.cleanup);
    await fixture.createDocument("disposed-opening-document");
    const controller = fixture.manager.create(standardWindow("disposed-opening-window", {
      documentId: "disposed-opening-document",
      documentAssociationRole: "primary",
    }));
    const opening = fixture.manager.open(controller.id);
    await entered.promise;

    fixture.manager.dispose();
    expect(fixture.manager.diagnostics().controllerCount).toBe(0);
    expect(fixture.documents.getDocument("disposed-opening-document")?.windowAssociations).toEqual([]);
    load.resolve();
    await expect(opening).rejects.toThrow(/disposed|stale|transition/i);
  });

  it("does not admit a new descendant beneath a ready close token", async () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    const root = fixture.manager.create(standardWindow("reserved-root"));
    await fixture.manager.open(root.id);
    const preparation = await fixture.manager.prepareClose(root.id, { reason: "command" });
    expect(preparation.status).toBe("ready");
    if (preparation.status !== "ready") throw new Error("Expected ready preparation.");

    expect(() => fixture.manager.create(standardWindow("late-child", {
      parentWindowControllerId: root.id,
    }))).toThrow(/closing|reserved|transition/i);
    fixture.manager.rollbackClose(preparation.token);
  });

  it("cancels a noncooperative disposal prepare promptly and ignores its late settlement", async () => {
    const closeGate = deferred<void>();
    const entered = deferred<void>();
    const fixture = createWindowTestDependencies({
      contentFactory: (descriptor, id) => readyContent(descriptor, id, {
        prepareClose: vi.fn(async () => {
          entered.resolve();
          await closeGate.promise;
          return {
            status: "ready" as const,
            token: id,
            commit: vi.fn(),
            rollback: vi.fn(),
          };
        }),
      }),
    });
    cleanups.push(fixture.cleanup);
    const first = fixture.manager.create(standardWindow("noncooperative"));
    await fixture.manager.open(first.id);
    const preparationAbort = new AbortController();
    const runtimeAbort = new AbortController();
    const preparing = fixture.manager.prepareRuntimeDisposal({
      runtimeId: fixture.runtimeId,
      reason: "review",
      runtimeSignal: runtimeAbort.signal,
      preparationSignal: preparationAbort.signal,
      deadlineAt: null,
      operations: fixture.operations,
    });
    await entered.promise;
    preparationAbort.abort("cancelled-by-test");

    await expect(preparing).resolves.toMatchObject({ status: "cancelled" });
    expect(() => fixture.manager.create(standardWindow("admitted-after-cancel"))).not.toThrow();
    expect(() => fixture.manager.makeKey(first.id)).not.toThrow();
    closeGate.resolve();
    await Promise.resolve();
    expect(fixture.manager.select(first.id).record.state).toBe("open");
  });
});

describe("document presentation routing", () => {
  it("routes a primary and associated child through one cancellable document close", async () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    await fixture.createDocument("forest-document");
    const primary = fixture.manager.create(standardWindow("forest-primary", {
      documentId: "forest-document",
      documentAssociationRole: "primary",
    }));
    const child = fixture.manager.create(standardWindow("forest-child", {
      parentWindowControllerId: primary.id,
      documentId: "forest-document",
      documentAssociationRole: "inspector",
    }));
    await fixture.manager.open(primary.id);
    await fixture.manager.open(child.id);
    fixture.documents.registerCloseReviewer({ review: vi.fn(async () => "cancel") });
    const prepareCloseDocuments = vi.spyOn(fixture.documents, "prepareCloseDocuments");
    const signal = new AbortController().signal;

    await expect(fixture.manager.requestClose(primary.id, { reason: "control", signal })).resolves.toEqual({
      outcome: "cancelled",
      windowControllerId: primary.id,
    });
    expect(prepareCloseDocuments).toHaveBeenCalledOnce();
    expect(prepareCloseDocuments).toHaveBeenCalledWith(
      ["forest-document"],
      "window-control",
      signal,
      [primary.id],
    );
    expect(fixture.documents.getDocument("forest-document")).not.toBeNull();
    expect(fixture.manager.list({ documentId: "forest-document" }).map(({ id }) => id)).toEqual([
      primary.id,
      child.id,
    ]);
  });

  it("routes application quit through the same final document authority", async () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    await fixture.createDocument("application-document");
    const primary = fixture.manager.create(standardWindow("application-primary", {
      documentId: "application-document",
      documentAssociationRole: "primary",
    }));
    const inspector = fixture.manager.create(standardWindow("application-inspector", {
      documentId: "application-document",
      documentAssociationRole: "inspector",
    }));
    await fixture.manager.open(primary.id);
    await fixture.manager.open(inspector.id);
    fixture.documents.registerCloseReviewer({ review: vi.fn(async () => "cancel") });
    const prepareCloseDocuments = vi.spyOn(fixture.documents, "prepareCloseDocuments");
    const signal = new AbortController().signal;

    await expect(fixture.manager.requestCloseApplication("com.syndromatic.Notes", {
      reason: "application-quit",
      signal,
    })).resolves.toEqual({ outcome: "cancelled", windowControllerId: primary.id });
    expect(prepareCloseDocuments).toHaveBeenCalledOnce();
    expect(prepareCloseDocuments).toHaveBeenCalledWith(
      ["application-document"],
      "application-quit",
      signal,
      [primary.id, inspector.id],
    );
    expect(fixture.manager.list({ applicationId: "com.syndromatic.Notes" })).toHaveLength(2);
  });

  it("prepares every final application document before committing any document or window", async () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    await fixture.createDocument("composite-first-document");
    await fixture.createDocument("composite-second-document");
    const first = fixture.manager.create(standardWindow("composite-first-window", {
      documentId: "composite-first-document",
      documentAssociationRole: "primary",
    }));
    const second = fixture.manager.create(standardWindow("composite-second-window", {
      documentId: "composite-second-document",
      documentAssociationRole: "primary",
    }));
    await fixture.manager.open(first.id);
    await fixture.manager.open(second.id);
    fixture.documents.registerCloseReviewer({
      review: vi.fn()
        .mockResolvedValueOnce("discard")
        .mockResolvedValueOnce("cancel"),
    });

    await expect(fixture.manager.requestCloseApplication("com.syndromatic.Notes", {
      reason: "application-quit",
    })).resolves.toMatchObject({ outcome: "cancelled" });
    expect(fixture.documents.getDocument("composite-first-document")).not.toBeNull();
    expect(fixture.documents.getDocument("composite-second-document")).not.toBeNull();
    expect(fixture.manager.list({ applicationId: "com.syndromatic.Notes" }).map(({ id }) => id)).toEqual([
      first.id,
      second.id,
    ]);
  });
});

describe("window observer and value boundaries", () => {
  it("isolates a throwing observer and preserves the successful open transaction", async () => {
    const observed: string[] = [];
    const fixture = createWindowTestDependencies({
      observeError: (error, context) => observed.push(`${context}:${String(error)}`),
    });
    cleanups.push(fixture.cleanup);
    const controller = fixture.manager.create(standardWindow("observer-window"));
    fixture.manager.subscribe(() => { throw new Error("observer exploded"); });
    const second = vi.fn();
    fixture.manager.subscribe(second);

    await expect(fixture.manager.open(controller.id)).resolves.toBe(controller);
    expect(controller.record.state).toBe("open");
    expect(fixture.manager.list().map(({ id }) => id)).toEqual([controller.id]);
    expect(second).toHaveBeenCalled();
    expect(observed.some((entry) => entry.includes("observer exploded"))).toBe(true);
  });

  it("continues controller disposal and reports every failing resource", async () => {
    const observed: string[] = [];
    const fixture = createWindowTestDependencies({
      observeError: (error, context) => observed.push(`${context}:${String(error)}`),
      contentFactory: (descriptor, id) => readyContent(descriptor, id, {
        unload: vi.fn(() => { throw new Error("unload exploded"); }),
        dispose: vi.fn(() => { throw new Error("dispose exploded"); }),
      }),
    });
    cleanups.push(fixture.cleanup);
    const controller = fixture.manager.create(standardWindow("disposal-observer"));
    await fixture.manager.open(controller.id);

    expect(() => fixture.manager.dispose()).not.toThrow();
    expect(observed).toEqual(expect.arrayContaining([
      expect.stringContaining("unload exploded"),
      expect.stringContaining("dispose exploded"),
    ]));
    expect(controller.contentState.status).toBe("disposed");
  });

  it("rejects descriptor accessors without invoking them and owns one immutable canonical clone", () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    let getterReads = 0;
    const parameters = Object.create(Object.prototype);
    Object.defineProperty(parameters, "secret", {
      enumerable: true,
      get() {
        getterReads += 1;
        return "unsafe";
      },
    });
    expect(() => fixture.manager.create(standardWindow("accessor-window", {
      content: { rendererId: "test-window", parameters },
    }))).toThrow(/serialisable|descriptor|accessor/i);
    expect(getterReads).toBe(0);

    const mutable = { nested: { value: "before" } };
    const controller = fixture.manager.create(standardWindow("immutable-window", {
      content: { rendererId: "test-window", parameters: mutable },
    }));
    mutable.nested.value = "after";
    expect(controller.record.content.parameters).toEqual({ nested: { value: "before" } });
    expect(Object.isFrozen((controller.record.content.parameters as { nested: object }).nested)).toBe(true);
    expect(() => controller.setContentRestorationState(-0)).toThrow(/serialisable|negative zero/i);
  });

  it("rejects every non-canonical serialisable shape at window ingress", () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    const nonEnumerable = { visible: true };
    Object.defineProperty(nonEnumerable, "hidden", { enumerable: false, value: true });
    const symbolKeyed = { visible: true, [Symbol("hidden")]: true };
    const sparse: unknown[] = [];
    sparse.length = 1;
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let index = 0; index < 66; index += 1) {
      const next: Record<string, unknown> = {};
      cursor.next = next;
      cursor = next;
    }

    for (const [index, value] of [
      nonEnumerable,
      symbolKeyed,
      sparse,
      cyclic,
      new Map([["unsupported", true]]),
      Object.assign(new (class UnsafeWindowValue {})(), { unsafePrototype: true }),
      deep,
      "x".repeat((4 * 1024 * 1024) + 1),
    ].entries()) {
      expect(() => fixture.manager.create(standardWindow(`invalid-value-${index}`, {
        content: { rendererId: "test-window", parameters: value as never },
      })), `invalid canonical value ${index}`).toThrow(/serialisable|canonical|plain JSON|prototype|depth|size|byte|sparse|symbol|enumerable|acyclic/i);
    }
  });
});

describe("window restoration and focus recovery", () => {
  it("fails closed on corrupt raw browser persistence without replacing its bytes or identity", () => {
    const environment = createTestRuntimeEnvironment();
    environment.localStorage!.setItem("syncloudos:windows.workspace-v1", "{corrupt-window-json");

    expect(() => createTestRuntime({ environment })).toThrow(/window restoration|persisted workspace|JSON/i);
    expect(environment.localStorage!.getItem("syncloudos:windows.workspace-v1")).toBe("{corrupt-window-json");
    expect(environment.localStorage!.getItem("syncloudos:windows.installation-id")).toBeNull();
  });

  it("does not mint installation identity over an orphaned persisted workspace", () => {
    const values = new Map<string, unknown>([["windows.workspace-v1", { schemaVersion: 99 }]]);
    const persistence = {
      read: vi.fn((key: "windows.installation-id" | "windows.workspace-v1") => values.get(key) ?? null),
      write: vi.fn((key: "windows.installation-id" | "windows.workspace-v1", value: unknown) => values.set(key, value)),
    };

    expect(() => createWindowTestDependencies({
      namespace: "tests.orphaned-workspace",
      persistence: persistence as never,
    })).toThrow(/installation identity|persisted workspace|restoration/i);
    expect(persistence.write).not.toHaveBeenCalled();
    expect(values.get("windows.workspace-v1")).toEqual({ schemaVersion: 99 });
  });

  it("preserves future persisted bytes and rejects descriptor traps without minting identity", async () => {
    let getterReads = 0;
    const future = Object.create(Object.prototype);
    Object.defineProperty(future, "schemaVersion", {
      enumerable: true,
      get() {
        getterReads += 1;
        return 99;
      },
    });
    const values = new Map<string, unknown>([
      ["windows.installation-id", "durable-installation"],
      ["windows.workspace-v1", future],
    ]);
    const persistence = {
      read: vi.fn((key: "windows.installation-id" | "windows.workspace-v1") => values.get(key) ?? null),
      write: vi.fn((key: "windows.installation-id" | "windows.workspace-v1", value: unknown) => values.set(key, value)),
    };
    const fixture = createWindowTestDependencies({
      namespace: "tests.future",
      persistence: persistence as never,
    });
    cleanups.push(fixture.cleanup);

    await expect(fixture.manager.restorePersistedWorkspace()).rejects.toThrow(/schema|snapshot|descriptor|accessor/i);
    expect(getterReads).toBe(0);
    expect(values.get("windows.workspace-v1")).toBe(future);
    expect(persistence.write).not.toHaveBeenCalled();
  });

  it("fully removes a transient load failure so the next restore genuinely retries", async () => {
    let loadAttempts = 0;
    const source = createWindowTestDependencies({ namespace: "tests.retry", installationId: "retry-installation" });
    cleanups.push(source.cleanup);
    source.manager.create(standardWindow("retry-window"));
    const snapshot = JSON.parse(JSON.stringify(source.manager.createRestorationSnapshot())) as WindowRestorationSnapshot;
    const target = createWindowTestDependencies({
      namespace: "tests.retry",
      installationId: "retry-installation",
      contentFactory: (descriptor, id) => readyContent(descriptor, id, {
        load: vi.fn(async () => {
          loadAttempts += 1;
          if (loadAttempts === 1) throw new Error("transient load failure");
        }),
      }),
    });
    cleanups.push(target.cleanup);

    const first = await target.manager.restoreWorkspace(snapshot);
    expect(first.failures).toEqual([expect.objectContaining({ reason: "content-load-failed" })]);
    expect(target.manager.diagnostics().controllerCount).toBe(0);
    const second = await target.manager.restoreWorkspace(snapshot);
    expect(second.restoredWindowControllerIds).toEqual(["retry-window"]);
    expect(second.reusedWindowControllerIds).toEqual([]);
    expect(loadAttempts).toBe(2);
  });

  it("rolls back every controller created by a restoration aborted after an earlier open", async () => {
    const source = createWindowTestDependencies({ namespace: "tests.abort-rollback", installationId: "abort-installation" });
    cleanups.push(source.cleanup);
    source.manager.create(standardWindow("abort-first"));
    source.manager.create(standardWindow("abort-second"));
    const snapshot = JSON.parse(JSON.stringify(source.manager.createRestorationSnapshot())) as WindowRestorationSnapshot;
    const secondLoadEntered = deferred<void>();
    const target = createWindowTestDependencies({
      namespace: "tests.abort-rollback",
      installationId: "abort-installation",
      contentFactory: (descriptor, id) => readyContent(descriptor, id, {
        load: vi.fn(async ({ signal }) => {
          if (id !== "abort-second") return;
          secondLoadEntered.resolve();
          await new Promise<void>((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
        }),
      }),
    });
    cleanups.push(target.cleanup);
    const abort = new AbortController();
    const restoring = target.manager.restoreWorkspace(snapshot, abort.signal);
    await secondLoadEntered.promise;
    abort.abort(new DOMException("Cancelled", "AbortError"));

    await expect(restoring).rejects.toMatchObject({ name: "AbortError" });
    expect(target.manager.list()).toEqual([]);
    expect(target.manager.diagnostics().controllerCount).toBe(0);
  });

  it("restores each window's last live descendant across key and modal transitions", async () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    const first = fixture.manager.create(standardWindow("focus-first"));
    const second = fixture.manager.create(standardWindow("focus-second"));
    const modal = fixture.manager.create(modalWindow("focus-modal", first.id));
    await fixture.manager.open(first.id);
    await fixture.manager.open(second.id);
    const firstRoot = first.contentState.status === "loaded" ? first.contentState.rootResponderId : first.windowResponderId;
    const descendant = fixture.responders.register({
      id: "control:focus-first:field",
      runtimeId: fixture.runtimeId,
      kind: "control",
      parentId: firstRoot,
      scopeId: first.windowResponderId,
    });
    fixture.focus.requestFocus(descendant.id);

    fixture.manager.makeKey(second.id);
    fixture.manager.makeKey(first.id);
    expect(fixture.focus.getFocusedResponderId()).toBe(descendant.id);

    await fixture.manager.open(modal.id);
    await fixture.manager.requestClose(modal.id, { reason: "command" });
    expect(fixture.focus.getFocusedResponderId()).toBe(descendant.id);
    descendant.dispose();
  });

  it("exposes the application modal domain from the same manager snapshot", async () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    const standard = fixture.manager.create(standardWindow("application-stage-window"));
    const modal = fixture.manager.create(modalWindow("application-stage-modal"));
    await fixture.manager.open(standard.id);
    await fixture.manager.open(modal.id);

    expect(Reflect.get(fixture.manager.snapshot(), "blockedApplicationIds")).toEqual([
      "com.syndromatic.Notes",
    ]);
  });

  it("derives application blocking from the blocked window owner, not a cross-owner modal", async () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    const root = fixture.manager.create(standardWindow("blocked-owner-root", {
      applicationId: "com.example.owner-a",
      applicationSessionId: "session-owner-a",
    }));
    const modal = fixture.manager.create(modalWindow("cross-owner-modal", root.id, {
      applicationId: "com.example.owner-b",
      applicationSessionId: "session-owner-b",
    }));
    await fixture.manager.open(root.id);
    await fixture.manager.open(modal.id);

    expect(fixture.manager.snapshot().blockedWindowControllerIds).toContain(root.id);
    expect(fixture.manager.snapshot().blockedApplicationIds).toEqual(["com.example.owner-a"]);
  });

  it("exposes parentless system-modal application-stage blocking even without an application window", async () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    const modal = fixture.manager.create(modalWindow("system-modal", null, {
      applicationId: null,
      applicationSessionId: null,
    }));
    await fixture.manager.open(modal.id);

    expect(Reflect.get(fixture.manager.snapshot(), "applicationStageBlocked")).toBe(true);
  });
});
