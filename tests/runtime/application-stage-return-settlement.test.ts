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

/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { selectApplicationStageAppIds } from "../../src/Webspring/ApplicationStageLayer";

describe("ApplicationStageLayer return settlement", () => {
  it("removes the full-stage presentation when return begins so AnimatePresence owns its exit", () => {
    expect(selectApplicationStageAppIds({
      activeAppId: null,
      multiSwitch: { status: "idle" },
      returnTransitionId: "return:software:1",
    })).toEqual([]);
  });

  it("continues to select both sides of an active MultiSwitch", () => {
    expect(selectApplicationStageAppIds({
      activeAppId: "notes",
      multiSwitch: {
        status: "switching",
        fromAppId: "notes",
        toAppId: "software",
      },
      returnTransitionId: null,
    })).toEqual(["notes", "software"]);
  });
});
