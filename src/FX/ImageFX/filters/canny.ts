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

import type { GFXPoint, GFXRect } from "../../GraphicsFX/GFXGeometry";
import { finiteExtent } from "../extent";
import type { ProcessingAccess, ProcessingPreparationAccess } from "../processing";
import { fields, finiteInput, processor, straight, type Definition } from "./common";

const cannyScratchBytesPerPixel = 4 * Float32Array.BYTES_PER_ELEMENT + 2 * Uint8Array.BYTES_PER_ELEMENT + Int32Array.BYTES_PER_ELEMENT;
const maximumCannyScratchBytes = 22 * 1024 * 1024;
const maximumCannyPixels = Math.floor(maximumCannyScratchBytes / cannyScratchBytesPerPixel);
const maximumCannyWork = 64 * 1024 * 1024;
const checkpointRows = 8;
const checkpointFloodFillEntries = 1024;
const black = Object.freeze({ r: 0, g: 0, b: 0, a: 1 });
const white = Object.freeze({ r: 1, g: 1, b: 1, a: 1 });
type CannySettings = Readonly<{
    gaussianSigma: number;
    perceptual: boolean;
    thresholdLow: number;
    thresholdHigh: number;
    hysteresisPasses: number;
}>;
type CannyCache = Readonly<{
    grid: GFXRect;
    width: number;
    height: number;
    edges: Uint8Array;
}>;
type CannySource = Readonly<{
    output: GFXRect;
    grid: GFXRect;
    pixels: number;
}>;

function boundedNumber(value: unknown, fallback: number, label: string, minimum: number, maximum: number): number {
    const result = value === undefined ? fallback : value;
    if (typeof result !== "number" || !Number.isFinite(result) || result < minimum || result > maximum)
        throw new RangeError(`Canny ${label} must be a finite number from ${minimum} to ${maximum}.`);
    return result;
}
function boundedInteger(value: unknown, fallback: number, label: string, minimum: number, maximum: number): number {
    const result = boundedNumber(value, fallback, label, minimum, maximum);
    if (!Number.isInteger(result))
        throw new RangeError(`Canny ${label} must be integral.`);
    return result;
}

