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

/** One runtime worker. Generated configuration is public data, never credentials. */
export function createServiceWorkerSource(configuration) {
  return `(${runtimeServiceWorker.toString()})(${JSON.stringify(configuration)});`;
}
function runtimeServiceWorker(config) {
  const prefix = `syncloudos:${config.base}:`;
  const cacheName = `${prefix}${config.receipt}`;
  const shellURL = new URL(`${config.base}index.html`, self.location.origin).href;
  const assets = new Set(config.assets.map(path => new URL(path, self.location.origin).href));
  const allowedNavigation = url => config.manifests.some(record => {
    const scope = record.manifest.scope;
    return url.pathname === scope || url.pathname.startsWith(scope.endsWith("/") ? scope : `${scope}/`);
  }) && !/^\/(?:api|auth|__dev)(?:\/|$)/u.test(url.pathname.slice(config.base.length - 1));
  self.addEventListener("install", event => {
    event.waitUntil(caches.open(cacheName).then(cache => cache.addAll([...assets])));
  });
  self.addEventListener("activate", event => {
    event.waitUntil((async () => {
      for (const key of await caches.keys()) if (key.startsWith(prefix) && key !== cacheName) await caches.delete(key);
      await self.clients.claim();
    })());
  });
  self.addEventListener("fetch", event => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== "GET" || url.origin !== self.location.origin) return;
    if (request.mode === "navigate" && allowedNavigation(url)) {
      // Only the public, build-produced shell is retained, never a signed-in HTML response.
      event.respondWith(fetch(request).catch(async () => (await caches.open(cacheName)).match(shellURL).then(response => response ?? Response.error())));
      return;
    }
    const devAsset = config.development && url.pathname.startsWith(config.base) && /(?:\.(?:m?[jt]sx?|css|png|webp|svg|jpe?g|gif|woff2?|ttf|otf)$|\/@vite\/client|\/@react-refresh)/u.test(url.pathname) && !/^\/(?:api|auth|__dev)(?:\/|$)/u.test(url.pathname);
    if (!assets.has(url.href) && !devAsset) return;
    event.respondWith((async () => {
      const cache = await caches.open(cacheName);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type !== "opaque") await cache.put(request, response.clone());
      return response;
    })());
  });
}
