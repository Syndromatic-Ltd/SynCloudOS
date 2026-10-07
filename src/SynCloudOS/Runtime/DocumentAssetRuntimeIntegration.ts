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

import type { DocumentController } from "../Documents/DocumentController";
import type { ApplicationDocument } from "../Documents/ApplicationDocument";
import type { DocumentAssetReference, DocumentAssetRetentionKind, DocumentAssetScope, DocumentAssetStore } from "../Documents/documentAssetTypes";
import type { DocumentAssetRetentionHandle } from "../Documents/DocumentAssetRetention";
import { createDocumentAssetRetention } from "../Documents/DocumentAssetRetention";
import { createDocumentAssetDocumentBinding, type DocumentAssetDocumentBinding, type DocumentAssetPreparedEdit } from "../Documents/DocumentAssetDocumentBinding";
import { createDocumentAssetStorageAdapter, type DocumentAssetSaveOptions } from "../Documents/DocumentAssetSaveCoordinator";
import { createDocumentAssetRecoveryStore } from "../Documents/DocumentAssetRecoveryStore";
import type { DocumentStorageAdapter } from "../Documents/Adapters/documentAdapterTypes";
import type { DocumentRecoveryStore } from "../Documents/DocumentRecoveryStore";
import type { DocumentResourceLifecycle } from "../Documents/documentResourceLifecycle";
import { assertDocumentAssetNotAborted, awaitDocumentAsset, DocumentAssetError } from "../Documents/documentAssetErrors";

export interface DocumentAssetRuntimeManifestConfiguration {
  readonly enumerateReferences: DocumentAssetSaveOptions["enumerateReferences"];
  readonly scopeForLocation: DocumentAssetSaveOptions["scopeForLocation"];
  readonly nativeDurability?: "memory" | "durable" | ((adapterId: string) => "memory" | "durable" | undefined);
  readonly hash?: DocumentAssetSaveOptions["hash"];
}
interface DocumentAssetRuntimeBackingBase {
  readonly scopeForDocument: (documentId: string) => DocumentAssetScope;
  readonly manifest?: DocumentAssetRuntimeManifestConfiguration;
}
export type DocumentAssetRuntimeBacking = DocumentAssetRuntimeBackingBase & (
  | { readonly store: DocumentAssetStore; readonly createStore?: never }
  | { readonly createStore: () => DocumentAssetStore; readonly store?: never }
);
/** Host cooperation; the SDK resource facade exposes no store or this host object. */
export interface DocumentAssetRuntimeCooperation {
  whenReady(documentId: string, signal?: AbortSignal): Promise<void>;
  prepareEdit<T>(documentId: string, before: Readonly<T>, after: Readonly<T>, signal?: AbortSignal): Promise<DocumentAssetPreparedEdit<T>>;
  retain(documentId: string, kind: DocumentAssetRetentionKind, references: readonly DocumentAssetReference[], signal?: AbortSignal): Promise<DocumentAssetRetentionHandle>;
  flush(): Promise<void>;
}

