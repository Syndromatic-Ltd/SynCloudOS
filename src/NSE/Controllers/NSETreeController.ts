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
  IndexPath,
  SelectionModel,
  sortWithDescriptors,
  TreeNode,
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
import { hasImmutableValue, isImmutableValue, ownImmutable } from "./immutableValue";

export interface TreeControllerOptions<T, TId extends ItemIdentity> {
  readonly id: string;
  readonly responderId?: string;
  readonly content?: readonly T[];
  readonly getId: (item: T) => TId;
  readonly getChildren: (item: T) => readonly T[];
  readonly withChildren: (item: T, children: readonly T[]) => T;
  readonly loadChildren?: (item: T, signal: AbortSignal) => Promise<readonly T[]>;
  readonly clone?: (item: T) => T;
  readonly editable?: boolean;
  readonly selection?: {
    readonly mode: "single" | "multiple";
    readonly allowsEmpty: boolean;
  };
}

export interface TreeControllerSnapshot<T, TId extends ItemIdentity> {
  readonly revision: number;
  readonly content: readonly T[];
  readonly roots: readonly TreeNode<T, TId>[];
  readonly visibleNodes: readonly TreeNode<T, TId>[];
  readonly predicate: Predicate<T> | null;
  readonly sortDescriptors: readonly SortComparator<T>[];
  readonly expandedIds: ReadonlySet<TId>;
  readonly selection: SelectionSnapshot<TId>;
  readonly changeSet: ChangeSet<TId, TreeNode<T, TId>>;
  readonly loadingIds: ReadonlySet<TId>;
  readonly errors: ReadonlyMap<TId, string>;
  readonly editable: boolean;
  readonly isEditing: boolean;
  readonly issues: readonly ControllerValidationIssue[];
}

export interface TreeControllerChange<T, TId extends ItemIdentity> {
  readonly kind:
    | "content"
    | "arrangement"
    | "expansion"
    | "selection"
    | "editing"
    | "loading"
    | "validation";
  readonly snapshot: TreeControllerSnapshot<T, TId>;
}

export interface TreeDestination<TId extends ItemIdentity> {
  readonly parentId: TId | null;
  readonly index: number;
}

interface LocatedNode<T, TId extends ItemIdentity> {
  readonly item: T;
  readonly id: TId;
  readonly parentId: TId | null;
  readonly index: number;
  readonly path: readonly number[];
}

interface PreparedNode<T> {
  readonly item: T;
  readonly children: readonly PreparedNode<T>[];
}

const MAX_TREE_DEPTH = 512;

function readonlySet<T>(values: Iterable<T>): ReadonlySet<T> {
  const target = new Set(values);
  let proxy: ReadonlySet<T>;
  proxy = new Proxy(target, {
    get(set, property) {
      if (property === "constructor") return Set;
      if (property === "add" || property === "delete" || property === "clear") {
        return () => {
          throw new TypeError("ReadonlySet cannot be mutated.");
        };
      }
      if (property === "forEach") {
        return (
          callback: (value: T, key: T, selected: ReadonlySet<T>) => void,
          thisArg?: unknown,
        ) => set.forEach((value, key) => callback.call(thisArg, value, key, proxy));
      }
      const value = Reflect.get(set, property, set);
      return typeof value === "function" ? value.bind(set) : value;
    },
  });
  return proxy;
}

function readonlyMap<K, V>(values: Iterable<readonly [K, V]>): ReadonlyMap<K, V> {
  const target = new Map(values);
  let proxy: ReadonlyMap<K, V>;
  proxy = new Proxy(target, {
    get(map, property) {
      if (property === "constructor") return Map;
      if (property === "set" || property === "delete" || property === "clear") {
        return () => {
          throw new TypeError("ReadonlyMap cannot be mutated.");
        };
      }
      if (property === "forEach") {
        return (
          callback: (value: V, key: K, selected: ReadonlyMap<K, V>) => void,
          thisArg?: unknown,
        ) => target.forEach((value, key) => callback.call(thisArg, value, key, proxy));
      }
      const value = Reflect.get(map, property, map);
      return typeof value === "function" ? value.bind(map) : value;
    },
  });
  return proxy;
}

