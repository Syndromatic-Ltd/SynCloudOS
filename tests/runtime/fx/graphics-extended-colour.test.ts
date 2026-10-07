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
import {
  GFXColourTransform,
  GFXFloatImage,
  type GFXExtendedRGBA,
} from "../../../src/FX/GraphicsFX/public";
import { IFXImage, IFXProcessorDefinition, IFXRenderDestination, IFXSampler, IFXContext } from "../../../src/FX/ImageFX/public";

const identity = new IFXProcessorDefinition({
  id: "custom:extendedIdentity",
  version: 1,
  inputCount: 1,
  parameters: {},
  output: { kind: "first-input" },
  roi: { kind: "identity" },
  evaluate: (point, access) => access.sample(0, point),
});

function straight(sample: GFXExtendedRGBA): GFXExtendedRGBA {
  return sample.a === 0
    ? { r: 0, g: 0, b: 0, a: 0 }
    : { r: sample.r / sample.a, g: sample.g / sample.a, b: sample.b / sample.a, a: sample.a };
}

describe("GraphicsFX extended colour storage and ImageFX arithmetic", () => {
  it("preserves negative and >1 float32 samples through ImageFX identity and composites without intermediate clipping", async () => {
    const source = new GFXFloatImage({
      width: 1,
      height: 1,
      sampleFormat: "float32",
      alpha: "straight",
      colourSpace: "linear-srgb",
      data: new Float32Array([2, -0.5, 0.25, 0.5]),
    });
    const image = identity.apply({}, IFXImage.fromPixels(source));
    expect(straight(new IFXSampler(image).sample({ x: 0.5, y: 0.5 }, "nearest"))).toEqual({ r: 2, g: -0.5, b: 0.25, a: 0.5 });

    const background = IFXImage.fromPixels(new GFXFloatImage({
      width: 1,
      height: 1,
      sampleFormat: "float32",
      alpha: "opaque",
      colourSpace: "linear-srgb",
      data: new Float32Array([-0.5, 0.25, 2, 1]),
    }));
    const composite = image.compositedOver(background);
    const value = straight(new IFXSampler(composite).sample({ x: 0.5, y: 0.5 }, "nearest"));
    expect(value.r).toBeCloseTo(0.75, 7);
    expect(value.g).toBeCloseTo(-0.125, 7);
    expect(value.b).toBeCloseTo(1.125, 7);

    const destination = new IFXRenderDestination(composite.extent, "linear-srgb", "straight");
    const rendered = await new IFXContext().render(composite, destination);
    expect(rendered.image.pixel(0, 0)).toEqual({ r: 0.7490196078431373, g: 0, b: 1, a: 1 });
  });

  it("round-trips float16 storage within declared tolerance and never produces NaN at zero alpha", () => {
    const image = new GFXFloatImage({
      width: 2,
      height: 1,
      sampleFormat: "float16",
      alpha: "premultiplied",
      colourSpace: "linear-srgb",
      data: new Float32Array([0.75, -0.125, 1.5, 0.5, 0, 0, 0, 0]),
    });
    expect(image.sampleFormat).toBe("float16");
    expect(image.descriptor).toEqual({
      width: 2,
      height: 1,
      bytesPerRow: 16,
      pixelFormat: "rgba-float",
      sampleFormat: "float16",
      alpha: "premultiplied",
      colourSpace: "linear-srgb",
    });
    expect(Object.isFrozen(image.descriptor)).toBe(true);
    expect(image.pixel(0, 0).r).toBeCloseTo(1.5, 3);
    expect(image.pixel(0, 0).g).toBeCloseTo(-0.25, 3);
    expect(image.pixel(0, 0).b).toBeCloseTo(3, 3);
    expect(image.pixel(1, 0)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(Object.values(image.pixel(1, 0)).every(Number.isFinite)).toBe(true);
  });

  it("expands bounded indexed descriptors through an immutable extended palette", () => {
    const image = GFXFloatImage.fromIndexed({
      width: 3,
      height: 1,
      indices: new Uint8Array([0, 1, 0]),
      palette: [
        { r: 2, g: -1, b: 0.5, a: 1 },
        { r: 0.25, g: 0.5, b: 0.75, a: 0.5 },
      ],
      colourSpace: "linear-srgb",
    });
    expect(image.pixel(0, 0)).toEqual({ r: 2, g: -1, b: 0.5, a: 1 });
    expect(image.pixel(1, 0)).toEqual({ r: 0.25, g: 0.5, b: 0.75, a: 0.5 });
    expect(() => GFXFloatImage.fromIndexed({ width: 1, height: 1, indices: new Uint8Array([2]), palette: [{ r: 0, g: 0, b: 0, a: 1 }], colourSpace: "linear-srgb" })).toThrow(/palette/i);
  });
});

describe("GraphicsFX explicit extended colour transforms", () => {
  it("converts CMYK and CIE Lab D50 reference patches without hidden clipping", () => {
    const cyan = GFXColourTransform.fromCMYK({ c: 1, m: 0, y: 0, k: 0, a: 1 });
    expect(cyan).toEqual({ r: 0, g: 1, b: 1, a: 1 });
    const redLab = GFXColourTransform.fromLabD50({ l: 54.2917, a: 80.8151, b: 69.8786, alpha: 1 });
    expect(redLab.r).toBeCloseTo(1, 4);
    expect(redLab.g).toBeCloseTo(0, 4);
    expect(redLab.b).toBeCloseTo(0, 4);
    const lab = GFXColourTransform.toLabD50(redLab);
    expect(lab.l).toBeCloseTo(54.2917, 3);
    expect(lab.a).toBeCloseTo(80.8151, 3);
    expect(lab.b).toBeCloseTo(69.8786, 3);
  });

  it("keeps rendering intent, black-point compensation, gamut and tone-map policy explicit", () => {
    const transform = new GFXColourTransform({
      source: "linear-srgb",
      destination: "linear-srgb",
      intent: "relative-colorimetric",
      blackPointCompensation: true,
      gamutMapping: "preserve",
      toneMap: "none",
    });
    const source = { r: 2, g: -0.25, b: 0.5, a: 0.75 };
    expect(transform.apply(source)).toEqual(source);
    expect(transform.intent).toBe("relative-colorimetric");
    expect(transform.blackPointCompensation).toBe(true);

    const clipped = new GFXColourTransform({ source: "linear-srgb", destination: "srgb", gamutMapping: "clip", toneMap: "clip" }).apply({ r: 2, g: -0.25, b: 0.5, a: 1 });
    expect(clipped.r).toBe(1);
    expect(clipped.g).toBe(0);
    expect(clipped.b).toBeGreaterThan(0);
    expect(clipped.b).toBeLessThan(1);
  });

  it("rejects unsupported transform dialects with a typed disposition", () => {
    expect(() => GFXColourTransform.unsupported("iccmax", "spectral PCS")).toThrowError(expect.objectContaining({ name: "GFXColourTransformUnsupportedError", backend: "iccmax" }));
  });
});
