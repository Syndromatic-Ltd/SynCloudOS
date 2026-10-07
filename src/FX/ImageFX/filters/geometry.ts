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

import { invertTransform, transformPoint, transformRect, type GFXPoint, type GFXRect } from "../../GraphicsFX/GFXGeometry";
import { finiteExtent, infiniteExtent } from "../extent";
import { fields, number, point, rect, transform, processor, finiteInput, expanded, mix, straight, transparent, type Definition } from "./common";
export const geometry: Record<string, Definition> = {};

const distortionRadiusMaximum = 1e5;
const distortionAngleMaximum = Math.PI * 128;
const distortionScaleMinimum = -1;
const distortionScaleMaximum = 1;

function requiredNumber(value: unknown, min = -1e6, max = 1e6): number {
    return number(value, Number.NaN, min, max);
}
function requiredPoint(value: unknown): GFXPoint {
    if (value === undefined)
        throw new TypeError("Required geometry point parameter is missing.");
    return point(value);
}
function requiredBoolean(value: unknown, label: string): boolean {
    if (typeof value !== "boolean")
        throw new TypeError(`Required ${label} boolean parameter is missing or invalid.`);
    return value;
}
function pointDistance(a: GFXPoint, b: GFXPoint): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function radialDistance(position: GFXPoint, center: GFXPoint): Readonly<{ dx: number; dy: number; distance: number; }> {
    const dx = position.x - center.x, dy = position.y - center.y;
    return { dx, dy, distance: Math.hypot(dx, dy) };
}
function radialPoint(center: GFXPoint, dx: number, dy: number, factor: number): GFXPoint {
    return { x: center.x + dx * factor, y: center.y + dy * factor };
}
function radialFalloff(distance: number, radius: number): number {
    return radius === 0 || distance >= radius ? 0 : (1 - distance / radius) ** 2;
}
function boundedDistortion(inputs: readonly import("../IFXImage").IFXImage[], name: string, parameters: Readonly<Record<string, unknown>>, maximumDisplacement: number, map: (position: GFXPoint) => GFXPoint) {
    const source = finiteInput(inputs[0]!);
    return processor(name, parameters, finiteExtent(source), (position, access) => access.sampleWithin(0, map(position), source), bounds => [expanded(bounds, maximumDisplacement + 1)]);
}

type PerspectiveQuad = readonly [GFXPoint, GFXPoint, GFXPoint, GFXPoint];
type PerspectiveMapping = Readonly<{ a: number; b: number; c: number; d: number; e: number; f: number; g: number; h: number; }>;
const perspectiveEpsilon = 1e-10;
const perspectiveDefaults: PerspectiveQuad = Object.freeze([
    Object.freeze({ x: 118, y: 484 }),
    Object.freeze({ x: 646, y: 507 }),
    Object.freeze({ x: 548, y: 140 }),
    Object.freeze({ x: 155, y: 153 }),
]);

