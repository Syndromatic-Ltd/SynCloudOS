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

import { describe, expect, it, vi } from "vitest";
import { authoriseTestRuntime, createTestBundle, createTestRuntime as createRuntime, createTestRuntimeEnvironment } from "./helpers";
import { Pasteboard } from "../../src/SynCloudOS/Pasteboard";
import type { PasteboardAdapter, PasteboardRepresentationInput } from "../../src/SynCloudOS/Pasteboard";
import type { SynCloudOSRuntimeEnvironment } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";

function environmentWithClipboard(clipboard: PasteboardAdapter): SynCloudOSRuntimeEnvironment {
  return { ...createTestRuntimeEnvironment(), clipboard };
}

function createTestRuntime(options: Parameters<typeof createRuntime>[0] = {}) {
  const runtime = authoriseTestRuntime(createRuntime(options));
  runtime.store.mutate((draft) => { draft.loginServices.accessClass = "team"; });
  return runtime;
}

function galleryPasteboards(runtime: ReturnType<typeof createRuntime>) {
  const responderId = "application:gallery";
  if (!runtime.responders.get(responderId)) {
    runtime.responders.register({ id: responderId, kind: "application", parentId: "workspace", scopeId: responderId });
  }
  return runtime.transfers.mountApp(runtime.apps.getApp("gallery")!, { responderId }).scope.pasteboards;
}

