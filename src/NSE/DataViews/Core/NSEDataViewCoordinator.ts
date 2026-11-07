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

import type { SelectionChange, SelectionSnapshot } from "../../../SynCloudOS/Models";
import { IndexPath } from "../../../SynCloudOS/Models";

import type {
  NSEDataViewAdapter,
  NSEDataViewCoordinatorOptions,
  NSEDataViewKey,
  NSEDataViewSelectionEvent,
  NSEDataViewSnapshot,
  NSEDataViewState,
} from "./dataViewTypes";
import { encodeNSEDataViewKey } from "./dataViewIdentity";
import { dataViewDisposedControllerState, warnDisposedDataViewController } from "./disposedController";

function immutableSet<T>(values: Iterable<T>): ReadonlySet<T> {
  const target = new Set(values);
  return new Proxy(target, {
    get(set, property) {
      if (property === "constructor") return Set;
      if (property === "add" || property === "delete" || property === "clear") {
        return () => { throw new TypeError("Data-view selection sets are immutable."); };
      }
      const value = Reflect.get(set, property, set);
      return typeof value === "function" ? value.bind(set) : value;
    },
  });
}

function setDifference<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): ReadonlySet<T> {
  return immutableSet([...left].filter((value) => !right.has(value)));
}

export function createSelectionChange<TId extends NSEDataViewKey>(
  before: SelectionSnapshot<TId>,
  after: SelectionSnapshot<TId>,
): SelectionChange<TId> {
  return Object.freeze({
    before,
    after,
    added: setDifference(after.selectedIds, before.selectedIds),
    removed: setDifference(before.selectedIds, after.selectedIds),
  });
}

export class NSEDataViewCoordinator<T, TId extends NSEDataViewKey> {
  #adapter: NSEDataViewAdapter<T, TId>;
  #options: NSEDataViewCoordinatorOptions<T, TId>;
  readonly #listeners = new Set<() => void>();
  readonly #unsubscribe: () => boolean;
  readonly #unsubscribeDispose: () => boolean;
  #controllerDisposed: boolean;
  #warnedControllerDisposed = false;
  #activeId: TId | null;
  #editingId: TId | null = null;
  #cancelEditing: (() => void) | null = null;
  #state: NSEDataViewState;
  #pendingSelectionReason: NSEDataViewSelectionEvent<TId>["reason"] | null = null;
  #revision = 0;
  #snapshot: NSEDataViewSnapshot<T, TId>;
  #projectedArranged: readonly T[] | null = null;
  #projectedItems: NSEDataViewSnapshot<T, TId>["items"] = Object.freeze([]);
  #entryById = new Map<TId, NSEDataViewSnapshot<T, TId>["items"][number]>();
  #indexById = new Map<TId, number>();
  #enabledIdsCache: readonly TId[] = Object.freeze([]);
  #enabledIndexById = new Map<TId, number>();

