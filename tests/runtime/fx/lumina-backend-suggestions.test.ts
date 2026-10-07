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
import { LUFXIndex } from "../../../src/FX/LuminaFX/LUFXIndex";
import type { LUFXIndexBackend, LUFXIndexBackendSnapshot } from "../../../src/FX/LuminaFX/LUFXIndexBackend";
import { LUFXQueryPlanner } from "../../../src/FX/LuminaFX/LUFXQueryPlanner";
import { LUFXSearchableItem } from "../../../src/FX/LuminaFX/LUFXSearchableItem";
import type { LuminaWorkerRequest, LuminaWorkerResponse } from "../../../src/SynCloudOS/LuminaFX/luminaWorkerProtocol";
import { LuminaWorkerConnection } from "../../../src/SynCloudOS/PlatformAdapters/LuminaWorkerConnection";
import { WorkerLuminaIndexBackend } from "../../../src/SynCloudOS/PlatformAdapters/WorkerLuminaIndexBackend";

function item(id: string, title: string) {
  return new LUFXSearchableItem({
    id, domain: "notes", contentType: "note", title,
    activation: { kind: "named-route", version: 1, routeName: "note", parameters: { id } },
    revision: "r1",
  });
}

const items = [item("a", "Resume draft"), item("b", "Research notes"), item("c", "Recipe book"), item("d", "Resume final")];
const snapshot: LUFXIndexBackendSnapshot = Object.freeze({
  state: "ready", schemaVersion: 1, checkpoint: Object.freeze({ generation: 1, revision: 4 }),
  items: Object.freeze(items.map((value) => value.toJSON())),
});

