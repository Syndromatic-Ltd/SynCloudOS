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
import { createNSEShapedTextWindows, NSEUnsupportedShapedTextError } from "../../src/NSE/TextLayout/shapedTextWindows";
describe("paragraph-context shaping windows", () => {
  it("maps over 100000 UTF16 units without splitting emoji, combining clusters or bidi paragraphs", () => {
    const paragraph = "office e\u0301 👩‍👩‍👧‍👦 العربية אבג\r\n";
    const text = paragraph.repeat(4000);
    expect(text.length).toBeGreaterThan(100000);
    const windows = createNSEShapedTextWindows(text);
    expect(windows.map(window => window.text).join("")).toBe(text);
    for (let index = 0; index < windows.length; index++) {
      const window = windows[index]!;
      expect(window.text.length).toBeLessThanOrEqual(65536);
      expect(window.start).toBe(index ? windows[index - 1]!.end : 0);
      expect(window.text).toBe(text.slice(window.start, window.end));
      expect(window.text.endsWith("\r\n")).toBe(true);
    }
  });
  it("rejects huge individual paragraphs and treats U2028 as a line break inside context", () => {
    expect(() => createNSEShapedTextWindows("a".repeat(65537))).toThrow(NSEUnsupportedShapedTextError);
    expect(() => createNSEShapedTextWindows("a\u2028b", 2)).toThrow(/paragraph/);
    expect(createNSEShapedTextWindows("a\r\nb\u2029c", 3).map(window => window.text)).toEqual(["a\r\n", "b\u2029c"]);
    expect(createNSEShapedTextWindows("")).toEqual([{ start: 0, end: 0, text: "" }]);
  });
});
