// @vitest-environment jsdom
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
import { BrowserInstalledApplicationAdapter } from "../../src/SynCloudOS/PlatformAdapters/BrowserInstalledApplicationAdapter";

it("registers one receipt worker, requests persistence only when installed and releases listeners", async () => {
  const register = vi.fn(async () => ({ scope: "https://example.test/" }));
  const persist = vi.fn(async () => true);
  const adapter = new BrowserInstalledApplicationAdapter(window, { serviceWorker: { register }, storage: { persist } } as unknown as Navigator,
    { base: "/", receipt: "receipt", manifests: [] });
  await adapter.start();
  expect(register).toHaveBeenCalledWith("/syncloudos-sw.js", { scope: "/", updateViaCache: "none" });
  expect(persist).not.toHaveBeenCalled();
  window.dispatchEvent(new Event("appinstalled"));
  await vi.waitFor(() => expect(persist).toHaveBeenCalledOnce());
  expect(adapter.getSnapshot().installed).toBe(true);
  adapter.dispose();
  window.dispatchEvent(new Event("appinstalled"));
  expect(persist).toHaveBeenCalledOnce();
});

it("offers installation only after the browser supplies a prompt and records decline", async () => {
  const adapter = new BrowserInstalledApplicationAdapter(window, {} as Navigator, { base: "/", receipt: "receipt", manifests: [] });
  await adapter.start();
  expect(adapter.getSnapshot().canInstall).toBe(false);
  const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt: vi.fn(async () => {}), userChoice: Promise.resolve({ outcome: "dismissed" }) });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(adapter.getSnapshot().canInstall).toBe(true);
  await expect(adapter.install()).resolves.toBe("dismissed");
  expect(adapter.getSnapshot().canInstall).toBe(false);
  adapter.dispose();
});
it("selects the app manifest from the live route in an SPA production document", async () => {
  document.querySelectorAll('link[rel="manifest"]').forEach(node => node.remove());
  const record = (id: string, scope: string) => ({ bundleIdentifier: id, fileName: `${id}.webmanifest`, manifest: { scope, start_url: scope, name: id }, members: [] });
  const adapter = new BrowserInstalledApplicationAdapter(window, {} as Navigator, { base: "/product/", receipt: "receipt", manifests: [record("desktop", "/product/"), record("notes", "/product/notes")] });
  adapter.updateManifest("/product/notes");
  expect(document.querySelector('link[rel="manifest"]')?.getAttribute("href")).toBe("/product/notes.webmanifest");
  adapter.updateManifest("/product/other");
  expect(document.querySelector('link[rel="manifest"]')?.getAttribute("href")).toBe("/product/desktop.webmanifest");
  adapter.dispose();
  document.querySelectorAll('link[rel="manifest"]').forEach(node => node.remove());
  const onlyApp = new BrowserInstalledApplicationAdapter(window, {} as Navigator, { base: "/product/", receipt: "receipt", manifests: [record("notes", "/product/notes")] });
  onlyApp.updateManifest("/product/notes");
  expect(document.querySelector('link[rel="manifest"]')).not.toBeNull();
  onlyApp.updateManifest("/product/elsewhere");
  expect(document.querySelector('link[rel="manifest"]')).toBeNull();
  onlyApp.dispose();
});
