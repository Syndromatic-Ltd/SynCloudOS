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

import { expect, it, vi } from "vitest";
import { createBrowserBackgroundTaskScheduler } from "../../src/SynCloudOS/PlatformAdapters/BrowserBackgroundTaskScheduler";
import { createBrowserRemoteNotifications } from "../../src/SynCloudOS/PlatformAdapters/BrowserRemoteNotifications";
import { NSEDockTile } from "../../src/NSE/Application/NSEDockTile";
import { DocumentController, InMemoryDocumentAdapter } from "../../src/SynCloudOS/Documents";
import { createDocumentTestDependencies } from "../fixtures/documentTestDependencies";
import { noteType } from "../fixtures/noteDocumentType";

it("refuses undeclared background tasks before contacting the worker", async () => {
  const getRegistration = vi.fn();
  const scheduler = createBrowserBackgroundTaskScheduler({ serviceWorker: { getRegistration } } as unknown as Navigator, "notes", ["refresh"], new AbortController().signal);
  await expect(scheduler.submit({ identifier: "undeclared", url: "/api/refresh" })).rejects.toMatchObject({ name: "SecurityError" });
  expect(getRegistration).not.toHaveBeenCalled();
  const abort = new AbortController(); abort.abort();
  const ended = createBrowserBackgroundTaskScheduler({} as Navigator, "notes", ["refresh"], abort.signal);
  await expect(ended.submit({ identifier: "refresh", url: "/api/refresh" })).rejects.toMatchObject({ name: "AbortError" });
});
it("reports unavailable background APIs without scheduling work", async () => {
  const scheduler = createBrowserBackgroundTaskScheduler({} as Navigator, "notes", ["refresh"], new AbortController().signal);
  await expect(scheduler.capabilities()).resolves.toEqual({ backgroundSync: false, backgroundFetch: false });
  await expect(scheduler.submit({ identifier: "refresh", url: "/api/refresh" })).rejects.toMatchObject({ name: "NotSupportedError" });
});
it("reads completed downloads only through the declared app/task namespace", async () => {
  const match = vi.fn(async () => new Response("downloaded", { headers: { "Content-Type": "text/plain" } }));
  const open = vi.fn(async () => ({ match }));
  const navigator = { serviceWorker: { getRegistration: async () => ({ scope: "https://site.test/product/", active: {} }) } } as unknown as Navigator;
  const scheduler = createBrowserBackgroundTaskScheduler(navigator, "notes", ["download"], new AbortController().signal, { open } as unknown as CacheStorage);
  const result = await scheduler.downloadedData("download", "/product/file.txt");
  expect(new TextDecoder().decode(result!.data.bytes)).toBe("downloaded");
  expect(result!.mimeType).toBe("text/plain");
  expect(open).toHaveBeenCalledWith("syncloudos:/product/:downloads");
  expect(String(match.mock.calls[0][0])).toContain("syncloudos%3Anotes%3Adownload");
  await expect(scheduler.downloadedData("other", "/product/file.txt")).rejects.toMatchObject({ name: "SecurityError" });
});
it("requires configured owner push keys and keeps remote registration on the site origin", async () => {
  const browser = { navigator: {}, location: { href: "https://site.test/", origin: "https://site.test" }, Notification: { permission: "granted" } } as unknown as Window;
  const unconfigured = createBrowserRemoteNotifications(browser, "notes", undefined, new AbortController().signal);
  await expect(unconfigured.registerForRemoteNotifications()).rejects.toMatchObject({ name: "NotSupportedError" });
  const crossOrigin = createBrowserRemoteNotifications(browser, "notes", { applicationServerKey: "no-key", subscriptionURL: "https://other.test/push" }, new AbortController().signal);
  await expect(crossOrigin.registerForRemoteNotifications()).rejects.toMatchObject({ name: "SecurityError" });
});
it("reports the per-app notification decision when browser permission is already granted", async () => {
  const browser = { navigator: {}, location: { href: "https://site.test/", origin: "https://site.test" }, Notification: { permission: "granted" } } as unknown as Window;
  const notifications = createBrowserRemoteNotifications(browser, "notes", undefined, new AbortController().signal, {
    require: () => {}, request: async () => false, observe: () => "denied", requireRemoteRegistration: () => { throw new DOMException("App consent is required.", "NotAllowedError"); },
  });
  await expect(notifications.getNotificationSettings()).resolves.toMatchObject({ authorizationStatus: "denied" });
});
it("keeps Dock labels under application ownership and validates updates", () => {
  const update = vi.fn(), tile = new NSEDockTile(update);
  tile.badgeLabel = "Ready"; tile.badgeLabel = "Ready";
  expect(update).toHaveBeenCalledOnce(); expect(tile.badgeLabel).toBe("Ready");
  expect(() => { tile.badgeLabel = "x".repeat(65); }).toThrow(TypeError);
  tile.badgeLabel = ""; expect(update).toHaveBeenLastCalledWith("");
});
it("opens incoming file bytes with the registered document reader", async () => {
  const dependencies = createDocumentTestDependencies(), controller = new DocumentController(dependencies);
  controller.registerAdapter(new InMemoryDocumentAdapter(dependencies.environment));
  const read = vi.fn(async (data) => ({ title: "Incoming", body: new TextDecoder().decode(data.bytes) }));
  controller.registerType({ ...noteType, readFromData: read });
  try {
    const document = await controller.openDocument({ typeId: noteType.id, applicationId: "com.example.notes", withContentsOf: new Blob(["hello"]) });
    expect(read).toHaveBeenCalledOnce(); expect(document.model).toMatchObject({ title: "Incoming", body: "hello" });
    expect(document.location).toBeNull();
  } finally { await dependencies.cleanup(); }
});
