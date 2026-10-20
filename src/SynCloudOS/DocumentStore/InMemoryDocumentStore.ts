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

import { normalizeBundleIdentifier } from "../Identity/bundleIdentifier.mjs";
import type { SynCloudOSPolicyDecision, SynCloudOSPolicyRequest } from "../PolicyKit/policyTypes";
import { canonicalDocumentJson } from "../Documents/documentTypes";
import {
  SynCloudOSDocumentStoreAccessError,
  SynCloudOSDocumentStoreIdempotencyConflictError,
  SynCloudOSDocumentStoreIndexError,
  SynCloudOSDocumentStoreNotFoundError,
  SynCloudOSDocumentStorePayloadError,
  SynCloudOSDocumentStoreVersionConflictError
} from "./documentStoreErrors";
import type {
  DocumentStoreReadOptions,
  DocumentStoreVersion,
  DocumentStoreWriteOptions,
  SynCloudOSDocument,
  SynCloudOSDocumentDraftInput,
  SynCloudOSDocumentDraftInput as DocumentDraftInput,
  SynCloudOSDocumentOwnership,
  SynCloudOSDocumentIndexDefinition,
  SynCloudOSDocumentKindMetadata,
  SynCloudOSDocumentKindRegistrationOptions,
  SynCloudOSDocumentMediaAttachment,
  SynCloudOSDocumentPublishOptions,
  SynCloudOSDocumentReference,
  SynCloudOSDocumentRevision,
  SynCloudOSDocumentRevisionOptions,
  SynCloudOSDocumentSlugResolveOptions,
  SynCloudOSDocumentStoreAdapter,
  SynCloudOSDocumentStoreContext,
  SynCloudOSDocumentStoreDraftVersions,
  SynCloudOSDocumentStoreIdempotencyEntry,
  SynCloudOSDocumentStoreOperation,
  SynCloudOSDocumentStorePermission,
  SynCloudOSDocumentStoreSnapshot,
  SynCloudOSDocumentUnpublishOptions,
  SynCloudOSDraftDocumentQuery,
  SynCloudOSPublishedDocumentQuery
} from "./documentStoreTypes";

const operationDefaults: Record<SynCloudOSDocumentStoreOperation, SynCloudOSDocumentStorePermission> = {
  readPublished: { public: true },
  listPublished: { public: true },
  resolveSlug: { public: true },
  listDrafts: { requiredCapabilities: ["documentStore.drafts.read"] },
  getDraft: { requiredCapabilities: ["documentStore.drafts.read"] },
  saveDraft: { requiredCapabilities: ["documentStore.draft.write"] },
  listDraftVersions: { requiredCapabilities: ["documentStore.drafts.read"] },
  readDraftVersion: { requiredCapabilities: ["documentStore.drafts.read"] },
  deleteDraft: { requiredCapabilities: ["documentStore.draft.write"] },
  createRevision: { requiredCapabilities: ["documentStore.revision.create"] },
  publish: { requiredCapabilities: ["documentStore.publish"] },
  unpublish: { requiredCapabilities: ["documentStore.unpublish"] },
  attachMedia: { requiredCapabilities: ["documentStore.media.write"] }
};

export interface SynCloudOSInMemoryDocumentStoreOptions {
  kinds?: SynCloudOSDocumentKindMetadata[];
  documents?: SynCloudOSDocument[];
  revisions?: SynCloudOSDocumentRevision[];
  draftVersions?: SynCloudOSDocumentStoreDraftVersions[];
  idempotentDraftWrites?: SynCloudOSDocumentStoreIdempotencyEntry[];
  events?: { publish(type: string, payload?: unknown, label?: string): unknown };
  authorise?: (request: SynCloudOSPolicyRequest) => SynCloudOSPolicyDecision;
  clock?: () => Date;
  etag?: (input: { readonly documentId: string; readonly sequence: number; readonly savedAt: string; readonly document: SynCloudOSDocument }) => string;
}

function unique<T extends string>(values: T[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function clonePlain<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}
function isCanonicalOwnership(value: unknown): value is SynCloudOSDocumentOwnership {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const ownership = value as Record<string, unknown>;
  if (ownership.kind === "system") return !Object.prototype.hasOwnProperty.call(ownership, "applicationId");
  return ownership.kind === "application" &&
    typeof ownership.applicationId === "string" &&
    ownership.applicationId.trim().length > 0;
}
function assertCanonicalOwnership(value: unknown, label: string): asserts value is SynCloudOSDocumentOwnership {
  if (!isCanonicalOwnership(value)) {
    throw new SynCloudOSDocumentStorePayloadError(`${label} must declare canonical document ownership.`);
  }
}


function applicationIdValue(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SynCloudOSDocumentStorePayloadError(`${label} must be a non-empty application ID.`);
  }
  return value;
}

function ownershipKey(ownership: SynCloudOSDocumentOwnership): string {
  return ownership.kind === "application" ? `application:${normalizeBundleIdentifier(ownership.applicationId)}` : "system";
}
function assertCanonicalDocumentOwnership(document: SynCloudOSDocument, label: string): void {
  assertCanonicalOwnership(document.ownership, `${label} ownership`);
  if (document.ownership.kind === "application") {
    if (normalizeBundleIdentifier(document.applicationId) !== normalizeBundleIdentifier(document.ownership.applicationId)) {
      throw new SynCloudOSDocumentStorePayloadError(`${label} application ownership does not match its application ID.`);
    }
    return;
  }
  if (Object.prototype.hasOwnProperty.call(document, "applicationId")) {
    throw new SynCloudOSDocumentStorePayloadError(`${label} system ownership must not declare an application ID.`);
  }
}

