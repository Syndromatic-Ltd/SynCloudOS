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

import { describe, expect, it, vi } from "vitest";
import { normaliseTextShadow as portableShadow } from "../../src/NSE/Text/textAttributes";
import { cssForTextShadow, normaliseTextAttributesMutation, normaliseTextShadow } from "../../src/NSE/Typography/typographyTypes";

describe("one portable typography shadow contract", () => {
  it("reexports the portable normalizer with the same four fields and bounds", () => {
    expect(normaliseTextShadow).toBe(portableShadow);
    const shadow = { colour: "#AABBCC80", blur: 64, offsetX: -64, offsetY: 64 };
    expect(normaliseTextShadow(shadow)).toEqual({ ...shadow, colour: "#aabbcc80" });
    expect(Object.isFrozen(normaliseTextShadow(shadow))).toBe(true);
    expect(cssForTextShadow(normaliseTextShadow(shadow))).toBe("-64px 64px 64px #aabbcc80");
    expect(normaliseTextAttributesMutation({ shadow })).toEqual({ shadow: portableShadow(shadow) });
    expect(normaliseTextAttributesMutation({ shadow: null })).toEqual({ shadow: null });
  });
  it.each([{ blur: -1 }, { blur: 64.001 }, { offsetX: -64.001 }, { offsetY: 64.001 }, { blur: NaN }, { offsetX: Infinity }, { colour: "red" }, { colour: null }])("rejects the same invalid shadow value %j", (patch) => {
    const shadow = { colour: "#123456", blur: 0, offsetX: 0, offsetY: 0, ...patch };
    expect(() => normaliseTextShadow(shadow)).toThrow(TypeError);
    expect(() => portableShadow(shadow)).toThrow(TypeError);
  });
  it("rejects accessors without invocation and malformed non-JSON intent", () => {
    const getter = vi.fn(() => "#123456");
    const shadow = { blur: 0, offsetX: 0, offsetY: 0 };
    Object.defineProperty(shadow, "colour", { enumerable: true, get: getter });
    expect(() => normaliseTextShadow(shadow)).toThrow(TypeError);
    expect(getter).not.toHaveBeenCalled();
    expect(() => normaliseTextShadow({ colour: "#123456", blur: 0, offsetX: -0, offsetY: 0 })).toThrow(TypeError);
    const hidden = Object.defineProperty({ colour: "#123456", blur: 0, offsetX: 0 }, "offsetY", { value: 0, enumerable: false });
    expect(() => normaliseTextShadow(hidden)).toThrow(TypeError);
  });
});
