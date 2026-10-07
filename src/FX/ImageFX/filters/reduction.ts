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

import type { GFXRect } from "../../GraphicsFX/GFXGeometry";
import { finiteExtent, pixelRect } from "../extent";
import type { IFXPremultipliedSample as Sample } from "../IFXSampler";
import type { ProcessingAccess, ProcessingPreparationAccess } from "../processing";
import { fields, finiteInput, integer, number, rect, processor, straight, clamp, type Definition } from "./common";

const maximumReductionPixels = 65_536;
const maximumReductionOutputCells = 65_536;
const maximumReductionWork = maximumReductionPixels + maximumReductionOutputCells;
const checkpointCells = 1_024;
const transparent: Sample = Object.freeze({ r: 0, g: 0, b: 0, a: 0 });
const opaqueBlack: Sample = Object.freeze({ r: 0, g: 0, b: 0, a: 1 });
const channelKeys = ["r", "g", "b", "a"] as const;

type AreaOperation = "areaAverage" | "areaMinimum" | "areaMaximum" | "areaHistogram" | "areaLogarithmicHistogram" | "areaMaximumAlpha" | "areaMinimumAlpha" | "areaMinMax" | "areaMinMaxRed" | "rowAverage" | "columnAverage";
type AreaParameters = Readonly<{
    extent: GFXRect;
    bins?: number;
    count?: number;
    minimumStop?: number;
    maximumStop?: number;
    scale?: number;
}>;
type ReductionCache = Readonly<{
    width: number;
    height: number;
    values: readonly Sample[];
}>;

