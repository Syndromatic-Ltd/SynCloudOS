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

import { createBadgeSnapshot } from "../NotificationCenter/NotificationCenter";
import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";
import { normalizeBundleIdentifier } from "../Identity/bundleIdentifier.mjs";
export function applicationDockBadge(runtime: SynCloudOSRuntime, appId: string): string | undefined {
  return runtime.store.getSnapshot().appInfo[normalizeBundleIdentifier(appId)]?.notifications.badgeLabel;
}
export function setApplicationDockBadge(runtime: SynCloudOSRuntime, appId: string, label: string): void {
  runtime.signal.throwIfAborted();
  runtime.store.mutate(draft => {
    const app = draft.appInfo[normalizeBundleIdentifier(appId)];
    if (app) app.notifications = { ...app.notifications, badgeLabel: label || undefined };
  });
}
export function observeHostDockBadge(runtime: SynCloudOSRuntime, navigator: Navigator): () => void {
  const port = navigator as Navigator & { setAppBadge?(count?: number): Promise<void>; clearAppBadge?(): Promise<void> };
  let previous = -1, disposed = false;
  const update = () => {
    const snapshot = runtime.store.getSnapshot();
    const notifications = createBadgeSnapshot(snapshot.notifications, runtime.environment.now());
    const entries = new Map(Object.entries(notifications.byAppId).map(([id,value]) => [id,value.count]));
    for (const app of Object.values(snapshot.appInfo)) {
      const label = app.notifications.badgeLabel;
      if (label) entries.set(normalizeBundleIdentifier(app.bundleIdentifier), /^\d+$/u.test(label) ? Number(label) : 1);
    }
    const count = [...entries.values()].reduce((sum,count) => sum + count,0);
    if (count === previous || disposed) return; previous = count;
    void Promise.resolve(count ? port.setAppBadge?.(count) : port.clearAppBadge?.()).catch(() => {});
  };
  const unsubscribe = runtime.store.subscribe(update); update();
  return () => { disposed = true; unsubscribe(); };
}
