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
  diffCollection,
  emptyChangeSet,
  SelectionModel,
  type ChangeSet,
  type SelectionSnapshot,
} from "../../SynCloudOS/Models";
import { defineSyncUndoAction } from "../../SynCloudOS/nseRuntimeContracts";
import {
  ControllerEditingStateError,
  ControllerReadOnlyError,
  NSEController,
  type ControllerCommitResult,
  type ControllerEditTransaction,
  type ControllerValidationIssue,
} from "./NSEController";
import { ownImmutable } from "./immutableValue";

export interface NSEDictionaryEntry<TValue> {
  readonly key: string;
  readonly value: TValue | undefined;
  readonly present: boolean;
  readonly isExplicitlyIncluded: boolean;
}

export interface DictionaryControllerOptions<TValue> {
  readonly id: string;
  readonly responderId?: string;
  readonly content?: Readonly<Record<string, TValue>>;
  readonly includedKeys?: readonly string[];
  readonly excludedKeys?: readonly string[];
  readonly initialKey?: string;
  readonly initialValue?: TValue | (() => TValue);
  readonly editable?: boolean;
  readonly compareKeys?: (left: string, right: string) => number;
  readonly clone?: (value: TValue) => TValue;
  readonly selection?: {
    readonly mode: "single" | "multiple";
    readonly allowsEmpty: boolean;
  };
}

export interface DictionaryControllerSnapshot<TValue> {
  readonly revision: number;
  readonly content: Readonly<Record<string, TValue>>;
  readonly entries: readonly NSEDictionaryEntry<TValue>[];
  readonly includedKeys: readonly string[];
  readonly excludedKeys: readonly string[];
  readonly selection: SelectionSnapshot<string>;
  readonly changeSet: ChangeSet<string, NSEDictionaryEntry<TValue>>;
  readonly draftContent: Readonly<Record<string, TValue>> | null;
  readonly editable: boolean;
  readonly isEditing: boolean;
  readonly issues: readonly ControllerValidationIssue[];
}

export type DictionaryMutationResult =
  | { readonly status: "updated"; readonly key: string }
  | {
      readonly status: "renamed";
      readonly previousKey: string;
      readonly key: string;
    }
  | { readonly status: "conflict"; readonly key: string }
  | { readonly status: "invalid"; readonly key: string; readonly message: string }
  | { readonly status: "missing"; readonly key: string };

export interface DictionaryControllerChange<TValue> {
  readonly kind:
    | "content"
    | "editing"
    | "selection"
    | "included-keys"
    | "excluded-keys"
    | "validation";
  readonly snapshot: DictionaryControllerSnapshot<TValue>;
}

interface PreparedDictionaryRows<TValue> {
  readonly content: Readonly<Record<string, TValue>>;
  readonly draftContent: Readonly<Record<string, TValue>> | null;
  readonly includedKeys: readonly string[];
  readonly excludedKeys: readonly string[];
  readonly entries: readonly NSEDictionaryEntry<TValue>[];
}

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function keyProblem(key: string): string | null {
  if (key.trim().length === 0) return "Dictionary keys must not be empty.";
  if (key.includes("\0")) return "Dictionary keys must not contain NUL.";
  if (FORBIDDEN_KEYS.has(key)) return `Dictionary key "${key}" is unsafe.`;
  return null;
}

function validateKey(key: string): void {
  const problem = keyProblem(key);
  if (problem) throw new TypeError(problem);
}

function ownDataDictionaryEntries<TValue>(
  content: Readonly<Record<string, TValue>>,
): readonly (readonly [string, TValue])[] {
  try {
    if (typeof content !== "object" || content === null || Array.isArray(content)) {
      throw new TypeError("Dictionary content must be an own-data record.");
    }
    const prototype = Object.getPrototypeOf(content);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Dictionary content must be an own-data record.");
    }
    const descriptors = Object.getOwnPropertyDescriptors(content);
    const entries: Array<readonly [string, TValue]> = [];
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== "string") {
        throw new TypeError("Dictionary content must be an own-data record.");
      }
      const descriptor = descriptors[key]!;
      if (!Object.hasOwn(descriptor, "value")) {
        throw new TypeError("Dictionary content must be an own-data record.");
      }
      validateKey(key);
      entries.push([key, descriptor.value as TValue]);
    }
    return entries;
  } catch (error) {
    if (
      error instanceof TypeError &&
      (error.message.startsWith("Dictionary key") ||
        error.message.startsWith("Dictionary content must be an own-data record."))
    ) {
      throw error;
    }
    throw new TypeError("Dictionary content must be an own-data record.");
  }
}