function gaussianKernel(sigma: number): readonly number[] {
    if (sigma === 0)
        return Object.freeze([1]);
    const radius = Math.ceil(sigma * 3), values: number[] = [];
    let total = 0;
    for (let offset = -radius; offset <= radius; offset++) {
        const weight = Math.exp(-(offset * offset) / (2 * sigma * sigma));
        values.push(weight);
        total += weight;
    }
    return Object.freeze(values.map(value => value / total));
}
function sampleAt(values: Float32Array, width: number, height: number, x: number, y: number): number {
    return x < 0 || y < 0 || x >= width || y >= height ? 0 : values[y * width + x]!;
}
function perceptualComponent(value: number): number {
    return value <= .0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - .055;
}
function luminance(value: ReturnType<typeof straight>, perceptual: boolean): number {
    const r = perceptual ? perceptualComponent(value.r) : value.r, g = perceptual ? perceptualComponent(value.g) : value.g, b = perceptual ? perceptualComponent(value.b) : value.b;
    return .2126 * r + .7152 * g + .0722 * b;
}
function direction(gx: number, gy: number): number {
    const angle = (Math.atan2(gy, gx) * 180 / Math.PI + 180) % 180;
    return angle < 22.5 || angle >= 157.5 ? 0 : angle < 67.5 ? 1 : angle < 112.5 ? 2 : 3;
}
function nonmaximumNeighbors(direction: number, x: number, y: number): readonly [GFXPoint, GFXPoint] {
    return direction === 0 ? [{ x: x - 1, y }, { x: x + 1, y }]
        : direction === 1 ? [{ x: x - 1, y: y - 1 }, { x: x + 1, y: y + 1 }]
            : direction === 2 ? [{ x, y: y - 1 }, { x, y: y + 1 }]
                : [{ x: x + 1, y: y - 1 }, { x: x - 1, y: y + 1 }];
}
function* calculate(access: ProcessingAccess, grid: GFXRect, settings: CannySettings, kernel: readonly number[]): Generator<void, CannyCache, void> {
    const width = grid.width, height = grid.height, pixels = width * height, radius = (kernel.length - 1) / 2;
    const values = new Float32Array(pixels), horizontal = new Float32Array(pixels), magnitude = new Float32Array(pixels), suppressed = new Float32Array(pixels), directions = new Uint8Array(pixels), edges = new Uint8Array(pixels), queue = new Int32Array(pixels);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const sampled = straight(access.sample(0, { x: grid.x + x + .5, y: grid.y + y + .5 }, "nearest"));
            values[y * width + x] = luminance(sampled, settings.perceptual);
        }
        if ((y + 1) % checkpointRows === 0)
            yield;
    }
    yield;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let sum = 0;
            for (let offset = -radius; offset <= radius; offset++)
                sum += sampleAt(values, width, height, x + offset, y) * kernel[offset + radius]!;
            horizontal[y * width + x] = sum;
        }
        if ((y + 1) % checkpointRows === 0)
            yield;
    }
    yield;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let sum = 0;
            for (let offset = -radius; offset <= radius; offset++)
                sum += sampleAt(horizontal, width, height, x, y + offset) * kernel[offset + radius]!;
            values[y * width + x] = sum;
        }
        if ((y + 1) % checkpointRows === 0)
            yield;
    }
    yield;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const gx = -sampleAt(values, width, height, x - 1, y - 1) + sampleAt(values, width, height, x + 1, y - 1)
                - 2 * sampleAt(values, width, height, x - 1, y) + 2 * sampleAt(values, width, height, x + 1, y)
                - sampleAt(values, width, height, x - 1, y + 1) + sampleAt(values, width, height, x + 1, y + 1);
            const gy = -sampleAt(values, width, height, x - 1, y - 1) - 2 * sampleAt(values, width, height, x, y - 1) - sampleAt(values, width, height, x + 1, y - 1)
                + sampleAt(values, width, height, x - 1, y + 1) + 2 * sampleAt(values, width, height, x, y + 1) + sampleAt(values, width, height, x + 1, y + 1);
            const index = y * width + x;
            magnitude[index] = Math.hypot(gx, gy) / (4 * Math.SQRT2);
            directions[index] = direction(gx, gy);
        }
        if ((y + 1) % checkpointRows === 0)
            yield;
    }
    yield;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = y * width + x, value = magnitude[index]!;
            if (value === 0)
                continue;
            const [previous, next] = nonmaximumNeighbors(directions[index]!, x, y);
            if (value >= sampleAt(magnitude, width, height, previous.x, previous.y) && value > sampleAt(magnitude, width, height, next.x, next.y))
                suppressed[index] = value;
        }
        if ((y + 1) % checkpointRows === 0)
            yield;
    }
    yield;
    let tail = 0;
    for (let index = 0; index < pixels; index++) {
        const value = suppressed[index]!;
        if (value > 0 && value >= settings.thresholdHigh) {
            edges[index] = 2;
            queue[tail++] = index;
        }
        else if (value > 0 && value >= settings.thresholdLow)
            edges[index] = 1;
        if ((index + 1) % checkpointFloodFillEntries === 0)
            yield;
    }
    yield;
    let start = 0;
    for (let pass = 0; pass < settings.hysteresisPasses && start < tail; pass++) {
        const end = tail;
        for (let head = start; head < end; head++) {
            const index = queue[head]!, x = index % width, y = Math.floor(index / width);
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0)
                        continue;
                    const nx = x + dx, ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= width || ny >= height)
                        continue;
                    const neighbor = ny * width + nx;
                    if (edges[neighbor] === 1) {
                        edges[neighbor] = 2;
                        queue[tail++] = neighbor;
                    }
                }
            if ((head + 1) % checkpointFloodFillEntries === 0)
                yield;
        }
        start = end;
        yield;
    }
    return Object.freeze({ grid, width, height, edges });
}
function calculateSynchronously(access: ProcessingAccess, grid: GFXRect, settings: CannySettings, kernel: readonly number[]): CannyCache {
    const iterator = calculate(access, grid, settings, kernel);
    for (;;) {
        const result = iterator.next();
        if (result.done)
            return result.value;
    }
}
async function calculateAsynchronously(access: ProcessingPreparationAccess, grid: GFXRect, settings: CannySettings, kernel: readonly number[]): Promise<CannyCache> {
    const iterator = calculate(access, grid, settings, kernel);
    for (;;) {
        const result = iterator.next();
        if (result.done)
            return result.value;
        await access.checkpoint();
    }
}
function materializedSource(input: import("../IFXImage").IFXImage): CannySource {
    const output = finiteInput(input), left = Math.floor(output.x), top = Math.floor(output.y), right = Math.ceil(output.x + output.width), bottom = Math.ceil(output.y + output.height), width = right - left, height = bottom - top, pixels = width * height;
    if (![left, top, right, bottom, width, height, pixels].every(Number.isSafeInteger) || width <= 0 || height <= 0 || pixels > maximumCannyPixels || pixels * cannyScratchBytesPerPixel > maximumCannyScratchBytes)
        throw new RangeError("Canny input exceeds the 1,048,576-pixel / 22 MiB padded materialization limit.");
    return Object.freeze({ output, grid: Object.freeze({ x: left, y: top, width, height }), pixels });
}
export const canny: Record<string, Definition> = {};
canny.cannyEdgeDetector = { category: "stylize", inputs: 1, normalise: value => {
        const p = fields(value, ["gaussianSigma", "perceptual", "thresholdLow", "thresholdHigh", "hysteresisPasses"]), gaussianSigma = boundedNumber(p.gaussianSigma, 1.6, "Gaussian sigma", 0, 10), thresholdLow = boundedNumber(p.thresholdLow, .02, "thresholdLow", 0, 1), thresholdHigh = boundedNumber(p.thresholdHigh, .05, "thresholdHigh", 0, 1), hysteresisPasses = boundedInteger(p.hysteresisPasses, 1, "hysteresisPasses", 0, 20), perceptual = p.perceptual === undefined ? false : p.perceptual;
        if (typeof perceptual !== "boolean")
            throw new TypeError("Canny perceptual must be boolean.");
        if (thresholdLow > thresholdHigh)
            throw new RangeError("Canny thresholdLow must not exceed thresholdHigh.");
        return { gaussianSigma, perceptual, thresholdLow, thresholdHigh, hysteresisPasses };
    }, build: (inputs, p) => {
        const source = materializedSource(inputs[0]!), settings: CannySettings = Object.freeze({ gaussianSigma: p.gaussianSigma as number, perceptual: p.perceptual as boolean, thresholdLow: p.thresholdLow as number, thresholdHigh: p.thresholdHigh as number, hysteresisPasses: p.hysteresisPasses as number }), kernel = gaussianKernel(settings.gaussianSigma), estimatedWork = source.pixels * (2 * kernel.length + 32);
        if (!Number.isSafeInteger(estimatedWork) || estimatedWork > maximumCannyWork)
            throw new RangeError("Canny configuration exceeds the bounded processing work limit.");
        const cacheToken = Object.freeze({}), cached = (access: ProcessingAccess): CannyCache => {
            const value = access.getState<CannyCache>(cacheToken);
            // Direct IFXSampler use falls back to this bounded synchronous calculation; task cancellation is cooperative through prepare().
            return value ?? access.setState(cacheToken, calculateSynchronously(access, source.grid, settings, kernel));
        };
        return processor("cannyEdgeDetector", p, finiteExtent(source.output), (position, access) => {
            const cache = cached(access), x = Math.floor(position.x - cache.grid.x), y = Math.floor(position.y - cache.grid.y);
            return x < 0 || y < 0 || x >= cache.width || y >= cache.height || cache.edges[y * cache.width + x] !== 2 ? black : white;
        }, () => [source.output], async access => {
            if (!access.getState<CannyCache>(cacheToken))
                access.setState(cacheToken, await calculateAsynchronously(access, source.grid, settings, kernel));
        }, Object.freeze({
            scope: "global" as const,
            scratchBytes: source.pixels * cannyScratchBytesPerPixel,
            work: estimatedWork,
        }));
    } };
