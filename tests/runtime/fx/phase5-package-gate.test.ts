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

it("accepts the reviewed type-only runtime entries while rejecting omitted implementations", () => {
  expect(() => assertFxRuntimeEntry("bluetooth", {})).not.toThrow();
  expect(() => assertFxRuntimeEntry("speech", {})).not.toThrow();
  expect(() => assertFxRuntimeEntry("audio", {})).toThrow(/Empty FX runtime entry/);
  expect(() => assertFxRuntimeEntry("private", { accidental: true })).toThrow(/Unknown FX family/);
  expect(() => assertFxRuntimeEntry("xr", { XRFXConfiguration: class {} })).not.toThrow();
});

it("requires useful declarations for the two type-only families in the strict installed probe", () => {
  const probe = createSdkPublicTypeProbe();
  expect(probe).toContain('import type { BTFXCentralManager } from "@syndromatic/syncloudos/fx/bluetooth";');
  expect(probe).toContain('import type { SPFXSpeechRecognizer } from "@syndromatic/syncloudos/fx/speech";');
  expect(probe).toContain("app.bluetooth.createCentralManager()");
  expect(probe).toContain("app.speech.createRecognizer()");
});
