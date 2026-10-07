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

import type {
  DocumentStoreVersion,
  SynCloudOSDocument,
  SynCloudOSDocumentStoreAdapter,
} from "../../DocumentStore";
import { SynCloudOSDocumentStoreVersionConflictError } from "../../DocumentStore";
import { DocumentSchemaError, DocumentUnavailableError, DocumentVersionConflictError } from "../DocumentErrors";
import { immutableDocumentValue, type DocumentLocation, type DocumentRecord, type DocumentVersion } from "../documentTypes";
import { throwIfDocumentAborted } from "./InMemoryDocumentAdapter";
import type {
  DocumentListQuery,
  DocumentReadOptions,
  DocumentStorageAdapter,
  DocumentWriteRequest,
} from "./documentAdapterTypes";

const applicationDocumentKind = "application.document";

interface ApplicationDocumentEnvelope<T> {
  readonly typeId: string;
  readonly schemaVersion: number;
  readonly content: T;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface DocumentStoreDocumentAdapterOptions {
  readonly id?: string;
  readonly documentIdPrefix?: string;
}

function mapVersion(version: DocumentStoreVersion): DocumentVersion {
  return structuredClone(version);
}

function omitOptionalUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    const entries: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor)) {
        throw new DocumentSchemaError(applicationDocumentKind, "DocumentStore arrays must be dense data-property arrays.");
      }
      entries.push(omitOptionalUndefined(descriptor.value));
    }
    for (const key of Reflect.ownKeys(value)) {
      if (key === "length") continue;
      if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
        throw new DocumentSchemaError(applicationDocumentKind, "DocumentStore arrays must contain only indexed JSON values.");
      }
    }
    return entries;
  }
  if (!value || typeof value !== "object") return value;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  const entries: [string, unknown][] = [];
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      throw new DocumentSchemaError(applicationDocumentKind, "DocumentStore objects must not contain symbol properties.");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!("value" in descriptor) || !descriptor.enumerable) {
      throw new DocumentSchemaError(applicationDocumentKind, "DocumentStore values must use enumerable data properties, not accessors.");
    }
    if (descriptor.value !== undefined) entries.push([key, omitOptionalUndefined(descriptor.value)]);
  }
  return Object.fromEntries(entries);
}

function decodeEnvelope<T>(document: SynCloudOSDocument, location: DocumentLocation): DocumentRecord<T> {
  document = immutableDocumentValue(omitOptionalUndefined(document), applicationDocumentKind) as SynCloudOSDocument;
  if (document.kind !== applicationDocumentKind || !document.storageVersion || !document.body || typeof document.body !== "object") {
    throw new DocumentSchemaError(applicationDocumentKind, "DocumentStore application-document envelope is malformed.");
  }
  const body = document.body as Partial<ApplicationDocumentEnvelope<T>>;
  if (typeof body.typeId !== "string" || !Number.isSafeInteger(body.schemaVersion) || body.schemaVersion! <= 0 || !("content" in body)) {
    throw new DocumentSchemaError(applicationDocumentKind, "DocumentStore application-document envelope is malformed.");
  }
  return structuredClone(immutableDocumentValue({
    location: structuredClone(location),
    typeId: body.typeId,
    schemaVersion: body.schemaVersion!,
    content: structuredClone(body.content as T),
    version: mapVersion(document.storageVersion),
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    metadata: structuredClone(body.metadata ?? {}),
  }, body.typeId));
}

export class DocumentStoreDocumentAdapter implements DocumentStorageAdapter {
  readonly id: string;
  readonly capabilities;
  readonly #documentIdPrefix: string | null;

  constructor(
    private readonly store: SynCloudOSDocumentStoreAdapter,
    options: DocumentStoreDocumentAdapterOptions = {},
  ) {
    const id = options.id ?? "document-store";
    if (typeof id !== "string" || id.trim().length === 0) {
      throw new TypeError("DocumentStore adapter ID must be a non-empty string.");
    }
    const documentIdPrefix = options.documentIdPrefix;
    if (documentIdPrefix !== undefined && (typeof documentIdPrefix !== "string" || documentIdPrefix.length === 0)) {
      throw new TypeError("DocumentStore adapter document ID prefix must be a non-empty string.");
    }
    this.id = id;
    this.#documentIdPrefix = documentIdPrefix ?? null;
    const declared = (store as SynCloudOSDocumentStoreAdapter & {
      readonly supportsAtomicConditionalWrites?: boolean;
    }).supportsAtomicConditionalWrites;
    this.capabilities = Object.freeze({
      versions: true,
      delete: true,
      watch: false,
      offline: false,
      atomicConditionalWrite: declared === true,
    });
  }

  supports(location: DocumentLocation): boolean {
    if (location.kind !== "document-store") return false;
    return this.#documentIdPrefix === null || location.documentId.startsWith(this.#documentIdPrefix);
  }