function selectedExtent(value: unknown): GFXRect {
    const extent = pixelRect(rect(value)), pixels = extent.width * extent.height;
    if (!Number.isSafeInteger(pixels) || pixels > maximumReductionPixels)
        throw new RangeError("Reduction region exceeds 65,536 pixels.");
    return extent;
}
function checkedOutput(width: number, height: number, analysisCells: number): Readonly<{ width: number; height: number; cells: number; }> {
    const cells = width * height, work = analysisCells + cells;
    if (![width, height, cells, work].every(Number.isSafeInteger) || width < 1 || height < 1 || cells > maximumReductionOutputCells)
        throw new RangeError("Reduction output exceeds the 65,536-cell bound.");
    if (work > maximumReductionWork)
        throw new RangeError("Reduction configuration exceeds the bounded analysis and output work limit.");
    return Object.freeze({ width, height, cells });
}
function outputForArea(name: AreaOperation, parameters: AreaParameters): Readonly<{ width: number; height: number; }> {
    if (name === "areaHistogram")
        return { width: parameters.bins!, height: 1 };
    if (name === "areaLogarithmicHistogram")
        return { width: parameters.count!, height: 1 };
    if (name === "areaMinMax" || name === "areaMinMaxRed")
        return { width: 2, height: 1 };
    if (name === "rowAverage")
        return { width: 1, height: parameters.extent.height };
    if (name === "columnAverage")
        return { width: parameters.extent.width, height: 1 };
    return { width: 1, height: 1 };
}
function cache(width: number, height: number, values: readonly Sample[]): ReductionCache {
    if (values.length !== width * height)
        throw new RangeError("Reduction cache shape is invalid.");
    return Object.freeze({ width, height, values: Object.freeze([...values]) });
}
function synchronous<T>(calculation: Generator<void, T, void>): T {
    for (;;) {
        const result = calculation.next();
        if (result.done)
            return result.value;
    }
}
async function asynchronous<T>(access: ProcessingPreparationAccess, calculation: Generator<void, T, void>): Promise<T> {
    for (;;) {
        const result = calculation.next();
        if (result.done)
            return result.value;
        await access.checkpoint();
    }
}
function sampleAt(access: ProcessingAccess, extent: GFXRect, x: number, y: number): Sample {
    return access.sample(0, { x: extent.x + x + .5, y: extent.y + y + .5 }, "nearest");
}
function reductionBin(value: number, count: number): number {
    return Math.min(count - 1, Math.floor(clamp(value) * count));
}
function logarithmicBin(value: number, count: number, minimumStop: number, maximumStop: number): number {
    const stop = Math.log2(Math.max(value, Number.MIN_VALUE));
    return Math.min(count - 1, Math.floor(clamp((stop - minimumStop) / (maximumStop - minimumStop)) * count));
}
function *calculateArea(access: ProcessingAccess, name: AreaOperation, parameters: AreaParameters, width: number, height: number): Generator<void, ReductionCache, void> {
    const extent = parameters.extent, pixels = extent.width * extent.height;
    let work = 0;
    if (name === "areaAverage" || name === "areaMinimum" || name === "areaMaximum") {
        const value: { r: number; g: number; b: number; a: number; } = name === "areaMinimum" ? { r: 1, g: 1, b: 1, a: 1 } : { r: 0, g: 0, b: 0, a: 0 };
        for (let y = 0; y < extent.height; y++)
            for (let x = 0; x < extent.width; x++) {
                const source = sampleAt(access, extent, x, y);
                for (const key of channelKeys) {
                    if (name === "areaMinimum")
                        value[key] = Math.min(value[key], source[key]);
                    else if (name === "areaMaximum")
                        value[key] = Math.max(value[key], source[key]);
                    else
                        value[key] += source[key] / pixels;
                }
                if (++work % checkpointCells === 0)
                    yield;
            }
        return cache(width, height, [value]);
    }
    if (name === "areaHistogram" || name === "areaLogarithmicHistogram") {
        const count = name === "areaHistogram" ? parameters.bins! : parameters.count!, values = Array.from({ length: count }, () => ({ r: 0, g: 0, b: 0, a: 1 }));
        for (let y = 0; y < extent.height; y++)
            for (let x = 0; x < extent.width; x++) {
                const source = straight(sampleAt(access, extent, x, y));
                for (const key of ["r", "g", "b"] as const) {
                    const bin = name === "areaHistogram" ? reductionBin(source[key], count) : logarithmicBin(source[key], count, parameters.minimumStop!, parameters.maximumStop!);
                    values[bin]![key] += 1;
                }
                if (++work % checkpointCells === 0)
                    yield;
            }
        const scale = name === "areaLogarithmicHistogram" ? parameters.scale! : 1;
        return cache(width, height, values.map(value => ({ r: value.r * scale / pixels, g: value.g * scale / pixels, b: value.b * scale / pixels, a: 1 })));
    }
    if (name === "areaMaximumAlpha" || name === "areaMinimumAlpha") {
        let alpha = name === "areaMinimumAlpha" ? 1 : 0;
        for (let y = 0; y < extent.height; y++)
            for (let x = 0; x < extent.width; x++) {
                const source = sampleAt(access, extent, x, y);
                alpha = name === "areaMinimumAlpha" ? Math.min(alpha, source.a) : Math.max(alpha, source.a);
                if (++work % checkpointCells === 0)
                    yield;
            }
        return cache(width, height, [{ r: 0, g: 0, b: 0, a: alpha }]);
    }
    if (name === "areaMinMax") {
        const minimum = { r: 1, g: 1, b: 1, a: 1 }, maximum = { r: 0, g: 0, b: 0, a: 0 };
        for (let y = 0; y < extent.height; y++)
            for (let x = 0; x < extent.width; x++) {
                const source = sampleAt(access, extent, x, y);
                for (const key of channelKeys) {
                    minimum[key] = Math.min(minimum[key], source[key]);
                    maximum[key] = Math.max(maximum[key], source[key]);
                }
                if (++work % checkpointCells === 0)
                    yield;
            }
        return cache(width, height, [minimum, maximum]);
    }
    if (name === "areaMinMaxRed") {
        let minimum = 1, maximum = 0;
        for (let y = 0; y < extent.height; y++)
            for (let x = 0; x < extent.width; x++) {
                const red = straight(sampleAt(access, extent, x, y)).r;
                minimum = Math.min(minimum, red);
                maximum = Math.max(maximum, red);
                if (++work % checkpointCells === 0)
                    yield;
            }
        return cache(width, height, [{ r: minimum, g: 0, b: 0, a: 1 }, { r: maximum, g: 0, b: 0, a: 1 }]);
    }
    const values: Sample[] = [];
    if (name === "rowAverage") {
        for (let y = 0; y < extent.height; y++) {
            const sum = { r: 0, g: 0, b: 0, a: 0 };
            for (let x = 0; x < extent.width; x++) {
                const source = sampleAt(access, extent, x, y);
                for (const key of channelKeys)
                    sum[key] += source[key] / extent.width;
                if (++work % checkpointCells === 0)
                    yield;
            }
            values.push(sum);
        }
    }
    else {
        for (let x = 0; x < extent.width; x++) {
            const sum = { r: 0, g: 0, b: 0, a: 0 };
            for (let y = 0; y < extent.height; y++) {
                const source = sampleAt(access, extent, x, y);
                for (const key of channelKeys)
                    sum[key] += source[key] / extent.height;
                if (++work % checkpointCells === 0)
                    yield;
            }
            values.push(sum);
        }
    }
    return cache(width, height, values);
}
function normaliseArea(name: AreaOperation, value: unknown): AreaParameters {
    const allowed = name === "areaHistogram" ? ["extent", "bins"] : name === "areaLogarithmicHistogram" ? ["extent", "count", "minimumStop", "maximumStop", "scale"] : ["extent"];
    const parameters = fields(value, allowed), extent = selectedExtent(parameters.extent);
    if (name === "areaHistogram")
        return { extent, bins: integer(parameters.bins, 256, 2, 256) };
    if (name === "areaLogarithmicHistogram") {
        const count = integer(parameters.count, 64, 2, 256), minimumStop = number(parameters.minimumStop, -10, -32, 32), maximumStop = number(parameters.maximumStop, 4, -32, 32), scale = number(parameters.scale, 1, 0, 1);
        if (minimumStop >= maximumStop)
            throw new RangeError("Logarithmic histogram minimumStop must be lower than maximumStop.");
        return { extent, count, minimumStop, maximumStop, scale };
    }
    return { extent };
}
function areaDefinition(name: AreaOperation): Definition {
    return { category: "reduction", inputs: 1, normalise: value => normaliseArea(name, value), build: (_inputs, parameters) => {
            const p = parameters as AreaParameters, shape = outputForArea(name, p), checked = checkedOutput(shape.width, shape.height, p.extent.width * p.extent.height), cacheToken = Object.freeze({});
            const cached = (access: ProcessingAccess) => access.getState<ReductionCache>(cacheToken) ?? access.setState(cacheToken, synchronous(calculateArea(access, name, p, checked.width, checked.height)));
            return processor(name, p, finiteExtent({ x: 0, y: 0, width: checked.width, height: checked.height }), (position, access) => {
                const x = Math.floor(position.x), y = Math.floor(position.y), value = cached(access).values[y * checked.width + x];
                return value ?? transparent;
            }, () => [p.extent], async access => {
                if (!access.getState<ReductionCache>(cacheToken))
                    access.setState(cacheToken, await asynchronous(access, calculateArea(access, name, p, checked.width, checked.height)));
            });
        } };
}

