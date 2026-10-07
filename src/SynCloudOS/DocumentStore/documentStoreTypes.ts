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

import type { SynCloudOSRole } from "../PermissionManager/permissionTypes";
import type { SynCloudOSPolicyDecision, SynCloudOSPolicySubject, SynCloudOSPolicySubjectGrant } from "../PolicyKit/policyTypes";

export type SynCloudOSDocumentPublishState = "draft" | "scheduled" | "published" | "unlisted" | "archived" | "deleted";

export type SynCloudOSDocumentStoreOperation =
  | "readPublished"
  | "listPublished"
  | "listDrafts"
  | "getDraft"
  | "saveDraft"
  | "listDraftVersions"
  | "readDraftVersion"
  | "deleteDraft"
  | "createRevision"
  | "publish"
  | "unpublish"
  | "resolveSlug"
  | "attachMedia";

export interface SynCloudOSDocumentIndexDefinition {
  name: string;
  fields: string[];
  unique?: boolean;
  sparse?: boolean;
}

export interface SynCloudOSDocumentStorePermission {
  public?: boolean;
  requiredCapabilities?: string[];
  requiredRoles?: SynCloudOSRole[];
}

export interface SynCloudOSDocumentMediaAttachment {
  assetId: string;
  usage: string;
  url?: string;
  altText?: string;
  caption?: string;
  metadata?: Record<string, unknown>;
}

export type SynCloudOSDocumentOwnership =
  | { readonly kind: "system" }
  | { readonly kind: "application"; readonly applicationId: string };

export interface SynCloudOSDocument<TBody = unknown, TMetadata extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  /** Runtime provenance retained by the runtime-owned document facade. */
  runtimeId?: string;
  /** Operational application projection for application-owned documents. */
  applicationId?: string;
  /** Canonical exhaustive ownership. */
  ownership: SynCloudOSDocumentOwnership;
  kind: string;
  version: number;
  title?: string;
  slug?: string;
  canonicalUrl?: string;
  body?: TBody;
  tags?: string[];
  media?: SynCloudOSDocumentMediaAttachment[];
  metadata?: TMetadata;
  publishState: SynCloudOSDocumentPublishState;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  scheduledFor?: string;
  unpublishedAt?: string;
  deletedAt?: string;
  ownerId?: string;
  lastEditorId?: string;
  revisionId?: string;
  storageVersion?: DocumentStoreVersion;
}


export interface DocumentStoreVersion {
  readonly id: string;
  readonly sequence: number;
  readonly etag: string;
  readonly savedAt: string;
}

export interface DocumentStoreWriteOptions {
  readonly ifMatch?: string | null;
  readonly idempotencyKey?: string;
  readonly signal?: AbortSignal;
}

export interface DocumentStoreReadOptions {
  readonly signal?: AbortSignal;
}

export interface SynCloudOSDocumentMigration<TDocument extends SynCloudOSDocument = SynCloudOSDocument> {
  fromVersion: number;
  toVersion: number;
  migrate(document: TDocument): TDocument;
}

export interface SynCloudOSDocumentKindMetadata<TDocument extends SynCloudOSDocument = SynCloudOSDocument> {
  kind: string;
  version: number;
  displayName: string;
  description?: string;
  indexes?: SynCloudOSDocumentIndexDefinition[];
  permissions?: Partial<Record<SynCloudOSDocumentStoreOperation, SynCloudOSDocumentStorePermission>>;
  migrations?: SynCloudOSDocumentMigration<TDocument>[];
}

/** Kernel-only registration controls. Mounted AppSDK projections do not
 * expose kind registration at all; trusted bootstrap can avoid publishing
 * construction-time schema events into the runtime event stream. */
export interface SynCloudOSDocumentKindRegistrationOptions {
  readonly emitEvent?: boolean;
}

export interface SynCloudOSDocumentRevision<TDocument extends SynCloudOSDocument = SynCloudOSDocument> {
  id: string;
  documentId: string;
  kind: string;
  version: number;
  ownership: SynCloudOSDocumentOwnership;
  parentRevisionId?: string;
  createdAt: string;
  authorId?: string;
  label?: string;
  snapshot: TDocument;
}

export type SynCloudOSDocumentDraftInput<TBody = unknown, TMetadata extends Record<string, unknown> = Record<string, unknown>> =
  Partial<Omit<SynCloudOSDocument<TBody, TMetadata>, "kind">> &
  Pick<SynCloudOSDocument<TBody, TMetadata>, "kind">;

export type SynCloudOSDocumentReference = string | {
  id?: string;
  slug?: string;
  kind?: string;
};

export interface SynCloudOSDocumentQuery {
  kind?: string;
  limit?: number;
  offset?: number;
}

export interface SynCloudOSPublishedDocumentQuery extends SynCloudOSDocumentQuery {
  includeUnlisted?: boolean;
  now?: Date | number | string;
  tags?: string[];
}

export interface SynCloudOSDraftDocumentQuery extends SynCloudOSDocumentQuery {
  ownerId?: string;
  includeScheduled?: boolean;
  includeArchived?: boolean;
}

