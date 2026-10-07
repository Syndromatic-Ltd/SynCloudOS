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

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import * as systemUI from "../../src/NSE/public/system-ui";
import * as namespace from "../../src/NSE/NSE";
import * as internalSystemUI from "../../src/NSE/SystemUI";

describe("public system UI boundary", () => {
  it("keeps host-specific recovery presentation outside the control API", () => {
    expect(systemUI).not.toHaveProperty("NSESystemAlert");
    expect(systemUI).not.toHaveProperty("SystemAlert");
    expect(systemUI).not.toHaveProperty("SystemAlertAssetCache");
    expect(typeof systemUI.NSEConfirmDialog).toBe("function");
  });

  it("keeps recovery composition out of the internal NSE namespace and named exports", () => {
    for (const name of ["SystemAlert", "SystemAlertAssetCache", "getSystemAlertIcon"]) {
      expect(namespace).not.toHaveProperty(name);
      expect(namespace.NSE).not.toHaveProperty(name);
    }
    expect(typeof namespace.NSE.NSEAlert).toBe("function");
  });

  it("keeps recovery composition out of the internal NSE SystemUI barrel", () => {
    for (const name of ["SystemAlert", "SystemAlertAssetCache", "getSystemAlertIcon"]) {
      expect(internalSystemUI).not.toHaveProperty(name);
    }
    expect(typeof internalSystemUI.NSEConfirmDialog).toBe("function");
  });
});
