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

import { NSEViewController } from "../../Application/NSEViewController";
import type { NSEPreferencesController } from "../../Controllers";
import type {
  NSESplitPane,
  NSESplitPaneSnapshot,
  NSESplitViewControllerOptions,
  NSESplitViewPreferences,
  NSESplitViewSnapshot,
} from "./splitViewTypes";

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function validatePane(pane: NSESplitPane): NSESplitPane {
  if (!pane.id.trim()) throw new TypeError("Split pane id must not be empty.");
  if (
    !Number.isFinite(pane.minimum) || pane.minimum < 0 ||
    !Number.isFinite(pane.ideal) || pane.ideal < pane.minimum ||
    (!(Number.isFinite(pane.maximum) || pane.maximum === Number.POSITIVE_INFINITY)) ||
    pane.maximum < pane.ideal || !Number.isFinite(pane.collapsePriority)
  ) {
    throw new RangeError(`Split pane "${pane.id}" has invalid size constraints.`);
  }
  return Object.freeze({ ...pane });
}

export interface SplitSizeSolution {
  readonly sizes: ReadonlyMap<string, number>;
  readonly collapsedIds: ReadonlySet<string>;
}

function distributeWithinPriority(
  panes: readonly NSESplitPane[],
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

export function distributeNSESplitSizes(
  panes: readonly NSESplitPane[],
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
      : clamp(Number.isFinite(restored) ? restored! : pane.ideal, pane.minimum, pane.maximum));
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

export class NSESplitViewController extends NSEViewController<NSESplitViewSnapshot> {
  readonly id: string;
  readonly #orientation: "horizontal" | "vertical";
  readonly #panes: readonly NSESplitPane[];
  readonly #paneById: ReadonlyMap<string, NSESplitPane>;
  readonly #preferences?: NSEPreferencesController<NSESplitViewPreferences>;
  #availableIds: ReadonlySet<string>;
  #requestedSizes: Map<string, number>;
  #explicitlyCollapsed: Set<string>;
  #presentation: "split" | "single-pane" = "split";
  #activePaneId: string;
  #preferredActivePaneId: string;
  #availableSize = 0;
  #revision = 0;
  #snapshot: NSESplitViewSnapshot;

  constructor(options: NSESplitViewControllerOptions) {
    super(options);
    if (!options.id.trim()) throw new TypeError("Split view id must not be empty.");
    if (options.panes.length === 0) throw new TypeError("Split views require at least one pane.");
    this.id = options.id;
    this.#orientation = options.orientation;
    this.#panes = Object.freeze(options.panes.map(validatePane));
    const ids = this.#panes.map(({ id }) => id);
    if (new Set(ids).size !== ids.length) throw new TypeError("Split pane ids must be unique.");
    this.#paneById = new Map(this.#panes.map((pane) => [pane.id, pane]));
    this.#preferences = options.preferences;
    this.#availableIds = new Set(ids);
    const restored = options.preferences?.getSnapshot().value;
    this.#requestedSizes = new Map(this.#panes.map((pane) => [
      pane.id,
      Number.isFinite(restored?.sizes[pane.id]) ? restored!.sizes[pane.id]! : pane.ideal,
    ]));
    this.#explicitlyCollapsed = new Set(
      restored?.collapsedPaneIds.filter((id) => this.#paneById.get(id)?.collapsible) ?? [],
    );
    this.#activePaneId = restored?.activePaneId && this.#availableIds.has(restored.activePaneId)
      ? restored.activePaneId
      : ids[0]!;
    this.#preferredActivePaneId = this.#activePaneId;
    if (this.#panes.every(({ id }) => this.#explicitlyCollapsed.has(id))) {
      this.#explicitlyCollapsed.delete(this.#activePaneId);
    }
    this.#ensureSurvivor();
    this.#snapshot = this.#solve(true);
    this.getSnapshot = () => this.#snapshot;
  }

  get snapshot(): NSESplitViewSnapshot {
    return this.#snapshot;
  }

  resize(availableSize: number): void {
    if (!Number.isFinite(availableSize) || availableSize < 0) {
      throw new RangeError("Split view size must be a non-negative finite number.");
    }
    const rounded = Math.round(availableSize);
    if (this.#availableSize === rounded && this.#revision > 0) return;
    this.#availableSize = rounded;
    this.#replace();
  }

  setPresentation(presentation: "split" | "single-pane"): void {
    if (presentation === this.#presentation) return;
    this.#presentation = presentation;
    this.#replace();
  }

  setAvailablePaneIds(ids: ReadonlySet<string>): void {
    const next = new Set([...ids].filter((id) => this.#paneById.has(id)));
    if (next.size === 0) throw new RangeError("Split views require one available pane.");
    if (next.size === this.#availableIds.size && [...next].every((id) => this.#availableIds.has(id))) return;
    this.#availableIds = next;
    this.#ensureSurvivor();
    if (next.has(this.#preferredActivePaneId)) this.#activePaneId = this.#preferredActivePaneId;
    else if (!next.has(this.#activePaneId)) this.#activePaneId = this.#orderedAvailablePanes()[0]!.id;
    this.#replace(true);
  }

  setActivePane(id: string): void {
    if (!this.#availableIds.has(id)) throw new RangeError(`Unknown available split pane: ${id}`);
    if (this.#snapshot.panes.find((pane) => pane.id === id)?.collapsed) {
      this.setCollapsed(id, false);
    }
    if (this.#activePaneId === id) return;
    this.#activePaneId = id;
    this.#preferredActivePaneId = id;
    this.#replace(true);
  }

  setCollapsed(id: string, collapsed: boolean): void {
    const pane = this.#paneById.get(id);
    if (!pane || !this.#availableIds.has(id)) throw new RangeError(`Unknown available split pane: ${id}`);
    if (collapsed && !pane.collapsible) throw new TypeError(`Split pane "${id}" cannot be collapsed.`);
    const changed = collapsed ? !this.#explicitlyCollapsed.has(id) : this.#explicitlyCollapsed.has(id);
    if (!changed) return;
    if (collapsed) this.#explicitlyCollapsed.add(id);
    else this.#explicitlyCollapsed.delete(id);
    this.#ensureSurvivor();
    if (collapsed && this.#activePaneId === id) {
      this.#activePaneId = this.#orderedAvailablePanes().find((candidate) => candidate.id !== id && !this.#explicitlyCollapsed.has(candidate.id))?.id ?? id;
      this.#preferredActivePaneId = this.#activePaneId;
    }
    this.#replace(true);
  }

  moveDivider(index: number, delta: number): boolean {
    if (!Number.isFinite(delta)) throw new RangeError("Split divider movement must be finite.");
    const panes = this.#snapshot.panes.filter(({ collapsed }) => !collapsed);
    const leading = panes[index];
    const trailing = panes[index + 1];
    if (!leading || !trailing) return false;
    const leadingDefinition = this.#paneById.get(leading.id)!;
    const trailingDefinition = this.#paneById.get(trailing.id)!;
    const constrained = clamp(
      delta,
      Math.max(leadingDefinition.minimum - leading.size, trailing.size - trailingDefinition.maximum),
      Math.min(leadingDefinition.maximum - leading.size, trailing.size - trailingDefinition.minimum),
    );
    if (constrained === 0) return false;
    this.#requestedSizes.set(leading.id, leading.size + constrained);
    this.#requestedSizes.set(trailing.id, trailing.size - constrained);
    this.#replace(true);
    return true;
  }

  moveDividerTo(index: number, edge: "minimum" | "maximum"): boolean {
    const panes = this.#snapshot.panes.filter(({ collapsed }) => !collapsed);
    const leading = panes[index];
    const trailing = panes[index + 1];
    if (!leading || !trailing) return false;
    const definition = this.#paneById.get(leading.id)!;
    const trailingDefinition = this.#paneById.get(trailing.id)!;
    const target = edge === "minimum"
      ? definition.minimum
      : Math.min(definition.maximum, leading.size + trailing.size - trailingDefinition.minimum);
    return this.moveDivider(index, target - leading.size);
  }

  resetSizes(): void {
    this.#requestedSizes = new Map(this.#panes.map((pane) => [pane.id, pane.ideal]));
    this.#replace(true);
  }

  #orderedAvailablePanes(): readonly NSESplitPane[] {
    return this.#panes.filter(({ id }) => this.#availableIds.has(id));
  }

  #ensureSurvivor(): void {
    const available = this.#orderedAvailablePanes();
    if (available.length === 0 || available.some(({ id }) => !this.#explicitlyCollapsed.has(id))) return;
    const survivor = available.find(({ id }) => id === this.#activePaneId)
      ?? available.find(({ collapsible }) => !collapsible)
      ?? available[0]!;
    this.#explicitlyCollapsed.delete(survivor.id);
    this.#activePaneId = survivor.id;
    this.#preferredActivePaneId = survivor.id;
  }

  #solve(preserveActive = false): NSESplitViewSnapshot {
    this.#ensureSurvivor();
    const panes = this.#orderedAvailablePanes();
    if (this.#presentation === "single-pane") {
      if (!panes.some(({ id }) => id === this.#activePaneId)) this.#activePaneId = panes[0]!.id;
      return Object.freeze({
        revision: this.#revision,
        orientation: this.#orientation,
        presentation: this.#presentation,
        panes: Object.freeze(panes.map((pane) => Object.freeze({
          id: pane.id,
          size: pane.id === this.#activePaneId ? this.#availableSize : 0,
          collapsed: false,
        }))),
        activePaneId: this.#activePaneId,
        availableSize: this.#availableSize,
      });
    }
    const solution = distributeNSESplitSizes(panes, this.#requestedSizes, this.#availableSize, this.#explicitlyCollapsed);
    const snapshots: NSESplitPaneSnapshot[] = panes.map((pane) => Object.freeze({
      id: pane.id,
      size: solution.sizes.get(pane.id) ?? 0,
      collapsed: solution.collapsedIds.has(pane.id),
    }));
    const active = snapshots.find(({ id, collapsed }) => id === this.#activePaneId && !collapsed)
      ?? snapshots.find(({ collapsed }) => !collapsed)
      ?? snapshots[0]!;
    if (!preserveActive) this.#activePaneId = active.id;
    return Object.freeze({
      revision: this.#revision,
      orientation: this.#orientation,
      presentation: this.#presentation,
      panes: Object.freeze(snapshots),
      activePaneId: preserveActive ? this.#activePaneId : active.id,
      availableSize: this.#availableSize,
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
    const sizes = Object.fromEntries(this.#requestedSizes);
    preferences.set("sizes", Object.freeze(sizes));
    preferences.set("collapsedPaneIds", Object.freeze([...this.#explicitlyCollapsed]));
    preferences.set("activePaneId", this.#preferredActivePaneId);
  }
}
