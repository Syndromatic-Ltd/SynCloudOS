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

import { createHash, randomUUID } from "node:crypto";
import { expect, test, type Page, type TestInfo } from "playwright/test";
import type { DocumentAssetReference } from "../../src/SynCloudOS/Documents/documentAssetTypes";
import type { DocumentVersion } from "../../src/SynCloudOS/Documents/documentTypes";

interface SavedAsset {
  readonly reference: DocumentAssetReference;
  readonly leaseId: string;
  readonly version: DocumentVersion | null;
  readonly geometry: { readonly width: number; readonly height: number };
}
interface ReopenedAsset extends SavedAsset { readonly bytes: readonly number[] }
interface RuntimeDisposition { readonly disposition: string; readonly disposals: number }
interface NativeAssetsPort {
  runtimeSave(): Promise<SavedAsset & RuntimeDisposition & { readonly durable: string }>;
  runtimeReopen(): Promise<ReopenedAsset & RuntimeDisposition>;
  save(): Promise<SavedAsset>;
  reopen(): Promise<ReopenedAsset & { readonly collection: { readonly removedAssets: number; readonly removedBytes: number } }>;
  concurrentWriters(): Promise<string[]>;
  corrupt(): Promise<string>;
}
type FixtureWindow = typeof window & { assetFixture: NativeAssetsPort };

async function openFixture(page: Page, info: TestInfo) {
  const database = `native-assets-e2e-${info.project.name}-${randomUUID()}`;
  await page.goto(`/tests/e2e/fixtures/native-document-assets.html?database=${encodeURIComponent(database)}`);
  await waitForFixture(page);
}
async function waitForFixture(page: Page) {
  await page.waitForFunction(() => {
    const port = (window as Partial<FixtureWindow>).assetFixture;
    return !!port && [port.runtimeSave, port.runtimeReopen, port.save, port.reopen, port.concurrentWriters, port.corrupt].every(method => typeof method === "function");
  });
}
async function expectRenderedImage(page: Page) {
  await expect(page.getByRole("img", { name: "Saved fixture image" })).toBeVisible();
  expect(await page.locator("#asset-image").evaluate((image: HTMLImageElement) => ({ complete: image.complete, width: image.naturalWidth, height: image.naturalHeight })))
    .toEqual({ complete: true, width: 1, height: 1 });
}
function expectFreshPersistedAsset(saved: SavedAsset, reopened: ReopenedAsset) {
  expect(saved.version).not.toBeNull();
  expect(saved.reference).toMatchObject({ kind: "document-asset", mimeType: "image/png" });
  expect(saved.reference.byteLength).toBeGreaterThan(0);
  expect(reopened.reference).toEqual(saved.reference);
  expect(reopened.version).toEqual(saved.version);
  expect(reopened.leaseId).not.toBe(saved.leaseId);
  expect(reopened.bytes).toHaveLength(saved.reference.byteLength);
  expect(reopened.bytes.slice(0, 8)).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(`sha256:${createHash("sha256").update(Uint8Array.from(reopened.bytes)).digest("hex")}`).toBe(saved.reference.hash);
  expect(reopened.geometry).toEqual({ width: 1, height: 1 });
}

test("real runtime saves native assets, disposes, reloads and reopens with a fresh lease", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openFixture(page, info);
  const saved = await page.evaluate(() => (window as FixtureWindow).assetFixture.runtimeSave());
  expect(saved).toMatchObject({ geometry: { width: 1, height: 1 }, disposition: "disposed", disposals: 1, durable: "durable" });
  await expectRenderedImage(page);

  await page.reload();
  await waitForFixture(page);
  const reopened = await page.evaluate(() => (window as FixtureWindow).assetFixture.runtimeReopen());
  expectFreshPersistedAsset(saved, reopened);
  expect(reopened).toMatchObject({ disposition: "disposed", disposals: 1 });
  await expectRenderedImage(page);
  expect(errors).toEqual([]);
});

test("native asset adapter persists through reload, serializes quota writers and refuses corrupt bytes", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openFixture(page, info);
  const saved = await page.evaluate(() => (window as FixtureWindow).assetFixture.save());
  expect(saved.geometry).toEqual({ width: 1, height: 1 });
  await expectRenderedImage(page);

  await page.reload();
  await waitForFixture(page);
  const reopened = await page.evaluate(() => (window as FixtureWindow).assetFixture.reopen());
  expectFreshPersistedAsset(saved, reopened);
  expect(reopened.collection).toEqual({ removedAssets: 0, removedBytes: 0 });
  await expectRenderedImage(page);
  expect((await page.evaluate(() => (window as FixtureWindow).assetFixture.concurrentWriters())).sort()).toEqual(["asset-quota", "saved"]);
  expect(await page.evaluate(() => (window as FixtureWindow).assetFixture.corrupt())).toBe("asset-corrupt");
  expect(errors).toEqual([]);
});
