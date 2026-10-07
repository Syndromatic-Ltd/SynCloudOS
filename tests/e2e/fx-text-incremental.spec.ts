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

test("TextFX bounded layout cache executes in real browsers", async ({ page }) => {
  await page.goto("/tests/e2e/fixtures/fx-text-incremental-browser.html");
  const result = await page.evaluate(async () => {
    const { TFXLayoutCache, TFXTextContainer } = await import("/src/FX/TextFX/public.ts");
    const cache = new TFXLayoutCache({ maximumBytes: 4096, maximumEntries: 4 });
    const container = new TFXTextContainer({ size: { width: 120, height: 40 } });
    const value = Object.freeze({ fragments: Object.freeze([]), laidOutRange: Object.freeze({ location: 0, length: 0 }), truncated: false });
    const key = {
      revision: 1,
      attributedRevision: 0,
      fontGeneration: 0,
      text: "",
      font: { families: ["Prelude"], size: 16, weight: 400, style: "normal" as const, stretch: "normal" as const },
      locale: "en-GB",
      direction: "ltr" as const,
      containers: [container],
    };
    cache.store(key, value);
    const identity = cache.lookup(key) === value;
    const liveBytes = cache.diagnostics().liveBytes;
    cache.dispose();
    return { identity, liveBytes, disposed: cache.diagnostics().disposed };
  });
  expect(result.identity).toBe(true);
  expect(result.liveBytes).toBeGreaterThan(0);
  expect(result.disposed).toBe(true);
});