function resolveDocumentOwnership(
  draft: DocumentDraftInput,
  existing: SynCloudOSDocument | undefined,
  context: SynCloudOSDocumentStoreContext,
): SynCloudOSDocumentOwnership {
  const contextAppId = applicationIdValue(context.appId, "DocumentStore context");
  const draftAppId = applicationIdValue(draft.applicationId, "Document draft");
  const requested = draft.ownership;
  const current = existing?.ownership;
  const existingAppId = existing ? applicationIdValue(existing.applicationId, "Stored document") : undefined;
  if (requested !== undefined) assertCanonicalOwnership(requested, "Document draft ownership");

  if (contextAppId) {
    if (draftAppId !== undefined && normalizeBundleIdentifier(draftAppId) !== normalizeBundleIdentifier(contextAppId)) {
      throw new SynCloudOSDocumentStorePayloadError("Document draft application ownership conflicts with its write context.");
    }
    if (requested && (requested.kind !== "application" || normalizeBundleIdentifier(requested.applicationId) !== normalizeBundleIdentifier(contextAppId))) {
      throw new SynCloudOSDocumentStorePayloadError("Document draft ownership conflicts with its write context.");
    }
    if (existingAppId !== undefined && normalizeBundleIdentifier(existingAppId) !== normalizeBundleIdentifier(contextAppId)) {
      throw new SynCloudOSDocumentStorePayloadError("Stored document application ownership conflicts with its write context.");
    }
    if (current && ownershipKey(current) !== `application:${normalizeBundleIdentifier(contextAppId)}`) {
      throw new SynCloudOSDocumentStorePayloadError("Stored document ownership conflicts with its write context.");
    }
    return current?.kind === "application" ? current : { kind: "application", applicationId: contextAppId };
  }

  if (requested) {
    if (requested.kind === "application") {
      if (draftAppId !== undefined && normalizeBundleIdentifier(draftAppId) !== normalizeBundleIdentifier(requested.applicationId)) {
        throw new SynCloudOSDocumentStorePayloadError("Document draft ownership does not match its application ID.");
      }
      if (existingAppId !== undefined && normalizeBundleIdentifier(existingAppId) !== normalizeBundleIdentifier(requested.applicationId)) {
        throw new SynCloudOSDocumentStorePayloadError("Document draft ownership conflicts with the stored application ID.");
      }
    } else if (draftAppId !== undefined || existingAppId !== undefined) {
      throw new SynCloudOSDocumentStorePayloadError("System-owned documents must not declare an application ID.");
    }
    if (current && ownershipKey(current) !== ownershipKey(requested)) {
      throw new SynCloudOSDocumentStorePayloadError("Document draft ownership conflicts with the stored document.");
    }
    return requested;
  }

  if (current) {
    if (current.kind === "application") {
      if ((draftAppId ?? existingAppId) !== undefined && normalizeBundleIdentifier(draftAppId ?? existingAppId) !== normalizeBundleIdentifier(current.applicationId)) {
        throw new SynCloudOSDocumentStorePayloadError("Document draft ownership conflicts with the stored document.");
      }
    } else if (draftAppId !== undefined || existingAppId !== undefined) {
      throw new SynCloudOSDocumentStorePayloadError("System-owned documents must not declare an application ID.");
    }
    return current;
  }

  return draftAppId === undefined
    ? { kind: "system" }
    : { kind: "application", applicationId: draftAppId };
}

export function throwIfDocumentStoreAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new DOMException("The operation was aborted.", "AbortError");
}

function operationFingerprint(value: unknown): string {
  try {
    return canonicalDocumentJson(omitUndefinedObjectProperties(value), "document-store");
  } catch (error) {
    throw new SynCloudOSDocumentStorePayloadError(
      error instanceof Error ? error.message : "DocumentStore payload must be bounded acyclic JSON.",
      error,
    );
  }
}

function omitUndefinedObjectProperties(value: unknown): unknown {
  if (Array.isArray(value)) {
    const result: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor)) {
        throw new TypeError("DocumentStore arrays must be dense data-property arrays.");
      }
      result.push(omitUndefinedObjectProperties(descriptor.value));
    }
    for (const key of Reflect.ownKeys(value)) {
      if (key === "length") continue;
      if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
        throw new TypeError("DocumentStore arrays must contain only indexed JSON values.");
      }
    }
    return result;
  }
  if (!value || typeof value !== "object") return value;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  const entries: [string, unknown][] = [];
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw new TypeError("DocumentStore objects must not contain symbol properties.");
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!("value" in descriptor) || !descriptor.enumerable) {
      throw new TypeError("DocumentStore values must use enumerable data properties, not accessors.");
    }
    if (descriptor.value !== undefined) {
      entries.push([key, omitUndefinedObjectProperties(descriptor.value)]);
    }
  }
  return Object.fromEntries(entries);
}

function deterministicEtag(input: { readonly documentId: string; readonly sequence: number; readonly savedAt: string; readonly document: SynCloudOSDocument }): string {
  const source = operationFingerprint(omitUndefinedObjectProperties(input));
  let hash = 2_166_136_261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `"${(hash >>> 0).toString(16).padStart(8, "0")}"`;
}

