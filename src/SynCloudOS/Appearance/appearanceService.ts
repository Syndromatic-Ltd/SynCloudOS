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
  RuntimeMediaQuery,
  SynCloudOSPersistence,
  SynCloudOSRuntimeId,
} from "../Runtime/runtimeInstanceTypes";

export type SynCloudOSAppearance = "auto" | "light" | "dark";
export type SynCloudOSResolvedMode = "light" | "dark";

export interface SynCloudOSAppearanceService {
  readonly runtimeId: SynCloudOSRuntimeId;
  get(): SynCloudOSAppearance;
  resolved(): SynCloudOSResolvedMode;
  set(value: SynCloudOSAppearance): void;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

const PREFERENCE_KEY = "appearance";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function normaliseAppearance(value: unknown): SynCloudOSAppearance {
  return value === "light" || value === "dark" || value === "auto" ? value : "auto";
}

export function createAppearanceService({
  runtimeId,
  persistence,
  matchMedia,
}: {
  runtimeId: SynCloudOSRuntimeId;
  persistence: Pick<SynCloudOSPersistence, "getPreference" | "setPreference">;
  matchMedia(query: string): RuntimeMediaQuery;
}): SynCloudOSAppearanceService {
  let appearance = normaliseAppearance(persistence.getPreference(PREFERENCE_KEY, "auto"));
  const darkMode = matchMedia(DARK_QUERY);
  const listeners = new Set<() => void>();
  let disposed = false;
  const publish = () => listeners.forEach((listener) => listener());
  const unsubscribeDarkMode = darkMode.subscribe(() => {
    if (!disposed && appearance === "auto") publish();
  });

  return {
    runtimeId,
    get: () => appearance,
    resolved: () => appearance === "auto" ? (darkMode.matches ? "dark" : "light") : appearance,
    set(value) {
      if (disposed || value === appearance) return;
      appearance = value;
      persistence.setPreference(PREFERENCE_KEY, value);
      publish();
    },
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribeDarkMode();
      darkMode.dispose();
      listeners.clear();
    },
  };
}

/**
 * Resolve a mode-keyed map without ever returning `undefined`. The real crash risk in the system is
 * a JS asset map (e.g. `chrome[scheme]`) missing a mode — this guarantees a graceful fallback to a
 * defined mode rather than a blank/undefined render.
 */
export function pickMode<T>(map: Partial<Record<SynCloudOSResolvedMode, T>>, mode: SynCloudOSResolvedMode): T {
  return (map[mode] ?? map.light ?? map.dark) as T;
}
