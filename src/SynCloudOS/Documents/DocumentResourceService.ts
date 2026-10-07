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

import type { RuntimeOwnerToken } from "../Runtime/runtimeOwner";
import type { DocumentAssetReference, DocumentAssetScope, DocumentAssetStore, DocumentAssetStoreCapabilities } from "./documentAssetTypes";
import { DocumentAssetError } from "./documentAssetErrors";
import { validateDocumentAssetReference, validateDocumentAssetScope } from "./documentAssetValidation";

export interface DocumentResourceDescriptor {
  readonly kind: "document-resource";
  readonly documentId: string;
  readonly resourceId: string;
  readonly leaseId: string;
  readonly generation: number;
  readonly mimeType: string;
  readonly byteLength: number;
}

export interface DocumentResourceInput {
  readonly type: string;
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface DocumentResourceInvalidation {
  readonly documentId: string;
  readonly descriptor: DocumentResourceDescriptor;
}

export interface DocumentResourceService {
  readonly runtimeId: string;
  readonly ownerToken: RuntimeOwnerToken;
  readonly assetCapabilities?: DocumentAssetStoreCapabilities;
  acquire(documentId: string, resource: DocumentResourceInput, signal: AbortSignal): Promise<DocumentResourceDescriptor>;
  acquireAsset(documentId: string, reference: DocumentAssetReference, signal: AbortSignal): Promise<DocumentResourceDescriptor>;
  persist(documentId: string, descriptor: DocumentResourceDescriptor, signal: AbortSignal): Promise<DocumentAssetReference>;
  isActive(documentId: string, descriptor: unknown): descriptor is DocumentResourceDescriptor;
  resolve(documentId: string, descriptor: DocumentResourceDescriptor, signal?: AbortSignal): Uint8Array | null;
  subscribeInvalidation(listener: (invalidation: DocumentResourceInvalidation) => void): () => void;
  release(documentId: string, descriptor: DocumentResourceDescriptor): boolean;
  releaseDocument(documentId: string): number;
  dispose(): void;
}

const maximumResourceBytes = 8 * 1024 * 1024;
const allowedMimeTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const descriptorKeys = new Set(["kind", "documentId", "resourceId", "leaseId", "generation", "mimeType", "byteLength"]);

function awaitResourceBytes(value: Promise<ArrayBuffer>, callerSignal: AbortSignal, runtimeSignal: AbortSignal): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (next: () => void) => {
      if (settled) return;
      settled = true;
      callerSignal.removeEventListener("abort", abortCaller);
      runtimeSignal.removeEventListener("abort", abortRuntime);
      next();
    };
    const abort = (signal: AbortSignal) => finish(() => {
      if (signal.reason instanceof Error) reject(signal.reason);
      else { const error = new Error("Document resource acquisition was aborted."); error.name = "AbortError"; reject(error); }
    });
    const abortCaller = () => abort(callerSignal);
    const abortRuntime = () => abort(runtimeSignal);
    callerSignal.addEventListener("abort", abortCaller, { once: true });
    runtimeSignal.addEventListener("abort", abortRuntime, { once: true });
    if (callerSignal.aborted) abortCaller();
    else if (runtimeSignal.aborted) abortRuntime();
    void value.then((buffer) => finish(() => resolve(buffer)), (error) => finish(() => reject(error)));
  });
}

function inspectDescriptor(value: unknown): DocumentResourceDescriptor | null {
  if (!value || typeof value !== "object" || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) return null;
  if (Object.getOwnPropertySymbols(value).length) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  if (keys.length !== descriptorKeys.size || keys.some((key) => !descriptorKeys.has(key))) return null;
  if (keys.some((key) => !Object.prototype.hasOwnProperty.call(descriptors[key], "value"))) return null;
  const read = (key: keyof DocumentResourceDescriptor) => descriptors[key]?.value;
  const generation = read("generation");
  const byteLength = read("byteLength");
  if (read("kind") !== "document-resource" || typeof read("documentId") !== "string" || typeof read("resourceId") !== "string" ||
    typeof read("leaseId") !== "string" || typeof generation !== "number" || !Number.isSafeInteger(generation) || typeof read("mimeType") !== "string" ||
    typeof byteLength !== "number" || !Number.isSafeInteger(byteLength)) return null;
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value])) as unknown as DocumentResourceDescriptor;
}

