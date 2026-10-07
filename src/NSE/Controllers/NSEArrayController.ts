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
  sortWithDescriptors,
  type ChangeSet,
  type ItemIdentity,
  type Predicate,
  type SelectionSnapshot,
  type SortComparator,
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

export interface ArrayControllerSelectionOptions {
  readonly mode: "single" | "multiple";
  readonly allowsEmpty: boolean;
  readonly preservesSelection?: boolean;
  readonly selectsInsertedObjects?: boolean;
}

export interface ArrayControllerOptions<T, TId extends ItemIdentity> {
  readonly id: string;
  readonly responderId?: string;
  readonly content?: readonly T[];
  readonly getId: (item: T) => TId;
  readonly equals?: (left: T, right: T) => boolean;
  readonly editable?: boolean;
  readonly clone?: (item: T) => T;
  readonly selection?: ArrayControllerSelectionOptions;
}

export interface ArrayControllerSnapshot<T, TId extends ItemIdentity> {
  readonly revision: number;
  readonly arrangementRevision: number;
  readonly selectionRevision: number;
  readonly content: readonly T[];
  readonly arranged: readonly T[];
  readonly predicate: Predicate<T> | null;
  readonly sortDescriptors: readonly SortComparator<T>[];
  readonly selection: SelectionSnapshot<TId>;
  readonly changeSet: ChangeSet<TId, T>;
  readonly editable: boolean;
  readonly isEditing: boolean;
  readonly issues: readonly ControllerValidationIssue[];
}

export interface ArrayControllerChange<T, TId extends ItemIdentity> {
  readonly kind:
    | "content"
    | "arrangement"
    | "selection"
    | "editing"
    | "validation";
  readonly snapshot: ArrayControllerSnapshot<T, TId>;
}

export interface ArrayControllerInsertion<TId extends ItemIdentity> {
  readonly beforeId?: TId;
  readonly afterId?: TId;
  readonly select?: boolean;
}

function freezeSnapshot<T, TId extends ItemIdentity>(
  snapshot: ArrayControllerSnapshot<T, TId>,
): ArrayControllerSnapshot<T, TId> {
  return Object.freeze({
    ...snapshot,
    content: Object.freeze(snapshot.content),
    arranged: Object.freeze(snapshot.arranged),
    sortDescriptors: Object.freeze(snapshot.sortDescriptors),
    issues: Object.freeze(snapshot.issues.map((issue) => Object.freeze({ ...issue }))),
  });
}

function defaultEquals<T>(left: T, right: T): boolean {
  if (Object.is(left, right)) return true;
  if (
    typeof left !== "object" ||
    left === null ||
    typeof right !== "object" ||
    right === null
  ) {
    return false;
  }
  try {
    const leftPrototype = Object.getPrototypeOf(left);
    const rightPrototype = Object.getPrototypeOf(right);
    const isPlainValue = (prototype: object | null) =>
      prototype === Object.prototype || prototype === null || prototype === Array.prototype;
    if (!isPlainValue(leftPrototype) || !isPlainValue(rightPrototype)) return false;
    if (Array.isArray(left) !== Array.isArray(right)) return false;
    if (Array.isArray(left) && left.length !== (right as unknown[]).length) {
      return false;
    }
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key) =>
          Object.hasOwn(right, key) &&
          Object.is(
            (left as Record<string, unknown>)[key],
            (right as Record<string, unknown>)[key],
          ),
      )
    );
  } catch {
    return false;
  }
}

export class NSEArrayController<T, TId extends ItemIdentity> extends NSEController<
  ArrayControllerSnapshot<T, TId>,
  ArrayControllerChange<T, TId>