export function createDocumentAssetRuntimeIntegration(options: {
  readonly backing: DocumentAssetRuntimeBacking;
  readonly signal: AbortSignal;
  readonly randomUUID: () => string;
  readonly observeError: (error: unknown) => void;
}) {
  const backing = options.backing;
  if (Boolean(backing.store) === Boolean(backing.createStore)) throw new TypeError("Asset backing requires exactly one supplied store or owned store factory.");
  const owned = Boolean(backing.createStore);
  const store = backing.store ?? backing.createStore!();
  if (!store || typeof store.read !== "function" || typeof store.retain !== "function") throw new TypeError("Asset backing factory must return a document asset store capability.");
  const retention = createDocumentAssetRetention(store);
  const manual = new Set<DocumentAssetRetentionHandle>();
  type Entry = { document: ApplicationDocument<unknown, unknown>; controller: AbortController; binding: Promise<DocumentAssetDocumentBinding>; admitted: boolean };
  const entries = new Map<string, Entry>();
  const pending = new Set<Promise<void>>();
  let documents: DocumentController | undefined, unsubscribe: (() => void) | undefined, disposed = false;
  const observe = (error: unknown) => {
    if (error instanceof DocumentAssetError && error.code === "asset-aborted") return;
    try { options.observeError(error); } catch { /* diagnostics cannot change ownership */ }
  };
  const track = (promise: Promise<void>) => {
    const task = promise.catch(observe); pending.add(task); void task.finally(() => pending.delete(task));
  };
  const requireDocument = (documentId: string) => {
    assertDocumentAssetNotAborted(options.signal);
    const document = documents?.getDocument(documentId);
    if (disposed || !document || document.state === "closed") throw new DocumentAssetError("asset-aborted", "The document asset owner is no longer live.");
    return document;
  };
  const requireEntry = (documentId: string) => {
    const document = requireDocument(documentId);
    if (!backing.manifest) throw new DocumentAssetError("asset-unsupported", "Model asset admission requires application reference enumeration.");
    const entry = entries.get(documentId);
    if (!entry || entry.document !== document) throw new DocumentAssetError("asset-unavailable", "The document asset binding is unavailable.");
    return entry;
  };
  const cooperation: DocumentAssetRuntimeCooperation = Object.freeze({
    async whenReady(documentId: string, signal?: AbortSignal) {
      const entry = requireEntry(documentId);
      await awaitDocumentAsset(entry.binding, signal);
      if (requireDocument(documentId) !== entry.document) throw new DocumentAssetError("asset-aborted", "The document owner was replaced.");
    },
    async prepareEdit<T>(documentId: string, before: Readonly<T>, after: Readonly<T>, signal?: AbortSignal) {
      const entry = requireEntry(documentId);
      const merged = AbortSignal.any([options.signal, entry.controller.signal, ...(signal ? [signal] : [])]);
      const binding = await awaitDocumentAsset(entry.binding, merged);
      if (requireDocument(documentId) !== entry.document) throw new DocumentAssetError("asset-aborted", "The document owner was replaced.");
      return binding.prepare(before, after, merged);
    },
    async retain(documentId: string, kind: DocumentAssetRetentionKind, references: readonly DocumentAssetReference[], signal?: AbortSignal) {
      const document = requireDocument(documentId);
      const merged = AbortSignal.any([options.signal, ...(signal ? [signal] : [])]);
      const handle = await retention.retain({ scope: backing.scopeForDocument(documentId), kind, id: `runtime:${options.randomUUID()}` }, references, merged);
      if (documents?.getDocument(documentId) !== document || disposed || merged.aborted) { await handle.release(); throw new DocumentAssetError("asset-aborted", "The retained document owner was revoked."); }
      let released = false;
      const wrapped: DocumentAssetRetentionHandle = Object.freeze({ root: handle.root, async release(releaseSignal?: AbortSignal) {
        if (released) return false;
        const result = await handle.release(releaseSignal); released = true; manual.delete(wrapped); merged.removeEventListener("abort", onAbort); return result;
      } });
      const onAbort = () => track(wrapped.release().then(() => undefined));
      manual.add(wrapped); merged.addEventListener("abort", onAbort, { once: true });
      if (merged.aborted) onAbort();
      return wrapped;
    },
    async flush() {
      for (const entry of entries.values()) { const binding = await entry.binding; await binding.flush(); }
      while (pending.size) await Promise.all([...pending]);
    },
  });
  return {
    resourceBacking: Object.freeze({ store, scopeForDocument: backing.scopeForDocument }),
    cooperation,
    resourceLifecycle: backing.manifest ? async (document: ApplicationDocument<unknown, unknown>, signal?: AbortSignal): Promise<DocumentResourceLifecycle> => {
      const manifest = backing.manifest!;
      const lifetime = new AbortController();
      const merged = AbortSignal.any([options.signal, lifetime.signal]);
      const binding = createDocumentAssetDocumentBinding({ document, store, scope: backing.scopeForDocument(document.id),
        enumerateModelReferences: model => manifest.enumerateReferences(document.type.write(model, { typeId: document.type.id, schemaVersion: document.type.schemaVersion }), { typeId: document.type.id, schemaVersion: document.type.schemaVersion }),
        randomUUID: options.randomUUID, signal: merged, observeError: observe });
      const entry: Entry = { document, controller: lifetime, binding, admitted: false };
      if (entries.has(document.id)) { lifetime.abort(); track(binding.then(value => value.close())); throw new DocumentAssetError("asset-conflict", "The document asset owner is already bound."); }
      entries.set(document.id, entry);
      try {
        const bound = await awaitDocumentAsset(binding, signal ? AbortSignal.any([merged, signal]) : merged);
        return Object.freeze({ prepareModel: bound.prepareModel, stageChange: bound.stageChange, async dispose() {
          if (entries.get(document.id) === entry) entries.delete(document.id);
          lifetime.abort(); await bound.close();
        } });
      } catch (error) {
        if (entries.get(document.id) === entry) entries.delete(document.id);
        lifetime.abort(); track(binding.then(value => value.close()));
        throw error;
      }
    } : undefined,
    wrapAdapter(adapter: DocumentStorageAdapter): DocumentStorageAdapter {
      const manifest = backing.manifest;
      if (!manifest) return adapter;
      const nativeDurability = typeof manifest.nativeDurability === "function" ? manifest.nativeDurability(adapter.id) : manifest.nativeDurability;
      return createDocumentAssetStorageAdapter({ adapter, store, enumerateReferences: manifest.enumerateReferences, scopeForLocation: manifest.scopeForLocation, nativeDurability, randomUUID: options.randomUUID, hash: manifest.hash, observeError: observe });
    },
    wrapRecovery(recovery: DocumentRecoveryStore): DocumentRecoveryStore {
      return backing.manifest ? createDocumentAssetRecoveryStore({ recovery, store, scopeForDocument: backing.scopeForDocument,
        enumerateReferences: backing.manifest.enumerateReferences, randomUUID: options.randomUUID, observeError: observe }) : recovery;
    },
    attach(controller: DocumentController) {
      if (documents) throw new TypeError("Runtime asset integration is already attached.");
      documents = controller;
      const sync = () => {
        const open = new Map(controller.openDocuments.map(document => [document.id, document]));
        for (const [id, entry] of [...entries]) {
          if (open.get(id) === entry.document) entry.admitted = true;
          else if (entry.admitted) {
            entries.delete(id); entry.controller.abort(); track(entry.binding.then(binding => binding.close()));
          }
        }
      };
      unsubscribe = controller.subscribe(sync); sync();
    },
    async dispose() {
      if (disposed) return;
      disposed = true; unsubscribe?.();
      for (const entry of entries.values()) { entry.controller.abort(); track(entry.binding.then(binding => binding.close())); }
      entries.clear();
      for (const handle of [...manual]) track(handle.release().then(() => undefined));
      while (pending.size) await Promise.all([...pending]);
      if (owned) store.dispose();
    },
  };
}