function freezeSnapshot<T, TId extends ItemIdentity>(
  snapshot: TreeControllerSnapshot<T, TId>,
): TreeControllerSnapshot<T, TId> {
  return Object.freeze({
    ...snapshot,
    content: Object.freeze(snapshot.content),
    roots: Object.freeze(snapshot.roots),
    visibleNodes: Object.freeze(snapshot.visibleNodes),
    sortDescriptors: Object.freeze(snapshot.sortDescriptors),
    issues: Object.freeze(snapshot.issues.map((issue) => Object.freeze({ ...issue }))),
  });
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException
      ? error.name === "AbortError"
      : error instanceof Error && error.name === "AbortError"
  );
}

export class NSETreeController<T, TId extends ItemIdentity> extends NSEController<
  TreeControllerSnapshot<T, TId>,
  TreeControllerChange<T, TId>
> {
  readonly #getId: (item: T) => TId;
  readonly #getChildren: (item: T) => readonly T[];
  readonly #withChildren: (item: T, children: readonly T[]) => T;
  readonly #loadChildren?: (
    item: T,
    signal: AbortSignal,
  ) => Promise<readonly T[]>;
  readonly #clone: (item: T) => T;
  readonly #selection: SelectionModel<TId>;
  readonly #expanded = new Set<TId>();
  readonly #loading = new Set<TId>();
  readonly #errors = new Map<TId, string>();
  readonly #requests = new Map<
    TId,
    {
      readonly token: number;
      readonly generation: number;
      readonly owner: T;
      readonly controller: AbortController;
      cleanup(): void;
    }
  >();
  #requestToken = 0;
  #contentGeneration = 0;
  #treeDisposed = false;
  #committedContent: readonly T[];
  #selectionBeforeEdit: SelectionSnapshot<TId> | null = null;
  #changedDuringEdit = false;
  #snapshot: TreeControllerSnapshot<T, TId>;

  constructor(options: TreeControllerOptions<T, TId>) {
    super({ id: options.id, responderId: options.responderId });
    this.#getId = options.getId;
    this.#getChildren = options.getChildren;
    this.#withChildren = options.withChildren;
    this.#loadChildren = options.loadChildren;
    this.#clone = options.clone ?? ((value) => structuredClone(value));
    this.#selection = new SelectionModel({
      mode: options.selection?.mode ?? "multiple",
      allowsEmpty: options.selection?.allowsEmpty ?? true,
    });
    const initialContent = options.content ?? [];
    this.#validateForest(initialContent);
    const content = this.#ownedForest(initialContent);
    this.#committedContent = content;
    const roots = this.#buildRoots(content, null, []);
    const visibleNodes = this.#visible(roots);
    this.#snapshot = freezeSnapshot({
      revision: 0,
      content,
      roots,
      visibleNodes,
      predicate: null,
      sortDescriptors: [],
      expandedIds: readonlySet([]),
      selection: this.#selection.getSnapshot(),
      changeSet: emptyChangeSet<TId, TreeNode<T, TId>>(),
      loadingIds: readonlySet([]),
      errors: readonlyMap([]),
      editable: options.editable ?? true,
      isEditing: false,
      issues: [],
    });
  }

  getSnapshot = (): TreeControllerSnapshot<T, TId> => this.#snapshot;

  hasChildLoader(): boolean {
    return this.#loadChildren !== undefined;
  }

  setContent(content: readonly T[]): void {
    this.assertActive();
    if (this.editTransaction) {
      throw new ControllerEditingStateError(
        "Discard or commit the current edit before replacing tree content.",
      );
    }
    this.#validateForest(content);
    const owned = this.#ownedForest(content);
    this.#invalidateChildLoads();
    this.#contentGeneration += 1;
    this.#committedContent = owned;
    this.#publishArrangement("content", owned);
  }

  setPredicate(predicate: Predicate<T> | null): void {
    this.assertActive();
    if (this.#snapshot.predicate === predicate) return;
    this.#publishArrangement("arrangement", this.#snapshot.content, {
      predicate,
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
    this.#publishArrangement("arrangement", this.#snapshot.content, {
      sortDescriptors: next,
    });
  }

  expand(id: TId): void {
    this.#requireNode(id);
    if (this.#expanded.has(id)) return;
    this.#expanded.add(id);
    this.#publishExpansion();
  }

  collapse(id: TId): void {
    this.assertActive();
    if (!this.#expanded.delete(id)) return;
    this.#publishExpansion();
  }

  toggleExpanded(id: TId): void {
    if (this.#expanded.has(id)) this.collapse(id);
    else this.expand(id);
  }

  async loadChildren(
    id: TId,
    signal?: AbortSignal,
    loader: ((item: T, signal: AbortSignal) => Promise<readonly T[]> | readonly T[]) | undefined = this.#loadChildren,
  ): Promise<void> {
    this.assertActive();
    if (!loader) return;
    const located = this.#find(this.#snapshot.content, id);
    if (!located) throw new RangeError("Unknown stable tree identity.");

    this.#requests.get(id)?.controller.abort();
    const controller = new AbortController();
    const token = ++this.#requestToken;
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener("abort", abort, { once: true });
    const request = {
      token,
      generation: this.#contentGeneration,
      owner: located.item,
      controller,
      cleanup: () => signal?.removeEventListener("abort", abort),
    };
    this.#requests.set(id, request);
    this.#loading.add(id);
    this.#errors.delete(id);
    this.#publishArrangement("loading", this.#snapshot.content);

    let stopWaitingForAbort: (() => void) | undefined;
    const aborted = new Promise<{ readonly kind: "aborted" }>((resolve) => {
      const onAbort = () => resolve({ kind: "aborted" });
      if (controller.signal.aborted) onAbort();
      else {
        controller.signal.addEventListener("abort", onAbort, { once: true });
        stopWaitingForAbort = () =>
          controller.signal.removeEventListener("abort", onAbort);
      }
    });
    let loading: Promise<readonly T[]>;
    try {
      loading = Promise.resolve(loader(located.item, controller.signal));
    } catch (error) {
      loading = Promise.reject(error);
    }
    const provider = loading
      .then(
        (children) => ({ kind: "children" as const, children }),
        (error: unknown) => ({ kind: "error" as const, error }),
      );

    try {
      const outcome = await Promise.race([provider, aborted]);
      stopWaitingForAbort?.();
      if (outcome.kind === "aborted") {
        this.#clearStaleRequest(id, request);
        return;
      }
      if (outcome.kind === "error") throw outcome.error;
      const { children } = outcome;
      if (!this.#isCurrentRequest(id, request) || controller.signal.aborted) {
        this.#clearStaleRequest(id, request);
        return;
      }
      this.#validateForest(children);
      const ownedChildren = this.#ownedForest(children);
      let next = this.#replaceChildren(this.#snapshot.content, id, ownedChildren);
      if (!next) {
        this.#clearStaleRequest(id, request);
        return;
      }
      this.#validateForest(next);
      next = this.#ownedForest(next);

      if (this.editTransaction) {
        const committed = this.#replaceChildren(
          this.#committedContent,
          id,
          ownedChildren,
        );
        if (committed) {
          this.#validateForest(committed);
          const ownedCommitted = this.#ownedForest(committed);
          this.#committedContent = ownedCommitted;
        }
      } else {
        this.#committedContent = next;
      }
      this.#loading.delete(id);
      this.#errors.delete(id);
      this.#requests.delete(id);
      this.#publishArrangement("loading", next);
    } catch (error) {
      if (!this.#isRegisteredRequest(id, request)) return;
      this.#loading.delete(id);
      this.#requests.delete(id);
      if (!controller.signal.aborted && !isAbortError(error)) {
        this.#errors.set(
          id,
          error instanceof Error ? error.message : "Child loading failed.",
        );
      }
      if (!this.#treeDisposed) {
        this.#publishArrangement("loading", this.#snapshot.content);
      }
    } finally {
      request.cleanup();
    }
  }

  select(ids: Iterable<TId>): boolean {
    this.assertActive();
    const available = new Set(this.#allNodes(this.#snapshot.roots).map(({ id }) => id));
    const requested = [...ids];
    if (requested.some((id) => !available.has(id))) {
      throw new RangeError("Selection contains an unknown arranged tree identity.");
    }
    const changed = this.#selection.replace(
      requested,
      requested.at(-1) ?? null,
    );
    if (!changed) return false;
    this.#replace("selection", { selection: this.#selection.getSnapshot() });
    return true;
  }

  insert(item: T, destination: TreeDestination<TId>): void {
    this.#requireEdit();
    this.#validateDestination(this.#snapshot.content, destination);
    this.#validateForest([item]);
    const owned = this.#ownedItem(item);
    const id = this.#getId(owned);
    if (this.#find(this.#snapshot.content, id)) {
      throw new Error("Tree content contains duplicate stable identities.");
    }
    const next = this.#insertAt(this.#snapshot.content, destination, [owned]);
    this.#applyDraft(next);
  }

  remove(ids: Iterable<TId>): void {
    this.#requireEdit();
    const removing = new Set(ids);
    if (removing.size === 0) return;
    for (const id of removing) {
      if (!this.#find(this.#snapshot.content, id)) {
        throw new RangeError("Unknown stable tree identity.");
      }
    }
    const next = this.#removeIds(this.#snapshot.content, removing);
    this.#applyDraft(next);
  }

  move(ids: Iterable<TId>, destination: TreeDestination<TId>): void {
    this.#requireEdit();
    const requested = [...new Set(ids)];
    if (requested.length === 0) return;
    const locations = requested.map((id) => {
      const location = this.#find(this.#snapshot.content, id);
      if (!location) throw new RangeError("Unknown stable tree identity.");
      return location;
    });
    this.#validateDestination(this.#snapshot.content, destination);
    if (
      destination.parentId !== null &&
      locations.some(
        ({ id }) =>
          id === destination.parentId ||
          this.#isDescendant(this.#snapshot.content, id, destination.parentId!),
      )
    ) {
      throw new RangeError("Cannot move a tree node into its own descendant.");
    }
    for (const left of locations) {
      if (
        locations.some(
          (right) =>
            left !== right &&
            this.#isDescendant(this.#snapshot.content, left.id, right.id),
        )
      ) {
        throw new RangeError("A tree move cannot include both an ancestor and descendant.");
      }
    }

    const removedBefore = locations.filter(
      (location) =>
        location.parentId === destination.parentId &&
        location.index < destination.index,
    ).length;
    const removing = new Set(requested);
    const without = this.#removeIds(this.#snapshot.content, removing);
    const adjusted = {
      parentId: destination.parentId,
      index: destination.index - removedBefore,
    };
    const moved = locations
      .slice()
      .sort((left, right) => this.#comparePaths(left.path, right.path))
      .map(({ item }) => item);
    this.#validateDestination(without, adjusted);
    this.#applyDraft(this.#insertAt(without, adjusted, moved));
  }

  node(id: TId): TreeNode<T, TId> | null {
    return this.#allNodes(this.#snapshot.roots).find((node) => node.id === id) ?? null;
  }

  nodeAt(path: IndexPath): TreeNode<T, TId> | null {
    let siblings = this.#snapshot.roots;
    let node: TreeNode<T, TId> | undefined;
    for (const index of path.indexes) {
      node = siblings[index];
      if (!node) return null;
      siblings = node.children;
    }
    return node ?? null;
  }

  beginEditing(transaction: ControllerEditTransaction): void {
    if (!this.#snapshot.editable) throw new ControllerReadOnlyError();
    if (this.editTransaction?.id === transaction.id) return;
    this.beginEditTransaction(transaction);
    this.#selectionBeforeEdit = this.#selection.getSnapshot();
    this.#changedDuringEdit = false;
    this.#replace("editing", { isEditing: true, issues: [] });
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
    const before = this.#ownedForest(this.#committedContent);
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
    this.#replace("editing", { isEditing: false, issues: [] });
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
    this.#publishArrangement("editing", this.#committedContent, {
      isEditing: false,
    });
  }

  dispose(): void {
    if (this.#treeDisposed) return;
    this.#treeDisposed = true;
    super.dispose();
    this.#invalidateChildLoads();
  }

  #ownedItem(item: T): T {
    if (isImmutableValue(item)) return item;
    const base = hasImmutableValue(item) ? item : this.#clone(item);
    const children = this.#ownedForest(this.#getChildren(item));
    return ownImmutable(this.#withChildren(base, children));
  }

  #ownedForest(items: readonly T[]): readonly T[] {
    return Object.freeze(items.map((item) => this.#ownedItem(item)));
  }

  #validateForest(items: readonly T[]): void {
    const seen = new Set<TId>();
    const visiting = new WeakSet<object>();
    if (!Array.isArray(items)) {
      throw new TypeError("Tree children must be an array.");
    }
    const pending: Array<
      | { readonly kind: "visit"; readonly item: T; readonly depth: number }
      | { readonly kind: "leave"; readonly item: object }
    > = [];
    for (let index = items.length - 1; index >= 0; index -= 1) {
      pending.push({ kind: "visit", item: items[index]!, depth: 1 });
    }
    while (pending.length > 0) {
      const next = pending.pop()!;
      if (next.kind === "leave") {
        visiting.delete(next.item);
        continue;
      }
      if (next.depth > MAX_TREE_DEPTH) {
        throw new ControllerEditingStateError(
          `Tree content exceeds the maximum depth of ${MAX_TREE_DEPTH}.`,
        );
      }
      const objectItem =
        typeof next.item === "object" && next.item !== null ? next.item : null;
      if (objectItem && visiting.has(objectItem)) {
        throw new ControllerEditingStateError("Tree content must not contain cycles.");
      }
      if (objectItem) {
        visiting.add(objectItem);
        pending.push({ kind: "leave", item: objectItem });
      }
      const id = this.#getId(next.item);
      if (
        (typeof id !== "string" && typeof id !== "number") ||
        (typeof id === "number" && !Number.isFinite(id))
      ) {
        throw new TypeError(
          "Stable item identities must be strings or finite numbers.",
        );
      }
      if (seen.has(id)) {
        throw new Error("Tree content contains duplicate stable identities.");
      }
      seen.add(id);
      const children = this.#getChildren(next.item);
      if (!Array.isArray(children)) {
        throw new TypeError("Tree children must be an array.");
      }
      for (let index = children.length - 1; index >= 0; index -= 1) {
        pending.push({ kind: "visit", item: children[index]!, depth: next.depth + 1 });
      }
    }
  }

  #buildRoots(
    content: readonly T[],
    predicate: Predicate<T> | null,
    descriptors: readonly SortComparator<T>[],
  ): readonly TreeNode<T, TId>[] {
    const prepare = (item: T): PreparedNode<T> | null => {
      const children = this.#getChildren(item)
        .map(prepare)
        .filter((child): child is PreparedNode<T> => child !== null);
      if (predicate && !predicate.test(item) && children.length === 0) return null;
      const sorted = sortWithDescriptors(
        children,
        descriptors.map((descriptor) => ({
          compare: (left: PreparedNode<T>, right: PreparedNode<T>) =>
            descriptor.compare(left.item, right.item),
        })),
      );
      return { item, children: sorted };
    };
    const prepared = sortWithDescriptors(
      content.map(prepare).filter((node): node is PreparedNode<T> => node !== null),
      descriptors.map((descriptor) => ({
        compare: (left: PreparedNode<T>, right: PreparedNode<T>) =>
          descriptor.compare(left.item, right.item),
      })),
    );
    const materialise = (
      siblings: readonly PreparedNode<T>[],
      parentId: TId | null,
      parentPath: readonly number[],
    ): readonly TreeNode<T, TId>[] =>
      Object.freeze(
        siblings.map((preparedNode, index) => {
          const id = this.#getId(preparedNode.item);
          const path = [...parentPath, index];
          return new TreeNode({
            id,
            value: preparedNode.item,
            indexPath: IndexPath.from(...path),
            parentId,
            children: materialise(preparedNode.children, id, path),
            loading: this.#loading.has(id),
            error: this.#errors.get(id) ?? null,
          });
        }),
      );
    return materialise(prepared, null, []);
  }

  #visible(roots: readonly TreeNode<T, TId>[]): readonly TreeNode<T, TId>[] {
    const visible: TreeNode<T, TId>[] = [];
    const visit = (nodes: readonly TreeNode<T, TId>[]) => {
      for (const node of nodes) {
        visible.push(node);
        if (this.#expanded.has(node.id)) visit(node.children);
      }
    };
    visit(roots);
    return Object.freeze(visible);
  }

  #allNodes(roots: readonly TreeNode<T, TId>[]): readonly TreeNode<T, TId>[] {
    const nodes: TreeNode<T, TId>[] = [];
    const visit = (siblings: readonly TreeNode<T, TId>[]) => {
      for (const node of siblings) {
        nodes.push(node);
        visit(node.children);
      }
    };
    visit(roots);
    return nodes;
  }

  #publishArrangement(
    kind: TreeControllerChange<T, TId>["kind"],
    content: readonly T[],
    patch: {
      readonly predicate?: Predicate<T> | null;
      readonly sortDescriptors?: readonly SortComparator<T>[];
      readonly isEditing?: boolean;
    } = {},
  ): void {
    this.#validateForest(content);
    const predicate =
      patch.predicate === undefined ? this.#snapshot.predicate : patch.predicate;
    const descriptors = patch.sortDescriptors ?? this.#snapshot.sortDescriptors;
    const roots = this.#buildRoots(content, predicate, descriptors);
    const allIds = new Set(this.#allNodes(roots).map(({ id }) => id));
    const contentIds = this.#collectIds(content);
    for (const id of [...this.#expanded]) {
      if (!contentIds.has(id)) this.#expanded.delete(id);
    }
    const visibleNodes = this.#visible(roots);
    this.#selection.reconcile([...allIds]);
    const changeSet = diffCollection(
      this.#snapshot.visibleNodes,
      visibleNodes,
      (node) => node.id,
      (left, right) => left === right,
      this.#snapshot.changeSet.revision + 1,
    );
    this.#replace(kind, {
      content,
      roots,
      visibleNodes,
      predicate,
      sortDescriptors: descriptors,
      expandedIds: readonlySet(this.#expanded),
      selection: this.#selection.getSnapshot(),
      changeSet,
      loadingIds: readonlySet(this.#loading),
      errors: readonlyMap(this.#errors),
      isEditing: patch.isEditing ?? this.#snapshot.isEditing,
      issues: [],
    });
  }

  #publishExpansion(): void {
    const visibleNodes = this.#visible(this.#snapshot.roots);
    const changeSet = diffCollection(
      this.#snapshot.visibleNodes,
      visibleNodes,
      (node) => node.id,
      (left, right) => left === right,
      this.#snapshot.changeSet.revision + 1,
    );
    this.#replace("expansion", {
      visibleNodes,
      expandedIds: readonlySet(this.#expanded),
      changeSet,
    });
  }

  #applyDraft(content: readonly T[]): void {
    this.#validateForest(content);
    const owned = this.#ownedForest(content);
    this.#changedDuringEdit = true;
    this.#publishArrangement("content", owned);
  }

  #restoreCommitted(
    content: readonly T[],
    selection: SelectionSnapshot<TId>,
  ): void {
    this.#validateForest(content);
    const owned = this.#ownedForest(content);
    this.#committedContent = owned;
    this.#restoreSelection(selection);
    this.#publishArrangement("content", owned, { isEditing: false });
  }

  #restoreSelection(snapshot: SelectionSnapshot<TId>): void {
    this.#selection.replace(
      snapshot.selectedIds,
      snapshot.focusId,
      snapshot.anchorId,
    );
  }

  #requireEdit(): void {
    this.assertActive();
    if (!this.#snapshot.editable) throw new ControllerReadOnlyError();
    if (!this.editTransaction) {
      throw new ControllerEditingStateError(
        "Begin editing before changing tree content.",
      );
    }
  }

  #requireNode(id: TId): TreeNode<T, TId> {
    this.assertActive();
    const node = this.node(id);
    if (!node) throw new RangeError("Unknown arranged tree identity.");
    return node;
  }

  #find(
    siblings: readonly T[],
    id: TId,
    parentId: TId | null = null,
    parentPath: readonly number[] = [],
  ): LocatedNode<T, TId> | null {
    for (let index = 0; index < siblings.length; index += 1) {
      const item = siblings[index]!;
      const itemId = this.#getId(item);
      const path = [...parentPath, index];
      if (itemId === id) return { item, id, parentId, index, path };
      const child = this.#find(this.#getChildren(item), id, itemId, path);
      if (child) return child;
    }
    return null;
  }

  #collectIds(content: readonly T[]): Set<TId> {
    const ids = new Set<TId>();
    const visit = (siblings: readonly T[]) => {
      for (const item of siblings) {
        ids.add(this.#getId(item));
        visit(this.#getChildren(item));
      }
    };
    visit(content);
    return ids;
  }

  #childrenFor(
    content: readonly T[],
    parentId: TId | null,
  ): readonly T[] | null {
    if (parentId === null) return content;
    const parent = this.#find(content, parentId);
    return parent ? this.#getChildren(parent.item) : null;
  }

  #validateDestination(
    content: readonly T[],
    destination: TreeDestination<TId>,
  ): void {
    if (!Number.isSafeInteger(destination.index) || destination.index < 0) {
      throw new RangeError("Tree destination index must be a non-negative safe integer.");
    }
    const siblings = this.#childrenFor(content, destination.parentId);
    if (!siblings) throw new RangeError("Unknown tree destination parent.");
    if (destination.index > siblings.length) {
      throw new RangeError("Tree destination index is outside its siblings.");
    }
  }

  #removeIds(siblings: readonly T[], ids: ReadonlySet<TId>): readonly T[] {
    const result: T[] = [];
    for (const item of siblings) {
      if (ids.has(this.#getId(item))) continue;
      const children = this.#getChildren(item);
      const nextChildren = this.#removeIds(children, ids);
      result.push(
        nextChildren.length === children.length &&
        nextChildren.every((child, index) => child === children[index])
          ? item
          : this.#withChildren(item, nextChildren),
      );
    }
    return result;
  }

  #insertAt(
    siblings: readonly T[],
    destination: TreeDestination<TId>,
    items: readonly T[],
  ): readonly T[] {
    if (destination.parentId === null) {
      const result = [...siblings];
      result.splice(destination.index, 0, ...items);
      return result;
    }
    let found = false;
    const visit = (nodes: readonly T[]): readonly T[] => {
      let changed = false;
      const result: T[] = [];
      for (const item of nodes) {
        if (found) {
          result.push(item);
          continue;
        }
        if (this.#getId(item) === destination.parentId) {
          const children = [...this.#getChildren(item)];
          children.splice(destination.index, 0, ...items);
          found = true;
          changed = true;
          result.push(this.#withChildren(item, children));
          continue;
        }
        const children = this.#getChildren(item);
        const nextChildren = visit(children);
        if (nextChildren === children) result.push(item);
        else {
          changed = true;
          result.push(this.#withChildren(item, nextChildren));
        }
      }
      return changed ? result : nodes;
    };
    const result = visit(siblings);
    if (!found) throw new RangeError("Unknown tree destination parent.");
    return result;
  }

  #replaceChildren(
    siblings: readonly T[],
    id: TId,
    children: readonly T[],
  ): readonly T[] | null {
    let found = false;
    const visit = (nodes: readonly T[]): readonly T[] => {
      let changed = false;
      const result: T[] = [];
      for (const item of nodes) {
        if (found) {
          result.push(item);
          continue;
        }
        if (this.#getId(item) === id) {
          found = true;
          changed = true;
          result.push(this.#withChildren(item, children));
          continue;
        }
        const current = this.#getChildren(item);
        const next = visit(current);
        if (next === current) result.push(item);
        else {
          changed = true;
          result.push(this.#withChildren(item, next));
        }
      }
      return changed ? result : nodes;
    };
    const result = visit(siblings);
    return found ? result : null;
  }

  #isDescendant(content: readonly T[], ancestorId: TId, id: TId): boolean {
    const ancestor = this.#find(content, ancestorId);
    return ancestor ? this.#find(this.#getChildren(ancestor.item), id) !== null : false;
  }

  #comparePaths(left: readonly number[], right: readonly number[]): number {
    for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
      if (left[index] !== right[index]) return left[index]! - right[index]!;
    }
    return left.length - right.length;
  }

  #isCurrentRequest(
    id: TId,
    request: {
      readonly token: number;
      readonly generation: number;
      readonly owner: T;
    },
  ): boolean {
    const current = this.#find(this.#snapshot.content, id);
    return (
      !this.#treeDisposed &&
      request.generation === this.#contentGeneration &&
      this.#requests.get(id)?.token === request.token &&
      current?.item === request.owner
    );
  }

  #isRegisteredRequest(
    id: TId,
    request: { readonly token: number },
  ): boolean {
    return this.#requests.get(id)?.token === request.token;
  }

  #clearStaleRequest(
    id: TId,
    request: { readonly token: number },
  ): void {
    if (!this.#isRegisteredRequest(id, request)) return;
    this.#loading.delete(id);
    this.#errors.delete(id);
    this.#requests.delete(id);
    if (!this.#treeDisposed) {
      this.#publishArrangement("loading", this.#snapshot.content);
    }
  }

  #invalidateChildLoads(): void {
    for (const request of this.#requests.values()) {
      request.controller.abort();
      request.cleanup();
    }
    this.#requests.clear();
    this.#loading.clear();
    this.#errors.clear();
  }

  #replace(
    kind: TreeControllerChange<T, TId>["kind"],
    patch: Partial<Omit<TreeControllerSnapshot<T, TId>, "revision" | "editable">>,
  ): void {
    this.#snapshot = freezeSnapshot({
      ...this.#snapshot,
      ...patch,
      revision: this.#snapshot.revision + 1,
    });
    this.publish({ kind, snapshot: this.#snapshot });
  }
}
