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

import type { NSEOverlayRegistration } from "./overlayTypes";
import { isWithinNSEFocusOrigin } from "../Focus/focusOrigin";

type DatasetTarget = EventTarget & { readonly dataset: DOMStringMap };
type ParentTarget = EventTarget & { readonly parentNode: EventTarget | null };
interface DocumentProviderEntry {
  readonly providerId: string;
  readonly hasActiveOverlay: () => boolean;
  activation: number;
}

const documentProviderOrder = new WeakMap<Document, DocumentProviderEntry[]>();
const documentActivation = new WeakMap<Document, number>();
const markerlessEventClaims = new WeakMap<Event, string>();

/** Claims markerless document events for exactly one mounted provider. */
export function retainNSEOverlayDocumentProvider(
  document: Document,
  providerId: string,
  hasActiveOverlay: () => boolean,
): () => void {
  const order = documentProviderOrder.get(document) ?? [];
  const entry = { providerId, hasActiveOverlay, activation: 0 };
  order.push(entry);
  documentProviderOrder.set(document, order);
  return () => {
    const current = documentProviderOrder.get(document);
    if (!current) return;
    const index = current.lastIndexOf(entry);
    if (index >= 0) current.splice(index, 1);
    if (current.length === 0) documentProviderOrder.delete(document);
  };
}

/** Publishes that a provider acquired a new active topmost overlay. */
export function markNSEOverlayDocumentProviderActive(document: Document, providerId: string): void {
  const entry = documentProviderOrder.get(document)?.find((candidate) => candidate.providerId === providerId);
  if (!entry) return;
  const activation = (documentActivation.get(document) ?? 0) + 1;
  documentActivation.set(document, activation);
  entry.activation = activation;
}

function hasDataset(target: EventTarget): target is DatasetTarget {
  return typeof target === "object" && target !== null && "dataset" in target;
}

function hasParentNode(target: EventTarget): target is ParentTarget {
  return typeof target === "object" && target !== null && "parentNode" in target;
}

export function nseOverlayEventPath(event: Event): EventTarget[] {
  const composedPath = event.composedPath();
  const fallbackPath: EventTarget[] = [];
  let current: EventTarget | null = event.target;
  while (current) {
    fallbackPath.push(current);
    current = hasParentNode(current) ? current.parentNode : null;
  }
  if (composedPath.length === 0) return fallbackPath;
  // WebKit can expose a partial composed path while pointer capture is being
  // established. Retain its ordering for shadow-boundary ownership, then
  // append the physical DOM ancestry so provider/surface markers remain
  // discoverable for the same event.
  const seen = new Set(composedPath);
  return [...composedPath, ...fallbackPath.filter((target) => !seen.has(target))];
}

function firstDataValue(path: readonly EventTarget[], key: string): string | null {
  for (const target of path) {
    if (!hasDataset(target)) continue;
    const value = target.dataset[key];
    if (value) return value;
  }
  return null;
}

export function belongsToNearestNSEOverlayProvider(
  event: Event,
  runtimeId: string,
  providerId: string,
): boolean {
  const path = nseOverlayEventPath(event);
  const nearestRuntimeId = firstDataValue(path, "syncloudosRuntimeOwner");
  // Mounted SynWare use an `app:<id>` marker for their DOM lease while their
  // NSE provider runs on the host runtime's overlay authority. Treat that
  // marker as host-owned here, just as RuntimeInputProtocol does, and leave
  // the provider marker to distinguish nested app providers.
  if (nearestRuntimeId && nearestRuntimeId !== runtimeId && !nearestRuntimeId.startsWith("app:")) return false;
  const nearestProviderId = firstDataValue(path, "nseOverlayProvider");
  if (nearestProviderId) {
    if (nearestProviderId === providerId) return true;
    // A nested provider is a logical event boundary only while it owns an
    // active overlay. When it is idle, an outer overlay must still receive
    // outside-pointer dismissal from the nested app's ordinary content.
    const document = path.find((target): target is Document => target instanceof Document);
    const nestedProvider = document
      ? documentProviderOrder.get(document)?.find((entry) => entry.providerId === nearestProviderId)
      : undefined;
    return nestedProvider ? !nestedProvider.hasActiveOverlay() : false;
  }
  const currentTarget = event.currentTarget;
  const document = currentTarget instanceof Document
    ? currentTarget
    : path.find((target): target is Document => target instanceof Document);
  const claimed = markerlessEventClaims.get(event);
  if (claimed) return claimed === providerId;
  const order = document ? documentProviderOrder.get(document) : undefined;
  const owner = order?.filter((entry) => entry.hasActiveOverlay())
    .reduce<DocumentProviderEntry | null>((latest, entry) => !latest || entry.activation > latest.activation ? entry : latest, null)
    ?.providerId ?? null;
  if (owner) markerlessEventClaims.set(event, owner);
  return owner === providerId;
}

export function isWithinNSEOverlay(path: readonly EventTarget[], registration: NSEOverlayRegistration): boolean {
  const surface = registration.surface;
  if (surface && path.some((target) => target instanceof Node && isWithinNSEFocusOrigin(surface, target))) return true;
  const hasLiveSurface = path.some((target) => target === registration.surface
    || (hasDataset(target)
      && target.dataset.nsePart === "surface"
      && (target as DatasetTarget & { readonly id?: string }).id === registration.id));
  return hasLiveSurface || (registration.anchor !== null && path.includes(registration.anchor));
}
