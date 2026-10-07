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
import { displayP3ToSRGB, sRGBToDisplayP3, srgbLinearChannel } from "../../../src/FX/GraphicsFX/colourConversion";
import type { GFXColourSpace, GFXRGBAComponents } from "../../../src/FX/GraphicsFX/colourTypes";
import { GFXColour, GFXImage, type GFXAlphaFormat, type GFXPixelFormat } from "../../../src/FX/GraphicsFX/public";
import { IFXImage, IFXSampler } from "../../../src/FX/ImageFX/public";
import { componentColour, workingColour } from "../../../src/FX/ImageFX/IFXSampler";

const spaces: readonly GFXColourSpace[] = ["srgb", "linear-srgb", "display-p3", "grayscale"];

/** GFXColour.converting as implemented before per-sample conversion was
 * shared; kept verbatim as the reference for bit-identical output. */
function referenceConverting(space: GFXColourSpace, components: GFXRGBAComponents, to: GFXColourSpace): GFXRGBAComponents {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  const construct = (value: GFXRGBAComponents) => ({ r: clamp(value.r), g: clamp(value.g), b: clamp(value.b), a: clamp(value.a) });
  const self = construct(components);
  if (to === space) return self;
  const encode = (x: number) => x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  const srgb = space === "display-p3" ? displayP3ToSRGB(self) : space === "linear-srgb" ? { r: encode(self.r), g: encode(self.g), b: encode(self.b), a: self.a } : self;
  if (to === "linear-srgb") return construct({ r: srgbLinearChannel(srgb.r), g: srgbLinearChannel(srgb.g), b: srgbLinearChannel(srgb.b), a: srgb.a });
  if (to === "srgb") return construct(srgb);
  if (to === "grayscale") {
    const luminance = 0.2126 * srgb.r + 0.7152 * srgb.g + 0.0722 * srgb.b;
    return construct({ r: luminance, g: luminance, b: luminance, a: srgb.a });
  }
  return construct(sRGBToDisplayP3(srgb));
}

const fromSpace = (space: GFXColourSpace, c: GFXRGBAComponents) =>
  space === "linear-srgb" ? GFXColour.linearSRGB(c.r, c.g, c.b, c.a)
    : space === "display-p3" ? GFXColour.displayP3(c.r, c.g, c.b, c.a)
      : space === "grayscale" ? GFXColour.grayscale(c.r, c.a)
        : GFXColour.rgba(c.r, c.g, c.b, c.a);

describe("per-sample colour conversion parity", () => {
  it("GFXColour.converting is bit-identical to its previous implementation", () => {
    const values = [0, 0.001, 0.02, 0.04045, 0.2, 0.5, 0.73, 0.999, 1];
    for (const from of spaces) for (const to of spaces) for (const r of values) for (const b of [0, 0.37, 1]) for (const a of [0, 0.5, 1]) {
      const input = { r, g: from === "grayscale" ? r : 1 - r, b: from === "grayscale" ? r : b, a };
      const source = fromSpace(from, input);
      expect(source.converting(to).components).toEqual(referenceConverting(from, source.components, to));
    }
  });

  it("samples byte pixels exactly as the colour-object path does", () => {
    const cases: Array<{ format: GFXPixelFormat; alpha: GFXAlphaFormat; space: GFXColourSpace; channels: number }> = [
      { format: "rgba8", alpha: "straight", space: "srgb", channels: 4 },
      { format: "rgba8", alpha: "premultiplied", space: "display-p3", channels: 4 },
      { format: "bgra8", alpha: "premultiplied", space: "linear-srgb", channels: 4 },
      { format: "bgra8", alpha: "opaque", space: "srgb", channels: 4 },
      { format: "rgb8", alpha: "opaque", space: "display-p3", channels: 3 },
      { format: "gray8", alpha: "opaque", space: "grayscale", channels: 1 },
      { format: "a8", alpha: "straight", space: "srgb", channels: 1 },
    ];
    const width = 5, height = 4;
    for (const { format, alpha, space, channels } of cases) {
      const data = new Uint8Array(width * height * channels);
      for (let index = 0; index < data.length; index++) data[index] = (index * 71 + 13) & 0xff;
      if (alpha === "premultiplied") for (let pixel = 0; pixel < width * height; pixel++) {
        const a = data[pixel * 4 + 3]!;
        for (let channel = 0; channel < 3; channel++) data[pixel * 4 + channel] = Math.min(a, data[pixel * 4 + channel]!);
      }
      const pixels = new GFXImage({ width, height, pixelFormat: format, alpha, colourSpace: space, data });
      for (const working of spaces) {
        const sampler = new IFXSampler(IFXImage.fromPixels(pixels), working, 1024);
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          const expected = workingColour(componentColour(pixels.pixel(x, y), space), working);
          expect(sampler.sample({ x: x + 0.5, y: y + 0.5 }, "nearest")).toEqual(expected);
        }
      }
    }
  });

  it("samples constant nodes exactly as the colour-object path does", () => {
    for (const working of spaces) {
      const colour = GFXColour.displayP3(0.9, 0.2, 0.4, 0.6);
      const sampler = new IFXSampler(IFXImage.constant(colour), working, 1024);
      expect(sampler.sample({ x: 3.5, y: -2.5 }, "linear")).toEqual(workingColour(colour, working));
      expect(sampler.sample({ x: 10.5, y: 7.5 }, "nearest")).toEqual(workingColour(colour, working));
    }
  });
});
