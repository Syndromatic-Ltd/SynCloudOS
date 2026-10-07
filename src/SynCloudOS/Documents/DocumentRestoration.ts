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

import { DocumentRecoveryCorruptError } from "./DocumentErrors";
import {
  canonicalDocumentLocation,
  type DocumentLocation,
  type DocumentVersion,
  type DocumentWindowAssociation,
} from "./documentTypes";
import { canonicalDocumentJson } from "./documentTypes";

const MAX_RESTORATION_DOCUMENTS = 1_000;
const MAX_RECENT_LOCATIONS = 2_000;
const MAX_ASSOCIATIONS_PER_DOCUMENT = 100;
const MAX_INLINE_RECOVERY_BYTES = 65_536;
const MAX_RESTORATION_SNAPSHOT_BYTES = 16 * 1024 * 1024;

export type RestorableRecovery =
  | { readonly kind: "none" }
  | {
      readonly kind: "inline";
      readonly dirtyRevision: number;
      readonly serializedContent: unknown;
      readonly contentHash: string;
      readonly capturedAt: string;
    }
  | {
      readonly kind: "record";
      readonly recoveryId: string;
      readonly recoveryVersion: number;
      readonly dirtyRevision: number;
      readonly contentHash: string;
    };

export interface RestorableDocument {
  readonly documentId: string;
  /** Missing is accepted only as the legacy schema-v1 null owner. */
  readonly applicationId?: string | null;
  readonly typeId: string;
  readonly typeSchemaVersion: number;
  readonly location: DocumentLocation | null;
  readonly baseVersion: DocumentVersion | null;
  readonly recovery: RestorableRecovery;
  readonly windowAssociations: readonly DocumentWindowAssociation[];
}

export interface DocumentRestorationSnapshot {
  readonly schemaVersion: 1;
  readonly activeDocumentId: string | null;
  readonly documents: readonly RestorableDocument[];
  readonly recentLocations: readonly DocumentLocation[];
  readonly capturedAt: string;
}

export interface DocumentRestorationReport {
  readonly restoredDocumentIds: readonly string[];
  readonly conflictedDocumentIds: readonly string[];
  readonly failures: readonly {
    readonly documentId: string;
    readonly code: import("./DocumentErrors").DocumentErrorCode;
    readonly message: string;
  }[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isContentHash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}$/u.test(value);
}

function restorationEnvelopeProperty(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
    throw new Error("Restoration snapshot envelope must use enumerable data properties.");
  }
  return descriptor.value;
}

function isVersion(value: unknown): value is DocumentVersion {
  return isObject(value) && typeof value.id === "string" && value.id.length > 0 &&
    isPositiveInteger(value.sequence) && isTimestamp(value.savedAt) &&
    typeof value.etag === "string" && value.etag.length > 0;
}

function isJsonValue(value: unknown): boolean {
  try {
    canonicalDocumentJson(value, "document.restoration", {
      maxDepth: 64,
      maxNodes: 100_000,
      maxBytes: MAX_INLINE_RECOVERY_BYTES,
    });
    return true;
  } catch {
    return false;
  }
}

function validatedLocation(value: unknown): DocumentLocation | null {
  if (!isObject(value) || typeof value.kind !== "string") return null;
  try {
    switch (value.kind) {
      case "memory":
        if (typeof value.namespace !== "string" || typeof value.key !== "string") return null;
        break;
      case "indexed-db":
        if (typeof value.database !== "string" || typeof value.store !== "string" || typeof value.key !== "string") return null;
        break;
      case "document-store":
        if (typeof value.documentId !== "string") return null;
        break;
      case "remote":
        if (typeof value.url !== "string") return null;
        break;
      default:
        return null;
    }
    canonicalDocumentLocation(value as DocumentLocation);
    return value as DocumentLocation;
  } catch {
    return null;
  }
}

function assertRecovery(value: unknown): asserts value is RestorableRecovery {
  if (!isObject(value) || typeof value.kind !== "string") throw new Error("Recovery descriptor is missing.");
  if (value.kind === "none") return;
  if (value.kind === "inline") {
    if (!isPositiveInteger(value.dirtyRevision) || !isJsonValue(value.serializedContent) ||
        !isContentHash(value.contentHash) || !isTimestamp(value.capturedAt)) {
      throw new Error("Inline recovery descriptor is malformed.");
    }
    return;
  }
  if (value.kind === "record") {
    if (typeof value.recoveryId !== "string" || !value.recoveryId ||
        !isPositiveInteger(value.recoveryVersion) || !isPositiveInteger(value.dirtyRevision) ||
        !isContentHash(value.contentHash)) {
      throw new Error("Durable recovery descriptor is malformed.");
    }
    return;
  }
  throw new Error("Recovery descriptor kind is unsupported.");
}