function quadForRect(value: GFXRect): PerspectiveQuad {
    return Object.freeze([
        Object.freeze({ x: value.x, y: value.y }),
        Object.freeze({ x: value.x + value.width, y: value.y }),
        Object.freeze({ x: value.x + value.width, y: value.y + value.height }),
        Object.freeze({ x: value.x, y: value.y + value.height }),
    ]);
}
function quadBounds(quad: PerspectiveQuad): GFXRect {
    const xs = quad.map(point => point.x), ys = quad.map(point => point.y);
    return Object.freeze({ x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) });
}
function assertPerspectiveQuad(quad: PerspectiveQuad): void {
    let orientation = 0;
    for (let index = 0; index < quad.length; index++) {
        const a = quad[index]!, b = quad[(index + 1) % quad.length]!, c = quad[(index + 2) % quad.length]!, abx = b.x - a.x, aby = b.y - a.y, bcx = c.x - b.x, bcy = c.y - b.y;
        const cross = abx * bcy - aby * bcx, scale = Math.max(1, Math.hypot(abx, aby), Math.hypot(bcx, bcy));
        if (!Number.isFinite(cross) || Math.abs(cross) <= perspectiveEpsilon * scale * scale)
            throw new RangeError("Perspective quad must be a strictly convex nondegenerate quadrilateral.");
        const nextOrientation = Math.sign(cross);
        if (orientation !== 0 && orientation !== nextOrientation)
            throw new RangeError("Perspective quad must be a strictly convex nondegenerate quadrilateral.");
        orientation = nextOrientation;
    }
}
function solvePerspectiveMapping(from: PerspectiveQuad, to: PerspectiveQuad): PerspectiveMapping {
    const rows: number[][] = [];
    for (let index = 0; index < 4; index++) {
        const source = from[index]!, target = to[index]!;
        for (const row of [
            [source.x, source.y, 1, 0, 0, 0, -target.x * source.x, -target.x * source.y, target.x],
            [0, 0, 0, source.x, source.y, 1, -target.y * source.x, -target.y * source.y, target.y],
        ]) {
            const scale = Math.max(1, ...row.slice(0, 8).map(value => Math.abs(value)));
            rows.push(row.map(value => value / scale));
        }
    }
    for (let column = 0; column < 8; column++) {
        let pivot = column;
        for (let candidate = column + 1; candidate < 8; candidate++)
            if (Math.abs(rows[candidate]![column]!) > Math.abs(rows[pivot]![column]!))
                pivot = candidate;
        const pivotValue = rows[pivot]![column]!;
        if (!Number.isFinite(pivotValue) || Math.abs(pivotValue) <= perspectiveEpsilon)
            throw new RangeError("Perspective homography is singular.");
        [rows[column], rows[pivot]] = [rows[pivot]!, rows[column]!];
        for (let index = column; index < 9; index++)
            rows[column]![index] = rows[column]![index]! / pivotValue;
        for (let target = 0; target < 8; target++) {
            if (target === column)
                continue;
            const factor = rows[target]![column]!;
            if (factor === 0)
                continue;
            for (let index = column; index < 9; index++)
                rows[target]![index] = rows[target]![index]! - factor * rows[column]![index]!;
        }
    }
    const solution = rows.map(row => row[8]!);
    if (!solution.every(Number.isFinite))
        throw new RangeError("Perspective homography is nonfinite.");
    return Object.freeze({ a: solution[0]!, b: solution[1]!, c: solution[2]!, d: solution[3]!, e: solution[4]!, f: solution[5]!, g: solution[6]!, h: solution[7]! });
}
function project(mapping: PerspectiveMapping, position: GFXPoint): Readonly<{ point: GFXPoint; denominator: number; }> | null {
    const denominator = mapping.g * position.x + mapping.h * position.y + 1;
    if (!Number.isFinite(denominator) || Math.abs(denominator) <= perspectiveEpsilon)
        return null;
    const x = (mapping.a * position.x + mapping.b * position.y + mapping.c) / denominator, y = (mapping.d * position.x + mapping.e * position.y + mapping.f) / denominator;
    if (!Number.isFinite(x) || !Number.isFinite(y))
        return null;
    return Object.freeze({ point: Object.freeze({ x, y }), denominator });
}
function assertNoPerspectiveHorizon(mapping: PerspectiveMapping, quad: PerspectiveQuad): void {
    const values = quad.map(point => mapping.g * point.x + mapping.h * point.y + 1);
    if (values.some(value => !Number.isFinite(value) || Math.abs(value) <= perspectiveEpsilon) || Math.min(...values) < 0 && Math.max(...values) > 0)
        throw new RangeError("Perspective homography crosses a horizon within the output quadrilateral.");
}
function pointIsInside(position: GFXPoint, bounds: GFXRect): boolean {
    return position.x >= bounds.x && position.y >= bounds.y && position.x < bounds.x + bounds.width && position.y < bounds.y + bounds.height;
}
function perspectiveROI(mapping: PerspectiveMapping, bounds: GFXRect, source: GFXRect): GFXRect {
    const mapped = quadForRect(bounds).map(point => project(mapping, point));
    if (mapped.some(value => value === null))
        return source;
    const values = mapped as readonly Readonly<{ point: GFXPoint; denominator: number; }>[];
    if (Math.min(...values.map(value => value.denominator)) < 0 && Math.max(...values.map(value => value.denominator)) > 0)
        return source;
    const xs = values.map(value => value.point.x), ys = values.map(value => value.point.y), result = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    if (![result.x, result.y, result.width, result.height].every(Number.isFinite))
        return source;
    return expanded(result, 1);
}

function requiredPerspectiveQuad(parameters: Record<string, unknown>): PerspectiveQuad {
    const quad: PerspectiveQuad = Object.freeze([
        requiredPoint(parameters.topLeft),
        requiredPoint(parameters.topRight),
        requiredPoint(parameters.bottomRight),
        requiredPoint(parameters.bottomLeft),
    ]);
    assertPerspectiveQuad(quad);
    return quad;
}

function correctedRect(quad: PerspectiveQuad, crop: boolean): GFXRect {
    const bounds = quadBounds(quad);
    const top = pointDistance(quad[0], quad[1]), bottom = pointDistance(quad[3], quad[2]);
    const left = pointDistance(quad[0], quad[3]), right = pointDistance(quad[1], quad[2]);
    const width = crop ? Math.min(top, bottom) : Math.max(top, bottom);
    const height = crop ? Math.min(left, right) : Math.max(left, right);
    if (!(width > perspectiveEpsilon) || !(height > perspectiveEpsilon))
        throw new RangeError("Perspective correction requires nondegenerate source edges.");
    return Object.freeze({ x: bounds.x, y: bounds.y, width, height });
}

function rectifiedProcessor(name: string, inputs: readonly import("../IFXImage").IFXImage[], parameters: Readonly<Record<string, unknown>>, sourceQuad: PerspectiveQuad, targetRect: GFXRect) {
    const source = finiteInput(inputs[0]!);
    const targetQuad = quadForRect(targetRect), mapping = solvePerspectiveMapping(targetQuad, sourceQuad);
    assertNoPerspectiveHorizon(mapping, targetQuad);
    return processor(name, parameters, finiteExtent(targetRect), (position, access) => {
        const mapped = project(mapping, position);
        return !mapped || !pointIsInside(mapped.point, source) ? transparent : access.sampleWithin(0, mapped.point, source);
    }, bounds => [perspectiveROI(mapping, bounds, source)]);
}

