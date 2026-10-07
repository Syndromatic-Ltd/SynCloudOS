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
import { createWebspringAppMenuModel } from "../../src/Webspring/webspringAppMenu";

const labels = { label: "SynCal", about: "About SynCal", preferences: "Preferences", logOut: "Log Out" };

describe("Webspring application menu model", () => {
  it("always exposes system Preferences and omits an app placeholder", () => {
    const model = createWebspringAppMenuModel({ appId: "plain", labels });
    const commands = model.entries.filter((entry) => entry.kind === "command");
    expect(commands.map((entry) => entry.id)).toEqual(["about", "preferences", "log-out"]);
    expect(commands.find((entry) => entry.id === "preferences")).toMatchObject({ commandId: "system.showPreferences" });
  });

  it("keeps app-owned and system Preferences as independent commands", () => {
    const model = createWebspringAppMenuModel({
      appId: "syncal",
      labels,
      appPreferences: { commandId: "syncal.showPreferences", label: "SynCal Preferences…" },
    });
    const commands = model.entries.filter((entry) => entry.kind === "command");
    expect(commands.map((entry) => [entry.id, entry.commandId, entry.labelOverride])).toEqual([
      ["about", "application.showAbout", "About SynCal"],
      ["app-preferences", "syncal.showPreferences", "SynCal Preferences…"],
      ["preferences", "system.showPreferences", "Preferences"],
      ["log-out", "session.requestLogOut", "Log Out"],
    ]);
  });

  it("omits the session separator and logout action for an anonymous public app", () => {
    const model = createWebspringAppMenuModel({ appId: "public", labels, includeLogOut: false });
    expect(model.entries.map((entry) => entry.id)).toEqual(["about", "preferences"]);
  });
});