export interface SynCloudOSDocumentStoreContext {
  /** Descriptive; authorisation uses the runtime-derived subject unless the
   * context carries a host-issued `subjectGrant`. */
  subject?: SynCloudOSPolicySubject;
  /** Host authority from PolicyKit.issueSubject. AppSDK callers cannot supply it. */
  subjectGrant?: SynCloudOSPolicySubjectGrant;
  /** Runtime-owned cancellation and namespace signal; AppSDK callers cannot supply it. */
  signal?: AbortSignal;
  origin?: string;
  source?: string;
  now?: Date | number | string;
  appId?: string;
  requiredCapabilities?: string[];
  requiredRoles?: SynCloudOSRole[];
  policyContext?: Record<string, unknown>;
}

export interface SynCloudOSDocumentPublishOptions {
  readonly ifMatch?: string | null;
  state?: Extract<SynCloudOSDocumentPublishState, "published" | "unlisted" | "scheduled">;
  slug?: string;
  canonicalUrl?: string;
  publishedAt?: string;
  scheduledFor?: string;
}

export interface SynCloudOSDocumentUnpublishOptions {
  readonly ifMatch?: string | null;
  state?: Extract<SynCloudOSDocumentPublishState, "draft" | "archived" | "unlisted">;
  unpublishedAt?: string;
}

export interface SynCloudOSDocumentRevisionOptions {
  id?: string;
  parentRevisionId?: string;
  authorId?: string;
  label?: string;
}

export interface SynCloudOSDocumentSlugResolveOptions {
  kind?: string;
  includeUnlisted?: boolean;
  now?: Date | number | string;
}

export interface SynCloudOSDocumentStorePolicyResult {
  operation: SynCloudOSDocumentStoreOperation;
  decision: SynCloudOSPolicyDecision;
}

export interface SynCloudOSDocumentStoreIdempotencyEntry {
  readonly key: string;
  readonly fingerprint: string;
  readonly operation: "saveDraft" | "deleteDraft";
  readonly document: SynCloudOSDocument | null;
}

export interface SynCloudOSDocumentStoreDraftVersions {
  readonly documentId: string;
  readonly documents: SynCloudOSDocument[];
}

export interface SynCloudOSDocumentStoreSnapshot {
  schemaVersion: 2;
  savedAt: string;
  kinds: SynCloudOSDocumentKindMetadata[];
  documents: SynCloudOSDocument[];
  revisions: SynCloudOSDocumentRevision[];
  draftVersions: SynCloudOSDocumentStoreDraftVersions[];
  idempotentDraftWrites: SynCloudOSDocumentStoreIdempotencyEntry[];
}

export interface SynCloudOSDocumentStoreAdapter {
  readonly supportsAtomicConditionalWrites?: boolean;
  registerKind<TDocument extends SynCloudOSDocument>(
    metadata: SynCloudOSDocumentKindMetadata<TDocument>,
    options?: SynCloudOSDocumentKindRegistrationOptions,
  ): SynCloudOSDocumentKindMetadata<TDocument>;
  getKind(kind: string): SynCloudOSDocumentKindMetadata | null;
  listKinds(): SynCloudOSDocumentKindMetadata[];
  readPublished(reference: SynCloudOSDocumentReference, context?: SynCloudOSDocumentStoreContext): Promise<SynCloudOSDocument | null>;
  listPublished(query?: SynCloudOSPublishedDocumentQuery, context?: SynCloudOSDocumentStoreContext): Promise<SynCloudOSDocument[]>;
  listDrafts(query?: SynCloudOSDraftDocumentQuery, context?: SynCloudOSDocumentStoreContext): Promise<SynCloudOSDocument[]>;
  getDraft(documentId: string, context?: SynCloudOSDocumentStoreContext): Promise<SynCloudOSDocument | null>;
  saveDraft<TBody = unknown, TMetadata extends Record<string, unknown> = Record<string, unknown>>(
    draft: SynCloudOSDocumentDraftInput<TBody, TMetadata>,
    context?: SynCloudOSDocumentStoreContext,
    options?: DocumentStoreWriteOptions,
  ): Promise<SynCloudOSDocument<TBody, TMetadata> & { readonly storageVersion: DocumentStoreVersion }>;
  listDraftVersions(
    documentId: string,
    context?: SynCloudOSDocumentStoreContext,
    options?: DocumentStoreReadOptions,
  ): Promise<readonly DocumentStoreVersion[]>;
  readDraftVersion(
    documentId: string,
    versionId: string,
    context?: SynCloudOSDocumentStoreContext,
    options?: DocumentStoreReadOptions,
  ): Promise<SynCloudOSDocument | null>;
  deleteDraft(
    documentId: string,
    context?: SynCloudOSDocumentStoreContext,
    options?: DocumentStoreWriteOptions,
  ): Promise<void>;
  createRevision(documentId: string, options?: SynCloudOSDocumentRevisionOptions, context?: SynCloudOSDocumentStoreContext): Promise<SynCloudOSDocumentRevision>;
  publish(documentId: string, options?: SynCloudOSDocumentPublishOptions, context?: SynCloudOSDocumentStoreContext): Promise<SynCloudOSDocument>;
  unpublish(documentId: string, options?: SynCloudOSDocumentUnpublishOptions, context?: SynCloudOSDocumentStoreContext): Promise<SynCloudOSDocument>;
  resolveSlug(slug: string, options?: SynCloudOSDocumentSlugResolveOptions, context?: SynCloudOSDocumentStoreContext): Promise<SynCloudOSDocument | null>;
  attachMedia(documentId: string, media: SynCloudOSDocumentMediaAttachment, context?: SynCloudOSDocumentStoreContext): Promise<SynCloudOSDocument>;
}
