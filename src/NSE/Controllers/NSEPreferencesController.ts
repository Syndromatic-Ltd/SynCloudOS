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

import { defineSyncUndoAction } from "../../SynCloudOS/nseRuntimeContracts";
import {
  ControllerEditingStateError,
  NSEController,
  type NSEControllerOwnership,
  type ControllerCommitResult,
  type ControllerEditTransaction,
  type ControllerValidationIssue,
} from "./NSEController";
import { mutableClone, ownImmutable } from "./immutableValue";

export interface PreferencesAdapter {
  read(key: string): unknown;
  write(key: string, value: unknown): void | PromiseLike<void>;
  remove(key: string): void;
}

export interface PreferencesMigration {
  readonly from: number;
  readonly to: number;
  readonly migrate: (
    value: Record<string, unknown>,
  ) => Record<string, unknown>;
}

export interface PreferencesSchema<T extends object> {
  readonly version: number;
  readonly defaults: T;
  readonly fields: {
    readonly [K in keyof T]: {
      validate(value: unknown): value is T[K];
    };
  };
  readonly migrations: readonly PreferencesMigration[];
}

export interface PreferencesSnapshot<T extends object> {
  readonly revision: number;
  readonly value: Readonly<T>;
  readonly committed: Readonly<T>;
  readonly dirty: boolean;
  readonly issues: readonly ControllerValidationIssue[];
}

export interface PreferencesControllerChange<T extends object> {
  readonly kind: "preference";
  readonly keys: readonly (keyof T)[];
}

export interface PreferencesControllerOptions<T extends object> extends NSEControllerOwnership {
  readonly namespace: string;
  readonly responderId?: string;
  readonly schema: PreferencesSchema<T>;
  readonly adapter: PreferencesAdapter;
}

export class PreferenceValidationError extends Error {
  constructor(readonly key: string) {
    super(`Preference "${key}" failed schema validation.`);
    this.name = "PreferenceValidationError";
  }
}

export class PreferenceMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreferenceMigrationError";
  }
}

export class PreferencePersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreferencePersistenceError";
  }
}

interface HydratedPreferences<T extends object> {
  readonly value: T;
  readonly issues: readonly ControllerValidationIssue[];
  readonly writeForward: boolean;
}

const PREFERENCE_ENVELOPE_TAG = "syncloudos:nse-preferences:v1";