function cloneKindMetadata<TDocument extends SynCloudOSDocument>(metadata: SynCloudOSDocumentKindMetadata<TDocument>): SynCloudOSDocumentKindMetadata<TDocument> {
  return {
    ...metadata,
    indexes: metadata.indexes?.map((index) => ({
      ...index,
      fields: [...index.fields]
    })),
    permissions: metadata.permissions
      ? Object.fromEntries(
          Object.entries(metadata.permissions).map(([operation, permission]) => [
            operation,
            permission
              ? {
                  ...permission,
                  requiredCapabilities: permission.requiredCapabilities ? [...permission.requiredCapabilities] : undefined,
                  requiredRoles: permission.requiredRoles ? [...permission.requiredRoles] : undefined
                }
              : permission
          ])
        ) as SynCloudOSDocumentKindMetadata<TDocument>["permissions"]
      : undefined,
    migrations: metadata.migrations ? [...metadata.migrations] : undefined
  };
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toDate(value: Date | number | string | undefined) {
  if (typeof value === "undefined") return new Date();
  return value instanceof Date ? value : new Date(value);
}

function toIso(value: Date | number | string | undefined) {
  return toDate(value).toISOString();
}

function toTime(value: Date | number | string | undefined) {
  return toDate(value).getTime();
}

function isDraftState(document: SynCloudOSDocument, query: SynCloudOSDraftDocumentQuery = {}) {
  if (document.publishState === "draft") return true;
  if (document.publishState === "scheduled") return query.includeScheduled !== false;
  if (document.publishState === "archived") return query.includeArchived === true;
  return false;
}

function isPublishedState(document: SynCloudOSDocument, query: SynCloudOSPublishedDocumentQuery | SynCloudOSDocumentSlugResolveOptions = {}) {
  if (document.publishState === "published") return true;
  if (document.publishState === "unlisted") return query.includeUnlisted === true;
  if (document.publishState === "scheduled" && document.scheduledFor) {
    return Date.parse(document.scheduledFor) <= toTime(query.now);
  }
  return false;
}

function applyPaging<T>(items: T[], query: { limit?: number; offset?: number } = {}) {
  const offset = Math.max(0, query.offset ?? 0);
  const limit = typeof query.limit === "number" ? Math.max(0, query.limit) : undefined;
  return typeof limit === "number" ? items.slice(offset, offset + limit) : items.slice(offset);
}

function referenceParts(reference: SynCloudOSDocumentReference) {
  if (typeof reference === "string") {
    return { id: reference, slug: reference };
  }
  return reference;
}

function sortByUpdatedDescending(left: SynCloudOSDocument, right: SynCloudOSDocument) {
  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
}

function sortPublishedDescending(left: SynCloudOSDocument, right: SynCloudOSDocument) {
  const leftTime = Date.parse(left.publishedAt ?? left.updatedAt);
  const rightTime = Date.parse(right.publishedAt ?? right.updatedAt);
  return rightTime - leftTime;
}

function getPathValue(source: unknown, path: string) {
  return path.split(".").reduce<unknown>((value, part) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[part];
  }, source);
}

function createIndexKey(document: SynCloudOSDocument, index: SynCloudOSDocumentIndexDefinition) {
  const values = index.fields.map((field) => getPathValue(document, field));
  if (index.sparse && values.some((value) => value === undefined || value === null || value === "")) return null;
  return values.map((value) => JSON.stringify(value ?? null)).join("\u0000");
}

export class SynCloudOSInMemoryDocumentStore implements SynCloudOSDocumentStoreAdapter {
  readonly supportsAtomicConditionalWrites = true;
  private readonly documents = new Map<string, SynCloudOSDocument>();
  private readonly revisions = new Map<string, SynCloudOSDocumentRevision[]>();
  private readonly kinds = new Map<string, SynCloudOSDocumentKindMetadata>();
  private readonly draftVersions = new Map<string, readonly SynCloudOSDocument[]>();
  private readonly idempotentDraftWrites = new Map<string, SynCloudOSDocumentStoreIdempotencyEntry>();
  private readonly events: NonNullable<SynCloudOSInMemoryDocumentStoreOptions["events"]>;
  private readonly authoriseRequest?: SynCloudOSInMemoryDocumentStoreOptions["authorise"];
  private readonly clock: () => Date;
  private readonly etag: NonNullable<SynCloudOSInMemoryDocumentStoreOptions["etag"]>;