export function validateDocumentRestorationSnapshot(value: unknown): asserts value is DocumentRestorationSnapshot {
  try {
    if (!isObject(value)) throw new Error("Restoration snapshot envelope is malformed.");
    const documents = restorationEnvelopeProperty(value, "documents");
    const recentLocations = restorationEnvelopeProperty(value, "recentLocations");
    restorationEnvelopeProperty(value, "schemaVersion");
    restorationEnvelopeProperty(value, "activeDocumentId");
    restorationEnvelopeProperty(value, "capturedAt");
    if (Array.isArray(documents) && documents.length > MAX_RESTORATION_DOCUMENTS) {
      throw new Error(`Restoration snapshots support at most ${MAX_RESTORATION_DOCUMENTS} documents.`);
    }
    if (Array.isArray(recentLocations) && recentLocations.length > MAX_RECENT_LOCATIONS) {
      throw new Error(`Restoration snapshots support at most ${MAX_RECENT_LOCATIONS} recent locations.`);
    }
    // Canonical validation inspects descriptors before values. Run it before
    // reading even the envelope so hostile accessors cannot execute during
    // structural admission.
    canonicalDocumentJson(value, "document.restoration", {
      maxDepth: 80,
      maxNodes: 250_000,
      maxBytes: MAX_RESTORATION_SNAPSHOT_BYTES,
    });
    if (!isObject(value) || value.schemaVersion !== 1 || !Array.isArray(value.documents) ||
        !Array.isArray(value.recentLocations) || !isTimestamp(value.capturedAt) ||
        !(value.activeDocumentId === null || typeof value.activeDocumentId === "string")) {
      throw new Error("Restoration snapshot envelope is malformed.");
    }
    for (let index = 0; index < value.documents.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value.documents, index)) {
        throw new Error("Restoration document arrays must not be sparse.");
      }
      const entry = value.documents[index];
      if (!isObject(entry) || !Array.isArray(entry.windowAssociations) ||
          entry.windowAssociations.length > MAX_ASSOCIATIONS_PER_DOCUMENT) {
        throw new Error("Restoration document entry exceeds structural bounds.");
      }
    }
    const documentIds = new Set<string>();
    const locationKeys = new Set<string>();
    for (const entry of value.documents) {
      if (!isObject(entry) || typeof entry.documentId !== "string" || !entry.documentId ||
          typeof entry.typeId !== "string" || !entry.typeId || !isPositiveInteger(entry.typeSchemaVersion) ||
          !Array.isArray(entry.windowAssociations) || entry.windowAssociations.length > MAX_ASSOCIATIONS_PER_DOCUMENT) {
        throw new Error("Restoration document entry is malformed.");
      }
      if (!(entry.applicationId === undefined || entry.applicationId === null ||
          (typeof entry.applicationId === "string" && entry.applicationId.trim().length > 0))) {
        throw new Error("Restoration document application owner is malformed.");
      }
      if (documentIds.has(entry.documentId)) throw new Error("Restoration document IDs must be unique.");
      documentIds.add(entry.documentId);
      if (entry.location !== null) {
        const location = validatedLocation(entry.location);
        if (!location) throw new Error("Restoration document location is malformed.");
        const key = canonicalDocumentLocation(location);
        if (locationKeys.has(key)) throw new Error("Restoration document locations must be unique.");
        locationKeys.add(key);
      }
      if (entry.baseVersion !== null && !isVersion(entry.baseVersion)) throw new Error("Restoration base version is malformed.");
      assertRecovery(entry.recovery);
      const associationIds = new Set<string>();
      for (const association of entry.windowAssociations) {
        if (!isObject(association) || typeof association.windowControllerId !== "string" || !association.windowControllerId ||
            !["primary", "secondary", "inspector"].includes(String(association.role)) ||
            associationIds.has(association.windowControllerId)) {
          throw new Error("Restoration window association is malformed or duplicated.");
        }
        associationIds.add(association.windowControllerId);
      }
    }
    if (value.activeDocumentId !== null && !documentIds.has(value.activeDocumentId)) {
      throw new Error("Restoration active document does not exist in the snapshot.");
    }
    const recentKeys = new Set<string>();
    for (const candidate of value.recentLocations) {
      const location = validatedLocation(candidate);
      if (!location) throw new Error("Recent document location is malformed.");
      const key = canonicalDocumentLocation(location);
      if (recentKeys.has(key)) throw new Error("Recent document locations must be unique.");
      recentKeys.add(key);
    }
  } catch (error) {
    throw new DocumentRecoveryCorruptError(
      "restoration-snapshot",
      error instanceof Error ? error.message : "Restoration snapshot is corrupt.",
    );
  }
}
