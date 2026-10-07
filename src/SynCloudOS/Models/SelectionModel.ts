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

import type { ItemIdentity } from "./ChangeSet";

export interface SelectionSnapshot<TId extends ItemIdentity> {
  readonly revision: number;
  readonly selectedIds: ReadonlySet<TId>;
  readonly anchorId: TId | null;
  readonly focusId: TId | null;
}

export interface SelectionChange<TId extends ItemIdentity> {
  readonly before: SelectionSnapshot<TId>;
  readonly after: SelectionSnapshot<TId>;
  readonly added: ReadonlySet<TId>;
  readonly removed: ReadonlySet<TId>;
}

export interface SelectionModelOptions {
  readonly mode: "single" | "multiple";
  readonly allowsEmpty: boolean;
}

function readonlySet<T>(values: Iterable<T> = []): ReadonlySet<T> {
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
        ) => {
          set.forEach((value, key) => callback.call(thisArg, value, key, proxy));
        };
      }
      const value = Reflect.get(set, property, set);
      return typeof value === "function" ? value.bind(set) : value;
    },
  });
  return proxy;
}

function setEquals<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function selectedOrNull<TId extends ItemIdentity>(
  candidate: TId | null,
  selected: ReadonlySet<TId>,
  fallback: TId | null,
): TId | null {
  return candidate !== null && selected.has(candidate) ? candidate : fallback;
}

export class SelectionModel<TId extends ItemIdentity> {
  readonly #options: SelectionModelOptions;
  readonly #listeners = new Set<(change: SelectionChange<TId>) => void>();
  #snapshot: SelectionSnapshot<TId>;

  constructor(options: SelectionModelOptions) {
    this.#options = { ...options };
    this.#snapshot = Object.freeze({
      revision: 0,
      selectedIds: readonlySet<TId>(),
      anchorId: null,
      focusId: null,
    });
  }

  getSnapshot = (): SelectionSnapshot<TId> => this.#snapshot;

  subscribe = (listener: (change: SelectionChange<TId>) => void): (() => boolean) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  replace(
    ids: Iterable<TId>,
    focusId: TId | null = null,
    anchorId?: TId | null,
  ): boolean {
    return this.#replace(ids, focusId, anchorId, false);
  }

  #replace(
    ids: Iterable<TId>,
    focusId: TId | null,
    anchorId: TId | null | undefined,
    allowEmptyReconciliation: boolean,
  ): boolean {
    const values = [...new Set(ids)];
    const selected =
      this.#options.mode === "single" ? values.slice(0, 1) : values;
    if (
      !this.#options.allowsEmpty &&
      selected.length === 0 &&
      this.#snapshot.selectedIds.size > 0 &&
      !allowEmptyReconciliation
    ) {
      return false;
    }

    const selectedIds = readonlySet(selected);
    const fallbackFocus = selected.at(-1) ?? null;
    const focus = selectedOrNull(focusId, selectedIds, fallbackFocus);
    const requestedAnchor =
      anchorId === undefined ? selected.at(0) ?? null : anchorId;
    const anchor = selectedOrNull(requestedAnchor, selectedIds, focus);
    return this.#commit(selectedIds, focus, anchor);
  }

  toggle(id: TId): boolean {
    const selected = new Set(this.#snapshot.selectedIds);
    if (selected.has(id)) {
      selected.delete(id);
    } else if (this.#options.mode === "single") {
      selected.clear();
      selected.add(id);
    } else {
      selected.add(id);
    }
    return this.replace(selected, id, this.#snapshot.anchorId ?? id);
  }

  extendRange(to: TId, orderedIds: readonly TId[]): boolean {
    if (this.#options.mode === "single") return this.replace([to], to, to);
    const anchor = this.#snapshot.anchorId ?? this.#snapshot.focusId ?? to;
    const start = orderedIds.indexOf(anchor);
    const end = orderedIds.indexOf(to);
    if (start < 0 || end < 0) return false;
    return this.replace(
      orderedIds.slice(Math.min(start, end), Math.max(start, end) + 1),
      to,
      anchor,
    );
  }

  reconcile(availableIds: readonly TId[]): boolean {
    const available = new Set(availableIds);
    const selected = [...this.#snapshot.selectedIds].filter((id) =>
      available.has(id),
    );
    if (
      !this.#options.allowsEmpty &&
      selected.length === 0 &&
      availableIds.length > 0
    ) {
      selected.push(availableIds[0]!);
    }
    const focus =
      this.#snapshot.focusId !== null &&
      available.has(this.#snapshot.focusId) &&
      selected.includes(this.#snapshot.focusId)
        ? this.#snapshot.focusId
        : selected.at(-1) ?? null;
    const anchor =
      this.#snapshot.anchorId !== null &&
      available.has(this.#snapshot.anchorId) &&
      selected.includes(this.#snapshot.anchorId)
        ? this.#snapshot.anchorId
        : focus;
    return this.#replace(selected, focus, anchor, availableIds.length === 0);
  }

  clear(): boolean {
    return this.replace([]);
  }

  #commit(
    selectedIds: ReadonlySet<TId>,
    focusId: TId | null,
    anchorId: TId | null,
  ): boolean {
    const before = this.#snapshot;
    if (
      setEquals(before.selectedIds, selectedIds) &&
      before.focusId === focusId &&
      before.anchorId === anchorId
    ) {
      return false;
    }

    const after = Object.freeze({
      revision: before.revision + 1,
      selectedIds,
      anchorId,
      focusId,
    });
    this.#snapshot = after;
    const change = Object.freeze({
      before,
      after,
      added: readonlySet(
        [...after.selectedIds].filter((id) => !before.selectedIds.has(id)),
      ),
      removed: readonlySet(
        [...before.selectedIds].filter((id) => !after.selectedIds.has(id)),
      ),
    });
    for (const listener of this.#listeners) listener(change);
    return true;
  }
}
