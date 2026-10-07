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

import { GFXImage, type GFXInterpolation } from "../GraphicsFX/GFXImage";
import type { GFXColourSpace } from "../GraphicsFX/colourTypes";
import { GFXColour } from "../GraphicsFX/GFXColour";
import type { GFXColourTransform } from "../GraphicsFX/GFXColourTransform";
import { namedColourTransform } from "../GraphicsFX/namedColourTransform";
import { finiteExtent } from "./extent";
import { IFXImage, imageNode } from "./IFXImage";
import { IFXSampler } from "./IFXSampler";
import { IFXRenderDestination, beginDestination, assertDestination, publishDestination } from "./IFXRenderDestination";
import { IFXRenderTask, type IFXRenderResult } from "./IFXRenderTask";
import { IFXTilePlan } from "./IFXTilePlan";
import { IFXTileCache, ifxTileCacheKey } from "./IFXTileCache";
import { IFXTileRenderDestination, assertTileDestination, beginTileDestination, publishTileDestination } from "./IFXTileRenderDestination";
export interface IFXRenderOptions {
    readonly signal?: AbortSignal;
    readonly interpolation?: GFXInterpolation;
}
export interface IFXContextBudgets {
    readonly outputBytes?: number;
    readonly scratchBytes?: number;
    readonly cacheBytes?: number;
    readonly work?: number;
    readonly tileSize?: number;
}
export interface IFXResolvedContextBudgets {
    readonly outputBytes: number;
    readonly scratchBytes: number;
    readonly cacheBytes: number;
    readonly work: number;
    readonly tileSize: number;
}
export interface IFXTileRenderInfo {
    readonly width: number;
    readonly height: number;
    readonly sampleEvaluations: number;
    readonly cacheHits: number;
    readonly backend: "cpu";
    readonly tileCount: number;
    readonly logicalOutputBytes: number;
    readonly peakBytes: Readonly<{ output: number; scratch: number; cache: number }>;
    readonly work: number;
    readonly globalPreparationCount: number;
    readonly tileCacheHits: number;
    readonly tileCacheEvictions: number;
}
const maximumBudgetBytes = 1024 * 1024 * 1024;
function budget(value: number | undefined, fallback: number, label: string, maximum = maximumBudgetBytes): number {
    const selected = value ?? fallback;
    if (!Number.isSafeInteger(selected) || selected < 0 || selected > maximum)
        throw new RangeError(`Invalid ${label} budget.`);
    return selected;
}
function resolvedBudgets(maximumSamples: number, value: IFXContextBudgets): IFXResolvedContextBudgets {
    if (!value || typeof value !== "object")
        throw new TypeError("Rendering budgets must be an object.");
    const tileSize = budget(value.tileSize, 128, "tile size", 1024);
    if (tileSize < 1)
        throw new RangeError("Invalid tile size budget.");
    return Object.freeze({
        outputBytes: budget(value.outputBytes, 256 * 1024 * 1024, "output byte"),
        scratchBytes: budget(value.scratchBytes, 32 * 1024 * 1024, "scratch byte"),
        cacheBytes: budget(value.cacheBytes, 16 * 1024 * 1024, "cache byte"),
        work: budget(value.work, maximumSamples * 32, "work", 1024 * 1024 * 1024),
        tileSize,
    });
}
/** The working-to-destination conversion for byte output. Shared per option
 * set; resolved once per render rather than per pixel. */
