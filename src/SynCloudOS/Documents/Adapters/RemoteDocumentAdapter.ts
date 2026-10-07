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

import {
  DocumentAbortError,
  DocumentDeletedError,
  DocumentReadOnlyError,
  DocumentSchemaError,
  DocumentUnavailableError,
  DocumentVersionConflictError,
  DocumentWriteOutcomeUnknownError,
} from "../DocumentErrors";
import { canonicalDocumentJson, immutableDocumentValue, type DocumentLocation, type DocumentRecord, type DocumentVersion } from "../documentTypes";
import { throwIfDocumentAborted } from "./InMemoryDocumentAdapter";
import type {
  DocumentListQuery,
  DocumentReadOptions,
  DocumentStorageAdapter,
  DocumentWriteRequest,
} from "./documentAdapterTypes";

export interface DocumentRemoteRequest {
  readonly method: "GET" | "PUT" | "DELETE";
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly signal?: AbortSignal;
}

export interface DocumentRemoteResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

export interface DocumentRemoteTransport {
  request(request: DocumentRemoteRequest): Promise<DocumentRemoteResponse>;
}

function remoteUrl(location: DocumentLocation): string {
  if (location.kind !== "remote") throw new DocumentUnavailableError("Remote adapter requires a remote location.", { retryable: false });
  const url = new URL(location.url);
  url.hash = "";
  return url.href;
}

function canonicalLocation(location: DocumentLocation): DocumentLocation {
  return immutableDocumentValue(location, "remote.document");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isVersion(value: unknown): value is DocumentVersion {
  return isObject(value) && typeof value.id === "string" && Number.isSafeInteger(value.sequence) &&
    (value.sequence as number) > 0 && typeof value.savedAt === "string" && typeof value.etag === "string";
}

function schemaFailure(message: string): never {
  throw new DocumentSchemaError("remote.document", message);
}

function dataProperty(
  value: object,
  key: PropertyKey,
  required = true,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) {
    if (required) schemaFailure(`Remote document request is missing ${String(key)}.`);
    return undefined;
  }
  if (!("value" in descriptor) || !descriptor.enumerable) {
    schemaFailure("Remote document requests must use enumerable data properties, not accessors.");
  }
  return descriptor.value;
}

function canonicalVersion(value: unknown): DocumentVersion {
  const canonical = immutableDocumentValue(value, "remote.document");
  if (!isVersion(canonical)) schemaFailure("Remote document version is malformed.");
  return canonical;
}

function canonicalWriteRequest<TSerialized>(
  request: DocumentWriteRequest<TSerialized>,
): DocumentWriteRequest<TSerialized> {
  if (!isObject(request) || (Object.getPrototypeOf(request) !== Object.prototype && Object.getPrototypeOf(request) !== null)) {
    schemaFailure("Remote document write request envelope is malformed.");
  }
  const allowed = new Set(["location", "typeId", "schemaVersion", "content", "expectedVersion", "idempotencyKey", "metadata", "signal", "closeTransactionToken"]);
  for (const key of Reflect.ownKeys(request)) {
    if (typeof key !== "string" || !allowed.has(key)) schemaFailure("Remote document write request contains unsupported fields.");
    dataProperty(request, key);
  }
  const typeId = dataProperty(request, "typeId");
  const schemaVersion = dataProperty(request, "schemaVersion");
  const idempotencyKey = dataProperty(request, "idempotencyKey");
  if (typeof typeId !== "string" || !typeId || !Number.isSafeInteger(schemaVersion) || (schemaVersion as number) <= 0 ||
      typeof idempotencyKey !== "string" || !idempotencyKey.trim()) {
    schemaFailure("Remote document write request identifiers are malformed.");
  }
  const expectedValue = dataProperty(request, "expectedVersion");
  const metadataValue = dataProperty(request, "metadata", false);
  const durable = immutableDocumentValue({
    location: dataProperty(request, "location"),
    typeId,
    schemaVersion,
    content: dataProperty(request, "content"),
    expectedVersion: expectedValue === null ? null : canonicalVersion(expectedValue),
    idempotencyKey,
    ...(metadataValue === undefined ? {} : { metadata: metadataValue }),
  }, typeId);
  const signal = dataProperty(request, "signal", false);
  if (signal !== undefined && !(signal instanceof AbortSignal)) {
    schemaFailure("Remote document write request signal is malformed.");
  }
  return { ...durable, ...(signal ? { signal } : {}) } as DocumentWriteRequest<TSerialized>;
}

