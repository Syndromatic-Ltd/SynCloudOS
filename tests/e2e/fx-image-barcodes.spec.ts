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

test("ImageFX Aztec, PDF417 and Data Matrix execute and independently decode in real browsers", async ({ page }) => {
  await page.goto("/tests/e2e/fixtures/fx-image-barcodes-browser.html");
  const result = await page.evaluate(async () => {
    const specimen = await import("/tests/e2e/fixtures/fx-image-barcodes-browser.ts");
    return specimen.runBarcodeBrowserSpecimen();
  });

  // The reviewed Aztec, PDF417 and Data Matrix generators extend the 200-filter catalogue.
  expect(result.registryCount).toBe(203);
  expect(result.registryNames).toEqual(expect.arrayContaining([
    "aztecCodeGenerator", "pdf417BarcodeGenerator", "dataMatrixCodeGenerator",
  ]));
  expect(result.aztec).toBe("SynCloudOS browser Aztec");
  expect(result.pdf417).toBe("SynCloudOS browser PDF417");
  expect(result.dataMatrix).toBe("SynCloudOS DM");
  expect(result.aztecExtent.kind).toBe("finite");
  expect(result.pdf417Extent.kind).toBe("finite");
  expect(result.dataMatrixExtent.kind).toBe("finite");
  expect(result.descriptor).toMatchObject({
    kind: "aztec",
    schemaVersion: 1,
    encoding: "binary-bytes",
    correctionLevel: 23,
    layers: 3,
    compactStyle: true,
    quietSpace: 2,
  });
});