/** IFX uses y-down image coordinates. These names map its source corners to target positions; Apple defaults are preserved numerically, without a hidden y-axis flip. */
geometry.perspectiveTransform = { category: "geometry", inputs: 1, normalise: value => {
        const p = fields(value, ["topLeft", "topRight", "bottomRight", "bottomLeft", "extent"]), quad: PerspectiveQuad = Object.freeze([
            point(p.topLeft, perspectiveDefaults[0]),
            point(p.topRight, perspectiveDefaults[1]),
            point(p.bottomRight, perspectiveDefaults[2]),
            point(p.bottomLeft, perspectiveDefaults[3]),
        ]), extent = p.extent === undefined ? undefined : rect(p.extent);
        assertPerspectiveQuad(quad);
        if (extent && (extent.width <= 0 || extent.height <= 0))
            throw new RangeError("Perspective source extent must be nonempty.");
        return extent === undefined ? { topLeft: quad[0], topRight: quad[1], bottomRight: quad[2], bottomLeft: quad[3] } : { topLeft: quad[0], topRight: quad[1], bottomRight: quad[2], bottomLeft: quad[3], extent };
    }, build: (inputs, p) => {
        const source = p.extent === undefined ? finiteInput(inputs[0]!) : p.extent as GFXRect;
        if (source.width <= 0 || source.height <= 0)
            throw new RangeError("Perspective source extent must be nonempty.");
        const target: PerspectiveQuad = Object.freeze([p.topLeft as GFXPoint, p.topRight as GFXPoint, p.bottomRight as GFXPoint, p.bottomLeft as GFXPoint]), mapping = solvePerspectiveMapping(target, quadForRect(source));
        assertNoPerspectiveHorizon(mapping, target);
        return processor("perspectiveTransform", p, finiteExtent(quadBounds(target)), (position, access) => {
            const mapped = project(mapping, position);
            return !mapped || !pointIsInside(mapped.point, source) ? transparent : access.sampleWithin(0, mapped.point, source);
        }, bounds => [perspectiveROI(mapping, bounds, source)]);
    } };
/**
 * CIPerspectiveTransformWithExtent names a required source extent; Apple documents that passing the
 * image extent yields the same transform as CIPerspectiveTransform. This bounded path uses that
 * extent both as the homography source rectangle and as the transparent sampling boundary.
 */
geometry.perspectiveTransformWithExtent = { category: "geometry", inputs: 1, normalise: value => {
        const p = fields(value, ["topLeft", "topRight", "bottomRight", "bottomLeft", "extent"]);
        if (p.extent === undefined)
            throw new TypeError("Perspective Transform With Extent requires extent.");
        const quad: PerspectiveQuad = Object.freeze([
            point(p.topLeft, perspectiveDefaults[0]),
            point(p.topRight, perspectiveDefaults[1]),
            point(p.bottomRight, perspectiveDefaults[2]),
            point(p.bottomLeft, perspectiveDefaults[3]),
        ]), extent = rect(p.extent);
        assertPerspectiveQuad(quad);
        if (extent.width <= 0 || extent.height <= 0)
            throw new RangeError("Perspective source extent must be nonempty.");
        return { topLeft: quad[0], topRight: quad[1], bottomRight: quad[2], bottomLeft: quad[3], extent };
    }, build: (inputs, p) => {
        const source = p.extent as GFXRect;
        if (source.width <= 0 || source.height <= 0)
            throw new RangeError("Perspective source extent must be nonempty.");
        const target: PerspectiveQuad = Object.freeze([p.topLeft as GFXPoint, p.topRight as GFXPoint, p.bottomRight as GFXPoint, p.bottomLeft as GFXPoint]), mapping = solvePerspectiveMapping(target, quadForRect(source));
        assertNoPerspectiveHorizon(mapping, target);
        return processor("perspectiveTransformWithExtent", p, finiteExtent(quadBounds(target)), (position, access) => {
            const mapped = project(mapping, position);
            return !mapped || !pointIsInside(mapped.point, source) ? transparent : access.sampleWithin(0, mapped.point, source);
        }, bounds => [perspectiveROI(mapping, bounds, source)]);
    } };
geometry.twirl = { category: "distortion", inputs: 1, normalise: value => {
        const p = fields(value, ["center", "radius", "angle"]);
        return { center: point(p.center), radius: number(p.radius, 300, .001, 1e5), angle: number(p.angle, Math.PI, -Math.PI * 4, Math.PI * 4) };
    }, build: (inputs, p) => processor("twirl", p, inputs[0]!.extent, (position, access) => {
        const center = p.center as GFXPoint, dx = position.x - center.x, dy = position.y - center.y, d = Math.hypot(dx, dy), radius = p.radius as number, angle = d < radius ? (1 - d / radius) ** 2 * (p.angle as number) : 0;
        return access.sample(0, { x: center.x + dx * Math.cos(angle) - dy * Math.sin(angle), y: center.y + dx * Math.sin(angle) + dy * Math.cos(angle) });
    }, r => [expanded(r, 2 * (p.radius as number))]) };
/**
 * Apple documents names, parameters and defaults for these distortions, but not their native kernels.
 * ImageFX therefore uses explicit bounded inverse coordinate maps. Radius zero and a zero scale/angle
 * are portable degenerate identities; every map uses exactly one transparent-edge source sample.
 */
geometry.bumpDistortion = { category: "distortion", inputs: 1, normalise: value => {
        const p = fields(value, ["center", "radius", "scale"]);
        return { center: point(p.center, { x: 150, y: 150 }), radius: number(p.radius, 300, 0, distortionRadiusMaximum), scale: number(p.scale, .5, distortionScaleMinimum, distortionScaleMaximum) };
    }, build: (inputs, p) => {
        const center = p.center as GFXPoint, radius = p.radius as number, scale = p.scale as number;
        return boundedDistortion(inputs, "bumpDistortion", p, Math.abs(scale) * radius, position => {
            const { dx, dy, distance } = radialDistance(position, center), falloff = radialFalloff(distance, radius);
            return falloff === 0 || scale === 0 ? position : radialPoint(center, dx, dy, 1 - scale * falloff);
        });
    } };
