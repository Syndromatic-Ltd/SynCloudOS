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

import type { SynCloudOSRuntimeEnvironment } from "../Runtime/runtimeInstanceTypes";
import { DocumentSchemaError } from "./DocumentErrors";

export type DocumentLocation =
  | { readonly kind: "memory"; readonly namespace: string; readonly key: string }
  | { readonly kind: "indexed-db"; readonly database: string; readonly store: string; readonly key: string }
  | { readonly kind: "document-store"; readonly documentId: string }
  | { readonly kind: "remote"; readonly url: string };

export interface DocumentVersion {
  readonly id: string;
  readonly sequence: number;
  readonly savedAt: string;
  readonly etag: string;
}

export interface DocumentRecord<TSerialized = unknown> {
  readonly location: DocumentLocation;
  readonly typeId: string;
  readonly schemaVersion: number;
  readonly content: TSerialized;
  readonly version: DocumentVersion;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface DocumentCreationContext {
  readonly typeId: string;
}

export interface DocumentReadContext {
  readonly typeId: string;
  readonly schemaVersion: number;
}

export interface DocumentWriteContext {
  readonly typeId: string;
  readonly schemaVersion: number;
}

export type DocumentMigration = (value: never) => unknown;

export interface DocumentType<TModel, TSerialized = TModel> {
  readonly id: string;
  readonly displayName: string;
  readonly schemaVersion: number;
  readonly extensions: readonly string[];
  readonly mimeTypes: readonly string[];
  readonly creatingApplicationId?: string;
  readonly openingApplicationIds?: readonly string[];
  readonly capabilities: {
    readonly versions: boolean;
    readonly conflicts: boolean;
  };
  readonly requiredAdapterCapabilities?: readonly (
    | "versions"
    | "delete"
    | "watch"
    | "offline"
    | "atomicConditionalWrite"
  )[];
  readonly autosave:
    | "disabled"
    | "immediate"
    | { readonly mode: "debounced"; readonly delayMs: number };
  create(context: DocumentCreationContext): TModel;
  read(serialized: TSerialized, context: DocumentReadContext): TModel;
  write(model: TModel, context: DocumentWriteContext): TSerialized;
  validate(serialized: unknown): serialized is TSerialized;
  readonly migrations?: Readonly<Record<number, DocumentMigration>>;
}

export interface DocumentTypeRegistration {
  dispose(): void;
}

export interface DocumentTypeAdmission {
  readonly type: DocumentType<unknown, unknown>;
  readonly generation: number;
}

/** Opaque runtime-owned reference to one mounted document generation.  The
 * lease is intentionally not a document close authority: observer/undo leases
 * only keep the document reachable while an owner lease represents the mount
 * that created or opened it. */
export interface DocumentReferenceLease {
  readonly documentId: string;
  readonly applicationId: string;
  readonly kind: "owner" | "observer";
  readonly generation: number;
}

export type DocumentState =
  | "loading"
  | "clean"
  | "dirty"
  | "saving"
  | "conflicted"
  | "read-only"
  | "deleted"
  | "closing"
  | "closed";

export interface DocumentWindowAssociation {
  readonly windowControllerId: string;
  readonly role: "primary" | "secondary" | "inspector";
}

export type DocumentCloseReason =
  | "user"
  | "window-control"
  | "window-command"
  | "parent-close"
  | "application-quit"
  | "session-replacement"
  | "runtime-dispose";

export interface DocumentCloseReviewRequest {
  readonly documentId: string;
  readonly displayName: string;
  readonly reason: DocumentCloseReason;
  readonly hasRecoverableAutosave: boolean;
  readonly signal?: AbortSignal;
}

export type DocumentCloseReviewDecision = "save" | "discard" | "cancel";

export interface DocumentCloseReviewer {
  review(request: DocumentCloseReviewRequest): Promise<DocumentCloseReviewDecision>;
}

export interface DocumentConflict<TModel> {
  readonly base: DocumentRecord<unknown> | null;
  readonly localModel: TModel;
  readonly remote: DocumentRecord<unknown> | null;
  readonly remoteState?: "deleted" | "read-only";
  readonly detectedAt: string;
}

export type DocumentConflictResolution<TModel> =
  | { readonly kind: "use-local"; readonly expectedRemoteVersion: DocumentVersion }
  | { readonly kind: "use-remote" }
  | { readonly kind: "recreate" }
  | {
      readonly kind: "merge";
      readonly model: TModel;
      readonly expectedRemoteVersion: DocumentVersion;
    };

export interface DocumentConflictReviewRequest {
  readonly documentId: string;
  readonly displayName: string;
  readonly conflict: DocumentConflict<unknown>;
  readonly availableDecisions: readonly ("use-local" | "use-remote" | "recreate" | "merge" | "cancel")[];
}

export type DocumentConflictReviewDecision<TModel = unknown> =
  | { readonly kind: "use-local"; readonly expectedRemoteVersion: DocumentVersion }
  | { readonly kind: "use-remote" }
  | { readonly kind: "recreate" }
  | { readonly kind: "merge"; readonly model: TModel; readonly expectedRemoteVersion: DocumentVersion }
  | { readonly kind: "cancel" };

export interface DocumentConflictReviewer {
  review(request: DocumentConflictReviewRequest): Promise<DocumentConflictReviewDecision>;
}

export type DocumentRuntimeEnvironment = Pick<
  SynCloudOSRuntimeEnvironment,
  "now" | "randomUUID" | "setTimeout" | "clearTimeout"
>;

export interface SaveDocumentOptions {
  readonly reason: "explicit" | "autosave" | "close" | "conflict-resolution";
  readonly signal?: AbortSignal;
}

/** Exact runtime-local authority for one application membership mutation. */
export interface ApplicationSessionMutationTicket {
  readonly applicationId: string;
  readonly epoch: number;
  readonly token: string;
}

/** Exact runtime-local lease which freezes one application's document/window membership. */
export interface ApplicationSessionCloseLease {
  readonly applicationId: string;
  readonly epoch: number;
  readonly token: string;
}

export interface NewDocumentRequest<TModel> {
  readonly documentId?: string;
  readonly typeId: string;
  readonly location?: DocumentLocation;
  readonly applicationId?: string;
  readonly initialModel?: TModel;
  readonly activate?: boolean;
  readonly signal?: AbortSignal;
}

/**
 * Kernel-owned semantic role of a document. Only the projection creation
 * path may mint `"projection"`; every other construction path yields
 * `"standard"`. The marker is immutable for the life of the document and is
 * never accepted from restoration input, snapshots, or caller requests.
 */
export type DocumentKind = "standard" | "projection";

/**
 * Creation request for a read-only, non-dirty projection document. There is
 * deliberately no location (projections are never saved) and no kind field
 * (the path itself is the declaration).
 */
export interface NewProjectionDocumentRequest<TModel> {
  readonly documentId?: string;
  readonly typeId: string;
  readonly applicationId?: string;
  readonly initialModel: TModel;
  readonly activate?: boolean;
  readonly signal?: AbortSignal;
}

export interface OpenDocumentRequest {
  readonly documentId?: string;
  readonly typeId: string;
  readonly location: DocumentLocation;
  readonly applicationId?: string;
  readonly activate?: boolean;
  readonly signal?: AbortSignal;
}

export type DocumentImportSource =
  | { readonly kind: "text"; readonly text: string; readonly mediaType: string }
  | { readonly kind: "bytes"; readonly bytes: Uint8Array; readonly mediaType: string };

export interface ImportDocumentRequest<TSerialized> {
  readonly typeId: string;
  readonly source: DocumentImportSource;
  readonly decode: (
    source: DocumentImportSource,
    context: DocumentReadContext,
  ) => TSerialized | Promise<TSerialized>;
  readonly destination: DocumentLocation;
  readonly applicationId?: string;
  readonly activate?: boolean;
  readonly signal?: AbortSignal;
}

export type DocumentDestinationConflictPolicy =
  | { readonly kind: "fail-if-exists" }
  | { readonly kind: "replace"; readonly expectedVersion: DocumentVersion };

export interface SaveAsDocumentRequest {
  readonly documentId: string;
  readonly destination: DocumentLocation;
  readonly conflict?: DocumentDestinationConflictPolicy;
  readonly signal?: AbortSignal;
}

export interface SaveAsDocumentResult {
  readonly documentId: string;
  readonly previousLocation: DocumentLocation | null;
  readonly location: DocumentLocation;
  readonly version: DocumentVersion;
}

export interface MoveDocumentRequest extends SaveAsDocumentRequest {
  readonly expectedSourceVersion: DocumentVersion;
}

export type MoveDocumentResult =
  | (SaveAsDocumentResult & { readonly outcome: "moved" })
  | (SaveAsDocumentResult & {
      readonly outcome: "copied-source-retained";
      readonly sourceRemovalError: import("./DocumentErrors").DocumentError;
    });

export interface RecentDocument {
  readonly id: string;
  readonly typeId: string;
  readonly location: DocumentLocation;
  readonly lastOpenedAt: string;
}

export type DocumentCloseResult =
  | { readonly outcome: "closed"; readonly documentId: string }
  | { readonly outcome: "cancelled"; readonly documentId: string }
  | { readonly outcome: "refused"; readonly documentId: string; readonly reason: DocumentCloseRefusalReason };

export type DocumentCloseRefusalReason = "presentation-coordinator-unavailable" | "storage-transaction-unavailable" | "editing-refused" | "editing-revoked";

export type DocumentClosePreparation =
  | { readonly status: "cancelled"; readonly documentId: string }
  | { readonly status: "refused"; readonly documentId: string; readonly reason: DocumentCloseRefusalReason }
  | {
      readonly status: "ready";
      readonly token: string;
      readonly documentId: string;
      readonly reason: DocumentCloseReason;
      readonly dirtyRevision: number;
      readonly decision: "clean" | "save" | "discard";
      readonly saveTarget:
        | { readonly kind: "current-location" }
        | { readonly kind: "save-as"; readonly destination: DocumentLocation; readonly conflict?: DocumentDestinationConflictPolicy }
        | null;
    };

export interface DocumentPresentationCloseRequest {
  readonly documentId: string;
  readonly associations: readonly DocumentWindowAssociation[];
  readonly reason: DocumentCloseReason;
  readonly signal?: AbortSignal;
}

export type DocumentPresentationClosePreparation =
  | { readonly status: "cancelled"; readonly reason: string }
  | { readonly status: "ready"; readonly token: string; readonly documentId: string; readonly associationIds: readonly string[] };

export interface DocumentPresentationCloseSetRequest {
  readonly documents: readonly {
    readonly documentId: string;
    readonly associations: readonly DocumentWindowAssociation[];
  }[];
  /** Optional complete presentation roots selected by the presentation owner.
   * This lets an application close reserve non-document ancestors together
   * with the selected document presentations. */
  readonly presentationRootIds?: readonly string[];
  readonly reason: DocumentCloseReason;
  readonly signal?: AbortSignal;
}

export type DocumentPresentationCloseSetPreparation =
  | { readonly status: "cancelled"; readonly reason: string }
  | {
      readonly status: "ready";
      readonly token: string;
      readonly documentIds: readonly string[];
      readonly associationIdsByDocument: Readonly<Record<string, readonly string[]>>;
    };

export type DocumentCloseSetPreparation =
  | { readonly status: "cancelled"; readonly documentId: string }
  | { readonly status: "refused"; readonly documentId: string; readonly reason: DocumentCloseRefusalReason }
  | {
      readonly status: "ready";
      readonly token: string;
      readonly documentIds: readonly string[];
      readonly reason: DocumentCloseReason;
    };

export type CloseAllDocumentsResult =
  | { readonly outcome: "closed"; readonly closedDocumentIds: readonly string[] }
  | {
      readonly outcome: "cancelled";
      readonly cancelledDocumentId: string;
      readonly closedDocumentIds: readonly string[];
      readonly remainingDocumentIds: readonly string[];
    }
  | {
      readonly outcome: "refused";
      readonly refusedDocumentId: string;
      readonly reason: DocumentCloseRefusalReason;
      readonly closedDocumentIds: readonly [];
      readonly remainingDocumentIds: readonly string[];
    };

export interface DocumentCloseReviewerRegistration { dispose(): void }
export interface DocumentConflictReviewerRegistration { dispose(): void }
export interface DocumentSaveDestinationProviderRegistration { dispose(): void }
export interface DocumentPresentationCloseCoordinatorRegistration { dispose(): void }

export interface DocumentSaveDestinationProvider {
  chooseDestination(request: {
    readonly documentId: string;
    readonly displayName: string;
    readonly currentLocation: DocumentLocation | null;
    readonly reason: "save" | "save-as" | "move";
    readonly signal?: AbortSignal;
  }): Promise<{ readonly destination: DocumentLocation; readonly conflict?: DocumentDestinationConflictPolicy } | null>;
}

function requireNonEmpty(value: string, field: string): string {
  if (!value.trim()) throw new TypeError(`${field} must not be empty.`);
  return value;
}

export function canonicalDocumentLocation(location: DocumentLocation): string {
  switch (location.kind) {
    case "memory":
      return JSON.stringify(["memory", requireNonEmpty(location.namespace, "namespace"), requireNonEmpty(location.key, "key")]);
    case "indexed-db":
      return JSON.stringify([
        "indexed-db",
        requireNonEmpty(location.database, "database"),
        requireNonEmpty(location.store, "store"),
        requireNonEmpty(location.key, "key"),
      ]);
    case "document-store":
      return JSON.stringify(["document-store", requireNonEmpty(location.documentId, "documentId")]);
    case "remote": {
      const url = new URL(location.url);
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new TypeError("Remote document locations require an HTTP(S) URL.");
      }
      url.hash = "";
      return JSON.stringify(["remote", url.href]);
    }
  }
}

