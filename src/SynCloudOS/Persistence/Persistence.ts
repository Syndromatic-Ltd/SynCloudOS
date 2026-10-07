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
export function createPersistence({ runtimeId, storage, namespace: requestedNamespace }: RuntimePersistenceOptions): SynCloudOSPersistence {
  const scopedNamespace = requestedNamespace ?? `SynCloudOS4:${runtimeId}`;
  return {
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
        return true;
      } catch {
        return false;
      }
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
        return true;
      } catch {
        return false;
      }
    },
    removePreference(key: string) {
      storage?.removeItem(`${scopedNamespace}:${key}`);
    },
    dispose() {
      return undefined;
    },
  };
}
