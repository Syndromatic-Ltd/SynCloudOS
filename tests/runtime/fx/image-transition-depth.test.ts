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
import { GFXImage } from "../../../src/FX/GraphicsFX/public";
import {
  IFXContext,
  IFXFilterGraph,
  IFXFilterRegistry,
  IFXImage,
  IFXRenderDestination,
  IFXSampler,
  IFXTileRenderDestination,
} from "../../../src/FX/ImageFX/public";

const registry = new IFXFilterRegistry();
const transitionNames = [
  "accordionFold",
  "barsSwipe",
  "copyMachine",
  "disintegrateWithMask",
  "flash",
  "mod",
  "pageCurl",
  "pageCurlWithShadow",
  "ripple",
] as const;
const extent = { x: 0, y: 0, width: 4, height: 4 } as const;

function solid(r: number, g: number, b: number, a = 255): IFXImage {
  const data = new Uint8Array(4 * 4 * 4);
  for (let index = 0; index < data.length; index += 4) data.set([r, g, b, a], index);
  return IFXImage.fromPixels(new GFXImage({ width: 4, height: 4, alpha: "straight", colourSpace: "linear-srgb", data }));
}

function maskImage(): IFXImage {
  const data = new Uint8Array(4 * 4 * 4);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const value = Math.round((x + y * 4) / 15 * 255);
    data.set([value, value, value, 255], (y * 4 + x) * 4);
  }
  return IFXImage.fromPixels(new GFXImage({ width: 4, height: 4, alpha: "straight", colourSpace: "linear-srgb", data }));
}

const source = solid(255, 0, 0);
const target = solid(0, 0, 255);
const backside = solid(0, 255, 0);
const shading = solid(128, 128, 128);
const mask = maskImage();
const sample = (image: IFXImage, x = 1.5, y = 1.5) => new IFXSampler(image).sample({ x, y }, "nearest");

function parameters(name: typeof transitionNames[number], time: number): Record<string, unknown> {
  switch (name) {
    case "accordionFold": return { time, bottomHeight: .2, foldShadowAmount: .6, numberOfFolds: 4 };
    case "barsSwipe": return { time, angle: .2, barOffset: .35, width: 1 };
    case "copyMachine": return { time, angle: .15, color: [1, 1, 1, 1], extent, opacity: .8, width: .75 };
    case "disintegrateWithMask": return { time, shadowDensity: .7, shadowOffset: { x: .5, y: .25 }, shadowRadius: .4 };
    case "flash": return { time, center: { x: 2, y: 2 }, color: [1, 1, 1, 1], extent, fadeThreshold: .35, maxStriationRadius: 2, striationContrast: 1.2, striationStrength: .8 };
    case "mod": return { time, angle: .25, center: { x: 2, y: 2 }, compression: 2.5, radius: 3 };
    case "pageCurl": return { time, angle: .25, extent, radius: .8 };
    case "pageCurlWithShadow": return { time, angle: .25, extent, radius: .8, shadowAmount: .65, shadowExtent: { x: -.5, y: -.5, width: 5, height: 5 }, shadowSize: .7 };
    case "ripple": return { time, center: { x: 2, y: 2 }, extent, scale: .65, width: .8 };
  }
}

function apply(name: typeof transitionNames[number], time: number): IFXImage {
  const filter = registry.create(name as never, parameters(name, time) as never);
  if (name === "disintegrateWithMask") return filter.apply(source, target, mask);
  if (name === "pageCurl") return filter.apply(source, target, backside, shading);
  if (name === "pageCurlWithShadow") return filter.apply(source, target, backside);
  if (name === "ripple") return filter.apply(source, target, shading);
  return filter.apply(source, target);
}

