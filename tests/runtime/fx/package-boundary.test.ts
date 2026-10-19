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

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { assertReviewedPackageFiles } from "../../../scripts/synware/sdk-package-manifest.mjs";

it("admits only reviewed FX family artifacts", () => {
  expect(() => assertReviewedPackageFiles(["fx/graphics.js", "fx/motion.d.ts", "fx/haptics.js", "chunks/NSEAlert-transitions-abc123.js", "chunks/_commonjsHelpers-abc123.js", "assets/pdf.worker.min-Bsp49Cxp.js", "assets/AUFXAudioRenderRuntime-abc123.js", "assets/video-processing.worker-abc123.js"])).not.toThrow();
  for (const file of ["fx/private.js", "fx/graphics/internal.js", "fx/../host.js", "chunks/NSEAlert.transitions-abc123.js", "assets/host.js", "assets/pdf.worker.min-../../host.js", "assets/AUFXAudioRenderRuntime-../../host.js", "assets/video-processing.worker-../../host.js", "assets/AUFXAudioWorkletProcessor-old.js"]) {
    expect(() => assertReviewedPackageFiles([file])).toThrow();
  }
});

it("admits separate source maps only beside reviewed JavaScript artifacts", () => {
  expect(() => assertReviewedPackageFiles([
    "sdk.js.map", "fx/graphics.js.map", "fx/video/webm.js.map",
    "chunks/NSEAlert-transitions-abc123.js.map",
    "assets/image-processing.worker-abc123.js.map",
  ])).not.toThrow();
  for (const file of ["fx/private.js.map", "assets/host.js.map", "sdk.js.map.map", "sdk.d.ts.map", "fx/../sdk.js.map"]) {
    expect(() => assertReviewedPackageFiles([file])).toThrow();
  }
});

it("builds separate SDK maps with embedded original sources", () => {
  const source = readFileSync(resolve("scripts/synware/build-sdk.mjs"), "utf8");
  expect(source).toMatch(/sourcemap:\s*true/u);
  expect(source).toMatch(/sourcemapExcludeSources:\s*false/u);
  expect(source).not.toMatch(/file\.endsWith\("\.map"\)\s*\|\|/u);
  expect(source).toContain("map.sourcesContent");
});

it("keeps product content-service contracts out of the generic AppSDK entry", () => {
  const sdkEntry = readFileSync(resolve("src/SynCloudOS/AppSDK/sdkPackageEntry.ts"), "utf8");
  expect(sdkEntry).not.toMatch(/journal(?:Reader|Publisher|Content)|synCalCalendarServiceToken|SynCalCalendarService/u);
});

it("packages the private browser recovery worker without admitting arbitrary JavaScript assets", () => {
  expect(() => assertReviewedPackageFiles(["assets/browserResponsiveness.worker-DBPIAVzy.js"])).not.toThrow();
  for (const file of ["assets/browserResponsiveness.worker.js", "assets/browserResponsiveness.worker-../../host.js", "assets/recovery-demo-abc123.js"]) {
    expect(() => assertReviewedPackageFiles([file])).toThrow();
  }
});
