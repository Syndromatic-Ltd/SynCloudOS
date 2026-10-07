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

import { GFXColourTransform } from "../../GraphicsFX/GFXColourTransform";
import type { GFXRect } from "../../GraphicsFX/GFXGeometry";
import { finiteExtent } from "../extent";
import type { ProcessingAccess, ProcessingPreparationAccess } from "../processing";
import type { IFXPremultipliedSample } from "../IFXSampler";
import { fields, finiteInput, luma, premult, processor, straight, type Definition } from "./common";

export const palette: Record<string, Definition> = {};
const maximumPaletteCells = 256;
const maximumCentroidSourcePixels = 65_536;
const checkpointPixels = 1_024;

type Sample = Readonly<{ r: number; g: number; b: number; a: number }>;
type PaletteGeometry = Readonly<{ bounds: GFXRect; width: number; height: number; cells: number }>;
type CentroidState = readonly Sample[];

function requiredPerceptual(value: unknown): boolean {
    const parameters = fields(value, ["perceptual"]);
    if (typeof parameters.perceptual !== "boolean")
        throw new TypeError("Palette perceptual must be boolean.");
    return parameters.perceptual;
}

function geometry(bounds: GFXRect, limit: number, name: string): PaletteGeometry {
    const width = bounds.width, height = bounds.height, cells = width * height;
    if (![width, height, cells].every(Number.isSafeInteger) || width < 1 || height < 1 || cells > limit)
        throw new RangeError(`${name} exceeds its ${limit}-pixel bound or is not pixel-aligned.`);
    return Object.freeze({ bounds, width, height, cells });
}

function paletteGeometry(input: import("../IFXImage").IFXImage): PaletteGeometry {
    return geometry(finiteInput(input), maximumPaletteCells, "Palette image");
}

function palettePoint(shape: PaletteGeometry, index: number) {
    return Object.freeze({ x: shape.bounds.x + index % shape.width + .5, y: shape.bounds.y + Math.floor(index / shape.width) + .5 });
}

function colorVector(value: Sample, perceptual: boolean): readonly number[] {
    if (!perceptual) return Object.freeze([value.r, value.g, value.b, value.a]);
    const lab = GFXColourTransform.toLabD50({ r: value.r, g: value.g, b: value.b, a: value.a });
    return Object.freeze([lab.l / 100, lab.a / 128, lab.b / 128, value.a]);
}

function distance(left: Sample, right: Sample, perceptual: boolean): number {
    const a = colorVector(left, perceptual), b = colorVector(right, perceptual);
    return a.reduce((sum, value, index) => sum + (value - b[index]!) ** 2, 0);
}

function readPalette(access: ProcessingAccess, input: number, shape: PaletteGeometry): readonly Sample[] {
    const result: Sample[] = [];
    for (let index = 0; index < shape.cells; index++) result.push(straight(access.sampleWithin(input, palettePoint(shape, index), shape.bounds, "nearest")));
    return Object.freeze(result);
}

function nearestIndex(value: Sample, candidates: readonly Sample[], perceptual: boolean): number {
    let best = 0, bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < candidates.length; index++) {
        const candidateDistance = distance(value, candidates[index]!, perceptual);
        if (candidateDistance < bestDistance) {
            best = index;
            bestDistance = candidateDistance;
        }
    }
    return best;
}

palette.palettize = { category: "colourEffect", inputs: 2, normalise: value => Object.freeze({ perceptual: requiredPerceptual(value) }), build: (inputs, parameters) => {
        const shape = paletteGeometry(inputs[1]!), perceptual = parameters.perceptual as boolean;
        return processor("palettize", parameters, inputs[0]!.extent, (position, access) => {
            const source = straight(access.sample(0, position)), candidates = readPalette(access, 1, shape), selected = candidates[nearestIndex(source, candidates, perceptual)]!;
            // Portable alpha policy multiplies source and selected-palette alpha; palette ties resolve to the earliest cell in row-major order.
            return premult({ r: selected.r, g: selected.g, b: selected.b, a: source.a * selected.a });
        }, region => [region, shape.bounds]);
    } };

function sourceGeometry(input: import("../IFXImage").IFXImage): PaletteGeometry {
    return geometry(finiteInput(input), maximumCentroidSourcePixels, "Palette centroid source");
}

function calculateCentroids(access: ProcessingAccess, source: PaletteGeometry, paletteShape: PaletteGeometry, perceptual: boolean): CentroidState {
    const seeds = readPalette(access, 1, paletteShape), sums = seeds.map(() => [0, 0, 0, 0, 0]);
    for (let index = 0; index < source.cells; index++) {
        const position = palettePoint(source, index), value = straight(access.sampleWithin(0, position, source.bounds, "nearest")), bucket = sums[nearestIndex(value, seeds, perceptual)]!;
        bucket[0] += value.r; bucket[1] += value.g; bucket[2] += value.b; bucket[3] += value.a; bucket[4] += 1;
    }
    return Object.freeze(sums.map((sum, index) => sum[4]! === 0 ? seeds[index]! : Object.freeze({ r: sum[0]! / sum[4]!, g: sum[1]! / sum[4]!, b: sum[2]! / sum[4]!, a: sum[3]! / sum[4]! })));
}

async function calculateCentroidsAsync(access: ProcessingPreparationAccess, source: PaletteGeometry, paletteShape: PaletteGeometry, perceptual: boolean): Promise<CentroidState> {
    const seeds = readPalette(access, 1, paletteShape), sums = seeds.map(() => [0, 0, 0, 0, 0]);
    for (let index = 0; index < source.cells; index++) {
        const position = palettePoint(source, index), value = straight(access.sampleWithin(0, position, source.bounds, "nearest")), bucket = sums[nearestIndex(value, seeds, perceptual)]!;
        bucket[0] += value.r; bucket[1] += value.g; bucket[2] += value.b; bucket[3] += value.a; bucket[4] += 1;
        if ((index + 1) % checkpointPixels === 0) await access.checkpoint();
    }
    return Object.freeze(sums.map((sum, index) => sum[4]! === 0 ? seeds[index]! : Object.freeze({ r: sum[0]! / sum[4]!, g: sum[1]! / sum[4]!, b: sum[2]! / sum[4]!, a: sum[3]! / sum[4]! })));
}

palette.paletteCentroid = { category: "colourEffect", inputs: 2, normalise: value => Object.freeze({ perceptual: requiredPerceptual(value) }), build: (inputs, parameters) => {
        const source = sourceGeometry(inputs[0]!), paletteShape = paletteGeometry(inputs[1]!), perceptual = parameters.perceptual as boolean, token = Object.freeze({}), get = (access: ProcessingAccess) => access.getState<CentroidState>(token) ?? access.setState(token, calculateCentroids(access, source, paletteShape, perceptual));
        return processor("paletteCentroid", parameters, finiteExtent(paletteShape.bounds), (position, access) => {
            const index = Math.max(0, Math.min(paletteShape.cells - 1, Math.floor(position.y - paletteShape.bounds.y) * paletteShape.width + Math.floor(position.x - paletteShape.bounds.x))), value = get(access)[index]!;
            return premult(value);
        }, () => [source.bounds, paletteShape.bounds], async access => {
            if (!access.getState<CentroidState>(token)) access.setState(token, await calculateCentroidsAsync(access, source, paletteShape, perceptual));
        }, Object.freeze({ scope: "global" as const, scratchBytes: paletteShape.cells * 5 * Float64Array.BYTES_PER_ELEMENT, work: source.cells * paletteShape.cells }));
    } };
