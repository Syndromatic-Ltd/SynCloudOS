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

import { convertColourComponents, GFXColour } from "../GraphicsFX/GFXColour";
import { borrowGFXImageBytes, bytePixelComponents, type GFXImage } from "../GraphicsFX/GFXImage";
import { namedColourTransform } from "../GraphicsFX/namedColourTransform";
import { GFXFloatImage } from "../GraphicsFX/GFXFloatImage";
import type { GFXColourSpace, GFXRGBAComponents } from "../GraphicsFX/colourTypes";
import { intersectRects, normalisePoint, normaliseRect, transformPoint, transformRect, type GFXPoint, type GFXRect } from "../GraphicsFX/GFXGeometry";
import type { GFXInterpolation } from "../GraphicsFX/GFXImage";
import { imageNode, IFXImage, type ImageNode } from "./IFXImage";
import type { ImageProcessor, ProcessingAccess, ProcessingPreparationAccess } from "./processing";
export type IFXPremultipliedSample = Readonly<{
    r: number;
    g: number;
    b: number;
    a: number;
}>;
const transparent: IFXPremultipliedSample = Object.freeze({ r: 0, g: 0, b: 0, a: 0 });
type SampleBounds = Readonly<{ image: IFXImage; rect: GFXRect; }>;
type OperationNode = Extract<ImageNode, { kind: "operation"; }>;
type PreparationNode = Readonly<{ image: IFXImage; node: OperationNode }>;
export interface IFXPreparationRequirements {
    readonly scratchBytes: number;
    readonly work: number;
    readonly globalPreparationCount: number;
}
function contains(rect: GFXRect, x: number, y: number): boolean {
    return x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height;
}
export function workingColour(colour: GFXColour, space: GFXColourSpace): IFXPremultipliedSample {
    const c = colour.converting(space).components;
    return { r: c.r * c.a, g: c.g * c.a, b: c.b * c.a, a: c.a };
}
export function componentColour(c: GFXRGBAComponents, space: GFXColourSpace): GFXColour {
    return space === "linear-srgb" ? GFXColour.linearSRGB(c.r, c.g, c.b, c.a) : space === "display-p3" ? GFXColour.displayP3(c.r, c.g, c.b, c.a) : GFXColour.rgba(c.r, c.g, c.b, c.a);
}
function workingExtended(c: GFXRGBAComponents, from: GFXColourSpace, to: GFXColourSpace): IFXPremultipliedSample {
    const converted = namedColourTransform(from, to, "preserve", "none").apply(c);
    return { r: converted.r * converted.a, g: converted.g * converted.a, b: converted.b * converted.a, a: converted.a };
}
/** Byte pixels in any space other than linear-sRGB or Display P3 are sampled
 * as sRGB components (as `componentColour` does). */
function sampledByteSpace(space: GFXColourSpace): GFXColourSpace {
    return space === "linear-srgb" || space === "display-p3" ? space : "srgb";
}
/** `workingColour(componentColour(pixels.pixel(x, y), space), working)` without
 * allocating a pixel record or colour objects per sample; same arithmetic. */
