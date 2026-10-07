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

function finite(value: number, name: string): number {
    if (!Number.isFinite(value))
        throw new RangeError(`${name} must be finite.`);
    return value;
}
function nonNegative(value: number, name: string): number {
    finite(value, name);
    if (value < 0)
        throw new RangeError(`${name} must not be negative.`);
    return value;
}
export interface GFXPoint {
    readonly x: number;
    readonly y: number;
}
export interface GFXSize {
    readonly width: number;
    readonly height: number;
}
export interface GFXRect extends GFXPoint, GFXSize {
}
export function normalisePoint(value: GFXPoint): GFXPoint {
    return Object.freeze({ x: finite(value.x, "Point x"), y: finite(value.y, "Point y") });
}
export function normaliseSize(value: GFXSize): GFXSize {
    return Object.freeze({
        width: nonNegative(value.width, "Size width"),
        height: nonNegative(value.height, "Size height"),
    });
}
export function normaliseRect(value: GFXRect): GFXRect {
    return Object.freeze({
        x: finite(value.x, "Rectangle x"),
        y: finite(value.y, "Rectangle y"),
        width: nonNegative(value.width, "Rectangle width"),
        height: nonNegative(value.height, "Rectangle height"),
    });
}
export const pointsEqual = (left: GFXPoint, right: GFXPoint): boolean => left.x === right.x && left.y === right.y;
export const sizesEqual = (left: GFXSize, right: GFXSize): boolean => left.width === right.width && left.height === right.height;
export const rectsEqual = (left: GFXRect, right: GFXRect): boolean => pointsEqual(left, right) && sizesEqual(left, right);
export function offsetRect(rect: GFXRect, dx: number, dy: number): GFXRect {
    const value = normaliseRect(rect);
    return normaliseRect({ ...value, x: value.x + finite(dx, "Offset x"), y: value.y + finite(dy, "Offset y") });
}
export function insetRect(rect: GFXRect, dx: number, dy: number): GFXRect {
    const value = normaliseRect(rect);
    finite(dx, "Inset x");
    finite(dy, "Inset y");
    return normaliseRect({
        x: value.x + dx,
        y: value.y + dy,
        width: value.width - dx * 2,
        height: value.height - dy * 2,
    });
}
export function unionRects(left: GFXRect, right: GFXRect): GFXRect {
    const a = normaliseRect(left);
    const b = normaliseRect(right);
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return normaliseRect({
        x,
        y,
        width: Math.max(a.x + a.width, b.x + b.width) - x,
        height: Math.max(a.y + a.height, b.y + b.height) - y,
    });
}
export function intersectRects(left: GFXRect, right: GFXRect): GFXRect | null {
    const a = normaliseRect(left);
    const b = normaliseRect(right);
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    const rightEdge = Math.min(a.x + a.width, b.x + b.width);
    const bottomEdge = Math.min(a.y + a.height, b.y + b.height);
    return rightEdge < x || bottomEdge < y
        ? null
        : normaliseRect({ x, y, width: rightEdge - x, height: bottomEdge - y });
}
export function rectContainsPoint(rect: GFXRect, point: GFXPoint): boolean {
    const value = normaliseRect(rect);
    const candidate = normalisePoint(point);
    return candidate.x >= value.x && candidate.y >= value.y && candidate.x <= value.x + value.width && candidate.y <= value.y + value.height;
}
export function rectContainsRect(rect: GFXRect, candidate: GFXRect): boolean {
    const outer = normaliseRect(rect);
    const inner = normaliseRect(candidate);
    return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
}
export function clampPointToRect(point: GFXPoint, rect: GFXRect): GFXPoint {
    const candidate = normalisePoint(point);
    const bounds = normaliseRect(rect);
    return normalisePoint({
        x: Math.min(bounds.x + bounds.width, Math.max(bounds.x, candidate.x)),
        y: Math.min(bounds.y + bounds.height, Math.max(bounds.y, candidate.y)),
    });
}
export interface GFXVector {
    readonly dx: number;
    readonly dy: number;
}
export interface GFXAffineTransform {
    readonly a: number;
    readonly b: number;
    readonly c: number;
    readonly d: number;
    readonly tx: number;
    readonly ty: number;
}
export const GFXIdentityTransform: GFXAffineTransform = Object.freeze({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });
export function normaliseAffineTransform(value: GFXAffineTransform): GFXAffineTransform {
    return Object.freeze({ a: finite(value.a, "a"), b: finite(value.b, "b"), c: finite(value.c, "c"), d: finite(value.d, "d"), tx: finite(value.tx, "tx"), ty: finite(value.ty, "ty") });
}
/** Composition applies right first, then left, using column vectors. */
export function concatenateTransforms(left: GFXAffineTransform, right: GFXAffineTransform): GFXAffineTransform {
    const l = normaliseAffineTransform(left), r = normaliseAffineTransform(right);
    return normaliseAffineTransform({ a: l.a * r.a + l.c * r.b, b: l.b * r.a + l.d * r.b, c: l.a * r.c + l.c * r.d, d: l.b * r.c + l.d * r.d, tx: l.a * r.tx + l.c * r.ty + l.tx, ty: l.b * r.tx + l.d * r.ty + l.ty });
}
export function invertTransform(transform: GFXAffineTransform): GFXAffineTransform {
    const t = normaliseAffineTransform(transform), determinant = t.a * t.d - t.b * t.c;
    if (determinant === 0 || !Number.isFinite(determinant))
        throw new RangeError("Transform is singular or its determinant overflows.");
    return normaliseAffineTransform({ a: t.d / determinant, b: -t.b / determinant, c: -t.c / determinant, d: t.a / determinant, tx: (t.c * t.ty - t.d * t.tx) / determinant, ty: (t.b * t.tx - t.a * t.ty) / determinant });
}
export function transformPoint(point: GFXPoint, transform: GFXAffineTransform): GFXPoint {
    const p = normalisePoint(point), t = normaliseAffineTransform(transform);
    return normalisePoint({ x: t.a * p.x + t.c * p.y + t.tx, y: t.b * p.x + t.d * p.y + t.ty });
}
export function transformVector(vector: GFXVector, transform: GFXAffineTransform): GFXVector {
    const t = normaliseAffineTransform(transform), dx = finite(vector.dx, "dx"), dy = finite(vector.dy, "dy");
    return Object.freeze({ dx: finite(t.a * dx + t.c * dy, "dx"), dy: finite(t.b * dx + t.d * dy, "dy") });
}
export function transformRect(rect: GFXRect, transform: GFXAffineTransform): GFXRect {
    const r = normaliseRect(rect), corners = [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y }, { x: r.x, y: r.y + r.height }, { x: r.x + r.width, y: r.y + r.height }].map(p => transformPoint(p, transform));
    const x = Math.min(...corners.map(p => p.x)), y = Math.min(...corners.map(p => p.y));
    return normaliseRect({ x, y, width: Math.max(...corners.map(p => p.x)) - x, height: Math.max(...corners.map(p => p.y)) - y });
}
