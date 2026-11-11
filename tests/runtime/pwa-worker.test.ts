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

import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";
import { createServiceWorkerSource } from "../../src/SynCloudOS/InstalledApplications/serviceWorker.mjs";

function worker() {
  const listeners = new Map<string, (event: any) => void>();
  const clients: any[] = [];
  const showNotification = vi.fn(async () => {}), openWindow = vi.fn(async () => {});
  const self = { location: { origin: "https://site.test" }, addEventListener: (name: string, listener: any) => listeners.set(name, listener), registration: { showNotification }, clients: { openWindow, matchAll: async () => clients } };
  runInNewContext(createServiceWorkerSource({ base: "/", receipt: "sdk", assets: [], manifests: [{ manifest: { scope: "/" }, members: [{ bundleIdentifier: "notes", routes: [{ path: "/notes" }] }] }] }), { self, URL, Response, Request, crypto, caches: {}, indexedDB: { open() { throw new Error("No database"); } } });
  return { listeners, showNotification, openWindow, clients };
}
it("delivers both standard and declarative push through the worker and restricts navigation", async () => {
  const { listeners, showNotification } = worker();
  expect(listeners.has("push")).toBe(true);
  let pending: Promise<unknown>;
  listeners.get("push")!({ data: { json: () => ({ version: 1, appId: "notes", title: "A note", body: "Hello", url: "/notes" }) }, waitUntil: (value: Promise<unknown>) => { pending = value; } });
  await pending!;
  expect(showNotification).toHaveBeenCalledWith("A note", expect.objectContaining({ body: "Hello", data: expect.objectContaining({ url: "https://site.test/notes" }) }));
  listeners.get("push")!({ data: { json: () => ({ web_push: 8030, notification: { title: "Declarative", body: "Hello", navigate: "/notes" } }) }, waitUntil: (value: Promise<unknown>) => { pending = value; } });
  await pending!;
  expect(showNotification).toHaveBeenLastCalledWith("Declarative", expect.any(Object));
  listeners.get("push")!({ data: { json: () => ({ version: 1, appId: "notes", title: "Unsafe", url: "https://other.test/" }) }, waitUntil: (value: Promise<unknown>) => { pending = value; } });
  await expect(pending!).rejects.toThrow(/origin|scope/);
});
it("leaves API, authentication, writes and other origins out of the offline cache", () => {
  const { listeners } = worker();
  for (const [url, method, mode] of [["https://site.test/api/me", "GET", "cors"], ["https://site.test/auth/login", "GET", "navigate"], ["https://other.test/app.js", "GET", "cors"], ["https://site.test/notes", "POST", "cors"]]) {
    const respondWith = vi.fn();
    listeners.get("fetch")!({ request: { url, method, mode }, respondWith });
    expect(respondWith).not.toHaveBeenCalled();
  }
});
it.each(["https://site.test/src/main.tsx", "https://site.test/src/Localisable.strings?import&raw", "https://site.test/src/reference-fit.json?import&url", "https://site.test/src/.gitattributes?url", "https://site.test/src/Localisable.strings?raw"])("refreshes development module %s online and retains its bytes offline", async (url) => {
  const listeners = new Map<string, (event: any) => void>();
  const entries = new Map<string, Response>([[url, new Response("old graph")]]);
  const cache = { match: async (request: Request) => entries.get(request.url)?.clone(), put: async (request: Request, response: Response) => { entries.set(request.url, response); } };
  const fetch = vi.fn(async () => new Response("current graph"));
  runInNewContext(createServiceWorkerSource({ base: "/", receipt: "sdk", development: true, assets: [], manifests: [] }), {
    self: { location: { origin: "https://site.test" }, addEventListener: (name: string, listener: any) => listeners.set(name, listener) },
    URL, Response, Request, fetch, caches: { open: async () => cache },
  });
  const request = new Request(url);
  let response!: Promise<Response>;
  const load = () => { listeners.get("fetch")!({ request, respondWith(value: Promise<Response>) { response = value; } }); return response; };
  expect(await (await load()).text()).toBe("current graph");
  fetch.mockRejectedValueOnce(new TypeError("offline"));
  expect(await (await load()).text()).toBe("current graph");
});
it.each([true, false])("keeps successful online asset bytes when cache retention fails (development=%s)", async (development) => {
  const listeners = new Map<string, (event: any) => void>();
  const url = "https://site.test/app.js";
  const cache = { match: vi.fn(async () => development ? new Response("old graph") : undefined), put: vi.fn(async () => { throw new DOMException("Full", "QuotaExceededError"); }) };
  runInNewContext(createServiceWorkerSource({ base: "/", receipt: "sdk", development, assets: [url], manifests: [] }), {
    self: { location: { origin: "https://site.test" }, addEventListener: (name: string, listener: any) => listeners.set(name, listener) },
    URL, Response, Request, fetch: async () => new Response("current graph"), caches: { open: async () => cache },
  });
  let response!: Promise<Response>;
  listeners.get("fetch")!({ request: new Request(url), respondWith(value: Promise<Response>) { response = value; } });
  expect(await (await response).text()).toBe("current graph");
});
it("delivers notification actions to a live client without reloading its documents", async () => {
  const { listeners, clients } = worker();
  const postMessage = vi.fn(), navigate = vi.fn(), focus = vi.fn(async () => {});
  clients.push({ url: "https://site.test/notes", postMessage, navigate, focus });
  let pending: Promise<unknown>;
  const close = vi.fn();
  listeners.get("notificationclick")!({ notification: { close, data: { appId: "notes", url: "https://site.test/notes", identifier: "note-1" } }, action: "reply", waitUntil: (value: Promise<unknown>) => { pending = value; } });
  await pending!;
  expect(close).toHaveBeenCalledOnce();
  expect(postMessage).toHaveBeenCalledWith({ type: "notification-open", url: "https://site.test/notes?scos-notification=note-1&scos-action=reply" });
  expect(focus).toHaveBeenCalledOnce(); expect(navigate).not.toHaveBeenCalled();
});
it("keeps a replacement task when an earlier sync request finishes", async () => {
  const data = new Map<string, any>(), listeners = new Map<string, (event: any) => void>();
  const indexedDB = { open() {
    const request: any = {};
    queueMicrotask(() => {
      request.result = { transaction() {
        let pending = 0, completed = false;
        const transaction: any = {};
        const operation = (action: () => unknown) => {
          const request: any = {}; pending++;
          queueMicrotask(() => { request.result = action(); request.onsuccess?.(); pending--; queueMicrotask(() => { if (!pending && !completed) { completed = true; transaction.oncomplete?.(); } }); });
          return request;
        };
        transaction.objectStore = () => ({ get: (key: string) => operation(() => data.get(key)), put: (value: unknown, key: string) => operation(() => { data.set(key, value); }), delete: (key: string) => operation(() => { data.delete(key); }), getAll: () => operation(() => [...data.values()]) });
        return transaction;
      } };
      request.onsuccess();
    }); return request;
  } };
  let startFetch!: () => void, finishFetch!: (value: unknown) => void;
  const started = new Promise<void>(resolve => { startFetch = resolve; });
  const fetch = vi.fn(() => { startFetch(); return new Promise(resolve => { finishFetch = resolve; }); });
  runInNewContext(createServiceWorkerSource({ base: "/", receipt: "sdk", assets: [], manifests: [{ manifest: { scope: "/" }, members: [{ bundleIdentifier: "notes", background: { enabled: true, tasks: ["refresh"] } }] }] }), {
    self: { location: { origin: "https://site.test" }, addEventListener: (name: string, listener: any) => listeners.set(name, listener), clients: { matchAll: async () => [] } }, URL, crypto, indexedDB, fetch,
  });
  async function message(value: unknown) {
    let pending!: Promise<unknown>, reply: any;
    listeners.get("message")!({ data: value, ports: [{ postMessage(value: unknown) { reply = value; } }], waitUntil(value: Promise<unknown>) { pending = value; } });
    await pending; expect(reply.ok).toBe(true); return reply.value;
  }
  const submit = (body: string) => message({ type: "background-enqueue", appId: "notes", request: { identifier: "refresh", url: "/api/refresh", method: "POST", body } });
  const firstId = await submit("first");
  let first!: Promise<unknown>;
  listeners.get("sync")!({ tag: "syncloudos:notes:refresh", waitUntil(value: Promise<unknown>) { first = value; } });
  await started; await submit("second"); finishFetch({ ok: true }); await first;
  expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: "error", headers: { "X-SynCloudOS-Task": firstId } });
  expect(data.get("task:notes:refresh")?.request.body).toBe("second");
  await message({ type: "background-cancel", appId: "notes", identifier: "refresh", requestId: firstId });
  expect(data.get("task:notes:refresh")?.request.body).toBe("second");
});