class FakeWorker {
  readonly posts: LuminaWorkerRequest[] = [];
  readonly #message = new Set<(event: MessageEvent<LuminaWorkerResponse>) => void>();
  readonly #error = new Set<(event: ErrorEvent) => void>();
  terminated = 0;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type === "message") this.#message.add(listener as never);
    if (type === "error") this.#error.add(listener as never);
  }
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type === "message") this.#message.delete(listener as never);
    if (type === "error") this.#error.delete(listener as never);
  }
  postMessage(message: LuminaWorkerRequest) { this.posts.push(message); }
  terminate() { this.terminated += 1; }
  respond(response: LuminaWorkerResponse) { for (const listener of [...this.#message]) listener({ data: response } as MessageEvent<LuminaWorkerResponse>); }
  defaultPrevented = 0;
  fail() {
    const event = { message: "crashed", error: new Error("crashed"), preventDefault: () => { this.defaultPrevented += 1; } } as unknown as ErrorEvent;
    for (const listener of [...this.#error]) listener(event);
  }
  get listenerCount() { return this.#message.size; }
}

describe("Lumina backend suggestions", () => {
  it("delegates suggestions to a capable backend without a snapshot round trip", async () => {
    const snapshotRead = vi.fn(async () => snapshot);
    const planner = new LUFXQueryPlanner();
    const backend: LUFXIndexBackend & { suggest: unknown } = {
      mutate: vi.fn(),
      snapshot: snapshotRead,
      dispose: vi.fn(),
      suggest: vi.fn(async (query, options) => planner.suggest({ ...snapshot, items: items }, query, options)),
    };
    const index = new LUFXIndex(backend);
    const delegated = await index.suggest({ text: "resume", locale: "en" }, { limit: 3 });
    expect(snapshotRead).not.toHaveBeenCalled();
    expect(backend.suggest).toHaveBeenCalledWith(expect.objectContaining({ text: "resume", locale: "en" }), expect.objectContaining({ limit: 3, maximumBytes: 4096 }));

    const local = await new LUFXIndex({ mutate: vi.fn(), snapshot: async () => snapshot, dispose: vi.fn() }).suggest({ text: "resume", locale: "en" }, { limit: 3 });
    expect(delegated).toEqual(local);
    expect(local.suggestions.length).toBeGreaterThan(0);
  });

  it("validates suggestion bounds before reaching the backend", async () => {
    const suggest = vi.fn();
    const index = new LUFXIndex({ mutate: vi.fn(), snapshot: vi.fn(), dispose: vi.fn(), suggest } as never);
    await expect(index.suggest({ text: "a", locale: "en" }, { limit: 0 })).rejects.toBeInstanceOf(RangeError);
    await expect(index.suggest({ text: "a", locale: "en" }, { maximumBytes: 1 << 20 })).rejects.toBeInstanceOf(RangeError);
    expect(suggest).not.toHaveBeenCalled();
  });

  it("asks the worker for a bounded suggestion list and cancels with the caller", async () => {
    const worker = new FakeWorker();
    const backend = new WorkerLuminaIndexBackend(worker as unknown as Worker, "lumina", "owner");
    const pending = backend.suggest({ text: "res", locale: "en" }, { limit: 5, maximumBytes: 1024 });
    expect(worker.posts[0]).toMatchObject({ operation: "suggest", databaseName: "lumina", ownerKey: "owner", query: { text: "res" }, limit: 5, maximumBytes: 1024 });
    worker.respond({ id: worker.posts[0]!.id, ok: true, value: { suggestions: ["Resume draft", "Research notes"] } });
    await expect(pending).resolves.toEqual({ suggestions: ["Resume draft", "Research notes"] });

    const controller = new AbortController();
    const cancelled = backend.suggest({ text: "re", locale: "en" }, { limit: 5, maximumBytes: 1024, signal: controller.signal });
    const request = worker.posts.at(-1)!;
    controller.abort(new DOMException("typing", "AbortError"));
    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.posts.at(-1)).toEqual({ id: request.id, operation: "cancel" });
    backend.dispose();
  });
});

describe("shared Lumina worker connection", () => {
  function connection() {
    const workers: FakeWorker[] = [];
    const timers: Array<() => void> = [];
    const value = new LuminaWorkerConnection({
      createWorker: () => { const worker = new FakeWorker(); workers.push(worker); return worker as unknown as Worker; },
      idleMilliseconds: 1000,
      setTimeout: (callback) => { timers.push(callback); return timers.length; },
      clearTimeout: () => undefined,
    });
    return { value, workers, timers };
  }

  it("serves several owner sessions from one worker with distinct request IDs", async () => {
    const { value, workers } = connection();
    const first = new WorkerLuminaIndexBackend(value.channel("lumina", "one"), "lumina", "one");
    const second = new WorkerLuminaIndexBackend(value.channel("lumina", "two"), "lumina", "two");
    const a = first.snapshot();
    const b = second.snapshot();
    expect(workers).toHaveLength(1);
    const [requestA, requestB] = workers[0]!.posts;
    expect(requestA!.id).not.toBe(requestB!.id);
    workers[0]!.respond({ id: requestB!.id, ok: true, value: snapshot });
    workers[0]!.respond({ id: requestA!.id, ok: true, value: { ...snapshot, checkpoint: { generation: 9, revision: 9 } } });
    await expect(a).resolves.toMatchObject({ checkpoint: { generation: 9 } });
    await expect(b).resolves.toMatchObject({ checkpoint: { generation: 1 } });
    first.dispose();
    second.dispose();
  });

  it("releases an owner only when its last session closes and retires the worker when idle", () => {
    const { value, workers, timers } = connection();
    const first = new WorkerLuminaIndexBackend(value.channel("lumina", "shared"), "lumina", "shared");
    const second = new WorkerLuminaIndexBackend(value.channel("lumina", "shared"), "lumina", "shared");
    first.dispose();
    expect(workers[0]!.posts.filter((post) => post.operation === "dispose-owner")).toHaveLength(0);
    second.dispose();
    expect(workers[0]!.posts.filter((post) => post.operation === "dispose-owner")).toHaveLength(1);
    expect(workers[0]!.terminated).toBe(0);
    expect(workers[0]!.listenerCount).toBe(0);

    const reused = new WorkerLuminaIndexBackend(value.channel("lumina", "later"), "lumina", "later");
    expect(workers).toHaveLength(1);
    reused.dispose();
    for (const timer of timers.splice(0)) timer();
    expect(workers[0]!.terminated).toBe(1);
    expect(value.workerStarted).toBe(false);
  });

  it("never hands a failed worker to new sessions", async () => {
    const { value, workers } = connection();
    const doomed = new WorkerLuminaIndexBackend(value.channel("lumina", "owner"), "lumina", "owner");
    const pending = doomed.snapshot();
    workers[0]!.fail();
    await expect(pending).rejects.toThrow("crashed");
    const replacement = new WorkerLuminaIndexBackend(value.channel("lumina", "owner"), "lumina", "owner");
    expect(workers).toHaveLength(2);
    doomed.dispose();
    expect(workers[0]!.terminated).toBe(1);
    replacement.dispose();
    value.dispose();
    expect(workers[1]!.terminated).toBe(1);
  });

  it("fails later requests of every session still open on a failed worker instead of leaving them unanswered", async () => {
    const { value, workers } = connection();
    const first = new WorkerLuminaIndexBackend(value.channel("lumina", "one"), "lumina", "one");
    const second = new WorkerLuminaIndexBackend(value.channel("lumina", "two"), "lumina", "two");
    workers[0]!.fail();
    // The failure is reported through scoped operations, not the global
    // error path, and the shared worker is terminated at once.
    expect(workers[0]!.defaultPrevented).toBeGreaterThan(0);
    expect(workers[0]!.terminated).toBe(1);
    const postsAtFailure = workers[0]!.posts.length;
    const unanswered = new Promise((resolve) => setTimeout(() => resolve("unanswered"), 50));
    for (const backend of [first, second]) {
      await expect(Promise.race([backend.snapshot(), unanswered])).rejects.toThrow("crashed");
    }
    expect(workers[0]!.posts).toHaveLength(postsAtFailure);
    first.dispose();
    second.dispose();
    expect(workers[0]!.terminated).toBe(1);
    value.dispose();
  });
});
