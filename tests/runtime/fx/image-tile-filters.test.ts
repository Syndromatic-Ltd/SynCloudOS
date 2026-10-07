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
const tileNames = [
  "eightfoldReflectedTile", "fourfoldReflectedTile", "fourfoldRotatedTile", "fourfoldTranslatedTile",
  "glideReflectedTile", "kaleidoscope", "opTile", "parallelogramTile", "perspectiveTile",
  "sixfoldReflectedTile", "sixfoldRotatedTile", "triangleKaleidoscope", "triangleTile", "twelvefoldReflectedTile",
] as const;

function sourceImage(): IFXImage {
  return IFXImage.fromPixels(new GFXImage({
    width: 2,
    height: 2,
    alpha: "straight",
    colourSpace: "linear-srgb",
    data: new Uint8Array([
      255, 0, 0, 255,   0, 255, 0, 255,
      0, 0, 255, 255,   255, 255, 0, 255,
    ]),
  }));
}

const sample = (image: IFXImage, x: number, y: number) => new IFXSampler(image).sample({ x, y }, "nearest");

describe("ImageFX retained tile filters", () => {
  it("registers every retained tile key with required captured parameters and infinite output", () => {
        expect(registry.names()).toHaveLength(203);
    expect(registry.names()).toEqual(expect.arrayContaining(tileNames));
    expect(() => registry.create("eightfoldReflectedTile", {})).toThrow(/required|parameter|numeric|point/i);
    expect(() => registry.create("kaleidoscope", { angle: 0, center: { x: 0, y: 0 }, count: 2.5 })).toThrow(/integral|count|range/i);
    expect(() => registry.create("perspectiveTile", {
      topLeft: { x: 0, y: 0 }, topRight: { x: 2, y: 0 }, bottomRight: { x: 0, y: 2 }, bottomLeft: { x: 2, y: 2 },
    })).toThrow(/quad|perspective|degenerate/i);

    const image = sourceImage();
    const tiled = registry.create("eightfoldReflectedTile", { angle: 0, center: { x: 0, y: 0 }, width: 2 }).apply(image);
    expect(tiled.extent).toEqual({ kind: "infinite" });
  });

  it("folds reflected square symmetry across negative coordinates without seams", () => {
    const image = sourceImage();
    const reflected = registry.create("fourfoldReflectedTile", { acuteAngle: Math.PI / 2, angle: 0, center: { x: 0, y: 0 }, width: 2 }).apply(image);
    expect(sample(reflected, .5, .5)).toEqual(sample(reflected, -.5, .5));
    expect(sample(reflected, .5, .5)).toEqual(sample(reflected, .5, -.5));
    expect(sample(reflected, 1.999999, .5)).toEqual(sample(reflected, 2.000001, .5));
  });

  it("keeps rotated, translated, glide and parallelogram symmetries distinct on an asymmetric source", () => {
    const image = sourceImage(), points = [{ x: 2.7, y: 1.3 }, { x: -1.2, y: 2.6 }, { x: 3.4, y: -2.1 }, { x: .8, y: 4.3 }];
    const common = { angle: .2, center: { x: .25, y: -.1 }, width: 1.5 } as const;
    const outputs = [
      registry.create("fourfoldRotatedTile", common).apply(image),
      registry.create("fourfoldTranslatedTile", { ...common, acuteAngle: 1.1 }).apply(image),
      registry.create("glideReflectedTile", common).apply(image),
      registry.create("parallelogramTile", { ...common, acuteAngle: 1.1 }).apply(image),
    ];
    const signatures = outputs.map(output => JSON.stringify(points.map(point => sample(output, point.x, point.y))));
    expect(new Set(signatures).size).toBeGreaterThanOrEqual(3);
    for (const output of outputs) expect(output.extent).toEqual({ kind: "infinite" });
  });

  it("implements angular kaleidoscope families and durable data-only graph records", () => {
    const image = sourceImage();
    const cases = [
      ["eightfoldReflectedTile", { angle: .15, center: { x: 0, y: 0 }, width: 2 }],
      ["sixfoldReflectedTile", { angle: .15, center: { x: 0, y: 0 }, width: 2 }],
      ["sixfoldRotatedTile", { angle: .15, center: { x: 0, y: 0 }, width: 2 }],
      ["twelvefoldReflectedTile", { angle: .15, center: { x: 0, y: 0 }, width: 2 }],
      ["kaleidoscope", { angle: .15, center: { x: 0, y: 0 }, count: 7 }],
      ["triangleTile", { angle: .15, center: { x: 0, y: 0 }, width: 2 }],
      ["triangleKaleidoscope", { decay: .2, point: { x: 0, y: 0 }, rotation: .15, size: 2 }],
      ["opTile", { angle: .15, center: { x: 0, y: 0 }, scale: .3, width: 2 }],
    ] as const;
    const seen: string[] = [];
    for (const [name, parameters] of cases) {
      const output = registry.create(name, parameters as never).apply(image);
      const value = sample(output, 3.25, -1.75);
      expect([value.r, value.g, value.b, value.a].every(Number.isFinite)).toBe(true);
      const wire = JSON.parse(JSON.stringify(new IFXFilterGraph(output).serialize()));
      const restored = IFXFilterGraph.deserialize(wire).output;
      expect(sample(restored, 3.25, -1.75)).toEqual(value);
      seen.push(...wire.nodes.filter((node: { kind: string }) => node.kind === "operation").map((node: { name: string }) => node.name));
    }
    for (const [name] of cases) expect(seen).toContain(name);
  });

  it("repeats projective quadrilateral coordinates and rejects singular geometry before publication", () => {
    const image = sourceImage();
    const parameters = { topLeft: { x: 0, y: 0 }, topRight: { x: 2, y: 0 }, bottomRight: { x: 2, y: 2 }, bottomLeft: { x: 0, y: 2 } } as const;
    const tiled = registry.create("perspectiveTile", parameters).apply(image);
    expect(sample(tiled, .5, .5)).toEqual(sample(tiled, 2.5, .5));
    expect(sample(tiled, .5, .5)).toEqual(sample(tiled, .5, -1.5));
  });

  it("renders an infinite tile graph through bounded full and streamed destinations with matching seams", async () => {
    const image = sourceImage();
    const tiled = registry.create("fourfoldReflectedTile", { acuteAngle: Math.PI / 2, angle: 0, center: { x: 0, y: 0 }, width: 2 }).apply(image);
    const bounds = { kind: "finite" as const, rect: { x: -4, y: -4, width: 8, height: 8 } };
    const fullContext = new IFXContext("linear-srgb", 100_000, { outputBytes: 4096, scratchBytes: 4096, cacheBytes: 4096, work: 200_000, tileSize: 2 });
    const full = await fullContext.render(tiled, new IFXRenderDestination(bounds));
    const pieces: Array<{ rect: { x: number; y: number; width: number; height: number }; image: GFXImage }> = [];
    const streamedContext = new IFXContext("linear-srgb", 100_000, { outputBytes: 16, scratchBytes: 4096, cacheBytes: 4096, work: 200_000, tileSize: 2 });
    const streamed = new IFXTileRenderDestination(bounds, { tileSize: 2, write: tile => void pieces.push({ rect: tile.rect, image: tile.image }) });
    const info = await streamedContext.renderTiles(tiled, streamed);
    expect(info.tileCount).toBe(16);
    expect(info.peakBytes.output).toBeLessThanOrEqual(16);
    const joined = new Uint8Array(8 * 8 * 4);
    for (const piece of pieces) {
      const bytes = piece.image.copyData();
      for (let y = 0; y < piece.rect.height; y++) {
        const sourceOffset = y * piece.rect.width * 4;
        const destinationOffset = (((piece.rect.y + 4 + y) * 8) + piece.rect.x + 4) * 4;
        joined.set(bytes.subarray(sourceOffset, sourceOffset + piece.rect.width * 4), destinationOffset);
      }
    }
    expect([...joined]).toEqual([...full.image.copyData()]);
    fullContext.dispose();
    streamedContext.dispose();
  });
});
