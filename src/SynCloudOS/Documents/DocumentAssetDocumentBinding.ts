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

import type { ApplicationDocument } from "./ApplicationDocument";
import type { DocumentEditResourceRetention } from "./documentEditTypes";
import type { DocumentResourceChange, DocumentResourceLifecycle } from "./documentResourceLifecycle";
import type { DocumentAssetReference, DocumentAssetRetentionRoot, DocumentAssetScope, DocumentAssetStore } from "./documentAssetTypes";
import { createDocumentAssetManifest, encodeDocumentAssetManifest } from "./documentAssetManifest";
import { assertDocumentAssetNotAborted, awaitDocumentAsset, DocumentAssetError } from "./documentAssetErrors";
import { canonicalDocumentJson } from "./documentTypes";

export interface DocumentAssetPreparedEdit<T> {
  readonly expectedRevision: number;
  retainResources(before: Readonly<T>, after: Readonly<T>): DocumentEditResourceRetention;
  /** Abandon unused preflight; history owns an admitted handle until eviction. */
  release(): Promise<void>;
}
export interface DocumentAssetDocumentBinding extends DocumentResourceLifecycle {
  prepare<T>(before: Readonly<T>, after: Readonly<T>, signal?: AbortSignal): Promise<DocumentAssetPreparedEdit<T>>;
  flush(): Promise<void>;
  close(): Promise<void>;
}

