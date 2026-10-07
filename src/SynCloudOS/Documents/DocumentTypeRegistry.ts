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

import { DocumentSchemaError, DocumentTypeRegistrationError, UnknownDocumentTypeError } from "./DocumentErrors";
import { immutableDocumentValue } from "./documentTypes";
import type { DocumentMigration, DocumentType, DocumentTypeAdmission, DocumentTypeRegistration } from "./documentTypes";

const TYPE_ID = /^(?:[a-z][a-z0-9-]*\.)+[a-z][a-z0-9-]*$/;
const MIME_TYPE = /^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/;
const EXTENSION = /^[a-z0-9][a-z0-9._+-]*$/i;

function normaliseExtension(extension: string): string {
  return extension.replace(/^\./, "").toLocaleLowerCase("en-US");
}

function validateDocumentType(type: DocumentType<unknown, unknown>): void {
  if (!TYPE_ID.test(type.id)) throw new TypeError("Document type IDs must use reverse-DNS syntax.");
  if (!type.displayName.trim()) throw new TypeError("Document type display names must not be empty.");
  if (!Number.isSafeInteger(type.schemaVersion) || type.schemaVersion <= 0) {
    throw new TypeError("Document schema versions must be positive safe integers.");
  }
  const extensions = type.extensions.map(normaliseExtension);
  if (extensions.some((extension) => !EXTENSION.test(extension) || extension.includes("*"))) {
    throw new TypeError("Document extensions must be literal extension names without wildcards.");
  }
  if (new Set(extensions).size !== extensions.length) throw new TypeError("Document extensions must be unique.");
  if (type.mimeTypes.some((mimeType) => !MIME_TYPE.test(mimeType))) throw new TypeError("Document MIME types must be valid.");
  if (new Set(type.mimeTypes.map((value) => value.toLocaleLowerCase("en-US"))).size !== type.mimeTypes.length) {
    throw new TypeError("Document MIME types must be unique.");
  }
  if (typeof type.autosave === "object" && (
    !Number.isSafeInteger(type.autosave.delayMs) || type.autosave.delayMs < 100 || type.autosave.delayMs > 60_000
  )) {
    throw new TypeError("Debounced autosave delay must be between 100 and 60000 milliseconds.");
  }
}

function snapshotDocumentType(type: DocumentType<unknown, unknown>): DocumentType<unknown, unknown> {
  const capabilities = Object.freeze({
    versions: Boolean(type.capabilities.versions),
    conflicts: Boolean(type.capabilities.conflicts),
  });
  const autosave = typeof type.autosave === "object"
    ? Object.freeze({ mode: "debounced" as const, delayMs: type.autosave.delayMs })
    : type.autosave;
  const migrations = type.migrations
    ? Object.freeze(Object.fromEntries(Object.entries(type.migrations).map(([version, migrate]) => [version, migrate]))) as Readonly<Record<number, DocumentMigration>>
    : undefined;
  return Object.freeze({
    id: String(type.id),
    displayName: String(type.displayName),
    schemaVersion: type.schemaVersion,
    extensions: Object.freeze([...type.extensions]),
    mimeTypes: Object.freeze([...type.mimeTypes]),
    ...(type.creatingApplicationId === undefined ? {} : { creatingApplicationId: String(type.creatingApplicationId) }),
    ...(type.openingApplicationIds === undefined ? {} : { openingApplicationIds: Object.freeze([...type.openingApplicationIds]) }),
    capabilities,
    ...(type.requiredAdapterCapabilities === undefined ? {} : { requiredAdapterCapabilities: Object.freeze([...type.requiredAdapterCapabilities]) }),
    autosave,
    create: type.create,
    read: type.read,
    write: type.write,
    validate: type.validate,
    ...(migrations ? { migrations } : {}),
  });
}

function schemaVersionOf(value: unknown, typeId: string): number {
  if (!value || typeof value !== "object" || !("schemaVersion" in value)) {
    throw new DocumentSchemaError(typeId, `Document content for "${typeId}" has no schema version.`);
  }
  const version = value.schemaVersion;
  if (!Number.isSafeInteger(version) || (version as number) <= 0) {
    throw new DocumentSchemaError(typeId, `Document content for "${typeId}" has an invalid schema version.`);
  }
  return version as number;
}

