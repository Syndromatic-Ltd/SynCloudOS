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

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GFXColour, GFXImage } from "../../../src/FX/GraphicsFX/public";
import { createIFXAttributedTextImage, createIFXTextImage, IFXContext, IFXFilterGraph, IFXFilterRegistry, IFXImage, IFXRenderDestination, IFXSampler } from "../../../src/FX/ImageFX/public";
import { TFXAttributedString, TFXFont, TFXFontDescriptor, TFXGlyphDrawing, TFXTypesetter } from "../../../src/FX/TextFX/public";

const registry = new IFXFilterRegistry();
const names = [
  "blurredRectangle", "roundedRectangleStroke", "mesh", "lenticularHalo", "starShine", "sunbeams",
  "textImage", "attributedTextImage",
  "bloom", "comicEffect", "crystallize", "depthOfField", "edgeWork", "gaborGradients", "gloom",
  "heightFieldFromMask", "hexagonalPixellate", "highlightShadowAdjust", "lineOverlay", "mix",
  "pointillize", "shadedMaterial", "spotColor", "spotLight", "cmykHalftone", "hatchedScreen", "kMeans",
] as const;
const sample = (image: IFXImage, x: number, y: number) => new IFXSampler(image).sample({ x, y }, "nearest");
const solid = (r: number, g: number, b: number, width = 5, height = 5) =>
  IFXImage.constant(GFXColour.linearSRGB(r, g, b)).cropped({ x: 0, y: 0, width, height });
function pixels(data: readonly number[], width: number) {
  return IFXImage.fromPixels(new GFXImage({ width, height: data.length / width / 4, alpha: "straight", colourSpace: "linear-srgb", data: new Uint8Array(data) }));
}
function step() {
  const data: number[] = [];
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) data.push(...(x < 2 ? [0,0,0,255] : [255,255,255,255]));
  return pixels(data, 5);
}

