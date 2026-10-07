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

import type { SynCloudOSRuntimeEnvironment } from "../../Runtime/runtimeInstanceTypes";
import type { DocumentLocation, DocumentRecord, DocumentVersion } from "../documentTypes";

export interface DocumentAdapterCapabilities {
  readonly versions: boolean;
  readonly delete: boolean;
  readonly watch: boolean;
  readonly offline: boolean;
  readonly atomicConditionalWrite: boolean;
}

export interface DocumentReadOptions {
  readonly signal?: AbortSignal;
  /** Opaque authority minted by beginCloseTransaction for its own writes. */
  readonly closeTransactionToken?: string;
}

export interface DocumentWriteRequest<TSerialized> {
  readonly location: DocumentLocation;
  readonly typeId: string;
  readonly schemaVersion: number;
  readonly content: TSerialized;
  readonly expectedVersion: DocumentVersion | null;
  readonly idempotencyKey: string;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
  readonly closeTransactionToken?: string;
}

export interface DocumentListQuery extends DocumentReadOptions {
  readonly typeId?: string;
  readonly locationKind?: DocumentLocation["kind"];
}

export type DocumentWatchEvent =
  | { readonly kind: "written"; readonly record: DocumentRecord<unknown> }
  | { readonly kind: "removed"; readonly location: DocumentLocation; readonly version: DocumentVersion };

export type DocumentWatchListener = (event: DocumentWatchEvent) => void;

export interface DocumentWatchSubscription {
  dispose(): void;
}

export type DocumentSynchronisationEvent =
  | { readonly kind: "acknowledged"; readonly record: DocumentRecord<unknown> }
  | {
      readonly kind: "conflicted";
      readonly location: DocumentLocation;
      readonly expectedVersion: DocumentVersion | null;
      readonly currentRecord: DocumentRecord<unknown> | null;
      readonly terminalState?: "deleted" | "read-only";
    };

export interface DocumentSynchronisationDiscardOptions extends DocumentReadOptions {
  /** The local result selected by the reviewed discard decision. */
  readonly discardedRecord?: DocumentRecord<unknown> | null;
  /** The last remotely acknowledged durable record to preserve or restore. */
  readonly previousRecord?: DocumentRecord<unknown> | null;
}

/**
 * Exact before-image authority for close-time provider mutations. `seal`
 * records the expected after-image; rollback must refuse if another writer has
 * changed it and otherwise restore records, history, idempotency and outbox.
 */
export interface DocumentCloseStorageTransaction {
  readonly token: string;
  seal(): Promise<void>;
  rollback(): Promise<void>;
  commit(): void | Promise<void>;
}

export interface DocumentStorageAdapter {
  readonly id: string;
  readonly capabilities: DocumentAdapterCapabilities;
  supports(location: DocumentLocation): boolean;
  read<TSerialized>(location: DocumentLocation, options?: DocumentReadOptions): Promise<DocumentRecord<TSerialized> | null>;
  write<TSerialized>(request: DocumentWriteRequest<TSerialized>): Promise<DocumentRecord<TSerialized>>;
  /** Queries a provider's idempotency-status protocol after a sent write lost
   * its response. Returning null means the provider cannot prove the record. */
  recoverWriteByIdempotencyKey?<TSerialized>(
    request: DocumentWriteRequest<TSerialized>,
    options?: DocumentReadOptions,
  ): Promise<DocumentRecord<TSerialized> | null>;
  remove(location: DocumentLocation, expectedVersion: DocumentVersion, options?: DocumentReadOptions): Promise<void>;
  list(query: DocumentListQuery): Promise<readonly DocumentRecord<unknown>[]>;
  listVersions(location: DocumentLocation, options?: DocumentReadOptions): Promise<readonly DocumentVersion[]>;
  readVersion<TSerialized>(
    location: DocumentLocation,
    version: DocumentVersion,
    options?: DocumentReadOptions,
  ): Promise<DocumentRecord<TSerialized> | null>;
  watch?(location: DocumentLocation, listener: DocumentWatchListener): DocumentWatchSubscription;
  isSynchronisationPending?(location: DocumentLocation): boolean;
  subscribeSynchronisation?(
    location: DocumentLocation,
    listener: (event: DocumentSynchronisationEvent) => void,
  ): DocumentWatchSubscription;
  refreshSynchronisation?(
    location: DocumentLocation,
    options?: DocumentReadOptions,
  ): Promise<DocumentSynchronisationEvent | null>;
  readLastAcknowledgedRecord?<TSerialized>(
    location: DocumentLocation,
    options?: DocumentReadOptions,
  ): Promise<DocumentRecord<TSerialized> | null>;
  reconcileFencedWrite?<TSerialized>(
    location: DocumentLocation,
    committed: DocumentRecord<TSerialized>,
    previous: DocumentRecord<TSerialized> | null,
    options?: DocumentReadOptions,
  ): Promise<void>;
  prepareDocumentRecreation?(location: DocumentLocation, options?: DocumentReadOptions): Promise<void>;
  discardPendingSynchronisation?(
    location: DocumentLocation,
    options?: DocumentSynchronisationDiscardOptions,
  ): Promise<void>;
  beginCloseTransaction?(
    location: DocumentLocation,
    options?: DocumentReadOptions,
  ): Promise<DocumentCloseStorageTransaction>;
  acceptRemoteConflict?(
    location: DocumentLocation,
    record: DocumentRecord<unknown> | null,
    options?: DocumentReadOptions,
  ): Promise<void>;
  dispose?(): void | Promise<void>;
}

export interface DocumentAdapterRegistration { dispose(): void }

export type DocumentAdapterEnvironment = Pick<SynCloudOSRuntimeEnvironment, "now" | "randomUUID"> &
  Partial<Pick<SynCloudOSRuntimeEnvironment, "setTimeout" | "clearTimeout">>;
