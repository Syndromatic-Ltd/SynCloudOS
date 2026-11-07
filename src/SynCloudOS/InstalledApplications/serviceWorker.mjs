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
  const apps = [...new Map(config.manifests.flatMap(record => record.members).map(app => [app.bundleIdentifier, app])).values()];
  const appFor = appId => apps.find(app => app.bundleIdentifier === appId);
  const safeURL = value => {
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin || !allowedNavigation(url)) throw new TypeError("The URL must stay on the installed origin and scope.");
    return url;
  };
  let database;
  const db = () => database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(`syncloudos-system:${config.base}`, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("work");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const stored = async (mode, operation) => {
    const database = await db();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("work", mode), store = transaction.objectStore("work");
      const request = operation(store);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = transaction.onerror = () => reject(transaction.error ?? request.error);
    });
  };
  const get = key => stored("readonly", store => store.get(key));
  const set = (key, value) => stored("readwrite", store => store.put(value, key));
  const remove = key => stored("readwrite", store => store.delete(key));
  const values = () => stored("readonly", store => store.getAll());
  const removeTaskIfCurrent = (key, requestId) => stored("readwrite", store => {
    const request = store.get(key);
    request.onsuccess = () => { if (request.result?.requestId === requestId) store.delete(key); };
    return request;
  });
  self.addEventListener("message", event => {
    const message = event.data;
    if (!message || !event.ports?.[0]) return;
    event.waitUntil((async () => {
      try {
        const app = appFor(message.appId);
        let value;
        if (message.type.startsWith("background-")) {
          if (!app?.background?.enabled) throw new TypeError("This application did not declare background work.");
          const identifier = message.request?.identifier ?? message.identifier;
          if (message.type !== "background-list" && !app.background.tasks?.includes(identifier)) throw new TypeError("This background task was not declared.");
          const key = `task:${message.appId}:${identifier}`;
          if (message.type === "background-enqueue") {
            const url = new URL(message.request.url, self.location.origin);
            if (url.origin !== self.location.origin || !url.pathname.startsWith(config.base)) throw new TypeError("Background requests must stay on the host origin and deployment scope.");
            if (url.username || url.password || message.request.body?.length > 1048576) throw new TypeError("The task request is invalid or too large.");
            const method = message.request.method ?? "GET";
            if (!["GET", "POST", "PUT", "DELETE"].includes(method) || (method === "GET" && message.request.body)) throw new TypeError("Invalid background request method.");
            const requestId = crypto.randomUUID();
            await set(key, { kind: "task", requestId, appId: app.bundleIdentifier, request: { ...message.request, url: url.href, method } });
            value = requestId;
          } else if (message.type === "background-cancel") { if (message.requestId) await removeTaskIfCurrent(key, message.requestId); else await remove(key); }
          else if (message.type === "background-list") value = (await values()).filter(value => value.kind === "task" && value.appId === app.bundleIdentifier).map(value => value.request);
        } else if (message.type === "notification-categories") {
          if (!app || !Array.isArray(message.categories) || message.categories.length > 32) throw new TypeError("Invalid notification categories.");
          const categories = message.categories.map(category => {
            if (!category.identifier || !Array.isArray(category.actions) || category.actions.length > 2) throw new TypeError("A category supports up to two actions.");
            return { identifier: category.identifier, actions: category.actions.map(action => { if (!action.identifier || !action.title) throw new TypeError("Invalid notification action."); return { identifier: action.identifier, title: action.title }; }) };
          });
          await set(`categories:${app.bundleIdentifier}`, categories);
        } else if (message.type === "share-read" || message.type === "share-ack") {
          const share = await get(`share:${message.identifier}`);
          if (!share || share.appId !== app?.bundleIdentifier) throw new TypeError("This application does not own the shared item.");
          if (message.type === "share-read") value = share;
          else await remove(`share:${message.identifier}`);
        } else throw new TypeError("Unknown system worker message.");
        event.ports[0].postMessage({ ok: true, value });
      } catch (error) { event.ports[0].postMessage({ ok: false, error: error.message }); }
    })());
  });
  self.addEventListener("sync", event => {
    if (!event.tag.startsWith("syncloudos:")) return;
    const taskKey = `task:${event.tag.slice("syncloudos:".length)}`;
    event.waitUntil((async () => {
      const task = await get(taskKey);
      if (!task) return;
      const app = appFor(task.appId);
      if (!app?.background?.enabled || !app.background.tasks?.includes(task.request.identifier)) { await remove(taskKey); return; }
      const url = new URL(task.request.url, self.location.origin);
      if (url.origin !== self.location.origin || !url.pathname.startsWith(config.base)) throw new TypeError("The task URL left the host scope.");
      const response = await fetch(url, { method: task.request.method, body: task.request.body, credentials: "same-origin", redirect: "error", headers: { "X-SynCloudOS-Task": task.requestId, "X-SynCloudOS-Task-Identifier": event.tag } });
      if (!response.ok) throw new Error(`Background task failed (${response.status}).`);
      await removeTaskIfCurrent(taskKey, task.requestId);
      for (const client of await self.clients.matchAll({ type: "window" })) client.postMessage({ type: "background-completed", appId: task.appId, identifier: task.request.identifier });
    })());
  });
  self.addEventListener("backgroundfetchsuccess", event => {
    if (!event.registration.id.startsWith("syncloudos:")) return;
    event.waitUntil((async () => {
      const cache = await caches.open(`${prefix}downloads`);
      for (const record of await event.registration.matchAll()) {
        const response = await record.responseReady;
        if (response?.ok) {
          const key = new URL(`${config.base}__syncloudos/download/${encodeURIComponent(event.registration.id)}/${encodeURIComponent(record.request.url)}`, self.location.origin);
          await cache.put(key, response);
        }
      }
      await event.updateUI({ title: "Download complete" });
    })());
  });
  self.addEventListener("backgroundfetchclick", event => event.waitUntil(self.clients.openWindow(config.base)));
  self.addEventListener("push", event => {
    event.waitUntil((async () => {
      const payload = event.data?.json();
      if (!payload) throw new TypeError("A push notification needs a payload.");
      const declaration = payload.web_push === 8030 ? payload.notification : payload;
      const url = safeURL(declaration.navigate ?? declaration.url ?? config.base);
      const app = payload.appId ? appFor(payload.appId) : apps.find(app => app.routes?.some(route => { const path = `${config.base.replace(/\/$/u, "")}${route.path}`; return url.pathname === path || url.pathname.startsWith(path.endsWith("/") ? path : `${path}/`); }));
      const appOwnsURL = app?.routes?.some(route => { const path = `${config.base.replace(/\/$/u, "")}${route.path}`; return url.pathname === path || url.pathname.startsWith(path.endsWith("/") ? path : `${path}/`); });
      if (!appOwnsURL) throw new TypeError("The notification URL is outside its application scope.");
      if (!app || !declaration.title || typeof declaration.title !== "string") throw new TypeError("The notification needs a declared app and title.");
      let categories = [];
      if (declaration.categoryIdentifier) categories = await get(`categories:${app.bundleIdentifier}`) ?? [];
      const actions = categories.find(category => category.identifier === declaration.categoryIdentifier)?.actions.map(action => ({ action: action.identifier, title: action.title })) ?? [];
      await self.registration.showNotification(declaration.title, { body: declaration.body ?? "", tag: declaration.identifier ?? "", actions, data: { appId: app.bundleIdentifier, url: url.href, identifier: declaration.identifier ?? "" } });
      const badge = declaration.app_badge ?? declaration.badge;
      if (Number.isSafeInteger(badge) && badge >= 0 && self.navigator?.setAppBadge) {
        if (badge === 0) await self.navigator.clearAppBadge(); else await self.navigator.setAppBadge(badge);
      }
      for (const client of await self.clients.matchAll({ type: "window" })) client.postMessage({ type: "notification-delivered", appId: app.bundleIdentifier, title: declaration.title, body: declaration.body ?? "", identifier: declaration.identifier ?? "", url: url.href });
    })());
  });
  self.addEventListener("notificationclick", event => {
    event.notification.close();
    event.waitUntil((async () => {
      const data = event.notification.data;
      const url = safeURL(data.url);
      url.searchParams.set("scos-notification", data.identifier ?? "");
      if (event.action) url.searchParams.set("scos-action", event.action);
      const client = (await self.clients.matchAll({ type: "window", includeUncontrolled: true })).find(client => allowedNavigation(new URL(client.url)));
      if (client) { client.postMessage({ type: "notification-open", url: url.href }); await client.focus(); } else await self.clients.openWindow(url.href);
    })());
  });
  self.addEventListener("install", event => {
    event.waitUntil(caches.open(cacheName).then(cache => cache.addAll([...assets])));
  });
  self.addEventListener("activate", event => {
    event.waitUntil((async () => {
      for (const key of await caches.keys()) if (key.startsWith(prefix) && key !== cacheName && key !== `${prefix}downloads`) await caches.delete(key);
      await self.clients.claim();
    })());
  });
  self.addEventListener("fetch", event => {
    const request = event.request;
    const url = new URL(request.url);
    const shareReceiver = apps.find(app => app.shareTarget?.method === "POST" && new URL(`${config.base.replace(/\/$/u, "")}${app.shareTarget.action}`, self.location.origin).pathname === url.pathname);
    if (request.method === "POST" && url.origin === self.location.origin && shareReceiver) {
      event.respondWith((async () => {
        const form = await request.formData(), params = shareReceiver.shareTarget.params;
        const identifier = crypto.randomUUID();
        const field = name => name ? String(form.get(name) ?? "") : undefined;
        const files = (params.files ?? []).flatMap(descriptor => form.getAll(descriptor.name).filter(value => typeof value !== "string"));
        if (files.reduce((size,file) => size + file.size,0) > 32 * 1024 * 1024) return new Response("Shared files exceed the 32 MiB limit.", { status: 413 });
        await set(`share:${identifier}`, { kind: "share", appId: shareReceiver.bundleIdentifier, createdAt: Date.now(), title: field(params.title), text: field(params.text), url: field(params.url), files });
        const destination = new URL(url); destination.searchParams.set("scos-share", identifier);
        return Response.redirect(destination.href, 303);
      })()); return;
    }
    if (request.method !== "GET" || url.origin !== self.location.origin) return;
    if (request.mode === "navigate" && allowedNavigation(url)) {
      // Only the public, build-produced shell is retained, never a signed-in HTML response.
      event.respondWith(fetch(request).catch(async () => (await caches.open(cacheName)).match(shellURL).then(response => response ?? Response.error())));
      return;
    }
    const devAsset = config.development && url.pathname.startsWith(config.base) && (["import", "raw", "url"].some(key => url.searchParams.has(key)) || /(?:\.(?:m?[jt]sx?|css|png|webp|svg|jpe?g|gif|woff2?|ttf|otf)$|\/@vite\/client|\/@react-refresh|\/@id\/[^/]+)/u.test(url.pathname)) && !/^\/(?:api|auth|__dev)(?:\/|$)/u.test(url.pathname.slice(config.base.length - 1));
    if (!assets.has(url.href) && !devAsset) return;
    event.respondWith((async () => {
      const cache = await caches.open(cacheName);
      // Vite module identities change after edits and SDK adoption. Refresh the
      // complete online graph; only immutable production assets are cache-first.
      if (config.development) {
        try {
          const response = await fetch(request);
          if (response.ok && response.type !== "opaque") await cache.put(request, response.clone());
          return response;
        } catch (error) {
          // These are same-origin static resources. Vite's Vary: Origin must
          // not split preload and font-loader requests for identical bytes.
          const cached = await cache.match(request, { ignoreVary: true });
          if (cached) return cached;
          throw error;
        }
      }
      const cached = await cache.match(request, { ignoreVary: true });
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type !== "opaque") await cache.put(request, response.clone());
      return response;
    })());
  });
}
