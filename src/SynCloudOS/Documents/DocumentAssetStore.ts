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

import { assertDocumentAssetNotAborted, awaitDocumentAsset, DocumentAssetError } from "./documentAssetErrors";
import { emptyDocumentAssetState, type DocumentAssetBackend, type DocumentAssetBackendState } from "./documentAssetBackend";
import { documentAssetBlobKey, documentAssetHash, documentAssetId, documentAssetKey, documentAssetMime, documentAssetReferencesEqual,
  documentAssetRootKey, documentAssetScopeEqual, validateDocumentAssetIntrinsic, validateDocumentAssetReference, validateDocumentAssetRoot, validateDocumentAssetScope } from "./documentAssetValidation";
import type { DocumentAssetReference, DocumentAssetStore } from "./documentAssetTypes";
import { createBrowserDocumentAssetEnvironment } from "../PlatformAdapters/BrowserDocumentAssetEnvironment";
export type { DocumentAssetStore } from "./documentAssetTypes";

export interface DocumentAssetStoreOptions {
  readonly maximumAssetBytes?: number;
  readonly maximumTotalBytes?: number;
  readonly maximumRetentionRoots?: number;
  readonly randomUUID?: () => string;
  /** Trusted cryptographic platform dependency; must return a SHA-256 digest. */
  readonly hash?: (bytes: Uint8Array) => Promise<string>;
}

function storedBytes(state: DocumentAssetBackendState, reference: DocumentAssetReference): Uint8Array {
  const stored = state.assets[documentAssetKey(reference)];
  if (!stored) throw new DocumentAssetError("asset-missing", `Asset "${reference.assetId}" is missing.`);
  if (!documentAssetReferencesEqual(stored, reference)) throw new DocumentAssetError("asset-corrupt", "Stored asset metadata does not match the reference.");
  const bytes = state.blobs[documentAssetBlobKey(reference)];
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== reference.byteLength) throw new DocumentAssetError("asset-corrupt", "Stored asset bytes do not match the declared length.");
  return bytes;
}

