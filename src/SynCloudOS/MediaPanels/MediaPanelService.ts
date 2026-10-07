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

import type {
  MediaKind,
  MediaPanelItem,
  MediaPanelProvider,
  MediaPanelProviderPage,
  MediaPanelQuery,
  MediaPanelResult,
  MediaPanelService,
} from "./mediaPanelTypes";
import { encodeOpaqueIdentity } from "./opaqueIdentity";

const ALL_MEDIA_KINDS = Object.freeze(["image", "video", "audio"] as const);

export class MediaPanelProviderError extends Error {
  constructor(
    readonly kind: "denied" | "unavailable" | "interrupted" | "error",
    message: string,
  ) {
    super(message);
    this.name = "MediaPanelProviderError";
  }
}

interface ActiveQuery {
  readonly controller: AbortController;
  readonly generation: number;
  readonly removeParentAbort: () => void;
}

interface ProviderPageState {
  readonly providerId: string;
  readonly filterKey: string;
  readonly items: readonly MediaPanelItem[];
  readonly nextCursor: string | null;
  readonly returnedCursors: ReadonlySet<string>;
}

interface MediaItemOwnership {
  readonly providerId: string;
  readonly rawItem: MediaPanelItem;
  readonly resourceKey: string | null;
}

interface SnapshottedProviderPage {
  readonly items: readonly MediaPanelItem[];
  readonly rawItems: readonly MediaPanelItem[];
  readonly ownership: readonly MediaItemOwnership[];
  readonly nextCursor: string | null;
}

export interface MediaPanelMerge {
  readonly items: readonly MediaPanelItem[];
  readonly discarded: readonly MediaPanelItem[];
}

function nonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${label} must not be empty.`);
  return normalized;
}

function isMediaKind(value: string): value is MediaKind {
  return value === "image" || value === "video" || value === "audio";
}

function stableKinds(kinds: readonly MediaKind[]): readonly MediaKind[] {
  const normalized: MediaKind[] = [];
  for (const kind of kinds) {
    if (!isMediaKind(kind)) throw new TypeError(`Unsupported media kind: ${String(kind)}.`);
    if (!normalized.includes(kind)) normalized.push(kind);
  }
  return Object.freeze(normalized.length > 0 ? normalized : [...ALL_MEDIA_KINDS]);
}

function normalizeQuery(query: MediaPanelQuery): MediaPanelQuery {
  const pageSize = query.pageSize;
  if (pageSize !== undefined && (!Number.isSafeInteger(pageSize) || pageSize < 1)) {
    throw new TypeError("Media panel page sizes must be positive safe integers.");
  }
  if (query.cursor !== null && !query.cursor.trim()) throw new TypeError("Media panel cursors must be nonempty or null.");
  return Object.freeze({
    id: nonEmpty(query.id, "Media panel query IDs"),
    providerId: nonEmpty(query.providerId, "Media panel provider IDs"),
    search: query.search.trim(),
    kinds: stableKinds(query.kinds),
    cursor: query.cursor,
    ...(pageSize === undefined ? {} : { pageSize }),
    ...(query.userInitiated === true ? { userInitiated: true } : {}),
  });
}

function filterKey(query: MediaPanelQuery): string {
  return JSON.stringify({ search: query.search, kinds: query.kinds, pageSize: query.pageSize ?? null });
}

function keyFor(item: MediaPanelItem): string {
  return encodeOpaqueIdentity([item.providerId, item.id]);
}

function uniqueMediaObjects(items: readonly MediaPanelItem[]): readonly MediaPanelItem[] {
  return Object.freeze([...new Set(items)]);
}

/** Pure first-wins merge used for every provider page, so cursor repeats cannot reorder media. */
export function mergeMediaPanelItems(
  existing: readonly MediaPanelItem[],
  incoming: readonly MediaPanelItem[],
): MediaPanelMerge {
  const retainedByKey = new Map<string, MediaPanelItem>();
  const items: MediaPanelItem[] = [];
  const discarded: MediaPanelItem[] = [];
  for (const item of [...existing, ...incoming]) {
    const key = keyFor(item);
    const retained = retainedByKey.get(key);
    if (retained) {
      // A provider may repeat the same lease object. Releasing it here would
      // invalidate the first-wins visible item, so only discard a distinct
      // duplicate allocation.
      if (retained !== item) discarded.push(item);
      continue;
    }
    retainedByKey.set(key, item);
    items.push(item);
  }
  return Object.freeze({ items: Object.freeze(items), discarded: Object.freeze(discarded) });
}

function isAbort(error: unknown): boolean {
  return error instanceof MediaPanelProviderError && error.kind === "interrupted"
    || (typeof error === "object" && error !== null && "name" in error && (error as { readonly name?: unknown }).name === "AbortError");
}

/** Redacts provider exceptions and keeps result states stable for NSE presenters. */
export function mapMediaPanelProviderError(error: unknown): Exclude<MediaPanelResult, { readonly kind: "accepted" } | { readonly kind: "empty" }> {
  if (error instanceof MediaPanelProviderError) {
    if (error.kind === "denied") return { kind: "denied", message: "Media access was denied by the provider." };
    if (error.kind === "unavailable") return { kind: "unavailable", message: "The selected media provider is unavailable." };
    if (error.kind === "interrupted") return { kind: "interrupted", message: "The media request was interrupted." };
  }
  if (isAbort(error)) return { kind: "interrupted", message: "The media request was interrupted." };
  const name = typeof error === "object" && error !== null && "name" in error
    ? (error as { readonly name?: unknown }).name
    : null;
  if (name === "NotAllowedError") return { kind: "denied", message: "Media access was denied by the provider." };
  if (name === "SecurityError") return { kind: "unavailable", message: "The selected media provider is unavailable." };
  return { kind: "error", message: "The media provider could not complete the request." };
}

function ownDataDescriptors(value: unknown, label: string): PropertyDescriptorMap {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new MediaPanelProviderError("error", `${label} is invalid.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new MediaPanelProviderError("error", `${label} is invalid.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key as keyof typeof descriptors]!;
    if (typeof key !== "string" || !("value" in descriptor) || !descriptor.enumerable) {
      throw new MediaPanelProviderError("error", `${label} must contain only enumerable data properties.`);
    }
  }
  return descriptors;
}

function descriptorValue(descriptors: PropertyDescriptorMap, key: string, required = true): unknown {
  const descriptor = descriptors[key];
  if (!descriptor) {
    if (!required) return undefined;
    throw new MediaPanelProviderError("error", "A media provider returned an incomplete value.");
  }
  if (!("value" in descriptor) || !descriptor.enumerable) {
    throw new MediaPanelProviderError("error", "A media provider returned an accessor-backed value.");
  }
  return descriptor.value;
}

function denseProviderItems(value: unknown): readonly MediaPanelItem[] {
  if (!Array.isArray(value)) throw new MediaPanelProviderError("error", "A media provider returned an invalid item list.");
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  const length = lengthDescriptor && "value" in lengthDescriptor ? lengthDescriptor.value : null;
  if (!Number.isSafeInteger(length) || length < 0) throw new MediaPanelProviderError("error", "A media provider returned an invalid item list.");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const items: MediaPanelItem[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new MediaPanelProviderError("error", "A media provider returned a sparse or accessor-backed item list.");
    }
    items.push(descriptor.value as MediaPanelItem);
  }
  for (const key of Reflect.ownKeys(descriptors)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9]\d*)$/u.test(key) || Number(key) >= length) {
      throw new MediaPanelProviderError("error", "A media provider returned an invalid item list.");
    }
  }
  return Object.freeze(items);
}

function providerItemsForCleanup(page: unknown): readonly MediaPanelItem[] | null {
  if (typeof page !== "object" || page === null || Array.isArray(page)) return null;
  const itemsDescriptor = Object.getOwnPropertyDescriptor(page, "items");
  if (!itemsDescriptor || !("value" in itemsDescriptor) || !itemsDescriptor.enumerable || !Array.isArray(itemsDescriptor.value)) return null;
  const items = itemsDescriptor.value;
  const lengthDescriptor = Object.getOwnPropertyDescriptor(items, "length");
  const length = lengthDescriptor && "value" in lengthDescriptor ? lengthDescriptor.value : null;
  if (!Number.isSafeInteger(length) || length < 0) return null;
  const descriptors = Object.getOwnPropertyDescriptors(items);
  const cleanup: MediaPanelItem[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) break;
    cleanup.push(descriptor.value as MediaPanelItem);
  }
  return cleanup.length > 0 ? Object.freeze(cleanup) : null;
}

function fileResourceKey(providerId: string, fileReference: unknown): string | null {
  if (typeof fileReference !== "object" || fileReference === null) return null;
  const id = Object.getOwnPropertyDescriptor(fileReference, "id");
  return id && "value" in id && typeof id.value === "string" && id.value.trim()
    ? encodeOpaqueIdentity([providerId, `file:${id.value}`])
    : null;
}

function snapshotProviderPage(provider: MediaPanelProvider, page: unknown): SnapshottedProviderPage {
  const pageDescriptors = ownDataDescriptors(page, "A media provider page");
  const rawItems = denseProviderItems(descriptorValue(pageDescriptors, "items"));
  const nextCursor = descriptorValue(pageDescriptors, "nextCursor");
  if (nextCursor !== null && typeof nextCursor !== "string") throw new MediaPanelProviderError("error", "A media provider returned an invalid page cursor.");
  const items: MediaPanelItem[] = [];
  const ownership: MediaItemOwnership[] = [];
  for (const rawItem of rawItems) {
    const descriptors = ownDataDescriptors(rawItem, "A media provider item");
    const id = descriptorValue(descriptors, "id");
    const providerId = descriptorValue(descriptors, "providerId");
    const kind = descriptorValue(descriptors, "kind");
    const name = descriptorValue(descriptors, "name");
    const mimeType = descriptorValue(descriptors, "mimeType");
    const source = descriptorValue(descriptors, "source", false);
    const thumbnailUrl = descriptorValue(descriptors, "thumbnailUrl", false);
    const fileReference = descriptorValue(descriptors, "fileReference", false);
    if (providerId !== provider.id || typeof id !== "string" || typeof name !== "string" || typeof mimeType !== "string") {
      throw new MediaPanelProviderError("error", "A media provider returned an item with invalid identity or metadata.");
    }
    nonEmpty(id, "Media panel item IDs");
    nonEmpty(name, "Media panel item names");
    nonEmpty(mimeType, "Media panel item MIME types");
    if (typeof kind !== "string" || !isMediaKind(kind)) throw new MediaPanelProviderError("error", "A media provider returned an unsupported media kind.");
    if (source !== undefined && typeof source !== "string") throw new MediaPanelProviderError("error", "A media provider returned an invalid source.");
    if (thumbnailUrl !== undefined && typeof thumbnailUrl !== "string") throw new MediaPanelProviderError("error", "A media provider returned an invalid thumbnail.");
    const snapshot: MediaPanelItem = Object.freeze({
      id,
      providerId,
      kind,
      name,
      mimeType,
      ...(source === undefined ? {} : { source }),
      ...(thumbnailUrl === undefined ? {} : { thumbnailUrl }),
      ...(fileReference === undefined ? {} : { fileReference: fileReference as MediaPanelItem["fileReference"] }),
    });
    items.push(snapshot);
    ownership.push(Object.freeze({
      providerId: provider.id,
      rawItem,
      resourceKey: fileResourceKey(provider.id, fileReference),
    }));
  }
  return Object.freeze({ items: Object.freeze(items), rawItems, ownership: Object.freeze(ownership), nextCursor });
}

/**
 * Keeps a single active generation per visible panel and a separate page state
 * for every provider. Providers retain authority over their own cursor values.
 */
class DefaultMediaPanelService implements MediaPanelService {
  readonly providers: readonly MediaPanelProvider[];
  readonly #providersById = new Map<string, MediaPanelProvider>();
  readonly #active = new Map<string, ActiveQuery>();
  readonly #generations = new Map<string, number>();
  readonly #pages = new Map<string, Map<string, ProviderPageState>>();
  readonly #ownership = new WeakMap<MediaPanelItem, MediaItemOwnership>();
  #disposed = false;

  constructor(providers: readonly MediaPanelProvider[]) {
    const ids = new Set<string>();
    for (const provider of providers) {
      const id = nonEmpty(provider.id, "Media provider IDs");
      nonEmpty(provider.label, "Media provider labels");
      if (ids.has(id)) throw new TypeError(`Media provider IDs must be unique: ${id}`);
      ids.add(id);
      this.#providersById.set(id, provider);
    }
    this.providers = Object.freeze([...providers]);
  }

  async query(query: MediaPanelQuery, parentSignal?: AbortSignal): Promise<MediaPanelResult> {
    let normalized: MediaPanelQuery;
    try {
      normalized = normalizeQuery(query);
    } catch {
      return { kind: "error", message: "The media request is invalid." };
    }
    if (this.#disposed) return { kind: "interrupted", message: "The media panel service is disposed." };
    const provider = this.#providersById.get(normalized.providerId);
    if (!provider) return { kind: "unavailable", message: "The selected media provider is unavailable." };
    if (provider.requiresUserActivation && normalized.userInitiated !== true) {
      return { kind: "interrupted", message: "The media request requires an active user action." };
    }

    let currentPage = this.#pages.get(normalized.id)?.get(normalized.providerId);
    const nextFilterKey = filterKey(normalized);
    if (normalized.cursor !== null && (!currentPage || currentPage.filterKey !== nextFilterKey || currentPage.nextCursor !== normalized.cursor)) {
      return { kind: "error", message: "The media page cursor is no longer valid for this provider." };
    }
    if (normalized.cursor === null && currentPage) {
      this.#clearProviderPage(normalized.id, normalized.providerId);
      currentPage = undefined;
    }

    const previous = this.#active.get(normalized.id);
    if (previous) {
      previous.controller.abort();
      previous.removeParentAbort();
    }
    const controller = new AbortController();
    const abortFromParent = () => controller.abort();
    if (parentSignal?.aborted) controller.abort();
    else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
    const generation = (this.#generations.get(normalized.id) ?? 0) + 1;
    this.#generations.set(normalized.id, generation);
    const active: ActiveQuery = {
      controller,
      generation,
      removeParentAbort: () => parentSignal?.removeEventListener("abort", abortFromParent),
    };
    this.#active.set(normalized.id, active);

    let receivedRawItems: readonly MediaPanelItem[] | null = null;
    try {
      if (controller.signal.aborted) return { kind: "interrupted", message: "The media request was interrupted." };
      const page: unknown = await provider.query(normalized, controller.signal);
      receivedRawItems = providerItemsForCleanup(page);
      const snapshotted = snapshotProviderPage(provider, page);
      for (let index = 0; index < snapshotted.items.length; index += 1) {
        this.#ownership.set(snapshotted.items[index]!, snapshotted.ownership[index]!);
      }
      const current = this.#active.get(normalized.id);
      if (this.#disposed || controller.signal.aborted || current !== active || current.generation !== generation) {
        this.#releaseItems(snapshotted.items);
        receivedRawItems = null;
        return { kind: "interrupted", message: "The media request was interrupted." };
      }
      if (snapshotted.nextCursor !== null && !snapshotted.nextCursor.trim()) {
        this.#releaseItems(snapshotted.items);
        receivedRawItems = null;
        return { kind: "error", message: "The media provider returned an invalid page cursor." };
      }
      if (
        snapshotted.nextCursor !== null &&
        (snapshotted.nextCursor === normalized.cursor || currentPage?.returnedCursors.has(snapshotted.nextCursor))
      ) {
        this.#releaseItems(snapshotted.items);
        receivedRawItems = null;
        return { kind: "error", message: "The media provider returned a cursor without making progress." };
      }
      const existing = normalized.cursor === null ? [] : currentPage?.items ?? [];
      const merged = mergeMediaPanelItems(existing, snapshotted.items);
      const retainedRawItems = new Set(merged.items.map((item) => this.#ownership.get(item)?.rawItem).filter((item): item is MediaPanelItem => item !== undefined));
      const retainedResources = new Set(merged.items.map((item) => this.#ownership.get(item)?.resourceKey).filter((key): key is string => key !== null && key !== undefined));
      const discardedToRelease = merged.discarded.filter((item) => {
        const rawItem = this.#ownership.get(item)?.rawItem;
        const resourceKey = this.#ownership.get(item)?.resourceKey;
        return (!rawItem || !retainedRawItems.has(rawItem)) && (!resourceKey || !retainedResources.has(resourceKey));
      });
      this.#releaseItems(discardedToRelease);
      for (const item of merged.discarded) {
        if (!discardedToRelease.includes(item)) this.#ownership.delete(item);
      }
      const returnedCursors = new Set(currentPage?.returnedCursors ?? []);
      if (snapshotted.nextCursor !== null) returnedCursors.add(snapshotted.nextCursor);
      const state: ProviderPageState = Object.freeze({
        providerId: provider.id,
        filterKey: nextFilterKey,
        items: merged.items,
        nextCursor: snapshotted.nextCursor,
        returnedCursors,
      });
      let providerPages = this.#pages.get(normalized.id);
      if (!providerPages) {
        providerPages = new Map();
        this.#pages.set(normalized.id, providerPages);
      }
      providerPages.set(provider.id, state);
      receivedRawItems = null;
      if (state.items.length === 0 && state.nextCursor === null) return { kind: "empty", providerId: provider.id };
      return { kind: "accepted", providerId: provider.id, items: state.items, nextCursor: state.nextCursor };
    } catch (error) {
      if (receivedRawItems) this.#releaseProviderItems(provider, receivedRawItems);
      if (this.#disposed || controller.signal.aborted || this.#active.get(normalized.id) !== active) {
        return { kind: "interrupted", message: "The media request was interrupted." };
      }
      return mapMediaPanelProviderError(error);
    } finally {
      active.removeParentAbort();
      if (this.#active.get(normalized.id) === active) this.#active.delete(normalized.id);
    }
  }

  clear(queryId: string): void {
    const id = queryId.trim();
    if (!id) return;
    this.#generations.set(id, (this.#generations.get(id) ?? 0) + 1);
    const active = this.#active.get(id);
    if (active) {
      active.controller.abort();
      active.removeParentAbort();
      this.#active.delete(id);
    }
    const pages = this.#pages.get(id);
    if (!pages) return;
    this.#pages.delete(id);
    for (const state of pages.values()) this.#releaseItems(state.items);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const id of new Set([...this.#active.keys(), ...this.#pages.keys()])) this.clear(id);
  }

  #clearProviderPage(queryId: string, providerId: string): void {
    const pages = this.#pages.get(queryId);
    const state = pages?.get(providerId);
    if (!pages || !state) return;
    pages.delete(providerId);
    if (pages.size === 0) this.#pages.delete(queryId);
    this.#releaseItems(state.items);
  }

  #releaseItems(items: readonly MediaPanelItem[]): void {
    const grouped = new Map<string, MediaPanelItem[]>();
    for (const item of items) {
      const ownership = this.#ownership.get(item);
      if (!ownership) continue;
      this.#ownership.delete(item);
      const group = grouped.get(ownership.providerId) ?? [];
      if (!group.includes(ownership.rawItem)) group.push(ownership.rawItem);
      grouped.set(ownership.providerId, group);
    }
    for (const [providerId, released] of grouped) {
      try { this.#providersById.get(providerId)?.release?.(Object.freeze(released)); } catch { /* Provider cleanup is best effort. */ }
    }
  }

  #releaseProviderItems(provider: MediaPanelProvider, items: readonly MediaPanelItem[]): void {
    try { provider.release?.(uniqueMediaObjects(items)); } catch { /* Provider cleanup is best effort. */ }
  }
}

export function createMediaPanelService(providers: readonly MediaPanelProvider[]): MediaPanelService {
  return new DefaultMediaPanelService(providers);
}
