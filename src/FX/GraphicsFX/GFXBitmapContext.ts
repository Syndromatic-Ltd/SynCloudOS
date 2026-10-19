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

import { SynCloudOSLifecycleRecord } from "../../SynCloudOS/fxRuntimeContracts";
import { GFXShadow } from "./GFXShadow";
import { filterShadowAlpha, sampleShadowAlpha } from "./bitmapShadow";
import type { GFXBlendMode, GFXShadowValue, GFXFillRule } from "./graphicsTypes";
import { GFXColour } from "./GFXColour";
import { GFXGradient } from "./GFXGradient";
import { GFXImage, type GFXInterpolation } from "./GFXImage";
import { GFXShading } from "./GFXShading";
import { GFXPattern } from "./GFXPattern";
import { GFXPath, type GFXStrokeOptions } from "./GFXPath";
import { GFXIdentityTransform, normaliseAffineTransform, normaliseRect, invertTransform, transformPoint, type GFXAffineTransform, type GFXPoint, type GFXRect } from "./GFXGeometry";
import type { GFXRGBAComponents } from "./colourTypes";
import { GFXTransparencyGroup, type GFXTransparencyGroupOptions } from "./GFXTransparencyGroup";
export type GFXBitmapPaint = GFXColour | GFXGradient | GFXPattern | GFXShading;
interface Clip {
    readonly path: GFXPath;
    readonly rule: GFXFillRule;
    readonly inverse: GFXAffineTransform;
}
interface Mask {
    readonly image: GFXImage;
    readonly rect: GFXRect;
    readonly inverse: GFXAffineTransform;
}
interface State {
    readonly interpolation: GFXInterpolation;
    readonly antialiasing: boolean;
    readonly blendMode: GFXBlendMode;
    readonly shadow: GFXShadow | null;
    readonly transform: GFXAffineTransform;
    readonly alpha: number;
    readonly clips: readonly Clip[];
    readonly masks: readonly Mask[];
    readonly patternPhase: GFXPoint;
}
interface TransparencyGroupState {
    readonly token: GFXTransparencyGroup;
    readonly bytes: Uint8Array;
    readonly stateBefore: State;
    readonly stackDepth: number;
}
const bitmapBlendModes: readonly GFXBlendMode[] = ["normal", "multiply", "screen", "overlay", "darken", "lighten", "source-in", "source-out", "source-atop", "destination-in", "destination-out", "destination-atop", "xor", "copy", "clear"];
const inside = (p: GFXPoint, r: GFXRect) => p.x >= r.x && p.y >= r.y && p.x < r.x + r.width && p.y < r.y + r.height;
/** Portable RGBA8 raster surface. Coverage antialiasing is opt-in; it owns no DOM or runtime authority. */
export class GFXBitmapContext {
    readonly #lifecycle = new SynCloudOSLifecycleRecord({ kind: "GFXBitmapContext" });
    readonly width: number;
    readonly height: number;
    readonly scale: number;
    readonly pixelWidth: number;
    readonly pixelHeight: number;
    #bytes: Uint8Array | null;
    #state: State = { transform: GFXIdentityTransform, alpha: 1, clips: [], masks: [], antialiasing: false, blendMode: "normal", shadow: null, interpolation: "nearest", patternPhase: Object.freeze({ x: 0, y: 0 }) };
    #stack: State[] = [];
    #groups: TransparencyGroupState[] = [];
    #groupSequence = 0;
    constructor(options: Readonly<{
        width: number;
        height: number;
        scale?: number;
    }>) {
        const scale = options.scale ?? 1;
        if (![options.width, options.height, scale].every(n => Number.isFinite(n) && n > 0) || scale > 8)
            throw new RangeError("Bitmap dimensions and scale must be finite and positive; scale must not exceed eight.");
        this.width = options.width;
        this.height = options.height;
        this.scale = scale;
        this.pixelWidth = Math.ceil(this.width * scale);
        this.pixelHeight = Math.ceil(this.height * scale);
        if (this.pixelWidth * this.pixelHeight > 16 * 1024 * 1024)
            throw new RangeError("Bitmap exceeds 16 megapixels.");
        this.#bytes = new Uint8Array(this.pixelWidth * this.pixelHeight * 4);
        Object.freeze(this);
    }
    #assert(operation: string): Uint8Array {
        if (!this.#bytes)
            throw this.#lifecycle.error({ code: "GFX_BITMAP_CONTEXT_DISPOSED", operation: operation });
        return this.#bytes;
    }
    #target(operation: string): Uint8Array {
        this.#assert(operation);
        return this.#groups.at(-1)?.bytes ?? this.#bytes!;
    }
    save(): void {
        this.#assert("save");
        if (this.#stack.length >= 64)
            throw new RangeError("Bitmap state depth exceeded.");
        this.#stack.push(this.#state);
    }
    restore(): void {
        this.#assert("restore");
        const activeGroup = this.#groups.at(-1);
        if (activeGroup && this.#stack.length <= activeGroup.stackDepth)
            throw new Error("Bitmap restore has no matching save inside the transparency group.");
        const state = this.#stack.pop();
        if (!state)
            throw new Error("Bitmap restore has no matching save.");
        this.#state = state;
    }
    setTransform(transform: GFXAffineTransform): void {
        this.#assert("setTransform");
        const t = normaliseAffineTransform(transform);
        invertTransform(t);
        this.#state = { ...this.#state, transform: t };
    }
    convertPointToDeviceSpace(point: GFXPoint): GFXPoint {
        this.#assert("convertPointToDeviceSpace");
        const transformed = transformPoint(point, this.#state.transform);
        return Object.freeze({ x: transformed.x * this.scale, y: transformed.y * this.scale });
    }
    convertPointFromDeviceSpace(point: GFXPoint): GFXPoint {
        this.#assert("convertPointFromDeviceSpace");
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
            throw new RangeError("Device point must be finite.");
        return transformPoint({ x: point.x / this.scale, y: point.y / this.scale }, invertTransform(this.#state.transform));
    }
    setAlpha(alpha: number): void {
        this.#assert("setAlpha");
        if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1)
            throw new RangeError("Alpha must be in [0,1].");
        this.#state = { ...this.#state, alpha };
    }
    /** Use sixteen premultiplied coverage samples per output pixel. */
    setInterpolation(mode: GFXInterpolation): void {
        this.#assert("setInterpolation");
        if (mode !== "nearest" && mode !== "linear")
            throw new TypeError("Unsupported image interpolation.");
        this.#state = { ...this.#state, interpolation: mode };
    }
    setAntialiasing(enabled: boolean): void {
        this.#assert("setAntialiasing");
        if (typeof enabled !== "boolean")
            throw new TypeError("Antialiasing requires a boolean.");
        this.#state = { ...this.#state, antialiasing: enabled };
    }
    setBlendMode(blendMode: GFXBlendMode): void {
        this.#assert("setBlendMode");
        if (!bitmapBlendModes.includes(blendMode))
            throw new TypeError("Unsupported bitmap blend mode.");
        this.#state = { ...this.#state, blendMode };
    }
    setPatternPhase(phase: GFXPoint): void {
        this.#assert("setPatternPhase");
        if (!Number.isFinite(phase.x) || !Number.isFinite(phase.y))
            throw new RangeError("Pattern phase must be finite.");
        this.#state = { ...this.#state, patternPhase: Object.freeze({ x: phase.x, y: phase.y }) };
    }
    beginTransparencyGroup(options: GFXTransparencyGroupOptions = {}): GFXTransparencyGroup {
        this.#assert("beginTransparencyGroup");
        if (this.#groups.length >= 16)
            throw new RangeError("Transparency group depth exceeded.");
        const alpha = options.alpha ?? this.#state.alpha, blendMode = options.blendMode ?? this.#state.blendMode;
        if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1 || !bitmapBlendModes.includes(blendMode))
            throw new RangeError("Invalid bitmap transparency group.");
        const token = new GFXTransparencyGroup(`bitmap:${++this.#groupSequence}`, alpha, blendMode);
        const stateBefore = this.#state;
        this.#groups.push({ token, bytes: new Uint8Array(this.#assert("beginTransparencyGroup").length), stateBefore, stackDepth: this.#stack.length });
        this.#state = { ...stateBefore, alpha: 1, blendMode: "normal" };
        return token;
    }
    endTransparencyGroup(group: GFXTransparencyGroup): void {
        this.#assert("endTransparencyGroup");
        const entry = this.#groups.at(-1);
        if (!entry || entry.token !== group)
            throw new Error("Transparency group has no matching active scope.");
        if (this.#stack.length !== entry.stackDepth)
            throw new Error("Bitmap transparency group has unbalanced save/restore state.");
        this.#groups.pop();
        const target = this.#target("endTransparencyGroup");
        this.#state = { ...entry.stateBefore, alpha: 1, blendMode: group.blendMode };
        for (let index = 0; index < entry.bytes.length; index += 4) {
            const alpha = entry.bytes[index + 3]! / 255;
            if (!alpha)
                continue;
            this.#blend(target, index, { r: entry.bytes[index]! / 255, g: entry.bytes[index + 1]! / 255, b: entry.bytes[index + 2]! / 255, a: alpha }, group.alpha);
        }
        this.#state = entry.stateBefore;
    }
    /** Offset, blur and spread are surface logical units. Blur's Gaussian sigma is blur / 2. */
    setShadow(value: GFXShadowValue | null): void {
        this.#assert("setShadow");
        const shadow = value === null ? null : value instanceof GFXShadow ? value : new GFXShadow(value);
        if (shadow && shadow.spread < 0)
            throw new RangeError("Bitmap shadow spread must be non-negative.");
        this.#state = { ...this.#state, shadow };
    }
    clip(path: GFXPath, rule: GFXFillRule = "nonzero"): void {
        if (rule !== "nonzero" && rule !== "evenodd")
            throw new TypeError("Unsupported clip rule.");
        this.#assert("clip");
        if (!(path instanceof GFXPath))
            throw new TypeError("Clip requires GFXPath.");
        if (this.#state.clips.length >= 64)
            throw new RangeError("Clip depth exceeded.");
        this.#state = { ...this.#state, clips: [...this.#state.clips, { path, rule, inverse: invertTransform(this.#state.transform) }] };
    }
    clipToMask(image: GFXImage, rect: GFXRect): void {
        this.#assert("clipToMask");
        if (!(image instanceof GFXImage))
            throw new TypeError("Mask requires GFXImage.");
        if (this.#state.masks.length >= 64)
            throw new RangeError("Mask depth exceeded.");
        const bounds = normaliseRect(rect);
        if (!bounds.width || !bounds.height)
            throw new RangeError("Mask destination must be nonempty.");
        this.#state = { ...this.#state, masks: [...this.#state.masks, { image, rect: bounds, inverse: invertTransform(this.#state.transform) }] };
    }
    #coverage(world: GFXPoint, includeAlpha = true): number {
        if (this.#state.clips.some(clip => !clip.path.contains(transformPoint(world, clip.inverse), clip.rule)))
            return 0;
        let alpha = includeAlpha ? this.#state.alpha : 1;
        for (const mask of this.#state.masks) {
            const p = transformPoint(world, mask.inverse);
            if (!inside(p, mask.rect))
                return 0;
            const x = Math.floor((p.x - mask.rect.x) / mask.rect.width * mask.image.width), y = Math.floor((p.y - mask.rect.y) / mask.rect.height * mask.image.height);
            alpha *= mask.image.pixel(x, y).a;
        }
        return alpha;
    }
    #blend(bytes: Uint8Array, index: number, colour: GFXRGBAComponents, coverage: number): void {
        const sa = colour.a * coverage;
        const da = bytes[index + 3]! / 255;
        const channels = [colour.r, colour.g, colour.b];
        const composite = this.#state.blendMode;
        if (composite === "clear" || composite === "copy" || composite === "source-in" || composite === "source-out" || composite === "source-atop" || composite === "destination-in" || composite === "destination-out" || composite === "destination-atop" || composite === "xor") {
            let sourceFactor = 1, destinationFactor = 1 - sa;
            switch (composite) {
                case "clear": sourceFactor = 0; destinationFactor = 0; break;
                case "copy": sourceFactor = 1; destinationFactor = 0; break;
                case "source-in": sourceFactor = da; destinationFactor = 0; break;
                case "source-out": sourceFactor = 1 - da; destinationFactor = 0; break;
                case "source-atop": sourceFactor = da; destinationFactor = 1 - sa; break;
                case "destination-in": sourceFactor = 0; destinationFactor = sa; break;
                case "destination-out": sourceFactor = 0; destinationFactor = 1 - sa; break;
                case "destination-atop": sourceFactor = 1 - da; destinationFactor = sa; break;
                case "xor": sourceFactor = 1 - da; destinationFactor = 1 - sa; break;
            }
            const alpha = sa * sourceFactor + da * destinationFactor;
            for (let channel = 0; channel < 3; channel++) {
                const source = channels[channel]! * sa, backdrop = bytes[index + channel]! / 255 * da;
                const premultiplied = source * sourceFactor + backdrop * destinationFactor;
                bytes[index + channel] = alpha ? Math.round(premultiplied / alpha * 255) : 0;
            }
            bytes[index + 3] = Math.round(alpha * 255);
            return;
        }
        const alpha = sa + da * (1 - sa);
        const blend = (backdrop: number, source: number): number => {
            switch (this.#state.blendMode) {
                case "multiply": return backdrop * source;
                case "screen": return backdrop + source - backdrop * source;
                case "overlay": return backdrop <= 0.5 ? 2 * backdrop * source : 1 - 2 * (1 - backdrop) * (1 - source);
                case "darken": return Math.min(backdrop, source);
                case "lighten": return Math.max(backdrop, source);
                default: return source;
            }
        };
        for (let channel = 0; channel < 3; channel++) {
            const source = channels[channel]!;
            const backdrop = bytes[index + channel]! / 255;
            const premultiplied = (1 - sa) * backdrop * da + (1 - da) * source * sa + sa * da * blend(backdrop, source);
            bytes[index + channel] = alpha ? Math.round(premultiplied / alpha * 255) : 0;
        }
        bytes[index + 3] = Math.round(alpha * 255);
    }
    #sampleSource(sample: (point: GFXPoint) => GFXColour | null, inverse: GFXAffineTransform, x: number, y: number, clipped: boolean): GFXRGBAComponents {
        const grid = this.#state.antialiasing ? 4 : 1;
        let red = 0, green = 0, blue = 0, alpha = 0;
        for (let sy = 0; sy < grid; sy++) {
            for (let sx = 0; sx < grid; sx++) {
                const world = { x: (x + (sx + 0.5) / grid) / this.scale, y: (y + (sy + 0.5) / grid) / this.scale };
                const coverage = clipped ? this.#coverage(world) : this.#state.alpha;
                if (!coverage)
                    continue;
                const colour = sample(transformPoint(world, inverse));
                if (!colour)
                    continue;
                const value = colour.converting("srgb").components;
                const a = value.a * coverage;
                red += value.r * a;
                green += value.g * a;
                blue += value.b * a;
                alpha += a;
            }
        }
        return { r: alpha ? red / alpha : 0, g: alpha ? green / alpha : 0, b: alpha ? blue / alpha : 0, a: alpha / (grid * grid) };
    }
    #clipPixel(x: number, y: number): number {
        const grid = this.#state.antialiasing ? 4 : 1;
        let coverage = 0;
        for (let sy = 0; sy < grid; sy++)
            for (let sx = 0; sx < grid; sx++)
                coverage += this.#coverage({ x: (x + (sx + 0.5) / grid) / this.scale, y: (y + (sy + 0.5) / grid) / this.scale }, false);
        return coverage / (grid * grid);
    }
    #draw(operation: string, sample: (point: GFXPoint) => GFXColour | null, complexity = 1): void {
        const bytes = this.#target(operation), inverse = invertTransform(this.#state.transform);
        const samples = this.#state.antialiasing ? 16 : 1;
        const clipWork = this.#state.clips.reduce((n, clip) => n + clip.path.commands.length, 0) + this.#state.masks.length;
        const baseWork = this.pixelWidth * this.pixelHeight * samples * (complexity + clipWork);
        if (baseWork > 64 * 1024 * 1024)
            throw new RangeError("Raster operation exceeds the portable work budget.");
        const shadow = this.#state.shadow;
        if (shadow && shadow.colour.components.a && this.#state.alpha) {
            const dx = shadow.offset.x * this.scale, dy = shadow.offset.y * this.scale;
            const sigma = shadow.blur * this.scale / 2;
            const radius = Math.ceil(sigma * 3), spread = Math.ceil(shadow.spread * this.scale);
            const paddingX = Math.ceil(Math.abs(dx)) + radius + spread + 2;
            const paddingY = Math.ceil(Math.abs(dy)) + radius + spread + 2;
            const width = this.pixelWidth + 2 * paddingX, height = this.pixelHeight + 2 * paddingY;
            const pixels = width * height;
            const filterWork = 2 * (2 * radius + 1) + 2 * (2 * spread + 1);
            if (!Number.isSafeInteger(pixels) || pixels > 16 * 1024 * 1024 || baseWork + pixels * (samples * complexity + filterWork) > 64 * 1024 * 1024)
                throw new RangeError("Bitmap shadow exceeds the allocation or work limit.");
            const alpha = new Float32Array(pixels);
            for (let y = 0; y < height; y++)
                for (let x = 0; x < width; x++)
                    alpha[y * width + x] = this.#sampleSource(sample, inverse, x - paddingX, y - paddingY, false).a;
            const blurred = filterShadowAlpha(alpha, width, height, spread, sigma);
            const colour = shadow.colour.converting("srgb").components;
            for (let y = 0; y < this.pixelHeight; y++) {
                for (let x = 0; x < this.pixelWidth; x++) {
                    const coverage = this.#clipPixel(x, y) * sampleShadowAlpha(blurred, width, height, x + paddingX - dx, y + paddingY - dy);
                    if (coverage)
                        this.#blend(bytes, (y * this.pixelWidth + x) * 4, colour, coverage);
                }
            }
        }
        for (let y = 0; y < this.pixelHeight; y++) {
            for (let x = 0; x < this.pixelWidth; x++) {
                const colour = this.#sampleSource(sample, inverse, x, y, true);
                if (colour.a)
                    this.#blend(bytes, (y * this.pixelWidth + x) * 4, colour, 1);
            }
        }
    }
    fillPath(path: GFXPath, paint: GFXBitmapPaint, rule: GFXFillRule = "nonzero"): void {
        if (rule !== "nonzero" && rule !== "evenodd")
            throw new TypeError("Unsupported fill rule.");
        this.#assert("fillPath");
        if (!(path instanceof GFXPath) || !(paint instanceof GFXColour || paint instanceof GFXGradient || paint instanceof GFXPattern || paint instanceof GFXShading))
            throw new TypeError("Typed path and bitmap paint required.");
        const work = path.commands.length + this.#state.clips.reduce((n, c) => n + c.path.commands.length, 0);
        if (this.pixelWidth * this.pixelHeight * work > 64 * 1024 * 1024)
            throw new RangeError("Raster path exceeds the portable work budget.");
        const paintBounds = path.bounds;
        const phase = this.#state.patternPhase;
        this.#draw("fillPath", point => path.contains(point, rule) ? paint instanceof GFXColour ? paint : paint instanceof GFXGradient ? paint.sampleAt(point, paintBounds) : paint instanceof GFXPattern ? paint.sample({ x: point.x - phase.x, y: point.y - phase.y }) : paint.sample(point) : null, path.commands.length);
    }
    strokePath(path: GFXPath, paint: GFXBitmapPaint, options: GFXStrokeOptions): void {
        this.#assert("strokePath");
        if (!(path instanceof GFXPath))
            throw new TypeError("Stroke requires GFXPath.");
        this.fillPath(path.stroked(options), paint);
    }
    drawImage(image: GFXImage, rect: GFXRect): void {
        this.#assert("drawImage");
        if (!(image instanceof GFXImage))
            throw new TypeError("Drawing requires GFXImage.");
        const bounds = normaliseRect(rect);
        this.#draw("drawImage", point => {
            if (!inside(point, bounds))
                return null;
            const c = image.sample({ x: (point.x - bounds.x) / bounds.width * image.width, y: (point.y - bounds.y) / bounds.height * image.height }, { interpolation: this.#state.interpolation });
            return image.colourSpace === "display-p3" ? GFXColour.displayP3(c.r, c.g, c.b, c.a) : image.colourSpace === "linear-srgb" ? GFXColour.linearSRGB(c.r, c.g, c.b, c.a) : GFXColour.rgba(c.r, c.g, c.b, c.a);
        });
    }
    clear(): void {
        this.#target("clear").fill(0);
    }
    makeImage(): GFXImage {
        if (this.#groups.length)
            throw new Error("Cannot snapshot a bitmap while a transparency group is open.");
        return new GFXImage({ width: this.pixelWidth, height: this.pixelHeight, alpha: "straight", colourSpace: "srgb", data: this.#assert("makeImage") });
    }
    dispose(): void {
        this.#lifecycle.markDisposed("explicit");
        this.#bytes = null;
        this.#stack = [];
        this.#groups = [];
        this.#state = { transform: GFXIdentityTransform, alpha: 1, clips: [], masks: [], antialiasing: false, blendMode: "normal", shadow: null, interpolation: "nearest", patternPhase: Object.freeze({ x: 0, y: 0 }) };
    }
}
