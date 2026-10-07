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

import type { SynCloudOSPersistence } from "../Runtime/runtimeInstanceTypes";
import type { UserNotificationPersistenceAdapter, UserNotificationRecord } from "./notificationDeliveryTypes";

function cloneRecord(record: UserNotificationRecord): UserNotificationRecord {
  return {
    ...record,
    request: { ...record.request, actions: record.request.actions ? record.request.actions.map((action) => ({ ...action })) : undefined },
    deliveryAttempts: record.deliveryAttempts.map((attempt) => ({ ...attempt })),
  };
}

export function createMemoryUserNotificationPersistence(seed: readonly UserNotificationRecord[] = []): UserNotificationPersistenceAdapter {
  const records = new Map(seed.map((record) => [record.id, cloneRecord(record)]));
  let disposed = false;
  return {
    async load() {
      return disposed ? [] : Array.from(records.values(), cloneRecord);
    },
    async put(record) {
      if (disposed) throw new Error("Notification persistence is disposed.");
      records.set(record.id, cloneRecord(record));
    },
    async remove(id) {
      if (!disposed) records.delete(id);
    },
    dispose() {
      disposed = true;
      records.clear();
    },
  };
}

export function createPersistenceBackedUserNotificationPersistence(
  persistence: SynCloudOSPersistence,
  key = "user-notifications",
): UserNotificationPersistenceAdapter {
  return {
    async load() {
      const records = persistence.getPreference<UserNotificationRecord[]>(key, []);
      return records.map(cloneRecord);
    },
    async put(record) {
      const records = persistence.getPreference<UserNotificationRecord[]>(key, []);
      const next = records.filter((item) => item.id !== record.id);
      next.push(cloneRecord(record));
      persistence.setPreference(key, next);
    },
    async remove(id) {
      const records = persistence.getPreference<UserNotificationRecord[]>(key, []);
      persistence.setPreference(key, records.filter((item) => item.id !== id));
    },
    dispose() {
      return undefined;
    },
  };
}