  constructor(options: SynCloudOSInMemoryDocumentStoreOptions = {}) {
    this.events = options.events ?? { publish: () => undefined };
    this.authoriseRequest = options.authorise;
    this.clock = options.clock ?? (() => new Date());
    this.etag = options.etag ?? deterministicEtag;
    for (const kind of options.kinds ?? []) {
      this.registerKind(kind, { emitEvent: false });
    }

    for (const document of options.documents ?? []) {
      const cloned = clonePlain(document);
      assertCanonicalDocumentOwnership(cloned, `Document ${cloned.id}`);
      this.documents.set(cloned.id, cloned);
    }

    for (const revision of options.revisions ?? []) {
      const cloned = clonePlain(revision);
      assertCanonicalOwnership(cloned.ownership, `Revision ${cloned.id} ownership`);
      assertCanonicalDocumentOwnership(cloned.snapshot, `Revision ${cloned.id} snapshot`);
      if (cloned.snapshot.id !== cloned.documentId ||
        cloned.snapshot.kind !== cloned.kind ||
        cloned.snapshot.version !== cloned.version ||
        ownershipKey(cloned.snapshot.ownership) !== ownershipKey(cloned.ownership)) {
        throw new SynCloudOSDocumentStorePayloadError(`Revision ${cloned.id} does not consistently identify document ${cloned.documentId}.`);
      }
      const revisions = this.revisions.get(cloned.documentId) ?? [];
      revisions.push(cloned);
      this.revisions.set(cloned.documentId, revisions);
    }

    for (const entry of options.draftVersions ?? []) {
      for (const document of entry.documents) {
        assertCanonicalDocumentOwnership(document, `Draft version ${entry.documentId}`);
        if (document.id !== entry.documentId) {
          throw new SynCloudOSDocumentStorePayloadError(`Draft-version entry ${entry.documentId} contains another document ID.`);
        }
      }
      this.draftVersions.set(entry.documentId, Object.freeze(entry.documents.map(clonePlain)));
    }
    for (const entry of options.idempotentDraftWrites ?? []) {
      if (entry.document) assertCanonicalDocumentOwnership(entry.document, `Idempotency entry ${entry.key}`);
      this.idempotentDraftWrites.set(entry.key, clonePlain(entry));
    }

    for (const kind of this.kinds.keys()) {
      this.migrateStoredDocuments(kind);
    }
  }

  registerKind<TDocument extends SynCloudOSDocument>(
    metadata: SynCloudOSDocumentKindMetadata<TDocument>,
    options: SynCloudOSDocumentKindRegistrationOptions = {},
  ) {
    const cloned = cloneKindMetadata(metadata);
    this.kinds.set(cloned.kind, cloned as SynCloudOSDocumentKindMetadata);
    this.migrateStoredDocuments(cloned.kind);
    if (options.emitEvent !== false) {
      this.events.publish("documentStore.kind.register", { kind: cloned.kind, version: cloned.version }, cloned.displayName);
    }
    return cloned;
  }


  getKind(kind: string) {
    const metadata = this.kinds.get(kind);
    return metadata ? cloneKindMetadata(metadata) : null;
  }

  listKinds() {
    return Array.from(this.kinds.values()).map(cloneKindMetadata);
  }

  /**
   * @internal A store over this store's records. Stored records are never
   * mutated in place (every write stores a new object), so the copy shares
   * them: creating it costs a pointer per record, not a clone. A mutation run
   * on the fork can be discarded without disturbing this store.
   */
  fork(): SynCloudOSInMemoryDocumentStore {
    const fork = new SynCloudOSInMemoryDocumentStore({
      events: this.events,
      authorise: this.authoriseRequest,
      clock: this.clock,
      etag: this.etag,
    });
    for (const [key, value] of this.kinds) fork.kinds.set(key, value);
    for (const [key, value] of this.documents) fork.documents.set(key, value);
    for (const [key, value] of this.revisions) fork.revisions.set(key, value);
    for (const [key, value] of this.draftVersions) fork.draftVersions.set(key, value);
    for (const [key, value] of this.idempotentDraftWrites) fork.idempotentDraftWrites.set(key, value);
    return fork;
  }

  /**
   * @internal The exportSnapshot shape over the stored records themselves,
   * for immediate serialisation. Never retain or mutate the result.
   */
  serialisableSnapshot(): SynCloudOSDocumentStoreSnapshot {
    return {
      schemaVersion: 2,
      savedAt: this.clock().toISOString(),
      kinds: this.listKinds(),
      documents: Array.from(this.documents.values()),
      revisions: Array.from(this.revisions.values()).flat(),
      draftVersions: Array.from(this.draftVersions, ([documentId, documents]) => ({ documentId, documents: [...documents] })),
      idempotentDraftWrites: Array.from(this.idempotentDraftWrites.values()),
    };
  }

  exportSnapshot(): SynCloudOSDocumentStoreSnapshot {
    return {
      schemaVersion: 2,
      savedAt: this.clock().toISOString(),
      kinds: this.listKinds(),
      documents: Array.from(this.documents.values()).map(clonePlain),
      revisions: Array.from(this.revisions.values()).flat().map(clonePlain),
      draftVersions: Array.from(this.draftVersions, ([documentId, documents]) => ({
        documentId,
        documents: documents.map(clonePlain),
      })),
      idempotentDraftWrites: Array.from(this.idempotentDraftWrites.values()).map(clonePlain),
    };
  }

  async readPublished(reference: SynCloudOSDocumentReference, context: SynCloudOSDocumentStoreContext = {}) {
    throwIfDocumentStoreAborted(context.signal);
    const document = this.findByReference(reference);
    this.authorise("readPublished", document?.kind ?? referenceParts(reference).kind, context, document?.id);
    if (!document || !isPublishedState(document)) return null;
    return clonePlain(document);
  }

