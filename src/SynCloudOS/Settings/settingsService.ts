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

import type { SynCloudOSPersistence, SynCloudOSRuntimeId } from "../Runtime/runtimeInstanceTypes";

export type SynCloudOSMotionPreference = "standard" | "reduced";

export interface SynCloudOSSettings {
  soundEnabled: boolean;
  masterVolume: number;
  appVolumes: Readonly<Record<string, number>>;
  vibrationEnabled: boolean;
  motion: SynCloudOSMotionPreference | "system";
  notificationsEnabled: boolean;
  notifications: Record<string, boolean>;
}

export interface SynCloudOSSettingsService {
  readonly runtimeId: SynCloudOSRuntimeId;
  get(): SynCloudOSSettings;
  supportsVibration(): boolean;
  set<K extends keyof SynCloudOSSettings>(key: K, value: SynCloudOSSettings[K]): void;
  setNotificationsAllowed(appId: string, allowed: boolean): void;
  notificationsAllowed(appId: string): boolean;
  appNotificationsAllowed(appId: string): boolean;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

const SETTINGS_PREFERENCE_KEY = "settings";
const DEFAULTS: SynCloudOSSettings = {
  soundEnabled: true,
  masterVolume: 1,
  appVolumes: {},
  vibrationEnabled: true,
  motion: "system",
  notificationsEnabled: true,
  notifications: {}
};

export const normaliseAudioLevel = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;

function normaliseSettings(input: Partial<SynCloudOSSettings> | null | undefined): SynCloudOSSettings {
  return {
    masterVolume: normaliseAudioLevel(input?.masterVolume),
    appVolumes: Object.freeze(Object.fromEntries(Object.entries(input?.appVolumes && typeof input.appVolumes === "object" && !Array.isArray(input.appVolumes) ? input.appVolumes : {}).map(([appId, volume]) => [appId, normaliseAudioLevel(volume)]))),
    soundEnabled: typeof input?.soundEnabled === "boolean" ? input.soundEnabled : DEFAULTS.soundEnabled,
    vibrationEnabled: typeof input?.vibrationEnabled === "boolean" ? input.vibrationEnabled : DEFAULTS.vibrationEnabled,
    motion: input?.motion === "standard" || input?.motion === "reduced" ? input.motion : DEFAULTS.motion,
    notificationsEnabled: typeof input?.notificationsEnabled === "boolean"
      ? input.notificationsEnabled
      : DEFAULTS.notificationsEnabled,
    notifications: input?.notifications && typeof input.notifications === "object"
      ? { ...input.notifications }
      : {}
  };
}

export function createSettingsService({
  runtimeId,
  persistence,
  matchMedia,
  getNavigator,
}: {
  runtimeId: SynCloudOSRuntimeId;
  persistence: Pick<SynCloudOSPersistence, "getPreference" | "setPreference">;
  matchMedia?: (query: string) => { readonly matches: boolean };
  getNavigator?: () => Pick<Navigator, "maxTouchPoints"> | null;
}): SynCloudOSSettingsService {
  let settings = normaliseSettings(
    persistence.getPreference<Partial<SynCloudOSSettings>>(SETTINGS_PREFERENCE_KEY, DEFAULTS)
  );
  const listeners = new Set<() => void>();
  let disposed = false;

  const publish = () => {
    persistence.setPreference(SETTINGS_PREFERENCE_KEY, settings);
    for (const listener of listeners) listener();
  };

  return {
    runtimeId,
    get: () => settings,
    supportsVibration() {
      const coarsePointer = matchMedia?.("(any-pointer: coarse)").matches ?? false;
      const touchPoints = (getNavigator?.()?.maxTouchPoints ?? 0) > 0;
      return coarsePointer || touchPoints;
    },
    set(key, value) {
      if (disposed || settings[key] === value) return;
      settings = normaliseSettings({ ...settings, [key]: value });
      publish();
    },
    setNotificationsAllowed(appId, allowed) {
      if (disposed) return;
      const notifications = { ...settings.notifications };
      if (allowed) delete notifications[appId];
      else notifications[appId] = false;
      settings = { ...settings, notifications };
      publish();
    },
    notificationsAllowed: (appId) => settings.notificationsEnabled && settings.notifications[appId] !== false,
    appNotificationsAllowed: (appId) => settings.notifications[appId] !== false,
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      disposed = true;
      listeners.clear();
    }
  };
}
