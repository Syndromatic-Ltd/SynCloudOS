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
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { syntheticSensorDNG } from "../fixtures/fx/synthetic-sensor-dng";

test("browser develops the declared Bayer DNG sensor plane instead of its preview", async ({ page, browserName }) => {
  await page.goto("/");
  const bytes = Array.from(syntheticSensorDNG());
  const result = await page.evaluate(async sensorBytes => {
    const { IFXRAWFilter } = await import("/src/FX/ImageFX/public.ts");
    const filter = new IFXRAWFilter(Uint8Array.from(sensorBytes));
    const developed = await filter.develop({ exposureEV: 1 });
    return {
      model: filter.metadata.cameraModel,
      cfa: filter.metadata.cfaPattern,
      source: developed.provenance.source,
      previewUsed: developed.provenance.embeddedPreviewUsed,
      orientationApplied: developed.provenance.orientationApplied,
      size: [developed.image.descriptor.width, developed.image.descriptor.height],
      pixel: developed.image.pixel(0, 0),
    };
  }, bytes);

  const receipt = resolve(process.cwd(), `.artifacts/expanded-fx/fx15/raw-browser-${browserName}.json`);
  mkdirSync(resolve(receipt, ".."), { recursive: true });
  writeFileSync(receipt, JSON.stringify({ browserName, fixture: "synthetic-bayer-dng", ...result }, null, 2) + "\n");
  expect(result.model).toBe("SynCloudOS Synthetic Bayer DNG");
  expect(result.cfa).toBe("rggb");
  expect(result.source).toBe("sensor-plane");
  expect(result.previewUsed).toBe(false);
  expect(result.orientationApplied).toBe(true);
  expect(result.size).toEqual([2, 4]);
  expect(result.pixel.r).toBeGreaterThan(0.3);
});
