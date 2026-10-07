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

import { expect, test } from "playwright/test";

test("GraphicsFX emits searchable multilingual PDF structure in real browsers", async ({ page, browserName }) => {
  test.skip(
    browserName === "firefox" && process.platform === "win32",
    "Playwright Firefox headless SWGL fails to map the default framebuffer in the Windows evidence environment.",
  );
  const requests: string[] = [];
  const pageErrors: string[] = [];
  page.on("request", request => requests.push(request.url()));
  page.on("pageerror", error => pageErrors.push(error.stack ?? error.message));
  await page.goto("/tests/e2e/fixtures/fx-pdf-structure-browser.html");
  await page.waitForFunction(() => (window as typeof window & { fx09Specimen?: { state?: string } }).fx09Specimen?.state !== "running");
  const execution = await page.evaluate(() => (window as typeof window & {
    fx09Specimen?: { state: "passed"; result: Record<string, unknown> } | { state: "failed"; error: string };
  }).fx09Specimen);
  expect(execution?.state, execution?.state === "failed" ? execution.error : pageErrors.join("\n")).toBe("passed");
  if (!execution || execution.state !== "passed") return;
  expect(pageErrors, `${browserName} uncaught page/worker errors`).toEqual([]);
  const result = execution.result as {
    title: string;
    pageCount: number;
    objectCount: number;
    extracted: string;
    outlineTitle: string | null;
    linkUrl: string | null;
    hasBDC: boolean;
    hasEMC: boolean;
  };

  expect(result.title).toBe("FX-09 browser specimen");
  expect(result.pageCount).toBe(1);
  expect(result.objectCount).toBeGreaterThan(0);
  expect(result.extracted).toContain("office");
  expect(result.extracted).toContain("مرحبا");
  expect(result.extracted).toContain("नमस्ते");
  expect(result.outlineTitle).toBe("Introduction");
  expect(result.linkUrl).toBe("https://example.test/read");
  expect(result.hasBDC).toBe(true);
  expect(result.hasEMC).toBe(true);
  expect(requests.some(url => /harfbuzz(?:-[A-Za-z0-9_-]+)?\.wasm(?:\?|$)/u.test(url)), `${browserName} HarfBuzz WASM request`).toBe(true);
  expect(requests.some(url => /pdf-document\.worker/u.test(url)), `${browserName} isolated PDF worker request`).toBe(true);
});
