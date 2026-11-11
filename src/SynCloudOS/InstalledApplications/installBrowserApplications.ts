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

import { bindInstalledApplication } from "./installedApplicationRegistry";
import { shortcutCommandIdentifier } from "./installedApplicationLaunch";
import { systemWorkerRequest } from "../PlatformAdapters/BrowserSystemWorkerClient";
import { observeHostDockBadge } from "./dockBadges";
import { createInstalledApplicationRuntimePort } from "./installedApplicationRuntimePort";
import { routeInstalledApplicationLaunch, type InstalledApplicationLaunch } from "./installedApplicationLaunch";
import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";
import { BrowserInstalledApplicationAdapter } from "../PlatformAdapters/BrowserInstalledApplicationAdapter";
import type { InstalledApplicationConfiguration } from "./installedApplicationTypes";
/** Browser mount owns installation, not applications or FX. */
export function installBrowserApplications(runtime: SynCloudOSRuntime, bootstrap: Promise<void> = Promise.resolve()): void {
  const document = runtime.environment.browser.getDocument();
  const browserWindow = document?.defaultView;
  const value = document?.querySelector('meta[name="syncloudos-installation"]')?.getAttribute("content");
  if (!document || !browserWindow || !value) return;
  const configuration = JSON.parse(value) as InstalledApplicationConfiguration;
  if (!configuration.manifests.length) return;
  const stopBadgeObservation = observeHostDockBadge(runtime, browserWindow.navigator);
  const adapter = new BrowserInstalledApplicationAdapter(browserWindow, browserWindow.navigator, configuration);
  const releaseInstallation = bindInstalledApplication(document, adapter);
  runtime.registerDisposalParticipant({ id: "installed-applications", prepare: () => ({ status: "ready", commit: () => { stopBadgeObservation(); adapter.dispose(); releaseInstallation(); } }) });
  const stopManifestObservation = runtime.routes.subscribeTransitions(() => adapter.updateManifest());
  runtime.signal.addEventListener("abort", stopManifestObservation, { once: true });
  void adapter.start();
  const apps = [...new Map(configuration.manifests.flatMap(record => record.members).map(info => [info.bundleIdentifier, info])).values()];
  let queue = Promise.resolve();
  const deliver = (launch: InstalledApplicationLaunch) => {
    queue = queue.then(async () => {
      await bootstrap;
      if (runtime.signal.aborted) return;
      const target = new URL(launch.targetURL ?? browserWindow.location.href, browserWindow.location.origin);
      const shareId = target.searchParams.get("scos-share");
      const shareApp = apps.find(app => app.shareTarget && `${configuration.base.replace(/\/$/u, "")}${app.shareTarget.action}` === target.pathname);
      let sharedItems = launch.sharedItems;
      if (shareId && shareApp) sharedItems = await systemWorkerRequest(browserWindow.navigator, { type: "share-read", appId: shareApp.bundleIdentifier, identifier: shareId }, runtime.signal);
      if (!shareId && shareApp?.shareTarget?.method === "GET") {
        const params = shareApp.shareTarget.params;
        sharedItems = { title: params.title ? target.searchParams.get(params.title) ?? undefined : undefined, text: params.text ? target.searchParams.get(params.text) ?? undefined : undefined, url: params.url ? target.searchParams.get(params.url) ?? undefined : undefined, files: [] };
      }
      const delivered = await routeInstalledApplicationLaunch({ ...launch, sharedItems }, apps, createInstalledApplicationRuntimePort(runtime, browserWindow.location.origin, configuration.base));
      if (shareId && !delivered) throw new Error("The shared item has no declared application route.");
      if (shareId && shareApp) await systemWorkerRequest(browserWindow.navigator, { type: "share-ack", appId: shareApp.bundleIdentifier, identifier: shareId }, runtime.signal);
    }).catch(error => { if (!runtime.signal.aborted) browserWindow.console.error("SynCloudOS application launch failed", error); });
  };
  const shortcutRegistrations = apps.flatMap(app => (app.shortcutItems ?? []).map(item => runtime.commands.register({
    id: shortcutCommandIdentifier(app.bundleIdentifier, item.type), responderId: "webspring", title: { key: `shortcut.${item.type}`, fallback: item.title },
    payload: { description: "No payload.", parse: (value: unknown) => value === undefined ? { ok: true as const, value: undefined } : { ok: false as const, issues: ["This shortcut takes no payload."] } },
    scope: "webspring", defaultKeyBindings: [], undo: { kind: "none" },
    validate: () => ({ enabled: !runtime.signal.aborted }),
    execute: () => { const url = new URL(`${configuration.base.replace(/\/$/u, "")}${item.url}`, browserWindow.location.origin); url.searchParams.set("scos-shortcut", item.type); deliver({ targetURL: url.href }); },
  })));
  runtime.signal.addEventListener("abort", () => { for (const registration of shortcutRegistrations) registration.dispose(); }, { once: true });
  const onWorkerMessage = (event: MessageEvent) => {
    const message = event.data;
    if (message?.type === "notification-open" && typeof message.url === "string") deliver({ targetURL: message.url });
    if (message?.type === "notification-delivered" && apps.some(app => app.bundleIdentifier === message.appId)) {
      void runtime.notifications.post({ idempotencyKey: `push:${message.appId}:${message.identifier || message.title}`, title: message.title, body: message.body, appId: message.appId, delivery: "in-app", metadata: { url: message.url } });
    }
  };
  browserWindow.navigator.serviceWorker?.addEventListener("message", onWorkerMessage);
  runtime.signal.addEventListener("abort", () => browserWindow.navigator.serviceWorker?.removeEventListener("message", onWorkerMessage), { once: true });
  const launchQueue = (browserWindow as Window & { launchQueue?: { setConsumer(consumer: (launch: InstalledApplicationLaunch) => void): void } }).launchQueue;
  launchQueue?.setConsumer(deliver);
  runtime.signal.addEventListener("abort", () => launchQueue?.setConsumer(() => {}), { once: true });
  const url = new URL(browserWindow.location.href);
  if (url.searchParams.has("scos-protocol") || url.searchParams.has("scos-shortcut") || url.searchParams.has("scos-share") || url.searchParams.has("scos-notification") || apps.some(app => app.shareTarget?.method === "GET" && `${configuration.base.replace(/\/$/u, "")}${app.shareTarget.action}` === url.pathname)) deliver({ targetURL: url.href });
}