export function documentVersionsEqual(
  left: DocumentVersion | null,
  right: DocumentVersion | null,
): boolean {
  return left === right || Boolean(
    left && right && left.id === right.id && left.sequence === right.sequence &&
    left.savedAt === right.savedAt && left.etag === right.etag,
  );
}

export interface DocumentValueLimits {
  readonly maxDepth?: number;
  readonly maxNodes?: number;
  readonly maxBytes?: number;
}

const defaultDocumentValueLimits = Object.freeze({ maxDepth: 64, maxNodes: 100_000, maxBytes: 4 * 1024 * 1024 });

function failDocumentValue(typeId: string, message: string): never {
  throw new DocumentSchemaError(typeId, message);
}

export function canonicalDocumentJson(
  value: unknown,
  typeId = "document.value",
  limits: DocumentValueLimits = {},
): string {
  const maxDepth = limits.maxDepth ?? defaultDocumentValueLimits.maxDepth;
  const maxNodes = limits.maxNodes ?? defaultDocumentValueLimits.maxNodes;
  const maxBytes = limits.maxBytes ?? defaultDocumentValueLimits.maxBytes;
  const seen = new Set<object>();
  let nodes = 0;
  const visit = (candidate: unknown, depth: number): unknown => {
    nodes += 1;
    if (nodes > maxNodes) failDocumentValue(typeId, `Document value exceeds the ${maxNodes} node limit.`);
    if (depth > maxDepth) failDocumentValue(typeId, `Document value exceeds the ${maxDepth} level depth limit.`);
    if (candidate === null || typeof candidate === "string" || typeof candidate === "boolean") return candidate;
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate)) failDocumentValue(typeId, "Document numbers must be finite.");
      if (Object.is(candidate, -0)) failDocumentValue(typeId, "Document numbers must not use negative zero.");
      return candidate;
    }
    if (typeof candidate !== "object") failDocumentValue(typeId, "Document values must contain only JSON data.");
    if (seen.has(candidate)) failDocumentValue(typeId, "Document values must be acyclic.");
    seen.add(candidate);
    let result: unknown;
    if (Array.isArray(candidate)) {
      if (candidate.length > maxNodes) {
        failDocumentValue(typeId, `Document array exceeds the ${maxNodes} element limit.`);
      }
      const entries: unknown[] = [];
      for (let index = 0; index < candidate.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(candidate, String(index));
        if (!descriptor) {
          failDocumentValue(typeId, "Document arrays must not be sparse.");
        }
        if (!("value" in descriptor) || !descriptor.enumerable) {
          failDocumentValue(typeId, "Document arrays must use enumerable data properties.");
        }
        entries.push(visit(descriptor.value, depth + 1));
      }
      for (const key of Reflect.ownKeys(candidate)) {
        if (key === "length") continue;
        if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= candidate.length) {
          failDocumentValue(typeId, "Document arrays must contain only indexed JSON elements.");
        }
      }
      result = entries;
    } else {
      const prototype = Object.getPrototypeOf(candidate);
      if (prototype !== Object.prototype && prototype !== null) {
        failDocumentValue(typeId, "Document values must use plain JSON objects; Map, Set, Date, Blob and class instances are unsupported.");
      }
      const descriptors = Object.getOwnPropertyDescriptors(candidate);
      const keys = Reflect.ownKeys(candidate);
      if (keys.some((key) => typeof key !== "string")) {
        failDocumentValue(typeId, "Document objects must not contain symbol properties.");
      }
      const entries = (keys as string[]).map((key) => {
        const descriptor = descriptors[key]!;
        if (!("value" in descriptor) || !descriptor.enumerable) {
          failDocumentValue(typeId, "Document values must use enumerable data properties, not accessors.");
        }
        return [key, descriptor.value] as const;
      });
      result = Object.fromEntries(entries
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, entry]) => [key, visit(entry, depth + 1)]));
    }
    seen.delete(candidate);
    return result;
  };
  const json = JSON.stringify(visit(value, 0));
  if (new TextEncoder().encode(json).byteLength > maxBytes) {
    failDocumentValue(typeId, `Document value exceeds the ${maxBytes} byte limit.`);
  }
  return json;
}

function deepFreezeDocumentJson<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const entry of value) deepFreezeDocumentJson(entry);
  } else {
    for (const entry of Object.values(value as Record<string, unknown>)) deepFreezeDocumentJson(entry);
  }
  return Object.freeze(value);
}

export function immutableDocumentValue<T>(value: T, typeId = "document.value"): T {
  const canonical = canonicalDocumentJson(value, typeId);
  return deepFreezeDocumentJson(JSON.parse(canonical) as T);
}
