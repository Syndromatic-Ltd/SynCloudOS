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

import { NSEData } from "../../Foundation/NSEData";
import type { BGTaskScheduler, BGTaskRequest, BGDownloadTaskRequest } from "../SynCloudOS";
import { systemWorkerRequest } from "./BrowserSystemWorkerClient";
interface BackgroundRegistration extends ServiceWorkerRegistration {
  readonly sync?: { register(tag: string): Promise<void> };
  readonly backgroundFetch?: { fetch(id: string, requests: readonly string[], options: { title: string; downloadTotal?: number }): Promise<{ readonly id: string; abort(): Promise<boolean> }> };
}
export function createBrowserBackgroundTaskScheduler(navigator: Navigator, appId: string, identifiers: readonly string[], signal: AbortSignal, cacheStorage?: CacheStorage): BGTaskScheduler {
  const requireIdentifier = (identifier: string) => { signal.throwIfAborted(); if (!identifiers.includes(identifier)) throw new DOMException("Declare this background task in Info.ts before scheduling it.", "SecurityError"); };
  const registration = async () => {
    signal.throwIfAborted();
    const result = await navigator.serviceWorker?.getRegistration() as BackgroundRegistration | undefined;
    if (!result?.active) throw new DOMException("An active system worker is required.", "NotSupportedError");
    signal.throwIfAborted(); return result;
  };
  return Object.freeze({
    async capabilities() { signal.throwIfAborted(); const worker = await navigator.serviceWorker?.getRegistration() as BackgroundRegistration | undefined; return { backgroundSync: !!worker?.sync, backgroundFetch: !!worker?.backgroundFetch }; },
    async submit(request: BGTaskRequest) {
      requireIdentifier(request.identifier);
      const worker = await registration();
      if (!worker.sync) throw new DOMException("Background sync is unavailable.", "NotSupportedError");
      await systemWorkerRequest(navigator, { type: "background-enqueue", appId, request }, signal);
      try { await worker.sync.register(`syncloudos:${appId}:${request.identifier}`); }
      catch (error) { await systemWorkerRequest(navigator, { type: "background-cancel", appId, identifier: request.identifier }, signal); throw error; }
    },
    async submitDownload(request: BGDownloadTaskRequest) {
      requireIdentifier(request.identifier); const worker = await registration();
      if (!worker.backgroundFetch) throw new DOMException("Background fetch is unavailable.", "NotSupportedError");
      const origin = new URL(worker.scope).origin;
      const urls = request.urls.map(value => { const url = new URL(value, worker.scope); if (url.origin !== origin || !url.pathname.startsWith(new URL(worker.scope).pathname)) throw new DOMException("Background downloads must stay on the host origin.", "SecurityError"); return url.href; });
      return worker.backgroundFetch.fetch(`syncloudos:${appId}:${request.identifier}`, urls, { title: request.title, downloadTotal: request.downloadTotal });
    },
    async downloadedData(identifier: string, value: string) {
      requireIdentifier(identifier); const worker = await registration();
      if (!cacheStorage) throw new DOMException("The background download cache is unavailable.", "NotSupportedError");
      const url = new URL(value, worker.scope), base = new URL(worker.scope).pathname;
      if (url.origin !== new URL(worker.scope).origin || !url.pathname.startsWith(base)) throw new DOMException("The downloaded URL left the host scope.", "SecurityError");
      const key = new URL(`__syncloudos/download/${encodeURIComponent(`syncloudos:${appId}:${identifier}`)}/${encodeURIComponent(url.href)}`, worker.scope);
      const response = await (await cacheStorage.open(`syncloudos:${base}:downloads`)).match(key);
      signal.throwIfAborted();
      return response ? { data: await NSEData.read(await response.blob()), mimeType: response.headers.get("Content-Type") ?? "application/octet-stream" } : null;
    },
    async getPendingTaskRequests() { return systemWorkerRequest<readonly BGTaskRequest[]>(navigator, { type: "background-list", appId }, signal); },
    async cancel(identifier: string) { requireIdentifier(identifier); await systemWorkerRequest(navigator, { type: "background-cancel", appId, identifier }, signal); },
  });
}
