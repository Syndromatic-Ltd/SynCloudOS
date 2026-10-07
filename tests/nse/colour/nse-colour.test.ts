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

import { GFXColour, GFXColourParseError, bestContrastingColour, compositeColour, contrastRatio, parseGFXColour, relativeLuminance } from "../../../src/FX/GraphicsFX/public";

describe("GFXColour", () => {
  it("parses short and long hexadecimal colours with alpha", () => {
    expect(GFXColour.parse("#369c")).toEqual(
      GFXColour.rgba(0x33 / 255, 0x66 / 255, 0x99 / 255, 0xcc / 255),
    );
    expect(GFXColour.parse("#336699cc").toHex({ includeAlpha: true })).toBe("#336699cc");
    expect(parseGFXColour("#336699")).toBeInstanceOf(GFXColour);
    expect(parseGFXColour("#336699")).toEqual(GFXColour.parse("#336699"));
  });

  it("parses CSS rgb percentages and hsl syntax", () => {
    expect(GFXColour.parse("rgb(20% 40% 60% / 80%)").toCSS()).toBe("rgb(51 102 153 / 0.8)");
    expect(GFXColour.parse("hsl(210 50% 40% / 0.8)").toCSS()).toBe("rgb(51 102 153 / 0.8)");
    expect(GFXColour.parse("transparent").components.a).toBe(0);
  });

  it("round trips HSV while retaining alpha", () => {
    const colour = GFXColour.hsva({ h: 210, s: 2 / 3, v: 0.6, a: 0.8 });
    expect(colour.toCSS()).toBe("rgb(51 102 153 / 0.8)");
    expect(colour.hsva).toEqual({ h: 210, s: 2 / 3, v: 0.6, a: 0.8 });
  });

  it("reads HSL back from the colour it builds", () => {
    const colour = GFXColour.hsla({ h: 210, s: 0.5, l: 0.4, a: 0.8 });
    expect(colour.toCSS()).toBe("rgb(51 102 153 / 0.8)");
    const hsl = colour.hsla;
    expect(hsl.h).toBeCloseTo(210, 6);
    expect(hsl.s).toBeCloseTo(0.5, 6);
    expect(hsl.l).toBeCloseTo(0.4, 6);
    expect(hsl.a).toBe(0.8);
  });

  it("converts device CMYK as CSS device-cmyk() does and reads it back", () => {
    // device-cmyk(0% 81% 81% 30%) is rgb(178.5 33.9 33.9) in CSS Color 5.
    const red = GFXColour.cmyka({ c: 0, m: 0.81, y: 0.81, k: 0.3, a: 1 });
    expect(red.toCSS()).toBe("rgb(179 34 34)");
    const cmyk = red.cmyka;
    expect(cmyk.c).toBeCloseTo(0, 6);
    expect(cmyk.m).toBeCloseTo(0.81, 6);
    expect(cmyk.y).toBeCloseTo(0.81, 6);
    expect(cmyk.k).toBeCloseTo(0.3, 6);
    // Black is all key, with no ink, and white is none of either.
    expect(GFXColour.rgba(0, 0, 0).cmyka).toEqual({ c: 0, m: 0, y: 0, k: 1, a: 1 });
    expect(GFXColour.rgba(1, 1, 1, 0.5).cmyka).toEqual({ c: 0, m: 0, y: 0, k: 0, a: 0.5 });
    expect(() => GFXColour.cmyka({ c: Number.NaN, m: 0, y: 0, k: 0, a: 1 })).toThrow(TypeError);
  });

  it("clamps finite numeric construction and rejects non-finite values", () => {
    expect(GFXColour.rgba(2, -1, 0.5, 7).components).toEqual({ r: 1, g: 0, b: 0.5, a: 1 });
    expect(() => GFXColour.parse("rgb(999 0 0)")).toThrow(GFXColourParseError);
    expect(() => GFXColour.rgba(Number.NaN, 0, 0)).toThrow(TypeError);
  });

  it("normalizes hue and creates grayscale colours", () => {
    expect(GFXColour.hsla({ h: -120, s: 1, l: 0.5, a: 1 }).toCSS()).toBe("rgb(0 0 255)");
    expect(GFXColour.grayscale(1 / 3, 0.5).toCSS()).toBe("rgb(85 85 85 / 0.5)");
  });

  it("rejects malformed and unsupported colour syntax with typed failures", () => {
    expect(() => GFXColour.parse("not-a-colour")).toThrow(GFXColourParseError);
    expect(() => GFXColour.parse("color(xyz 1 0 0)")).toThrow(
      expect.objectContaining({ reason: "unsupported-space" }),
    );
  });

  it("requires complete CSS tokens and prototype-safe named colours", () => {
    for (const input of [
      "__proto__",
      "constructor",
      "rgb(12oops 0 0)",
      "rgb(12, 0 0)",
      "rgb(12 0 0) trailing",
      "hsl(10deg 50% 50% junk)",
      "color(display-p3 1 0oops 0)",
    ]) {
      expect(() => GFXColour.parse(input)).toThrow(GFXColourParseError);
    }
  });

  it("rejects hostile non-string parser ingress without coercion or raw exceptions", () => {
    const coercion = vi.fn(() => "red");
    const hostile = Object.create(null, {
      toString: { get: () => { throw new Error("must not read"); } },
      valueOf: { value: coercion },
    });
    expect(() => GFXColour.parse(hostile as never)).toThrow(GFXColourParseError);
    expect(coercion).not.toHaveBeenCalled();
  });

  it("is immutable and compares canonical components", () => {
    const colour = GFXColour.parse("rgba(127, 127, 127, 1)");
    expect(Object.isFrozen(colour)).toBe(true);
    expect(Object.isFrozen(colour.components)).toBe(true);
    expect(Reflect.set(colour.components, "r", 1)).toBe(false);
    expect(colour.components.r).toBe(127 / 255);
    expect(colour.equals(GFXColour.rgba(127 / 255, 127 / 255, 127 / 255))).toBe(true);
  });

  it("serializes canonically without locale-dependent formatting", () => {
    expect(GFXColour.rgba(1, 0.5, 0, 1).toCSS()).toBe("rgb(255 128 0)");
    expect(GFXColour.rgba(1, 0.5, 0, 0.125).toHex({ includeAlpha: true })).toBe("#ff800020");
  });

  it("uses WCAG sRGB linearization and explicit alpha compositing", () => {
    const black = GFXColour.rgba(0, 0, 0);
    const white = GFXColour.rgba(1, 1, 1);
    expect(relativeLuminance(GFXColour.parse("#777"))).toBeCloseTo(0.184475, 5);
    expect(contrastRatio(black, white)).toBe(21);
    expect(() => relativeLuminance(black.withAlpha(0.5))).toThrow(TypeError);
    expect(compositeColour(black.withAlpha(0.5), white).toCSS()).toBe("rgb(128 128 128)");
    const composed = compositeColour(GFXColour.parse("rgb(51 102 153 / 0.4)"), white);
    expect(composed.components.r).toBeCloseTo(0.68, 12);
    expect(composed.components.g).toBeCloseTo(0.76, 12);
    expect(composed.components.b).toBeCloseTo(0.84, 12);
    expect(composed.components.a).toBe(1);
  });

  it("converts display-p3 to sRGB before luminance", () => {
    const p3 = GFXColour.displayP3(1, 0, 0, 1);
    expect(p3.converting("srgb").space).toBe("srgb");
    expect(relativeLuminance(p3)).toBeCloseTo(0.2126, 3);
  });

  it.each([1, 0.375])("performs physical bidirectional sRGB and Display-P3 conversion with alpha %s", (alpha) => {
    const p3Red = GFXColour.displayP3(1, 0, 0);
    expect(p3Red.converting("srgb").components).toMatchObject({ r: 1, g: 0, b: 0 });

    const srgbRedInP3 = GFXColour.rgba(1, 0, 0, alpha).converting("display-p3");
    expect(srgbRedInP3.space).toBe("display-p3");
    expect(srgbRedInP3.components.a).toBe(alpha);
    expect(srgbRedInP3.components.r).toBeCloseTo(0.917488, 5);
    expect(srgbRedInP3.components.g).toBeCloseTo(0.200287, 5);
    expect(srgbRedInP3.components.b).toBeCloseTo(0.138561, 5);
    expect(srgbRedInP3.converting("srgb").components).toMatchObject({
      r: expect.closeTo(1, 5),
      g: expect.closeTo(0, 5),
      b: expect.closeTo(0, 5),
      a: alpha,
    });
  });

  it("selects the first highest-contrast candidate deterministically", () => {
    const white = GFXColour.rgba(1, 1, 1);
    const equalWhite = GFXColour.parse("white");
    expect(bestContrastingColour(GFXColour.rgba(0, 0, 0), [white, equalWhite])).toBe(white);
    expect(bestContrastingColour(white, [])).toBeNull();
  });

  it("rejects sparse and accessor-backed candidate lists without executing getters", () => {
    const sparse = new Array<GFXColour>(2);
    sparse[1] = GFXColour.parse("white");
    expect(() => bestContrastingColour(GFXColour.parse("black"), sparse)).toThrow(TypeError);

    const getter = vi.fn(() => GFXColour.parse("white"));
    const accessor = Object.create(Array.prototype, {
      length: { value: 1 },
      0: { get: getter },
    }) as readonly GFXColour[];
    expect(() => bestContrastingColour(GFXColour.parse("black"), accessor)).toThrow(TypeError);
    expect(getter).not.toHaveBeenCalled();
  });
});