geometry.bumpDistortionLinear = { category: "distortion", inputs: 1, normalise: value => {
        const p = fields(value, ["center", "radius", "angle", "scale"]);
        return { center: point(p.center, { x: 300, y: 300 }), radius: number(p.radius, 300, 0, distortionRadiusMaximum), angle: number(p.angle, 0, -distortionAngleMaximum, distortionAngleMaximum), scale: number(p.scale, .5, distortionScaleMinimum, distortionScaleMaximum) };
    }, build: (inputs, p) => {
        const center = p.center as GFXPoint, radius = p.radius as number, angle = p.angle as number, scale = p.scale as number, normal = Object.freeze({ x: -Math.sin(angle), y: Math.cos(angle) });
        return boundedDistortion(inputs, "bumpDistortionLinear", p, Math.abs(scale) * radius, position => {
            if (radius === 0 || scale === 0)
                return position;
            const distance = (position.x - center.x) * normal.x + (position.y - center.y) * normal.y, ratio = Math.abs(distance) / radius;
            if (ratio >= 1)
                return position;
            const offset = scale * distance * (1 - ratio) ** 2;
            return { x: position.x + normal.x * offset, y: position.y + normal.y * offset };
        });
    } };
geometry.circleSplashDistortion = { category: "distortion", inputs: 1, normalise: value => {
        const p = fields(value, ["center", "radius"]);
        return { center: point(p.center, { x: 150, y: 150 }), radius: number(p.radius, 150, 0, distortionRadiusMaximum) };
    }, build: (inputs, p) => {
        const center = p.center as GFXPoint, radius = p.radius as number;
        return boundedDistortion(inputs, "circleSplashDistortion", p, radius * .2, position => {
            if (radius === 0)
                return position;
            const { dx, dy, distance } = radialDistance(position, center), phase = (distance - radius) / radius;
            if (distance === 0 || phase <= 0 || phase >= 1)
                return position;
            // One bounded annular wave starts at the documented circumference and travels outward.
            return radialPoint(center, dx, dy, (distance + radius * .2 * Math.sin(Math.PI * phase)) / distance);
        });
    } };
geometry.holeDistortion = { category: "distortion", inputs: 1, normalise: value => {
        const p = fields(value, ["center", "radius"]);
        return { center: point(p.center, { x: 150, y: 150 }), radius: number(p.radius, 150, 0, distortionRadiusMaximum) };
    }, build: (inputs, p) => {
        const center = p.center as GFXPoint, radius = p.radius as number;
        return boundedDistortion(inputs, "holeDistortion", p, radius * .25, position => {
            const { dx, dy, distance } = radialDistance(position, center);
            return radius === 0 || distance >= radius ? position : radialPoint(center, dx, dy, distance / radius);
        });
    } };
geometry.pinchDistortion = { category: "distortion", inputs: 1, normalise: value => {
        const p = fields(value, ["center", "radius", "scale"]);
        return { center: point(p.center, { x: 150, y: 150 }), radius: number(p.radius, 300, 0, distortionRadiusMaximum), scale: number(p.scale, .5, distortionScaleMinimum, distortionScaleMaximum) };
    }, build: (inputs, p) => {
        const center = p.center as GFXPoint, radius = p.radius as number, scale = p.scale as number;
        return boundedDistortion(inputs, "pinchDistortion", p, Math.abs(scale) * radius, position => {
            const { dx, dy, distance } = radialDistance(position, center), falloff = radialFalloff(distance, radius);
            return falloff === 0 || scale === 0 ? position : radialPoint(center, dx, dy, 1 + scale * falloff);
        });
    } };
geometry.vortexDistortion = { category: "distortion", inputs: 1, normalise: value => {
        const p = fields(value, ["center", "radius", "angle"]);
        return { center: point(p.center, { x: 150, y: 150 }), radius: number(p.radius, 300, 0, distortionRadiusMaximum), angle: number(p.angle, 56.55, -distortionAngleMaximum, distortionAngleMaximum) };
    }, build: (inputs, p) => {
        const center = p.center as GFXPoint, radius = p.radius as number, angle = p.angle as number;
        return boundedDistortion(inputs, "vortexDistortion", p, radius * 2, position => {
            const { dx, dy, distance } = radialDistance(position, center), rotation = radialFalloff(distance, radius) * angle;
            if (rotation === 0)
                return position;
            return { x: center.x + dx * Math.cos(rotation) - dy * Math.sin(rotation), y: center.y + dx * Math.sin(rotation) + dy * Math.cos(rotation) };
        });
    } };

/**
 * These retained Core Image source keys use documented member names, while their pixel kernels are
 * explicit portable inverse maps. The captured programme has no authoritative native defaults for
 * these members, so every non-image parameter is required rather than silently inventing one.
 */
geometry.circularWrap = { category: "distortion", inputs: 1, normalise: value => {
        const p = fields(value, ["center", "radius", "angle"]);
        return { center: requiredPoint(p.center), radius: requiredNumber(p.radius, 0, distortionRadiusMaximum), angle: requiredNumber(p.angle, -distortionAngleMaximum, distortionAngleMaximum) };
    }, build: (inputs, p) => {
        const center = p.center as GFXPoint, radius = p.radius as number, angle = p.angle as number;
        return boundedDistortion(inputs, "circularWrap", p, radius * 2, position => {
            if (radius === 0 || angle === 0)
                return position;
            const { dx, dy, distance } = radialDistance(position, center);
            if (distance === 0 || distance >= radius)
                return position;
            const theta = Math.atan2(dy, dx) - angle * (distance / radius), c = Math.cos(theta), s = Math.sin(theta);
            return { x: center.x + distance * c, y: center.y + distance * s };
        });
    } };

