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
import { InMemoryDocumentAdapter } from "../../src/SynCloudOS/Documents/Adapters/InMemoryDocumentAdapter";
import type { DocumentSynchronisationEvent, DocumentWatchEvent } from "../../src/SynCloudOS/Documents/Adapters/documentAdapterTypes";
import { createInMemoryDocumentAssetStore } from "../../src/SynCloudOS/Documents/DocumentAssetStore";
import { createDocumentAssetStorageAdapter } from "../../src/SynCloudOS/Documents/DocumentAssetSaveCoordinator";
import type { DocumentAssetReference } from "../../src/SynCloudOS/Documents/documentAssetTypes";
import { createVerifiedDocumentAssetObservation } from "../../src/SynCloudOS/Documents/DocumentAssetObservation";
const scope = { authorizationId: "app:a", documentId: "doc:a" };
const location = { kind: "memory" as const, namespace: "observations", key: "a" };
const enumerateReferences = (value: unknown) => (value as { assets: DocumentAssetReference[] }).assets;

describe("native asset observation admission", () => {
  it("keeps verification ordered and revokes queued and late callbacks on exact subscription disposal", async () => {
    const base = new InMemoryDocumentAdapter({ now: () => 1000, randomUUID: () => crypto.randomUUID() });
    const record = await base.write({ location, typeId: "app.native", schemaVersion: 1, content: { assets: [] }, expectedVersion: null, idempotencyKey: "record" });
    let incoming!: (event: { order: number; record: typeof record }) => void;
    const finishes: (() => void)[] = [], signals: AbortSignal[] = [];
    const dispose = vi.fn(), listener = vi.fn();
    const verify = vi.fn((_record: unknown, signal: AbortSignal) => { signals.push(signal); return new Promise<void>(resolve => { finishes.push(resolve); }); });
    const lease = createVerifiedDocumentAssetObservation({ subscribe: callback => { incoming = callback; return { dispose }; }, listener,
      record: event => event.record, verifyAndRetain: verify });
    incoming({ order: 1, record }); incoming({ order: 2, record });
    await vi.waitFor(() => expect(verify).toHaveBeenCalledTimes(1));
    expect(listener).not.toHaveBeenCalled();
    finishes[0]();
    await vi.waitFor(() => expect(verify).toHaveBeenCalledTimes(2));
    expect(listener.mock.calls.map(([event]) => event.order)).toEqual([1]);
    finishes[1](); await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));
    expect(listener.mock.calls.map(([event]) => event.order)).toEqual([1, 2]);
    incoming({ order: 3, record }); incoming({ order: 4, record });
    await vi.waitFor(() => expect(verify).toHaveBeenCalledTimes(3));
    lease.dispose(); lease.dispose(); finishes[2](); incoming({ order: 5, record });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(dispose).toHaveBeenCalledOnce();
    expect(signals.every(signal => signal.aborted)).toBe(true);
    expect(verify).toHaveBeenCalledTimes(3); expect(listener).toHaveBeenCalledTimes(2);
  });
  it("verifies watched and remote candidate records before exposing them and pins actual versions", async () => {
    const store = createInMemoryDocumentAssetStore();
    const base = new InMemoryDocumentAdapter({ now: () => 1000, randomUUID: () => crypto.randomUUID() });
    let watch!: (event: DocumentWatchEvent) => void, remote!: (event: DocumentSynchronisationEvent) => void;
    const adapter = new Proxy(base, { get(target, property) {
      if (property === "watch") return (_location: unknown, listener: typeof watch) => { watch = listener; return { dispose() {} }; };
      if (property === "subscribeSynchronisation") return (_location: unknown, listener: typeof remote) => { remote = listener; return { dispose() {} }; };
      const value = Reflect.get(target, property, target); return typeof value === "function" ? value.bind(target) : value;
    } });
    const errors = vi.fn();
    const wrapper = createDocumentAssetStorageAdapter({ adapter, store, scopeForLocation: () => scope, enumerateReferences, observeError: errors });
    const ref = await store.put(scope, { bytes: new Uint8Array([1]), mimeType: "image/png" });
    const valid = await wrapper.write({ location, typeId: "app.native", schemaVersion: 1, content: { assets: [ref] }, expectedVersion: null, idempotencyKey: "valid" });
    for (const { root } of await store.listRetentionRoots(scope)) await store.release(root);
    const watched = vi.fn(), synchronized = vi.fn();
    const watchLease = wrapper.watch!(location, watched), remoteLease = wrapper.subscribeSynchronisation!(location, synchronized);
    const corrupt = { ...valid, metadata: {} };
    watch({ kind: "written", record: corrupt });
    remote({ kind: "conflicted", location, expectedVersion: valid.version, currentRecord: corrupt });
    await vi.waitFor(() => expect(errors).toHaveBeenCalledTimes(2));
    expect(watched).not.toHaveBeenCalled(); expect(synchronized).not.toHaveBeenCalled();
    watch({ kind: "written", record: valid });
    remote({ kind: "acknowledged", record: valid });
    await vi.waitFor(() => { expect(watched).toHaveBeenCalledOnce(); expect(synchronized).toHaveBeenCalledOnce(); });
    expect(await store.collectGarbage(scope)).toEqual({ removedAssets: 0, removedBytes: 0 });
    expect((await store.listRetentionRoots(scope)).filter(value => value.root.kind === "version")).toHaveLength(1);
    watchLease.dispose(); remoteLease.dispose();
  });
});
