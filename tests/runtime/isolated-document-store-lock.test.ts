// @vitest-environment node
import { expect, it, vi } from "vitest";
import { createIsolatedDocumentStoreLock } from "../../src/SynCloudOS/AppSDK/testing/isolatedDocumentStoreLock";
import { createTestRuntime, createTestRuntimeEnvironment } from "./helpers";

const exclusive = { mode: "exclusive" } as const;

it("releases a rejected callback before admitting the next writer", async () => {
  const lock = createIsolatedDocumentStoreLock();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const events: string[] = [];
  const first = lock.request("store", exclusive, async () => { events.push("first"); await gate; throw new Error("Write rejected"); });
  const rejected = expect(first).rejects.toThrow("Write rejected");
  const next = lock.request("store", exclusive, () => { events.push("next"); return "saved"; });
  await Promise.resolve();
  expect(events).toEqual(["first"]);
  release();
  await rejected;
  await expect(next).resolves.toBe("saved");
  expect(events).toEqual(["first", "next"]);
});

it("rejects an aborted waiter immediately without executing it or admitting a later writer early", async () => {
  const lock = createIsolatedDocumentStoreLock();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const first = lock.request("store", exclusive, () => gate);
  await Promise.resolve();
  const controller = new AbortController();
  const cancelled = vi.fn();
  const waiting = lock.request("store", { ...exclusive, signal: controller.signal }, cancelled);
  const rejection = expect(waiting).rejects.toMatchObject({ name: "AbortError" });
  const nextCallback = vi.fn(() => "saved");
  const next = lock.request("store", exclusive, nextCallback);
  controller.abort();
  await rejection;
  expect(cancelled).not.toHaveBeenCalled();
  expect(nextCallback).not.toHaveBeenCalled();
  release();
  await first;
  await expect(next).resolves.toBe("saved");
  expect(cancelled).not.toHaveBeenCalled();
});

it("keeps an acquired lock until its running callback settles even after caller abort", async () => {
  const lock = createIsolatedDocumentStoreLock();
  const controller = new AbortController();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const first = lock.request("store", { ...exclusive, signal: controller.signal }, () => gate);
  await Promise.resolve();
  const callback = vi.fn(() => "next");
  const next = lock.request("store", exclusive, callback);
  controller.abort();
  await Promise.resolve();
  expect(callback).not.toHaveBeenCalled();
  release();
  await first;
  await expect(next).resolves.toBe("next");
});

it("does not serialise unrelated backing stores", async () => {
  const lock = createIsolatedDocumentStoreLock();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const first = lock.request("first-store", exclusive, () => gate);
  await expect(lock.request("second-store", exclusive, () => "independent")).resolves.toBe("independent");
  release();
  await first;
});

it("keeps conditional runtime writes unavailable without an injected or native lock", async () => {
  const kind = {
    kind: "tests.atomic-backstop",
    version: 1,
    displayName: "Atomic backstop",
    permissions: { getDraft: { public: true }, saveDraft: { public: true } },
  };
  const environment = createTestRuntimeEnvironment();
  const runtime = createTestRuntime({
    trustedDocumentKinds: [kind],
    environment: { ...environment, browser: { ...environment.browser, getNavigator: () => null } },
  });
  try {
    const original = await runtime.documentStore.saveDraft({ id: "backstop", kind: kind.kind, body: { text: "Original" } });
    await expect(runtime.documentStore.saveDraft({
      id: original.id, kind: kind.kind, body: { text: "Unchecked overwrite" },
    }, undefined, { ifMatch: original.storageVersion!.etag })).rejects.toMatchObject({
      code: "document-store-atomicity-unavailable",
    });
    expect((await runtime.documentStore.getDraft(original.id))!.body).toEqual({ text: "Original" });
  } finally {
    await runtime.dispose();
  }
});
