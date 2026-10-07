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

import type { DocumentReadOptions, DocumentStorageAdapter, DocumentWriteRequest } from "./Adapters/documentAdapterTypes";
import { canonicalDocumentJson, canonicalDocumentLocation, immutableDocumentValue, type DocumentLocation, type DocumentRecord, type DocumentVersion } from "./documentTypes";
import { assertDocumentAssetNotAborted, awaitDocumentAsset, DocumentAssetError } from "./documentAssetErrors";
import type { DocumentAssetInput, DocumentAssetReference, DocumentAssetRetentionRoot, DocumentAssetScope, DocumentAssetStore } from "./documentAssetTypes";
import { createDocumentAssetManifest, documentAssetManifestMetadataKey, encodeDocumentAssetManifest, readDocumentAssetManifest,
  verifyDocumentAssetManifest, type DocumentAssetManifest } from "./documentAssetManifest";
import { documentAssetHash, documentAssetKey, documentAssetReferencesEqual, documentAssetScopeEqual, validateDocumentAssetReference } from "./documentAssetValidation";
import { documentAssetNativeVersionRoot, reconcileDocumentAssetVersions, releaseEvictedDocumentAssetVersions } from "./DocumentAssetVersionRetention";
import { createBrowserDocumentAssetEnvironment } from "../PlatformAdapters/BrowserDocumentAssetEnvironment";
import { createVerifiedDocumentAssetObservation } from "./DocumentAssetObservation";

export interface DocumentAssetSaveOptions {
  readonly adapter: DocumentStorageAdapter;
  readonly store: DocumentAssetStore;
  readonly scopeForLocation: (location: DocumentLocation) => DocumentAssetScope;
  readonly enumerateReferences: (content: unknown, context: { readonly typeId: string; readonly schemaVersion: number }) => readonly DocumentAssetReference[];
  readonly randomUUID?: () => string;
  readonly hash?: (bytes: Uint8Array) => Promise<string>;
  /** Provider/native-record persistence is asserted by its owner, never inferred from asset backing. */
  readonly nativeDurability?: "memory" | "durable";
  readonly observeError?: (error: unknown) => void;
}
export interface DocumentAssetSaveCapture {
  readonly revision: number;
  readonly contentIdentity: string;
  readonly stagedAssets?: readonly { readonly reference: DocumentAssetReference; readonly input: DocumentAssetInput }[];
}
export interface DocumentAssetSaveReceipt<T> {
  readonly record: DocumentRecord<T>;
  readonly manifest: DocumentAssetManifest;
  readonly revision: number;
  readonly contentIdentity: string;
  readonly durability: "memory" | "durable" | "unknown";
  readonly assetDurability: "memory" | "durable";
  /** Keep until the corresponding saved version is actually evicted. */
  readonly retentionRoot: DocumentAssetRetentionRoot | null;
}
export interface DocumentAssetSaveCoordinator {
  save<T>(request: DocumentWriteRequest<T>, capture: DocumentAssetSaveCapture): Promise<DocumentAssetSaveReceipt<T>>;
  verifyRecord<T>(record: DocumentRecord<T>, signal?: AbortSignal): Promise<DocumentAssetManifest>;
}

function captureAssetWrite<T>(options: DocumentAssetSaveOptions, request: DocumentWriteRequest<T>) {
  assertDocumentAssetNotAborted(request.signal);
  const content = immutableDocumentValue(request.content, request.typeId);
  const manifest = createDocumentAssetManifest(options.scopeForLocation(request.location), options.enumerateReferences(content, { typeId: request.typeId, schemaVersion: request.schemaVersion }));
  const prepared: DocumentWriteRequest<T> = {
    ...request, location: immutableDocumentValue(request.location, request.typeId), content,
    expectedVersion: request.expectedVersion ? immutableDocumentValue(request.expectedVersion, request.typeId) : null,
    metadata: immutableDocumentValue({ ...request.metadata, [documentAssetManifestMetadataKey]: encodeDocumentAssetManifest(manifest) }, request.typeId),
  };
  return { request: prepared, manifest };
}

