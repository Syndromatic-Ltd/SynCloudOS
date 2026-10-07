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

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, firefox, webkit } from "playwright";
import { resolve } from "node:path";
import { synWareSdkEntries, synWarePackageName } from "../../scripts/synware/sdk-entries.mjs";

let server: ViteDevServer | undefined;
let baseUrl: string;
beforeAll(async () => {
  const existingServer = process.env.DOCUMENT_ASSET_BROWSER_BASE_URL;
  if (existingServer) {
    const url = new URL(existingServer);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.protocol !== "http:" || url.pathname !== "/") throw new Error("Asset browser tests require the exact local checkout server origin.");
    baseUrl = url.href;
    return;
  }
  server = await createServer({ configFile: false, root: process.cwd(), cacheDir: "node_modules/.vite-document-assets",
    resolve: { alias: Object.entries(synWareSdkEntries).map(([entry, path]) => ({ find: new RegExp(`^${synWarePackageName}/${entry}$`), replacement: resolve(process.cwd(), path) })) },
    // Scan this fixture's graph only, so the real runtime's CommonJS dependencies
    // receive browser interop without scanning unrelated examples or products.
    optimizeDeps: { entries: ["tests/e2e/fixtures/native-document-assets.html"], include: ["pdf-lib", "@pdf-lib/fontkit", "react", "react/jsx-runtime", "react/jsx-dev-runtime"] },
    server: { host: "127.0.0.1", port: 5197 } });
  await server.listen();
  baseUrl = server.resolvedUrls!.local[0];
}, 30_000);
afterAll(async () => { await server?.close(); });

describe("genuine IndexedDB native document assets", () => {
  for (const [name, launcher] of Object.entries({ chromium, firefox, webkit })) {
    it(`${name}: creates and disposes the real runtime, then reloads and reopens native asset bytes in a fresh runtime`, async () => {
      const browser = await launcher.launch({ headless: true });
      try {
        const page = await browser.newPage();
        await page.goto(`${baseUrl}tests/e2e/fixtures/native-document-assets.html?database=kernel-assets-${name}-${crypto.randomUUID()}`);
        await page.waitForFunction(() => "assetFixture" in window);
        const saved = await page.evaluate(async () => (window as any).assetFixture.runtimeSave());
        expect(saved).toMatchObject({ geometry: { width: 1, height: 1 }, disposition: "disposed", disposals: 1, durable: "durable" });
        await page.reload(); await page.waitForFunction(() => "assetFixture" in window);
        const reopened = await page.evaluate(async () => (window as any).assetFixture.runtimeReopen());
        expect(reopened).toMatchObject({ reference: saved.reference, version: saved.version, geometry: { width: 1, height: 1 }, disposition: "disposed", disposals: 1 });
        expect(reopened.leaseId).not.toBe(saved.leaseId);
        expect(reopened.bytes.length).toBe(saved.reference.byteLength);
      } finally { await browser.close(); }
    }, 60_000);
    it(`${name}: survives page reload with new store/service instances, renders bytes, enforces concurrent quota, detects corruption`, async () => {
      const browser = await launcher.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const url = `${baseUrl}tests/e2e/fixtures/native-document-assets.html?database=assets-${name}-${crypto.randomUUID()}`;
        await page.goto(url);
        await page.waitForFunction(() => "assetFixture" in window);
        const saved = await page.evaluate(async () => (window as any).assetFixture.save());
        expect(saved.geometry).toEqual({ width: 1, height: 1 });
        await page.reload();
        await page.waitForFunction(() => "assetFixture" in window);
        const reopened = await page.evaluate(async () => (window as any).assetFixture.reopen());
        expect(reopened.reference).toEqual(saved.reference);
        expect(reopened.leaseId).not.toBe(saved.leaseId);
        expect(reopened.version).toEqual(saved.version);
        expect(reopened.bytes.length).toBe(saved.reference.byteLength);
        expect(reopened.geometry).toEqual({ width: 1, height: 1 });
        expect(reopened.collection).toEqual({ removedAssets: 0, removedBytes: 0 });
        expect((await page.evaluate(async () => (window as any).assetFixture.concurrentWriters())).sort()).toEqual(["asset-quota", "saved"]);
        expect(await page.evaluate(async () => (window as any).assetFixture.corrupt())).toBe("asset-corrupt");
      } finally { await browser.close(); }
    }, 45_000);
  }
});
