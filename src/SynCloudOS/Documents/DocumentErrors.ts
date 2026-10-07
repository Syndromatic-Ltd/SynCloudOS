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

import type { DocumentLocation, DocumentRecord, DocumentVersion } from "./documentTypes";

export type DocumentErrorCode =
  | "document-aborted"
  | "document-adapter-ambiguous"
  | "document-adapter-unavailable"
  | "document-deleted"
  | "document-destination-conflict"
  | "document-location-already-open"
  | "document-location-required"
  | "document-not-found"
  | "document-presentation-close-contract"
  | "document-close-transaction-unavailable"
  | "document-read-only"
  | "document-recovery-corrupt"
  | "document-recovery-missing"
  | "document-recovery-unavailable"
  | "document-recovery-version-conflict"
  | "document-requested-id-conflict"
  | "document-restoration-stale"
  | "document-same-location-move"
  | "document-schema"
  | "document-source-removal"
  | "document-type-registration"
  | "document-type-unknown"
  | "document-unavailable"
  | "document-version-conflict"
  | "document-write-outcome-unknown";

export class DocumentError extends Error {
  constructor(readonly code: DocumentErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class DocumentTypeRegistrationError extends DocumentError {
  constructor(readonly typeId: string, message = `Document type "${typeId}" is already registered.`) {
    super("document-type-registration", message);
  }
}

export class UnknownDocumentTypeError extends DocumentError {
  constructor(readonly typeId: string) {
    super("document-type-unknown", `Unknown document type "${typeId}".`);
  }
}

export class DocumentSchemaError extends DocumentError {
  constructor(readonly typeId: string, message = `Document content does not match schema for "${typeId}".`) {
    super("document-schema", message);
  }
}

export class DocumentLocationRequiredError extends DocumentError {
  constructor(readonly documentId: string) {
    super("document-location-required", `Document "${documentId}" requires a saved location.`);
  }
}

export class DocumentDestinationConflictError extends DocumentError {
  constructor(readonly destination: DocumentLocation, readonly currentRecord: DocumentRecord<unknown> | null = null) {
    super("document-destination-conflict", "The destination already contains a document.");
  }
}

export class DocumentAdapterUnavailableError extends DocumentError {
  constructor(readonly location: DocumentLocation) {
    super("document-adapter-unavailable", `No document adapter supports the requested ${location.kind} location.`);
  }
}

export class DocumentAdapterAmbiguousError extends DocumentError {
  constructor(readonly location: DocumentLocation, readonly adapterIds: readonly string[]) {
    super("document-adapter-ambiguous", `Multiple document adapters support the requested ${location.kind} location.`);
  }
}

export class DocumentLocationAlreadyOpenError extends DocumentError {
  constructor(readonly location: DocumentLocation, readonly documentId: string) {
    super("document-location-already-open", `The document location is already open as "${documentId}".`);
  }
}

export class DocumentRequestedIdConflictError extends DocumentError {
  constructor(readonly documentId: string) {
    super("document-requested-id-conflict", `Document ID "${documentId}" is already open.`);
  }
}

export class DocumentSourceRemovalError extends DocumentError {
  constructor(readonly location: DocumentLocation, cause: unknown) {
    super("document-source-removal", "The copied document was saved, but its source could not be removed.", { cause });
  }
}

export class DocumentSameLocationMoveError extends DocumentError {
  constructor(readonly source: DocumentLocation, readonly destination: DocumentLocation) {
    super("document-same-location-move", "A document cannot be moved to its current location.");
  }
}

export class DocumentPresentationCloseContractError extends DocumentError {
  constructor(message = "The presentation close coordinator violated its atomic close contract.") {
    super("document-presentation-close-contract", message);
  }
}

export class DocumentCloseTransactionUnavailableError extends DocumentError {
  constructor(readonly adapterId: string) {
    super(
      "document-close-transaction-unavailable",
      `Adapter "${adapterId}" cannot provide exact selected-close rollback.`,
    );
  }
}

export class DocumentRecoveryVersionConflictError extends DocumentError {
  constructor(readonly recoveryId: string, readonly expectedVersion: number | null, readonly currentVersion: number | null) {
    super("document-recovery-version-conflict", `Recovery record "${recoveryId}" changed before the conditional operation.`);
  }
}

export class DocumentRecoveryUnavailableError extends DocumentError {
  constructor(message = "Durable document recovery is unavailable.", options?: ErrorOptions) {
    super("document-recovery-unavailable", message, options);
  }
}

export class DocumentRecoveryMissingError extends DocumentError {
  constructor(readonly recoveryId: string) {
    super("document-recovery-missing", `Recovery record "${recoveryId}" is missing.`);
  }
}

export class DocumentRecoveryCorruptError extends DocumentError {
  constructor(readonly recoveryId: string, message = `Recovery record "${recoveryId}" is corrupt.`) {
    super("document-recovery-corrupt", message);
  }
}

export class DocumentRestorationStaleError extends DocumentError {
  constructor(readonly documentId: string) {
    super("document-restoration-stale", `Restoration entry "${documentId}" no longer matches its saved base.`);
  }
}

export class DocumentUnavailableError extends DocumentError {
  readonly retryable: boolean;
  constructor(message = "Document storage is unavailable.", options?: ErrorOptions & { retryable?: boolean }) {
    super("document-unavailable", message, options);
    this.retryable = options?.retryable ?? true;
  }
}

export class DocumentReadOnlyError extends DocumentError {
  constructor(message = "The document is read-only.") { super("document-read-only", message); }
}

export class DocumentDeletedError extends DocumentError {
  constructor(message = "The document was deleted.") { super("document-deleted", message); }
}

export class DocumentAbortError extends DocumentError {
  constructor(message = "The document operation was aborted.", options?: ErrorOptions) {
    super("document-aborted", message, options);
  }
}

export class DocumentVersionConflictError<TSerialized = unknown> extends DocumentError {
  constructor(
    readonly location: DocumentLocation,
    readonly expectedVersion: DocumentVersion | null,
    readonly currentRecord: DocumentRecord<TSerialized> | null,
  ) {
    super("document-version-conflict", "The document changed before the conditional write completed.");
  }
}

/** A remote write was sent but its durable response could not be established.
 * The destination may exist, so callers must recover by idempotency key rather
 * than treating this like an ordinary failed write. */
export class DocumentWriteOutcomeUnknownError extends DocumentError {
  constructor(
    readonly location: DocumentLocation,
    readonly idempotencyKey: string,
    message = "The remote document write may have completed, but its outcome could not be confirmed.",
    options?: ErrorOptions,
  ) {
    super("document-write-outcome-unknown", message, options);
  }
}

export class DocumentNotFoundError extends DocumentError {
  constructor(readonly location: DocumentLocation) { super("document-not-found", "The document was not found."); }
}