export function createDocumentAssetSaveCoordinator(options: DocumentAssetSaveOptions): DocumentAssetSaveCoordinator {
  const uuid = options.randomUUID ?? createBrowserDocumentAssetEnvironment().randomUUID;
  const hash = options.hash ?? createBrowserDocumentAssetEnvironment().hash;
  const observe = (error: unknown) => { try { options.observeError?.(error); } catch { /* diagnostics cannot falsify a committed receipt */ } };
  const sameReceipt = (record: DocumentRecord<unknown>, request: DocumentWriteRequest<unknown>) =>
    canonicalDocumentLocation(record.location) === canonicalDocumentLocation(request.location) && record.typeId === request.typeId &&
    record.schemaVersion === request.schemaVersion && canonicalDocumentJson(record.content, request.typeId) === canonicalDocumentJson(request.content, request.typeId) &&
    canonicalDocumentJson(record.metadata, request.typeId) === canonicalDocumentJson(request.metadata ?? {}, request.typeId);
  const coordinator: DocumentAssetSaveCoordinator = {
    async save<T>(request: DocumentWriteRequest<T>, capture: DocumentAssetSaveCapture) {
      if (!Number.isSafeInteger(capture.revision) || capture.revision < 0 || typeof capture.contentIdentity !== "string" || !capture.contentIdentity) {
        throw new DocumentAssetError("asset-invalid", "A captured revision and native content identity are required.");
      }
      const revision = capture.revision, contentIdentity = capture.contentIdentity;
      const prepared = captureAssetWrite(options, request);
      if (prepared.manifest.assets.length && !options.adapter.capabilities.atomicConditionalWrite) {
        throw new DocumentAssetError("asset-unsupported", "Asset publication requires an adapter with atomic conditional native writes.");
      }
      // Copy all staged inputs synchronously, before the first upload can yield.
      const staged = (capture.stagedAssets ?? []).map(value => ({ reference: validateDocumentAssetReference(value.reference),
        input: { ...value.input, bytes: value.input.bytes.slice(), intrinsic: value.input.intrinsic ? { ...value.input.intrinsic } : undefined } }));
      const required = new Map(prepared.manifest.assets.map(reference => [documentAssetKey(reference), reference]));
      for (const entry of staged) {
        const requested = required.get(documentAssetKey(entry.reference));
        if (!requested || !documentAssetReferencesEqual(requested, entry.reference)) throw new DocumentAssetError("asset-invalid", "Staged asset is absent from the captured manifest.");
      }
      for (const entry of staged) {
        const stored = await options.store.put(prepared.manifest.scope, { ...entry.input, assetId: entry.reference.assetId }, request.signal);
        if (!documentAssetReferencesEqual(stored, entry.reference)) throw new DocumentAssetError("asset-corrupt", "Staged bytes do not match the required stable reference.");
      }
      // Associate conservative sent-write pins with the entire captured native
      // operation, never just an idempotency key shared by another location/host.
      const operationIdentity = canonicalDocumentJson({ adapterId: options.adapter.id, location: canonicalDocumentLocation(prepared.request.location),
        typeId: prepared.request.typeId, schemaVersion: prepared.request.schemaVersion, content: prepared.request.content,
        expectedVersion: prepared.request.expectedVersion, idempotencyKey: prepared.request.idempotencyKey, metadata: prepared.request.metadata }, request.typeId);
      const prefix = prepared.manifest.assets.length ? `save:${documentAssetHash(await awaitDocumentAsset(hash(new TextEncoder().encode(operationIdentity)), request.signal)).slice(7)}:` : "";
      const matches = prepared.manifest.assets.length ? (await options.store.listRetentionRoots(prepared.manifest.scope, request.signal)).filter(entry =>
        entry.root.kind === "version" && entry.root.id.startsWith(prefix) &&
        encodeDocumentAssetManifest(createDocumentAssetManifest(prepared.manifest.scope, entry.references)) === encodeDocumentAssetManifest(prepared.manifest)) : [];
      const previousStage = matches[0];
      let retentionRoot: DocumentAssetRetentionRoot | null = prepared.manifest.assets.length
        ? previousStage?.root ?? Object.freeze({ scope: prepared.manifest.scope, kind: "version", id: `${prefix}${uuid()}` }) : null;
      // Persistent pins precede publication and prevent concurrent collection. A crash
      // after this point can leak a pin, but cannot publish a manifest without bytes.
      const token = retentionRoot ? await options.store.retain(retentionRoot, prepared.manifest.assets, request.signal) : undefined;
      let writeStarted = false;
      try {
        assertDocumentAssetNotAborted(request.signal);
        let recovered: DocumentRecord<T> | null = null;
        if (previousStage && options.adapter.recoverWriteByIdempotencyKey) {
          recovered = await options.adapter.recoverWriteByIdempotencyKey<T>(prepared.request, { signal: request.signal, closeTransactionToken: request.closeTransactionToken });
          if (recovered && !sameReceipt(recovered, prepared.request)) throw new DocumentAssetError("asset-corrupt", "The recovered native receipt does not match the captured write.");
        }
        if (!recovered) assertDocumentAssetNotAborted(request.signal);
        writeStarted = !recovered;
        const record = recovered ?? await options.adapter.write(prepared.request);
        // The prepublication root already guarantees bytes. Promote it to the
        // provider's immutable version identity for confirmed-eviction cleanup.
        // A postcommit root promotion failure must not turn a committed native
        // write into a fictional failure; its staging root remains conservative.
        if (retentionRoot) {
          const stagedRoot = retentionRoot;
          try {
            if (!sameReceipt(record, prepared.request)) throw new DocumentAssetError("asset-corrupt", "The committed native receipt differs from its captured write; staging ownership is preserved.");
            await coordinator.verifyRecord(record);
            const versionRoot = await documentAssetNativeVersionRoot(options.adapter.id, prepared.manifest.scope, record, options.hash);
            if (options.store.promoteRetentionRoot) {
              const promoted = await options.store.promoteRetentionRoot(stagedRoot, versionRoot, prepared.manifest.assets, token!);
              if (promoted) retentionRoot = versionRoot;
              else {
                // A concurrent identical acknowledgement may already have moved
                // this generation to the same confirmed immutable version.
                const pinned = (await options.store.listRetentionRoots(prepared.manifest.scope)).find(entry => entry.root.kind === versionRoot.kind && entry.root.id === versionRoot.id);
                if (pinned && encodeDocumentAssetManifest(createDocumentAssetManifest(prepared.manifest.scope, pinned.references)) === encodeDocumentAssetManifest(prepared.manifest)) retentionRoot = versionRoot;
              }
            } else {
              await options.store.retain(versionRoot, prepared.manifest.assets);
              retentionRoot = versionRoot;
              await options.store.release(stagedRoot, undefined, token);
            }
            // Release only generations proven to be this exact operation. The
            // acknowledged target (or our still-live stage) owns bytes throughout.
            const pins = await options.store.listRetentionRoots(prepared.manifest.scope);
            const owned = pins.some(entry => entry.root.kind === retentionRoot!.kind && entry.root.id === retentionRoot!.id &&
              (retentionRoot!.id === versionRoot.id || entry.token === token));
            if (owned) for (const entry of matches) {
              if (entry.root.id !== retentionRoot.id) await options.store.release(entry.root, undefined, entry.token);
            }
          } catch (error) { observe(error); /* true receipt, conservative staging ownership */ }
        }
        // No cancellation check after provider commitment: return its actual receipt.
        return Object.freeze({ record: immutableDocumentValue(record, request.typeId), manifest: prepared.manifest, revision, contentIdentity,
          durability: options.store.capabilities.durability === "memory" || options.nativeDurability === "memory" ? "memory" :
            options.nativeDurability === "durable" ? "durable" : "unknown", assetDurability: options.store.capabilities.durability, retentionRoot });
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
        if (retentionRoot && !previousStage && (!writeStarted || code === "document-version-conflict" || code === "document-destination-conflict" || code === "document-read-only")) {
          try { await options.store.release(retentionRoot, undefined, token); } catch { /* preserve the original failure; an orphan pin is conservative */ }
        }
        // Unknown sent-write outcomes retain bytes for existing idempotency recovery.
        throw error;
      }
    },
    async verifyRecord<T>(record: DocumentRecord<T>, signal?: AbortSignal) {
      const captured = immutableDocumentValue(record, record.typeId);
      const expected = createDocumentAssetManifest(options.scopeForLocation(captured.location), options.enumerateReferences(captured.content, { typeId: captured.typeId, schemaVersion: captured.schemaVersion }));
      const saved = readDocumentAssetManifest(captured.metadata);
      if (!saved && expected.assets.length) throw new DocumentAssetError("asset-missing", "The native document has assets but no saved manifest.");
      if (saved && (!documentAssetScopeEqual(expected.scope, saved.scope) || encodeDocumentAssetManifest(expected) !== encodeDocumentAssetManifest(saved))) {
        throw new DocumentAssetError("asset-corrupt", "Native reference enumeration does not match its saved manifest.");
      }
      await verifyDocumentAssetManifest(options.store, saved ?? expected, signal);
      return saved ?? expected;
    },
  };
  return Object.freeze(coordinator);
}

