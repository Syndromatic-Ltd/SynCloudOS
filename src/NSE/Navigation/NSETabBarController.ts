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

import { NSEViewController, type NSEViewControllerOptions } from "../Application/NSEViewController";
import { NSENavigationStackController } from "./NSENavigationStackController";
import type {
  NSENavigationDestination,
  NSENavigationSection,
  NSENavigationSelectionOptions,
  NSETabBarControllerSnapshot,
  NSETabBarRestorationSnapshot,
} from "./navigationTypes";

export interface NSETabBarControllerOptions<TContent = unknown> extends NSEViewControllerOptions {
  readonly id: string;
  readonly destinations: readonly NSENavigationDestination<TContent>[];
  /** Explicit source-list grouping. Omit to derive stable groups from `groupId`. */
  readonly sections?: readonly NSENavigationSection[];
  readonly initialSelectedId?: string;
  readonly onSelect?: (
    destination: NSENavigationDestination<TContent>,
    options: { readonly signal: AbortSignal; readonly source?: string },
  ) => void | Promise<void>;
}

/** Replacement copy for existing destinations and sections, keyed by id. */
export interface NSETabBarTitles {
  readonly destinations?: Readonly<Record<string, Pick<NSENavigationDestination, "label" | "compactLabel" | "accessibleLabel">>>;
  readonly sections?: Readonly<Record<string, NSENavigationSection["label"]>>;
}

const moreDestinationId = "__nse-more";
const overflowRootDestinationId = "__nse-tab-root";

function abortError(reason?: unknown): DOMException {
  return reason instanceof DOMException && reason.name === "AbortError"
    ? reason
    : new DOMException("Tab selection was cancelled.", "AbortError");
}

function invalidState(message: string): DOMException {
  return new DOMException(message, "InvalidStateError");
}

function requireId(value: string, label: string): string {
  if (!value.trim()) throw new TypeError(`${label} must not be empty.`);
  return value;
}

function validateIcon(destination: NSENavigationDestination): void {
  if (destination.icon.kind === "template" && !destination.icon.name.trim()) {
    throw new TypeError(`Navigation destination "${destination.id}" requires a template icon name.`);
  }
  if (destination.icon.kind === "vector" && !destination.icon.path.trim()) {
    throw new TypeError(`Navigation destination "${destination.id}" requires a vector icon path.`);
  }
}

function freezeDestination<TContent>(source: NSENavigationDestination<TContent>): NSENavigationDestination<TContent> {
  const id = requireId(source.id, "Navigation destination id");
  validateIcon(source);
  if (source.sidebarItem?.glyph !== undefined && !source.sidebarItem.glyph.trim()) {
    throw new TypeError(`Navigation destination "${id}" requires a non-empty sidebar glyph source.`);
  }
  if (source.sidebarItem?.glyphFramed && !source.sidebarItem.glyph) {
    throw new TypeError(`Navigation destination "${id}" cannot frame a missing sidebar glyph.`);
  }
  if (source.restorationId !== undefined) requireId(source.restorationId, "Navigation restoration id");
  if (source.groupId !== undefined) requireId(source.groupId, "Navigation group id");
  if (typeof source.badge === "number" && (!Number.isFinite(source.badge) || source.badge < 0)) {
    throw new TypeError(`Navigation destination "${id}" has an invalid badge.`);
  }
  return Object.freeze({
    ...source,
    id,
    icon: Object.freeze({ ...source.icon }),
    sidebarItem: source.sidebarItem ? Object.freeze({ ...source.sidebarItem }) : undefined,
  });
}

function freezeSections(
  destinations: readonly NSENavigationDestination[],
  supplied: readonly NSENavigationSection[] | undefined,
): readonly NSENavigationSection[] {
  const destinationIds = new Set(destinations.map(({ id }) => id));
  const sections = supplied ?? (() => {
    const groups = new Map<string, { label?: string; destinationIds: string[] }>();
    for (const destination of destinations) {
      const id = destination.groupId ?? "default";
      const group = groups.get(id) ?? { label: destination.groupId, destinationIds: [] };
      group.destinationIds.push(destination.id);
      groups.set(id, group);
    }
    return [...groups].map(([id, group]) => ({ id, label: group.label, destinationIds: group.destinationIds }));
  })();
  if (sections.length === 0) throw new TypeError("Navigation sections must not be empty.");

  const seenSectionIds = new Set<string>();
  const seenDestinationIds = new Set<string>();
  const frozen = sections.map((section) => {
    const id = requireId(section.id, "Navigation section id");
    if (seenSectionIds.has(id)) throw new TypeError("Navigation section ids must be unique.");
    seenSectionIds.add(id);
    if (section.destinationIds.length === 0) throw new TypeError(`Navigation section "${id}" must declare a destination.`);
    const ids = section.destinationIds.map((destinationId) => {
      requireId(destinationId, "Navigation section destination id");
      if (!destinationIds.has(destinationId)) {
        throw new RangeError(`Navigation section "${id}" references unknown destination "${destinationId}".`);
      }
      if (seenDestinationIds.has(destinationId)) {
        throw new TypeError(`Navigation destination "${destinationId}" appears in more than one section.`);
      }
      seenDestinationIds.add(destinationId);
      return destinationId;
    });
    return Object.freeze({ ...section, id, destinationIds: Object.freeze(ids) });
  });
  if (seenDestinationIds.size !== destinationIds.size) {
    throw new TypeError("Navigation sections must declare every destination exactly once.");
  }
  return Object.freeze(frozen);
}

