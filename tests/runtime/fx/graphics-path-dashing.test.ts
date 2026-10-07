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
import { GFXMutablePath } from "../../../src/FX/GraphicsFX/GFXPath";

describe("GFXPath dashing", () => {
  it("ends a dash whose floating-point residue can no longer advance the cursor", () => {
    const path = new GFXMutablePath()
      .move({ x: 0, y: 0 }).line({ x: 97.3, y: 0 }).line({ x: 97.3, y: 61.1 }).close()
      .copy();
    const spacing = path.length() / 128;
    const dash = Math.min(0.01, spacing / 4);
    expect(() => path.dashed([dash, spacing - dash])).not.toThrow();
    expect(path.dashed([dash, spacing - dash]).commands.filter((command) => command.kind === "move").length)
      .toBeGreaterThanOrEqual(127);
  });
});
