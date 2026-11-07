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

import { NSEViewController, type NSETraitCollection, type NSEViewComponent } from "../../Application/NSEViewController";
import { resolveNSEBookRegions } from "../../Navigation/bookRegions";
import type { SynCloudOSPresentationTraits } from "../../../SynCloudOS/SynCloudOS";
import type { NSEUserDefaultsController } from "../../Controllers";
import type { NSEDataViewState } from "../Core";
import { nseSplitViewItemHost, type NSESplitViewItem, type NSESplitViewItemHost } from "./NSESplitViewItem";
import type {
  NSESplitViewControllerOptions,
  NSESplitViewItemSnapshot,
  NSESplitViewPreferences,
  NSESplitViewSnapshot,
} from "./splitViewTypes";
import { NSESplitViewControllerView } from "./splitViewControllerView";

/** The solver's view of an item. `collapsePriority` is the item's holding priority. */
interface SplitPane {
  readonly id: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly collapsible: boolean;
  readonly collapsePriority: number;
}

const READY: NSEDataViewState = Object.freeze({ kind: "ready" });

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

interface SplitSizeSolution {
  readonly sizes: ReadonlyMap<string, number>;
  readonly collapsedIds: ReadonlySet<string>;
}

function distributeWithinPriority(
  panes: readonly SplitPane[],
  sizes: Map<string, number>,
  requestedDelta: number,
): number {
  const growing = requestedDelta > 0;
  let remaining = Math.abs(requestedDelta);
  let candidates = panes.filter((pane) => {
    const size = sizes.get(pane.id)!;
    return growing ? size < pane.maximum : size > pane.minimum;
  });

  while (remaining > 0.001 && candidates.length > 0) {
    const capacities = candidates.map((pane) => {
      const size = sizes.get(pane.id)!;
      return growing ? pane.maximum - size : size - pane.minimum;
    });
    const finiteCapacity = capacities.every(Number.isFinite)
      ? capacities.reduce((sum, capacity) => sum + capacity, 0)
      : Number.POSITIVE_INFINITY;
    const allocation = Math.min(remaining, finiteCapacity);
    const weights = growing
      ? candidates.map((pane) => Math.max(1, sizes.get(pane.id)!))
      : capacities;
    const weightTotal = weights.reduce((sum, weight) => sum + (Number.isFinite(weight) ? weight : 0), 0);
    let applied = 0;

    for (let index = 0; index < candidates.length; index += 1) {
      const pane = candidates[index]!;
      const capacity = capacities[index]!;
      const fallbackWeight = 1 / candidates.length;
      const weight = weightTotal > 0 && Number.isFinite(weights[index]!) ? weights[index]! / weightTotal : fallbackWeight;
      const share = Math.min(capacity, allocation * weight);
      const current = sizes.get(pane.id)!;
      sizes.set(pane.id, current + (growing ? share : -share));
      applied += share;
    }

    if (applied <= 0.001) break;
    remaining -= applied;
    candidates = candidates.filter((pane) => {
      const size = sizes.get(pane.id)!;
      return growing ? size < pane.maximum - 0.001 : size > pane.minimum + 0.001;
    });
  }

  const applied = Math.abs(requestedDelta) - remaining;
  return requestedDelta > 0 ? applied : -applied;
}