function decodeRecord<T>(location: DocumentLocation, body: unknown): DocumentRecord<T> {
  body = immutableDocumentValue(body, "remote.document");
  if (!isObject(body) || typeof body.typeId !== "string" || !Number.isSafeInteger(body.schemaVersion) ||
      (body.schemaVersion as number) <= 0 || !("content" in body) || !isVersion(body.version)) {
    throw new DocumentSchemaError("remote.document", "Remote document response body is malformed.");
  }
  const createdAt = typeof body.createdAt === "string" ? body.createdAt : body.version.savedAt;
  const updatedAt = typeof body.updatedAt === "string" ? body.updatedAt : body.version.savedAt;
  const metadata = isObject(body.metadata) && Object.values(body.metadata).every((value) => typeof value === "string")
    ? body.metadata as Record<string, string>
    : {};
  return immutableDocumentValue({
    location: structuredClone(location),
    typeId: body.typeId,
    schemaVersion: body.schemaVersion as number,
    content: structuredClone(body.content as T),
    version: structuredClone(body.version),
    createdAt,
    updatedAt,
    metadata: structuredClone(metadata),
  }, body.typeId);
}

function statusError(status: number, operation: "read" | "write" | "remove"): Error | null {
  if (status === 401 || status === 403) return new DocumentReadOnlyError();
  if (status === 404 && operation !== "read") return new DocumentDeletedError();
  if (status === 408 || status === 429 || status >= 500) {
    return new DocumentUnavailableError(`Remote document request failed with status ${status}.`, { retryable: true });
  }
  if (status < 200 || status >= 300) {
    return new DocumentUnavailableError(`Remote document request failed with status ${status}.`, { retryable: false });
  }
  return null;
}

function responseHeader(headers: Readonly<Record<string, string>>, name: string): string | undefined {
  const canonicalName = name.toLowerCase();
  let found: string | undefined;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== canonicalName) continue;
    // Ambiguous duplicates are not an idempotency proof, even if one happens
    // to match the original request key.
    if (found !== undefined) return undefined;
    found = value;
  }
  return found;
}

export class RemoteDocumentAdapter implements DocumentStorageAdapter {
  readonly id = "remote";
  readonly capabilities = Object.freeze({
    versions: true,
    delete: true,
    watch: false,
    offline: false,
    atomicConditionalWrite: true,
  });

  constructor(private readonly transport: DocumentRemoteTransport) {}

  supports(location: DocumentLocation): boolean { return location.kind === "remote"; }

  async read<TSerialized>(location: DocumentLocation, options: DocumentReadOptions = {}): Promise<DocumentRecord<TSerialized> | null> {
    location = canonicalLocation(location);
    const response = await this.#request({ method: "GET", url: remoteUrl(location), headers: {}, signal: options.signal });
    if (response.status === 404) return null;
    const error = statusError(response.status, "read");
    if (error) throw error;
    return decodeRecord<TSerialized>(location, response.body);
  }