  #locationDocumentId(location: DocumentLocation): string {
    if (location.kind !== "document-store" || !this.supports(location)) {
      throw new DocumentUnavailableError(
        `DocumentStore adapter "${this.id}" does not support this document-store namespace.`,
        { retryable: false },
      );
    }
    return location.documentId;
  }

  async #saveRequest<TSerialized>(
    request: DocumentWriteRequest<TSerialized>,
    signal: AbortSignal | undefined = request.signal,
  ) {
    throwIfDocumentAborted(signal);
    const content = immutableDocumentValue(request.content, request.typeId);
    const metadata = request.metadata ? immutableDocumentValue(request.metadata, request.typeId) : undefined;
    const documentId = this.#locationDocumentId(request.location);
    const saved = await this.store.saveDraft({
      id: documentId,
      kind: applicationDocumentKind,
      version: 1,
      ownership: { kind: "system" },
      title: metadata?.displayName ?? documentId,
      slug: documentId,
      body: {
        typeId: request.typeId,
        schemaVersion: request.schemaVersion,
        content,
        metadata: metadata ?? {},
      } satisfies ApplicationDocumentEnvelope<TSerialized>,
      metadata: { applicationDocumentTypeId: request.typeId },
      publishState: "draft",
    }, undefined, {
      ifMatch: request.expectedVersion?.etag ?? null,
      idempotencyKey: request.idempotencyKey,
      signal,
    });
    return saved;
  }

  async read<TSerialized>(location: DocumentLocation, options: DocumentReadOptions = {}): Promise<DocumentRecord<TSerialized> | null> {
    throwIfDocumentAborted(options.signal);
    const document = await this.store.getDraft(this.#locationDocumentId(location));
    throwIfDocumentAborted(options.signal);
    if (!document) return null;
    return decodeEnvelope<TSerialized>(document, location);
  }

  async write<TSerialized>(request: DocumentWriteRequest<TSerialized>): Promise<DocumentRecord<TSerialized>> {
    try {
      const saved = await this.#saveRequest(request);
      return decodeEnvelope<TSerialized>(saved, request.location);
    } catch (error) {
      if (error instanceof SynCloudOSDocumentStoreVersionConflictError) {
        throw new DocumentVersionConflictError(
          request.location,
          request.expectedVersion,
          error.currentDocument ? decodeEnvelope<TSerialized>(error.currentDocument, request.location) : null,
        );
      }
      throw error;
    }
  }

  async recoverWriteByIdempotencyKey<TSerialized>(
    request: DocumentWriteRequest<TSerialized>,
    options: DocumentReadOptions = {},
  ): Promise<DocumentRecord<TSerialized> | null> {
    // DocumentStore owns exact idempotency records. Reissuing the identical
    // save with the same key is a status query: a committed write returns its
    // original record without creating a new version, while a mismatched key
    // is rejected by the store rather than guessed from current state.
    const saved = await this.#saveRequest(request, options.signal);
    return decodeEnvelope<TSerialized>(saved, request.location);
  }

  async remove(location: DocumentLocation, expectedVersion: DocumentVersion, options: DocumentReadOptions = {}): Promise<void> {
    try {
      await this.store.deleteDraft(this.#locationDocumentId(location), undefined, {
        ifMatch: expectedVersion.etag,
        idempotencyKey: `remove:${expectedVersion.id}`,
        signal: options.signal,
      });
    } catch (error) {
      if (error instanceof SynCloudOSDocumentStoreVersionConflictError) {
        throw new DocumentVersionConflictError(
          location,
          expectedVersion,
          error.currentDocument ? decodeEnvelope(error.currentDocument, location) : null,
        );
      }
      throw error;
    }
  }

  async list(query: DocumentListQuery): Promise<readonly DocumentRecord<unknown>[]> {
    throwIfDocumentAborted(query.signal);
    if (query.locationKind && query.locationKind !== "document-store") return Object.freeze([]);
    const documents = await this.store.listDrafts({ kind: applicationDocumentKind });
    throwIfDocumentAborted(query.signal);
    return Object.freeze(documents
      .filter((document) => this.#documentIdPrefix === null || document.id.startsWith(this.#documentIdPrefix))
      .map((document) => decodeEnvelope(document, {
      kind: "document-store",
      documentId: document.id,
    })).filter((record) => !query.typeId || record.typeId === query.typeId));
  }

  async listVersions(location: DocumentLocation, options: DocumentReadOptions = {}): Promise<readonly DocumentVersion[]> {
    const versions = await this.store.listDraftVersions(this.#locationDocumentId(location), undefined, options);
    return Object.freeze(versions.map(mapVersion));
  }

  async readVersion<TSerialized>(location: DocumentLocation, version: DocumentVersion, options: DocumentReadOptions = {}): Promise<DocumentRecord<TSerialized> | null> {
    const document = await this.store.readDraftVersion(this.#locationDocumentId(location), version.id, undefined, options);
    return document ? decodeEnvelope<TSerialized>(document, location) : null;
  }
}