/** Each preflight reserves exact committed sets plus a separate history union. */
export async function createDocumentAssetDocumentBinding(options: {
  readonly document: ApplicationDocument<unknown, unknown>;
  readonly store: DocumentAssetStore;
  readonly scope: DocumentAssetScope;
  readonly enumerateModelReferences: (model: unknown) => readonly DocumentAssetReference[];
  readonly randomUUID: () => string;
  readonly signal?: AbortSignal;
  readonly observeError?: (error: unknown) => void;
}): Promise<DocumentAssetDocumentBinding> {
  const { document, store, scope } = options;
  const isDocumentClosed = () => document.state === "closed";
  const lifetime = new AbortController();
  type Candidate = { key: string; root: DocumentAssetRetentionRoot | null; token?: string; holds: number; ready: Promise<void>; complete: boolean; acquisition: AbortController };
  const candidates = new Map<string, Candidate>();
  const pending = new Set<Promise<void>>();
  const historyReleases = new Set<() => void>();
  const preparedAdmissions = new Set<{ beforeKey: string; afterKey: string; beforeIdentity: string; afterIdentity: string; revision: number; admit: (before: unknown, after: unknown) => DocumentEditResourceRetention }>();
  let closed = false;
  let activeRetention: { beforeKey: string; afterKey: string; handle: DocumentEditResourceRetention } | undefined;
  let stagedChange = false;
  const manifest = (model: unknown) => createDocumentAssetManifest(scope, options.enumerateModelReferences(model));
  const schedule = (operation: () => Promise<void>) => {
    const task = operation().catch(error => { try { options.observeError?.(error); } catch { /* cleanup diagnostics cannot revoke canonical history */ } });
    pending.add(task); void task.finally(() => pending.delete(task));
  };
  const drop = (entry: Candidate) => {
    entry.holds -= 1;
    if (entry.holds !== 0) return;
    entry.acquisition.abort();
    if (candidates.get(entry.key) === entry) candidates.delete(entry.key);
    schedule(async () => { await entry.ready.catch(() => undefined); if (entry.root && entry.token) await store.release(entry.root, undefined, entry.token); });
  };
  const acquire = async (model: unknown, signal?: AbortSignal): Promise<Candidate> => {
    assertDocumentAssetNotAborted(signal);
    const required = manifest(model), key = encodeDocumentAssetManifest(required);
    let entry = candidates.get(key);
    if (!entry) {
      const root: DocumentAssetRetentionRoot | null = required.assets.length ? { scope, kind: "committed", id: `binding:${options.randomUUID()}` } : null;
      entry = { key, root, holds: 0, ready: Promise.resolve(), complete: false, acquisition: new AbortController() };
      const created = entry;
      // A shared pin belongs to all waiters. One caller may abandon its hold,
      // while binding shutdown or the last waiter cancels backing acquisition.
      const sharedSignal = AbortSignal.any([created.acquisition.signal, lifetime.signal, ...(options.signal ? [options.signal] : [])]);
      created.ready = (root ? store.retain(root, required.assets, sharedSignal).then(token => { created.token = token; }) : Promise.resolve()).then(() => { created.complete = true; });
      candidates.set(key, created);
    }
    entry.holds += 1;
    try { await awaitDocumentAsset(entry.ready, signal); return entry; }
    catch (error) { drop(entry); throw error; }
  };
  let current = await acquire(document.model, options.signal);
  if (encodeDocumentAssetManifest(manifest(document.model)) !== current.key) {
    drop(current); throw new DocumentAssetError("asset-conflict", "The document changed during initial asset admission.");
  }
  const unsubscribe = document.subscribe(() => {
    if (closed || document.state === "closed") return;
    try {
      const key = encodeDocumentAssetManifest(manifest(document.model));
      if (key === current.key) return;
      const next = candidates.get(key);
      if (!next?.complete) throw new DocumentAssetError("asset-missing", "Asset-bearing model changes require prepared resource admission before publication.");
      next.holds += 1;
      const previous = current; current = next; drop(previous);
    } catch (error) { try { options.observeError?.(error); } catch { /* diagnostics only */ } }
  });
  const flush = async () => { while (pending.size) await Promise.all([...pending]); };
  const matchingPreparation = (before: unknown, after: unknown, beforeKey: string, afterKey: string) => {
    const relevant = [...preparedAdmissions].filter(value => value.revision === document.dirtyRevision && value.beforeKey === beforeKey && value.afterKey === afterKey);
    const beforeIdentity = canonicalDocumentJson(before), afterIdentity = canonicalDocumentJson(after);
    const exact = relevant.find(value => value.beforeIdentity === beforeIdentity && value.afterIdentity === afterIdentity);
    if (relevant.length && !exact) throw new DocumentAssetError("asset-invalid", "The native candidate differs from the prepared model.");
    return exact;
  };
  const retainHistory = (before: unknown, after: unknown): DocumentEditResourceRetention => {
    const beforeKey = encodeDocumentAssetManifest(manifest(before));
    const afterKey = encodeDocumentAssetManifest(manifest(after));
    const prepared = matchingPreparation(before, after, beforeKey, afterKey);
    if (prepared) return prepared.admit(before, after);
    const first = candidates.get(beforeKey), last = candidates.get(afterKey);
    if (!first?.complete || !last?.complete) throw new DocumentAssetError("asset-missing", "Asset history requires completed resource admission before publication.");
    first.holds += 1; last.holds += 1;
    let released = false;
    const release = () => { if (!released) { released = true; historyReleases.delete(release); drop(first); drop(last); } };
    historyReleases.add(release);
    return Object.freeze({ resourceIds: Object.freeze(createDocumentAssetManifest(scope, [...manifest(before).assets, ...manifest(after).assets]).assets.map(reference => reference.assetId)), release });
  };
  const binding: DocumentAssetDocumentBinding = {
    async prepareModel(next, signal) { const prepared = await binding.prepare<unknown>(document.model as Readonly<unknown>, next, signal); return { release: prepared.release }; },
    stageChange(before, after, changeOptions): DocumentResourceChange {
      assertDocumentAssetNotAborted(options.signal);
      if (closed || isDocumentClosed()) throw new DocumentAssetError("asset-aborted", "The document asset binding is closed.");
      if (stagedChange) throw new DocumentAssetError("asset-conflict", "Asset publication cannot reenter a staged model change.");
      const beforeKey = before === null ? current.key : encodeDocumentAssetManifest(manifest(before));
      const afterKey = encodeDocumentAssetManifest(manifest(after));
      if (current.key !== beforeKey) throw new DocumentAssetError("asset-conflict", "The current asset owner does not match the canonical model.");
      matchingPreparation(before ?? document.model, after, beforeKey, afterKey);
      const next = candidates.get(afterKey);
      if (!next?.complete) throw new DocumentAssetError("asset-missing", "Asset changes require completed resource admission before publication.");
      const historyRetention = changeOptions.recordHistory ? retainHistory(before ?? document.model, after) : undefined;
      if (historyRetention) activeRetention = { beforeKey, afterKey, handle: historyRetention };
      next.holds += 1;
      const previous = current;
      stagedChange = true;
      let committed = false, finalized = false;
      const finish = () => { stagedChange = false; activeRetention = undefined; };
      return {
        ...(historyRetention ? { historyRetention } : {}),
        commit() {
          if (committed || finalized) return;
          committed = true;
          current = next;
        },
        rollback() {
          if (finalized) return;
          finalized = true;
          if (committed) current = previous;
          drop(next); historyRetention?.release(); finish();
        },
        release() {
          if (finalized) return;
          finalized = true;
          if (committed) drop(previous); else { drop(next); historyRetention?.release(); }
          finish();
        },
      };
    },
    async prepare<T>(before: Readonly<T>, after: Readonly<T>, signal?: AbortSignal) {
      const merged = AbortSignal.any([lifetime.signal, ...(options.signal ? [options.signal] : []), ...(signal ? [signal] : [])]);
      assertDocumentAssetNotAborted(merged);
      if (closed || document.state === "closed") throw new DocumentAssetError("asset-aborted", "The document asset binding is closed.");
      const expectedRevision = document.dirtyRevision;
      const beforeIdentity = canonicalDocumentJson(before), afterIdentity = canonicalDocumentJson(after);
      const beforeManifest = manifest(before), afterManifest = manifest(after);
      if (canonicalDocumentJson(document.model) !== beforeIdentity) throw new DocumentAssetError("asset-conflict", "The prepared asset base is stale.");
      const beforeCandidate = await acquire(before, merged);
      let afterCandidate: Candidate | undefined;
      let historyToken: string | undefined;
      const union = createDocumentAssetManifest(scope, [...beforeManifest.assets, ...afterManifest.assets]);
      const historyRoot: DocumentAssetRetentionRoot | null = union.assets.length ? { scope, kind: "history", id: `edit:${options.randomUUID()}` } : null;
      try {
        afterCandidate = await acquire(after, merged);
        if (historyRoot) historyToken = await store.retain(historyRoot, union.assets, merged);
        assertDocumentAssetNotAborted(merged);
        if (closed || isDocumentClosed() || document.dirtyRevision !== expectedRevision) throw new DocumentAssetError("asset-conflict", "The document changed while asset admission was prepared.");
      } catch (error) {
        drop(beforeCandidate); if (afterCandidate) drop(afterCandidate);
        if (historyRoot && historyToken) schedule(async () => { await store.release(historyRoot, undefined, historyToken); });
        throw error;
      }
      const nextCandidate = afterCandidate;
      let admitted = false, released = false;
      let admittedHandle: DocumentEditResourceRetention | undefined;
      const release = () => {
        if (released) return;
        released = true; historyReleases.delete(release); preparedAdmissions.delete(admission);
        drop(beforeCandidate); drop(nextCandidate);
        if (historyRoot && historyToken) schedule(async () => { await store.release(historyRoot, undefined, historyToken); });
      };
      historyReleases.add(release);
      const preparedEdit = Object.freeze({ expectedRevision,
        retainResources(actualBefore: Readonly<T>, actualAfter: Readonly<T>): DocumentEditResourceRetention {
          assertDocumentAssetNotAborted(merged);
          if (released || closed || document.state === "closed" || document.dirtyRevision !== expectedRevision) throw new DocumentAssetError("asset-conflict", "Prepared asset admission is stale or consumed.");
          if (canonicalDocumentJson(actualBefore) !== beforeIdentity || canonicalDocumentJson(actualAfter) !== afterIdentity ||
              encodeDocumentAssetManifest(manifest(actualBefore)) !== encodeDocumentAssetManifest(beforeManifest) || encodeDocumentAssetManifest(manifest(actualAfter)) !== encodeDocumentAssetManifest(afterManifest)) {
            throw new DocumentAssetError("asset-invalid", "The admitted native model differs from the prepared candidate.");
          }
          if (admitted) {
            if (activeRetention?.handle === admittedHandle) return admittedHandle!;
            throw new DocumentAssetError("asset-conflict", "Prepared asset admission was already consumed.");
          }
          admitted = true;
          preparedAdmissions.delete(admission);
          admittedHandle = Object.freeze({ resourceIds: Object.freeze(union.assets.map(reference => reference.assetId)), release });
          return admittedHandle;
        },
        async release() { if (!admitted) release(); await flush(); },
      });
      const admission = { beforeKey: encodeDocumentAssetManifest(beforeManifest), afterKey: encodeDocumentAssetManifest(afterManifest), beforeIdentity, afterIdentity, revision: expectedRevision,
        admit: (actualBefore: unknown, actualAfter: unknown) => preparedEdit.retainResources(actualBefore as Readonly<T>, actualAfter as Readonly<T>) };
      preparedAdmissions.add(admission);
      return preparedEdit;
    },
    flush,
    async dispose() { await binding.close(); },
    async close() {
      if (!closed) { closed = true; lifetime.abort(); unsubscribe(); for (const release of [...historyReleases]) release(); drop(current); }
      await flush();
    },
  };
  return Object.freeze(binding);
}