geometry.droste = { category: "distortion", inputs: 1, normalise: value => {
        const p = fields(value, ["insetPoint0", "insetPoint1", "periodicity", "rotation", "strands", "zoom"]);
        const insetPoint0 = requiredPoint(p.insetPoint0), insetPoint1 = requiredPoint(p.insetPoint1);
        if (insetPoint1.x <= insetPoint0.x || insetPoint1.y <= insetPoint0.y)
            throw new RangeError("Droste inset points must define a positive rectangle.");
        const strands = requiredNumber(p.strands, 1, 32);
        if (!Number.isInteger(strands))
            throw new RangeError("Droste strands must be integral.");
        return { insetPoint0, insetPoint1, periodicity: requiredNumber(p.periodicity, .1, 64), rotation: requiredNumber(p.rotation, -distortionAngleMaximum, distortionAngleMaximum), strands, zoom: requiredNumber(p.zoom, .1, 10) };
    }, build: (inputs, p) => {
        const source = finiteInput(inputs[0]!), p0 = p.insetPoint0 as GFXPoint, p1 = p.insetPoint1 as GFXPoint;
        const center = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 }, inner = Math.max(.5, Math.hypot(p1.x - p0.x, p1.y - p0.y) / 2);
        const outer = Math.max(inner * 1.001, Math.hypot(source.width, source.height) / 2), logSpan = Math.log(outer / inner);
        const periodicity = p.periodicity as number, rotation = p.rotation as number, strands = p.strands as number, zoom = p.zoom as number;
        return processor("droste", p, finiteExtent(source), (position, access) => {
            const dx = position.x - center.x, dy = position.y - center.y, distance = Math.hypot(dx, dy);
            if (distance < 1e-9)
                return access.sampleWithin(0, position, source);
            const cycles = Math.log(Math.max(1e-9, distance / zoom) / inner) / logSpan * periodicity;
            const whole = Math.floor(cycles), phase = cycles - whole;
            const mappedRadius = inner * Math.exp(phase * logSpan / periodicity);
            const theta = Math.atan2(dy, dx) - whole * rotation - phase * Math.PI * 2 * (strands - 1) / strands;
            return access.sampleWithin(0, { x: center.x + mappedRadius * Math.cos(theta), y: center.y + mappedRadius * Math.sin(theta) }, source);
        }, () => [source]);
    } };

geometry.glassDistortion = { category: "distortion", inputs: 2, normalise: value => {
        const p = fields(value, ["center", "scale"]);
        return { center: requiredPoint(p.center), scale: requiredNumber(p.scale, -1e4, 1e4) };
    }, build: (inputs, p) => {
        const source = finiteInput(inputs[0]!), texture = finiteInput(inputs[1]!), center = p.center as GFXPoint, scale = p.scale as number;
        return processor("glassDistortion", p, finiteExtent(source), (position, access) => {
            const texturePoint = { x: texture.x + texture.width / 2 + position.x - center.x, y: texture.y + texture.height / 2 + position.y - center.y };
            const map = straight(access.sampleWithin(1, texturePoint, texture));
            return access.sampleWithin(0, { x: position.x + (map.r - .5) * scale, y: position.y + (map.g - .5) * scale }, source);
        }, bounds => [expanded(bounds, Math.abs(scale) / 2 + 1), texture]);
    } };

function closestPointOnSegment(position: GFXPoint, a: GFXPoint, b: GFXPoint): Readonly<{ point: GFXPoint; distance: number; }> {
    const dx = b.x - a.x, dy = b.y - a.y, lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= 1e-12)
        throw new RangeError("Geometry segment endpoints must be distinct.");
    const t = Math.max(0, Math.min(1, ((position.x - a.x) * dx + (position.y - a.y) * dy) / lengthSquared));
    const point = { x: a.x + dx * t, y: a.y + dy * t };
    return { point, distance: Math.hypot(position.x - point.x, position.y - point.y) };
}

geometry.glassLozenge = { category: "distortion", inputs: 1, normalise: value => {
        const p = fields(value, ["point0", "point1", "radius", "refraction"]), point0 = requiredPoint(p.point0), point1 = requiredPoint(p.point1);
        if (pointDistance(point0, point1) <= 1e-9)
            throw new RangeError("Glass lozenge endpoints must be distinct.");
        return { point0, point1, radius: requiredNumber(p.radius, 0, distortionRadiusMaximum), refraction: requiredNumber(p.refraction, .05, 8) };
    }, build: (inputs, p) => {
        const point0 = p.point0 as GFXPoint, point1 = p.point1 as GFXPoint, radius = p.radius as number, refraction = p.refraction as number;
        return boundedDistortion(inputs, "glassLozenge", p, radius, position => {
            if (radius === 0)
                return position;
            const nearest = closestPointOnSegment(position, point0, point1);
            if (nearest.distance >= radius || nearest.distance <= 1e-12)
                return position;
            const scale = 1 / refraction;
            return { x: nearest.point.x + (position.x - nearest.point.x) * scale, y: nearest.point.y + (position.y - nearest.point.y) * scale };
        });
    } };

geometry.lightTunnel = { category: "distortion", inputs: 1, normalise: value => {
        const p = fields(value, ["center", "radius", "rotation"]);
        return { center: requiredPoint(p.center), radius: requiredNumber(p.radius, 1e-6, distortionRadiusMaximum), rotation: requiredNumber(p.rotation, -distortionAngleMaximum, distortionAngleMaximum) };
    }, build: (inputs, p) => {
        const source = finiteInput(inputs[0]!), center = p.center as GFXPoint, radius = p.radius as number, rotation = p.rotation as number;
        return processor("lightTunnel", p, finiteExtent(source), (position, access) => {
            const dx = position.x - center.x, dy = position.y - center.y, distance = Math.hypot(dx, dy);
            if (distance <= 1e-12)
                return access.sampleWithin(0, position, source);
            const theta = Math.atan2(dy, dx) + rotation * distance / radius, mappedRadius = radius * (1 - Math.exp(-distance / radius));
            return access.sampleWithin(0, { x: center.x + mappedRadius * Math.cos(theta), y: center.y + mappedRadius * Math.sin(theta) }, source);
        }, () => [source]);
    } };

