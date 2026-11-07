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
import { BrowserLocationAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserLocationAdapter";

describe("LocationFX speed", () => {
  it.each([0, 12.5, null])("preserves native speed %s without deriving a missing speed", async speed => {
    let deliver: PositionCallback = () => {};
    const adapter = new BrowserLocationAdapter({ isSecureContext: true, performance: { now: () => 5000 } }, {
      geolocation: { watchPosition(success) { deliver = success; return 1; }, clearWatch() {} },
    });
    const result = adapter.current({ signal: new AbortController().signal, accuracy: "balanced" });
    deliver({ timestamp: 1000, coords: { latitude: 0, longitude: 0, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed } } as GeolocationPosition);
    expect((await result).speedMetresPerSecond).toBe(speed);
  });
});
