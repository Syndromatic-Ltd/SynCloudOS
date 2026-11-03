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

import type { RuntimeSnapshotSource } from "../Runtime/runtimeInstanceTypes";
import type { RuntimeViewportFeaturesSnapshot } from "../SynCloudOS";
import { sameViewportFeatures } from "../SynCloudOS";

type PosturePort = EventTarget & { readonly type?: unknown };
type FeatureWindow = Window & {
  readonly viewport?: { readonly segments?: readonly DOMRectReadOnly[] | null };
};

/** Current APIs only. No feature flags, permission requests, media-query
 * guesses, device names, or deprecated segment aliases. Listeners are lazy. */
export function createBrowserViewportFeaturesSource(browserWindow: Window | null): RuntimeSnapshotSource<RuntimeViewportFeaturesSnapshot> {
  const host = browserWindow as FeatureWindow | null;
  const readPosturePort = (): PosturePort | null => {
    try {
      return (host?.navigator as (Navigator & { readonly devicePosture?: PosturePort }) | undefined)?.devicePosture ?? null;
    } catch { return null; }
  };
  const read = (): RuntimeViewportFeaturesSnapshot => {
    let posture: RuntimeViewportFeaturesSnapshot["posture"] = null;
    let segments: RuntimeViewportFeaturesSnapshot["segments"] = null;
    try {
      const value = readPosturePort()?.type;
      if (value === "continuous" || value === "folded") posture = value;
    } catch { /* unavailable in this context */ }
    try {
      const value = host?.viewport?.segments;
      if (Array.isArray(value) && value.length > 0 && value.length <= 8) {
        segments = Object.freeze(value.map(rect => Object.freeze({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })));
      }
    } catch { /* unreadable facts stay unavailable */ }
    return Object.freeze({ posture, segments });
  };
  let snapshot = read();
  const listeners = new Set<(value: RuntimeViewportFeaturesSnapshot) => void>();
  let removeEvents: (() => void) | null = null;
  const refresh = () => {
    const next = read();
    if (sameViewportFeatures(snapshot, next)) return;
    snapshot = next;
    for (const listener of [...listeners]) listener(snapshot);
  };
  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener: (value: RuntimeViewportFeaturesSnapshot) => void) {
      if (listeners.size === 0) {
        snapshot = read();
        const posture = readPosturePort();
        host?.addEventListener("resize", refresh);
        host?.addEventListener("pageshow", refresh);
        host?.screen.orientation?.addEventListener("change", refresh);
        host?.document.addEventListener("visibilitychange", refresh);
        posture?.addEventListener?.("change", refresh);
        removeEvents = () => {
          host?.removeEventListener("resize", refresh);
          host?.removeEventListener("pageshow", refresh);
          host?.screen.orientation?.removeEventListener("change", refresh);
          host?.document.removeEventListener("visibilitychange", refresh);
          posture?.removeEventListener?.("change", refresh);
        };
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) { removeEvents?.(); removeEvents = null; }
      };
    },
  });
}
