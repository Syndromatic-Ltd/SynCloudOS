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

export type ItemIdentity = string | number;

export type CollectionChange<
  TId extends ItemIdentity,
  TItem,
> =
  | { readonly kind: "insert"; readonly id: TId; readonly index: number; readonly item: TItem }
  | { readonly kind: "remove"; readonly id: TId; readonly index: number; readonly item: TItem }
  | { readonly kind: "move"; readonly id: TId; readonly from: number; readonly to: number; readonly item: TItem }
  | { readonly kind: "update"; readonly id: TId; readonly index: number; readonly previous: TItem; readonly item: TItem }
  | { readonly kind: "reset"; readonly previous: readonly TItem[]; readonly items: readonly TItem[] };

export interface ChangeSet<TId extends ItemIdentity, TItem> {
  readonly revision: number;
  readonly previousRevision: number;
  readonly changes: readonly CollectionChange<TId, TItem>[];
}

export const MAX_INCREMENTAL_COLLECTION_CHANGES = 1_000;

function defaultItemEquals<TItem>(left: TItem, right: TItem): boolean {
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

function validateIdentity(id: ItemIdentity): void {
  if (
    (typeof id !== "string" && typeof id !== "number") ||
    (typeof id === "number" && !Number.isFinite(id))
  ) {
    throw new TypeError("Stable item identities must be strings or finite numbers.");
  }
}

function identityIndex<TItem, TId extends ItemIdentity>(
  items: readonly TItem[],
  getId: (item: TItem) => TId,
): Map<TId, number> {
  const result = new Map<TId, number>();
  items.forEach((item, index) => {
    const id = getId(item);
    validateIdentity(id);
    if (result.has(id)) {
      throw new Error("Controller content contains duplicate stable identities.");
    }
    result.set(id, index);
  });
  return result;
}

function freezeChange<TId extends ItemIdentity, TItem>(
  change: CollectionChange<TId, TItem>,
): CollectionChange<TId, TItem> {
  if (change.kind === "reset") {
    return Object.freeze({
      ...change,
      previous: Object.freeze([...change.previous]),
      items: Object.freeze([...change.items]),
    });
  }
  return Object.freeze({ ...change });
}

interface SequenceNode<TId extends ItemIdentity> {
  readonly id: TId;
  readonly priority: number;
  left: SequenceNode<TId> | null;
  right: SequenceNode<TId> | null;
  parent: SequenceNode<TId> | null;
  size: number;
}

function sequenceSize<TId extends ItemIdentity>(
  node: SequenceNode<TId> | null,
): number {
  return node?.size ?? 0;
}

function refreshSequenceNode<TId extends ItemIdentity>(
  node: SequenceNode<TId>,
): SequenceNode<TId> {
  node.size = 1 + sequenceSize(node.left) + sequenceSize(node.right);
  if (node.left) node.left.parent = node;
  if (node.right) node.right.parent = node;
  return node;
}

function mergeSequence<TId extends ItemIdentity>(
  left: SequenceNode<TId> | null,
  right: SequenceNode<TId> | null,
): SequenceNode<TId> | null {
  if (!left) {
    if (right) right.parent = null;
    return right;
  }
  if (!right) {
    left.parent = null;
    return left;
  }
  if (left.priority < right.priority) {
    left.right = mergeSequence(left.right, right);
    left.parent = null;
    return refreshSequenceNode(left);
  }
  right.left = mergeSequence(left, right.left);
  right.parent = null;
  return refreshSequenceNode(right);
}

function splitSequence<TId extends ItemIdentity>(
  root: SequenceNode<TId> | null,
  count: number,
): readonly [SequenceNode<TId> | null, SequenceNode<TId> | null] {
  if (!root) return [null, null];
  if (sequenceSize(root.left) >= count) {
    const [left, rest] = splitSequence(root.left, count);
    root.left = rest;
    root.parent = null;
    refreshSequenceNode(root);
    if (left) left.parent = null;
    return [left, root];
  }
  const [rest, right] = splitSequence(
    root.right,
    count - sequenceSize(root.left) - 1,
  );
  root.right = rest;
  root.parent = null;
  refreshSequenceNode(root);
  if (right) right.parent = null;
  return [root, right];
}

/**
 * An indexable sequence used only while producing a collection patch.  Its
 * public change records are applied in order to the consumer's evolving
 * collection, so every move coordinate is calculated after prior records.
 */
class IndexedSequence<TId extends ItemIdentity> {
  #root: SequenceNode<TId> | null = null;
  readonly #nodes = new Map<TId, SequenceNode<TId>>();
  #seed = 0x9e3779b9;

  constructor(ids: readonly TId[]) {
    for (const id of ids) this.insert(this.length, id);
  }

  get length(): number {
    return sequenceSize(this.#root);
  }

  indexOf(id: TId): number {
    const node = this.#nodes.get(id);
    if (!node) throw new Error("Collection patch lost a stable identity.");
    let index = sequenceSize(node.left);
    let current: SequenceNode<TId> | null = node;
    while (current?.parent) {
      if (current === current.parent.right) {
        index += sequenceSize(current.parent.left) + 1;
      }
      current = current.parent;
    }
    return index;
  }

  insert(index: number, id: TId): void {
    if (!Number.isSafeInteger(index) || index < 0 || index > this.length) {
      throw new RangeError("Collection patch insertion index is outside the sequence.");
    }
    if (this.#nodes.has(id)) {
      throw new Error("Collection patch contains duplicate stable identities.");
    }
    const node: SequenceNode<TId> = {
      id,
      priority: this.#nextPriority(),
      left: null,
      right: null,
      parent: null,
      size: 1,
    };
    const [left, right] = splitSequence(this.#root, index);
    this.#root = mergeSequence(mergeSequence(left, node), right);
    this.#nodes.set(id, node);
  }

  remove(id: TId): number {
    const index = this.indexOf(id);
    const [left, remaining] = splitSequence(this.#root, index);
    const [removed, right] = splitSequence(remaining, 1);
    if (!removed || removed.id !== id) {
      throw new Error("Collection patch removal did not match its stable identity.");
    }
    removed.left = null;
    removed.right = null;
    removed.parent = null;
    removed.size = 1;
    this.#root = mergeSequence(left, right);
    this.#nodes.delete(id);
    return index;
  }

  move(id: TId, to: number): number {
    const from = this.indexOf(id);
    if (!Number.isSafeInteger(to) || to < 0 || to >= this.length) {
      throw new RangeError("Collection patch move index is outside the sequence.");
    }
    if (from === to) return from;
    const [left, remaining] = splitSequence(this.#root, from);
    const [moved, right] = splitSequence(remaining, 1);
    if (!moved || moved.id !== id) {
      throw new Error("Collection patch move did not match its stable identity.");
    }
    moved.left = null;
    moved.right = null;
    moved.parent = null;
    moved.size = 1;
    this.#root = mergeSequence(left, right);
    const [destinationLeft, destinationRight] = splitSequence(this.#root, to);
    this.#root = mergeSequence(
      mergeSequence(destinationLeft, moved),
      destinationRight,
    );
    return from;
  }

  #nextPriority(): number {
    this.#seed = (Math.imul(this.#seed, 1_664_525) + 1_013_904_223) >>> 0;
    return this.#seed;
  }
}

export function emptyChangeSet<TId extends ItemIdentity, TItem>(
  revision = 0,
): ChangeSet<TId, TItem> {
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new RangeError("Change-set revision must be a non-negative safe integer.");
  }
  return Object.freeze({
    revision,
    previousRevision: Math.max(0, revision - 1),
    changes: Object.freeze([]),
  });
}

export function diffCollection<TItem, TId extends ItemIdentity>(
  before: readonly TItem[],
  after: readonly TItem[],
  getId: (item: TItem) => TId,
  equals: (left: TItem, right: TItem) => boolean = defaultItemEquals,
  revision = 1,
): ChangeSet<TId, TItem> {
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new RangeError("Change-set revision must be a positive safe integer.");
  }

  const oldIndex = identityIndex(before, getId);
  const newIndex = identityIndex(after, getId);
  const beforeIds = before.map(getId);
  const afterIds = after.map(getId);
  const removedIds = beforeIds.filter((id) => !newIndex.has(id));
  const insertedIds = afterIds.filter((id) => !oldIndex.has(id));
  const updates = after.reduce<CollectionChange<TId, TItem>[]>(
    (result, item, index) => {
      const id = afterIds[index]!;
      const previousIndex = oldIndex.get(id);
      if (previousIndex !== undefined) {
        const previous = before[previousIndex]!;
        if (!equals(previous, item)) {
          result.push({ kind: "update", id, index, previous, item });
        }
      }
      return result;
    },
    [],
  );
  const reset = (): ChangeSet<TId, TItem> =>
    Object.freeze({
      revision,
      previousRevision: revision - 1,
      changes: Object.freeze(
        [freezeChange<TId, TItem>({ kind: "reset", previous: before, items: after })],
      ),
    });

  if (removedIds.length + insertedIds.length + updates.length > MAX_INCREMENTAL_COLLECTION_CHANGES) {
    return reset();
  }

  const sequence = new IndexedSequence(beforeIds);
  const changes: CollectionChange<TId, TItem>[] = [];
  const append = (change: CollectionChange<TId, TItem>): boolean => {
    changes.push(change);
    return changes.length + updates.length <= MAX_INCREMENTAL_COLLECTION_CHANGES;
  };

  for (let index = before.length - 1; index >= 0; index -= 1) {
    const item = before[index]!;
    const id = beforeIds[index]!;
    if (!newIndex.has(id) && !append({ kind: "remove", id, index: sequence.remove(id), item })) {
      return reset();
    }
  }
  for (let index = 0; index < after.length; index += 1) {
    const item = after[index]!;
    const id = afterIds[index]!;
    if (!oldIndex.has(id)) {
      sequence.insert(index, id);
      if (!append({ kind: "insert", id, index, item })) return reset();
    }
  }
  for (let index = 0; index < after.length; index += 1) {
    const id = afterIds[index]!;
    const from = sequence.indexOf(id);
    if (from === index) continue;
    sequence.move(id, index);
    if (!append({ kind: "move", id, from, to: index, item: after[index]! })) {
      return reset();
    }
  }
  changes.push(...updates);

  return Object.freeze({
    revision,
    previousRevision: revision - 1,
    changes: Object.freeze(changes.map(freezeChange)),
  });
}