  async listPublished(query: SynCloudOSPublishedDocumentQuery = {}, context: SynCloudOSDocumentStoreContext = {}) {
    throwIfDocumentStoreAborted(context.signal);
    this.authorise("listPublished", query.kind, context);
    const tags = query.tags ?? [];
    const documents = Array.from(this.documents.values())
      .filter((document) => !query.kind || document.kind === query.kind)
      .filter((document) => isPublishedState(document, query))
      .filter((document) => tags.every((tag) => document.tags?.includes(tag)))
      .sort(sortPublishedDescending);

    return applyPaging(documents, query).map(clonePlain);
  }

  async listDrafts(query: SynCloudOSDraftDocumentQuery = {}, context: SynCloudOSDocumentStoreContext = {}) {
    throwIfDocumentStoreAborted(context.signal);
    this.authorise("listDrafts", query.kind, context);
    const documents = Array.from(this.documents.values())
      .filter((document) => !query.kind || document.kind === query.kind)
      .filter((document) => !context.appId || normalizeBundleIdentifier(document.applicationId) === normalizeBundleIdentifier(context.appId))
      .filter((document) => !query.ownerId || document.ownerId === query.ownerId)
      .filter((document) => isDraftState(document, query))
      .sort(sortByUpdatedDescending);

    return applyPaging(documents, query).map(clonePlain);
  }

  async getDraft(documentId: string, context: SynCloudOSDocumentStoreContext = {}) {
    throwIfDocumentStoreAborted(context.signal);
    const document = this.documents.get(documentId) ?? null;
    this.authorise("getDraft", document?.kind, context, documentId);
    if (!document || !isDraftState(document) || (context.appId && normalizeBundleIdentifier(document.applicationId) !== normalizeBundleIdentifier(context.appId))) return null;
    return clonePlain(document);
  }

  async saveDraft<TBody = unknown, TMetadata extends Record<string, unknown> = Record<string, unknown>>(
    draft: SynCloudOSDocumentDraftInput<TBody, TMetadata>,
    context: SynCloudOSDocumentStoreContext = {},
    options: DocumentStoreWriteOptions = {},
  ) {
    throwIfDocumentStoreAborted(options.signal ?? context.signal);
    if (options.ifMatch !== undefined && !draft.id) {
      throw new TypeError("Conditional DocumentStore writes require a document ID.");
    }
    const fingerprint = operationFingerprint({ operation: "saveDraft", draft, ifMatch: options.ifMatch });
    const repeated = options.idempotencyKey ? this.idempotentDraftWrites.get(options.idempotencyKey) : undefined;
    if (repeated) {
      if (repeated.operation !== "saveDraft" || repeated.fingerprint !== fingerprint || !repeated.document) {
        throw new SynCloudOSDocumentStoreIdempotencyConflictError(options.idempotencyKey!);
      }
      if (context.appId && normalizeBundleIdentifier(repeated.document.applicationId) !== normalizeBundleIdentifier(context.appId)) {
        throw new SynCloudOSDocumentStoreNotFoundError(repeated.document.id);
      }
      return clonePlain(repeated.document) as SynCloudOSDocument<TBody, TMetadata> & { readonly storageVersion: DocumentStoreVersion };
    }
    this.authorise("saveDraft", draft.kind, context, draft.id);
    const document = this.normaliseDraft(draft as DocumentDraftInput, context) as SynCloudOSDocument<TBody, TMetadata>;
    const migrated = this.applyMigrations(document as SynCloudOSDocument) as SynCloudOSDocument<TBody, TMetadata>;
    const current = this.documents.get(migrated.id) ?? null;
    if (context.appId && current && normalizeBundleIdentifier(current.applicationId) !== normalizeBundleIdentifier(context.appId)) {
      throw new SynCloudOSDocumentStoreNotFoundError(migrated.id);
    }
    if (options.ifMatch === null && current) {
      throw new SynCloudOSDocumentStoreVersionConflictError(migrated.id, null, clonePlain(current));
    }
    if (typeof options.ifMatch === "string" && current?.storageVersion?.etag !== options.ifMatch) {
      throw new SynCloudOSDocumentStoreVersionConflictError(migrated.id, options.ifMatch, current ? clonePlain(current) : null);
    }
    this.enforceUniqueIndexes(migrated as SynCloudOSDocument);
    const savedAt = context.now === undefined ? this.clock().toISOString() : toIso(context.now);
    const sequence = (current?.storageVersion?.sequence ?? 0) + 1;
    const versionInput = { ...migrated, updatedAt: savedAt };
    const saved = {
      ...versionInput,
      storageVersion: {
        id: `${migrated.id}:${sequence}`,
        sequence,
        savedAt,
        etag: this.etag({ documentId: migrated.id, sequence, savedAt, document: versionInput }),
      },
    } as SynCloudOSDocument<TBody, TMetadata> & { readonly storageVersion: DocumentStoreVersion };
    const stored = clonePlain(saved);
    this.documents.set(saved.id, stored);
    this.draftVersions.set(saved.id, Object.freeze([...(this.draftVersions.get(saved.id) ?? []), clonePlain(stored)]));
    if (options.idempotencyKey) {
      this.idempotentDraftWrites.set(options.idempotencyKey, {
        key: options.idempotencyKey,
        fingerprint,
        operation: "saveDraft",
        document: clonePlain(stored),
      });
    }
    this.events.publish("documentStore.draft.save", { documentId: saved.id, kind: saved.kind }, saved.title ?? saved.id);
    return clonePlain(stored);
  }