export function migrateDocumentPayload<TSerialized>(
  type: DocumentType<unknown, TSerialized>,
  input: unknown,
  declaredSchemaVersion?: number,
): TSerialized {
  let value = immutableDocumentValue(input, type.id);
  let version = declaredSchemaVersion ?? schemaVersionOf(value, type.id);
  if (!Number.isSafeInteger(version) || version <= 0) {
    throw new DocumentSchemaError(type.id, `Document content for "${type.id}" has an invalid schema version.`);
  }
  if (declaredSchemaVersion !== undefined && value && typeof value === "object" && "schemaVersion" in value) {
    const embedded = schemaVersionOf(value, type.id);
    if (embedded !== declaredSchemaVersion) {
      throw new DocumentSchemaError(type.id, `Document content for "${type.id}" does not match its declared schema version.`);
    }
  }
  if (version > type.schemaVersion) {
    throw new DocumentSchemaError(type.id, `Document content for "${type.id}" uses a future schema version.`);
  }
  while (version < type.schemaVersion) {
    const migration = type.migrations?.[version] as DocumentMigration | undefined;
    if (!migration) throw new DocumentSchemaError(type.id, `Missing migration ${version} for "${type.id}".`);
    value = immutableDocumentValue(migration(value as never), type.id);
    const nextVersion = schemaVersionOf(value, type.id);
    if (nextVersion !== version + 1) {
      throw new DocumentSchemaError(type.id, `Migration ${version} for "${type.id}" must advance exactly one version.`);
    }
    version = nextVersion;
  }
  return value as TSerialized;
}

export class DocumentTypeRegistry {
  readonly #types = new Map<string, DocumentType<unknown, unknown>>();
  readonly #extensions = new Map<string, string>();
  readonly #mimeTypes = new Map<string, string>();
  readonly #generations = new Map<string, number>();
  #nextGeneration = 0;

  register<TModel, TSerialized>(type: DocumentType<TModel, TSerialized>): DocumentTypeRegistration {
    const snapshot = snapshotDocumentType(type as DocumentType<unknown, unknown>);
    validateDocumentType(snapshot);
    if (this.#types.has(snapshot.id)) throw new DocumentTypeRegistrationError(snapshot.id);
    for (const extension of snapshot.extensions) {
      const normalised = normaliseExtension(extension);
      const owner = this.#extensions.get(normalised);
      if (owner) throw new DocumentTypeRegistrationError(snapshot.id, `Extension "${extension}" is already registered by "${owner}".`);
    }
    for (const mimeType of snapshot.mimeTypes) {
      const normalised = mimeType.toLocaleLowerCase("en-US");
      const owner = this.#mimeTypes.get(normalised);
      if (owner) throw new DocumentTypeRegistrationError(snapshot.id, `MIME type "${mimeType}" is already registered by "${owner}".`);
    }
    const erased = snapshot;
    const generation = ++this.#nextGeneration;
    this.#types.set(snapshot.id, erased);
    this.#generations.set(snapshot.id, generation);
    for (const extension of snapshot.extensions) this.#extensions.set(normaliseExtension(extension), snapshot.id);
    for (const mimeType of snapshot.mimeTypes) this.#mimeTypes.set(mimeType.toLocaleLowerCase("en-US"), snapshot.id);
    let disposed = false;
    return {
      dispose: () => {
        if (disposed) return;
        disposed = true;
        if (this.#types.get(snapshot.id) !== erased) return;
        this.#types.delete(snapshot.id);
        for (const extension of snapshot.extensions) {
          const key = normaliseExtension(extension);
          if (this.#extensions.get(key) === snapshot.id) this.#extensions.delete(key);
        }
        for (const mimeType of snapshot.mimeTypes) {
          const key = mimeType.toLocaleLowerCase("en-US");
          if (this.#mimeTypes.get(key) === snapshot.id) this.#mimeTypes.delete(key);
        }
      },
    };
  }

  has(typeId: string): boolean { return this.#types.has(typeId); }

  admission(typeId: string): DocumentTypeAdmission {
    const type = this.require(typeId);
    const generation = this.#generations.get(typeId);
    if (generation === undefined) throw new UnknownDocumentTypeError(typeId);
    return Object.freeze({ type, generation });
  }

  isCurrent(admission: DocumentTypeAdmission): boolean {
    return this.#types.get(admission.type.id) === admission.type && this.#generations.get(admission.type.id) === admission.generation;
  }

  forExtension(extension: string): DocumentType<unknown, unknown> | null {
    const typeId = this.#extensions.get(normaliseExtension(extension));
    return typeId ? this.#types.get(typeId) ?? null : null;
  }

  require(typeId: string): DocumentType<unknown, unknown> {
    const type = this.#types.get(typeId);
    if (!type) throw new UnknownDocumentTypeError(typeId);
    return type;
  }

  decode<TModel, TSerialized>(typeId: string, input: unknown): TModel {
    const type = this.require(typeId) as DocumentType<TModel, TSerialized>;
    const migrated = migrateDocumentPayload(type as DocumentType<unknown, TSerialized>, input);
    if (!type.validate(migrated)) throw new DocumentSchemaError(typeId);
    return type.read(migrated, { typeId, schemaVersion: type.schemaVersion });
  }

  decodeVersioned<TModel, TSerialized>(typeId: string, input: unknown, schemaVersion: number): TModel {
    const type = this.require(typeId) as DocumentType<TModel, TSerialized>;
    const migrated = migrateDocumentPayload(type as DocumentType<unknown, TSerialized>, input, schemaVersion);
    if (!type.validate(migrated)) throw new DocumentSchemaError(typeId);
    return type.read(migrated, { typeId, schemaVersion: type.schemaVersion });
  }
}
