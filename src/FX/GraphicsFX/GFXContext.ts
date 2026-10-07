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

import { GFXLayer } from "./GFXLayer";
import { GFXShading } from "./GFXShading";
import { projectShading } from "./shadingPaint";
import { imagePNGDataURL } from "./imagePNG";
import { GFXImage, type GFXInterpolation } from "./GFXImage";
import { GFXPattern } from "./GFXPattern";
import { assertDisplayListImagePaintBudget, assertImagePaintBudget, imagePaintRuns } from "./imagePaintRuns";
import type { GFXIdentifierIssuer, GFXIdentifierScope } from "./identifierAuthority";
import { GFXColour } from "./GFXColour";
import { assertGFXIdentifierIssuer, createGFXIdentifierScope, issueGFXDefinitionId, } from "./identifierAuthority";
import { concatenateTransforms, invertTransform, normalisePoint, normaliseSize, normaliseRect, transformPoint, type GFXPoint, type GFXSize, type GFXRect } from "./GFXGeometry";
import { GFXPath } from "./GFXPath";
import { GFXGradient } from "./GFXGradient";
import type { GFXAffineTransform, GFXBlendMode, GFXCommand, GFXCommandState, GFXDisplayList, GFXIdentifiers, GFXLineCap, GFXLineJoin, GFXPaint, GFXPaintGradient, GFXPaintPattern, GFXImageMask, GFXTextAttributes, GFXTextFont, GFXShadowValue, GFXFillRule } from "./graphicsTypes";
import { sealGFXDisplayList } from "./displayListAuthority";
import { GFXTransparencyGroup, type GFXTransparencyGroupOptions } from "./GFXTransparencyGroup";
export class GFXStateUnderflowError extends Error {
    constructor() {
        super("Graphics state restore has no matching save.");
        this.name = "GFXStateUnderflowError";
    }
}
type Paint = GFXColour | GFXGradient | GFXPattern | GFXShading;
type Shadow = GFXShadowValue | null;
interface State {
    readonly interpolation: GFXInterpolation;
    readonly clipRules: readonly GFXFillRule[];
    readonly lineDashPhase: number;
    readonly miterLimit: number;
    readonly masks: readonly GFXImageMask[];
    readonly transform: GFXAffineTransform;
    readonly clipPathData: string | null;
    readonly clipPathDataChain: readonly string[];
    readonly alpha: number;
    readonly blendMode: GFXBlendMode;
    readonly patternPhase: GFXPoint;
    readonly paintSamplingScale: number;
    readonly fill: Paint;
    readonly stroke: Paint;
    readonly lineWidth: number;
    readonly lineCap: GFXLineCap;
    readonly lineJoin: GFXLineJoin;
    readonly lineDash: readonly number[];
    readonly shadow: Shadow;
    readonly textAttributes: GFXTextAttributes;
}
const MAX_CLIP_PATH_DEPTH = 64;
const recordingBlendModes: readonly GFXBlendMode[] = ["normal", "multiply", "screen", "overlay", "darken", "lighten"];
const identityTransform = Object.freeze({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }) as GFXAffineTransform;
const defaultTextAttributes = Object.freeze({ letterSpacing: 0, alignment: "start" as const });
const escapeXML = (value: string) => value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
function finite(value: unknown, name: string, minimum = -1000000, maximum = 1000000): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
        throw new RangeError(`${name} must be a finite number from ${minimum} to ${maximum}.`);
    }
    return value;
}
function finiteUnit(value: unknown, name: string): number {
    return finite(value, name, 0, 1);
}
function dataRecord(value: unknown, allowed: readonly string[], required: readonly string[], name: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) || Object.getOwnPropertySymbols(value).length) {
        throw new TypeError(`${name} must be a plain record.`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Object.keys(descriptors);
    if (keys.some((key) => !allowed.includes(key)) || required.some((key) => !descriptors[key]) || keys.some((key) => !("value" in descriptors[key]!))) {
        throw new TypeError(`${name} has an invalid data shape.`);
    }
    return Object.fromEntries(keys.map((key) => [key, descriptors[key]!.value]));
}
function normaliseTransform(value: unknown): GFXAffineTransform {
    const record = dataRecord(value, ["a", "b", "c", "d", "tx", "ty"], ["a", "b", "c", "d", "tx", "ty"], "Graphics transform");
    return Object.freeze({
        a: finite(record.a, "Transform a"), b: finite(record.b, "Transform b"), c: finite(record.c, "Transform c"),
        d: finite(record.d, "Transform d"), tx: finite(record.tx, "Transform tx"), ty: finite(record.ty, "Transform ty"),
    });
}
function normaliseLineDash(value: unknown): readonly number[] {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > 64 || Object.getOwnPropertySymbols(value).length) {
        throw new TypeError("Graphics line dash must be a bounded dense plain array.");
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const result: number[] = [];
    for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
            throw new TypeError("Graphics line dash must not be sparse or accessor-backed.");
        result.push(finite(descriptor.value, "Graphics line dash entry", 0, 1000000));
    }
    if (Object.keys(descriptors).some((key) => key !== "length" && !/^(?:0|[1-9]\d*)$/u.test(key))) {
        throw new TypeError("Graphics line dash contains unsupported fields.");
    }
    return Object.freeze(result);
}
function normaliseShadow(value: unknown): Shadow {
    if (value === null)
        return null;
    const record = dataRecord(value, ["offset", "blur", "spread", "colour"], ["offset", "blur", "spread", "colour"], "Graphics shadow");
    if (!(record.colour instanceof GFXColour))
        throw new TypeError("Graphics shadow colour must be canonical.");
    return Object.freeze({
        offset: normalisePoint(dataRecord(record.offset, ["x", "y"], ["x", "y"], "Graphics shadow offset") as unknown as GFXPoint),
        blur: finite(record.blur, "Graphics shadow blur", 0, 100000),
        spread: finite(record.spread, "Graphics shadow spread", 0, 100000),
        colour: record.colour,
    });
}
function normaliseTextAttributes(value: unknown): GFXTextAttributes {
    const record = dataRecord(value, ["letterSpacing", "alignment"], ["letterSpacing", "alignment"], "Graphics text attributes");
    const alignment = record.alignment;
    if (alignment !== "start" && alignment !== "middle" && alignment !== "end")
        throw new TypeError("Graphics text alignment is invalid.");
    return Object.freeze({ letterSpacing: finite(record.letterSpacing, "Graphics letter spacing", -10000, 10000), alignment });
}
function cloneState(state: State): State {
    return Object.freeze({
        interpolation: state.interpolation,
        clipRules: Object.freeze([...state.clipRules]), lineDashPhase: state.lineDashPhase, miterLimit: state.miterLimit,
        masks: Object.freeze([...state.masks]),
        transform: Object.freeze({ ...state.transform }), clipPathData: state.clipPathData, clipPathDataChain: Object.freeze([...state.clipPathDataChain]), alpha: state.alpha, blendMode: state.blendMode,
        patternPhase: Object.freeze({ ...state.patternPhase }), paintSamplingScale: state.paintSamplingScale,
        fill: state.fill, stroke: state.stroke, lineWidth: state.lineWidth, lineCap: state.lineCap, lineJoin: state.lineJoin,
        lineDash: Object.freeze([...state.lineDash]),
        shadow: state.shadow ? Object.freeze({ offset: Object.freeze({ ...state.shadow.offset }), blur: state.shadow.blur, spread: state.shadow.spread, colour: state.shadow.colour }) : null,
        textAttributes: Object.freeze({ ...state.textAttributes }),
    });
}
function paintReference(paint: GFXPaint, definitionId: (paint: GFXPaintGradient | GFXPaintPattern) => string): string {
    return paint.kind === "colour" ? escapeXML(paint.css) : `url(#${escapeXML(definitionId(paint))})`;
}
export class GFXContext {
    readonly #size: GFXSize;
    readonly #scale: number;
    readonly #identifiers: GFXIdentifierIssuer;
    readonly #exportIdentifiers: GFXIdentifierScope;
    readonly #exportDefinitionIds = new Map<string, string>();
    readonly #commands: GFXCommand[] = [];
    readonly #stack: State[] = [];
    readonly #groups: { token: GFXTransparencyGroup; commands: GFXCommand[]; stateBefore: State; stackDepth: number }[] = [];
    #groupSequence = 0;
    #commandCount = 0;
    #gradientSequence = 0;
    #state: State = Object.freeze({
        interpolation: "nearest",
        clipRules: Object.freeze([]), lineDashPhase: 0, miterLimit: 10,
        masks: Object.freeze([]),
        transform: identityTransform, clipPathData: null, clipPathDataChain: Object.freeze([]), alpha: 1, blendMode: "normal", patternPhase: Object.freeze({ x: 0, y: 0 }), paintSamplingScale: 1,
        fill: GFXColour.parse("#000"), stroke: GFXColour.parse("#000"), lineWidth: 1, lineCap: "butt", lineJoin: "miter",
        lineDash: Object.freeze([]), shadow: null, textAttributes: defaultTextAttributes,
    });
    private constructor(options: {
        readonly size: GFXSize;
        readonly identifiers: GFXIdentifiers;
        readonly scale?: number;
    }) {
        const input = dataRecord(options, ["size", "identifiers", "scale"], ["size", "identifiers"], "Graphics context options");
        const size = dataRecord(input.size, ["width", "height"], ["width", "height"], "Graphics size");
        this.#size = normaliseSize(size as unknown as GFXSize);
        this.#scale = finite(input.scale ?? 1, "Graphics device scale", Number.MIN_VALUE, 8);
        assertGFXIdentifierIssuer(input.identifiers);
        this.#identifiers = input.identifiers;
        this.#exportIdentifiers = createGFXIdentifierScope(this.#identifiers);
    }
    static recording(options: {
        readonly size: GFXSize;
        readonly identifiers: GFXIdentifiers;
        readonly scale?: number;
    }) {
        return new GFXContext(options);
    }
    save() {
        if (this.#stack.length >= 64)
            throw new RangeError("Graphics state depth exceeded.");
        this.#stack.push(cloneState(this.#state));
    }
    restore() {
        const activeGroup = this.#groups.at(-1);
        if (activeGroup && this.#stack.length <= activeGroup.stackDepth)
            throw new GFXStateUnderflowError();
        const state = this.#stack.pop();
        if (!state)
            throw new GFXStateUnderflowError();
        this.#state = state;
    }
    setTransform(transform: GFXAffineTransform) {
        this.#state = Object.freeze({ ...this.#state, transform: normaliseTransform(transform) });
    }
    concatTransform(transform: GFXAffineTransform) {
        const next = normaliseTransform(transform);
        const current = this.#state.transform;
        this.#state = Object.freeze({ ...this.#state, transform: Object.freeze({
                a: current.a * next.a + current.c * next.b, b: current.b * next.a + current.d * next.b,
                c: current.a * next.c + current.c * next.d, d: current.b * next.c + current.d * next.d,
                tx: current.a * next.tx + current.c * next.ty + current.tx, ty: current.b * next.tx + current.d * next.ty + current.ty,
            }) });
    }
    convertPointToDeviceSpace(point: GFXPoint): GFXPoint {
        const transformed = transformPoint(normalisePoint(point), this.#state.transform);
        return Object.freeze({ x: transformed.x * this.#scale, y: transformed.y * this.#scale });
    }
    convertPointFromDeviceSpace(point: GFXPoint): GFXPoint {
        const device = normalisePoint(point);
        return transformPoint({ x: device.x / this.#scale, y: device.y / this.#scale }, invertTransform(this.#state.transform));
    }
    clip(path: GFXPath, rule: GFXFillRule = "nonzero") {
        if (rule !== "nonzero" && rule !== "evenodd")
            throw new TypeError("Unsupported clip rule.");
        if (!(path instanceof GFXPath))
            throw new TypeError("A typed bezier path is required for clipping.");
        const pathData = path.transformed(this.#state.transform).toSVGPathData();
        if (new TextEncoder().encode(pathData).byteLength > 512 * 1024)
            throw new RangeError("Graphics clip path exceeds the byte limit.");
        if (this.#state.clipPathDataChain.length >= MAX_CLIP_PATH_DEPTH)
            throw new RangeError("Graphics clip path depth exceeded.");
        this.#state = Object.freeze({ ...this.#state, clipPathData: pathData, clipPathDataChain: Object.freeze([...this.#state.clipPathDataChain, pathData]), clipRules: Object.freeze([...this.#state.clipRules, rule]) });
    }
    clipToMask(image: GFXImage, rect: GFXRect): void {
        assertImagePaintBudget(image);
        const bounds = normaliseRect(dataRecord(rect, ["x", "y", "width", "height"], ["x", "y", "width", "height"], "Mask rectangle") as unknown as GFXRect);
        if (!bounds.width || !bounds.height)
            throw new RangeError("Mask bounds must be nonempty.");
        if (this.#state.masks.length >= 64)
            throw new RangeError("Mask depth exceeded.");
        const mask = Object.freeze({ id: `mask:${++this.#gradientSequence}`, image, rect: bounds, transform: this.#state.transform });
        this.#state = Object.freeze({ ...this.#state, masks: Object.freeze([...this.#state.masks, mask]) });
    }
    setFill(fill: Paint) {
        if (!(fill instanceof GFXColour) && !(fill instanceof GFXGradient) && !(fill instanceof GFXPattern) && !(fill instanceof GFXShading))
            throw new TypeError("Graphics fill must be a canonical colour, gradient or pattern.");
        if (fill instanceof GFXPattern)
            assertImagePaintBudget(fill.image);
        this.#state = Object.freeze({ ...this.#state, fill });
    }
    setStroke(stroke: Paint) {
        if (!(stroke instanceof GFXColour) && !(stroke instanceof GFXGradient) && !(stroke instanceof GFXPattern) && !(stroke instanceof GFXShading))
            throw new TypeError("Graphics stroke must be a canonical colour, gradient or pattern.");
        if (stroke instanceof GFXPattern)
            assertImagePaintBudget(stroke.image);
        this.#state = Object.freeze({ ...this.#state, stroke });
    }
    setAlpha(alpha: number) {
        this.#state = Object.freeze({ ...this.#state, alpha: finiteUnit(alpha, "Graphics alpha") });
    }
    setBlendMode(blendMode: GFXBlendMode) {
        if (!recordingBlendModes.includes(blendMode))
            throw new TypeError(`The SVG recording backend does not implement Porter-Duff blend mode ${blendMode}.`);
        this.#state = Object.freeze({ ...this.#state, blendMode });
    }
    setPatternPhase(phase: GFXPoint) {
        this.#state = Object.freeze({ ...this.#state, patternPhase: normalisePoint(phase) });
    }
    setPaintSamplingScale(scale: number) {
        this.#state = Object.freeze({ ...this.#state, paintSamplingScale: finite(scale, "Paint sampling scale", Number.MIN_VALUE, 8) });
    }
    beginTransparencyGroup(options: GFXTransparencyGroupOptions = {}): GFXTransparencyGroup {
        if (this.#groups.length >= 16)
            throw new RangeError("Transparency group depth exceeded.");
        const blendMode = options.blendMode ?? this.#state.blendMode;
        if (!recordingBlendModes.includes(blendMode))
            throw new TypeError(`The SVG recording backend does not implement Porter-Duff transparency group mode ${blendMode}.`);
        const alpha = finiteUnit(options.alpha ?? this.#state.alpha, "Transparency group alpha");
        const token = new GFXTransparencyGroup(`recording:${++this.#groupSequence}`, alpha, blendMode);
        const stateBefore = this.#state;
        this.#groups.push({ token, commands: [], stateBefore, stackDepth: this.#stack.length });
        this.#state = Object.freeze({ ...stateBefore, alpha: 1, blendMode: "normal" });
        return token;
    }
    endTransparencyGroup(group: GFXTransparencyGroup) {
        const entry = this.#groups.at(-1);
        if (!entry || entry.token !== group)
            throw new Error("Transparency group has no matching active scope.");
        if (this.#stack.length !== entry.stackDepth)
            throw new Error("Transparency group has unbalanced save/restore state.");
        this.#groups.pop();
        this.#state = entry.stateBefore;
        const command = Object.freeze({ kind: "transparency-group" as const, group: entry.token, commands: Object.freeze(entry.commands.slice()) });
        this.#append(command);
    }
    setLineWidth(lineWidth: number) {
        this.#state = Object.freeze({ ...this.#state, lineWidth: finite(lineWidth, "Graphics line width", 0, 100000) });
    }
    setLineCap(lineCap: GFXLineCap) {
        if (lineCap !== "butt" && lineCap !== "round" && lineCap !== "square")
            throw new TypeError("Unsupported graphics line cap.");
        this.#state = Object.freeze({ ...this.#state, lineCap });
    }
    setLineJoin(lineJoin: GFXLineJoin) {
        if (lineJoin !== "miter" && lineJoin !== "round" && lineJoin !== "bevel")
            throw new TypeError("Unsupported graphics line join.");
        this.#state = Object.freeze({ ...this.#state, lineJoin });
    }
    setLineDash(lineDash: readonly number[], phase = 0) {
        this.#state = Object.freeze({ ...this.#state, lineDash: normaliseLineDash(lineDash), lineDashPhase: finite(phase, "Dash phase") });
    }
    setInterpolation(mode: GFXInterpolation): void {
        if (mode !== "nearest" && mode !== "linear")
            throw new TypeError("Unsupported image interpolation.");
        this.#state = Object.freeze({ ...this.#state, interpolation: mode });
    }
    setMiterLimit(limit: number): void {
        this.#state = Object.freeze({ ...this.#state, miterLimit: finite(limit, "Miter limit", 1, 1000000) });
    }
    setShadow(shadow: GFXShadowValue | null) {
        this.#state = Object.freeze({ ...this.#state, shadow: normaliseShadow(shadow) });
    }
    setTextAttributes(textAttributes: GFXTextAttributes) {
        this.#state = Object.freeze({ ...this.#state, textAttributes: normaliseTextAttributes(textAttributes) });
    }
    #paint(value: Paint, bounds: GFXRect): GFXPaint {
        if (value instanceof GFXShading)
            return this.#paint(projectShading(value, bounds, this.#state.paintSamplingScale), bounds);
        if (value instanceof GFXColour)
            return Object.freeze({ kind: "colour", css: value.toCSS() });
        if (value instanceof GFXPattern) {
            const phase = this.#state.patternPhase;
            const transform = concatenateTransforms(Object.freeze({ a: 1, b: 0, c: 0, d: 1, tx: phase.x, ty: phase.y }), value.transform);
            return Object.freeze({ kind: "pattern", id: `pattern:${++this.#gradientSequence}`, image: value.image, transform, interpolation: value.interpolation });
        }
        const id = `gradient:${++this.#gradientSequence}`;
        return Object.freeze({ kind: "gradient", id, geometry: value.geometry, units: value.units, transform: value.transform, stops: Object.freeze(value.stops.map((stop) => Object.freeze({ offset: stop.offset, css: stop.colour.toCSS() }))) });
    }
    #snapshot(bounds: GFXRect = { x: 0, y: 0, width: this.#size.width, height: this.#size.height }): GFXCommandState {
        const state = this.#state;
        return Object.freeze({
            interpolation: state.interpolation,
            clipRules: Object.freeze([...state.clipRules]), lineDashPhase: state.lineDashPhase, miterLimit: state.miterLimit,
            masks: Object.freeze([...state.masks]),
            transform: Object.freeze({ ...state.transform }), clipPathData: state.clipPathData, clipPathDataChain: Object.freeze([...state.clipPathDataChain]), alpha: state.alpha, blendMode: state.blendMode,
            patternPhase: Object.freeze({ ...state.patternPhase }), paintSamplingScale: state.paintSamplingScale,
            fill: this.#paint(state.fill, bounds), stroke: this.#paint(state.stroke, bounds), lineWidth: state.lineWidth, lineCap: state.lineCap, lineJoin: state.lineJoin, lineDash: Object.freeze([...state.lineDash]),
            shadow: state.shadow ? Object.freeze({ offset: Object.freeze({ ...state.shadow.offset }), blur: state.shadow.blur, spread: state.shadow.spread, css: state.shadow.colour.toCSS() }) : null,
            textAttributes: Object.freeze({ ...state.textAttributes }),
        });
    }
    #append(command: GFXCommand) {
        const target = this.#groups.at(-1)?.commands ?? this.#commands;
        if (this.#commandCount >= 10000)
            throw new RangeError("Graphics command limit exceeded.");
        this.#commandCount += 1;
        target.push(command);
    }
    fill(path: GFXPath, rule: GFXFillRule = "nonzero") {
        if (rule !== "nonzero" && rule !== "evenodd")
            throw new TypeError("Unsupported fill rule.");
        if (!(path instanceof GFXPath))
            throw new TypeError("A typed bezier path is required.");
        const state = this.#snapshot(path.bounds);
        this.#append(Object.freeze({ kind: "fill-path" as const, fillRule: rule, path: path.commands, pathData: path.toSVGPathData(), paint: state.fill, opacity: state.alpha, transform: state.transform, clipPathData: state.clipPathData, clipPathDataChain: state.clipPathDataChain, blendMode: state.blendMode, state }));
    }
    stroke(path: GFXPath) {
        if (!(path instanceof GFXPath))
            throw new TypeError("A typed bezier path is required.");
        const bounds = path.bounds, margin = this.#state.lineWidth / 2 * Math.max(1, this.#state.miterLimit);
        const state = this.#snapshot({ x: bounds.x - margin, y: bounds.y - margin, width: bounds.width + 2 * margin, height: bounds.height + 2 * margin });
        this.#append(Object.freeze({ kind: "stroke-path" as const, path: path.commands, pathData: path.toSVGPathData(), paint: state.stroke, opacity: state.alpha, transform: state.transform, clipPathData: state.clipPathData, clipPathDataChain: state.clipPathDataChain, blendMode: state.blendMode, lineWidth: state.lineWidth, lineCap: state.lineCap, lineJoin: state.lineJoin, lineDash: state.lineDash, state }));
    }
    drawImage(image: GFXImage, destination: GFXRect): void {
        if (!(image instanceof GFXImage))
            throw new TypeError("Drawing requires GFXImage.");
        if (image.width * image.height > 1048576)
            throw new RangeError("Recorded image exceeds the one-megapixel work limit.");
        const bounds = normaliseRect(dataRecord(destination, ["x", "y", "width", "height"], ["x", "y", "width", "height"], "Image destination") as unknown as GFXRect);
        if (!bounds.width || !bounds.height)
            return;
        const state = this.#snapshot(bounds);
        this.#append(Object.freeze({ kind: "image", image, destination: bounds, state }));
    }
    drawLayer(layer: GFXLayer, destination: GFXRect): void {
        if (!(layer instanceof GFXLayer))
            throw new TypeError("Drawing requires GFXLayer.");
        this.drawImage(layer.image, destination);
    }
    drawText(text: string, origin: GFXPoint, font: GFXTextFont) {
        if (typeof text !== "string" || new TextEncoder().encode(text).byteLength > 64 * 1024)
            throw new RangeError("Graphics text is invalid or too large.");
        const pointValue = dataRecord(origin, ["x", "y"], ["x", "y"], "Graphics text origin");
        const point = normalisePoint(pointValue as unknown as GFXPoint);
        const fontValue = dataRecord(font, ["family", "size", "weight", "style"], ["family", "size"], "Graphics font");
        if (typeof fontValue.family !== "string" || fontValue.family.length === 0 || fontValue.family.length > 256 || typeof fontValue.size !== "number" || !Number.isFinite(fontValue.size) || fontValue.size <= 0 || fontValue.size > 512)
            throw new TypeError("Graphics font is invalid.");
        const weight = fontValue.weight ?? 400;
        const style = fontValue.style ?? "normal";
        if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 1 || weight > 1000 || (style !== "normal" && style !== "italic"))
            throw new TypeError("Graphics font is invalid.");
        const state = this.#snapshot();
        this.#append(Object.freeze({ kind: "text" as const, text, origin: point, font: Object.freeze({ family: fontValue.family, size: fontValue.size, weight, style }), paint: state.fill, opacity: state.alpha, transform: state.transform, clipPathData: state.clipPathData, clipPathDataChain: state.clipPathDataChain, blendMode: state.blendMode, textAttributes: state.textAttributes, state }));
    }
    get displayList(): GFXDisplayList {
        if (this.#groups.length)
            throw new Error("Cannot snapshot a display list while a transparency group is open.");
        return sealGFXDisplayList(Object.freeze({ size: this.#size, commands: Object.freeze(this.#commands.slice()) }), this.#identifiers);
    }
    toSVG() {
        createGFXIdentifierScope(this.#identifiers); // Re-check mounted liveness even when all export IDs are cached.
        const list = this.displayList;
        assertDisplayListImagePaintBudget(list);
        const definitionId = (key: string) => {
            const existing = this.#exportDefinitionIds.get(key);
            if (existing)
                return existing;
            const issued = issueGFXDefinitionId(this.#exportIdentifiers);
            if (!issued || issued.length > 1024 || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(issued) || Array.from(this.#exportDefinitionIds.values()).includes(issued))
                throw new TypeError("Generated graphics identifier is invalid or duplicated.");
            this.#exportDefinitionIds.set(key, issued);
            return issued;
        };
        const patterns = new Map<string, GFXPaintPattern>();
        const masks = new Map<string, GFXImageMask>();
        const gradients = new Map<string, GFXPaintGradient>();
        const clips = new Map<string, {
            pathData: string;
            rule: GFXFillRule;
        }>();
        const shadows = new Map<string, NonNullable<GFXCommandState["shadow"]>>();
        const leafCommands: GFXCommand[] = [];
        const collectLeaves = (commands: readonly GFXCommand[]) => {
            for (const command of commands) {
                if (command.kind === "transparency-group") collectLeaves(command.commands);
                else leafCommands.push(command);
            }
        };
        collectLeaves(list.commands);
        for (const command of leafCommands) {
            if (command.kind === "transparency-group") continue;
            for (const paint of [command.state.fill, command.state.stroke])
                if (paint.kind === "gradient")
                    gradients.set(paint.id, paint);
            for (const paint of [command.state.fill, command.state.stroke])
                if (paint.kind === "pattern")
                    patterns.set(paint.id, paint);
            for (const mask of command.state.masks)
                masks.set(mask.id, mask);
            for (const [index, pathData] of command.state.clipPathDataChain.entries())
                clips.set(`${command.state.clipRules[index]}:${pathData}`, { pathData, rule: command.state.clipRules[index]! });
            if (command.state.shadow)
                shadows.set(JSON.stringify(command.state.shadow), command.state.shadow);
        }
        const gradientDefinitions = Array.from(gradients.values(), (paint) => paint.geometry.kind === "linear"
            ? `<linearGradient id="${escapeXML(definitionId(`gradient:${paint.id}`))}" gradientUnits="${paint.units}" gradientTransform="matrix(${paint.transform.a} ${paint.transform.b} ${paint.transform.c} ${paint.transform.d} ${paint.transform.tx} ${paint.transform.ty})" color-interpolation="sRGB" x1="${paint.geometry.start.x}" y1="${paint.geometry.start.y}" x2="${paint.geometry.end.x}" y2="${paint.geometry.end.y}">${paint.stops.map((stop) => `<stop offset="${stop.offset}" stop-color="${escapeXML(stop.css)}"/>`).join("")}</linearGradient>`
            : `<radialGradient id="${escapeXML(definitionId(`gradient:${paint.id}`))}" gradientUnits="${paint.units}" gradientTransform="matrix(${paint.transform.a} ${paint.transform.b} ${paint.transform.c} ${paint.transform.d} ${paint.transform.tx} ${paint.transform.ty})" color-interpolation="sRGB" cx="${paint.geometry.centre.x}" cy="${paint.geometry.centre.y}" r="${paint.geometry.radius}">${paint.stops.map((stop) => `<stop offset="${stop.offset}" stop-color="${escapeXML(stop.css)}"/>`).join("")}</radialGradient>`).join("");
        const matrix = (t: GFXAffineTransform) => `matrix(${t.a} ${t.b} ${t.c} ${t.d} ${t.tx} ${t.ty})`;
        const pixelRuns = (image: GFXImage, alphaOnly = false) => imagePaintRuns(image, alphaOnly).map(run => `<rect x="${run.x}" y="${run.y}" width="${run.width}" height="1" fill="${escapeXML(run.css)}" fill-opacity="${run.alpha}"/>`).join("");
        const patternDefinitions = Array.from(patterns.values(), paint => `<pattern id="${escapeXML(definitionId(`pattern:${paint.id}`))}" patternUnits="userSpaceOnUse" width="${paint.image.width}" height="${paint.image.height}" patternTransform="${matrix(paint.transform)}"><image width="${paint.image.width}" height="${paint.image.height}" href="${imagePNGDataURL(paint.image)}" image-rendering="${paint.interpolation === "nearest" ? "pixelated" : "auto"}"/></pattern>`).join("");
        const maskDefinitions = Array.from(masks.values(), mask => `<mask id="${escapeXML(definitionId(`mask:${mask.id}`))}" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="0" y="0" width="${list.size.width}" height="${list.size.height}" style="mask-type:alpha"><g transform="${matrix(mask.transform)}"><g transform="translate(${mask.rect.x} ${mask.rect.y}) scale(${mask.rect.width / mask.image.width} ${mask.rect.height / mask.image.height})">${pixelRuns(mask.image, true)}</g></g></mask>`).join("");
        const clipDefinitions = Array.from(clips.entries(), ([key, clip]) => `<clipPath id="${escapeXML(definitionId(`clip:${key}`))}" clipPathUnits="userSpaceOnUse"><path d="${escapeXML(clip.pathData)}" clip-rule="${clip.rule}"/></clipPath>`).join("");
        const shadowDefinitions = Array.from(shadows.entries(), ([key, shadow]) => `<filter id="${escapeXML(definitionId(`shadow:${key}`))}" x="-100%" y="-100%" width="300%" height="300%"><feDropShadow dx="${shadow.offset.x}" dy="${shadow.offset.y}" stdDeviation="${(shadow.blur + shadow.spread) / 2}" flood-color="${escapeXML(shadow.css)}"/></filter>`).join("");
        const stateAttributes = (state: GFXCommandState) => {
            const transform = state.transform;
            const attributes = [`opacity="${state.alpha}"`, `transform="matrix(${transform.a} ${transform.b} ${transform.c} ${transform.d} ${transform.tx} ${transform.ty})"`];
            if (state.shadow)
                attributes.push(`filter="url(#${escapeXML(definitionId(`shadow:${JSON.stringify(state.shadow)}`))})"`);
            if (state.blendMode !== "normal")
                attributes.push(`style="mix-blend-mode:${state.blendMode}"`);
            return attributes.join(" ");
        };
        const withClips = (node: string, state: GFXCommandState) => state.clipPathDataChain.reduceRight((child, pathData, index) => `<g clip-path="url(#${escapeXML(definitionId(`clip:${state.clipRules[index]}:${pathData}`))})">${child}</g>`, state.masks.reduceRight((child, mask) => `<g mask="url(#${escapeXML(definitionId(`mask:${mask.id}`))})">${child}</g>`, node));
        const renderCommand = (command: GFXCommand): string => {
            if (command.kind === "transparency-group") {
                const style = command.group.blendMode === "normal" ? "isolation:isolate" : `isolation:isolate;mix-blend-mode:${command.group.blendMode}`;
                return `<g data-gfx-transparency-group="${escapeXML(command.group.id)}" opacity="${command.group.alpha}" style="${style}">${command.commands.map(renderCommand).join("")}</g>`;
            }
            const attributes = stateAttributes(command.state);
            if (command.kind === "image")
                return withClips(`<image x="${command.destination.x}" y="${command.destination.y}" width="${command.destination.width}" height="${command.destination.height}" preserveAspectRatio="none" image-rendering="${command.state.interpolation === "nearest" ? "pixelated" : "auto"}" href="${imagePNGDataURL(command.image)}" ${attributes}/>`, command.state);
            const paint = (value: GFXPaint) => paintReference(value, (gradient) => definitionId(`${gradient.kind}:${gradient.id}`));
            if (command.kind === "fill-path")
                return withClips(`<path d="${escapeXML(command.pathData)}" fill="${paint(command.paint)}" fill-rule="${command.fillRule}" ${attributes}/>`, command.state);
            if (command.kind === "stroke-path") {
                const dash = command.lineDash.length ? ` stroke-dasharray="${command.lineDash.join(" ")}"` : "";
                return withClips(`<path d="${escapeXML(command.pathData)}" fill="none" stroke="${paint(command.paint)}" stroke-width="${command.lineWidth}" stroke-linecap="${command.lineCap}" stroke-linejoin="${command.lineJoin}" stroke-dashoffset="${command.state.lineDashPhase}" stroke-miterlimit="${command.state.miterLimit}"${dash} ${attributes}/>`, command.state);
            }
            return withClips(`<text x="${command.origin.x}" y="${command.origin.y}" fill="${paint(command.paint)}" font-family="${escapeXML(command.font.family)}" font-size="${command.font.size}" font-weight="${command.font.weight}" font-style="${command.font.style}" letter-spacing="${command.textAttributes.letterSpacing}" text-anchor="${command.textAttributes.alignment}" ${attributes}>${escapeXML(command.text)}</text>`, command.state);
        };
        const nodes = list.commands.map(renderCommand).join("");
        const definitions = `${gradientDefinitions}${patternDefinitions}${maskDefinitions}${clipDefinitions}${shadowDefinitions}`;
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${list.size.width}" height="${list.size.height}" viewBox="0 0 ${list.size.width} ${list.size.height}">${definitions ? `<defs>${definitions}</defs>` : ""}${nodes}</svg>`;
    }
}