describe("runtime pasteboards", () => {
  it("exposes the planned standalone Pasteboard constructor", async () => {
    const pasteboard = new Pasteboard("system");
    await pasteboard.write([
      { type: "text/plain", value: "standalone" },
    ]);
    await expect(pasteboard.readFirst(["text/plain"])).resolves.toEqual({
      type: "text/plain",
      value: "standalone",
    });
    pasteboard.dispose();
  });

  it("owns the canonical named boards on each isolated runtime", () => {
    const first = createTestRuntime({ id: "runtime:pasteboard:first" });
    const second = createTestRuntime({ id: "runtime:pasteboard:second" });

    expect(first.pasteboards).toBeDefined();
    expect(first.pasteboards).not.toBe(second.pasteboards);
    expect(first.pasteboards.named("find")).toBe(
      first.pasteboards.named("find"),
    );
  });

  it("returns the first preferred representation from a frozen local snapshot", async () => {
    const runtime = createTestRuntime({ id: "runtime:pasteboard:preference" });
    const pasteboard = runtime.pasteboards.named("find");
    const values = [
      { type: "text/plain", value: "SynCloudOS" },
      { type: "text/html", value: "<strong>SynCloudOS</strong>" },
    ];

    await pasteboard.write(values);
    values[0].value = "mutated";

    await expect(pasteboard.readFirst(["text/html", "text/plain"]))
      .resolves.toEqual({
        type: "text/html",
        value: "<strong>SynCloudOS</strong>",
      });
    const snapshot = pasteboard.snapshot();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot[0])).toBe(true);
  });

  it("rejects a read cancelled before adapter access", async () => {
    const read = vi.fn();
    const controller = new AbortController();
    controller.abort("caller cancelled");
    const runtime = createTestRuntime({
      id: "runtime:pasteboard:cancelled",
      environment: environmentWithClipboard({ read, write: vi.fn() }),
    });

    await expect(
      runtime.pasteboards.named("system").readFirst(
        ["text/plain"],
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(read).not.toHaveBeenCalled();
  });

  it("keeps the prior snapshot when the system adapter rejects a write", async () => {
    const runtime = createTestRuntime({
      id: "runtime:pasteboard:atomic-write",
      environment: environmentWithClipboard({
        read: vi.fn(async () => []),
        write: vi.fn(async () => { throw new Error("permission denied"); }),
      }),
    });
    const system = runtime.pasteboards.named("system");
    await expect(system.write([{ type: "text/plain", value: "secret" }]))
      .rejects.toThrow("permission denied");
    expect(system.snapshot()).toEqual([]);
  });

  it("does not execute hostile accessors while validating representations", async () => {
    const getter = vi.fn(() => "stolen");
    const hostile = Object.create(null);
    Object.defineProperty(hostile, "type", { enumerable: true, get: getter });
    Object.defineProperty(hostile, "value", {
      enumerable: true,
      value: "content",
    });
    const runtime = createTestRuntime({ id: "runtime:pasteboard:hostile" });

    await expect(runtime.pasteboards.named("find").write([hostile as PasteboardRepresentationInput]))
      .rejects.toMatchObject({ name: "InvalidPasteboardRepresentationError" });
    expect(getter).not.toHaveBeenCalled();
  });

  it("reuses canonical document JSON rules for custom data without key-order coupling", async () => {
    const runtime = createTestRuntime({ id: "runtime:pasteboard:canonical" });
    const pasteboard = runtime.pasteboards.find;
    const document = Object.create(null) as Record<string, string>;
    document.documentId = "document-1";
    document.typeId = "com.syncloudos.note";

    await pasteboard.write([{
      type: "application/x-syncloudos-document",
      value: document as { typeId: string; documentId: string },
    }]);

    expect(pasteboard.snapshot()).toEqual([{
      type: "application/x-syncloudos-document",
      value: { documentId: "document-1", typeId: "com.syncloudos.note" },
    }]);
    expect(Object.isFrozen(pasteboard.snapshot()[0].value)).toBe(true);
  });

  it("rejects hostile custom JSON before ownership", async () => {
    const runtime = createTestRuntime({ id: "runtime:pasteboard:hostile-json" });
    const pasteboard = runtime.pasteboards.drag;
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const sparse = new Array(2);
    sparse[1] = "present";
    const getter = vi.fn(() => "secret");
    const accessor = Object.create(null);
    Object.defineProperty(accessor, "secret", { enumerable: true, get: getter });

    for (const value of [cycle, sparse, accessor, "x".repeat(4 * 1024 * 1024 + 1)]) {
      await expect(pasteboard.write([{
        type: "application/x-syncloudos-fixture",
        value,
      } as never])).rejects.toMatchObject({ name: "InvalidPasteboardRepresentationError" });
    }
    expect(getter).not.toHaveBeenCalled();
  });

  it("aborts pending adapter work and clears only the disposed runtime", async () => {
    let settleRead!: (value: unknown[]) => void;
    const pendingRead = new Promise<unknown[]>((resolve) => { settleRead = resolve; });
    const first = createTestRuntime({
      id: "runtime:pasteboard:dispose:first",
      environment: environmentWithClipboard({
        read: vi.fn(() => pendingRead),
        write: vi.fn(async () => undefined),
      }),
    });
    const second = createTestRuntime({ id: "runtime:pasteboard:dispose:second" });
    await first.pasteboards.named("find").write([
      { type: "text/plain", value: "first" },
    ]);
    await second.pasteboards.named("find").write([
      { type: "text/plain", value: "second" },
    ]);
    const read = first.pasteboards.named("system").readFirst(["text/plain"]);

    await first.dispose("pasteboard test");
    settleRead([{ type: "text/plain", value: "late" }]);

    await expect(read).rejects.toMatchObject({ name: "AbortError" });
    expect(first.pasteboards.named("find").snapshot()).toEqual([]);
    expect(second.pasteboards.named("find").snapshot()).toEqual([
      { type: "text/plain", value: "second" },
    ]);
  });

  it("increments changeCount only for committed writes under overlap and failure", async () => {
    const writes: Array<{ resolve(): void; reject(error: Error): void }> = [];
    const runtime = createTestRuntime({
      id: "runtime:pasteboard:commit-token",
      environment: environmentWithClipboard({
        read: async () => [],
        write: () => new Promise<void>((resolve, reject) => writes.push({ resolve, reject })),
      }),
    });
    const board = runtime.pasteboards.system;
    const failed = board.write([{ type: "text/plain", value: "first" }]);
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    expect(board.changeCount).toBe(0);
    writes[0]!.reject(new Error("denied"));
    await expect(failed).rejects.toThrow("denied");
    expect(board.changeCount).toBe(0);

    const stale = board.write([{ type: "text/plain", value: "stale" }]);
    const staleResult = expect(stale).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(writes).toHaveLength(2));
    const latest = board.write([{ type: "text/plain", value: "latest" }]);
    await vi.waitFor(() => expect(writes).toHaveLength(3));
    writes[2]!.resolve();
    await latest;
    writes[1]!.resolve();
    await staleResult;
    expect(board.changeCount).toBe(1);
    expect(board.snapshot()).toEqual([{ type: "text/plain", value: "latest" }]);
  });

  it("materialises a lazy local representation once per committed token and fences stale reads", async () => {
    let settle!: (value: string) => void;
    const provide = vi.fn((_signal: AbortSignal) => new Promise<string>((resolve) => { settle = resolve; }));
    const runtime = createTestRuntime({ id: "runtime:pasteboard:lazy" });
    const board = runtime.pasteboards.find;
    await board.write([{ type: "text/plain", provide }]);
    expect(provide).not.toHaveBeenCalled();
    expect(board.changeCount).toBe(1);
    const stale = board.readFirst(["text/plain"]);
    await vi.waitFor(() => expect(provide).toHaveBeenCalledTimes(1));
    await board.write([{ type: "text/plain", value: "replacement" }]);
    settle("late");
    await expect(stale).rejects.toMatchObject({ name: "AbortError" });
    await expect(board.readFirst(["text/plain"])).resolves.toMatchObject({ value: "replacement" });
    await board.readFirst(["text/plain"]);
    expect(provide).toHaveBeenCalledTimes(1);
    expect(board.changeCount).toBe(2);
  });

  it("races callers independently without poisoning token-scoped lazy materialisation", async () => {
    let settle!: (value: string) => void;
    let providerSignal!: AbortSignal;
    const provide = vi.fn((signal: AbortSignal) => {
      providerSignal = signal;
      return new Promise<string>((resolve) => { settle = resolve; });
    });
    const runtime = createTestRuntime({ id: "runtime:pasteboard:lazy-callers" });
    const board = runtime.pasteboards.find;
    await board.write([{ type: "text/plain", provide }]);
    const firstController = new AbortController();
    const first = board.readFirst(["text/plain"], firstController.signal);
    await vi.waitFor(() => expect(providerSignal).toBeDefined());
    const firstResult = expect(first).rejects.toMatchObject({ name: "AbortError" });
    firstController.abort("first reader left");
    await firstResult;
    expect(providerSignal.aborted).toBe(false);

    const second = board.readFirst(["text/plain"]);
    settle("shared value");
    await expect(second).resolves.toEqual({ type: "text/plain", value: "shared value" });
    expect(provide).toHaveBeenCalledTimes(1);
  });

  it("rejects direct use after board disposal before any system adapter access", async () => {
    const read = vi.fn(async () => []);
    const write = vi.fn(async () => undefined);
    const runtime = createTestRuntime({
      id: "runtime:pasteboard:direct-dispose",
      environment: environmentWithClipboard({ read, write }),
    });
    const board = runtime.pasteboards.system;
    board.dispose();

    await expect(board.read(["text/plain"])).rejects.toMatchObject({ name: "AbortError" });
    await expect(board.write([{ type: "text/plain", value: "blocked" }]))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects hostile representation arrays and oversized blobs without invoking traps", async () => {
    const getter = vi.fn(() => ({ type: "text/plain", value: "stolen" }));
    const poisonedIterator = vi.fn(() => { throw new Error("iterator executed"); });
    const hostile: unknown[] = [];
    Object.defineProperty(hostile, "0", { enumerable: true, get: getter });
    Object.defineProperty(hostile, "length", { value: 1 });
    Object.defineProperty(hostile, Symbol.iterator, { value: poisonedIterator });
    const runtime = createTestRuntime({ id: "runtime:pasteboard:hostile-array" });

    await expect(runtime.pasteboards.find.write(hostile as readonly PasteboardRepresentationInput[]))
      .rejects.toMatchObject({ name: "InvalidPasteboardRepresentationError" });
    await expect(runtime.pasteboards.find.write([{
      type: "application/octet-stream",
      value: new Blob([new Uint8Array(16 * 1024 * 1024 + 1)]),
    }])).rejects.toMatchObject({ name: "InvalidPasteboardRepresentationError" });
    expect(getter).not.toHaveBeenCalled();
    expect(poisonedIterator).not.toHaveBeenCalled();
  });

  it("rejects hostile adapter result arrays without invoking index accessors", async () => {
    const getter = vi.fn(() => ({ type: "text/plain", value: "stolen" }));
    const hostile: unknown[] = [];
    Object.defineProperty(hostile, "0", { enumerable: true, get: getter });
    Object.defineProperty(hostile, "length", { value: 1 });
    const runtime = createTestRuntime({
      id: "runtime:pasteboard:hostile-adapter",
      environment: environmentWithClipboard({
        read: async () => hostile as never,
        write: async () => undefined,
      }),
    });
    await expect(runtime.pasteboards.system.read(["text/plain"]))
      .rejects.toMatchObject({ name: "InvalidPasteboardRepresentationError" });
    expect(getter).not.toHaveBeenCalled();
  });

  it("commits only the browser-written system representations after an explicit partial write", async () => {
    const browserResult = Object.freeze({
      writtenTypes: ["text/plain"],
      omittedTypes: ["application/x-syncloudos-fixture"],
      partial: true,
    });
    const write = vi.fn(async () => browserResult);
    const runtime = createTestRuntime({
      id: "runtime:pasteboard:partial-snapshot",
      environment: environmentWithClipboard({ read: async () => [], write }),
      initialBundles: [createTestBundle({ id: "gallery", route: "/gallery" })],
    });
    const system = galleryPasteboards(runtime).system;

    await expect(system.write([
      { type: "application/x-syncloudos-fixture", value: { id: "private" } },
      { type: "text/plain", value: "host copy" },
    ])).resolves.toBe(browserResult);

    expect(write).toHaveBeenCalledTimes(1);
    expect(system.changeCount).toBe(1);
    await expect(system.snapshot()).resolves.toEqual([{ type: "text/plain", value: "host copy" }]);
  });

  it.each([
    ["a missing requested type", { writtenTypes: ["text/plain"], omittedTypes: [], partial: true }],
    ["duplicate written types", { writtenTypes: ["text/plain", "text/plain"], omittedTypes: ["text/html"], partial: true }],
    ["duplicate omitted types", { writtenTypes: ["text/plain"], omittedTypes: ["text/html", "text/html"], partial: true }],
    ["an overlapping type", { writtenTypes: ["text/plain"], omittedTypes: ["text/plain", "text/html"], partial: true }],
    ["an unrequested type", { writtenTypes: ["text/plain"], omittedTypes: ["text/html", "text/uri-list"], partial: true }],
  ] as const)("rejects %s from a partial system-write result without committing", async (_label, browserResult) => {
    let result: void | typeof browserResult;
    const write = vi.fn(async () => result);
    const runtime = createTestRuntime({
      id: `runtime:pasteboard:partial-atomic:${_label}`,
      environment: environmentWithClipboard({ read: async () => [], write }),
      initialBundles: [createTestBundle({ id: "gallery", route: "/gallery" })],
    });
    const system = galleryPasteboards(runtime).system;
    await system.write([{ type: "text/plain", value: "before" }]);
    const beforeSnapshot = await system.snapshot();
    const beforeChangeCount = system.changeCount;
    result = browserResult;

    await expect(system.write([
      { type: "text/plain", value: "after plain" },
      { type: "text/html", value: "<p>after rich</p>" },
    ])).rejects.toMatchObject({ name: "PasteboardUnavailableError" });

    expect(write).toHaveBeenCalledTimes(2);
    expect(system.changeCount).toBe(beforeChangeCount);
    await expect(system.snapshot()).resolves.toEqual(beforeSnapshot);
  });


  it("routes named and system pasteboard access through PolicyKit allow/deny", async () => {
    const write = vi.fn(async () => undefined);
    const read = vi.fn(async () => [{ type: "text/plain", value: "clipboard" }]);
    const runtime = createTestRuntime({
      id: "runtime:pasteboard:policykit",
      environment: environmentWithClipboard({ read, write }),
      initialBundles: [createTestBundle({ id: "gallery", route: "/gallery" })],
    });
    const pasteboards = galleryPasteboards(runtime);
    const authorise = vi.spyOn(runtime.policy, "authorise");

    await pasteboards.find.write([{ type: "text/plain", value: "local" }]);
    await expect(pasteboards.find.readFirst(["text/plain"]))
      .resolves.toMatchObject({ value: "local" });
    await pasteboards.system.write([{ type: "text/plain", value: "shared" }]);
    await expect(pasteboards.system.readFirst(["text/plain"]))
      .resolves.toMatchObject({ type: "text/plain" });

    expect(authorise).toHaveBeenCalled();
    expect(authorise.mock.calls.some(([request]) =>
      request.action === "pasteboard.write"
      && request.requiredCapabilities?.includes("transfer.same-application")
      && request.context?.appId === "gallery"
      && request.context?.pasteboard === "find",
    )).toBe(true);
    expect(authorise.mock.calls.some(([request]) =>
      request.action === "pasteboard.read"
      && request.requiredCapabilities?.includes("transfer.cross-application")
      && request.context?.appId === "gallery"
      && request.context?.pasteboard === "system",
    )).toBe(true);

    write.mockClear();
    read.mockClear();
    runtime.policy.registerPolicy("deny-gallery", (request, decision) =>
      request.app?.id === "gallery" ? { ...decision, allowed: false, decision: "deny" } : decision,
    );
    await expect(pasteboards.find.write([{ type: "text/plain", value: "denied" }]))
      .rejects.toMatchObject({ name: "SecurityError" });
    await expect(pasteboards.find.read(["text/plain"]))
      .rejects.toMatchObject({ name: "SecurityError" });
    await expect(pasteboards.system.write([{ type: "text/plain", value: "denied" }]))
      .rejects.toMatchObject({ name: "SecurityError" });
    await expect(pasteboards.system.read(["text/plain"]))
      .rejects.toMatchObject({ name: "SecurityError" });
    expect(write).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();

    expect(runtime.policy.removePolicy("deny-gallery")).toBe(true);
    await pasteboards.find.write([{ type: "text/plain", value: "restored" }]);
    await expect(pasteboards.find.readFirst(["text/plain"]))
      .resolves.toMatchObject({ value: "restored" });
  });
});