function workingByte(pixels: GFXImage, bytes: Uint8Array, px: number, py: number, working: GFXColourSpace): IFXPremultipliedSample {
    const from = sampledByteSpace(pixels.colourSpace);
    const straight = bytePixelComponents(bytes, py * pixels.bytesPerRow + px * pixels.bytesPerPixel, pixels.pixelFormat, pixels.alpha);
    const c = from === working ? straight : convertColourComponents(straight, from, working);
    return { r: c.r * c.a, g: c.g * c.a, b: c.b * c.a, a: c.a };
}
/** One render-local memo: identity, coordinate and interpolation are the cache key. */
export class IFXSampler {
    readonly #memo = new Map<IFXImage, Map<string, IFXPremultipliedSample>>();
    /** Working-space value of each constant node, resolved once per render. */
    readonly #constants = new Map<IFXImage, IFXPremultipliedSample>();
    #states = new WeakMap<ImageProcessor, Map<object, unknown>>();
    #evaluations = 0;
    #cacheHits = 0;
    #requests = 0;
    #cacheEntries = 0;
    #cacheEvictions = 0;
    readonly #memoOrder: Array<Readonly<{ memo: Map<string, IFXPremultipliedSample>; key: string }>> = [];
    #memoHead = 0;
    get evaluations() {
        return this.#evaluations;
    }
    get cacheHits() {
        return this.#cacheHits;
    }
    get requests() { return this.#requests; }
    get cacheEntries() { return this.#cacheEntries; }
    get cacheEvictions() { return this.#cacheEvictions; }
    get estimatedCacheBytes() { return this.#cacheEntries * 64; }
    constructor(readonly image: IFXImage, readonly workingColourSpace: GFXColourSpace = "linear-srgb", readonly maximumSamples = 2 * 1024 * 1024, readonly maximumWork = maximumSamples * 32, readonly maximumMemoEntries = maximumSamples) {
        imageNode(image);
        GFXColour.rgba(0, 0, 0).converting(workingColourSpace);
        if (!Number.isSafeInteger(maximumSamples) || maximumSamples < 1 || maximumSamples > 16 * 1024 * 1024)
            throw new RangeError("Invalid sample budget.");
        if (!Number.isSafeInteger(maximumWork) || maximumWork < 1 || maximumWork > 1024 * 1024 * 1024)
            throw new RangeError("Invalid sampling work budget.");
        if (!Number.isSafeInteger(maximumMemoEntries) || maximumMemoEntries < 0 || maximumMemoEntries > 16 * 1024 * 1024)
            throw new RangeError("Invalid memo cache budget.");
        Object.freeze(this);
    }
    sample(position: GFXPoint, interpolation: GFXInterpolation = "linear"): IFXPremultipliedSample {
        if (interpolation !== "linear" && interpolation !== "nearest")
            throw new TypeError("Unknown interpolation.");
        return Object.freeze({ ...this.#sample(this.image, normalisePoint(position), interpolation, 0) });
    }
    #statesFor(processor: ImageProcessor): Map<object, unknown> {
        let states = this.#states.get(processor);
        if (!states) {
            states = new Map();
            this.#states.set(processor, states);
        }
        return states;
    }
    #access(node: OperationNode, mode: GFXInterpolation, depth: number): ProcessingAccess;
    #access(node: OperationNode, mode: GFXInterpolation, depth: number, checkpoint: () => Promise<void>): ProcessingPreparationAccess;
    #access(node: OperationNode, mode: GFXInterpolation, depth: number, checkpoint?: () => Promise<void>): ProcessingAccess | ProcessingPreparationAccess {
        const states = this.#statesFor(node.processor), input = (index: number): IFXImage => {
            if (!Number.isSafeInteger(index) || !node.inputs[index])
                throw new RangeError("Processor input is outside its declared inputs.");
            return node.inputs[index]!;
        }, state = (token: object): Map<object, unknown> => {
            if (!token || (typeof token !== "object" && typeof token !== "function"))
                throw new TypeError("Processor state token must be an object.");
            return states;
        }, access: ProcessingAccess = {
            sample: (index, position, interpolation = mode) => this.#sample(input(index), normalisePoint(position), interpolation, depth + 1),
            sampleWithin: (index, position, bounds, interpolation = mode) => {
                const source = input(index);
                return this.#sample(source, normalisePoint(position), interpolation, depth + 1, { image: source, rect: bounds });
            },
            getState: <T>(token: object): T | undefined => state(token).get(token) as T | undefined,
            setState: <T>(token: object, value: T): T => {
                state(token).set(token, value);
                return value;
            },
        };
        return checkpoint ? Object.freeze({ ...access, checkpoint }) : access;
    }
    #preparationNodes(bounds?: GFXRect): readonly PreparationNode[] {
        const requested = bounds === undefined
            ? this.image.extent.kind === "finite" ? this.image.extent.rect : undefined
            : normaliseRect(bounds);
        if (requested && (requested.width === 0 || requested.height === 0))
            return Object.freeze([]);
        const complete = new Set<IFXImage>(), visiting = new Set<IFXImage>(), prepared: PreparationNode[] = [];
        let graphWork = 0;
        const visit = (image: IFXImage, region: GFXRect | undefined, depth: number): void => {
            if (complete.has(image))
                return;
            if (visiting.has(image))
                throw new RangeError("Image preparation graph contains a cycle.");
            if (++graphWork > 4096 || depth > 128)
                throw new RangeError("Image preparation graph exceeds its work limit.");
            if (image.extent.kind === "finite" && region) {
                const clipped = intersectRects(region, image.extent.rect);
                if (!clipped || clipped.width === 0 || clipped.height === 0)
                    return;
                region = clipped;
            }
            else if (!region && image.extent.kind === "finite")
                region = image.extent.rect;
            visiting.add(image);
            try {
                const node = imageNode(image);
                if (node.kind === "operation") {
                    if (!region && node.processor.preparation?.scope !== "global")
                        throw new RangeError("Regional preparation requires finite output bounds.");
                    const inputRegions = region ? node.processor.regions(region) : node.inputs.map(input => input.extent.kind === "finite" ? input.extent.rect : undefined);
                    if (inputRegions.length !== node.inputs.length)
                        throw new RangeError("Invalid processor ROI count.");
                    node.inputs.forEach((input, index) => {
                        const inputRegion = inputRegions[index];
                        if (inputRegion)
                            visit(input, normaliseRect(inputRegion), depth + 1);
                        else if (node.processor.preparation?.scope === "global")
                            visit(input, undefined, depth + 1);
                    });
                    if (node.processor.prepare || node.processor.preparation)
                        prepared.push(Object.freeze({ image, node }));
                }
                else if (node.kind === "crop")
                    visit(node.input, region, depth + 1);
                else if (node.kind === "transform") {
                    if (!region)
                        visit(node.input, undefined, depth + 1);
                    else {
                        let sourceRegion = transformRect(region, node.inverse);
                        if (node.interpolation === "linear")
                            sourceRegion = { x: sourceRegion.x - 0.5, y: sourceRegion.y - 0.5, width: sourceRegion.width + 1, height: sourceRegion.height + 1 };
                        visit(node.input, sourceRegion, depth + 1);
                    }
                }
                else if (node.kind === "clamp") {
                    if (node.input.extent.kind !== "finite")
                        throw new Error("Invalid clamp extent.");
                    visit(node.input, node.input.extent.rect, depth + 1);
                }
                else if (node.kind === "over") {
                    visit(node.foreground, region, depth + 1);
                    visit(node.background, region, depth + 1);
                }
                complete.add(image);
            }
            finally {
                visiting.delete(image);
            }
        };
        visit(this.image, requested, 0);
        return Object.freeze(prepared);
    }
    preparationRequirements(bounds?: GFXRect): IFXPreparationRequirements {
        let scratchBytes = 0, work = 0, globalPreparationCount = 0;
        for (const { node } of this.#preparationNodes(bounds)) {
            const preparation = node.processor.preparation;
            if (!preparation)
                continue;
            if (!Number.isSafeInteger(preparation.scratchBytes) || preparation.scratchBytes < 0 || !Number.isSafeInteger(preparation.work) || preparation.work < 0)
                throw new RangeError("Invalid processor preparation budget declaration.");
            scratchBytes = Math.max(scratchBytes, preparation.scratchBytes);
            work += preparation.work;
            if (!Number.isSafeInteger(work))
                throw new RangeError("Processor preparation work budget overflows.");
            if (preparation.scope === "global")
                globalPreparationCount += 1;
        }
        return Object.freeze({ scratchBytes, work, globalPreparationCount });
    }
    /** Prepares only DAG dependencies that can contribute to the requested output bounds. */
    async prepare(check: () => void = () => undefined, bounds?: GFXRect): Promise<void> {
        if (typeof check !== "function")
            throw new TypeError("Preparation check must be a function.");
        const checkpoint = async () => {
            check();
            await new Promise<void>(resolve => setTimeout(resolve, 0));
            check();
        };
        for (const { node } of this.#preparationNodes(bounds)) {
            check();
            await node.processor.prepare?.(this.#access(node, "linear", 0, checkpoint));
            check();
        }
    }
    #memoize(memo: Map<string, IFXPremultipliedSample>, key: string, value: IFXPremultipliedSample): IFXPremultipliedSample {
        if (this.maximumMemoEntries === 0)
            return value;
        if (memo.has(key))
            return memo.get(key)!;
        while (this.#cacheEntries >= this.maximumMemoEntries && this.#memoHead < this.#memoOrder.length) {
            const oldest = this.#memoOrder[this.#memoHead++]!;
            if (oldest.memo.delete(oldest.key)) {
                this.#cacheEntries -= 1;
                this.#cacheEvictions += 1;
            }
        }
        if (this.#memoHead > 4096 && this.#memoHead * 2 > this.#memoOrder.length) {
            this.#memoOrder.splice(0, this.#memoHead);
            this.#memoHead = 0;
        }
        if (this.#cacheEntries < this.maximumMemoEntries) {
            memo.set(key, value);
            this.#memoOrder.push(Object.freeze({ memo, key }));
            this.#cacheEntries += 1;
        }
        return value;
    }
    #sample(image: IFXImage, p: GFXPoint, mode: GFXInterpolation, depth: number, bounds?: SampleBounds): IFXPremultipliedSample {
        if (++this.#requests > this.maximumWork)
            throw new RangeError("Graph sampling work budget exceeded.");
        if (depth > 128)
            throw new RangeError("Graph depth exceeds 128.");
        const selected = bounds?.image === image ? bounds.rect : undefined;
        let memo = this.#memo.get(image);
        if (!memo) {
            memo = new Map();
            this.#memo.set(image, memo);
        }
        const key = `${p.x},${p.y},${mode}${selected ? `,${selected.x},${selected.y},${selected.width},${selected.height}` : ""}`;
        const cached = memo.get(key);
        if (cached) {
            this.#cacheHits++;
            return cached;
        }
        if (++this.#evaluations > this.maximumSamples)
            throw new RangeError("Graph sample budget exceeded.");
        const extent = image.extent;
        if (selected && !contains(selected, p.x, p.y) || extent.kind === "finite" && !contains(extent.rect, p.x, p.y)) {
            return this.#memoize(memo, key, transparent);
        }
        const node = imageNode(image);
        let result: IFXPremultipliedSample;
        if (node.kind === "operation") {
            result = node.processor.evaluate(p, this.#access(node, mode, depth));
            if (![result.r, result.g, result.b, result.a].every(Number.isFinite))
                throw new RangeError("Processor returned nonfinite pixels.");
            const alpha = Math.max(0, Math.min(1, result.a));
            result = { r: alpha === 0 ? 0 : result.r, g: alpha === 0 ? 0 : result.g, b: alpha === 0 ? 0 : result.b, a: alpha };
        }
        else if (node.kind === "constant") {
            let constant = this.#constants.get(image);
            if (!constant) {
                constant = Object.freeze(workingColour(node.colour, this.workingColourSpace));
                this.#constants.set(image, constant);
            }
            result = constant;
        }
        else if (node.kind === "pixels") {
            const x = p.x - node.origin.x, y = p.y - node.origin.y;
            const pixels = node.pixels;
            const bytes = pixels instanceof GFXFloatImage ? null : borrowGFXImageBytes(pixels);
            const read = (px: number, py: number) => px < 0 || py < 0 || px >= pixels.width || py >= pixels.height || selected && !contains(selected, node.origin.x + px + .5, node.origin.y + py + .5)
                ? transparent
                : pixels instanceof GFXFloatImage
                    ? workingExtended(pixels.pixel(px, py), pixels.colourSpace, this.workingColourSpace)
                    : workingByte(pixels, bytes!, px, py, this.workingColourSpace);
            if (mode === "nearest")
                result = read(Math.floor(x), Math.floor(y));
            else {
                const ix = Math.floor(x - 0.5), iy = Math.floor(y - 0.5), fx = x - 0.5 - ix, fy = y - 0.5 - iy;
                const values = [read(ix, iy), read(ix + 1, iy), read(ix, iy + 1), read(ix + 1, iy + 1)], weights = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
                const c = { r: 0, g: 0, b: 0, a: 0 };
                for (let i = 0; i < 4; i++) {
                    c.r += values[i]!.r * weights[i]!;
                    c.g += values[i]!.g * weights[i]!;
                    c.b += values[i]!.b * weights[i]!;
                    c.a += values[i]!.a * weights[i]!;
                }
                result = c;
            }
        }
        else if (node.kind === "crop") {
            const crop = selected && intersectRects(selected, node.rect);
            result = selected ? crop ? this.#sample(node.input, p, mode, depth + 1, { image: node.input, rect: crop }) : transparent : this.#sample(node.input, p, mode, depth + 1);
        }
        else if (node.kind === "transform")
            result = this.#sample(node.input, transformPoint(p, node.inverse), node.interpolation, depth + 1);
        else if (node.kind === "clamp") {
            const e = node.input.extent;
            if (e.kind !== "finite")
                throw new Error("Invalid clamp extent.");
            result = this.#sample(node.input, { x: Math.max(e.rect.x + Math.min(0.5, e.rect.width / 2), Math.min(e.rect.x + e.rect.width - Math.min(0.5, e.rect.width / 2), p.x)), y: Math.max(e.rect.y + Math.min(0.5, e.rect.height / 2), Math.min(e.rect.y + e.rect.height - Math.min(0.5, e.rect.height / 2), p.y)) }, mode, depth + 1);
        }
        else {
            const a = this.#sample(node.foreground, p, mode, depth + 1), b = this.#sample(node.background, p, mode, depth + 1), f = 1 - a.a;
            result = { r: a.r + b.r * f, g: a.g + b.g * f, b: a.b + b.b * f, a: a.a + b.a * f };
        }
        return this.#memoize(memo, key, result);
    }
    /** Drops tile-local sample memoization while preserving prepared processor state and cumulative diagnostics. */
    clearMemo(): void {
        this.#memo.clear();
        this.#memoOrder.length = 0;
        this.#memoHead = 0;
        this.#cacheEntries = 0;
    }
    clear(): void {
        this.clearMemo();
        this.#constants.clear();
        this.#states = new WeakMap();
        this.#evaluations = 0;
        this.#cacheHits = 0;
        this.#requests = 0;
        this.#cacheEvictions = 0;
    }
}
