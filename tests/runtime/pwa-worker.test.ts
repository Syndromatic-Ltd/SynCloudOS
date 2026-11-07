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
  const showNotification = vi.fn(async () => {}), openWindow = vi.fn(async () => {});
  const self = { location: { origin: "https://site.test" }, addEventListener: (name: string, listener: any) => listeners.set(name, listener), registration: { showNotification }, clients: { openWindow, matchAll: async () => [] } };
  runInNewContext(createServiceWorkerSource({ base: "/", receipt: "sdk", assets: [], manifests: [{ manifest: { scope: "/" }, members: [{ bundleIdentifier: "notes", routes: [{ path: "/notes" }] }] }] }), { self, URL, Response, Request, crypto, caches: {}, indexedDB: { open() { throw new Error("No database"); } } });
  return { listeners, showNotification, openWindow };
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
