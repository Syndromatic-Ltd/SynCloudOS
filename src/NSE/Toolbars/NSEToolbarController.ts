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

import type { CommandDispatchResult, CommandPresentation } from "../../SynCloudOS/SynCloudOS";
import { commandValidationRequestKey, SynCloudOSLifecycleRecord, synCloudOSLifecycleSignalReason } from "../../SynCloudOS/nseRuntimeContracts";
import type {
  NSEToolbarConfiguration,
  NSEToolbarControllerOptions,
  NSEToolbarItem,
  NSEToolbarPreferences,
  NSEToolbarPresentedItem,
  NSEToolbarRefreshResult,
  NSEToolbarSnapshot,
} from "./toolbarTypes";

const initialSnapshot: NSEToolbarSnapshot = Object.freeze({
  generation: 0,
  validating: false,
  itemIds: Object.freeze([]),
  displayMode: "icon-and-label",
  sizeMode: "regular",
  items: Object.freeze([]),
  diagnostic: null,
});

interface AbortLease {
  readonly signal: AbortSignal;
  dispose(): void;
}

function createAbortLease(parent: AbortSignal): AbortLease {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (parent.aborted) abort();
  else parent.addEventListener("abort", abort, { once: true });
  return {
    signal: controller.signal,
    dispose() {
      parent.removeEventListener("abort", abort);
      if (!controller.signal.aborted) controller.abort();
    },
  };
}

function cancelled(commandId: string, reason: string): CommandDispatchResult<unknown> {
  return { status: "cancelled", commandId, operationId: "", reason };
}

type PresentationGeneration = ReturnType<NSEToolbarControllerOptions["runtime"]["commands"]["getPresentationGeneration"]>;
function samePresentationGeneration(left: PresentationGeneration | null, right: PresentationGeneration): boolean {
  return left?.registryGeneration === right.registryGeneration && left.responderGeneration === right.responderGeneration;
}

function cloneItemIds(value: readonly string[]): readonly string[] {
  return Object.freeze([...value]);
}

function validDisplayMode(value: unknown): value is NSEToolbarPreferences["displayMode"] {
  return value === "icon-and-label" || value === "icon-only" || value === "label-only";
}

function validSizeMode(value: unknown): value is NSEToolbarPreferences["sizeMode"] {
  return value === "regular" || value === "small";
}

function finiteNonNegative(value: number | undefined, field: string, itemId: string): void {
  if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
    throw new TypeError(`NSE toolbar ${field} must be a finite non-negative number (${itemId}).`);
  }
}

function assertOwner(owner: NSEToolbarConfiguration["owner"]): void {
  const id = owner.kind === "window" ? owner.windowControllerId : owner.applicationId;
  if (!id.trim()) throw new TypeError(`NSE toolbar ${owner.kind} owner IDs must not be empty.`);
}

function freezePresentedItems(items: readonly NSEToolbarPresentedItem[]): readonly NSEToolbarPresentedItem[] {
  return Object.freeze(items.map((item) => Object.freeze({ ...item })));
}

function itemInstances(
  ids: readonly string[],
  catalogue: ReadonlyMap<string, NSEToolbarItem>,
): readonly { readonly item: NSEToolbarItem; readonly instanceId: string }[] {
  const occurrences = new Map<string, number>();
  return Object.freeze(ids.map((id) => {
    const item = catalogue.get(id);
    if (!item) throw new TypeError(`NSE toolbar item "${id}" is not in the catalogue.`);
    const occurrence = occurrences.get(id) ?? 0;
    occurrences.set(id, occurrence + 1);
    return Object.freeze({ item, instanceId: `${id}:${occurrence}` });
  }));
}

function requestsFor(
  identifier: string,
  instances: readonly { readonly item: NSEToolbarItem; readonly instanceId: string }[],
) {
  return instances.flatMap(({ item, instanceId }) => item.kind === "command" ? [Object.freeze({
    key: commandValidationRequestKey(`${identifier}:${instanceId}`),
    commandId: item.commandId,
    payload: item.payload,
  })] : []);
}