function outputTransform(workingColourSpace: GFXColourSpace, colourSpace: GFXColourSpace): GFXColourTransform {
    return namedColourTransform(workingColourSpace, colourSpace, "clip", "clip");
}
function renderPixel(
    bytes: Uint8Array,
    index: number,
    value: Readonly<{ r: number; g: number; b: number; a: number }>,
    transform: GFXColourTransform,
    alpha: "straight" | "opaque" | "premultiplied",
): void {
    const a = value.a;
    const c = transform.apply({ r: a ? value.r / a : 0, g: a ? value.g / a : 0, b: a ? value.b / a : 0, a });
    const factor = alpha === "premultiplied" ? a : 1;
    bytes[index] = Math.round(c.r * factor * 255);
    bytes[index + 1] = Math.round(c.g * factor * 255);
    bytes[index + 2] = Math.round(c.b * factor * 255);
    bytes[index + 3] = alpha === "opaque" ? 255 : Math.round(a * 255);
}
function defaultDestination(image: IFXImage): IFXRenderDestination {
    imageNode(image);
    if (image.extent.kind !== "finite")
        throw new RangeError("Infinite image requires explicit destination.");
    const r = image.extent.rect;
    if (r.width === 0 || r.height === 0)
        throw new RangeError("Empty image requires explicit destination.");
    const x = Math.floor(r.x), y = Math.floor(r.y);
    return new IFXRenderDestination(finiteExtent({ x, y, width: Math.ceil(r.x + r.width) - x, height: Math.ceil(r.y + r.height) - y }));
}
export class IFXContext {
    readonly #tasks = new Set<IFXRenderTask>();
    readonly #tileControllers = new Set<AbortController>();
    readonly #tileCache: IFXTileCache;
    #disposed = false;
    readonly budgets: IFXResolvedContextBudgets;
    constructor(readonly workingColourSpace: GFXColourSpace = "linear-srgb", readonly maximumSamples = 262144, budgets: IFXContextBudgets = {}) {
        GFXColour.rgba(0, 0, 0).converting(workingColourSpace);
        if (!Number.isSafeInteger(maximumSamples) || maximumSamples < 1 || maximumSamples > 2 * 1024 * 1024)
            throw new RangeError("Invalid rendering sample budget.");
        this.budgets = resolvedBudgets(maximumSamples, budgets);
        this.#tileCache = new IFXTileCache(Math.floor(this.budgets.cacheBytes / 2));
        Object.freeze(this);
    }
    #assertPreparation(sampler: IFXSampler, bounds: Readonly<{ x: number; y: number; width: number; height: number }>) {
        const requirements = sampler.preparationRequirements(bounds);
        if (requirements.scratchBytes > this.budgets.scratchBytes)
            throw new RangeError("Image preparation scratch budget exceeded.");
        if (requirements.work > this.budgets.work)
            throw new RangeError("Image preparation work budget exceeded.");
        return requirements;
    }
    startTask(image: IFXImage, destination = defaultDestination(image), options: IFXRenderOptions = {}): IFXRenderTask {
        if (this.#disposed)
            throw new DOMException("Image context is disposed.", "AbortError");
        imageNode(image);
        const mode = options.interpolation ?? "linear";
        if (mode !== "linear" && mode !== "nearest")
            throw new TypeError("Unknown interpolation.");
        const external = options.signal;
        if (external !== undefined && !(external instanceof AbortSignal))
            throw new TypeError("AbortSignal required.");
        external?.throwIfAborted();
        const generation = beginDestination(destination);
        const task = new IFXRenderTask(async (signal) => {
            const check = () => {
                signal.throwIfAborted();
                external?.throwIfAborted();
                if (this.#disposed)
                    throw new DOMException("Image context is disposed.", "AbortError");
                assertDestination(destination, generation);
            };
            check();
            const { bounds } = destination;
            const outputBytes = bounds.width * bounds.height * 4;
            if (!Number.isSafeInteger(outputBytes) || outputBytes > this.budgets.outputBytes)
                throw new RangeError("Image output budget exceeded.");
            const tileCacheBytes = this.#tileCache.bytes;
            const memoEntries = Math.min(this.maximumSamples, Math.floor(Math.max(0, this.budgets.cacheBytes - tileCacheBytes) / 64));
            const sampler = new IFXSampler(image, this.workingColourSpace, this.maximumSamples, this.budgets.work, memoEntries);
            try {
                const preparation = this.#assertPreparation(sampler, bounds);
                await sampler.prepare(check, bounds);
                check();
                const bytes = new Uint8Array(outputBytes);
                const transform = outputTransform(this.workingColourSpace, destination.colourSpace);
                for (let y = 0; y < bounds.height; y++) {
                    check();
                    for (let x = 0; x < bounds.width; x++) {
                        const value = sampler.sample({ x: bounds.x + x + 0.5, y: bounds.y + y + 0.5 }, mode);
                        renderPixel(bytes, (y * bounds.width + x) * 4, value, transform, destination.alpha);
                    }
                    if (y % 16 === 15)
                        await new Promise<void>(resolve => setTimeout(resolve, 0));
                }
                check();
                const output = new GFXImage({ width: bounds.width, height: bounds.height, alpha: destination.alpha, colourSpace: destination.colourSpace, data: bytes });
                const result = Object.freeze({ image: output, info: Object.freeze({
                    width: bounds.width,
                    height: bounds.height,
                    sampleEvaluations: sampler.evaluations,
                    cacheHits: sampler.cacheHits,
                    backend: "cpu" as const,
                    tileCount: 1,
                    logicalOutputBytes: outputBytes,
                    peakBytes: Object.freeze({
                        output: outputBytes,
                        scratch: preparation.scratchBytes,
                        cache: tileCacheBytes + sampler.estimatedCacheBytes,
                    }),
                    work: Math.max(preparation.work, sampler.requests),
                    globalPreparationCount: preparation.globalPreparationCount,
                    tileCacheHits: 0,
                    tileCacheEvictions: 0,
                }) });
                check();
                publishDestination(destination, generation, output);
                return result;
            }
            finally {
                sampler.clear();
            }
        });
        this.#tasks.add(task);
        task.waitUntilCompleted().finally(() => this.#tasks.delete(task)).catch(() => undefined);
        return task;
    }
    render(image: IFXImage, destination?: IFXRenderDestination, options?: IFXRenderOptions): Promise<IFXRenderResult> {
        return this.startTask(image, destination, options).waitUntilCompleted();
    }
    async renderTiles(image: IFXImage, destination: IFXTileRenderDestination, options: IFXRenderOptions = {}): Promise<IFXTileRenderInfo> {
        if (this.#disposed)
            throw new DOMException("Image context is disposed.", "AbortError");
        imageNode(image);
        if (!(destination instanceof IFXTileRenderDestination))
            throw new TypeError("IFXTileRenderDestination required.");
        const mode = options.interpolation ?? "linear";
        if (mode !== "linear" && mode !== "nearest")
            throw new TypeError("Unknown interpolation.");
        const external = options.signal;
        if (external !== undefined && !(external instanceof AbortSignal))
            throw new TypeError("AbortSignal required.");
        external?.throwIfAborted();
        const controller = new AbortController();
        this.#tileControllers.add(controller);
        const generation = beginTileDestination(destination);
        const check = () => {
            controller.signal.throwIfAborted();
            external?.throwIfAborted();
            if (this.#disposed)
                throw new DOMException("Image context is disposed.", "AbortError");
            assertTileDestination(destination, generation);
        };
        const plan = new IFXTilePlan(destination.bounds, destination.tileSize ?? this.budgets.tileSize);
        if (plan.maximumTileBytes > this.budgets.outputBytes)
            throw new RangeError("Image tile output budget exceeded.");
        const cacheHitsBefore = this.#tileCache.hits, evictionsBefore = this.#tileCache.evictions;
        const samplerMemoEntries = Math.floor(Math.max(0, this.budgets.cacheBytes - this.#tileCache.maximumBytes) / 64);
        const sampler = new IFXSampler(image, this.workingColourSpace, this.maximumSamples, this.budgets.work, samplerMemoEntries);
        let peakOutput = 0, peakCache = this.#tileCache.bytes;
        try {
            check();
            const preparation = this.#assertPreparation(sampler, destination.bounds);
            await sampler.prepare(check, destination.bounds);
            check();
            peakCache = Math.max(peakCache, this.#tileCache.bytes + sampler.estimatedCacheBytes);
            sampler.clearMemo();
            const transform = outputTransform(this.workingColourSpace, destination.colourSpace);
            for (const tile of plan.tiles) {
                check();
                const key = ifxTileCacheKey(image, tile.rect, destination.colourSpace, destination.alpha, mode);
                const cached = this.#tileCache.get(key);
                if (cached) {
                    await publishTileDestination(destination, generation, { index: tile.index, rect: tile.rect, image: cached });
                    check();
                    peakCache = Math.max(peakCache, this.#tileCache.bytes);
                    continue;
                }
                const bytes = new Uint8Array(tile.outputBytes);
                peakOutput = Math.max(peakOutput, tile.outputBytes);
                for (let y = 0; y < tile.rect.height; y++) {
                    check();
                    for (let x = 0; x < tile.rect.width; x++) {
                        const value = sampler.sample({ x: tile.rect.x + x + 0.5, y: tile.rect.y + y + 0.5 }, mode);
                        renderPixel(bytes, (y * tile.rect.width + x) * 4, value, transform, destination.alpha);
                    }
                    if (y % 16 === 15)
                        await new Promise<void>(resolve => setTimeout(resolve, 0));
                }
                check();
                const output = new GFXImage({ width: tile.rect.width, height: tile.rect.height, alpha: destination.alpha, colourSpace: destination.colourSpace, data: bytes });
                peakCache = Math.max(peakCache, this.#tileCache.bytes + sampler.estimatedCacheBytes);
                await publishTileDestination(destination, generation, { index: tile.index, rect: tile.rect, image: output });
                check();
                sampler.clearMemo();
                this.#tileCache.set(key, output);
                peakCache = Math.max(peakCache, this.#tileCache.bytes);
            }
            check();
            return Object.freeze({
                width: destination.bounds.width,
                height: destination.bounds.height,
                sampleEvaluations: sampler.evaluations,
                cacheHits: sampler.cacheHits,
                backend: "cpu" as const,
                tileCount: plan.tiles.length,
                logicalOutputBytes: plan.logicalOutputBytes,
                peakBytes: Object.freeze({
                    output: peakOutput,
                    scratch: preparation.scratchBytes,
                    cache: peakCache,
                }),
                work: Math.max(preparation.work, sampler.requests),
                globalPreparationCount: preparation.globalPreparationCount,
                tileCacheHits: this.#tileCache.hits - cacheHitsBefore,
                tileCacheEvictions: this.#tileCache.evictions - evictionsBefore,
            });
        }
        finally {
            sampler.clear();
            this.#tileControllers.delete(controller);
        }
    }
    dispose(): void {
        if (this.#disposed)
            return;
        this.#disposed = true;
        for (const task of this.#tasks)
            task.cancel();
        this.#tasks.clear();
        for (const controller of this.#tileControllers)
            controller.abort(new DOMException("Image context is disposed.", "AbortError"));
        this.#tileControllers.clear();
        this.#tileCache.clear();
    }
}