describe("ImageFX retained transition filters", () => {
  it("registers all retained transition keys and rejects uncaptured defaults instead of guessing them", () => {
    expect(registry.names()).toHaveLength(203);
    expect(registry.names()).toEqual(expect.arrayContaining(transitionNames));
    expect(() => registry.create("barsSwipe" as never, { time: .5 } as never)).toThrow(/required|parameter|numeric/i);
    expect(() => registry.create("accordionFold" as never, { time: .5, bottomHeight: .2, foldShadowAmount: .5, numberOfFolds: 2.5 } as never)).toThrow(/integral|fold|range/i);
    expect(() => registry.create("pageCurlWithShadow" as never, { time: .5, angle: 0, extent, radius: .5, shadowAmount: .5, shadowExtent: extent, shadowSize: -1 } as never)).toThrow(/range|numeric/i);
  });

  it("preserves exact source and target endpoints for every retained transition", () => {
    for (const name of transitionNames) {
      expect(sample(apply(name, 0))).toEqual(sample(source));
      expect(sample(apply(name, 1))).toEqual(sample(target));
    }
  });

  it("produces operation-specific intermediate geometry instead of named crossfades", () => {
    const points = [{ x: .5, y: .5 }, { x: 1.5, y: .5 }, { x: 2.5, y: 2.5 }, { x: 3.5, y: 1.5 }];
    const signatures = transitionNames.map(name => JSON.stringify(points.map(point => sample(apply(name, .5), point.x, point.y))));
    expect(new Set(signatures).size).toBeGreaterThanOrEqual(7);
    const curl = apply("pageCurl", .5);
    expect(points.map(point => sample(curl, point.x, point.y)).some(pixel => pixel.g > pixel.r && pixel.g > pixel.b)).toBe(true);
    const disintegrated = apply("disintegrateWithMask", .5);
    expect(sample(disintegrated, .5, .5)).not.toEqual(sample(disintegrated, 3.5, 3.5));
  });

  it("round-trips multi-input transition graphs as data-only records", () => {
    const image = apply("pageCurl", .5);
    const wire = JSON.parse(JSON.stringify(new IFXFilterGraph(image).serialize()));
    const restored = IFXFilterGraph.deserialize(wire).output;
    for (const point of [{ x: .5, y: .5 }, { x: 2.5, y: 1.5 }, { x: 3.5, y: 3.5 }]) {
      expect(sample(restored, point.x, point.y)).toEqual(sample(image, point.x, point.y));
    }
    expect(wire.nodes.filter((node: { kind: string; name?: string }) => node.kind === "operation").some((node: { name?: string }) => node.name === "pageCurl")).toBe(true);
  });

  it("renders transition tiles byte-identically to the materialized destination", async () => {
    const image = apply("barsSwipe", .55);
    const bounds = { kind: "finite" as const, rect: extent };
    const fullContext = new IFXContext("linear-srgb", 100_000, { outputBytes: 4096, scratchBytes: 4096, cacheBytes: 4096, work: 100_000, tileSize: 2 });
    const full = await fullContext.render(image, new IFXRenderDestination(bounds));
    const pieces: Array<{ rect: { x: number; y: number; width: number; height: number }; image: GFXImage }> = [];
    const tiledContext = new IFXContext("linear-srgb", 100_000, { outputBytes: 16, scratchBytes: 4096, cacheBytes: 4096, work: 100_000, tileSize: 2 });
    const tiled = new IFXTileRenderDestination(bounds, { tileSize: 2, write: tile => void pieces.push({ rect: tile.rect, image: tile.image }) });
    const info = await tiledContext.renderTiles(image, tiled);
    expect(info.tileCount).toBe(4);
    const joined = new Uint8Array(4 * 4 * 4);
    for (const piece of pieces) {
      const bytes = piece.image.copyData();
      for (let y = 0; y < piece.rect.height; y++) {
        joined.set(bytes.subarray(y * piece.rect.width * 4, (y + 1) * piece.rect.width * 4), ((piece.rect.y + y) * 4 + piece.rect.x) * 4);
      }
    }
    expect([...joined]).toEqual([...full.image.copyData()]);
    fullContext.dispose();
    tiledContext.dispose();
  });
});