export interface DocumentAssetAdapterCapability {
  readonly durability: "memory" | "durable";
  readonly publication: "staged-before-conditional-write";
  readonly crossStoreAtomicity: false;
  verifyRecord<T>(record: DocumentRecord<T>, signal?: AbortSignal): Promise<DocumentAssetManifest>;
  readManifest(metadata: Readonly<Record<string, string>>): DocumentAssetManifest | null;
  releaseEvictedVersions(location: DocumentLocation, versions: readonly DocumentVersion[], signal?: AbortSignal): Promise<number>;
  reconcileVersions(location: DocumentLocation, signal?: AbortSignal): Promise<number>;
}
export interface DocumentAssetStorageAdapter extends DocumentStorageAdapter {
  readonly assets: DocumentAssetAdapterCapability;
}

/** The existing adapter owns CAS/idempotency/version/close/synchronization semantics. */
export function createDocumentAssetStorageAdapter(options: DocumentAssetSaveOptions): DocumentAssetStorageAdapter {
  const coordinator = createDocumentAssetSaveCoordinator(options);
  const verifyAndRetain = async (record: DocumentRecord<unknown>, signal: AbortSignal) => {
    const manifest = await coordinator.verifyRecord(record, signal);
    if (manifest.assets.length) {
      const root = await documentAssetNativeVersionRoot(options.adapter.id, manifest.scope, record, options.hash);
      await options.store.retain(root, manifest.assets, signal);
    }
  };
  const verify = async <T>(record: DocumentRecord<T> | null, readOptions?: DocumentReadOptions) => {
    if (record) await coordinator.verifyRecord(record, readOptions?.signal);
    return record;
  };
  const overrides: Partial<DocumentStorageAdapter> & { assets: DocumentAssetAdapterCapability } = {
    assets: Object.freeze({ durability: options.store.capabilities.durability, publication: "staged-before-conditional-write", crossStoreAtomicity: false,
      verifyRecord: coordinator.verifyRecord, readManifest: readDocumentAssetManifest,
      releaseEvictedVersions: (location: DocumentLocation, versions: readonly DocumentVersion[], signal?: AbortSignal) => releaseEvictedDocumentAssetVersions(options, location, versions, signal),
      reconcileVersions: (location: DocumentLocation, signal?: AbortSignal) => reconcileDocumentAssetVersions(options, location, signal) }),
    async write<T>(request: DocumentWriteRequest<T>) {
      const identity = canonicalDocumentJson(request.content, request.typeId);
      const record = (await coordinator.save(request, { revision: 0, contentIdentity: identity || "null" })).record;
      if (!request.closeTransactionToken) {
        try { await reconcileDocumentAssetVersions(options, request.location); } catch { /* preserve actual committed receipt and conservative pins */ }
      }
      return record;
    },
    async read<T>(location: DocumentLocation, readOptions?: DocumentReadOptions) { return verify(await options.adapter.read<T>(location, readOptions), readOptions); },
    async readVersion<T>(location: DocumentLocation, version: DocumentVersion, readOptions?: DocumentReadOptions) { return verify(await options.adapter.readVersion<T>(location, version, readOptions), readOptions); },
    async listVersions(location: DocumentLocation, readOptions?: DocumentReadOptions) {
      const versions = await options.adapter.listVersions(location, readOptions);
      if (!readOptions?.closeTransactionToken) await reconcileDocumentAssetVersions(options, location, readOptions?.signal);
      return versions;
    },
    async list(query) {
      const records = await options.adapter.list(query);
      for (const record of records) await coordinator.verifyRecord(record, query.signal);
      return records;
    },
  };
  if (options.adapter.watch) overrides.watch = (location, listener) => createVerifiedDocumentAssetObservation({
    subscribe: callback => options.adapter.watch!(location, callback), listener,
    record: event => event.kind === "written" ? event.record : null,
    verifyAndRetain, observeError: options.observeError,
  });
  if (options.adapter.subscribeSynchronisation) overrides.subscribeSynchronisation = (location, listener) => createVerifiedDocumentAssetObservation({
    subscribe: callback => options.adapter.subscribeSynchronisation!(location, callback), listener,
    record: event => event.kind === "acknowledged" ? event.record : event.currentRecord,
    verifyAndRetain, observeError: options.observeError,
  });
  if (options.adapter.recoverWriteByIdempotencyKey) {
    overrides.recoverWriteByIdempotencyKey = async <T>(request: DocumentWriteRequest<T>, readOptions?: DocumentReadOptions) => {
      const prepared = captureAssetWrite(options, request);
      return verify(await options.adapter.recoverWriteByIdempotencyKey!<T>(prepared.request, readOptions), readOptions);
    };
  }
  if (options.adapter.readLastAcknowledgedRecord) {
    overrides.readLastAcknowledgedRecord = async <T>(location: DocumentLocation, readOptions?: DocumentReadOptions) =>
      verify(await options.adapter.readLastAcknowledgedRecord!<T>(location, readOptions), readOptions);
  }
  // Binding delegated methods to the original adapter preserves private fields and
  // exact close before-images. No provider write or rollback path is replaced.
  return new Proxy(options.adapter, { get(target, property) {
    if (Object.hasOwn(overrides, property)) return Reflect.get(overrides, property);
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  } }) as DocumentAssetStorageAdapter;
}
