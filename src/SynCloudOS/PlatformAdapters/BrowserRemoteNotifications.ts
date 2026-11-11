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

import type { UNUserNotificationCenter, UNRemoteNotificationRegistration, UNPushConfiguration, UNNotificationCategory, UNNotificationSettings } from "../SynCloudOS";
import { systemWorkerRequest } from "./BrowserSystemWorkerClient";
export interface BrowserNotificationAuthorizationPort {
  require(): void;
  request(): Promise<boolean>;
  observe(status: UNNotificationSettings["authorizationStatus"]): UNNotificationSettings["authorizationStatus"];
  requireRemoteRegistration(): void;
}
export function createBrowserRemoteNotifications(browserWindow: Window, appId: string, configuration: UNPushConfiguration | undefined, signal: AbortSignal, authorization?: BrowserNotificationAuthorizationPort): UNUserNotificationCenter & UNRemoteNotificationRegistration {
  const browser = browserWindow as Window & { Notification?: typeof Notification; PushManager?: typeof PushManager };
  const navigator = browserWindow.navigator;
  const registration = async () => {
    signal.throwIfAborted();
    const worker = await navigator.serviceWorker?.getRegistration();
    if (!worker?.active || !worker.pushManager) throw new DOMException("Push notifications need an active installed application worker.", "NotSupportedError");
    signal.throwIfAborted(); return worker;
  };
  const endpoint = () => {
    if (!configuration) throw new DOMException("The site has not configured its push server.", "NotSupportedError");
    const url = new URL(configuration.subscriptionURL, browserWindow.location.href);
    if (url.origin !== browserWindow.location.origin) throw new DOMException("Push subscription registration must stay on the host origin.", "SecurityError");
    return url;
  };
  return Object.freeze({
    async getNotificationSettings() {
      signal.throwIfAborted();
      const permission = browser.Notification?.permission;
      const status = !permission ? "unsupported" as const : permission === "granted" ? "authorized" as const : permission === "denied" ? "denied" as const : "notDetermined" as const;
      return { authorizationStatus: authorization?.observe(status) ?? status, remoteNotifications: !!configuration && !!browser.PushManager };
    },
    async requestAuthorization() { signal.throwIfAborted(); authorization?.require(); return authorization ? authorization.request() : !!browser.Notification && await browser.Notification.requestPermission() === "granted"; },
    async setNotificationCategories(categories: readonly UNNotificationCategory[]) { authorization?.require(); await systemWorkerRequest(navigator, { type: "notification-categories", appId, categories }, signal); },
    async registerForRemoteNotifications() {
      authorization?.require();
      authorization?.requireRemoteRegistration();
      const url = endpoint();
      if (browser.Notification?.permission !== "granted") throw new DOMException("Request notification authorisation before registering for push.", "NotAllowedError");
      const worker = await registration();
      const encoded = configuration!.applicationServerKey.replace(/-/g, "+").replace(/_/g, "/");
      const key = Uint8Array.from(browserWindow.atob(encoded), character => character.charCodeAt(0));
      if (key.length !== 65 || key[0] !== 4) throw new TypeError("A VAPID public key must be an uncompressed P-256 public key.");
      let subscription = await worker.pushManager.getSubscription();
      if (!subscription) subscription = await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      signal.throwIfAborted();
      const json = subscription.toJSON();
      const response = await browserWindow.fetch(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: 1, appId, subscription: json }), signal });
      if (!response.ok) throw new Error(`Push registration failed (${response.status}).`);
      return json;
    },
    async unregisterForRemoteNotifications() {
      const url = endpoint(); const worker = await registration(); const subscription = await worker.pushManager.getSubscription();
      if (!subscription) return;
      const response = await browserWindow.fetch(url, { method: "DELETE", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: 1, appId, endpoint: subscription.endpoint }), signal });
      if (!response.ok) throw new Error(`Push unregistration failed (${response.status}).`);
      // The origin's subscription is shared by its apps. The server removes this app's association.
    },
  });
}