function presentationFor(
  item: NSEToolbarItem,
  instanceId: string,
  presentations: ReadonlyMap<string, CommandPresentation>,
  identifier: string,
  previous?: NSEToolbarPresentedItem,
): NSEToolbarPresentedItem | null {
  if (item.kind === "command") {
    const presentation = presentations.get(`${identifier}:${instanceId}`) ??
      (previous?.kind === "command" ? previous.presentation : null);
    if (presentation?.hidden) return null;
    return {
      kind: "command",
      id: item.id,
      instanceId,
      commandId: item.commandId,
      payload: item.payload,
      // As NSToolbarItem, the toolbar's label is the item's own; the menu title is a fallback.
      label: item.label || presentation?.title || "",
      paletteLabel: item.paletteLabel,
      icon: item.icon,
      enabled: presentation ? presentation.enabled && !presentation.denied && !presentation.stale : false,
      hidden: presentation?.hidden ?? false,
      checked: presentation?.state ?? "off",
      disabledReason: presentation?.disabledReason,
      presentation: presentation ?? null,
      bordered: item.bordered !== false,
      minimumWidth: item.minimumWidth,
      idealWidth: item.idealWidth,
    };
  }
  if (item.kind === "custom") return {
    kind: "custom",
    id: item.id,
    instanceId,
    label: item.label,
    minimumWidth: item.minimumWidth,
    idealWidth: item.idealWidth,
    render: item.render,
    showsLabel: item.showsLabel === true,
  };
  if (item.kind === "space") return { kind: "space", id: item.id, instanceId, width: item.width };
  if (item.kind === "flexible-space") return { kind: "flexible-space", id: item.id, instanceId, minimumWidth: item.minimumWidth };
  return { kind: "separator", id: item.id, instanceId };
}

/**
 * The toolbar owns only an immutable display projection and its validation
 * lease. Commands, preference persistence, responder hierarchy, undo, and
 * focus remain owned by the command, preference, and window authorities respectively.
 */