describe("ImageFX procedural depth", () => {
  it("registers the retained non-text procedural families and requires stochastic seeds", () => {
    const registeredNames = registry.names();
    expect(new Set(registeredNames).size).toBe(registeredNames.length);
    expect(registeredNames).toEqual(expect.arrayContaining(names));
    expect(() => registry.create("crystallize" as never, { center: { x: 2, y: 2 }, radius: 2 } as never)).toThrow(/seed/i);
    expect(() => registry.create("pointillize" as never, { center: { x: 2, y: 2 }, radius: 2 } as never)).toThrow(/seed/i);
  });

  it("snapshots real TextFX ligatures into durable text and attributed-text image graphs", async () => {
    const bytes = new Uint8Array(readFileSync("tests/fixtures/fx/fonts/notosans-NotoSans[wdth,wght].ttf"));
    const font = await TFXFont.create(bytes, new TFXFontDescriptor({ size: 20 }));
    const small = await TFXFont.create(bytes, new TFXFontDescriptor({ size: 13 }));
    const shaped = new TFXTypesetter(new TFXAttributedString("office", [{ start: 0, end: 6, font }])).createLine(0, 6);
    const outlines = TFXGlyphDrawing.pathsForLine(shaped);
    expect(outlines.length).toBeLessThan(6);

    const image = createIFXTextImage("office", font, { scaleFactor: 1.25, padding: 2 });
    const wire = JSON.parse(JSON.stringify(new IFXFilterGraph(image).serialize()));
    const operation = wire.nodes.at(-1);
    expect(operation.name).toBe("textImage");
    expect(operation.parameters.text).toBe("office");
    expect(operation.parameters.fontName).toBe(font.familyName);
    expect(operation.parameters.paths).toHaveLength(outlines.length);
    expect(operation.parameters.paths.reduce((sum: number, path: readonly unknown[]) => sum + path.length, 0)).toBeGreaterThan(0);

    const attributed = new TFXAttributedString("office FX", [
      { start: 0, end: 6, font },
      { start: 6, end: 9, font: small },
    ]);
    const attributedImage = createIFXAttributedTextImage(attributed, { scaleFactor: 1, padding: 1 });
    const attributedWire = JSON.parse(JSON.stringify(new IFXFilterGraph(attributedImage).serialize()));
    expect(attributedWire.nodes.at(-1).name).toBe("attributedTextImage");
    expect(attributedWire.nodes.at(-1).parameters.text).toBe("office FX");
    expect(attributedWire.nodes.at(-1).parameters.paths.length).toBeGreaterThan(1);

    font.dispose();
    small.dispose();
    const restored = IFXFilterGraph.deserialize(wire).output;
    const restoredAttributed = IFXFilterGraph.deserialize(attributedWire).output;
    const context = new IFXContext("linear-srgb", 200_000);
    const [rendered, renderedRestored, renderedAttributed] = await Promise.all([
      context.render(image), context.render(restored), context.render(restoredAttributed),
    ]);
    expect([...renderedRestored.image.copyData()]).toEqual([...rendered.image.copyData()]);
    expect([...rendered.image.copyData()].some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
    expect([...renderedAttributed.image.copyData()].some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
    context.dispose();
  });

  it("bounds durable text snapshot work before graph construction", () => {
    expect(() => registry.create("textImage" as never, {
      text: "x", fontName: "fixture", fontSize: 12, scaleFactor: 1, padding: 0,
      extent: { x: 0, y: 0, width: 1, height: 1 },
      paths: Array.from({ length: 10_001 }, () => []),
    } as never)).toThrow(/glyph.*limit/i);
  });

  it("renders finite geometry/light generators with distinguishable output", () => {
    const blurred = registry.create("blurredRectangle" as never, { color: [1,0,0,1], extent: { x: 1, y: 1, width: 4, height: 3 }, sigma: .75 } as never).apply();
    expect(blurred.extent.kind).toBe("finite");
    expect(sample(blurred, 2.5, 2.5).a).toBeGreaterThan(sample(blurred, -1.5, -1.5).a);
    const stroke = registry.create("roundedRectangleStroke" as never, { color: [0,1,0,1], extent: { x: 0, y: 0, width: 6, height: 6 }, radius: 1.5, width: 1, smoothness: .25 } as never).apply();
    expect(sample(stroke, .5, 3).a).toBeGreaterThan(sample(stroke, 3, 3).a);
    const mesh = registry.create("mesh" as never, { color: [0,0,1,1], mesh: [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }, { x: 5, y: 0 }], width: .8 } as never).apply();
    expect(sample(mesh, 2.5, 2.5).b).toBeGreaterThan(0);
    const halo = registry.create("lenticularHalo" as never, { center:{x:3,y:3}, color:[1,.8,.2,1], haloOverlap:.3, haloRadius:2, haloWidth:.8, striationContrast:1, striationStrength:.6, time:.2 } as never).apply();
    const star = registry.create("starShine" as never, { center:{x:3,y:3}, color:[1,1,1,1], crossAngle:.2, crossOpacity:.8, crossScale:2, crossWidth:.5, epsilon:.05, radius:2.5 } as never).apply();
    const sun = registry.create("sunbeams" as never, { center:{x:3,y:3}, color:[1,.9,.4,1], maxStriationRadius:3, striationContrast:1.4, striationStrength:.7, sunRadius:1.2, time:.3 } as never).apply();
    expect(new Set([halo, star, sun].map(image => JSON.stringify([sample(image,3.5,3.5), sample(image,5.5,3.5)]))).size).toBe(3);
  });

  it("executes glow, edge, pixel, lighting, colour and halftone effects nontrivially", () => {
    const source = step();
    const bloom = registry.create("bloom" as never, { intensity:1, radius:2 } as never).apply(source);
    const gloom = registry.create("gloom" as never, { intensity:.75, radius:2 } as never).apply(source);
    expect(sample(bloom,1.5,2.5)).not.toEqual(sample(gloom,1.5,2.5));
    for (const [name, params, inputs] of [
      ["comicEffect", {}, [source]],
      ["edgeWork", { radius:1.5 }, [source]],
      ["gaborGradients", {}, [source]],
      ["heightFieldFromMask", { radius:1.5 }, [source]],
      ["highlightShadowAdjust", { highlightAmount:.7, radius:1.5, shadowAmount:.6 }, [source]],
      ["lineOverlay", { nrNoiseLevel:.05, nrSharpness:.7, contrast:1.2, edgeIntensity:1, threshold:.15 }, [source]],
      ["depthOfField", { point0:{x:1,y:0}, point1:{x:3,y:4}, radius:2, saturation:.8, unsharpMaskIntensity:.5, unsharpMaskRadius:1 }, [source]],
      ["shadedMaterial", { scale:1.5 }, [source, solid(.75,.75,.75)]],
    ] as const) {
      const value = sample(registry.create(name as never, params as never).apply(...inputs), 2.5, 2.5);
      expect([value.r,value.g,value.b,value.a].every(Number.isFinite)).toBe(true);
    }
    const mixed = registry.create("mix" as never, { amount:.25 } as never).apply(solid(1,0,0), solid(0,0,1));
    expect(sample(mixed,2.5,2.5).r).toBeCloseTo(.25, 6);
    const cmyk = registry.create("cmykHalftone" as never, { angle:.2, center:{x:1,y:1}, grayComponentReplacement:.5, sharpness:.8, underColorRemoval:.5, width:2 } as never).apply(source);
    const hatch = registry.create("hatchedScreen" as never, { angle:.3, center:{x:1,y:1}, sharpness:.8, width:2 } as never).apply(source);
    expect(sample(cmyk,2.5,2.5)).not.toEqual(sample(hatch,2.5,2.5));
  });

  it("runs deterministic global k-means and charges whole-source preparation work", async () => {
    const source = pixels([255,0,0,255, 240,16,0,255, 0,16,240,255, 0,0,255,255], 4);
    const means = pixels([255,0,0,255, 0,0,255,255], 2);
    const output = registry.create("kMeans" as never, { count:2, passes:3, perceptual:false } as never).apply(source, means);
    expect(output.extent).toEqual({ kind:"finite", rect:{ x:0,y:0,width:2,height:1 } });
    expect(sample(output,.5,.5).r).toBeGreaterThan(sample(output,.5,.5).b);
    expect(sample(output,1.5,.5).b).toBeGreaterThan(sample(output,1.5,.5).r);
    const restored = IFXFilterGraph.deserialize(JSON.parse(JSON.stringify(new IFXFilterGraph(output).serialize()))).output;
    expect(sample(restored,.5,.5)).toEqual(sample(output,.5,.5));
    const requirements = new IFXSampler(output).preparationRequirements({ x:0,y:0,width:1,height:1 });
    expect(requirements.globalPreparationCount).toBe(1);
    expect(requirements.work).toBeGreaterThanOrEqual(24);
    const destination = new IFXRenderDestination({ kind:"finite", rect:{ x:0,y:0,width:1,height:1 } });
    const constrained = new IFXContext("linear-srgb", 100_000, { outputBytes:1024, scratchBytes:1024, cacheBytes:1024, work:4, tileSize:2 });
    await expect(constrained.render(output, destination)).rejects.toThrow(/work.*budget|preparation/i);
    expect(destination.image).toBeNull();
    constrained.dispose();
  });
});
