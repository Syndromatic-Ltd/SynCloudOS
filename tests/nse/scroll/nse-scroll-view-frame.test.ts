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
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("NSEScrollView as a view controller's view", () => {
  // jsdom does not lay out, so the guarantee is the stylesheet's: a scroll view sized
  // to its own content inside a clipped view controller frame has no scroll range.
  it("fills the frame its view controller is given", () => {
    const css = readFileSync(resolve(process.cwd(), "src/NSE/Scroll/scroll.css"), "utf8");
    expect(css).toMatch(/\[data-nse-view-controller\] > \.nse-scroll-view-frame:only-child \{\s*block-size: 100%;\s*\}/u);
  });
});