geometry.torusLensDistortion = { category: "distortion", inputs: 1, normalise: value => {
        const p = fields(value, ["center", "radius", "width", "refraction"]);
        return { center: requiredPoint(p.center), radius: requiredNumber(p.radius, 0, distortionRadiusMaximum), width: requiredNumber(p.width, 0, distortionRadiusMaximum), refraction: requiredNumber(p.refraction, .05, 8) };
    }, build: (inputs, p) => {
        const center = p.center as GFXPoint, radius = p.radius as number, width = p.width as number, refraction = p.refraction as number;
        return boundedDistortion(inputs, "torusLensDistortion", p, width, position => {
            if (width === 0)
                return position;
            const { dx, dy, distance } = radialDistance(position, center), delta = distance - radius, half = width / 2;
            if (distance <= 1e-12 || Math.abs(delta) >= half)
                return position;
            const mappedRadius = radius + delta / refraction;
            return radialPoint(center, dx, dy, mappedRadius / distance);
        });
    } };

function ninePartParameters(value: unknown, tiled: boolean) {
    const p = fields(value, tiled ? ["breakpoint0", "breakpoint1", "growAmount", "flipYTiles"] : ["breakpoint0", "breakpoint1", "growAmount"]);
    const breakpoint0 = requiredPoint(p.breakpoint0), breakpoint1 = requiredPoint(p.breakpoint1), growAmount = requiredPoint(p.growAmount);
    if (growAmount.x < 0 || growAmount.y < 0)
        throw new RangeError("Nine-part grow amount must be nonnegative.");
    return tiled ? { breakpoint0, breakpoint1, growAmount, flipYTiles: requiredBoolean(p.flipYTiles, "flipYTiles") } : { breakpoint0, breakpoint1, growAmount };
}

function ninePartAxis(value: number, origin: number, end: number, breakpoint0: number, breakpoint1: number, grow: number, tiled: boolean): number {
    const outputBreakpoint1 = breakpoint1 + grow;
    if (value < breakpoint0)
        return value;
    if (value >= outputBreakpoint1)
        return value - grow;
    const sourceSpan = breakpoint1 - breakpoint0, outputSpan = sourceSpan + grow;
    if (!tiled)
        return breakpoint0 + (value - breakpoint0) * sourceSpan / outputSpan;
    const offset = ((value - breakpoint0) % sourceSpan + sourceSpan) % sourceSpan;
    return Math.max(origin, Math.min(end - 1e-9, breakpoint0 + offset));
}

for (const name of ["ninePartStretched", "ninePartTiled"] as const) {
    geometry[name] = { category: "geometry", inputs: 1, normalise: value => ninePartParameters(value, name === "ninePartTiled"), build: (inputs, p) => {
            const source = finiteInput(inputs[0]!), p0 = p.breakpoint0 as GFXPoint, p1 = p.breakpoint1 as GFXPoint, grow = p.growAmount as GFXPoint;
            if (p0.x <= source.x || p0.y <= source.y || p1.x >= source.x + source.width || p1.y >= source.y + source.height || p1.x <= p0.x || p1.y <= p0.y)
                throw new RangeError("Nine-part breakpoints must define an interior positive rectangle.");
            const output = { x: source.x, y: source.y, width: source.width + grow.x, height: source.height + grow.y }, tiled = name === "ninePartTiled", flipY = p.flipYTiles === true;
            return processor(name, p, finiteExtent(output), (position, access) => {
                let y = ninePartAxis(position.y, source.y, source.y + source.height, p0.y, p1.y, grow.y, tiled);
                if (tiled && flipY && position.y >= p0.y && position.y < p1.y + grow.y) {
                    const span = p1.y - p0.y, tileIndex = Math.floor((position.y - p0.y) / span);
                    if (Math.abs(tileIndex) % 2 === 1)
                        y = p1.y - (y - p0.y) - 1e-9;
                }
                const x = ninePartAxis(position.x, source.x, source.x + source.width, p0.x, p1.x, grow.x, tiled);
                return access.sampleWithin(0, { x, y }, source, "nearest");
            }, () => [source]);
        } };
}

geometry.stretchCrop = { category: "geometry", inputs: 1, normalise: value => {
        const p = fields(value, ["size", "cropAmount", "centerStretchAmount"]), size = requiredPoint(p.size);
        if (!(size.x > 0) || !(size.y > 0) || size.x > 1e5 || size.y > 1e5)
            throw new RangeError("Stretch-crop size must be positive and bounded.");
        return { size, cropAmount: requiredNumber(p.cropAmount, 0, 1), centerStretchAmount: requiredNumber(p.centerStretchAmount, 0, 1) };
    }, build: (inputs, p) => {
        const source = finiteInput(inputs[0]!), size = p.size as GFXPoint, cropAmount = p.cropAmount as number, centreAmount = p.centerStretchAmount as number;
        const output = { x: source.x, y: source.y, width: size.x, height: size.y }, cover = Math.max(size.x / source.width, size.y / source.height);
        const visibleWidth = size.x / cover, visibleHeight = size.y / cover, cropX = source.x + (source.width - visibleWidth) / 2, cropY = source.y + (source.height - visibleHeight) / 2;
        const warp = (u: number) => u + centreAmount * (u - .5) * (1 - 4 * (u - .5) ** 2);
        return processor("stretchCrop", p, finiteExtent(output), (position, access) => {
            const u = (position.x - output.x) / output.width, v = (position.y - output.y) / output.height;
            const stretchedX = source.x + warp(u) * source.width, stretchedY = source.y + warp(v) * source.height;
            const croppedX = cropX + u * visibleWidth, croppedY = cropY + v * visibleHeight;
            return access.sampleWithin(0, { x: stretchedX + (croppedX - stretchedX) * cropAmount, y: stretchedY + (croppedY - stretchedY) * cropAmount }, source);
        }, () => [source]);
    } };