/** Distributes `availableSize` among the panes by their constraints and holding priorities. */
function distributeSplitSizes(
  panes: readonly SplitPane[],
  requested: ReadonlyMap<string, number>,
  availableSize: number,
  explicitlyCollapsed: ReadonlySet<string>,
): SplitSizeSolution {
  const total = Math.max(0, Math.round(availableSize));
  const collapsed = new Set(
    panes.filter((pane) => pane.collapsible && explicitlyCollapsed.has(pane.id)).map((pane) => pane.id),
  );
  if (panes.length > 0 && panes.every(({ id }) => collapsed.has(id))) collapsed.delete(panes.find(({ collapsible }) => !collapsible)?.id ?? panes[0]!.id);
  const minimumTotal = () => panes.reduce((sum, pane) => sum + (collapsed.has(pane.id) ? 0 : pane.minimum), 0);
  const collapseCandidates = panes
    .filter((pane) => pane.collapsible && !collapsed.has(pane.id))
    .sort((left, right) => right.collapsePriority - left.collapsePriority || panes.indexOf(right) - panes.indexOf(left));
  while (minimumTotal() > total && collapseCandidates.length > 0 && panes.length - collapsed.size > 1) {
    collapsed.add(collapseCandidates.shift()!.id);
  }

  const sizes = new Map<string, number>();
  for (const pane of panes) {
    const restored = requested.get(pane.id);
    sizes.set(pane.id, collapsed.has(pane.id)
      ? 0
      : clamp(Number.isFinite(restored) ? restored! : pane.minimum, pane.minimum, pane.maximum));
  }

  let delta = total - [...sizes.values()].reduce((sum, size) => sum + size, 0);
  const candidates = panes
    .filter((pane) => !collapsed.has(pane.id))
    .sort((left, right) => left.collapsePriority - right.collapsePriority || panes.indexOf(left) - panes.indexOf(right));
  for (const priority of [...new Set(candidates.map(({ collapsePriority }) => collapsePriority))]) {
    if (Math.abs(delta) <= 0.001) break;
    const group = candidates.filter(({ collapsePriority }) => collapsePriority === priority);
    delta -= distributeWithinPriority(group, sizes, delta);
  }

  return { sizes, collapsedIds: collapsed };
}

/** @internal What the split view controller's own view drives: geometry, presentation and divider moves. */
export const nseSplitViewLayout: unique symbol = Symbol("nse.splitViewLayout");

/** @internal */
export interface NSESplitViewLayout {
  resize(availableSize: number): void;
  updateBounds(bounds: SynCloudOSPresentationTraits["contentBounds"] | null): void;
  moveDivider(index: number, delta: number): boolean;
  moveDividerTo(index: number, edge: "minimum" | "maximum"): boolean;
  resetSizes(): void;
}

/**
 * A view controller that arranges its children side by side or stacked, divided by draggable dividers
 * (NSSplitViewController). Each child is an `NSESplitViewItem`; the controller renders its own split
 * view, and in a compact width the outermost split view shows one item at a time.
 */
export class NSESplitViewController extends NSEViewController<NSESplitViewSnapshot> {
  readonly id: string;
  readonly #isVertical: boolean;
  readonly #items: NSESplitViewItem[] = [];
  readonly #preferences?: NSEUserDefaultsController<NSESplitViewPreferences>;
  readonly #restored: NSESplitViewPreferences | undefined;
  readonly #host: NSESplitViewItemHost;
  #requestedSizes = new Map<string, number>();
  #explicitlyCollapsed = new Set<string>();
  #presentation: "split" | "single-pane" = "split";
  #contentBounds: SynCloudOSPresentationTraits["contentBounds"] | null = null;
  #activeId = "";
  #preferredActiveId = "";
  #availableSize = 0;
  #revision = 0;
  #state: NSEDataViewState = READY;
  #snapshot: NSESplitViewSnapshot;