export class NSEToolbarController {
  readonly configuration: NSEToolbarConfiguration;
  readonly items: readonly NSEToolbarItem[];
  readonly preferences;
  readonly runtime;
  readonly #catalogue: ReadonlyMap<string, NSEToolbarItem>;
  readonly #lifecycle: SynCloudOSLifecycleRecord;
  readonly #listeners = new Set<() => void>();
  #snapshot: NSEToolbarSnapshot = initialSnapshot;
  #validation: AbortLease | null = null;
  #dispatch: AbortLease | null = null;
  #generation = 0;
  #presentationGeneration: PresentationGeneration | null = null;
  #disposed = false;
  #preferenceUnsubscribe: (() => boolean) | null = null;
  #runtimeAbort = () => {
    this.#lifecycle.markDisposed(synCloudOSLifecycleSignalReason(this.runtime.signal));
    this.dispose();
  };

  constructor({ configuration, items, preferences, runtime }: NSEToolbarControllerOptions) {
    if (!configuration.identifier.trim()) throw new TypeError("NSE toolbar identifiers must not be empty.");
    this.#lifecycle = new SynCloudOSLifecycleRecord({ kind: "NSEToolbarController", id: configuration.identifier });
    assertOwner(configuration.owner);
    if (!validDisplayMode(configuration.displayMode) || !validSizeMode(configuration.sizeMode)) {
      throw new TypeError(`NSE toolbar "${configuration.identifier}" has an invalid display or size mode.`);
    }
    const catalogue = new Map<string, NSEToolbarItem>();
    for (const item of items) {
      if (!item.id.trim()) throw new TypeError("NSE toolbar item IDs must not be empty.");
      if (catalogue.has(item.id)) throw new TypeError(`NSE toolbar item IDs must be unique: ${item.id}`);
      if (item.kind === "command") {
        if (!item.commandId.trim() || !item.label.trim() || !item.paletteLabel.trim()) {
          throw new TypeError(`NSE command toolbar item "${item.id}" requires command, label, and palette label.`);
        }
        finiteNonNegative(item.minimumWidth, "minimum width", item.id);
        finiteNonNegative(item.idealWidth, "ideal width", item.id);
      } else if (item.kind === "custom") {
        if (!item.label.trim()) throw new TypeError(`NSE custom toolbar item "${item.id}" requires a label.`);
        finiteNonNegative(item.minimumWidth, "minimum width", item.id);
        finiteNonNegative(item.idealWidth, "ideal width", item.id);
        if (item.idealWidth < item.minimumWidth) throw new TypeError(`NSE custom toolbar ideal width must be at least minimum width (${item.id}).`);
      } else if (item.kind === "space") finiteNonNegative(item.width, "space width", item.id);
      else if (item.kind === "flexible-space") finiteNonNegative(item.minimumWidth, "flexible-space minimum width", item.id);
      catalogue.set(item.id, item);
    }
    this.configuration = Object.freeze({
      ...configuration,
      owner: Object.freeze({ ...configuration.owner }),
      allowedItemIds: cloneItemIds(configuration.allowedItemIds),
      defaultItemIds: cloneItemIds(configuration.defaultItemIds),
    });
    this.items = Object.freeze([...items]);
    this.preferences = preferences;
    this.runtime = runtime;
    this.#catalogue = catalogue;
    this.#assertItemOrder(this.configuration.defaultItemIds);
    this.#assertPreferences(preferences.getSnapshot().value);
    this.#publishProjection(false);
    this.#preferenceUnsubscribe = preferences.subscribe(() => {
      if (this.#disposed) return;
      this.#assertPreferences(preferences.getSnapshot().value);
      this.#publishProjection(false);
      void this.refresh();
    });
    if (runtime.signal.aborted) this.#runtimeAbort();
    else runtime.signal.addEventListener("abort", this.#runtimeAbort, { once: true });
  }

  get snapshot(): NSEToolbarSnapshot { return this.#snapshot; }

  subscribe(listener: () => void): () => void {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  setItemOrder(itemIds: readonly string[]): boolean {
    this.#assertActive("setItemOrder");
    this.#assertItemOrder(itemIds);
    const current = this.preferences.getSnapshot().value.itemIds;
    if (current.length === itemIds.length && current.every((item, index) => item === itemIds[index])) return false;
    this.preferences.set("itemIds", cloneItemIds(itemIds));
    return true;
  }

  move(itemId: string, delta: -1 | 1): boolean {
    this.#assertActive("move");
    const ids = [...this.preferences.getSnapshot().value.itemIds];
    const from = ids.indexOf(itemId);
    return this.moveAt(from, delta);
  }

  moveAt(from: number, delta: -1 | 1): boolean {
    this.#assertActive("moveAt");
    const ids = [...this.preferences.getSnapshot().value.itemIds];
    if (!Number.isSafeInteger(from) || from < 0 || from >= ids.length) return false;
    const to = from + delta;
    if (to < 0 || to >= ids.length) return false;
    [ids[from], ids[to]] = [ids[to]!, ids[from]!];
    return this.setItemOrder(ids);
  }

  insert(itemId: string, index = this.preferences.getSnapshot().value.itemIds.length): boolean {
    this.#assertActive("insert");
    const ids = [...this.preferences.getSnapshot().value.itemIds];
    const boundedIndex = Math.max(0, Math.min(ids.length, Math.trunc(index)));
    ids.splice(boundedIndex, 0, itemId);
    return this.setItemOrder(ids);
  }

  remove(itemId: string): boolean {
    this.#assertActive("remove");
    const ids = [...this.preferences.getSnapshot().value.itemIds];
    const index = ids.lastIndexOf(itemId);
    return this.removeAt(index);
  }

  removeAt(index: number): boolean {
    this.#assertActive("removeAt");
    const ids = [...this.preferences.getSnapshot().value.itemIds];
    if (!Number.isSafeInteger(index) || index < 0 || index >= ids.length) return false;
    ids.splice(index, 1);
    return this.setItemOrder(ids);
  }

  setDisplayMode(displayMode: NSEToolbarPreferences["displayMode"]): boolean {
    this.#assertActive("setDisplayMode");
    if (!validDisplayMode(displayMode)) throw new TypeError("NSE toolbar display mode is invalid.");
    return this.preferences.set("displayMode", displayMode);
  }

  setSizeMode(sizeMode: NSEToolbarPreferences["sizeMode"]): boolean {
    this.#assertActive("setSizeMode");
    if (!validSizeMode(sizeMode)) throw new TypeError("NSE toolbar size mode is invalid.");
    return this.preferences.set("sizeMode", sizeMode);
  }

  reset(): boolean {
    this.#assertActive("reset");
    return this.preferences.reset(["itemIds", "displayMode", "sizeMode"]);
  }

  beginConfiguration(transaction: Parameters<typeof this.preferences.beginEditing>[0]): void {
    this.#assertActive("beginConfiguration");
    this.preferences.beginEditing(transaction);
  }

  commitConfiguration() { return this.preferences.commitEditing(); }

  discardConfiguration(): void { this.preferences.discardEditing(); }

  async refresh(): Promise<NSEToolbarRefreshResult> {
    if (this.#disposed || this.runtime.signal.aborted) return { status: "cancelled", generation: this.#generation };
    const generation = ++this.#generation;
    this.#dispatch?.dispose();
    this.#dispatch = null;
    this.#validation?.dispose();
    const lease = createAbortLease(this.runtime.signal);
    this.#validation = lease;
    this.#publish({ validating: true, generation, diagnostic: null });
    const preferences = this.preferences.getSnapshot().value;
    const instances = itemInstances(preferences.itemIds, this.#catalogue);
    const requests = requestsFor(this.configuration.identifier, instances);
    const presentationGeneration = this.runtime.commands.getPresentationGeneration();
    try {
      const presentations = await this.runtime.commands.validateMany(requests, {
        signal: lease.signal,
        source: "toolbar",
        generation,
      });
      if (this.#disposed || lease.signal.aborted || generation !== this.#generation) {
        return { status: "cancelled", generation };
      }
      if (!samePresentationGeneration(presentationGeneration, this.runtime.commands.getPresentationGeneration())) {
        return this.#publishValidationFailure(generation);
      }
      const presented = instances.flatMap(({ item, instanceId }) => {
        const result = presentationFor(item, instanceId, presentations, this.configuration.identifier);
        return result ? [result] : [];
      });
      if (presented.some((item) => item.kind === "command" && item.presentation?.stale)) {
        return this.#publishValidationFailure(generation);
      }
      this.#presentationGeneration = presentationGeneration;
      this.#publish({
        generation,
        validating: false,
        items: freezePresentedItems(presented),
        diagnostic: null,
      });
      return { status: "published", generation };
    } catch {
      if (this.#disposed || lease.signal.aborted || generation !== this.#generation) {
        return { status: "cancelled", generation };
      }
      return this.#publishValidationFailure(generation);
    } finally {
      if (this.#validation === lease) this.#validation = null;
      lease.dispose();
    }
  }

  async dispatch(instanceId: string): Promise<CommandDispatchResult<unknown>> {
    const item = this.#snapshot.items.find((candidate) => candidate.instanceId === instanceId || candidate.id === instanceId);
    if (!item || item.kind !== "command" || !item.enabled || item.hidden || this.#disposed || this.runtime.signal.aborted) {
      return cancelled(item?.kind === "command" ? item.commandId : instanceId, "This toolbar command is not currently available.");
    }
    if (!samePresentationGeneration(this.#presentationGeneration, this.runtime.commands.getPresentationGeneration())) {
      return cancelled(item.commandId, "The displayed command authority became stale.");
    }
    const generation = this.#generation;
    this.#dispatch?.dispose();
    const lease = createAbortLease(this.runtime.signal);
    this.#dispatch = lease;
    try {
      const preparation = await this.runtime.commands.prepareDispatch(item.commandId, item.payload, {
        signal: lease.signal,
        source: "toolbar",
      });
      if (preparation.status !== "accepted") return cancelled(item.commandId, preparation.reason);
      if (this.#disposed || lease.signal.aborted || this.#dispatch !== lease || generation !== this.#generation
        || !samePresentationGeneration(this.#presentationGeneration, this.runtime.commands.getPresentationGeneration())) {
        return cancelled(item.commandId, "The toolbar command was cancelled.");
      }
      const result = await this.runtime.commands.dispatch(item.commandId, item.payload, {
        signal: lease.signal,
        source: "toolbar",
        acceptance: preparation.acceptance,
      });
      if (!this.#disposed && generation === this.#generation) void this.refresh();
      return result;
    } catch {
      return cancelled(item.commandId, lease.signal.aborted || this.runtime.signal.aborted ? "The toolbar command was cancelled." : "The toolbar command could not be dispatched.");
    } finally {
      if (this.#dispatch === lease) this.#dispatch = null;
      lease.dispose();
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#lifecycle.markDisposed("explicit");
    this.#disposed = true;
    this.#generation += 1;
    this.#validation?.dispose();
    this.#validation = null;
    this.#dispatch?.dispose();
    this.#dispatch = null;
    this.#preferenceUnsubscribe?.();
    this.#preferenceUnsubscribe = null;
    this.runtime.signal.removeEventListener("abort", this.#runtimeAbort);
    this.#listeners.clear();
  }

  #publishProjection(incrementGeneration: boolean): void {
    if (incrementGeneration) this.#generation += 1;
    const preferences = this.preferences.getSnapshot().value;
    const previousByInstanceId = new Map(this.#snapshot.items.map((item) => [item.instanceId, item]));
    const projected = itemInstances(preferences.itemIds, this.#catalogue).map(({ item, instanceId }) => presentationFor(
      item,
      instanceId,
      new Map(),
      this.configuration.identifier,
      previousByInstanceId.get(instanceId),
    )).filter((item): item is NSEToolbarPresentedItem => item !== null);
    this.#publish({
      generation: this.#generation,
      validating: false,
      itemIds: cloneItemIds(preferences.itemIds),
      displayMode: preferences.displayMode,
      sizeMode: preferences.sizeMode,
      items: freezePresentedItems(projected),
      diagnostic: null,
    });
  }

  #publishValidationFailure(generation: number): NSEToolbarRefreshResult {
    this.#publish({ generation, validating: false, items: Object.freeze([]), diagnostic: "validation-failed" });
    return { status: "failed", generation, code: "validation-failed" };
  }

  #publish(patch: Partial<NSEToolbarSnapshot>): void {
    if (this.#disposed) return;
    this.#snapshot = Object.freeze({
      ...this.#snapshot,
      ...patch,
      itemIds: patch.itemIds ?? this.#snapshot.itemIds,
      items: patch.items ?? this.#snapshot.items,
    });
    for (const listener of [...this.#listeners]) listener();
  }

  #assertPreferences(value: NSEToolbarPreferences): void {
    this.#assertItemOrder(value.itemIds);
    if (!validDisplayMode(value.displayMode) || !validSizeMode(value.sizeMode)) {
      throw new TypeError(`NSE toolbar "${this.configuration.identifier}" preferences are invalid.`);
    }
  }

  #assertItemOrder(itemIds: readonly string[]): void {
    const allowed = new Set(this.configuration.allowedItemIds);
    const seen = new Set<string>();
    for (const id of itemIds) {
      if (!allowed.has(id)) throw new TypeError(`NSE toolbar item "${id}" is not allowed by "${this.configuration.identifier}".`);
      const item = this.#catalogue.get(id);
      if (!item) throw new TypeError(`NSE toolbar allowed item "${id}" is missing from its catalogue.`);
      const allowsDuplicates = item.kind === "command" || item.kind === "custom"
        ? item.allowsDuplicates === true
        : false;
      if (seen.has(id) && !allowsDuplicates) {
        throw new TypeError(`NSE toolbar item "${id}" does not allow duplicates.`);
      }
      seen.add(id);
    }
  }

  #assertActive(operation: string): void {
    if (this.#disposed) throw this.#lifecycle.error({ code: "NSE_TOOLBAR_CONTROLLER_DISPOSED", operation });
  }
}

function sameItems(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}
