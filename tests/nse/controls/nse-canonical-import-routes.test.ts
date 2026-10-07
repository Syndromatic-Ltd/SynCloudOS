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

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { NSE } from "../../../src/NSE/NSE";
import { NSESearchField as CanonicalSearchField } from "../../../src/NSE/Controls/Fields";
import { NSESlider as CanonicalSlider } from "../../../src/NSE/Controls/Values";

const publicPreferencesSource = readFileSync(new URL("../../../src/SynCloudOS/Preferences/index.ts", import.meta.url), "utf8");
const publicSynCloudOSSource = readFileSync(new URL("../../../src/SynCloudOS/SynCloudOS.ts", import.meta.url), "utf8");

describe("canonical public control routes", () => {
  it("keeps system preference-pane mutation absent from app-visible public barrels", () => {
    expect(publicPreferencesSource).not.toContain("registerSystemPreferencePane");
    expect(publicSynCloudOSSource).not.toContain("registerSystemPreferencePane");
  });
  it("routes the NSE namespace and semantic slider owner to one implementation", () => {
    expect(NSE.NSESlider).toBe(CanonicalSlider);
  });

  it("routes the NSE namespace and semantic search owner to one implementation", () => {
    expect(NSE.NSESearchField).toBe(CanonicalSearchField);
  });
});
