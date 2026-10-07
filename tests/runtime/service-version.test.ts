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
import { compareServiceVersions, serviceVersionAtLeast, strongerServiceVersion } from "../../src/SynCloudOS/SynCloudOS";

describe("service-version SemVer precedence", () => {
  it("compares arbitrarily large core and numeric prerelease identifiers exactly", () => {
    const lowerCore = "9007199254740992.0.0";
    const higherCore = "9007199254740993.0.0";
    const lowerPrerelease = "1.0.0-beta.9007199254740992";
    const higherPrerelease = "1.0.0-beta.9007199254740993";

    expect(compareServiceVersions(higherCore, lowerCore)).toBe(1);
    expect(compareServiceVersions(lowerCore, higherCore)).toBe(-1);
    expect(compareServiceVersions(higherPrerelease, lowerPrerelease)).toBe(1);
    expect(compareServiceVersions(lowerPrerelease, higherPrerelease)).toBe(-1);
    expect(compareServiceVersions(higherCore, higherCore)).toBe(0);
    expect(serviceVersionAtLeast(higherCore, lowerCore)).toBe(true);
    expect(serviceVersionAtLeast(lowerPrerelease, higherPrerelease)).toBe(false);
    expect(strongerServiceVersion(lowerCore, higherCore)).toBe(higherCore);
    expect(strongerServiceVersion(lowerPrerelease, higherPrerelease)).toBe(higherPrerelease);
  });
});
