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

const constructions = vi.hoisted(() => ({ count: 0 }));

vi.mock("../../../src/FX/GraphicsFX/GFXColourTransform", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/FX/GraphicsFX/GFXColourTransform")>();
  class CountingColourTransform extends actual.GFXColourTransform {
    constructor(options: ConstructorParameters<typeof actual.GFXColourTransform>[0]) {
      super(options);
      constructions.count += 1;
    }
  }
  return { ...actual, GFXColourTransform: CountingColourTransform };
});

const { GFXImage } = await import("../../../src/FX/GraphicsFX/public");
const { IFXContext, IFXFilterRegistry, IFXImage, IFXRenderDestination } = await import("../../../src/FX/ImageFX/public");

const side = 24;
const source = () => {
  const data = new Uint8Array(side * side * 4);
  for (let index = 0; index < data.length; index++) data[index] = (index * 53 + 7) & 0xff;
  return IFXImage.fromPixels(new GFXImage({ width: side, height: side, alpha: "straight", colourSpace: "srgb", data }));
};

async function constructionsFor(output: InstanceType<typeof IFXImage>, colourSpace: "srgb" | "display-p3" | "linear-srgb" = "display-p3") {
  const context = new IFXContext();
  constructions.count = 0;
  try {
    await context.render(output, new IFXRenderDestination({ kind: "finite", rect: { x: 0, y: 0, width: side, height: side } }, colourSpace, "premultiplied"));
    return constructions.count;
  } finally {
    context.dispose();
  }
}

describe("ImageFX colour transform reuse", () => {
  it("does not construct a colour transform per rendered or sampled pixel", async () => {
    const pixels = side * side;
    expect(await constructionsFor(source())).toBeLessThan(8);
    expect(await constructionsFor(new IFXFilterRegistry().create("invert", {}).apply(source()), "srgb")).toBeLessThan(8);
    expect(pixels).toBeGreaterThan(500);
  });

  it("reuses transforms inside per-pixel colour filters", async () => {
    const registry = new IFXFilterRegistry();
    const curves = registry.create("colorCurves", { curvesData: [0, 0, 0, 0.5, 0.5, 0.5, 1, 1, 1], curvesDomain: [0, 1], colorSpace: "display-p3" }).apply(source());
    const cube = registry.create("colorCubeWithColorSpace", {
      cubeDimension: 2,
      cubeData: [0, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1],
      colorSpace: "display-p3",
      extrapolate: false,
    }).apply(source());
    expect(await constructionsFor(curves)).toBeLessThan(12);
    expect(await constructionsFor(cube)).toBeLessThan(12);
  });
});
