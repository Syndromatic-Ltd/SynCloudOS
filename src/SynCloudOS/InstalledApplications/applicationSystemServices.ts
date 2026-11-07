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

import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";
import { createBrowserBackgroundTaskScheduler } from "../PlatformAdapters/BrowserBackgroundTaskScheduler";
import { createBrowserRemoteNotifications } from "../PlatformAdapters/BrowserRemoteNotifications";
import type { UNPushConfiguration } from "../UserNotifications/UserNotifications";
import { setApplicationDockBadge } from "./dockBadges";
const pushConfigurations = new WeakMap<SynCloudOSRuntime, UNPushConfiguration>();
export function configureApplicationPush(runtime: SynCloudOSRuntime, configuration?: UNPushConfiguration): void {
  if (configuration) pushConfigurations.set(runtime, configuration);
}
export function applicationSystemServices(runtime: SynCloudOSRuntime, appId: string, signal: AbortSignal) {
  const document = runtime.environment.browser.getDocument(), browserWindow = document?.defaultView;
  if (!browserWindow) throw new DOMException("These system services need a browser host.", "NotSupportedError");
  const info = runtime.bundles.getBundle(appId)?.synWareManifest;
  const scheduler = createBrowserBackgroundTaskScheduler(browserWindow.navigator, appId, info?.background?.enabled ? info.background.tasks ?? [] : [], signal, browserWindow.caches);
  const requireNotifications = () => {
    signal.throwIfAborted();
    if (!runtime.bundles.getBundle(appId)?.synWareManifest?.entitlements?.includes("notifications.post")) throw new DOMException("Declare notifications.post in Info.ts entitlements.", "SecurityError");
  };
  const privacy = runtime.privacy.forApplication({ appId, userId: runtime.identity.session.getSnapshot()?.subjectId ?? "anonymous", service: "notifications", signal });
  const notifications = createBrowserRemoteNotifications(browserWindow, appId, pushConfigurations.get(runtime), signal,
    () => { requireNotifications(); privacy.assertRequestAllowed(); },
    async () => {
      requireNotifications();
      return await privacy.requestAuthorization(async () => {
        const status = await runtime.notifications.requestBrowserPermission?.({ userGesture: true });
        return status === "granted" ? "granted" : status === "denied" ? "denied" : status === "unsupported" ? "unavailable" : "prompt";
      }, { signal }) === "granted";
    });
  return { scheduler, notifications, setBadgeLabel: (label: string) => setApplicationDockBadge(runtime, appId, label) };
}