function freezeSnapshot(input: NSETabBarControllerSnapshot): NSETabBarControllerSnapshot {
  return Object.freeze({
    ...input,
    directDestinationIds: Object.freeze([...input.directDestinationIds]),
    overflowDestinationIds: Object.freeze([...input.overflowDestinationIds]),
    moreStack: input.moreStack ? Object.freeze({ ...input.moreStack, path: Object.freeze([...input.moreStack.path]) }) : null,
  });
}

function awaitAbortable<T>(value: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError(signal.reason));
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(abortError(signal.reason)));
    signal.addEventListener("abort", onAbort, { once: true });
    value.then((result) => finish(() => resolve(result)), (error) => finish(() => reject(error)));
  });
}

/** A semantic tab owner. Physical tab bars and source-list projections consume
 * this controller; it never infers destinations from panes or visual tabs. */
export class NSETabBarController<TContent = unknown> extends NSEViewController<NSETabBarControllerSnapshot> {
  readonly id: string;
  readonly moreStack: NSENavigationStackController | null;
  #destinations: readonly NSENavigationDestination<TContent>[];
  #sections: readonly NSENavigationSection[];
  readonly #destinationById: Map<string, NSENavigationDestination<TContent>>;
  readonly #overflowRootDestination: NSENavigationDestination<TContent>;
  readonly #moreDestination: NSENavigationDestination<TContent>;
  readonly #directDestinationIds: readonly string[];
  readonly #overflowDestinationIds: readonly string[];
  readonly #onSelect: NSETabBarControllerOptions<TContent>["onSelect"];
  readonly #contentByDestinationId = new Map<string, TContent>();
  #selectedDestinationId: string;
  #revision = 0;
  #snapshot: NSETabBarControllerSnapshot;
  #pending: AbortController | null = null;
  #intentRevision = 0;
  #unsubscribeMore: (() => void) | null = null;

