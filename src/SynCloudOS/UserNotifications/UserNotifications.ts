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

export interface UNNotificationAction { readonly identifier: string; readonly title: string }
export interface UNNotificationCategory { readonly identifier: string; readonly actions: readonly UNNotificationAction[] }
export interface UNNotificationSettings {
  readonly authorizationStatus: "notDetermined" | "denied" | "authorized" | "unsupported";
  readonly remoteNotifications: boolean;
}
export interface UNUserNotificationCenter {
  getNotificationSettings(): Promise<UNNotificationSettings>;
  requestAuthorization(): Promise<boolean>;
  setNotificationCategories(categories: readonly UNNotificationCategory[]): Promise<void>;
}
/** Public VAPID key and same-origin application-server contract. Never a private key. */
export interface UNPushConfiguration {
  readonly applicationServerKey: string;
  readonly subscriptionURL: string;
}
export interface UNRemoteNotificationRegistration {
  registerForRemoteNotifications(): Promise<PushSubscriptionJSON>;
  unregisterForRemoteNotifications(): Promise<void>;
}