/** Shared validation/copy/retention behavior; backing handles transactional storage only. */
export function createDocumentAssetStore(backend: DocumentAssetBackend, options: DocumentAssetStoreOptions = {}): DocumentAssetStore {
  const maximumAssetBytes = options.maximumAssetBytes ?? 32 * 1024 * 1024;
  const maximumTotalBytes = options.maximumTotalBytes ?? 256 * 1024 * 1024;
  const maximumRetentionRoots = options.maximumRetentionRoots ?? 8192;
  if (![maximumAssetBytes, maximumTotalBytes, maximumRetentionRoots].every(value => Number.isSafeInteger(value) && value >= 0)) throw new TypeError("Asset quotas must be nonnegative safe integers.");
  const lifetime = new AbortController();
  const hash = options.hash ?? createBrowserDocumentAssetEnvironment().hash;
  const uuid = options.randomUUID ?? createBrowserDocumentAssetEnvironment().randomUUID;
  const live = (signal?: AbortSignal) => { assertDocumentAssetNotAborted(signal); assertDocumentAssetNotAborted(lifetime.signal); };
  const digest = async (bytes: Uint8Array, signal?: AbortSignal) => {
    live(signal);
    const result = await awaitDocumentAsset(awaitDocumentAsset(hash(bytes.slice()), signal), lifetime.signal);
    live(signal);
    return documentAssetHash(result);
  };
  const run = <T>(write: boolean, operation: (state: DocumentAssetBackendState) => T, signal?: AbortSignal) => {
    live(signal);
    return backend.run(write, state => { live(signal); return operation(state); }, signal);
  };
  const store: DocumentAssetStore = {
    capabilities: Object.freeze({ durability: backend.durability, maximumAssetBytes, maximumTotalBytes, maximumRetentionRoots, retention: "persistent-roots", deduplication: "authorization-scoped" }),
    async put(scope, input, signal) {
      live(signal);
      const capturedScope = validateDocumentAssetScope(scope);
      if (!(input.bytes instanceof Uint8Array)) throw new DocumentAssetError("asset-invalid", "Asset bytes must be a Uint8Array.");
      const bytes = input.bytes.slice();
      if (bytes.byteLength > maximumAssetBytes) throw new DocumentAssetError("asset-quota", "Asset exceeds the native storage byte limit.");
      const mimeType = documentAssetMime(input.mimeType);
      const assetId = documentAssetId(input.assetId ?? `asset:${uuid()}`);
      const intrinsic = input.intrinsic === undefined ? undefined : validateDocumentAssetIntrinsic(input.intrinsic);
      const reference = validateDocumentAssetReference({ kind: "document-asset", scope: capturedScope, assetId, hash: await digest(bytes, signal), mimeType,
        byteLength: bytes.byteLength, ...(intrinsic ? { intrinsic } : {}) });
      return run(true, state => {
        const key = documentAssetKey(reference), blobKey = documentAssetBlobKey(reference);
        const previous = state.assets[key];
        if (previous && !documentAssetReferencesEqual(previous, reference)) throw new DocumentAssetError("asset-conflict", "A stable asset ID cannot be overwritten.");
        const existing = state.blobs[blobKey];
        if (existing && (existing.byteLength !== bytes.byteLength || existing.some((b, i) => b !== bytes[i]))) throw new DocumentAssetError("asset-corrupt", "Content-addressed bytes do not match their digest.");
        if (!existing) {
          const total = Object.values(state.blobs).reduce((sum, value) => sum + value.byteLength, 0);
          if (total + bytes.byteLength > maximumTotalBytes) throw new DocumentAssetError("asset-quota", "Asset storage exceeds its byte quota.");
          state.blobs[blobKey] = bytes.slice();
        }
        state.assets[key] = reference;
        return reference;
      }, signal);
    },
    async read(scope, reference, signal) {
      live(signal);
      const capturedScope = validateDocumentAssetScope(scope), captured = validateDocumentAssetReference(reference);
      if (!documentAssetScopeEqual(capturedScope, captured.scope)) throw new DocumentAssetError("asset-unauthorized", "The asset belongs to another authorization/document scope.");
      const bytes = await run(false, state => storedBytes(state, captured).slice(), signal);
      if (await digest(bytes, signal) !== captured.hash) throw new DocumentAssetError("asset-corrupt", "Stored asset bytes failed SHA-256 verification.");
      return bytes;
    },
    async copy(source, reference, destination, signal) {
      const target = validateDocumentAssetScope(destination);
      if (validateDocumentAssetScope(source).authorizationId !== target.authorizationId) throw new DocumentAssetError("asset-unauthorized", "Cross-authorization asset transfer requires a provider capability.");
      const captured = validateDocumentAssetReference(reference);
      const bytes = await store.read(source, captured, signal);
      return store.put(target, { bytes, mimeType: captured.mimeType, intrinsic: captured.intrinsic }, signal);
    },
    async retain(root, references, signal) {
      const capturedRoot = validateDocumentAssetRoot(root);
      const captured = references.map(validateDocumentAssetReference);
      if (captured.length > 4096) throw new DocumentAssetError("asset-quota", "An asset root exceeds the reference limit.");
      for (const reference of captured) await store.read(capturedRoot.scope, reference, signal);
      const token = documentAssetId(uuid());
      return run(true, state => {
        for (const reference of captured) storedBytes(state, reference);
        const key = documentAssetRootKey(capturedRoot);
        if (!state.roots[key] && Object.keys(state.roots).length >= maximumRetentionRoots) throw new DocumentAssetError("asset-quota", "Asset retention root quota was exceeded.");
        state.roots[key] = { root: capturedRoot, references: [...new Set(captured.map(documentAssetKey))], token };
        return token;
      }, signal);
    },
    async release(root, signal, expectedToken) {
      const key = documentAssetRootKey(validateDocumentAssetRoot(root));
      return run(true, state => {
        const entry = state.roots[key];
        if (!entry || (expectedToken !== undefined && entry.token !== expectedToken)) return false;
        delete state.roots[key];
        return true;
      }, signal);
    },
    async promoteRetentionRoot(source, target, references, expectedToken, signal) {
      const from = validateDocumentAssetRoot(source), to = validateDocumentAssetRoot(target);
      if (!documentAssetScopeEqual(from.scope, to.scope)) throw new DocumentAssetError("asset-unauthorized", "Root promotion cannot transfer document authority.");
      const captured = references.map(validateDocumentAssetReference);
      if (captured.length > 4096) throw new DocumentAssetError("asset-quota", "An asset root exceeds the reference limit.");
      for (const reference of captured) await store.read(to.scope, reference, signal);
      const keys = [...new Set(captured.map(documentAssetKey))];
      const token = documentAssetId(uuid());
      return run(true, state => {
        const sourceKey = documentAssetRootKey(from), targetKey = documentAssetRootKey(to);
        const entry = state.roots[sourceKey];
        if (!entry || entry.token !== expectedToken) return undefined;
        const sameReferences = (stored: readonly string[]) => stored.length === keys.length && keys.every(key => stored.includes(key));
        if (!sameReferences(entry.references) || (state.roots[targetKey] && !sameReferences(state.roots[targetKey].references))) {
          throw new DocumentAssetError("asset-conflict", "Root promotion must preserve the exact admitted reference set.");
        }
        for (const reference of captured) storedBytes(state, reference);
        // The write transaction establishes the destination before deleting the
        // source; it needs no additional root slot and exposes no unpinned gap.
        state.roots[targetKey] = { root: to, references: keys, token };
        if (sourceKey !== targetKey) delete state.roots[sourceKey];
        return token;
      }, signal);
    },
    async collectGarbage(scope, signal) {
      const capturedScope = validateDocumentAssetScope(scope);
      return run(true, state => {
        const retained = new Set(Object.values(state.roots).flatMap(root => root.references));
        let removedAssets = 0, removedBytes = 0;
        for (const [key, asset] of Object.entries(state.assets)) {
          if (!documentAssetScopeEqual(capturedScope, asset.scope) || retained.has(key)) continue;
          delete state.assets[key]; removedAssets += 1;
        }
        const usedBlobs = new Set(Object.values(state.assets).map(documentAssetBlobKey));
        for (const [key, bytes] of Object.entries(state.blobs)) {
          if (!usedBlobs.has(key)) { removedBytes += bytes.byteLength; delete state.blobs[key]; }
        }
        return { removedAssets, removedBytes };
      }, signal);
    },
    async listRetentionRoots(scope, signal) {
      const capturedScope = validateDocumentAssetScope(scope);
      return run(false, state => Object.freeze(Object.values(state.roots)
        .filter(entry => documentAssetScopeEqual(capturedScope, entry.root.scope))
        .map(entry => Object.freeze({ root: validateDocumentAssetRoot(entry.root), token: entry.token, references: Object.freeze(entry.references.map(key => {
          if (!state.assets[key]) throw new DocumentAssetError("asset-missing", "A retained asset reference is missing.");
          return validateDocumentAssetReference(state.assets[key]);
        })) }))), signal);
    },
    dispose() { lifetime.abort(); backend.dispose(); },
  };
  return Object.freeze(store);
}

export function createInMemoryDocumentAssetStore(options: DocumentAssetStoreOptions = {}): DocumentAssetStore {
  let state = emptyDocumentAssetState();
  let queue = Promise.resolve();
  const backend: DocumentAssetBackend = {
    durability: "memory",
    run(write, operation, signal) {
      const result = queue.then(() => {
        assertDocumentAssetNotAborted(signal);
        const next = write ? structuredClone(state) : state;
        const value = operation(next);
        if (write) state = next;
        return value;
      });
      queue = result.then(() => undefined, () => undefined);
      return result;
    },
    dispose() { state = emptyDocumentAssetState(); },
  };
  return createDocumentAssetStore(backend, options);
}