export function createDocumentResourceService(options: {
  readonly runtimeId: string;
  readonly ownerToken: RuntimeOwnerToken;
  readonly signal: AbortSignal;
  readonly randomUUID: () => string;
  readonly assetBacking?: {
    readonly store: DocumentAssetStore;
    readonly scopeForDocument: (documentId: string) => DocumentAssetScope;
  };
}): DocumentResourceService {
  const resources = new Map<string, { readonly descriptor: DocumentResourceDescriptor; readonly bytes: Uint8Array }>();
  const invalidationListeners = new Set<(invalidation: DocumentResourceInvalidation) => void>();
  let generation = 0;
  let disposed = false;
  const lifetime = new AbortController();
  const assertLive = (signal?: AbortSignal) => {
    signal?.throwIfAborted();
    options.signal.throwIfAborted();
    if (disposed) {
      const error = new Error("Document resources are disposed.");
      error.name = "AbortError";
      throw error;
    }
  };
  const notifyInvalidation = (descriptor: DocumentResourceDescriptor) => {
    const invalidation = Object.freeze({ documentId: descriptor.documentId, descriptor });
    for (const listener of [...invalidationListeners]) {
      try { listener(invalidation); } catch { /* resource revocation remains authoritative */ }
    }
  };
  const service: DocumentResourceService = {
    runtimeId: options.runtimeId,
    ownerToken: options.ownerToken,
    ...(options.assetBacking ? { assetCapabilities: options.assetBacking.store.capabilities } : {}),
    async acquireAsset(documentId, reference, signal) {
      assertLive(signal);
      const backing = options.assetBacking;
      if (!backing) throw new DocumentAssetError("asset-unsupported", "Stable asset acquisition is unavailable.");
      const captured = validateDocumentAssetReference(reference);
      if (captured.byteLength > maximumResourceBytes) throw new RangeError("Document resource exceeds the byte limit.");
      if (!allowedMimeTypes.has(captured.mimeType)) throw new TypeError("Document resource MIME type is unsupported.");
      const scope = validateDocumentAssetScope(backing.scopeForDocument(documentId));
      const merged = AbortSignal.any([signal, options.signal, lifetime.signal]);
      const bytes = await backing.store.read(scope, captured, merged);
      assertLive(signal);
      return service.acquire(documentId, { type: captured.mimeType, size: bytes.byteLength, arrayBuffer: async () => bytes.slice().buffer }, merged);
    },
    async persist(documentId, descriptor, signal) {
      assertLive(signal);
      const backing = options.assetBacking;
      if (!backing) throw new DocumentAssetError("asset-unsupported", "Durable asset backing is unavailable.");
      const bytes = service.resolve(documentId, descriptor, signal);
      if (!bytes) throw new DocumentAssetError("asset-unauthorized", "The resource lease is revoked or belongs to another document.");
      const scope = validateDocumentAssetScope(backing.scopeForDocument(documentId));
      const merged = AbortSignal.any([signal, options.signal, lifetime.signal]);
      const reference = await backing.store.put(scope, { bytes, mimeType: descriptor.mimeType }, merged);
      assertLive(signal);
      if (!service.isActive(documentId, descriptor)) throw new DocumentAssetError("asset-aborted", "The source resource was revoked during persistence.");
      return reference;
    },
    async acquire(documentId, resource, signal) {
      assertLive(signal);
      if (!documentId || documentId.length > 256) throw new TypeError("A bounded document id is required.");
      const expectedSize = resource.size;
      const mimeType = resource.type;
      if (!Number.isSafeInteger(expectedSize) || expectedSize < 0 || expectedSize > maximumResourceBytes) throw new RangeError("Document resource exceeds the byte limit.");
      if (!allowedMimeTypes.has(mimeType)) throw new TypeError("Document resource MIME type is unsupported.");
      const buffer = await awaitResourceBytes(resource.arrayBuffer(), signal, AbortSignal.any([options.signal, lifetime.signal]));
      assertLive(signal);
      if (buffer.byteLength !== expectedSize || buffer.byteLength > maximumResourceBytes) throw new RangeError("Document resource size changed during acquisition.");
      generation += 1;
      const descriptor = Object.freeze({
        kind: "document-resource" as const,
        documentId,
        resourceId: `resource:${options.randomUUID()}`,
        leaseId: `lease:${options.randomUUID()}`,
        generation,
        mimeType,
        byteLength: buffer.byteLength,
      });
      resources.set(descriptor.leaseId, { descriptor, bytes: new Uint8Array(buffer.slice(0)) });
      return descriptor;
    },
    isActive(documentId, descriptor): descriptor is DocumentResourceDescriptor {
      if (disposed) return false;
      const candidate = inspectDescriptor(descriptor);
      if (!candidate) return false;
      const entry = resources.get(candidate.leaseId);
      return Boolean((entry && documentId === entry.descriptor.documentId && documentId === candidate.documentId && entry.descriptor === candidate) || (entry &&
        documentId === entry.descriptor.documentId && documentId === candidate.documentId &&
        entry.descriptor.resourceId === candidate.resourceId && entry.descriptor.generation === candidate.generation &&
        entry.descriptor.mimeType === candidate.mimeType && entry.descriptor.byteLength === candidate.byteLength));
    },
    resolve(documentId, descriptor, signal) {
      assertLive(signal);
      if (!service.isActive(documentId, descriptor)) return null;
      const bytes = resources.get(descriptor.leaseId)?.bytes;
      return bytes ? bytes.slice() : null;
    },
    subscribeInvalidation(listener) {
      assertLive();
      if (typeof listener !== "function") throw new TypeError("A document resource invalidation listener is required.");
      invalidationListeners.add(listener);
      let subscribed = true;
      return () => { if (subscribed) { subscribed = false; invalidationListeners.delete(listener); } };
    },
    release(documentId, descriptor) {
      if (!service.isActive(documentId, descriptor)) return false;
      const entry = resources.get(descriptor.leaseId)!;
      if (!resources.delete(descriptor.leaseId)) return false;
      notifyInvalidation(entry.descriptor);
      return true;
    },
    releaseDocument(documentId) {
      if (disposed) return 0;
      let released = 0;
      for (const [leaseId, entry] of resources) {
        if (entry.descriptor.documentId !== documentId) continue;
        resources.delete(leaseId);
        notifyInvalidation(entry.descriptor);
        released += 1;
      }
      return released;
    },
    dispose() {
      if (disposed) return;
      lifetime.abort();
      for (const entry of [...resources.values()]) notifyInvalidation(entry.descriptor);
      disposed = true;
      resources.clear();
      invalidationListeners.clear();
    },
  };
  return service;
}
