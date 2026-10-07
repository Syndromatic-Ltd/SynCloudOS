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

import type { SynCloudOSPolicyDecision } from "../PolicyKit/policyTypes";
import type { SynCloudOSDocumentStoreOperation } from "./documentStoreTypes";

export class SynCloudOSDocumentStoreAccessError extends Error {
  readonly operation: SynCloudOSDocumentStoreOperation;
  readonly decision: SynCloudOSPolicyDecision;

  constructor(operation: SynCloudOSDocumentStoreOperation, decision: SynCloudOSPolicyDecision) {
    super(`DocumentStore ${operation} denied: ${decision.reason}`);
    this.name = "SynCloudOSDocumentStoreAccessError";
    this.operation = operation;
    this.decision = decision;
  }
}

export class SynCloudOSDocumentStoreNotFoundError extends Error {
  readonly documentId: string;

  constructor(documentId: string) {
    super(`DocumentStore document not found: ${documentId}`);
    this.name = "SynCloudOSDocumentStoreNotFoundError";
    this.documentId = documentId;
  }
}

export class SynCloudOSDocumentStoreIndexError extends Error {
  readonly indexName: string;
  readonly documentId: string;
  readonly conflictingDocumentId: string;

  constructor(indexName: string, documentId: string, conflictingDocumentId: string) {
    super(`DocumentStore unique index ${indexName} conflicts for ${documentId} and ${conflictingDocumentId}.`);
    this.name = "SynCloudOSDocumentStoreIndexError";
    this.indexName = indexName;
    this.documentId = documentId;
    this.conflictingDocumentId = conflictingDocumentId;
  }
}

export class SynCloudOSDocumentStoreVersionConflictError extends Error {
  readonly code = "document-store-version-conflict";
  constructor(
    readonly documentId: string,
    readonly expectedEtag: string | null,
    readonly currentDocument: import("./documentStoreTypes").SynCloudOSDocument | null,
  ) {
    super(`DocumentStore draft ${documentId} changed before the conditional operation.`);
    this.name = "SynCloudOSDocumentStoreVersionConflictError";
  }
}

export class SynCloudOSDocumentStoreAtomicityUnavailableError extends Error {
  readonly code = "document-store-atomicity-unavailable";
  constructor() {
    super("Persistent conditional DocumentStore writes require an injected cross-context lock.");
    this.name = "SynCloudOSDocumentStoreAtomicityUnavailableError";
  }
}

export class SynCloudOSDocumentStoreIdempotencyConflictError extends Error {
  readonly code = "document-store-idempotency-conflict";
  constructor(readonly idempotencyKey: string) {
    super(`DocumentStore idempotency key "${idempotencyKey}" was reused for a different operation.`);
    this.name = "SynCloudOSDocumentStoreIdempotencyConflictError";
  }
}

export class SynCloudOSDocumentStoreMutationLockedError extends Error {
  readonly code = "document-store-mutation-locked";
  constructor(readonly documentId: string) {
    super(`DocumentStore document "${documentId}" has a terminal mutation in progress.`);
    this.name = "SynCloudOSDocumentStoreMutationLockedError";
  }
}

export class SynCloudOSDocumentStoreUnsupportedSchemaError extends Error {
  readonly code = "document-store-unsupported-schema";
  constructor(readonly schemaVersion: number) {
    super(`DocumentStore snapshot schema ${schemaVersion} is newer than this runtime supports.`);
    this.name = "SynCloudOSDocumentStoreUnsupportedSchemaError";
  }
}

export class SynCloudOSDocumentStorePayloadError extends Error {
  readonly code = "document-store-payload-invalid";
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "SynCloudOSDocumentStorePayloadError";
  }
}