function normaliseHistogramDisplay(value: unknown): Readonly<{ height: number; lowLimit: number; highLimit: number; }> {
    const parameters = fields(value, ["height", "lowLimit", "highLimit"]), height = integer(parameters.height, 100, 1, maximumReductionOutputCells), lowLimit = number(parameters.lowLimit, 0, 0, 1), highLimit = number(parameters.highLimit, 1, 0, 1);
    if (lowLimit >= highLimit)
        throw new RangeError("Histogram display lowLimit must be lower than highLimit.");
    return { height, lowLimit, highLimit };
}
function *calculateHistogramDisplay(access: ProcessingAccess, source: GFXRect, width: number, height: number, lowLimit: number, highLimit: number): Generator<void, ReductionCache, void> {
    const columns: Sample[] = [], values: Sample[] = [];
    let work = 0;
    for (let x = 0; x < width; x++) {
        columns.push(straight(sampleAt(access, source, x, 0)));
        if (++work % checkpointCells === 0)
            yield;
    }
    const visible = (value: number, y: number) => y < height * clamp((value - lowLimit) / (highLimit - lowLimit));
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const column = columns[x]!;
            values.push({ r: visible(column.r, y) ? 1 : 0, g: visible(column.g, y) ? 1 : 0, b: visible(column.b, y) ? 1 : 0, a: 1 });
            if (++work % checkpointCells === 0)
                yield;
        }
    return cache(width, height, values);
}

export const reduction: Record<string, Definition> = {};
for (const name of ["areaAverage", "areaMinimum", "areaMaximum", "areaHistogram", "areaLogarithmicHistogram", "areaMaximumAlpha", "areaMinimumAlpha", "areaMinMax", "areaMinMaxRed", "rowAverage", "columnAverage"] as const)
    reduction[name] = areaDefinition(name);
reduction.histogramDisplay = { category: "reduction", inputs: 1, normalise: normaliseHistogramDisplay, build: (inputs, parameters) => {
        const p = parameters as Readonly<{ height: number; lowLimit: number; highLimit: number; }>, source = pixelRect(finiteInput(inputs[0]!));
        if (source.height !== 1)
            throw new RangeError("Histogram display requires a one-row finite histogram image.");
        const checked = checkedOutput(source.width, p.height, source.width), cacheToken = Object.freeze({});
        const cached = (access: ProcessingAccess) => access.getState<ReductionCache>(cacheToken) ?? access.setState(cacheToken, synchronous(calculateHistogramDisplay(access, source, checked.width, checked.height, p.lowLimit, p.highLimit)));
        return processor("histogramDisplay", p, finiteExtent({ x: 0, y: 0, width: checked.width, height: checked.height }), (position, access) => {
            const x = Math.floor(position.x), y = Math.floor(position.y), value = cached(access).values[y * checked.width + x];
            return value ?? opaqueBlack;
        }, () => [source], async access => {
            if (!access.getState<ReductionCache>(cacheToken))
                access.setState(cacheToken, await asynchronous(access, calculateHistogramDisplay(access, source, checked.width, checked.height, p.lowLimit, p.highLimit)));
        });
    } };