  async write<TSerialized>(request: DocumentWriteRequest<TSerialized>): Promise<DocumentRecord<TSerialized>> {
    request = canonicalWriteRequest(request);
    const conditionalHeaders: Record<string, string> = request.expectedVersion
      ? { "If-Match": request.expectedVersion.etag }
      : { "If-None-Match": "*" };
    throwIfDocumentAborted(request.signal);
    let response: DocumentRemoteResponse;
    try {
      // Once the transport is invoked, even an abort can race a provider-side
      // commit. Never collapse that sent write into an ordinary cancellation.
      response = await this.#request({
        method: "PUT",
        url: remoteUrl(request.location),
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": request.idempotencyKey,
          ...conditionalHeaders,
        },
        body: {
          typeId: request.typeId,
          schemaVersion: request.schemaVersion,
          content: request.content,
          metadata: request.metadata ?? {},
        },
        signal: request.signal,
      });
    } catch (error) {
      throw new DocumentWriteOutcomeUnknownError(request.location, request.idempotencyKey, undefined, { cause: error });
    }
    if (response.status === 409 || response.status === 412) {
      const currentRecord = response.body === null || response.body === undefined
        ? null
        : decodeRecord<TSerialized>(request.location, response.body);
      throw new DocumentVersionConflictError(
        request.location,
        request.expectedVersion,
        currentRecord,
      );
    }
    // A response received after the PUT reached the provider cannot prove a
    // timeout or 5xx write was rolled back. Keep Save As indeterminate until
    // the idempotency-status protocol proves the destination record.
    if (response.status === 408 || response.status === 429 || response.status >= 500) {
      throw new DocumentWriteOutcomeUnknownError(
        request.location,
        request.idempotencyKey,
        `Remote document write received indeterminate status ${response.status}.`,
      );
    }
    const error = statusError(response.status, "write");
    if (error) throw error;
    try {
      return decodeRecord<TSerialized>(request.location, response.body);
    } catch (decodeError) {
      // The PUT reached the provider and a malformed 2xx response cannot
      // prove that it was rejected. Keep the key so Save As recovery can
      // establish the exact durable record without issuing another write.
      throw new DocumentWriteOutcomeUnknownError(
        request.location,
        request.idempotencyKey,
        "Remote document write returned an unauthenticated successful response.",
        { cause: decodeError },
      );
    }
  }

  async recoverWriteByIdempotencyKey<TSerialized>(
    request: DocumentWriteRequest<TSerialized>,
    options: DocumentReadOptions = {},
  ): Promise<DocumentRecord<TSerialized> | null> {
    // Recovery queries an already-sent write. It must not inherit the original
    // caller's cancellation signal, which commonly fired because that write's
    // response was lost. A new recovery caller may provide its own signal.
    const { signal: _sentWriteSignal, ...requestWithoutSignal } = request;
    request = canonicalWriteRequest({ ...requestWithoutSignal, ...(options.signal ? { signal: options.signal } : {}) });
    const url = new URL(remoteUrl(request.location));
    url.searchParams.set("idempotencyKey", request.idempotencyKey);
    const response = await this.#request({
      method: "GET",
      url: url.href,
      headers: { "Idempotency-Key": request.idempotencyKey },
      signal: options.signal,
    });
    if (response.status === 404) return null;
    const error = statusError(response.status, "read");
    if (error) throw error;
    if (responseHeader(response.headers, "Idempotency-Key") !== request.idempotencyKey) return null;
    const record = decodeRecord<TSerialized>(request.location, response.body);
    // A plain GET response is not a recovery proof. The provider must return
    // the record attributed to this key, and its durable bytes must match the
    // exact outbound write before controller adoption can proceed.
    if (record.typeId !== request.typeId || record.schemaVersion !== request.schemaVersion ||
        canonicalDocumentJson(record.content, request.typeId) !== canonicalDocumentJson(request.content, request.typeId) ||
        canonicalDocumentJson(record.metadata, request.typeId) !== canonicalDocumentJson(request.metadata ?? {}, request.typeId)) {
      return null;
    }
    return record;
  }

  async remove(location: DocumentLocation, expectedVersion: DocumentVersion, options: DocumentReadOptions = {}): Promise<void> {
    location = canonicalLocation(location);
    expectedVersion = canonicalVersion(expectedVersion);
    const response = await this.#request({
      method: "DELETE",
      url: remoteUrl(location),
      headers: { "If-Match": expectedVersion.etag },
      signal: options.signal,
    });
    if (response.status === 409 || response.status === 412) {
      throw new DocumentVersionConflictError(
        location,
        expectedVersion,
        response.body === null || response.body === undefined ? null : decodeRecord(location, response.body),
      );
    }
    const error = statusError(response.status, "remove");
    if (error) throw error;
  }

  async list(query: DocumentListQuery): Promise<readonly DocumentRecord<unknown>[]> {
    throwIfDocumentAborted(query.signal);
    if (query.locationKind && query.locationKind !== "remote") return Object.freeze([]);
    throw new DocumentUnavailableError("Remote document listing requires a service-specific collection endpoint.", { retryable: false });
  }

  async listVersions(location: DocumentLocation, options: DocumentReadOptions = {}): Promise<readonly DocumentVersion[]> {
    location = canonicalLocation(location);
    const url = new URL(remoteUrl(location));
    url.searchParams.set("versions", "1");
    const response = await this.#request({ method: "GET", url: url.href, headers: {}, signal: options.signal });
    const error = statusError(response.status, "read");
    if (error) throw error;
    const body = immutableDocumentValue(response.body, "remote.document");
    if (!Array.isArray(body) || !body.every(isVersion)) {
      throw new DocumentSchemaError("remote.document", "Remote version response body is malformed.");
    }
    return Object.freeze(body.map((version) => structuredClone(version)));
  }

  async readVersion<TSerialized>(location: DocumentLocation, version: DocumentVersion, options: DocumentReadOptions = {}): Promise<DocumentRecord<TSerialized> | null> {
    location = canonicalLocation(location);
    version = canonicalVersion(version);
    const url = new URL(remoteUrl(location));
    url.searchParams.set("version", version.id);
    const response = await this.#request({ method: "GET", url: url.href, headers: {}, signal: options.signal });
    if (response.status === 404) return null;
    const error = statusError(response.status, "read");
    if (error) throw error;
    return decodeRecord<TSerialized>(location, response.body);
  }

  async #request(request: DocumentRemoteRequest): Promise<DocumentRemoteResponse> {
    throwIfDocumentAborted(request.signal);
    try {
      const response = await this.transport.request(request);
      const canonical = immutableDocumentValue(response, "remote.document") as DocumentRemoteResponse;
      if (!isObject(canonical) || !Number.isSafeInteger(canonical.status) ||
          !isObject(canonical.headers) ||
          !Object.values(canonical.headers).every((value) => typeof value === "string") ||
          !("body" in canonical)) {
        throw new DocumentSchemaError("remote.document", "Remote transport response envelope is malformed.");
      }
      return canonical;
    } catch (error) {
      if (request.signal?.aborted || (error instanceof DOMException && error.name === "AbortError") ||
          (error instanceof Error && error.name === "AbortError")) {
        throw new DocumentAbortError("The remote document request was aborted.", { cause: error });
      }
      throw error;
    }
  }
}