  constructor(options: NSETabBarControllerOptions<TContent>) {
    super(options);
    this.id = requireId(options.id, "Tab bar controller id");
    if (options.destinations.length === 0) throw new TypeError("Tab bar controllers require at least one destination.");
    const destinations = options.destinations.map(freezeDestination);
    const ids = destinations.map(({ id }) => id);
    if (new Set(ids).size !== ids.length) throw new TypeError("Tab bar destination ids must be unique.");
    const restorationIds = destinations.map(({ restorationId }) => restorationId).filter((id): id is string => Boolean(id));
    if (new Set(restorationIds).size !== restorationIds.length) throw new TypeError("Tab bar restoration ids must be unique.");
    this.#destinations = Object.freeze(destinations);
    this.#sections = freezeSections(destinations, options.sections);
    this.#destinationById = new Map(destinations.map((destination) => [destination.id, destination]));
    this.#overflowRootDestination = Object.freeze({
      id: overflowRootDestinationId,
      label: "Tab navigation",
      accessibleLabel: "Tab navigation",
      icon: Object.freeze({ kind: "template" as const, name: "tabs" }),
    });
    this.#moreDestination = Object.freeze({
      id: moreDestinationId,
      label: "More destinations",
      accessibleLabel: "More destinations",
      icon: Object.freeze({ kind: "template" as const, name: "more" }),
    });
    const direct = destinations.length <= 5 ? destinations : destinations.slice(0, 4);
    const overflow = destinations.length <= 5 ? [] : destinations.slice(4);
    this.#directDestinationIds = Object.freeze(direct.map(({ id }) => id));
    this.#overflowDestinationIds = Object.freeze(overflow.map(({ id }) => id));
    this.#onSelect = options.onSelect;
    const initial = options.initialSelectedId && this.#isSelectable(options.initialSelectedId)
      ? options.initialSelectedId
      : destinations.find(({ disabled }) => !disabled)?.id;
    if (!initial) throw new TypeError("Tab bar controllers require at least one enabled destination.");
    this.#selectedDestinationId = initial;
    this.moreStack = overflow.length === 0
      ? null
      : new NSENavigationStackController({
        id: `${this.id}:more`,
        rootDestinationId: overflowRootDestinationId,
        // More is a real hierarchy, not a one-screen sentinel. Its declared
        // destinations include the actual overflow peers so selecting a row
        // can push that destination and give shared stage chrome an honest
        // Back-to-More transition.
        destinationIds: [overflowRootDestinationId, moreDestinationId, ...this.#overflowDestinationIds],
        owner: this,
      });
    this.#unsubscribeMore = this.moreStack?.subscribe(() => {
      if (!this.isDisposed) this.#publish();
    }) ?? null;
    this.#snapshot = this.#makeSnapshot();
    this.getSnapshot = () => this.#snapshot;
  }

  get destinations(): readonly NSENavigationDestination<TContent>[] { return this.#destinations; }

  get sections(): readonly NSENavigationSection[] { return this.#sections; }

  getDestination(destinationId: string): NSENavigationDestination<TContent> | null {
    if (destinationId === overflowRootDestinationId) return this.#overflowRootDestination;
    if (destinationId === moreDestinationId && this.moreStack) return this.#moreDestination;
    return this.#destinationById.get(destinationId) ?? null;
  }

  getContent(destinationId: string): TContent | null {
    const destination = this.#destinationById.get(destinationId);
    if (!destination) return null;
    if (this.#contentByDestinationId.has(destinationId)) {
      return this.#contentByDestinationId.get(destinationId) as TContent;
    }
    if (!destination.createContent) return null;
    const content = destination.createContent();
    this.#contentByDestinationId.set(destinationId, content);
    return content;
  }

  async select(destinationId: string, options: NSENavigationSelectionOptions = {}): Promise<void> {
    this.#assertLive();
    const destination = this.#destinationById.get(destinationId);
    if (!destination) throw new RangeError(`Unknown tab destination "${destinationId}".`);
    if (destination.disabled) throw invalidState(`Tab destination "${destinationId}" is disabled.`);
    const intentRevision = this.#beginIntent();
    const operation = new AbortController();
    this.#pending = operation;
    const signal = options.signal ? AbortSignal.any([operation.signal, options.signal]) : operation.signal;
    const pushesFromMore = this.#overflowDestinationIds.includes(destinationId)
      && this.moreStack?.getSnapshot().currentDestinationId === moreDestinationId;
    try {
      await awaitAbortable(Promise.resolve(this.#onSelect?.(destination, { signal, source: options.source })), signal);
      if (this.isDisposed || this.#intentRevision !== intentRevision || this.#pending !== operation || signal.aborted) {
        throw abortError(signal.reason);
      }
      if (pushesFromMore && this.moreStack?.getSnapshot().currentDestinationId === moreDestinationId) {
        await this.moreStack.push(destinationId, { signal });
      } else {
        this.moreStack?.popToRoot();
      }
      if (this.isDisposed || this.#intentRevision !== intentRevision || this.#pending !== operation || signal.aborted) {
        throw abortError(signal.reason);
      }
      this.#selectedDestinationId = destinationId;
      this.#publish();
    } finally {
      if (this.#pending === operation) this.#pending = null;
    }
  }

  /** Pushes the semantic More destination without selecting a hidden peer. */
  async openOverflow(options: NSENavigationSelectionOptions = {}): Promise<void> {
    this.#assertLive();
    const intentRevision = this.#beginIntent();
    if (!this.moreStack) return;
    if (this.moreStack.getSnapshot().currentDestinationId === moreDestinationId) return;
    const operation = new AbortController();
    this.#pending = operation;
    const signal = options.signal ? AbortSignal.any([operation.signal, options.signal]) : operation.signal;
    // Reopening More from a pushed overflow destination returns to its list
    // root before the synthetic More push; duplicate paths are never valid.
    try {
      this.moreStack.popToRoot();
      await this.moreStack.push(moreDestinationId, { signal });
      if (this.isDisposed || this.#intentRevision !== intentRevision || this.#pending !== operation || signal.aborted) {
        throw abortError(signal.reason);
      }
    } finally {
      if (this.#pending === operation) this.#pending = null;
    }
  }

  /** Returns an open More page to the retained tab root. */
  closeOverflow(): void {
    this.#assertLive();
    this.#invalidatePendingIntent();
    this.moreStack?.popToRoot();
  }

  restore(snapshot: NSETabBarRestorationSnapshot): void {
    this.#assertLive();
    this.#invalidatePendingIntent();
    const legacyMorePath = snapshot?.more?.path ?? [];
    const legacyOverflowDestinationId = [...legacyMorePath].reverse().find((id) => (
      this.#overflowDestinationIds.includes(id) && this.#isSelectable(id)
    )) ?? null;
    const wantsOverflowPage = legacyMorePath.includes(moreDestinationId);
    const restoredOverflowDestinationId = wantsOverflowPage
      && legacyOverflowDestinationId !== null
      && legacyMorePath.lastIndexOf(legacyOverflowDestinationId) > legacyMorePath.lastIndexOf(moreDestinationId)
      ? legacyOverflowDestinationId
      : null;
    if (this.moreStack) {
      this.moreStack.restore({
        version: 1,
        path: wantsOverflowPage
          ? [moreDestinationId, ...(restoredOverflowDestinationId ? [restoredOverflowDestinationId] : [])]
          : [],
      });
    }
    const selected = [restoredOverflowDestinationId, snapshot?.selectedDestinationId, legacyOverflowDestinationId]
      .find((destinationId): destinationId is string => Boolean(destinationId && this.#isSelectable(destinationId)))
      ?? this.#destinations.find(({ disabled }) => !disabled)!.id;
    if (selected === this.#selectedDestinationId) return;
    this.#selectedDestinationId = selected;
    this.#publish();
  }

  /** Replaces the copy of existing destinations and sections, as a localised
   * UITabBarItem title changes in place. Identity, order, selection,
   * restoration and cached content are untouched. */
  retitle(titles: NSETabBarTitles): void {
    this.#assertLive();
    const destinationTitles = titles.destinations ?? {};
    const sectionTitles = titles.sections ?? {};
    for (const id of Object.keys(destinationTitles)) {
      if (!this.#destinationById.has(id)) throw new RangeError(`Unknown tab destination "${id}".`);
    }
    for (const id of Object.keys(sectionTitles)) {
      if (!this.#sections.some((section) => section.id === id)) throw new RangeError(`Unknown navigation section "${id}".`);
    }
    let changed = false;
    const destinations = this.#destinations.map((destination) => {
      const title = Object.hasOwn(destinationTitles, destination.id) ? destinationTitles[destination.id]! : null;
      if (!title) return destination;
      const next = {
        label: title.label,
        compactLabel: "compactLabel" in title ? title.compactLabel : destination.compactLabel,
        accessibleLabel: "accessibleLabel" in title ? title.accessibleLabel : destination.accessibleLabel,
      };
      if (next.label === destination.label && next.compactLabel === destination.compactLabel
        && next.accessibleLabel === destination.accessibleLabel) return destination;
      changed = true;
      const retitled = Object.freeze({ ...destination, ...next });
      this.#destinationById.set(destination.id, retitled);
      return retitled;
    });
    const sections = this.#sections.map((section) => {
      if (!Object.hasOwn(sectionTitles, section.id) || sectionTitles[section.id] === section.label) return section;
      changed = true;
      return Object.freeze({ ...section, label: sectionTitles[section.id] });
    });
    // Callers may retitle on every render; an unchanged title publishes nothing.
    if (!changed) return;
    this.#destinations = Object.freeze(destinations);
    this.#sections = Object.freeze(sections);
    this.#publish();
  }

  protected override didDispose(): void {
    this.#invalidatePendingIntent();
    this.#unsubscribeMore?.();
    this.#unsubscribeMore = null;
  }

  #isSelectable(destinationId: string): boolean {
    return Boolean(this.#destinationById.get(destinationId) && !this.#destinationById.get(destinationId)!.disabled);
  }

  #assertLive(): void {
    if (this.isDisposed) throw abortError();
  }

  #beginIntent(): number {
    this.#invalidatePendingIntent();
    return this.#intentRevision;
  }

  #invalidatePendingIntent(): void {
    this.#intentRevision += 1;
    const pending = this.#pending;
    this.#pending = null;
    pending?.abort(abortError());
  }

  #makeSnapshot(): NSETabBarControllerSnapshot {
    const overflowOpen = this.moreStack?.getSnapshot().currentDestinationId === moreDestinationId;
    const activeTabId = overflowOpen || this.#overflowDestinationIds.includes(this.#selectedDestinationId)
      ? moreDestinationId
      : this.#selectedDestinationId;
    return freezeSnapshot({
      revision: this.#revision,
      id: this.id,
      selectedDestinationId: this.#selectedDestinationId,
      activeTabId,
      directDestinationIds: this.#directDestinationIds,
      overflowDestinationIds: this.#overflowDestinationIds,
      moreStack: this.moreStack?.getSnapshot() ?? null,
    });
  }

  #publish(): void {
    if (this.isDisposed) return;
    this.#revision += 1;
    this.#snapshot = this.#makeSnapshot();
    this.notifyObservers();
  }
}

export const NSETabBarMoreDestinationId = moreDestinationId;
/** Internal root used only to make the semantic More destination a real hierarchy push. */
export const NSETabBarOverflowRootDestinationId = overflowRootDestinationId;