> {
  readonly #getId: (item: T) => TId;
  readonly #equals: (left: T, right: T) => boolean;
  readonly #clone: (item: T) => T;
  readonly #selectionOptions: Required<ArrayControllerSelectionOptions>;
  readonly #selection: SelectionModel<TId>;
  #snapshot: ArrayControllerSnapshot<T, TId>;
  #committedContent: readonly T[];
  #selectionBeforeEdit: SelectionSnapshot<TId> | null = null;
  #changedDuringEdit = false;

  constructor(options: ArrayControllerOptions<T, TId>) {
    super({ id: options.id, responderId: options.responderId });
    this.#getId = options.getId;
    this.#equals = options.equals ?? defaultEquals;
    this.#clone = options.clone ?? structuredClone;
    this.#selectionOptions = {
      mode: options.selection?.mode ?? "multiple",
      allowsEmpty: options.selection?.allowsEmpty ?? true,
      preservesSelection: options.selection?.preservesSelection ?? false,
      selectsInsertedObjects:
        options.selection?.selectsInsertedObjects ?? false,
    };
    this.#selection = new SelectionModel({
      mode: this.#selectionOptions.mode,
      allowsEmpty: this.#selectionOptions.allowsEmpty,
    });
    const content = this.#ownedContent(options.content ?? []);
    this.#validateIdentities(content);
    this.#selection.reconcile(content.map(this.#getId));
    this.#committedContent = content;
    this.#snapshot = freezeSnapshot({
      revision: 0,
      arrangementRevision: 1,
      selectionRevision: 0,
      content,
      arranged: content,
      predicate: null,
      sortDescriptors: [],
      selection: this.#selection.getSnapshot(),
      changeSet: emptyChangeSet<TId, T>(),
      editable: options.editable ?? true,
      isEditing: false,
      issues: [],
    });
  }

  getSnapshot = (): ArrayControllerSnapshot<T, TId> => this.#snapshot;

  setContent(content: readonly T[]): void {
    this.assertActive();
    if (this.editTransaction) {
      throw new ControllerEditingStateError(
        "Discard or commit the current edit before replacing content.",
      );
    }
    const owned = this.#ownedContent(content);
    this.#validateIdentities(owned);
    this.#replaceArrangement("content", owned, {
      predicate: this.#snapshot.predicate,
      sortDescriptors: this.#snapshot.sortDescriptors,
    }, () => {
      this.#committedContent = owned;
    });
  }

  setPredicate(predicate: Predicate<T> | null): void {
    this.assertActive();
    if (this.#snapshot.predicate === predicate) return;
    this.#replaceArrangement("arrangement", this.#snapshot.content, {
      predicate,
      sortDescriptors: this.#snapshot.sortDescriptors,
    });
  }

  setSortDescriptors(descriptors: readonly SortComparator<T>[]): void {
    this.assertActive();
    const next = Object.freeze([...descriptors]);
    if (
      next.length === this.#snapshot.sortDescriptors.length &&
      next.every((descriptor, index) =>
        Object.is(descriptor, this.#snapshot.sortDescriptors[index]),
      )
    ) {
      return;
    }
    this.#replaceArrangement("arrangement", this.#snapshot.content, {
      predicate: this.#snapshot.predicate,
      sortDescriptors: next,
    });
  }

  select(ids: Iterable<TId>): boolean {
    this.assertActive();
    const selectable = new Set(
      (this.#selectionOptions.preservesSelection
        ? this.#snapshot.content
        : this.#snapshot.arranged
      ).map(this.#getId),
    );
    const requested = [...ids];
    if (requested.some((id) => !selectable.has(id))) {
      throw new RangeError("Selection contains an unknown stable identity.");
    }
    return this.#publishSelection(
      this.#selection.replace(requested, requested.at(-1) ?? null),
    );
  }

  toggleSelection(id: TId): boolean {
    this.#requireSelectable(id);
    return this.#publishSelection(this.#selection.toggle(id));
  }

  extendSelection(id: TId): boolean {
    this.#requireSelectable(id);
    return this.#publishSelection(
      this.#selection.extendRange(id, this.#snapshot.arranged.map(this.#getId)),
    );
  }

  selectNext(): boolean {
    return this.#selectOffset(1);
  }

  selectPrevious(): boolean {
    return this.#selectOffset(-1);
  }

  beginEditing(transaction: ControllerEditTransaction): void {
    if (!this.#snapshot.editable) throw new ControllerReadOnlyError();
    if (this.editTransaction?.id === transaction.id) return;
    this.beginEditTransaction(transaction);
    this.#selectionBeforeEdit = this.#selection.getSnapshot();
    this.#changedDuringEdit = false;
    this.#replace("editing", {
      isEditing: true,
      issues: [],
    });
  }

  insert(item: T, insertion: ArrayControllerInsertion<TId> = {}): void {
    this.#requireEdit();
    if (insertion.beforeId !== undefined && insertion.afterId !== undefined) {
      throw new TypeError("Insertions accept either beforeId or afterId, not both.");
    }
    const owned = this.#owned(item);
    const id = this.#getId(owned);
    if (this.#snapshot.content.some((candidate) => this.#getId(candidate) === id)) {
      throw new Error("Controller content contains duplicate stable identities.");
    }
    const content = [...this.#snapshot.content];
    let index = content.length;
    if (insertion.beforeId !== undefined) {
      index = this.#indexOf(insertion.beforeId);
    } else if (insertion.afterId !== undefined) {
      index = this.#indexOf(insertion.afterId) + 1;
    }
    content.splice(index, 0, owned);
    this.#applyDraftMutation(content, () => {
      if (insertion.select ?? this.#selectionOptions.selectsInsertedObjects) {
        this.#selection.replace([id], id, id);
      }
    });
  }

  remove(ids: Iterable<TId>): void {
    this.#requireEdit();
    const removing = new Set(ids);
    if (removing.size === 0) return;
    for (const id of removing) this.#indexOf(id);
    const previousArranged = this.#snapshot.arranged.map(this.#getId);
    const previousFocus = this.#selection.getSnapshot().focusId;
    const nearestIndex =
      previousFocus === null ? 0 : Math.max(0, previousArranged.indexOf(previousFocus));
    const content = this.#snapshot.content.filter(
      (item) => !removing.has(this.#getId(item)),
    );
    this.#applyDraftMutation(content, (arrangedIds) => {
      const survivors = [...this.#selection.getSnapshot().selectedIds].filter(
        (id) => !removing.has(id) && content.some((item) => this.#getId(item) === id),
      );
      if (
        survivors.length === 0 &&
        !this.#selectionOptions.allowsEmpty &&
        arrangedIds.length > 0
      ) {
        const nearest = arrangedIds[Math.min(nearestIndex, arrangedIds.length - 1)]!;
        this.#selection.replace([nearest], nearest, nearest);
      } else if (survivors.length === 0 && arrangedIds.length === 0) {
        this.#selection.reconcile([]);
      } else {
        this.#selection.replace(
          survivors,
          survivors.at(-1) ?? null,
          survivors.at(0) ?? null,
        );
      }
    });
  }

  update(id: TId, updater: (item: T) => T): void {
    this.#requireEdit();
    const index = this.#indexOf(id);
    const next = this.#owned(updater(this.#snapshot.content[index]!));
    if (this.#getId(next) !== id) {
      throw new Error("Updating an item must preserve its stable identity.");
    }
    if (this.#equals(this.#snapshot.content[index]!, next)) return;
    const content = [...this.#snapshot.content];
    content[index] = next;
    this.#applyDraftMutation(content);
  }

  commitEditing(): ControllerCommitResult {
    this.assertActive();
    const transaction = this.editTransaction;
    if (!transaction) return { status: "not-editing" };
    if (this.#snapshot.issues.length > 0) {
      return {
        status: "invalid",
        transactionId: transaction.id,
        issues: this.#snapshot.issues,
      };
    }
    const before = this.#ownedContent(this.#committedContent);
    const beforeSelection = this.#selectionBeforeEdit!;
    const after = this.#snapshot.content;
    const afterSelection = this.#selection.getSnapshot();
    const changed = this.#changedDuringEdit;
    const undoActionId =
      changed && transaction.undoManager
        ? transaction.undoManager.register(
            defineSyncUndoAction({
              name: transaction.actionName,
              asyncPolicy: "forbid",
              undo: () => this.#restoreCommitted(before, beforeSelection),
              redo: () => this.#restoreCommitted(after, afterSelection),
            }),
            transaction.automaticGroup
              ? { automaticGroup: transaction.automaticGroup }
              : undefined,
          )
        : null;
    this.editTransaction = null;
    this.#selectionBeforeEdit = null;
    this.#changedDuringEdit = false;
    this.#committedContent = after;
    this.#replace("editing", {
      isEditing: false,
      issues: [],
    });
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
    this.#replaceArrangement("editing", this.#committedContent, {
      predicate: this.#snapshot.predicate,
      sortDescriptors: this.#snapshot.sortDescriptors,
      isEditing: false,
    });
  }

  #owned(item: T): T {
    return ownImmutable(item, this.#clone);
  }

  #ownedContent(content: readonly T[]): readonly T[] {
    return Object.freeze(content.map((item) => this.#owned(item)));
  }

  #validateIdentities(content: readonly T[]): void {
    const seen = new Set<TId>();
    for (const item of content) {
      const id = this.#getId(item);
      if (
        (typeof id !== "string" && typeof id !== "number") ||
        (typeof id === "number" && !Number.isFinite(id))
      ) {
        throw new TypeError(
          "Stable item identities must be strings or finite numbers.",
        );
      }
      if (seen.has(id)) {
        throw new Error("Controller content contains duplicate stable identities.");
      }
      seen.add(id);
    }
  }

  #arrange(
    content: readonly T[],
    predicate: Predicate<T> | null,
    descriptors: readonly SortComparator<T>[],
  ): readonly T[] {
    const filtered = predicate ? content.filter((item) => predicate.test(item)) : content;
    return Object.freeze([...sortWithDescriptors(filtered, descriptors)]);
  }

  #replaceArrangement(
    kind: ArrayControllerChange<T, TId>["kind"],
    content: readonly T[],
    options: {
      readonly predicate: Predicate<T> | null;
      readonly sortDescriptors: readonly SortComparator<T>[];
      readonly isEditing?: boolean;
    },
    beforePublish?: () => void,
  ): void {
    this.#validateIdentities(content);
    const arranged = this.#arrange(
      content,
      options.predicate,
      options.sortDescriptors,
    );
    this.#reconcileSelection(content, arranged);
    const changeSet = diffCollection(
      this.#snapshot.arranged,
      arranged,
      this.#getId,
      this.#equals,
      this.#snapshot.changeSet.revision + 1,
    );
    beforePublish?.();
    this.#replace(kind, {
      content,
      arranged,
      predicate: options.predicate,
      sortDescriptors: options.sortDescriptors,
      selection: this.#selection.getSnapshot(),
      arrangementRevision: this.#snapshot.arrangementRevision + 1,
      selectionRevision:
        this.#selection.getSnapshot() === this.#snapshot.selection
          ? this.#snapshot.selectionRevision
          : this.#snapshot.selectionRevision + 1,
      changeSet,
      isEditing: options.isEditing ?? this.#snapshot.isEditing,
      issues: [],
    });
  }

  #applyDraftMutation(
    content: readonly T[],
    adjustSelection?: (arrangedIds: readonly TId[]) => void,
  ): void {
    const owned = this.#ownedContent(content);
    this.#validateIdentities(owned);
    const arranged = this.#arrange(
      owned,
      this.#snapshot.predicate,
      this.#snapshot.sortDescriptors,
    );
    const arrangedIds = arranged.map(this.#getId);
    if (adjustSelection) adjustSelection(arrangedIds);
    else this.#reconcileSelection(owned, arranged);
    const changeSet = diffCollection(
      this.#snapshot.arranged,
      arranged,
      this.#getId,
      this.#equals,
      this.#snapshot.changeSet.revision + 1,
    );
    this.#changedDuringEdit = true;
    this.#replace("content", {
      content: owned,
      arranged,
      selection: this.#selection.getSnapshot(),
      arrangementRevision: this.#snapshot.arrangementRevision + 1,
      selectionRevision:
        this.#selection.getSnapshot() === this.#snapshot.selection
          ? this.#snapshot.selectionRevision
          : this.#snapshot.selectionRevision + 1,
      changeSet,
      issues: [],
    });
  }

  #reconcileSelection(content: readonly T[], arranged: readonly T[]): void {
    this.#selection.reconcile(content.map(this.#getId));
    if (!this.#selectionOptions.preservesSelection) {
      this.#selection.reconcile(arranged.map(this.#getId));
    }
  }

  #restoreSelection(snapshot: SelectionSnapshot<TId>): void {
    this.#selection.replace(
      snapshot.selectedIds,
      snapshot.focusId,
      snapshot.anchorId,
    );
  }

  #restoreCommitted(
    content: readonly T[],
    selection: SelectionSnapshot<TId>,
  ): void {
    const owned = this.#ownedContent(content);
    this.#committedContent = owned;
    this.#restoreSelection(selection);
    this.#replaceArrangement("content", owned, {
      predicate: this.#snapshot.predicate,
      sortDescriptors: this.#snapshot.sortDescriptors,
      isEditing: false,
    });
  }

  #requireEdit(): void {
    this.assertActive();
    if (!this.#snapshot.editable) throw new ControllerReadOnlyError();
    if (!this.editTransaction) {
      throw new ControllerEditingStateError(
        "Begin editing before changing controller content.",
      );
    }
  }

  #indexOf(id: TId): number {
    const index = this.#snapshot.content.findIndex(
      (item) => this.#getId(item) === id,
    );
    if (index < 0) throw new RangeError("Unknown stable item identity.");
    return index;
  }

  #requireSelectable(id: TId): void {
    this.assertActive();
    if (!this.#snapshot.arranged.some((item) => this.#getId(item) === id)) {
      throw new RangeError("Unknown arranged item identity.");
    }
  }

  #selectOffset(offset: -1 | 1): boolean {
    this.assertActive();
    const ids = this.#snapshot.arranged.map(this.#getId);
    if (ids.length === 0) return false;
    const focus = this.#selection.getSnapshot().focusId;
    const current = focus === null ? -1 : ids.indexOf(focus);
    const fallback = offset > 0 ? 0 : ids.length - 1;
    const index = current < 0 ? fallback : Math.max(0, Math.min(ids.length - 1, current + offset));
    const id = ids[index]!;
    return this.#publishSelection(this.#selection.replace([id], id, id));
  }

  #publishSelection(changed: boolean): boolean {
    if (!changed) return false;
    this.#replace("selection", {
      selection: this.#selection.getSnapshot(),
      selectionRevision: this.#snapshot.selectionRevision + 1,
    });
    return true;
  }

  #replace(
    kind: ArrayControllerChange<T, TId>["kind"],
    patch: Partial<Omit<ArrayControllerSnapshot<T, TId>, "revision" | "editable">>,
  ): void {
    this.#snapshot = freezeSnapshot({
      ...this.#snapshot,
      ...patch,
      revision: this.#snapshot.revision + 1,
    });
    this.publish({ kind, snapshot: this.#snapshot });
  }
}