  constructor(adapter: NSEDataViewAdapter<T, TId>, options: NSEDataViewCoordinatorOptions<T, TId>) {
    this.#adapter = adapter;
    this.#options = options;
    this.#state = options.state ?? { kind: "ready" };
    this.#controllerDisposed = adapter.controller.isDisposed;
    this.#activeId = null;
    this.#ensureProjection(adapter.controller.getSnapshot().arranged);
    const controllerFocus = adapter.controller.getSnapshot().selection.focusId;
    this.#activeId = controllerFocus !== null && this.#enabledIndexById.has(controllerFocus)
      ? controllerFocus
      : this.#enabledIdsCache[0] ?? null;
    this.#snapshot = this.#project();
    this.#unsubscribeDispose = adapter.controller.onDispose(() => {
      this.#controllerDisposed = true;
      const failures: unknown[] = [];
      try { this.cancelEditing(); } catch (error) { failures.push(error); }
      try { this.#publish(); } catch (error) { failures.push(error); }
      this.#throwFailures(failures, "Data-view controller disposal failed.");
    });
    this.#unsubscribe = adapter.controller.subscribeChanges((change) => {
      const failures: unknown[] = [];
      const beforeSelection = this.#snapshot.selection;
      if ((change.kind === "content" || change.kind === "arrangement" || change.kind === "selection") && this.#editingId !== null) {
        try { this.cancelEditing(); } catch (error) { failures.push(error); }
      }
      this.#reconcileActive();
      try { this.#publish(); } catch (error) { failures.push(error); }
      const afterSelection = change.snapshot.selection;
      if (beforeSelection !== afterSelection) {
        try {
          this.#options.onSelectionChange?.({
            reason: this.#pendingSelectionReason ?? "controller-change",
            snapshot: afterSelection,
            change: createSelectionChange(beforeSelection, afterSelection),
          });
        } catch (error) { failures.push(error); }
      }
      this.#throwFailures(failures, "Data-view controller reconciliation failed.");
    });
  }

  getSnapshot = (): NSEDataViewSnapshot<T, TId> => this.#snapshot;

  /** True once the controller is disposed; the view is then inert. */
  get controllerDisposed(): boolean {
    return this.#controllerDisposed;
  }

  entryForId = (id: TId): NSEDataViewSnapshot<T, TId>["items"][number] | undefined => this.#entryById.get(id);

  indexForId = (id: TId): number => this.#indexById.get(id) ?? -1;

  subscribe = (listener: () => void): (() => boolean) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  updateOptions(options: NSEDataViewCoordinatorOptions<T, TId>): void {
    this.#options = options;
  }

  /**
   * Adopts a new adapter object for the same controller. Item callbacks are
   * read from the latest adapter; items are projected again only when
   * `idForItem` or `isItemDisabled` changed identity, and the snapshot keeps
   * its identity when the projection did not change.
   */
  updateAdapter(adapter: NSEDataViewAdapter<T, TId>): void {
    if (adapter.controller !== this.#adapter.controller) {
      throw new TypeError("A data-view coordinator keeps the controller it was created with.");
    }
    const previous = this.#adapter;
    this.#adapter = adapter;
    if (previous.idForItem === adapter.idForItem && previous.isItemDisabled === adapter.isItemDisabled) return;
    const items = this.#projectedItems;
    this.#projectedArranged = null;
    this.#reconcileActive();
    if (this.#projectedItems === items) return;
    this.#revision += 1;
    this.#snapshot = this.#project();
  }

  setState(state: NSEDataViewState): void {
    if (
      this.#state.kind === state.kind &&
      (this.#state.kind === "ready" || (
        "message" in this.#state &&
        "message" in state &&
        this.#state.message === state.message &&
        (!("retry" in this.#state) && !("retry" in state) || ("retry" in this.#state && "retry" in state && this.#state.retry === state.retry)) &&
        (!("resume" in this.#state) && !("resume" in state) || ("resume" in this.#state && "resume" in state && this.#state.resume === state.resume))
      ))
    ) return;
    this.#state = state;
    this.#publish();
  }

  setActive(id: TId): boolean {
    if (this.#ignoresStaleEvent("focus movement")) return false;
    const entry = this.#entry(id);
    if (!entry || entry.disabled || !this.#allowsInteraction() || Object.is(this.#activeId, id)) return false;
    this.#activeId = id;
    this.#publish();
    return true;
  }

  moveActive(offset: number): boolean {
    const enabled = this.#enabledIdsCache;
    if (enabled.length === 0) return false;
    const current = this.#activeId === null ? -1 : this.#enabledIndexById.get(this.#activeId) ?? -1;
    const next = Math.min(enabled.length - 1, Math.max(0, current + offset));
    return this.setActive(enabled[next]!);
  }

  moveActiveTo(edge: "start" | "end"): boolean {
    const enabled = this.#enabledIdsCache;
    if (enabled.length === 0) return false;
    return this.setActive(edge === "start" ? enabled[0]! : enabled.at(-1)!);
  }

  moveActiveByTypeahead(text: string): boolean {
    const query = text.trim().toLocaleLowerCase();
    if (!query) return false;
    const items = this.#snapshot.items;
    const current = this.#activeId === null ? -1 : items.findIndex(({ id }) => Object.is(id, this.#activeId));
    for (let offset = 1; offset <= items.length; offset += 1) {
      const entry = items[(current + offset) % items.length]!;
      if (!entry.disabled && this.#adapter.labelForItem(entry.item).toLocaleLowerCase().startsWith(query)) {
        return this.setActive(entry.id);
      }
    }
    return false;
  }

  select(id: TId, reason: NSEDataViewSelectionEvent<TId>["reason"], mode: "replace" | "toggle" | "range" = "replace"): boolean {
    if (this.#ignoresStaleEvent("selection")) return false;
    const entry = this.#entry(id);
    if (!entry || entry.disabled || !this.#allowsInteraction() || this.#options.selectionMode === "none") return false;
    if (this.#options.delegate?.shouldSelect?.(id, entry.item) === false) return false;
    this.setActive(id);
    this.#pendingSelectionReason = reason;
    let changed = false;
    try {
      changed = mode === "toggle" && this.#options.selectionMode === "multiple"
        ? this.#adapter.controller.toggleSelection(id)
        : mode === "range" && this.#options.selectionMode === "multiple"
          ? this.#adapter.controller.extendSelection(id)
          : this.#adapter.controller.select([id]);
    } finally {
      this.#pendingSelectionReason = null;
    }
    if (!changed) return false;
    return true;
  }

  activate(id: TId = this.#activeId!): boolean {
    if (this.#ignoresStaleEvent("activation")) return false;
    const entry = id === null ? null : this.#entry(id);
    if (!entry || entry.disabled || !this.#allowsInteraction()) return false;
    this.#options.delegate?.didActivate?.(entry.id, entry.item);
    return true;
  }

  requestContextMenu(id: TId, anchor: HTMLElement): boolean {
    if (this.#ignoresStaleEvent("a context menu request")) return false;
    const entry = this.#entry(id);
    if (!entry || entry.disabled || !this.#allowsInteraction()) return false;
    this.#options.delegate?.didRequestContextMenu?.(id, anchor);
    return true;
  }

  beginEditing(id: TId, cancel: () => void): boolean {
    if (this.#ignoresStaleEvent("editing")) return false;
    const entry = this.#entry(id);
    if (!entry || entry.disabled || this.#state.kind !== "ready") return false;
    if (this.#editingId !== null) this.cancelEditing();
    this.#editingId = id;
    this.#cancelEditing = cancel;
    this.#publish();
    return true;
  }

  finishEditing(): void {
    if (this.#editingId === null) return;
    this.#editingId = null;
    this.#cancelEditing = null;
    this.#publish();
  }

  cancelEditing(): void {
    if (this.#editingId === null) return;
    const cancel = this.#cancelEditing;
    this.#editingId = null;
    this.#cancelEditing = null;
    const failures: unknown[] = [];
    try { this.#publish(); } catch (error) { failures.push(error); }
    try { cancel?.(); } catch (error) { failures.push(error); }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, "Data-view editing cancellation failed.");
  }

  dispose(): void {
    let failure: unknown;
    try { this.cancelEditing(); } catch (error) { failure = error; }
    this.#unsubscribe();
    this.#unsubscribeDispose();
    this.#listeners.clear();
    if (failure !== undefined) throw failure;
  }

  #allowsInteraction(): boolean {
    return this.#state.kind === "ready" || this.#state.kind === "read-only";
  }

  /**
   * A disposed controller can no longer select or edit. Its view keeps its
   * last rows but drops every interaction rather than throwing from an event
   * handler, and development builds say why once per view.
   */
  #ignoresStaleEvent(interaction: string): boolean {
    if (!this.#controllerDisposed) return false;
    if (!this.#warnedControllerDisposed) {
      this.#warnedControllerDisposed = true;
      warnDisposedDataViewController(this.#adapter.controller, interaction);
    }
    return true;
  }

  #entry(id: TId) {
    return this.#entryById.get(id);
  }

  #reconcileActive(): void {
    this.#ensureProjection(this.#adapter.controller.getSnapshot().arranged);
    if (this.#activeId !== null && this.#enabledIndexById.has(this.#activeId)) return;
    this.#activeId = this.#enabledIdsCache[0] ?? null;
  }

  #ensureProjection(arranged: readonly T[]): void {
    if (arranged === this.#projectedArranged) return;
    const previous = new Map(this.#projectedItems.map((entry) => [entry.id, entry]));
    const identities = new Set<TId>();
    const items = arranged.map((item, index) => {
      const id = this.#adapter.idForItem(item);
      encodeNSEDataViewKey(id);
      if (identities.has(id)) throw new TypeError("Data-view adapter returned a duplicate identity.");
      identities.add(id);
      const disabled = this.#adapter.isItemDisabled?.(item) ?? false;
      const old = previous.get(id);
      return old && old.item === item && old.index === index && old.disabled === disabled
        ? old
        : Object.freeze({ id, item, index, indexPath: IndexPath.from(index), disabled });
    });
    this.#projectedArranged = arranged;
    const current = this.#projectedItems;
    if (items.length === current.length && items.every((entry, index) => entry === current[index])) return;
    this.#projectedItems = Object.freeze(items);
    this.#entryById = new Map(items.map((entry) => [entry.id, entry]));
    this.#indexById = new Map(items.map((entry) => [entry.id, entry.index]));
    this.#enabledIdsCache = Object.freeze(items.filter(({ disabled }) => !disabled).map(({ id }) => id));
    this.#enabledIndexById = new Map(this.#enabledIdsCache.map((id, index) => [id, index]));
  }

  #project(): NSEDataViewSnapshot<T, TId> {
    const controller = this.#adapter.controller.getSnapshot();
    this.#ensureProjection(controller.arranged);
    return Object.freeze({
      revision: this.#revision,
      items: this.#projectedItems,
      selection: controller.selection,
      activeId: this.#activeId,
      editingId: this.#editingId,
      state: this.#controllerDisposed ? dataViewDisposedControllerState : this.#state,
      changeSet: controller.changeSet,
      sortDescriptors: controller.sortDescriptors,
    });
  }

  #publish(): void {
    this.#revision += 1;
    this.#snapshot = this.#project();
    const failures: unknown[] = [];
    for (const listener of this.#listeners) try { listener(); } catch (error) { failures.push(error); }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, "Data-view subscribers failed.");
  }

  #throwFailures(failures: readonly unknown[], message: string): void {
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, message);
  }
}