function fourCoordinateParameters(value: unknown, extra: readonly string[]) {
    const p = fields(value, ["topLeft", "topRight", "bottomRight", "bottomLeft", ...extra]);
    const quad = requiredPerspectiveQuad(p);
    return { p, quad };
}

geometry.perspectiveCorrection = { category: "geometry", inputs: 1, normalise: value => {
        const { p, quad } = fourCoordinateParameters(value, ["crop"]);
        return { topLeft: quad[0], topRight: quad[1], bottomRight: quad[2], bottomLeft: quad[3], crop: requiredBoolean(p.crop, "crop") };
    }, build: (inputs, p) => {
        const quad = requiredPerspectiveQuad(p as Record<string, unknown>), crop = p.crop as boolean;
        return rectifiedProcessor("perspectiveCorrection", inputs, p, quad, correctedRect(quad, crop));
    } };

for (const name of ["keystoneCorrectionCombined", "keystoneCorrectionHorizontal", "keystoneCorrectionVertical"] as const) {
    geometry[name] = { category: "geometry", inputs: 1, normalise: value => {
            const { p, quad } = fourCoordinateParameters(value, ["focalLength"]);
            return { topLeft: quad[0], topRight: quad[1], bottomRight: quad[2], bottomLeft: quad[3], focalLength: requiredNumber(p.focalLength, 1e-6, 1e6) };
        }, build: (inputs, p) => {
            const quad = requiredPerspectiveQuad(p as Record<string, unknown>), focalLength = p.focalLength as number, base = correctedRect(quad, false);
            const horizontalSkew = (Math.abs(quad[0].x - quad[3].x) + Math.abs(quad[1].x - quad[2].x)) / 2;
            const verticalSkew = (Math.abs(quad[0].y - quad[1].y) + Math.abs(quad[3].y - quad[2].y)) / 2;
            const target = {
                x: base.x,
                y: base.y,
                width: base.width * (name === "keystoneCorrectionVertical" ? 1 : Math.hypot(focalLength, horizontalSkew) / focalLength),
                height: base.height * (name === "keystoneCorrectionHorizontal" ? 1 : Math.hypot(focalLength, verticalSkew) / focalLength),
            };
            return rectifiedProcessor(name, inputs, p, quad, target);
        } };
}

geometry.perspectiveRotate = { category: "geometry", inputs: 1, normalise: value => {
        const p = fields(value, ["focalLength", "pitch", "roll", "yaw"]);
        return { focalLength: requiredNumber(p.focalLength, 1e-6, 1e6), pitch: requiredNumber(p.pitch, -1.4, 1.4), roll: requiredNumber(p.roll, -Math.PI, Math.PI), yaw: requiredNumber(p.yaw, -1.4, 1.4) };
    }, build: (inputs, p) => {
        const source = finiteInput(inputs[0]!), focal = p.focalLength as number, pitch = p.pitch as number, roll = p.roll as number, yaw = p.yaw as number;
        const cx = source.x + source.width / 2, cy = source.y + source.height / 2, cp = Math.cos(pitch), sp = Math.sin(pitch), cyaw = Math.cos(yaw), syaw = Math.sin(yaw), cr = Math.cos(roll), sr = Math.sin(roll);
        const project3D = (point: GFXPoint): GFXPoint => {
            const x0 = point.x - cx, y0 = point.y - cy;
            const y1 = y0 * cp, z1 = y0 * sp;
            const x2 = x0 * cyaw + z1 * syaw, z2 = -x0 * syaw + z1 * cyaw;
            const x3 = x2 * cr - y1 * sr, y3 = x2 * sr + y1 * cr, denominator = focal + z2;
            if (!(denominator > 1e-6))
                throw new RangeError("Perspective rotation crosses the camera plane.");
            const scale = focal / denominator;
            return Object.freeze({ x: cx + x3 * scale, y: cy + y3 * scale });
        };
        const target = Object.freeze(quadForRect(source).map(project3D)) as unknown as PerspectiveQuad;
        assertPerspectiveQuad(target);
        const mapping = solvePerspectiveMapping(target, quadForRect(source));
        assertNoPerspectiveHorizon(mapping, target);
        return processor("perspectiveRotate", p, finiteExtent(quadBounds(target)), (position, access) => {
            const mapped = project(mapping, position);
            return !mapped || !pointIsInside(mapped.point, source) ? transparent : access.sampleWithin(0, mapped.point, source);
        }, bounds => [perspectiveROI(mapping, bounds, source)]);
    } };
geometry.displacement = { category: "distortion", inputs: 2, normalise: value => {
        const p = fields(value, ["scale"]);
        return { scale: number(p.scale, 50, -1000, 1000) };
    }, build: (inputs, p) => processor("displacement", p, inputs[0]!.extent, (position, access) => {
        const map = straight(access.sample(1, position)), scale = p.scale as number;
        return access.sample(0, { x: position.x + (map.r - .5) * scale, y: position.y + (map.g - .5) * scale });
    }, r => [expanded(r, Math.abs(p.scale as number) / 2 + 1), r]) };
