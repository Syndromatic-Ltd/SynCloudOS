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
import { LUFXSearchableItem } from "../../../src/FX/LuminaFX/LUFXSearchableItem";
import { LUFX_TOKENIZER_VERSION } from "../../../src/FX/LuminaFX/LUFXTokenizer";
import { LUFX_RANKER_VERSION } from "../../../src/FX/LuminaFX/LUFXRanker";
import { LUFXIndex } from "../../../src/FX/LuminaFX/LUFXIndex";
import type {
  LUFXIndexBackend,
  LUFXIndexBackendMutation,
  LUFXIndexBackendMutationResult,
  LUFXIndexBackendSnapshot,
} from "../../../src/FX/LuminaFX/LUFXIndexBackend";
import { WorkerLuminaIndexBackend } from "../../../src/SynCloudOS/PlatformAdapters/WorkerLuminaIndexBackend";
import type { LuminaWorkerRequest, LuminaWorkerResponse } from "../../../src/SynCloudOS/LuminaFX/luminaWorkerProtocol";

function item(id: string, domain = "notes", revision = "r1") {
  return new LUFXSearchableItem({
    id,
    domain,
    contentType: "note",
    title: `Title ${id}`,
    activation: { kind: "named-route", version: 1, routeName: "note", parameters: { id } },
    revision,
  });
}

class RecordingBackend implements LUFXIndexBackend {
  readonly mutations: LUFXIndexBackendMutation[] = [];
  #items = new Map<string, LUFXSearchableItem>();
  #generation = 0;
  #revision = 0;
  #disposed = false;

