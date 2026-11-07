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
import { createBrowserRemoteNotifications, type BrowserNotificationAuthorizationPort } from "../PlatformAdapters/BrowserRemoteNotifications";
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
  const privacyOwner = new AbortController();
  const currentPrivacyUserId = () => {
    const session = runtime.identity.session.getSnapshot();
    return session?.state === "active" ? `identity:${session.subjectId}` : runtime.configurationProfiles.getCurrentSubject().user.id;
  };
  const privacySessionKey = () => {
    const session = runtime.identity.session.getSnapshot();
    return JSON.stringify([session?.id, session?.subjectId, session?.state]);
  };
  const userId = currentPrivacyUserId(), mountedSessionKey = privacySessionKey();
  const privacySignal = AbortSignal.any([signal, privacyOwner.signal]);
  const checkPrivacyOwner = () => {
    if (privacyOwner.signal.aborted) return;
    if (currentPrivacyUserId() !== userId || privacySessionKey() !== mountedSessionKey || !runtime.lifecycle.validateAccess(appId, "activate").ok)
      privacyOwner.abort(new DOMException("The privacy subject or application access changed.", "AbortError"));
  };
  let loginFingerprint = "";
  const unsubscribeLogin = runtime.store.subscribe(() => {
    const login = runtime.store.getSnapshot().loginServices;
    const fingerprint = JSON.stringify([login.synId, login.isAuthorised, login.accessClass]);
    if (fingerprint === loginFingerprint) return;
    loginFingerprint = fingerprint;
    checkPrivacyOwner();
  });
  const unsubscribeProfile = runtime.configurationProfiles.subscribe(checkPrivacyOwner);
  const unsubscribeIdentity = runtime.identity.session.subscribe(checkPrivacyOwner);
  const releasePrivacyOwner = () => { unsubscribeLogin(); unsubscribeProfile(); unsubscribeIdentity(); };
  if (privacySignal.aborted) releasePrivacyOwner();
  else privacySignal.addEventListener("abort", releasePrivacyOwner, { once: true });
  const requirePrivacyOwner = () => { checkPrivacyOwner(); privacySignal.throwIfAborted(); };
  const requireNotifications = () => {
    requirePrivacyOwner();
    if (!runtime.bundles.getBundle(appId)?.synWareManifest?.entitlements?.includes("notifications.post")) throw new DOMException("Declare notifications.post in Info.ts entitlements.", "SecurityError");
  };
  const privacy = runtime.privacy.forApplication({ appId, userId, service: "notifications", signal: privacySignal });
  const authorization: BrowserNotificationAuthorizationPort = {
    require: () => { requireNotifications(); privacy.assertRequestAllowed(); },
    request: async () => {
      requireNotifications();
      return await privacy.requestAuthorization(async () => {
        const status = await runtime.notifications.requestBrowserPermission?.({ userGesture: true });
        return status === "granted" ? "granted" : status === "denied" ? "denied" : status === "unsupported" ? "unavailable" : "prompt";
      }, { signal: privacySignal }) === "granted";
    },
    observe: status => {
      requirePrivacyOwner();
      const effective = privacy.observe(status === "authorized" ? "granted" : status === "denied" ? "denied" : status === "unsupported" ? "unavailable" : "prompt");
      return effective === "granted" ? "authorized" : effective === "denied" ? "denied" : effective === "unavailable" ? "unsupported" : "notDetermined";
    },
    requireRemoteRegistration: () => {
      requireNotifications();
      if (privacy.authorizationStatus() !== "granted") throw new DOMException("Request this application's notification authorisation before registering for push.", "NotAllowedError");
    },
  };
  const notifications = Object.freeze({
    ...createBrowserRemoteNotifications(browserWindow, appId, pushConfigurations.get(runtime), privacySignal, authorization),
    async registerForRemoteNotifications() {
      authorization.requireRemoteRegistration();
      // Native origin subscriptions are shared. Only this app's existing consent
      // admits an association, and withdrawal cancels its pending server request.
      return privacy.request(operationSignal => createBrowserRemoteNotifications(browserWindow, appId, pushConfigurations.get(runtime), operationSignal, authorization).registerForRemoteNotifications());
    },
  });
  return { scheduler, notifications, setBadgeLabel: (label: string) => setApplicationDockBadge(runtime, appId, label) };
}