type PreferenceEnvelope = readonly [
  typeof PREFERENCE_ENVELOPE_TAG,
  number,
  Readonly<Record<string, unknown>>,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTaggedEnvelope(value: unknown): value is PreferenceEnvelope {
  if (!Array.isArray(value) || value.length !== 3) return false;
  const [tag, version, values] = value;
  return (
    tag === PREFERENCE_ENVELOPE_TAG &&
    typeof version === "number" &&
    Number.isSafeInteger(version) &&
    version >= 0 &&
    isRecord(values)
  );
}

function isPriorObjectEnvelope<T extends object>(
  value: Record<string, unknown>,
  schema: PreferencesSchema<T>,
): value is { readonly version: number; readonly values: Record<string, unknown> } {
  const version = value.version;
  const values = value.values;
  if (
    !Object.hasOwn(value, "version") ||
    !Object.hasOwn(value, "values") ||
    !Object.keys(value).every((key) => key === "version" || key === "values") ||
    typeof version !== "number" ||
    !Number.isSafeInteger(version) ||
    version < 0 ||
    !isRecord(values)
  ) {
    return false;
  }
  // The former object envelope has exactly the same outer shape as a legal
  // flat legacy record when the schema owns `values`. Preserve the raw record
  // in that ambiguous case; the tagged tuple is the only collision-proof form.
  return !Object.hasOwn(schema.defaults, "values");
}

function clone<T>(value: T): T {
  return mutableClone(value);
}

function thenable(result: unknown): boolean {
  if (
    (typeof result !== "object" && typeof result !== "function") ||
    result === null
  ) {
    return false;
  }
  return typeof Reflect.get(result, "then") === "function";
}

function requireSynchronousWrite(result: void | PromiseLike<void>): void {
  try {
    if (!thenable(result)) return;
    void Promise.resolve(result).catch(() => undefined);
  } catch {
    throw new PreferencePersistenceError(
      "Preference adapter writes must complete synchronously.",
    );
  }
  throw new PreferencePersistenceError(
    "Preference adapter writes must complete synchronously.",
  );
}

function observeRollbackWrite(result: unknown): void {
  try {
    if (thenable(result)) void Promise.resolve(result).catch(() => undefined);
  } catch {
    // A failed rollback must not hide the error that triggered compensation.
  }
}

export function freezePreferences<T extends object>(value: T): Readonly<T> {
  return ownImmutable(value, clone);
}

function validateSchema<T extends object>(schema: PreferencesSchema<T>): void {
  if (!Number.isSafeInteger(schema.version) || schema.version < 0) {
    throw new TypeError(
      "Preference schema version must be a non-negative safe integer.",
    );
  }
  const keys = Object.keys(schema.defaults) as (keyof T)[];
  for (const key of keys) {
    if (!Object.hasOwn(schema.fields, key)) {
      throw new TypeError(
        `Preference default "${String(key)}" does not satisfy its schema.`,
      );
    }
    const field = schema.fields[key];
    if (!field || !field.validate(schema.defaults[key])) {
      throw new TypeError(
        `Preference default "${String(key)}" does not satisfy its schema.`,
      );
    }
  }
  const seen = new Set<number>();
  for (const migration of schema.migrations) {
    if (
      !Number.isSafeInteger(migration.from) ||
      !Number.isSafeInteger(migration.to) ||
      migration.from < 0 ||
      migration.to !== migration.from + 1
    ) {
      throw new TypeError(
        "Preference migrations must connect consecutive non-negative versions.",
      );
    }
    if (seen.has(migration.from)) {
      throw new TypeError(
        `Preference migration source version ${migration.from} is duplicated.`,
      );
    }
    seen.add(migration.from);
  }
}

export function hydratePreferences<T extends object>(
  persisted: unknown,
  schema: PreferencesSchema<T>,
): HydratedPreferences<T> {
  validateSchema(schema);
  const defaults = clone(schema.defaults);
  if (persisted === null || persisted === undefined) {
    return { value: defaults, issues: Object.freeze([]), writeForward: false };
  }

  const issues: ControllerValidationIssue[] = [];
  let writeForward = false;
  let record: Record<string, unknown>;
  let version: number;
  if (isTaggedEnvelope(persisted)) {
    const [, storedVersion, storedValues] = clone(persisted);
    version = storedVersion;
    record = clone(storedValues);
  } else if (!isRecord(persisted)) {
    record = {};
    version = schema.version;
    writeForward = true;
    issues.push({
      code: "preferences.invalidRecord",
      message: "Stored preferences were not an object and were repaired.",
    });
  } else {
    const persistedRecord = clone(persisted);
    const storedVersion = persistedRecord.version;
    if (
      typeof storedVersion !== "number" ||
      !Number.isSafeInteger(storedVersion) ||
      storedVersion < 0
    ) {
      version = schema.version;
      record = {};
      writeForward = true;
      issues.push({
        code: "preferences.invalidVersion",
        message: "Stored preferences had an invalid version and were repaired.",
        field: "version",
      });
    } else {
      version = storedVersion;
      if (isPriorObjectEnvelope(persistedRecord, schema)) {
        record = clone(persistedRecord.values);
        writeForward = true;
      } else {
        record = persistedRecord;
        writeForward = true;
      }
    }
  }

  if (version > schema.version) {
    throw new PreferenceMigrationError(
      `Stored preferences are from unsupported future version ${version}; this controller supports version ${schema.version}.`,
    );
  }
  while (version < schema.version) {
    const migration = schema.migrations.find((candidate) => candidate.from === version);
    if (!migration || migration.to !== version + 1) {
      throw new PreferenceMigrationError(
        `Preference migration chain is incomplete at version ${version}.`,
      );
    }
    const migrated = migration.migrate(clone(record));
    if (!isRecord(migrated)) {
      throw new PreferenceMigrationError(
        `Preference migration ${migration.from} to ${migration.to} did not return an object.`,
      );
    }
    record = clone(migrated);
    version = migration.to;
    writeForward = true;
  }

  const value = clone(defaults) as T;
  for (const key of Object.keys(schema.defaults) as (keyof T)[]) {
    const stored = record[String(key)];
    if (schema.fields[key].validate(stored)) {
      value[key] = clone(stored);
    } else {
      writeForward = true;
      issues.push({
        code: "preferences.invalidField",
        message: `Stored preference "${String(key)}" was missing or invalid and was repaired.`,
        field: String(key),
      });
    }
  }
  return {
    value,
    issues: Object.freeze(issues.map((issue) => Object.freeze(issue))),
    writeForward,
  };
}

export function changedPreferenceKeys<T extends object>(
  left: Readonly<T>,
  right: Readonly<T>,
  keys: readonly (keyof T)[],
): readonly (keyof T)[] {
  return Object.freeze(keys.filter((key) => !Object.is(left[key], right[key])));
}

export class NSEPreferencesController<T extends object> extends NSEController<
  PreferencesSnapshot<T>,
  PreferencesControllerChange<T>
> {
  readonly #namespace: string;
  readonly #schema: PreferencesSchema<T>;
  readonly #adapter: PreferencesAdapter;
  readonly #keys: readonly (keyof T)[];
  #snapshot: PreferencesSnapshot<T>;
  #draft: T | null = null;

  constructor(options: PreferencesControllerOptions<T>) {
    super({ kind: "NSEPreferencesController", id: options.namespace, responderId: options.responderId, ownerSignal: options.ownerSignal, owner: options.owner });
    this.#namespace = options.namespace;
    this.#schema = options.schema;
    this.#adapter = options.adapter;
    this.#keys = Object.freeze(Object.keys(options.schema.defaults) as (keyof T)[]);
    const persisted = options.adapter.read(options.namespace);
    const hydrated = hydratePreferences(persisted, options.schema);
    const committed = freezePreferences(hydrated.value);
    this.#snapshot = Object.freeze({
      revision: 0,
      value: committed,
      committed,
      dirty: false,
      issues: hydrated.issues,
    });
    if (hydrated.writeForward) {
      try {
        this.#write(committed);
      } catch (error) {
        this.#restorePersisted(persisted);
        throw error;
      }
    }
  }

  getSnapshot = (): PreferencesSnapshot<T> => this.#snapshot;

  set<K extends keyof T>(key: K, value: T[K]): boolean {
    this.assertActive("set");
    if (!Object.hasOwn(this.#schema.fields, key)) {
      throw new PreferenceValidationError(String(key));
    }
    const field = this.#schema.fields[key];
    if (!field || !field.validate(value)) {
      throw new PreferenceValidationError(String(key));
    }
    const current = this.#draft ?? this.#snapshot.committed;
    if (Object.is(current[key], value)) return false;
    const next = { ...current, [key]: clone(value) } as T;
    this.#applyValue(next, [key]);
    return true;
  }

  reset(
    keys: readonly (keyof T)[] = this.#keys,
  ): boolean {
    this.assertActive("reset");
    const requested = [...new Set(keys)];
    for (const key of requested) {
      if (!Object.hasOwn(this.#schema.fields, key)) {
        throw new PreferenceValidationError(String(key));
      }
    }
    const current = this.#draft ?? this.#snapshot.committed;
    const next = { ...current } as T;
    for (const key of requested) next[key] = clone(this.#schema.defaults[key]);
    const changed = changedPreferenceKeys(current, next, requested);
    if (changed.length === 0) return false;
    this.#applyValue(next, changed);
    return true;
  }

  beginEditing(transaction: ControllerEditTransaction): void {
    if (this.editTransaction?.id === transaction.id) return;
    this.beginEditTransaction(transaction);
    this.#draft = clone(this.#snapshot.committed) as T;
    this.#replaceAndPublish([], {
      value: freezePreferences(this.#draft),
      dirty: false,
    });
  }

  commitEditing(): ControllerCommitResult {
    this.assertActive("commitEditing");
    const transaction = this.editTransaction;
    const draft = this.#draft;
    if (!transaction || !draft) return { status: "not-editing" };
    const before = freezePreferences(this.#snapshot.committed);
    const committed = freezePreferences(draft);
    const changedKeys = changedPreferenceKeys(before, committed, this.#keys);
    if (changedKeys.length === 0) {
      this.#draft = null;
      this.editTransaction = null;
      this.#replaceAndPublish([], {
        value: before,
        committed: before,
        dirty: false,
        issues: [],
      });
      return {
        status: "committed",
        transactionId: transaction.id,
        undoActionId: null,
      };
    }

    // Kernel histories can preflight; scoped histories validate at registration.
    // The rollback below also covers registration failure after persistence.
    transaction.undoManager?.assertCanRegister?.();
    const previousPersisted = this.#adapter.read(this.#namespace);
    const payload = this.#serialise(committed);
    try {
      this.#writePayload(payload);
    } catch (error) {
      this.#restorePersisted(previousPersisted);
      throw error;
    }
    let undoActionId: string | null = null;
    try {
      undoActionId = transaction.undoManager
        ? transaction.undoManager.register(
            defineSyncUndoAction({
              name: transaction.actionName,
              asyncPolicy: "forbid",
              undo: () => this.#applyCommitted(before),
              redo: () => this.#applyCommitted(committed),
            }),
            transaction.automaticGroup
              ? { automaticGroup: transaction.automaticGroup }
              : undefined,
          )
        : null;
    } catch (error) {
      this.#restorePersisted(previousPersisted);
      throw error;
    }
    this.#draft = null;
    this.editTransaction = null;
    this.#replaceAndPublish(changedKeys, {
      value: committed,
      committed,
      dirty: false,
      issues: [],
    });
    return {
      status: "committed",
      transactionId: transaction.id,
      undoActionId,
    };
  }

  discardEditing(): void {
    if (!this.editTransaction || !this.#draft) return;
    const changedKeys = changedPreferenceKeys(
      this.#snapshot.value,
      this.#snapshot.committed,
      this.#keys,
    );
    this.#draft = null;
    this.editTransaction = null;
    this.#replaceAndPublish(changedKeys, {
      value: this.#snapshot.committed,
      dirty: false,
    });
  }

  #applyValue(value: T, keys: readonly (keyof T)[]): void {
    const frozen = freezePreferences(value);
    if (this.editTransaction) {
      this.#draft = clone(frozen) as T;
      this.#replaceAndPublish(keys, {
        value: frozen,
        dirty:
          changedPreferenceKeys(this.#snapshot.committed, frozen, this.#keys)
            .length > 0,
        issues: [],
      });
    } else {
      const previousPersisted = this.#adapter.read(this.#namespace);
      try {
        this.#write(frozen);
      } catch (error) {
        this.#restorePersisted(previousPersisted);
        throw error;
      }
      this.#replaceAndPublish(keys, {
        value: frozen,
        committed: frozen,
        dirty: false,
        issues: [],
      });
    }
  }

  #applyCommitted(value: Readonly<T>): void {
    const committed = freezePreferences(value as T);
    const keys = changedPreferenceKeys(
      this.#snapshot.committed,
      committed,
      this.#keys,
    );
    const previousPersisted = this.#adapter.read(this.#namespace);
    try {
      this.#write(committed);
    } catch (error) {
      this.#restorePersisted(previousPersisted);
      throw error;
    }
    this.#replaceAndPublish(keys, {
      value: committed,
      committed,
      dirty: false,
      issues: [],
    });
  }

  #write(value: Readonly<T>): void {
    this.#writePayload(this.#serialise(value));
  }

  #serialise(value: Readonly<T>): Readonly<PreferenceEnvelope> {
    const versioned = Object.create(null) as Record<string, unknown>;
    for (const key of this.#keys) versioned[String(key)] = clone(value[key]);
    const envelope: PreferenceEnvelope = [
      PREFERENCE_ENVELOPE_TAG,
      this.#schema.version,
      Object.freeze({ ...versioned }),
    ];
    return Object.freeze(envelope);
  }

  #restorePersisted(value: unknown): void {
    try {
      if (value === null || value === undefined) {
        this.#adapter.remove(this.#namespace);
        return;
      }
      observeRollbackWrite(this.#adapter.write(this.#namespace, value));
    } catch {
      // A failed rollback must not hide the error that triggered compensation.
    }
  }

  #writePayload(value: unknown): void {
    requireSynchronousWrite(this.#adapter.write(this.#namespace, value));
  }

  #replaceAndPublish(
    keys: readonly (keyof T)[],
    patch: Partial<Omit<PreferencesSnapshot<T>, "revision">>,
  ): void {
    this.#snapshot = Object.freeze({
      ...this.#snapshot,
      ...patch,
      issues: Object.freeze([...(patch.issues ?? this.#snapshot.issues)]),
      revision: this.#snapshot.revision + 1,
    });
    this.publish({ kind: "preference", keys: Object.freeze([...keys]) });
  }
}