  constructor(options: NSESplitViewControllerOptions) {
    super(options);
    if (!options.id.trim()) throw new TypeError("Split view id must not be empty.");
    this.id = options.id;
    this.#isVertical = options.isVertical ?? true;
    this.#preferences = options.preferences;
    this.#restored = options.preferences?.getSnapshot().value;
    if (this.#restored?.activePaneId) {
      this.#activeId = this.#restored.activePaneId;
      this.#preferredActiveId = this.#restored.activePaneId;
    }
    this.#host = {
      isItemCollapsed: (identifier) => this.#snapshot.items.find((item) => item.identifier === identifier)?.isCollapsed ?? false,
      setItemCollapsed: (identifier, collapsed) => this.#setCollapsed(identifier, collapsed),
    };
    this.#snapshot = this.#solve(true);
    this.getSnapshot = () => this.#snapshot;
    for (const item of options.splitViewItems ?? []) this.addSplitViewItem(item);
  }

  get snapshot(): NSESplitViewSnapshot {
    return this.#snapshot;
  }

  /** The split view's items, in order (NSSplitViewController.splitViewItems). */
  get splitViewItems(): readonly NSESplitViewItem[] {
    return [...this.#items];
  }

  /** Whether the items sit side by side (NSSplitView.isVertical). */
  get isVertical(): boolean {
    return this.#isVertical;
  }

  /**
   * The item selected for a compact width. This NSE extension keeps AppKit's split items while
   * presenting one view at a time on a phone. Assign null to return to the first available item.
   */
  get compactItem(): NSESplitViewItem | null {
    return this.#items.find(({ identifier }) => identifier === this.#preferredActiveId)
      ?? this.#items.find(({ identifier }) => identifier === this.#activeId) ?? null;
  }

  set compactItem(item: NSESplitViewItem | null) {
    const next = item ?? this.#items.find(({ identifier }) => !this.#explicitlyCollapsed.has(identifier));
    if (!next) return;
    if (!this.#items.includes(next)) throw new RangeError("The compact item must belong to this split view controller.");
    this.setActiveItem(next.identifier);
  }

  /** Shows an existing child's detail view, expanding its split item if necessary. */
  showDetail(viewController: NSEViewController<unknown>): void {
    const item = this.splitViewItemForViewController(viewController);
    if (!item) throw new RangeError("The detail view controller must belong to this split view controller.");
    this.compactItem = item;
  }

  override traitCollectionDidChange(_previous: NSETraitCollection): void {
    this.#updatePresentation();
    this.#replace();
  }

  /** The loading, permission or error state the split view presents in place of its items. */
  get state(): NSEDataViewState {
    return this.#state;
  }

  set state(state: NSEDataViewState) {
    if (state === this.#state) return;
    this.#state = state;
    this.#replace();
  }

  /** Adds an item after the others, adopting its view controller as a child. */
  addSplitViewItem(item: NSESplitViewItem): void {
    this.insertSplitViewItem(item, this.#items.length);
  }

  /** Inserts an item at `index`, adopting its view controller as a child. */
  insertSplitViewItem(item: NSESplitViewItem, index: number): void {
    if (this.#items.includes(item)) return;
    if (this.#items.some(({ identifier }) => identifier === item.identifier)) {
      throw new TypeError(`Split view item identifiers must be unique: ${item.identifier}`);
    }
    const initiallyCollapsed = item.isCollapsed;
    item[nseSplitViewItemHost](this.#host);
    this.addChild(item.viewController);
    this.#items.splice(Math.max(0, Math.min(index, this.#items.length)), 0, item);
    const restored = this.#restored;
    const size = restored?.sizes[item.identifier];
    if (size !== undefined && Number.isFinite(size) && !this.#requestedSizes.has(item.identifier)) this.#requestedSizes.set(item.identifier, size);
    const collapsed = restored ? restored.collapsedPaneIds.includes(item.identifier) : initiallyCollapsed;
    if (collapsed && item.canCollapse) this.#explicitlyCollapsed.add(item.identifier);
    if (!this.#preferredActiveId) this.#preferredActiveId = item.identifier;
    if (item.identifier === this.#preferredActiveId || !this.#items.some(({ identifier }) => identifier === this.#activeId)) {
      this.#activeId = item.identifier === this.#preferredActiveId ? item.identifier : this.#items[0]!.identifier;
    }
    this.#ensureSurvivor();
    this.#replace();
  }

  /**
   * Removes an item. Its view controller leaves the controller's children and is disposed; its
   * thickness is remembered should an item with its identifier return.
   */
  removeSplitViewItem(item: NSESplitViewItem): void {
    const index = this.#items.indexOf(item);
    if (index < 0) return;
    this.#items.splice(index, 1);
    item[nseSplitViewItemHost](null);
    this.#explicitlyCollapsed.delete(item.identifier);
    if (this.#activeId === item.identifier) this.#activeId = this.#items[0]?.identifier ?? "";
    if (this.#preferredActiveId === item.identifier) this.#preferredActiveId = this.#activeId;
    item.viewController.removeFromParent();
    this.#ensureSurvivor();
    this.#replace();
  }

  /** The item that shows `viewController` (NSSplitViewController.splitViewItem(for:)). */
  splitViewItemForViewController(viewController: NSEViewController<unknown>): NSESplitViewItem | null {
    return this.#items.find((item) => item.viewController === viewController) ?? null;
  }

  /** Collapses or expands the first sidebar item (NSSplitViewController.toggleSidebar(_:)). */
  toggleSidebar(): void {
    const sidebar = this.#items.find(({ behavior }) => behavior === "sidebar");
    if (sidebar) sidebar.isCollapsed = !sidebar.isCollapsed;
  }

  /** Collapses or expands the first inspector item (NSSplitViewController.toggleInspector(_:)). */
  toggleInspector(): void {
    const inspector = this.#items.find(({ behavior }) => behavior === "inspector");
    if (inspector) inspector.isCollapsed = !inspector.isCollapsed;
  }

  /**
   * Places the divider at `dividerIndex` at `position`, measured from the split view's leading or top
   * edge, within the neighbouring items' limits (NSSplitView.setPosition(_:ofDividerAt:)).
   */
  setPosition(position: number, dividerIndex: number): boolean {
    if (!Number.isFinite(position)) throw new RangeError("A divider position must be finite.");
    const visible = this.#snapshot.items.filter(({ isCollapsed }) => !isCollapsed);
    if (!visible[dividerIndex + 1]) return false;
    const leadingEdge = visible.slice(0, dividerIndex).reduce((sum, item) => sum + item.thickness, 0);
    return this.#moveDivider(dividerIndex, position - leadingEdge - visible[dividerIndex]!.thickness);
  }

  /** Shows `identifier`'s item: the one item a compact width presents, expanding it if collapsed. */
  setActiveItem(identifier: string): void {
    if (!this.#items.some((item) => item.identifier === identifier)) throw new RangeError(`Unknown split view item: ${identifier}`);
    if (this.#snapshot.items.find((item) => item.identifier === identifier)?.isCollapsed) this.#setCollapsed(identifier, false);
    if (this.#activeId === identifier && this.#preferredActiveId === identifier) return;
    this.#activeId = identifier;
    this.#preferredActiveId = identifier;
    this.#replace(true);
  }

  override viewDidLayout(): void {
    const element = this.view.element;
    const width = element.clientWidth;
    const height = element.clientHeight;
    if (width <= 0 || height <= 0) return;
    const { x, y } = element.getBoundingClientRect();
    this[nseSplitViewLayout].updateBounds({ x, y, width, height });
  }

  override viewDidDisappear(): void {
    this[nseSplitViewLayout].updateBounds(null);
  }

  /** @internal */
  get [nseSplitViewLayout](): NSESplitViewLayout {
    return {
      resize: (availableSize) => this.#resize(availableSize),
      updateBounds: (bounds) => {
        if (bounds && (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0)) return;
        const previous = this.#contentBounds;
        if (previous === bounds || previous && bounds && previous.x === bounds.x && previous.y === bounds.y && previous.width === bounds.width && previous.height === bounds.height) return;
        this.#contentBounds = bounds ? Object.freeze({ ...bounds }) : null;
        this.#updatePresentation();
        this.#replace();
      },
      moveDivider: (index, delta) => this.#moveDivider(index, delta),
      moveDividerTo: (index, edge) => this.#moveDividerTo(index, edge),
      resetSizes: () => {
        this.#requestedSizes = new Map();
        this.#replace(true);
      },
    };
  }

  #updatePresentation(): void {
    const traits = this.traitCollection.presentation;
    // Retain the last renderer while geometry is hidden or unavailable, never old hinge positions.
    if (!traits || traits.geometryState !== "current") return;
    let nested = false;
    for (let ancestor = this.parent; ancestor; ancestor = ancestor.parent) {
      if (ancestor instanceof NSESplitViewController) { nested = true; break; }
    }
    const bounds = this.#contentBounds ?? traits.contentBounds;
    this.#availableSize = Math.max(0, Math.round(this.#isVertical ? bounds.width : bounds.height));
    const book = this.#isVertical ? resolveNSEBookRegions(traits, bounds) : null;
    this.#presentation = !nested && !book && bounds.width < 768 ? "single-pane" : "split";
    if (this.#presentation === "single-pane" && this.#items.some(({ identifier }) => identifier === this.#preferredActiveId && !this.#explicitlyCollapsed.has(identifier))) {
      this.#activeId = this.#preferredActiveId;
    }
  }

  #resize(availableSize: number): void {
    if (!Number.isFinite(availableSize) || availableSize < 0) {
      throw new RangeError("Split view size must be a non-negative finite number.");
    }
    const rounded = Math.round(availableSize);
    if (this.#availableSize === rounded && this.#revision > 0) return;
    this.#availableSize = rounded;
    this.#replace();
  }

  #setCollapsed(identifier: string, collapsed: boolean): void {
    const item = this.#items.find((candidate) => candidate.identifier === identifier);
    if (!item) throw new RangeError(`Unknown split view item: ${identifier}`);
    if (collapsed && !item.canCollapse) throw new TypeError(`Split view item "${identifier}" cannot collapse.`);
    const changed = collapsed ? !this.#explicitlyCollapsed.has(identifier) : this.#explicitlyCollapsed.has(identifier);
    if (!changed) return;
    if (collapsed) this.#explicitlyCollapsed.add(identifier);
    else this.#explicitlyCollapsed.delete(identifier);
    this.#ensureSurvivor();
    if (collapsed && this.#activeId === identifier) {
      this.#activeId = this.#items.find((candidate) => candidate.identifier !== identifier && !this.#explicitlyCollapsed.has(candidate.identifier))?.identifier ?? identifier;
      this.#preferredActiveId = this.#activeId;
    }
    this.#replace(true);
  }

  #pane(identifier: string): SplitPane | undefined {
    const item = this.#items.find((candidate) => candidate.identifier === identifier);
    return item ? paneFor(item) : undefined;
  }

  #moveDivider(index: number, delta: number): boolean {
    if (!Number.isFinite(delta)) throw new RangeError("Split divider movement must be finite.");
    const visible = this.#snapshot.items.filter(({ isCollapsed }) => !isCollapsed);
    const leading = visible[index];
    const trailing = visible[index + 1];
    if (!leading || !trailing) return false;
    const leadingPane = this.#pane(leading.identifier)!;
    const trailingPane = this.#pane(trailing.identifier)!;
    const constrained = clamp(
      delta,
      Math.max(leadingPane.minimum - leading.thickness, trailing.thickness - trailingPane.maximum),
      Math.min(leadingPane.maximum - leading.thickness, trailing.thickness - trailingPane.minimum),
    );
    if (constrained === 0) return false;
    this.#requestedSizes.set(leading.identifier, leading.thickness + constrained);
    this.#requestedSizes.set(trailing.identifier, trailing.thickness - constrained);
    this.#replace(true);
    return true;
  }

  #moveDividerTo(index: number, edge: "minimum" | "maximum"): boolean {
    const visible = this.#snapshot.items.filter(({ isCollapsed }) => !isCollapsed);
    const leading = visible[index];
    const trailing = visible[index + 1];
    if (!leading || !trailing) return false;
    const leadingPane = this.#pane(leading.identifier)!;
    const trailingPane = this.#pane(trailing.identifier)!;
    const target = edge === "minimum"
      ? leadingPane.minimum
      : Math.min(leadingPane.maximum, leading.thickness + trailing.thickness - trailingPane.minimum);
    return this.#moveDivider(index, target - leading.thickness);
  }

  #ensureSurvivor(): void {
    if (this.#items.length === 0 || this.#items.some(({ identifier }) => !this.#explicitlyCollapsed.has(identifier))) return;
    const survivor = this.#items.find(({ identifier }) => identifier === this.#activeId)
      ?? this.#items.find(({ canCollapse }) => !canCollapse)
      ?? this.#items[0]!;
    this.#explicitlyCollapsed.delete(survivor.identifier);
    this.#activeId = survivor.identifier;
    this.#preferredActiveId = survivor.identifier;
  }

  #solve(preserveActiveItem = false): NSESplitViewSnapshot {
    // Before the split view has a size every collapsible item is collapsed, which says nothing about
    // which item the person was using.
    const preserveActive = preserveActiveItem || this.#availableSize === 0;
    this.#ensureSurvivor();
    const common = {
      revision: this.#revision,
      isVertical: this.#isVertical,
      presentation: this.#presentation,
      bookRegions: this.#isVertical && this.traitCollection.presentation
        ? resolveNSEBookRegions(this.traitCollection.presentation, this.#contentBounds ?? this.traitCollection.presentation.contentBounds)
        : null,
      availableSize: this.#availableSize,
      state: this.#state,
    };
    if (this.#presentation === "single-pane") {
      if (!this.#items.some(({ identifier }) => identifier === this.#activeId && !this.#explicitlyCollapsed.has(identifier))) {
        this.#activeId = this.#items.find(({ identifier }) => !this.#explicitlyCollapsed.has(identifier))?.identifier ?? "";
      }
      return Object.freeze({
        ...common,
        items: Object.freeze(this.#items.map((item) => Object.freeze({
          identifier: item.identifier,
          thickness: item.identifier === this.#activeId ? this.#availableSize : 0,
          isCollapsed: this.#explicitlyCollapsed.has(item.identifier),
        }))),
        activeItemIdentifier: this.#activeId,
      });
    }
    const panes = this.#items.map(paneFor);
    // An item's preferred fraction holds until a divider next to it moves; then its thickness does.
    const requested = new Map(this.#requestedSizes);
    for (const item of this.#items) {
      if (!requested.has(item.identifier) && item.preferredThicknessFraction !== undefined) {
        requested.set(item.identifier, Math.round(item.preferredThicknessFraction * this.#availableSize));
      }
    }
    const solution = distributeSplitSizes(panes, requested, this.#availableSize, this.#explicitlyCollapsed);
    const snapshots: NSESplitViewItemSnapshot[] = panes.map((pane) => Object.freeze({
      identifier: pane.id,
      thickness: solution.sizes.get(pane.id) ?? 0,
      isCollapsed: solution.collapsedIds.has(pane.id),
    }));
    const active = snapshots.find(({ identifier, isCollapsed }) => identifier === this.#activeId && !isCollapsed)
      ?? snapshots.find(({ isCollapsed }) => !isCollapsed)
      ?? snapshots[0];
    if (!preserveActive && active) this.#activeId = active.identifier;
    return Object.freeze({
      ...common,
      items: Object.freeze(snapshots),
      activeItemIdentifier: preserveActive ? this.#activeId : active?.identifier ?? "",
    });
  }

  #replace(persist = false): void {
    this.#revision += 1;
    this.#snapshot = this.#solve();
    if (persist) this.#persist();
    this.notifyObservers();
  }

  #persist(): void {
    const preferences = this.#preferences;
    if (!preferences) return;
    preferences.set("sizes", Object.freeze(Object.fromEntries(this.#requestedSizes)));
    preferences.set("collapsedPaneIds", Object.freeze([...this.#explicitlyCollapsed]));
    preferences.set("activePaneId", this.#preferredActiveId || null);
  }

  static override view: NSEViewComponent = NSESplitViewControllerView;
}

function paneFor(item: NSESplitViewItem): SplitPane {
  return {
    id: item.identifier,
    minimum: item.minimumThickness,
    maximum: item.maximumThickness,
    collapsible: item.canCollapse,
    collapsePriority: item.holdingPriority,
  };
}