function freezeSnapshot<TValue>(
  snapshot: DictionaryControllerSnapshot<TValue>,
): DictionaryControllerSnapshot<TValue> {
  return Object.freeze({
    ...snapshot,
    content: Object.freeze(snapshot.content),
    entries: Object.freeze(snapshot.entries),
    includedKeys: Object.freeze(snapshot.includedKeys),
    excludedKeys: Object.freeze(snapshot.excludedKeys),
    draftContent:
      snapshot.draftContent === null
        ? null
        : Object.freeze(snapshot.draftContent),
    issues: Object.freeze(snapshot.issues.map((issue) => Object.freeze({ ...issue }))),
  });
}

function codePointCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameKeys(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length && left.every((key, index) => key === right[index])
  );
}

export class NSEDictionaryController<TValue> extends NSEController<
  DictionaryControllerSnapshot<TValue>,
  DictionaryControllerChange<TValue>
> {
  readonly #clone: (value: TValue) => TValue;
  readonly #compareKeys: (left: string, right: string) => number;
  readonly #selection: SelectionModel<string>;
  #snapshot: DictionaryControllerSnapshot<TValue>;
  #initialKey: string;
  #initialValue: TValue | (() => TValue);
  #selectionBeforeEdit: SelectionSnapshot<string> | null = null;
  #changedDuringEdit = false;

  constructor(options: DictionaryControllerOptions<TValue>) {
    super({ id: options.id, responderId: options.responderId });
    this.#clone = options.clone ?? structuredClone;
    this.#compareKeys = options.compareKeys ?? codePointCompare;
    this.#initialKey = options.initialKey ?? "key";
    validateKey(this.#initialKey);
    this.#initialValue = options.initialValue as TValue | (() => TValue);
    const includedKeys = this.#normaliseKeys(options.includedKeys ?? []);
    const excludedKeys = this.#normaliseKeys(options.excludedKeys ?? []);
    const content = this.#ownedDictionary(options.content ?? {});
    this.#selection = new SelectionModel({
      mode: options.selection?.mode ?? "multiple",
      allowsEmpty: options.selection?.allowsEmpty ?? true,
    });
    const entries = this.#deriveEntries(content, includedKeys, excludedKeys, []);
    this.#snapshot = freezeSnapshot({
      revision: 0,
      content,
      entries,
      includedKeys,
      excludedKeys,
      selection: this.#selection.getSnapshot(),
      changeSet: emptyChangeSet<string, NSEDictionaryEntry<TValue>>(),
      draftContent: null,
      editable: options.editable ?? true,
      isEditing: false,
      issues: [],
    });
  }

  getSnapshot = (): DictionaryControllerSnapshot<TValue> => this.#snapshot;

  setContentDictionary(content: Readonly<Record<string, TValue>>): void {
    this.assertActive();
    if (this.editTransaction) {
      throw new ControllerEditingStateError(
        "Discard or commit the current edit before replacing content.",
      );
    }
    this.#applyCommittedDictionary(this.#ownedDictionary(content));
  }

  setIncludedKeys(keys: readonly string[]): void {
    this.assertActive();
    const next = this.#normaliseKeys(keys);
    if (sameKeys(next, this.#snapshot.includedKeys)) return;
    this.#publishRows("included-keys", { includedKeys: next });
  }

  setExcludedKeys(keys: readonly string[]): void {
    this.assertActive();
    const next = this.#normaliseKeys(keys);
    if (sameKeys(next, this.#snapshot.excludedKeys)) return;
    this.#publishRows("excluded-keys", { excludedKeys: next });
  }

  setInitialEntry(key: string, value: TValue | (() => TValue)): void {
    this.assertActive();
    validateKey(key);
    this.#initialKey = key;
    this.#initialValue = value;
  }

  beginEditing(transaction: ControllerEditTransaction): void {
    if (!this.#snapshot.editable) throw new ControllerReadOnlyError();
    if (this.editTransaction?.id === transaction.id) return;
    this.beginEditTransaction(transaction);
    this.#selectionBeforeEdit = this.#selection.getSnapshot();
    this.#changedDuringEdit = false;
    this.#replace("editing", {
      draftContent: this.#cloneDictionary(this.#snapshot.content),
      isEditing: true,
      issues: [],
    });
  }

  insert(): string {
    const draft = this.#requireDraft();
    const unavailable = new Set([
      ...Object.keys(draft),
      ...this.#snapshot.includedKeys,
    ]);
    let key = this.#initialKey;
    let suffix = 0;
    while (unavailable.has(key)) key = `${this.#initialKey}${++suffix}`;
    const initial =
      typeof this.#initialValue === "function"
        ? (this.#initialValue as () => TValue)()
        : this.#initialValue;
    const next = this.#mutableDictionary(draft);
    next[key] = this.#ownedValue(initial);
    this.#publishDraft(next);
    return key;
  }

  remove(keys: Iterable<string>): void {
    const draft = this.#requireDraft();
    const removing = [...new Set(keys)];
    if (removing.length === 0) return;
    const next = this.#mutableDictionary(draft);
    let changed = false;
    for (const key of removing) {
      validateKey(key);
      if (Object.hasOwn(next, key)) {
        delete next[key];
        changed = true;
      }
    }
    if (!changed) return;
    this.#publishDraft(next);
  }

  renameKey(previousKey: string, key: string): DictionaryMutationResult {
    const draft = this.#requireDraft();
    const problem = keyProblem(key);
    if (problem) return { status: "invalid", key, message: problem };
    if (!Object.hasOwn(draft, previousKey)) {
      return { status: "missing", key: previousKey };
    }
    if (previousKey === key) {
      return { status: "renamed", previousKey, key };
    }
    if (
      Object.hasOwn(draft, key) ||
      this.#snapshot.entries.some((entry) => entry.key === key)
    ) {
      return { status: "conflict", key };
    }
    const next = Object.create(null) as Record<string, TValue>;
    for (const existing of Object.keys(draft)) {
      next[existing === previousKey ? key : existing] = draft[existing]!;
    }
    const selected = this.#selection.getSnapshot();
    if (selected.selectedIds.has(previousKey)) {
      const ids = [...selected.selectedIds].map((id) =>
        id === previousKey ? key : id,
      );
      this.#selection.replace(
        ids,
        selected.focusId === previousKey ? key : selected.focusId,
        selected.anchorId === previousKey ? key : selected.anchorId,
      );
    }
    this.#publishDraft(next);
    return { status: "renamed", previousKey, key };
  }

  setValue(key: string, value: TValue): DictionaryMutationResult {
    const draft = this.#requireDraft();
    const problem = keyProblem(key);
    if (problem) return { status: "invalid", key, message: problem };
    const isIncluded = this.#snapshot.includedKeys.includes(key);
    if (!Object.hasOwn(draft, key) && !isIncluded) {
      return { status: "missing", key };
    }
    const nextValue = this.#ownedValue(value);
    if (Object.hasOwn(draft, key) && Object.is(draft[key], nextValue)) {
      return { status: "updated", key };
    }
    const next = this.#mutableDictionary(draft);
    next[key] = nextValue;
    this.#publishDraft(next);
    return { status: "updated", key };
  }

  select(keys: Iterable<string>): boolean {
    this.assertActive();
    const available = new Set(this.#snapshot.entries.map(({ key }) => key));
    const requested = [...keys];
    if (requested.some((key) => !available.has(key))) {
      throw new RangeError("Selection contains an unknown dictionary key.");
    }
    const changed = this.#selection.replace(
      requested,
      requested.at(-1) ?? null,
    );
    if (!changed) return false;
    this.#replace("selection", { selection: this.#selection.getSnapshot() });
    return true;
  }

  commitEditing(): ControllerCommitResult {
    this.assertActive();
    const transaction = this.editTransaction;
    const draft = this.#snapshot.draftContent;
    if (!transaction || draft === null) return { status: "not-editing" };
    if (this.#snapshot.issues.length > 0) {
      return {
        status: "invalid",
        transactionId: transaction.id,
        issues: this.#snapshot.issues,
      };
    }
    const before = this.#captureDictionary(this.#snapshot.content);
    const beforeSelection = this.#selectionBeforeEdit!;
    const after = this.#captureDictionary(draft);
    const afterSelection = this.#selection.getSnapshot();
    const changed = this.#changedDuringEdit;
    const committedAfter = this.#cloneDictionary(after);
    const preparedAfter = this.#prepareRows({
      content: committedAfter,
      draftContent: null,
      isEditing: false,
      issues: [],
    });
    const undoActionId =
      changed && transaction.undoManager
        ? transaction.undoManager.register(
            defineSyncUndoAction({
              name: transaction.actionName,
              asyncPolicy: "forbid",
              undo: () => this.#applyCommittedDictionary(before, beforeSelection),
              redo: () => this.#applyCommittedDictionary(after, afterSelection),
            }),
            transaction.automaticGroup
              ? { automaticGroup: transaction.automaticGroup }
              : undefined,
          )
        : null;
    this.editTransaction = null;
    this.#selectionBeforeEdit = null;
    this.#changedDuringEdit = false;
    this.#applyCommittedDictionary(committedAfter, afterSelection, preparedAfter);
    return {
      status: "committed",
      transactionId: transaction.id,
      undoActionId,
    };
  }

  discardEditing(): void {
    if (!this.editTransaction) return;
    const selection = this.#selectionBeforeEdit;
    this.editTransaction = null;
    this.#selectionBeforeEdit = null;
    this.#changedDuringEdit = false;
    if (selection) this.#restoreSelection(selection);
    this.#publishRows("editing", {
      draftContent: null,
      isEditing: false,
    });
  }

  #normaliseKeys(keys: readonly string[]): readonly string[] {
    const result = [...new Set(keys)];
    result.forEach(validateKey);
    return Object.freeze(result);
  }

  #ownedValue(value: TValue): TValue {
    return ownImmutable(value, this.#clone);
  }

  #ownedDictionary(
    content: Readonly<Record<string, TValue>>,
  ): Readonly<Record<string, TValue>> {
    const next = Object.create(null) as Record<string, TValue>;
    for (const [key, value] of ownDataDictionaryEntries(content)) {
      next[key] = this.#ownedValue(value);
    }
    return this.#publishDictionary(next);
  }

  #cloneDictionary(
    content: Readonly<Record<string, TValue>>,
  ): Readonly<Record<string, TValue>> {
    const next = Object.create(null) as Record<string, TValue>;
    for (const key of Object.keys(content)) next[key] = content[key]!;
    return this.#publishDictionary(next);
  }

  #captureDictionary(
    content: Readonly<Record<string, TValue>>,
  ): Readonly<Record<string, TValue>> {
    return Object.freeze(this.#mutableDictionary(content));
  }

  #mutableDictionary(
    content: Readonly<Record<string, TValue>>,
  ): Record<string, TValue> {
    const next = Object.create(null) as Record<string, TValue>;
    for (const key of Object.keys(content)) next[key] = content[key]!;
    return next;
  }

  #publishDictionary(
    content: Readonly<Record<string, TValue>>,
  ): Readonly<Record<string, TValue>> {
    const ordinary: Record<string, TValue> = {};
    for (const key of Object.keys(content)) {
      Object.defineProperty(ordinary, key, {
        value: content[key],
        enumerable: true,
        configurable: false,
        writable: false,
      });
    }
    return Object.freeze(ordinary);
  }

  #deriveEntries(
    content: Readonly<Record<string, TValue>>,
    includedKeys: readonly string[],
    excludedKeys: readonly string[],
    previous: readonly NSEDictionaryEntry<TValue>[],
  ): readonly NSEDictionaryEntry<TValue>[] {
    const included = new Set(includedKeys);
    const excluded = new Set(excludedKeys);
    const keys = new Set([...Object.keys(content), ...includedKeys]);
    const previousByKey = new Map(previous.map((entry) => [entry.key, entry]));
    return Object.freeze(
      [...keys]
        .filter((key) => !excluded.has(key))
        .sort(this.#compareKeys)
        .map((key) => {
          const present = Object.hasOwn(content, key);
          const value = present ? content[key] : undefined;
          const isExplicitlyIncluded = included.has(key);
          const prior = previousByKey.get(key);
          if (
            prior &&
            prior.present === present &&
            prior.isExplicitlyIncluded === isExplicitlyIncluded &&
            Object.is(prior.value, value)
          ) {
            return prior;
          }
          return Object.freeze({ key, value, present, isExplicitlyIncluded });
        }),
    );
  }

  #publishRows(
    kind: DictionaryControllerChange<TValue>["kind"],
    patch: Partial<
      Omit<DictionaryControllerSnapshot<TValue>, "revision" | "editable" | "entries" | "changeSet">
    >,
  ): void {
    const prepared = this.#prepareRows(patch);
    this.#publishPreparedRows(kind, patch, prepared);
  }

  #prepareRows(
    patch: Partial<
      Omit<DictionaryControllerSnapshot<TValue>, "revision" | "editable" | "entries" | "changeSet">
    >,
  ): PreparedDictionaryRows<TValue> {
    const includedKeys = patch.includedKeys ?? this.#snapshot.includedKeys;
    const excludedKeys = patch.excludedKeys ?? this.#snapshot.excludedKeys;
    const content = patch.content ?? this.#snapshot.content;
    const draftContent =
      patch.draftContent === undefined
        ? this.#snapshot.draftContent
        : patch.draftContent;
    const active = draftContent ?? content;
    const entries = this.#deriveEntries(
      active,
      includedKeys,
      excludedKeys,
      this.#snapshot.entries,
    );
    return { content, draftContent, includedKeys, excludedKeys, entries };
  }

  #publishPreparedRows(
    kind: DictionaryControllerChange<TValue>["kind"],
    patch: Partial<
      Omit<DictionaryControllerSnapshot<TValue>, "revision" | "editable" | "entries" | "changeSet">
    >,
    prepared: PreparedDictionaryRows<TValue>,
  ): void {
    const {
      content,
      draftContent,
      includedKeys,
      excludedKeys,
      entries,
    } = prepared;
    this.#selection.reconcile(entries.map(({ key }) => key));
    const changeSet = diffCollection(
      this.#snapshot.entries,
      entries,
      (entry) => entry.key,
      (left, right) => left === right,
      this.#snapshot.changeSet.revision + 1,
    );
    this.#replace(kind, {
      ...patch,
      content,
      draftContent,
      includedKeys,
      excludedKeys,
      entries,
      selection: this.#selection.getSnapshot(),
      changeSet,
    });
  }

  #publishDraft(content: Readonly<Record<string, TValue>>): void {
    const draftContent = this.#publishDictionary(content);
    this.#changedDuringEdit = true;
    this.#publishRows("content", { draftContent, issues: [] });
  }

  #requireDraft(): Readonly<Record<string, TValue>> {
    this.assertActive();
    if (!this.#snapshot.editable) throw new ControllerReadOnlyError();
    if (!this.editTransaction || this.#snapshot.draftContent === null) {
      throw new ControllerEditingStateError(
        "Begin editing before changing dictionary content.",
      );
    }
    return this.#snapshot.draftContent;
  }

  #restoreSelection(snapshot: SelectionSnapshot<string>): void {
    this.#selection.replace(
      snapshot.selectedIds,
      snapshot.focusId,
      snapshot.anchorId,
    );
  }

  #applyCommittedDictionary(
    content: Readonly<Record<string, TValue>>,
    selection?: SelectionSnapshot<string>,
    prepared?: PreparedDictionaryRows<TValue>,
  ): void {
    const owned = prepared ? content : this.#cloneDictionary(content);
    if (selection) this.#restoreSelection(selection);
    const patch = {
      content: owned,
      draftContent: null,
      isEditing: false,
      issues: [],
    };
    if (prepared) this.#publishPreparedRows("content", patch, prepared);
    else this.#publishRows("content", patch);
  }

  #replace(
    kind: DictionaryControllerChange<TValue>["kind"],
    patch: Partial<Omit<DictionaryControllerSnapshot<TValue>, "revision" | "editable">>,
  ): void {
    this.#snapshot = freezeSnapshot({
      ...this.#snapshot,
      ...patch,
      revision: this.#snapshot.revision + 1,
    });
    this.publish({ kind, snapshot: this.#snapshot });
  }
}