  async listDraftVersions(
    documentId: string,
    context: SynCloudOSDocumentStoreContext = {},
    options: DocumentStoreReadOptions = {},
  ): Promise<readonly DocumentStoreVersion[]> {
    throwIfDocumentStoreAborted(options.signal ?? context.signal);
    const current = this.documents.get(documentId);
    const versions = this.draftVersions.get(documentId) ?? [];
    this.authorise("listDraftVersions", current?.kind ?? versions.at(-1)?.kind, context, documentId);
    if (context.appId && (normalizeBundleIdentifier(current?.applicationId) !== normalizeBundleIdentifier(context.appId) || versions.some((document) => normalizeBundleIdentifier(document.applicationId) !== normalizeBundleIdentifier(context.appId)))) return Object.freeze([]);
    return Object.freeze(versions.flatMap((document) => document.storageVersion ? [clonePlain(document.storageVersion)] : []));
  }

  async readDraftVersion(
    documentId: string,
    versionId: string,
    context: SynCloudOSDocumentStoreContext = {},
    options: DocumentStoreReadOptions = {},
  ): Promise<SynCloudOSDocument | null> {
    throwIfDocumentStoreAborted(options.signal ?? context.signal);
    const versions = this.draftVersions.get(documentId) ?? [];
    const record = versions.find((document) => document.storageVersion?.id === versionId) ?? null;
    this.authorise("readDraftVersion", record?.kind ?? this.documents.get(documentId)?.kind, context, documentId);
    return record && (!context.appId || normalizeBundleIdentifier(record.applicationId) === normalizeBundleIdentifier(context.appId)) ? clonePlain(record) : null;
  }

  async deleteDraft(
    documentId: string,
    context: SynCloudOSDocumentStoreContext = {},
    options: DocumentStoreWriteOptions = {},
  ): Promise<void> {
    throwIfDocumentStoreAborted(options.signal ?? context.signal);
    const fingerprint = operationFingerprint({ operation: "deleteDraft", documentId, ifMatch: options.ifMatch });
    const repeated = options.idempotencyKey ? this.idempotentDraftWrites.get(options.idempotencyKey) : undefined;
    if (repeated) {
      if (repeated.operation !== "deleteDraft" || repeated.fingerprint !== fingerprint) {
        throw new SynCloudOSDocumentStoreIdempotencyConflictError(options.idempotencyKey!);
      }
      return;
    }
    const current = this.documents.get(documentId) ?? null;
    this.authorise("deleteDraft", current?.kind ?? this.draftVersions.get(documentId)?.at(-1)?.kind, context, documentId);
    if (context.appId && current && normalizeBundleIdentifier(current.applicationId) !== normalizeBundleIdentifier(context.appId)) throw new SynCloudOSDocumentStoreNotFoundError(documentId);
    if (options.ifMatch === null && current) {
      throw new SynCloudOSDocumentStoreVersionConflictError(documentId, null, clonePlain(current));
    }
    if (typeof options.ifMatch === "string" && current?.storageVersion?.etag !== options.ifMatch) {
      throw new SynCloudOSDocumentStoreVersionConflictError(documentId, options.ifMatch, current ? clonePlain(current) : null);
    }
    this.documents.delete(documentId);
    if (options.idempotencyKey) {
      this.idempotentDraftWrites.set(options.idempotencyKey, {
        key: options.idempotencyKey,
        fingerprint,
        operation: "deleteDraft",
        document: null,
      });
    }
    this.events.publish("documentStore.draft.delete", { documentId, kind: current?.kind }, current?.title ?? documentId);
  }

  async createRevision(documentId: string, options: SynCloudOSDocumentRevisionOptions = {}, context: SynCloudOSDocumentStoreContext = {}) {
    throwIfDocumentStoreAborted(context.signal);
    const document = this.getStoredDocumentOrThrow(documentId);
    this.authorise("createRevision", document.kind, context, documentId);
    if (context.appId && normalizeBundleIdentifier(document.applicationId) !== normalizeBundleIdentifier(context.appId)) throw new SynCloudOSDocumentStoreNotFoundError(documentId);
    const now = toIso(context.now);
    const revision: SynCloudOSDocumentRevision = {
      id: options.id ?? createId("document-revision"),
      documentId,
      kind: document.kind,
      version: document.version,
      ownership: clonePlain(document.ownership),
      parentRevisionId: options.parentRevisionId ?? document.revisionId,
      createdAt: now,
      authorId: options.authorId ?? context.subject?.user.id,
      label: options.label,
      snapshot: clonePlain(document)
    };
    const revisions = this.revisions.get(documentId) ?? [];
    this.revisions.set(documentId, [...revisions, clonePlain(revision)]);
    this.documents.set(documentId, { ...document, revisionId: revision.id, updatedAt: now });
    this.events.publish("documentStore.revision.create", { documentId, revisionId: revision.id, kind: document.kind }, document.title ?? documentId);
    return clonePlain(revision);
  }

