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

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "playwright/test";

test("TextFX multilingual geometry renders fixed-font output in real browsers", async ({ page, browserName }, testInfo) => {
  const requests: string[] = [];
  const pageErrors: string[] = [];
  page.on("request", request => requests.push(request.url()));
  page.on("pageerror", error => pageErrors.push(error.stack ?? error.message));
  await page.goto("/tests/e2e/fixtures/fx-text-multilingual-browser.html");
  await page.waitForFunction(() => (window as typeof window & { fx16Specimen?: { state?: string } }).fx16Specimen?.state !== "running");
  const execution = await page.evaluate(() => (window as typeof window & {
    fx16Specimen?: { state: "passed"; result: Record<string, unknown> } | { state: "failed"; error: string };
  }).fx16Specimen);
  expect(execution?.state, execution?.state === "failed" ? execution.error : pageErrors.join("\n")).toBe("passed");
  if (!execution || execution.state !== "passed") return;
  expect(pageErrors, `${browserName} uncaught page errors`).toEqual([]);
  const result = execution.result as {
    unicodeVersion: string;
    orientations: { han: string; latin: string };
    verticalPresentations: Array<string | null>;
    combinedText: string | null;
    combinedAdvance: number | null;
    combinedScale: number | null;
    combinedCaretSpan: number;
    fallbackSizes: number[];
    mixedAscent: number;
    primaryAscent: number;
    strictBreak: number;
    looseBreak: number;
    verticalOutlineCount: number;
    mixedOutlineCount: number;
    combinedOutlineCount: number;
    rubyPositions: string[];
    rubyFontSizes: number[];
    rubyContained: boolean;
    rubyCaretSpan: number;
    rubyOutlinePositions: string[];
    rtlRubyPositions: string[];
    verticalRubyPositions: string[];
    rubyOutlineCount: number;
    rtlRubyOutlineCount: number;
    verticalRubyOutlineCount: number;
    selectionText: string;
    semanticLabel: string | null;
  };
  expect(result.unicodeVersion).toMatch(/^17\./u);
  expect(result.orientations).toEqual({ han: "upright", latin: "sideways" });
  expect(result.verticalPresentations).toEqual(["upright", "combined", "upright"]);
  expect(result.combinedText).toBe("12");
  expect(result.combinedAdvance).toBe(20);
  expect(result.combinedScale).toBeGreaterThan(0);
  expect(result.combinedScale).toBeLessThanOrEqual(1);
  expect(result.combinedCaretSpan).toBeCloseTo(20, 6);
  expect(result.fallbackSizes).toEqual([14, 24, 28]);
  expect(result.mixedAscent).toBeGreaterThan(result.primaryAscent);
  expect(result.strictBreak).toBe(2);
  expect(result.looseBreak).toBe(1);
  expect(result.verticalOutlineCount).toBeGreaterThan(0);
  expect(result.mixedOutlineCount).toBeGreaterThan(0);
  expect(result.combinedOutlineCount).toBeGreaterThan(0);
  expect(result.rubyPositions).toEqual(["before", "after", "interCharacter", "inline"]);
  expect(result.rubyFontSizes).toEqual([14, 14, 14, 14]);
  expect(result.rubyContained).toBe(true);
  expect(result.rubyCaretSpan).toBeGreaterThan(0);
  expect(result.rubyOutlinePositions).toEqual(["before", "after", "interCharacter", "inline"]);
  expect(result.rtlRubyPositions).toEqual(["before", "after", "interCharacter", "inline"]);
  expect(result.verticalRubyPositions).toEqual(["before", "after"]);
  expect(result.rubyOutlineCount).toBeGreaterThan(0);
  expect(result.rtlRubyOutlineCount).toBeGreaterThan(0);
  expect(result.verticalRubyOutlineCount).toBeGreaterThan(0);
  expect(result.selectionText).toBe("日");
  expect(result.semanticLabel).toBe("Japanese base 日 with ruby before, after, inter-character and inline");
  await expect(page.getByLabel("Japanese base 日 with ruby before, after, inter-character and inline")).toBeVisible();
  expect(requests.some(url => /harfbuzz(?:-[A-Za-z0-9_-]+)?\.wasm(?:\?|$)/u.test(url)), `${browserName} HarfBuzz WASM request`).toBe(true);

  const artifactDirectory = resolve(process.cwd(), ".artifacts", "expanded-fx", "fx16");
  mkdirSync(artifactDirectory, { recursive: true });
  await page.screenshot({ path: resolve(artifactDirectory, `${testInfo.project.name}.png`), fullPage: true });
  const fx17ArtifactDirectory = resolve(process.cwd(), ".artifacts", "expanded-fx", "fx17");
  mkdirSync(fx17ArtifactDirectory, { recursive: true });
  await page.screenshot({ path: resolve(fx17ArtifactDirectory, `${testInfo.project.name}.png`), fullPage: true });
});