geometry.pixellate = { category: "stylize", inputs: 1, normalise: value => {
        const p = fields(value, ["center", "scale"]);
        return { center: point(p.center), scale: number(p.scale, 8, 1, 1e5) };
    }, build: (inputs, p) => {
        const e = finiteInput(inputs[0]!), center = p.center as GFXPoint, scale = p.scale as number;
        return processor("pixellate", p, inputs[0]!.extent, (position, access) => access.sample(0, { x: Math.max(e.x + .5, Math.min(e.x + e.width - .5, center.x + (Math.floor((position.x - center.x) / scale) + .5) * scale)), y: Math.max(e.y + .5, Math.min(e.y + e.height - .5, center.y + (Math.floor((position.y - center.y) / scale) + .5) * scale)) }, "nearest"), r => [expanded(r, scale)]);
    } };
for (const name of ["affineTile", "affineClamp"]) {
    geometry[name] = { category: "tile", inputs: 1, normalise: value => {
            const p = fields(value, ["transform"]), t = transform(p.transform);
            invertTransform(t);
            return { transform: t };
        }, build: (inputs, p) => {
            const e = finiteInput(inputs[0]!), inverse = invertTransform(p.transform as import("../../GraphicsFX/GFXGeometry").GFXAffineTransform);
            return processor(name, p, infiniteExtent, (position, access) => {
                const q = transformPoint(position, inverse);
                if (name === "affineClamp")
                    return access.sample(0, { x: Math.max(e.x + .5, Math.min(e.x + e.width - .5, q.x)), y: Math.max(e.y + .5, Math.min(e.y + e.height - .5, q.y)) });
                const wrap = (value: number, origin: number, size: number) => origin + ((value - origin) % size + size) % size;
                const x = Math.floor(q.x - e.x - .5), y = Math.floor(q.y - e.y - .5), fx = q.x - e.x - .5 - x, fy = q.y - e.y - .5 - y, read = (dx: number, dy: number) => access.sample(0, { x: wrap(e.x + x + dx + .5, e.x, e.width), y: wrap(e.y + y + dy + .5, e.y, e.height) }, "nearest");
                return mix(mix(read(0, 0), read(1, 0), fx), mix(read(0, 1), read(1, 1), fx), fy);
            }, () => [e]);
        } };
}
geometry.straighten = { category: "geometry", inputs: 1, normalise: value => {
        const p = fields(value, ["angle"]);
        return { angle: number(p.angle, 0, -Math.PI, Math.PI) };
    }, build: (inputs, p) => {
        const e = finiteInput(inputs[0]!), angle = p.angle as number, c = Math.cos(angle), s = Math.sin(angle), scale = Math.max(Math.abs(c) + Math.abs(s) * e.height / e.width, Math.abs(c) + Math.abs(s) * e.width / e.height), cx = e.x + e.width / 2, cy = e.y + e.height / 2, t = { a: c / scale, b: -s / scale, c: s / scale, d: c / scale, tx: cx - (c * cx + s * cy) / scale, ty: cy - (-s * cx + c * cy) / scale };
        return processor("straighten", p, inputs[0]!.extent, (position, access) => access.sample(0, transformPoint(position, t)), r => [expanded(transformRect(r, t), 1)]);
    } };
geometry.lanczosScale = { category: "geometry", inputs: 1, normalise: value => {
        const p = fields(value, ["scale", "aspectRatio"]);
        return { scale: number(p.scale, 1, .25, 4), aspectRatio: number(p.aspectRatio, 1, .25, 4) };
    }, build: (inputs, p) => {
        const e = finiteInput(inputs[0]!), sy = p.scale as number, sx = sy * (p.aspectRatio as number), kx = Math.min(1, sx), ky = Math.min(1, sy), rx = Math.ceil(3 / kx), ry = Math.ceil(3 / ky);
        if (rx * ry > 144)
            throw new RangeError("Lanczos kernel exceeds sample support budget.");
        const sinc = (x: number) => Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x), weight = (x: number) => Math.abs(x) < 3 ? sinc(x) * sinc(x / 3) : 0;
        return processor("lanczosScale", p, finiteExtent({ x: e.x * sx, y: e.y * sy, width: e.width * sx, height: e.height * sy }), (position, access) => {
            const q = { x: position.x / sx, y: position.y / sy }, ix = Math.floor(q.x - e.x - .5), iy = Math.floor(q.y - e.y - .5);
            let sum = 0;
            const out = { r: 0, g: 0, b: 0, a: 0 };
            for (let y = -ry; y <= ry; y++)
                for (let x = -rx; x <= rx; x++) {
                    const px = e.x + ix + x + .5, py = e.y + iy + y + .5, w = weight((q.x - px) * kx) * weight((q.y - py) * ky);
                    if (w === 0)
                        continue;
                    const sample = access.sample(0, { x: px, y: py }, "nearest");
                    sum += w;
                    out.r += sample.r * w;
                    out.g += sample.g * w;
                    out.b += sample.b * w;
                    out.a += sample.a * w;
                }
            if (sum) {
                out.r /= sum;
                out.g /= sum;
                out.b /= sum;
                out.a /= sum;
            }
            return out;
        }, r => [expanded({ x: r.x / sx, y: r.y / sy, width: r.width / sx, height: r.height / sy }, Math.max(rx, ry))]);
    } };
