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
  UserNotificationDeliveryAdapter,
  UserNotificationPermission,
  UserNotificationRecord,
} from "../Runtime/runtimeInstanceTypes";

export interface BrowserNotificationPort {
  permission(): UserNotificationPermission;
  requestPermission(): Promise<UserNotificationPermission>;
  show(title: string, options: { readonly body: string; readonly tag: string }): void | Promise<void>;
}

export function createBrowserUserNotificationDeliveryAdapter(port: BrowserNotificationPort): UserNotificationDeliveryAdapter {
  let disposed = false;
  return {
    id: "browser-notification",
    permission() {
      return disposed ? "unsupported" : port.permission();
    },
    requestPermission(request) {
      if (!request.userGesture || disposed) return Promise.resolve("unsupported");
      return port.requestPermission();
    },
    async deliver(record: UserNotificationRecord, signal: AbortSignal) {
      if (disposed) return { status: "skipped", reason: "adapter-disposed" };
      if (signal.aborted) return { status: "failed", reason: "cancelled" };
      if (port.permission() !== "granted") return { status: "skipped", reason: `permission-${port.permission()}` };
      try {
        await port.show(record.request.title, { body: record.request.body, tag: record.id });
        return { status: "delivered" };
      } catch (error) {
        return { status: "failed", reason: error instanceof Error ? error.message : String(error) };
      }
    },
    dispose() {
      disposed = true;
    },
  };
}