  async publish(documentId: string, options: SynCloudOSDocumentPublishOptions = {}, context: SynCloudOSDocumentStoreContext = {}) {
    throwIfDocumentStoreAborted(context.signal);
    const document = this.getStoredDocumentOrThrow(documentId);
    this.authorise("publish", document.kind, context, documentId);
    if (context.appId && normalizeBundleIdentifier(document.applicationId) !== normalizeBundleIdentifier(context.appId)) throw new SynCloudOSDocumentStoreNotFoundError(documentId);
    if (options.ifMatch !== undefined && options.ifMatch !== document.storageVersion?.etag) {
      throw new SynCloudOSDocumentStoreVersionConflictError(documentId, options.ifMatch, clonePlain(document));
    }
    const now = toIso(context.now);
    const next: SynCloudOSDocument = {
      ...document,
      publishState: options.state ?? "published",
      slug: options.slug ?? document.slug,
      canonicalUrl: options.canonicalUrl ?? document.canonicalUrl,
      publishedAt: options.state === "scheduled" ? document.publishedAt : options.publishedAt ?? document.publishedAt ?? now,
      scheduledFor: options.scheduledFor ?? (options.state === "scheduled" ? document.scheduledFor : undefined),
      updatedAt: now,
      lastEditorId: context.subject?.user.id ?? document.lastEditorId,
      unpublishedAt: undefined,
      deletedAt: undefined,
    };

    if (!next.slug) {
      throw new Error(`DocumentStore publish requires a slug for ${documentId}.`);
    }

    this.enforceUniqueIndexes(next);
    const sequence = (document.storageVersion?.sequence ?? 0) + 1;
    next.storageVersion = {
      id: `${documentId}:${sequence}`, sequence, savedAt: now,
      etag: this.etag({ documentId, sequence, savedAt: now, document: next }),
    };
    this.documents.set(documentId, clonePlain(next));
    this.events.publish("documentStore.publish", { documentId, kind: next.kind, state: next.publishState }, next.title ?? documentId);
    return clonePlain(next);
  }

  async unpublish(documentId: string, options: SynCloudOSDocumentUnpublishOptions = {}, context: SynCloudOSDocumentStoreContext = {}) {
    throwIfDocumentStoreAborted(context.signal);
    const document = this.getStoredDocumentOrThrow(documentId);
    this.authorise("unpublish", document.kind, context, documentId);
    if (context.appId && normalizeBundleIdentifier(document.applicationId) !== normalizeBundleIdentifier(context.appId)) throw new SynCloudOSDocumentStoreNotFoundError(documentId);
    if (options.ifMatch !== undefined && options.ifMatch !== document.storageVersion?.etag) {
      throw new SynCloudOSDocumentStoreVersionConflictError(documentId, options.ifMatch, clonePlain(document));
    }
    const now = toIso(context.now);
    const next: SynCloudOSDocument = {
      ...document,
      publishState: options.state ?? "draft",
      unpublishedAt: options.unpublishedAt ?? now,
      updatedAt: now,
      lastEditorId: context.subject?.user.id ?? document.lastEditorId
    };
    this.enforceUniqueIndexes(next);
    const sequence = (document.storageVersion?.sequence ?? 0) + 1;
    next.storageVersion = {
      id: `${documentId}:${sequence}`, sequence, savedAt: now,
      etag: this.etag({ documentId, sequence, savedAt: now, document: next }),
    };
    this.documents.set(documentId, clonePlain(next));
    this.events.publish("documentStore.unpublish", { documentId, kind: next.kind, state: next.publishState }, next.title ?? documentId);
    return clonePlain(next);
  }

  async resolveSlug(slug: string, options: SynCloudOSDocumentSlugResolveOptions = {}, context: SynCloudOSDocumentStoreContext = {}) {
    throwIfDocumentStoreAborted(context.signal);
    this.authorise("resolveSlug", options.kind, context);
    const document = Array.from(this.documents.values())
      .filter((candidate) => !options.kind || candidate.kind === options.kind)
      .find((candidate) => candidate.slug === slug && isPublishedState(candidate, options));
    return document ? clonePlain(document) : null;
  }

  async attachMedia(documentId: string, media: SynCloudOSDocumentMediaAttachment, context: SynCloudOSDocumentStoreContext = {}) {
    throwIfDocumentStoreAborted(context.signal);
    const document = this.getStoredDocumentOrThrow(documentId);
    this.authorise("attachMedia", document.kind, context, documentId);
    if (context.appId && normalizeBundleIdentifier(document.applicationId) !== normalizeBundleIdentifier(context.appId)) throw new SynCloudOSDocumentStoreNotFoundError(documentId);
    const now = toIso(context.now);
    const existingMedia = document.media ?? [];
    const next: SynCloudOSDocument = {
      ...document,
      media: [...existingMedia.filter((item) => item.assetId !== media.assetId), clonePlain(media)],
      updatedAt: now,
      lastEditorId: context.subject?.user.id ?? document.lastEditorId
    };
    this.enforceUniqueIndexes(next);
    this.documents.set(documentId, clonePlain(next));
    this.events.publish("documentStore.media.attach", { documentId, kind: next.kind, assetId: media.assetId }, next.title ?? documentId);
    return clonePlain(next);
  }
  private normaliseDraft(draft: DocumentDraftInput, context: SynCloudOSDocumentStoreContext) {
    const now = toIso(context.now);
    const existing = draft.id ? this.documents.get(draft.id) : undefined;
    const metadata = this.kinds.get(draft.kind);
    const ownership = resolveDocumentOwnership(draft, existing, context);
    const requestedState = draft.publishState ?? existing?.publishState ?? "draft";
    const publishState = requestedState === "published" || requestedState === "unlisted" ? "draft" : requestedState;
    const next = {
      ...existing,
      ...clonePlain(draft),
      applicationId: ownership.kind === "application" ? ownership.applicationId : undefined,
      ownership,
      id: draft.id ?? createId("document"),
      kind: draft.kind,
      version: draft.version ?? existing?.version ?? metadata?.version ?? 1,
      tags: [...(draft.tags ?? existing?.tags ?? [])],
      media: clonePlain(draft.media ?? existing?.media ?? []),
      metadata: clonePlain(draft.metadata ?? existing?.metadata ?? {}),
      publishState,
      createdAt: draft.createdAt ?? existing?.createdAt ?? now,
      updatedAt: now,
      ownerId: draft.ownerId ?? existing?.ownerId ?? context.subject?.user.id,
      lastEditorId: context.subject?.user.id ?? draft.lastEditorId ?? existing?.lastEditorId
    } satisfies SynCloudOSDocument;
    if (ownership.kind === "system") delete next.applicationId;
    assertCanonicalDocumentOwnership(next, `Document ${next.id}`);
    return next;
  }

