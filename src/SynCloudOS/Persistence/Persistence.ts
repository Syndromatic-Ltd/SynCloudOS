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

export interface RuntimePersistenceOptions {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly storage: Storage | null;
  readonly namespace?: string;
}

const preferenceListeners = new WeakMap<SynCloudOSPersistence, Set<(key: string) => void>>();

/** @internal Observes committed writes/removals on the canonical runtime manager. */
export function subscribePersistencePreferences(persistence: SynCloudOSPersistence, listener: (key: string) => void): () => void {
  const listeners = preferenceListeners.get(persistence);
  if (!listeners) throw new TypeError("Preference notifications require the canonical runtime persistence manager.");
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function createPersistence({ runtimeId, storage, namespace: requestedNamespace }: RuntimePersistenceOptions): SynCloudOSPersistence {
  const scopedNamespace = requestedNamespace ?? `SynCloudOS4:${runtimeId}`;
  const listeners = new Set<(key: string) => void>();
  const notify = (key: string) => {
    for (const listener of [...listeners]) {
      try { listener(key); } catch (error) { queueMicrotask(() => { throw error; }); }
    }
  };
  const persistence: SynCloudOSPersistence = {
    runtimeId,
    getPreference<T>(key: string, fallback: T): T {
      if (!storage) return fallback;
      try {
        const raw = storage.getItem(`${scopedNamespace}:${key}`);
        return raw ? (JSON.parse(raw) as T) : fallback;
      } catch {
        return fallback;
      }
    },
    setPreference<T>(key: string, value: T) {
      if (!storage) return false;
      try {
        storage.setItem(`${scopedNamespace}:${key}`, JSON.stringify(value));
      } catch {
        return false;
      }
      notify(key);
      return true;
    },
    readPreferenceText(key: string) {
      if (!storage) return null;
      try {
        return storage.getItem(`${scopedNamespace}:${key}`);
      } catch {
        return null;
      }
    },
    writePreferenceText(key: string, text: string) {
      if (!storage) return false;
      try {
        storage.setItem(`${scopedNamespace}:${key}`, text);
      } catch {
        return false;
      }
      notify(key);
      return true;
    },
    removePreference(key: string) {
      storage?.removeItem(`${scopedNamespace}:${key}`);
      if (storage) notify(key);
    },
    dispose() {
      listeners.clear();
    },
  };
  preferenceListeners.set(persistence, listeners);
  return persistence;
}