  async mutate(mutation: LUFXIndexBackendMutation, signal?: AbortSignal): Promise<LUFXIndexBackendMutationResult> {
    if (this.#disposed) throw new DOMException("disposed", "AbortError");
    signal?.throwIfAborted();
    this.mutations.push(mutation);
    if (mutation.kind === "upsert") this.#items.set(mutation.item.id, LUFXSearchableItem.fromJSON(mutation.item));
    else if (mutation.kind === "delete") this.#items.delete(mutation.itemId);
    else for (const [id, value] of this.#items) if (value.domain === mutation.domain) this.#items.delete(id);
    this.#generation += 1;
    this.#revision += 1;
    return Object.freeze({
      mutationId: mutation.mutationId,
      checkpoint: Object.freeze({ generation: this.#generation, revision: this.#revision }),
      replayed: false,
    });
  }

  async snapshot(signal?: AbortSignal): Promise<LUFXIndexBackendSnapshot> {
    if (this.#disposed) throw new DOMException("disposed", "AbortError");
    signal?.throwIfAborted();
    return Object.freeze({
      state: "ready",
      schemaVersion: 1,
      checkpoint: Object.freeze({ generation: this.#generation, revision: this.#revision }),
      items: Object.freeze([...this.#items.values()].map((value) => value.toJSON())),
    });
  }

  dispose(): void { this.#disposed = true; }
}

class FakeLuminaWorker {
  readonly posts: LuminaWorkerRequest[] = [];
  readonly #messageListeners = new Set<(event: MessageEvent<LuminaWorkerResponse>) => void>();
  readonly #errorListeners = new Set<(event: ErrorEvent) => void>();
  terminated = false;

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type === "message") this.#messageListeners.add(listener as (event: MessageEvent<LuminaWorkerResponse>) => void);
    if (type === "error") this.#errorListeners.add(listener as (event: ErrorEvent) => void);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type === "message") this.#messageListeners.delete(listener as (event: MessageEvent<LuminaWorkerResponse>) => void);
    if (type === "error") this.#errorListeners.delete(listener as (event: ErrorEvent) => void);
  }

  postMessage(message: LuminaWorkerRequest): void { this.posts.push(message); }
  terminate(): void { this.terminated = true; }

  respond(response: LuminaWorkerResponse): void {
    const event = { data: response } as MessageEvent<LuminaWorkerResponse>;
    for (const listener of this.#messageListeners) listener(event);
  }

  fail(error: Error): boolean {
    const event = new Event('error', { cancelable: true });
    Object.defineProperties(event, { error: { value: error }, message: { value: error.message } });
    for (const listener of this.#errorListeners) listener(event as ErrorEvent);
    return event.defaultPrevented;
  }
}

describe("LUFXIndex", () => {
  it('settles pending and subsequent operations after a worker failure', async () => {
    const worker = new FakeLuminaWorker();
    const backend = new WorkerLuminaIndexBackend(worker as unknown as Worker, 'lumina', 'owner');
    const failure = new Error('Worker script could not be loaded.');
    const pending = backend.snapshot();
    const handled = worker.fail(failure);
    await expect(pending).rejects.toBe(failure);
    expect(handled, 'A handled worker failure must not become a global page error.').toBe(true);
    const posts = worker.posts.length;
    await expect(backend.snapshot()).rejects.toBe(failure);
    await expect(backend.query({ text: 'red' })).rejects.toBe(failure);
    expect(worker.posts).toHaveLength(posts);
    expect(worker.terminated).toBe(true);
    backend.dispose();
  });
  it("projects immutable values into backend mutations and generation snapshots", async () => {
    const backend = new RecordingBackend();
    const index = new LUFXIndex(backend);

    const first = await index.upsert(item("a"), "mutation-a");
    await index.upsert(item("b", "archive"), "mutation-b");
    await index.deleteDomain("archive", "mutation-c");
    const snapshot = await index.snapshot();

    expect(first.checkpoint).toEqual({ generation: 1, revision: 1 });
    expect(snapshot.state).toBe("ready");
    expect(snapshot.items.map((value) => value.id)).toEqual(["a"]);
    expect(snapshot.items[0]).toBeInstanceOf(LUFXSearchableItem);
    expect(backend.mutations).toEqual([
      expect.objectContaining({ kind: "upsert", mutationId: "mutation-a" }),
      expect.objectContaining({ kind: "upsert", mutationId: "mutation-b" }),
      { kind: "delete-domain", mutationId: "mutation-c", domain: "archive" },
    ]);
  });

  it("validates mutation and delete identities before backend side effects", async () => {
    const backend = new RecordingBackend();
    const index = new LUFXIndex(backend);

    await expect(index.upsert(item("a"), "bad mutation id")).rejects.toThrow(/mutation/i);
    await expect(index.delete("", "delete-a")).rejects.toThrow(/item/i);
    await expect(index.deleteDomain("bad domain", "domain-a")).rejects.toThrow(/domain/i);
    expect(backend.mutations).toEqual([]);
  });

  it("revokes future operations when disposed", async () => {
    const index = new LUFXIndex(new RecordingBackend());
    index.dispose();
    await expect(index.snapshot()).rejects.toMatchObject({ name: "AbortError" });
  });

  it("waits for a mutation outcome after cancellation so a committed revision is not hidden", async () => {
    const worker = new FakeLuminaWorker();
    const backend = new WorkerLuminaIndexBackend(worker as unknown as Worker, "lumina", "owner");
    const controller = new AbortController();
    const pending = backend.mutate({ kind: "delete", mutationId: "mutation-cancel-race", itemId: "one" }, controller.signal);
    const request = worker.posts[0];
    expect(request).toMatchObject({ operation: "mutate", mutation: { mutationId: "mutation-cancel-race" } });

    controller.abort(new DOMException("caller cancelled", "AbortError"));
    expect(worker.posts[1]).toEqual({ id: request.id, operation: "cancel" });

    worker.respond({
      id: request.id,
      ok: true,
      value: { mutationId: "mutation-cancel-race", checkpoint: { generation: 7, revision: 9 }, replayed: false },
    });
    await expect(pending).resolves.toEqual({
      mutationId: "mutation-cancel-race",
      checkpoint: { generation: 7, revision: 9 },
      replayed: false,
    });
  });

  it("waits for an atomic replacement outcome after cancellation crosses the commit boundary", async () => {
    const worker = new FakeLuminaWorker();
    const backend = new WorkerLuminaIndexBackend(worker as unknown as Worker, "lumina", "owner");
    const controller = new AbortController();
    const pending = backend.replaceAll([item("replacement").toJSON()], { tokenizerVersion: LUFX_TOKENIZER_VERSION }, controller.signal);
    const request = worker.posts[0];
    expect(request).toMatchObject({ operation: "replace-all", items: [expect.objectContaining({ id: "replacement" })] });
    controller.abort(new DOMException("caller cancelled after submit", "AbortError"));
    expect(worker.posts[1]).toEqual({ id: request.id, operation: "cancel" });
    worker.respond({
      id: request.id,
      ok: true,
      value: {
        state: "ready",
        schemaVersion: 1,
        tokenizerVersion: LUFX_TOKENIZER_VERSION,
        checkpoint: { generation: 7, revision: 7 },
        itemCount: 1,
        approximateBytes: 128,
      },
    });
    await expect(pending).resolves.toMatchObject({ state: "ready", checkpoint: { generation: 7, revision: 7 } });
  });

  it("proxies maintenance through the worker and ignores stale completed replies after owner erasure", async () => {
    const worker = new FakeLuminaWorker();
    const backend = new WorkerLuminaIndexBackend(worker as unknown as Worker, "lumina", "owner");
    const replacement = backend.replaceAll(
      [item("one").toJSON()],
      { tokenizerVersion: LUFX_TOKENIZER_VERSION },
    );
    const replaceRequest = worker.posts[0];
    expect(replaceRequest).toMatchObject({
      operation: "replace-all",
      databaseName: "lumina",
      ownerKey: "owner",
      metadata: { tokenizerVersion: LUFX_TOKENIZER_VERSION },
    });
    worker.respond({
      id: replaceRequest.id,
      ok: true,
      value: {
        state: "ready",
        schemaVersion: 1,
        tokenizerVersion: LUFX_TOKENIZER_VERSION,
        checkpoint: { generation: 2, revision: 2 },
        itemCount: 1,
        approximateBytes: 128,
      },
    });
    await expect(replacement).resolves.toMatchObject({ state: "ready", itemCount: 1 });

    const erased = backend.eraseOwner();
    const eraseRequest = worker.posts[1];
    expect(eraseRequest).toMatchObject({ operation: "erase-owner", databaseName: "lumina", ownerKey: "owner" });
    worker.respond({
      id: eraseRequest.id,
      ok: true,
      value: {
        state: "erased",
        schemaVersion: 1,
        tokenizerVersion: LUFX_TOKENIZER_VERSION,
        checkpoint: { generation: 3, revision: 3 },
        itemCount: 0,
        approximateBytes: 0,
      },
    });
    await expect(erased).resolves.toMatchObject({ state: "erased", itemCount: 0 });

    worker.respond({
      id: replaceRequest.id,
      ok: true,
      value: {
        state: "ready",
        schemaVersion: 1,
        tokenizerVersion: LUFX_TOKENIZER_VERSION,
        checkpoint: { generation: 2, revision: 2 },
        itemCount: 1,
        approximateBytes: 128,
      },
    });
    const diagnostics = backend.diagnostics();
    const diagnosticsRequest = worker.posts[2];
    expect(diagnosticsRequest).toMatchObject({ operation: "diagnostics", databaseName: "lumina", ownerKey: "owner" });
    worker.respond({
      id: diagnosticsRequest.id,
      ok: true,
      value: {
        state: "erased",
        schemaVersion: 1,
        tokenizerVersion: LUFX_TOKENIZER_VERSION,
        checkpoint: { generation: 3, revision: 3 },
        itemCount: 0,
        approximateBytes: 0,
      },
    });
    await expect(diagnostics).resolves.toMatchObject({ state: "erased", itemCount: 0 });
  });

  it("executes bounded queries inside the worker instead of returning the full index snapshot", async () => {
    const worker = new FakeLuminaWorker();
    const backend = new WorkerLuminaIndexBackend(worker as unknown as Worker, "lumina", "owner");
    const pending = backend.query({ text: "resume", locale: "en", limit: 5 });
    const request = worker.posts[0];
    expect(request).toMatchObject({
      operation: "query",
      databaseName: "lumina",
      ownerKey: "owner",
      query: { text: "resume", locale: "en", limit: 5 },
    });
    worker.respond({
      id: request.id,
      ok: true,
      value: {
        checkpoint: { generation: 4, revision: 4 },
        tokenizerVersion: LUFX_TOKENIZER_VERSION,
        rankerVersion: LUFX_RANKER_VERSION,
        results: [{ item: item("one").toJSON(), score: 3, snippet: { text: "Title one", matches: [] } }],
      },
    });
    const result = await pending;
    expect(result.results[0]?.item).toBeInstanceOf(LUFXSearchableItem);
    expect(result.results[0]?.item.id).toBe("one");
  });
});
