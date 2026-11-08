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

import { expect, it } from "vitest";
import { assertFxRuntimeEntry, createSdkPublicTypeProbe } from "../../../scripts/synware/installed-consumer.mjs";
import { assertReviewedPackageFiles } from "../../../scripts/synware/sdk-package-manifest.mjs";

it("rejects omitted implementations in every reviewed runtime entry", () => {
  expect(() => assertFxRuntimeEntry("bluetooth", {})).toThrow(/Empty FX runtime entry/);
  expect(() => assertFxRuntimeEntry("speech", {})).toThrow(/Empty FX runtime entry/);
  expect(() => assertFxRuntimeEntry("network", {})).toThrow(/Empty FX runtime entry/);
  expect(() => assertFxRuntimeEntry("audio", {})).toThrow(/Empty FX runtime entry/);
  expect(() => assertFxRuntimeEntry("private", { accidental: true })).toThrow(/Unknown FX family/);
  expect(() => assertFxRuntimeEntry("xr", { XRFXConfiguration: class {} })).not.toThrow();
});

it("requires real Bluetooth and Speech constructors in the strict installed probe", () => {
  const probe = createSdkPublicTypeProbe();
  expect(probe).toContain('import { BTFXCentralManager } from "@syndromatic/syncloudos/fx/bluetooth";');
  expect(probe).toContain('import { SPFXSpeechRecognizer } from "@syndromatic/syncloudos/fx/speech";');
  expect(probe).toContain("new BTFXCentralManager()");
  expect(probe).toContain("new SPFXSpeechRecognizer()");
});

it("admits the registered shared FX artifacts without allowing extra format or style entries", () => {
  for (const family of ["bluetooth", "nfc", "speech", "contacts", "pass", "xr", "network", "crypto"]) {
    expect(() => assertReviewedPackageFiles([`fx/${family}.js`, `fx/${family}.d.ts`])).not.toThrow();
    expect(() => assertReviewedPackageFiles([`fx/${family}.css`])).toThrow();
    expect(() => assertReviewedPackageFiles([`fx/${family}/private.js`])).toThrow();
  }
});