  private applyMigrations(document: SynCloudOSDocument) {
    const metadata = this.kinds.get(document.kind);
    if (!metadata?.migrations?.length || document.version >= metadata.version) return document;

    let next = clonePlain(document);
    let guard = 0;
    while (next.version < metadata.version && guard < metadata.migrations.length + 1) {
      const migration = metadata.migrations.find((candidate) => candidate.fromVersion === next.version);
      if (!migration) break;
      next = migration.migrate(clonePlain(next));
      next.version = migration.toVersion;
      guard += 1;
    }
    assertCanonicalDocumentOwnership(next, `Migrated document ${next.id}`);
    return next;
  }

  private migrateStoredDocuments(kind: string) {
    for (const [documentId, document] of this.documents.entries()) {
      if (document.kind !== kind) continue;
      const migrated = this.applyMigrations(document);
      this.enforceUniqueIndexes(migrated, documentId);
      this.documents.set(documentId, clonePlain(migrated));
    }
  }

  private enforceUniqueIndexes(document: SynCloudOSDocument, currentDocumentId = document.id) {
    const metadata = this.kinds.get(document.kind);
    const uniqueIndexes = metadata?.indexes?.filter((index) => index.unique) ?? [];

    for (const index of uniqueIndexes) {
      const documentKey = createIndexKey(document, index);
      if (!documentKey) continue;

      for (const candidate of this.documents.values()) {
        if (candidate.id === currentDocumentId || candidate.kind !== document.kind) continue;
        const candidateKey = createIndexKey(candidate, index);
        if (candidateKey === documentKey) {
          throw new SynCloudOSDocumentStoreIndexError(index.name, document.id, candidate.id);
        }
      }
    }
  }

  private getStoredDocumentOrThrow(documentId: string) {
    const document = this.documents.get(documentId);
    if (!document) throw new SynCloudOSDocumentStoreNotFoundError(documentId);
    return clonePlain(document);
  }

  private findByReference(reference: SynCloudOSDocumentReference) {
    const { id, slug, kind } = referenceParts(reference);
    const documentById = id ? this.documents.get(id) : undefined;
    if (documentById && (!kind || documentById.kind === kind)) return clonePlain(documentById);
    if (!slug) return null;
    const documentBySlug = Array.from(this.documents.values()).find((candidate) => candidate.slug === slug && (!kind || candidate.kind === kind));
    return documentBySlug ? clonePlain(documentBySlug) : null;
  }

  private getPermission(operation: SynCloudOSDocumentStoreOperation, kind?: string) {
    const defaultPermission = operationDefaults[operation];
    const kindPermission = kind ? this.kinds.get(kind)?.permissions?.[operation] : undefined;
    return {
      requiredCapabilities: unique([
        ...(kindPermission?.public ? [] : defaultPermission.requiredCapabilities ?? []),
        ...(kindPermission?.requiredCapabilities ?? [])
      ]),
      requiredRoles: unique([
        ...(kindPermission?.public ? [] : defaultPermission.requiredRoles ?? []),
        ...(kindPermission?.requiredRoles ?? [])
      ])
    };
  }

  private authorise(
    operation: SynCloudOSDocumentStoreOperation,
    kind: string | undefined,
    context: SynCloudOSDocumentStoreContext,
    documentId?: string
  ) {
    const permission = this.getPermission(operation, kind);
    const decision = this.authoriseRequest?.({
      action: `documentStore.${operation}`,
      subject: context.subject,
      ...(context.subjectGrant ? { subjectGrant: context.subjectGrant } : {}),
      origin: context.origin ?? "runtime",
      source: context.source ?? "SynCloudOS.DocumentStore",
      requiredCapabilities: unique([...(permission.requiredCapabilities ?? []), ...(context.requiredCapabilities ?? [])]),
      requiredRoles: unique([...(permission.requiredRoles ?? []), ...(context.requiredRoles ?? [])]),
      context: {
        appId: context.appId,
        kind,
        documentId,
        ...(context.policyContext ?? {})
      }
    });

    if (decision && !decision.allowed) {
      throw new SynCloudOSDocumentStoreAccessError(operation, decision);
    }

    return decision;
  }
}

export function createInMemoryDocumentStore(options: SynCloudOSInMemoryDocumentStoreOptions = {}) {
  return new SynCloudOSInMemoryDocumentStore(options);
}
