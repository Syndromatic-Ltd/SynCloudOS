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

import type { GFXPoint, GFXRect } from "./GFXGeometry";
import type { GFXAffineTransform, GFXPathCommand } from "./graphicsTypes";
import { flattenGFXPathCommands } from "./GFXPathFlattening";
const freezeCommand = (command: GFXPathCommand): GFXPathCommand => Object.freeze(command);
const number = (value: number) => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
const samePoint = (a: GFXPoint, b: GFXPoint) => a.x === b.x && a.y === b.y;
function quadraticValue(start: number, control: number, end: number, t: number): number {
    const inverse = 1 - t;
    return inverse * inverse * start + 2 * inverse * t * control + t * t * end;
}
function cubicValue(start: number, control1: number, control2: number, end: number, t: number): number {
    const inverse = 1 - t;
    return inverse * inverse * inverse * start
        + 3 * inverse * inverse * t * control1
        + 3 * inverse * t * t * control2
        + t * t * t * end;
}
function appendRoot(roots: number[], value: number): void {
    if (Number.isFinite(value) && value > 0 && value < 1 && !roots.some((root) => Math.abs(root - value) <= 1e-12))
        roots.push(value);
}
function quadraticExtrema(start: number, control: number, end: number): number[] {
    const denominator = start - 2 * control + end;
    if (Math.abs(denominator) <= Number.EPSILON)
        return [];
    return [(start - control) / denominator].filter((value) => Number.isFinite(value) && value > 0 && value < 1);
}
function cubicExtrema(start: number, control1: number, control2: number, end: number): number[] {
    // B'(t) = 3At^2 + 2Bt + C.
    const a = -start + 3 * control1 - 3 * control2 + end;
    const b = start - 2 * control1 + control2;
    const c = control1 - start;
    const roots: number[] = [];
    const quadraticA = 3 * a;
    const quadraticB = 6 * b;
    const quadraticC = 3 * c;
    if (Math.abs(quadraticA) <= Number.EPSILON) {
        if (Math.abs(quadraticB) > Number.EPSILON)
            appendRoot(roots, -quadraticC / quadraticB);
        return roots;
    }
    const discriminant = quadraticB * quadraticB - 4 * quadraticA * quadraticC;
    if (discriminant < -Number.EPSILON)
        return roots;
    if (Math.abs(discriminant) <= Number.EPSILON) {
        appendRoot(roots, -quadraticB / (2 * quadraticA));
        return roots;
    }
    const squareRoot = Math.sqrt(discriminant);
    appendRoot(roots, (-quadraticB - squareRoot) / (2 * quadraticA));
    appendRoot(roots, (-quadraticB + squareRoot) / (2 * quadraticA));
    return roots;
}
function pointOnSegment(point: GFXPoint, start: GFXPoint, end: GFXPoint): boolean {
    const cross = (point.x - start.x) * (end.y - start.y) - (point.y - start.y) * (end.x - start.x);
    if (Math.abs(cross) > 1e-8)
        return false;
    const dot = (point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y);
    if (dot < -1e-8)
        return false;
    const lengthSquared = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
    return dot <= lengthSquared + 1e-8;
}
function windingNumber(point: GFXPoint, vertices: readonly GFXPoint[]): number | null {
    let winding = 0;
    for (let index = 0; index < vertices.length; index += 1) {
        const start = vertices[index]!;
        const end = vertices[(index + 1) % vertices.length]!;
        if (start.x === end.x && start.y === end.y)
            continue;
        if (pointOnSegment(point, start, end))
            return null;
        const cross = (end.x - start.x) * (point.y - start.y) - (point.x - start.x) * (end.y - start.y);
        if (start.y <= point.y) {
            if (end.y > point.y && cross > 0)
                winding += 1;
        }
        else if (end.y <= point.y && cross < 0) {
            winding -= 1;
        }
    }
    return winding;
}
function finiteRecord<T extends string>(value: unknown, keys: readonly T[], name: string): Record<T, number> {
    if (!value || typeof value !== "object" || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) || Object.getOwnPropertySymbols(value).length)
        throw new TypeError(`${name} must be a plain record.`);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.keys(descriptors).length !== keys.length || keys.some((key) => !descriptors[key] || !Object.prototype.hasOwnProperty.call(descriptors[key]!, "value") || typeof descriptors[key]!.value !== "number" || !Number.isFinite(descriptors[key]!.value)))
        throw new TypeError(`${name} must contain finite data properties.`);
    return Object.fromEntries(keys.map((key) => [key, descriptors[key]!.value])) as Record<T, number>;
}
const normalisePoint = (value: unknown): GFXPoint => Object.freeze(finiteRecord(value, ["x", "y"], "Point")) as unknown as GFXPoint;
const normaliseRect = (value: unknown): GFXRect => {
    const rect = finiteRecord(value, ["x", "y", "width", "height"], "Rectangle");
    if (rect.width < 0 || rect.height < 0)
        throw new RangeError("Rectangle dimensions must not be negative.");
    return Object.freeze(rect) as GFXRect;
};
export class GFXPath {
    readonly commands: readonly GFXPathCommand[];
    constructor(commands: readonly GFXPathCommand[] = []) {
        if (!Array.isArray(commands) || Object.getPrototypeOf(commands) !== Array.prototype)
            throw new TypeError("Path commands must be a plain dense array.");
        const descriptors = Object.getOwnPropertyDescriptors(commands);
        if (commands.length > 10000 || Array.from({ length: commands.length }, (_, index) => descriptors[index]).some((slot) => !slot || !Object.prototype.hasOwnProperty.call(slot, "value")))
            throw new RangeError("Path command list is invalid or too large.");
        this.commands = Object.freeze(Array.from({ length: commands.length }, (_, index) => normaliseCommand(descriptors[index]!.value as GFXPathCommand)));
        Object.freeze(this);
    }
    static rect(rect: GFXRect) {
        const { x, y, width, height } = normaliseRect(rect);
        return new GFXPath([
            freezeCommand({ kind: "move", point: Object.freeze({ x, y }) }),
            freezeCommand({ kind: "line", point: Object.freeze({ x: x + width, y }) }),
            freezeCommand({ kind: "line", point: Object.freeze({ x: x + width, y: y + height }) }),
            freezeCommand({ kind: "line", point: Object.freeze({ x, y: y + height }) }), freezeCommand({ kind: "close" }),
        ]);
    }
    static roundedRect(rect: GFXRect, radius: number) {
        const { x, y, width, height } = normaliseRect(rect);
        if (!Number.isFinite(radius) || radius < 0)
            throw new RangeError("Corner radius must be finite and non-negative.");
        const r = Math.min(radius, width / 2, height / 2);
        const k = 0.5522847498;
        return new GFXPath([
            freezeCommand({ kind: "move", point: { x: x + r, y } }), freezeCommand({ kind: "line", point: { x: x + width - r, y } }),
            freezeCommand({ kind: "curve", control1: { x: x + width - r + r * k, y }, control2: { x: x + width, y: y + r - r * k }, point: { x: x + width, y: y + r } }),
            freezeCommand({ kind: "line", point: { x: x + width, y: y + height - r } }),
            freezeCommand({ kind: "curve", control1: { x: x + width, y: y + height - r + r * k }, control2: { x: x + width - r + r * k, y: y + height }, point: { x: x + width - r, y: y + height } }),
            freezeCommand({ kind: "line", point: { x: x + r, y: y + height } }),
            freezeCommand({ kind: "curve", control1: { x: x + r - r * k, y: y + height }, control2: { x, y: y + height - r + r * k }, point: { x, y: y + height - r } }),
            freezeCommand({ kind: "line", point: { x, y: y + r } }),
            freezeCommand({ kind: "curve", control1: { x, y: y + r - r * k }, control2: { x: x + r - r * k, y }, point: { x: x + r, y } }), freezeCommand({ kind: "close" }),
        ].map((command) => normaliseCommand(command)));
    }
    static ellipse(rect: GFXRect) {
        const { x, y, width, height } = normaliseRect(rect);
        const cx = x + width / 2;
        const cy = y + height / 2;
        const rx = width / 2;
        const ry = height / 2;
        const k = 0.5522847498;
        return new GFXPath([
            { kind: "move", point: { x: cx + rx, y: cy } },
            { kind: "curve", control1: { x: cx + rx, y: cy + ry * k }, control2: { x: cx + rx * k, y: cy + ry }, point: { x: cx, y: cy + ry } },
            { kind: "curve", control1: { x: cx - rx * k, y: cy + ry }, control2: { x: cx - rx, y: cy + ry * k }, point: { x: cx - rx, y: cy } },
            { kind: "curve", control1: { x: cx - rx, y: cy - ry * k }, control2: { x: cx - rx * k, y: cy - ry }, point: { x: cx, y: cy - ry } },
            { kind: "curve", control1: { x: cx + rx * k, y: cy - ry }, control2: { x: cx + rx, y: cy - ry * k }, point: { x: cx + rx, y: cy } }, { kind: "close" },
        ]);
    }
    move(point: GFXPoint) {
        return this.appending({ kind: "move", point: normalisePoint(point) });
    }
    line(point: GFXPoint) {
        return this.appending({ kind: "line", point: normalisePoint(point) });
    }
    quad(control: GFXPoint, point: GFXPoint) {
        return this.appending({ kind: "quad", control: normalisePoint(control), point: normalisePoint(point) });
    }
    curve(control1: GFXPoint, control2: GFXPoint, point: GFXPoint) {
        return this.appending({ kind: "curve", control1: normalisePoint(control1), control2: normalisePoint(control2), point: normalisePoint(point) });
    }
    arc(centre: GFXPoint, radius: number, startAngle: number, endAngle: number, clockwise = false) {
        const c = normalisePoint(centre);
        if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(startAngle) || !Number.isFinite(endAngle) || typeof clockwise !== "boolean")
            throw new RangeError("Arc geometry must be finite and bounded.");
        let delta = endAngle - startAngle;
        if (clockwise && delta > 0)
            delta -= Math.PI * 2;
        if (!clockwise && delta < 0)
            delta += Math.PI * 2;
        if (Math.abs(delta) > Math.PI * 2 + 1e-9)
            throw new RangeError("Arc span must not exceed one revolution.");
        const segments = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)));
        const step = delta / segments;
        const start = { x: c.x + Math.cos(startAngle) * radius, y: c.y + Math.sin(startAngle) * radius };
        let path = this.commands.length ? this.line(start) : this.move(start);
        for (let index = 0; index < segments; index += 1) {
            const a = startAngle + step * index;
            const b = a + step;
            const k = (4 / 3) * Math.tan((b - a) / 4);
            path = path.curve({ x: c.x + radius * (Math.cos(a) - k * Math.sin(a)), y: c.y + radius * (Math.sin(a) + k * Math.cos(a)) }, { x: c.x + radius * (Math.cos(b) + k * Math.sin(b)), y: c.y + radius * (Math.sin(b) - k * Math.cos(b)) }, { x: c.x + radius * Math.cos(b), y: c.y + radius * Math.sin(b) });
        }
        return path;
    }
    close() {
        return this.appending({ kind: "close" });
    }
    appending(command: GFXPathCommand) {
        return new GFXPath([...this.commands, freezeCommand(normaliseCommand(command))]);
    }
    append(path: GFXPath) {
        if (!(path instanceof GFXPath))
            throw new TypeError("A typed path is required.");
        return new GFXPath([...this.commands, ...path.commands]);
    }
    transformed(transform: GFXAffineTransform) {
        const descriptor = Object.getOwnPropertyDescriptors(transform);
        const keys = ["a", "b", "c", "d", "tx", "ty"] as const;
        if (!transform || typeof transform !== "object" || keys.some((key) => !descriptor[key] || !Object.prototype.hasOwnProperty.call(descriptor[key]!, "value") || typeof descriptor[key]!.value !== "number" || !Number.isFinite(descriptor[key]!.value)))
            throw new TypeError("Affine transform must contain finite data properties.");
        const t = Object.fromEntries(keys.map((key) => [key, descriptor[key]!.value])) as unknown as GFXAffineTransform;
        const point = (value: GFXPoint) => ({ x: t.a * value.x + t.c * value.y + t.tx, y: t.b * value.x + t.d * value.y + t.ty });
        return new GFXPath(this.commands.map((command): GFXPathCommand => command.kind === "close" ? command
            : command.kind === "move" || command.kind === "line" ? { kind: command.kind, point: point(command.point) }
                : command.kind === "quad" ? { kind: command.kind, control: point(command.control), point: point(command.point) }
                    : { kind: command.kind, control1: point(command.control1), control2: point(command.control2), point: point(command.point) }));
    }
    get bounds(): GFXRect {
        const points: GFXPoint[] = [];
        let current: GFXPoint | null = null;
        let subpathStart: GFXPoint | null = null;
        const add = (point: GFXPoint) => {
            points.push(point);
        };
        for (const command of this.commands) {
            if (command.kind === "move") {
                add(command.point);
                current = command.point;
                subpathStart = command.point;
                continue;
            }
            if (command.kind === "line") {
                // A line without a preceding move is not renderable, but retaining its
                // endpoint preserves the established finite, deterministic behaviour
                // for data-only paths.
                add(command.point);
                current = command.point;
                continue;
            }
            if (command.kind === "quad") {
                if (!current) {
                    add(command.point);
                    current = command.point;
                    continue;
                }
                add(current);
                add(command.point);
                for (const t of quadraticExtrema(current.x, command.control.x, command.point.x)) {
                    add({ x: quadraticValue(current.x, command.control.x, command.point.x, t), y: quadraticValue(current.y, command.control.y, command.point.y, t) });
                }
                for (const t of quadraticExtrema(current.y, command.control.y, command.point.y)) {
                    add({ x: quadraticValue(current.x, command.control.x, command.point.x, t), y: quadraticValue(current.y, command.control.y, command.point.y, t) });
                }
                current = command.point;
                continue;
            }
            if (command.kind === "curve") {
                if (!current) {
                    add(command.point);
                    current = command.point;
                    continue;
                }
                add(current);
                add(command.point);
                for (const t of cubicExtrema(current.x, command.control1.x, command.control2.x, command.point.x)) {
                    add({ x: cubicValue(current.x, command.control1.x, command.control2.x, command.point.x, t), y: cubicValue(current.y, command.control1.y, command.control2.y, command.point.y, t) });
                }
                for (const t of cubicExtrema(current.y, command.control1.y, command.control2.y, command.point.y)) {
                    add({ x: cubicValue(current.x, command.control1.x, command.control2.x, command.point.x, t), y: cubicValue(current.y, command.control1.y, command.control2.y, command.point.y, t) });
                }
                current = command.point;
                continue;
            }
            if (current && subpathStart)
                current = subpathStart;
        }
        if (!points.length)
            return Object.freeze({ x: 0, y: 0, width: 0, height: 0 });
        const xs = points.map(({ x }) => x);
        const ys = points.map(({ y }) => y);
        const x = Math.min(...xs);
        const y = Math.min(...ys);
        return Object.freeze({ x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y });
    }
    contains(point: GFXPoint, rule: "nonzero" | "evenodd" = "nonzero"): boolean {
        if (rule !== "nonzero" && rule !== "evenodd")
            throw new TypeError("Unsupported fill rule.");
        const candidate = normalisePoint(point);
        let winding = 0;
        for (const contour of flattenGFXPathCommands(this.commands)) {
            if (contour.points.length < 3) continue;
            const contribution = windingNumber(candidate, contour.points);
            if (contribution === null)
                return true;
            winding += contribution;
        }
        return rule === "evenodd" ? Math.abs(winding) % 2 === 1 : winding !== 0;
    }
    /** Arc length uses the canonical bounded 1/16-unit curve flattening. */
    length(): number {
        let total = 0;
        for (const contour of flattenGFXPathCommands(this.commands)) {
            for (let index = 1; index < contour.points.length; index++) {
                const a = contour.points[index - 1]!, b = contour.points[index]!;
                total += Math.hypot(b.x - a.x, b.y - a.y);
                if (!Number.isFinite(total)) throw new RangeError("Path length overflow.");
            }
        }
        return total;
    }
    /** Trim by total arc-length fraction across all contours; partial curves become bounded polylines. */
    trimmed(startFraction: number, endFraction: number): GFXPath {
        if (![startFraction, endFraction].every(value => Number.isFinite(value) && value >= 0 && value <= 1))
            throw new RangeError("Trim fractions must be finite values between zero and one.");
        if (startFraction >= endFraction) return new GFXPath();
        if (startFraction === 0 && endFraction === 1) return this;
        const contours = flattenGFXPathCommands(this.commands);
        let total = 0;
        for (const contour of contours)
            for (let index = 1; index < contour.points.length; index++) {
                const a = contour.points[index - 1]!, b = contour.points[index]!;
                total += Math.hypot(b.x - a.x, b.y - a.y);
                if (!Number.isFinite(total)) throw new RangeError("Path length overflow.");
            }
        if (total === 0) return new GFXPath();
        const start = total * startFraction, end = total * endFraction, commands: GFXPathCommand[] = [];
        let cursor = 0;
        const emit = (command: GFXPathCommand) => {
            if (commands.length >= 10000) throw new RangeError("Trimmed path command limit exceeded.");
            commands.push(command);
        };
        for (const contour of contours) {
            const contourStart = cursor;
            let drawing = false;
            for (let index = 1; index < contour.points.length; index++) {
                const a = contour.points[index - 1]!, b = contour.points[index]!, length = Math.hypot(b.x - a.x, b.y - a.y);
                const lower = Math.max(start, cursor), upper = Math.min(end, cursor + length);
                if (length > 0 && upper > lower) {
                    const point = (distance: number): GFXPoint => ({ x: a.x + (b.x - a.x) * distance / length, y: a.y + (b.y - a.y) * distance / length });
                    if (!drawing) { emit({ kind: "move", point: point(lower - cursor) }); drawing = true; }
                    emit({ kind: "line", point: point(upper - cursor) });
                }
                cursor += length;
            }
            if (drawing && contour.closed && start <= contourStart && end >= cursor) emit({ kind: "close" });
        }
        return new GFXPath(commands);
    }
    /** Flattened curve length is evaluated at the same 1/16-unit tolerance as containment. */
    dashed(lengths: readonly number[], phase = 0): GFXPath {
        if (!Array.isArray(lengths) || Object.getPrototypeOf(lengths) !== Array.prototype || Object.getOwnPropertySymbols(lengths).length || lengths.length > 64 || !Number.isFinite(phase))
            throw new TypeError("Invalid dash pattern or phase.");
        const pattern: number[] = [];
        for (let i = 0; i < lengths.length; i++) {
            const descriptor = Object.getOwnPropertyDescriptor(lengths, i);
            if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "number" || !Number.isFinite(descriptor.value) || descriptor.value < 0)
                throw new RangeError("Dash lengths must be non-negative finite data.");
            pattern.push(descriptor.value);
        }
        if (!pattern.length)
            return this;
        if (pattern.length % 2)
            pattern.push(...pattern);
        const period = pattern.reduce((a, b) => a + b, 0);
        if (!Number.isFinite(period) || period <= 0)
            throw new RangeError("Dash period must be positive and finite.");
        const commands: GFXPathCommand[] = [];
        let work = 0;
        const emit = (command: GFXPathCommand) => {
            if (commands.length >= 10000)
                throw new RangeError("Dashed path command limit exceeded.");
            commands.push(command);
        };
        for (const contour of flattenGFXPathCommands(this.commands)) {
            let index = 0, offset = ((phase % period) + period) % period;
            while (offset >= pattern[index]!) {
                offset -= pattern[index]!;
                index = (index + 1) % pattern.length;
            }
            let remaining = pattern[index]! - offset;
            const runs: GFXPoint[][] = [];
            let active: GFXPoint[] | null = null;
            for (let segment = 1; segment < contour.points.length; segment++) {
                const a = contour.points[segment - 1]!, b = contour.points[segment]!, length = Math.hypot(b.x - a.x, b.y - a.y);
                if (!Number.isFinite(length))
                    throw new RangeError("Path length overflow.");
                let cursor = 0;
                while (cursor < length) {
                    if (++work > 10000)
                        throw new RangeError("Dashed path work limit exceeded.");
                    if (remaining === 0) {
                        index = (index + 1) % pattern.length;
                        remaining = pattern[index]!;
                        if (index % 2)
                            active = null;
                        continue;
                    }
                    const next = Math.min(length, cursor + remaining);
                    if (next === cursor)
                        throw new RangeError("Dash precision limit exceeded.");
                    const point = (distance: number) => ({ x: a.x + (b.x - a.x) * distance / length, y: a.y + (b.y - a.y) * distance / length });
                    if (index % 2 === 0) {
                        if (!active) {
                            active = [point(cursor)];
                            runs.push(active);
                        }
                        active.push(point(next));
                    }
                    remaining = Math.max(0, remaining - (next - cursor));
                    // Subtraction can leave a residue below the cursor's ulp;
                    // it would never advance the cursor, so it ends the dash.
                    if (remaining > 0 && next < length && next + remaining === next)
                        remaining = 0;
                    cursor = next;
                }
            }
            if (contour.closed && runs.length > 1) {
                const first = runs[0]!, last = runs[runs.length - 1]!, start = contour.points[0]!;
                if (samePoint(first[0]!, start) && samePoint(last[last.length - 1]!, start)) {
                    runs[0] = [...last, ...first.slice(1)];
                    runs.pop();
                }
            }
            for (const run of runs) {
                emit({ kind: "move", point: run[0]! });
                for (const point of run.slice(1))
                    emit({ kind: "line", point });
                if (contour.closed && samePoint(run[0]!, run[run.length - 1]!))
                    emit({ kind: "close" });
            }
        }
        return new GFXPath(commands);
    }
    /** A nonzero-fill outline; overlapping positive-winding pieces form the stroke union. */
    stroked(options: GFXStrokeOptions): GFXPath {
        if (!options || typeof options !== "object" || Object.getPrototypeOf(options) !== Object.prototype || Object.getOwnPropertySymbols(options).length)
            throw new TypeError("Stroke options must be a plain data record.");
        const descriptors = Object.getOwnPropertyDescriptors(options);
        if (Object.keys(descriptors).some(key => !["width", "cap", "join", "miterLimit"].includes(key) || !("value" in descriptors[key]!)))
            throw new TypeError("Stroke options contain unsupported or accessor fields.");
        const width = descriptors.width?.value, cap = descriptors.cap?.value ?? "butt", join = descriptors.join?.value ?? "miter", limit = descriptors.miterLimit?.value ?? 10;
        if (typeof width !== "number" || !Number.isFinite(width) || width < 0 || !Number.isFinite(limit) || limit < 1 || !["butt", "square", "round"].includes(cap) || !["miter", "bevel", "round"].includes(join))
            throw new RangeError("Invalid stroke geometry.");
        if (width === 0)
            return new GFXPath();
        const half = width / 2, commands: GFXPathCommand[] = [];
        if (!half)
            throw new RangeError("Stroke width exceeds numerical precision.");
        const add = (piece: readonly GFXPathCommand[]) => {
            if (commands.length + piece.length > 10000)
                throw new RangeError("Stroke outline command limit exceeded.");
            commands.push(...piece);
        };
        const polygon = (points: GFXPoint[]) => {
            const area = points.reduce((n, p, i) => {
                const q = points[(i + 1) % points.length]!;
                return n + p.x * q.y - q.x * p.y;
            }, 0);
            if (area < 0)
                points.reverse();
            add([{ kind: "move", point: points[0]! }, ...points.slice(1).map(point => ({ kind: "line" as const, point })), { kind: "close" }]);
        };
        const disk = (p: GFXPoint) => add(GFXPath.ellipse({ x: p.x - half, y: p.y - half, width, height: width }).commands);
        for (const contour of flattenGFXPathCommands(this.commands)) {
            const points = contour.points.filter((p, i, a) => i === 0 || !samePoint(p, a[i - 1]!));
            if (contour.closed && points.length > 1 && samePoint(points[0]!, points[points.length - 1]!))
                points.pop();
            if (points.length === 1) {
                if (cap === "round")
                    disk(points[0]!);
                else if (cap === "square")
                    add(GFXPath.rect({ x: points[0]!.x - half, y: points[0]!.y - half, width, height: width }).commands);
                continue;
            }
            if (points.length < 2)
                continue;
            const count = contour.closed ? points.length : points.length - 1;
            const directions = Array.from({ length: count }, (_, i) => {
                const a = points[i]!, b = points[(i + 1) % points.length]!, length = Math.hypot(b.x - a.x, b.y - a.y);
                if (!Number.isFinite(length) || !length)
                    throw new RangeError("Stroke segment is not finite.");
                return { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
            });
            for (let i = 0; i < count; i++) {
                const d = directions[i]!, a = points[i]!, b = points[(i + 1) % points.length]!, start = !contour.closed && i === 0 && cap === "square" ? half : 0, end = !contour.closed && i === count - 1 && cap === "square" ? half : 0;
                polygon([{ x: a.x - d.x * start - d.y * half, y: a.y - d.y * start + d.x * half }, { x: a.x - d.x * start + d.y * half, y: a.y - d.y * start - d.x * half }, { x: b.x + d.x * end + d.y * half, y: b.y + d.y * end - d.x * half }, { x: b.x + d.x * end - d.y * half, y: b.y + d.y * end + d.x * half }]);
            }
            if (!contour.closed && cap === "round") {
                disk(points[0]!);
                disk(points[points.length - 1]!);
            }
            for (let i = contour.closed ? 0 : 1; i < (contour.closed ? points.length : points.length - 1); i++) {
                const previous = directions[(i - 1 + count) % count]!, next = directions[i % count]!, p = points[i]!, cross = previous.x * next.y - previous.y * next.x;
                if (join === "round") {
                    disk(p);
                    continue;
                }
                if (Math.abs(cross) < 1e-12)
                    continue;
                const side = cross > 0 ? -1 : 1;
                const a = { x: p.x - side * previous.y * half, y: p.y + side * previous.x * half }, b = { x: p.x - side * next.y * half, y: p.y + side * next.x * half };
                const distance = ((b.x - a.x) * next.y - (b.y - a.y) * next.x) / cross;
                const miter = { x: a.x + previous.x * distance, y: a.y + previous.y * distance };
                if (join === "miter" && Math.hypot(miter.x - p.x, miter.y - p.y) / half <= limit)
                    polygon([p, a, miter, b]);
                else
                    polygon([p, a, b]);
            }
        }
        return new GFXPath(commands);
    }
    toSVGPathData() {
        return this.commands.map((command) => {
            if (command.kind === "close")
                return "Z";
            if (command.kind === "move" || command.kind === "line")
                return `${command.kind === "move" ? "M" : "L"} ${number(command.point.x)} ${number(command.point.y)}`;
            if (command.kind === "quad")
                return `Q ${number(command.control.x)} ${number(command.control.y)} ${number(command.point.x)} ${number(command.point.y)}`;
            return `C ${number(command.control1.x)} ${number(command.control1.y)} ${number(command.control2.x)} ${number(command.control2.y)} ${number(command.point.x)} ${number(command.point.y)}`;
        }).join(" ");
    }
}
function normaliseCommand(command: GFXPathCommand): GFXPathCommand {
    if (!command || typeof command !== "object" || (Object.getPrototypeOf(command) !== Object.prototype && Object.getPrototypeOf(command) !== null) || Object.getOwnPropertySymbols(command).length)
        throw new TypeError("Path command must be a plain record.");
    const descriptors = Object.getOwnPropertyDescriptors(command);
    if (!descriptors.kind || !Object.prototype.hasOwnProperty.call(descriptors.kind, "value"))
        throw new TypeError("Path command kind must be data.");
    const kind = descriptors.kind.value;
    const exact = (keys: readonly string[]) => {
        const actual = Object.keys(descriptors);
        if (actual.length !== keys.length || actual.some((key) => !keys.includes(key)))
            throw new TypeError("Path command has unsupported fields.");
    };
    const value = (key: string) => {
        const descriptor = descriptors[key];
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value"))
            throw new TypeError("Path command fields must be data.");
        return descriptor.value;
    };
    if (kind === "close") {
        exact(["kind"]);
        return Object.freeze({ kind: "close" });
    }
    if (kind === "move" || kind === "line") {
        exact(["kind", "point"]);
        return Object.freeze({ kind, point: normalisePoint(value("point")) });
    }
    if (kind === "quad") {
        exact(["kind", "control", "point"]);
        return Object.freeze({ kind, control: normalisePoint(value("control")), point: normalisePoint(value("point")) });
    }
    if (kind === "curve") {
        exact(["kind", "control1", "control2", "point"]);
        return Object.freeze({ kind, control1: normalisePoint(value("control1")), control2: normalisePoint(value("control2")), point: normalisePoint(value("point")) });
    }
    throw new TypeError("Path command kind is unsupported.");
}
/** Mutable construction owns a private immutable snapshot; previously copied paths never change. */
export class GFXMutablePath {
    #path: GFXPath;
    constructor(path: GFXPath = new GFXPath()) {
        if (!(path instanceof GFXPath))
            throw new TypeError("Path builder requires a GFXPath.");
        this.#path = path;
    }
    move(point: GFXPoint): this {
        this.#path = this.#path.move(point);
        return this;
    }
    line(point: GFXPoint): this {
        this.#path = this.#path.line(point);
        return this;
    }
    quad(control: GFXPoint, point: GFXPoint): this {
        this.#path = this.#path.quad(control, point);
        return this;
    }
    curve(control1: GFXPoint, control2: GFXPoint, point: GFXPoint): this {
        this.#path = this.#path.curve(control1, control2, point);
        return this;
    }
    arc(centre: GFXPoint, radius: number, startAngle: number, endAngle: number, clockwise = false): this {
        this.#path = this.#path.arc(centre, radius, startAngle, endAngle, clockwise);
        return this;
    }
    close(): this {
        this.#path = this.#path.close();
        return this;
    }
    append(path: GFXPath): this {
        this.#path = this.#path.append(path);
        return this;
    }
    copy(): GFXPath {
        return this.#path;
    }
    clear(): void {
        this.#path = new GFXPath();
    }
}
export interface GFXStrokeOptions {
    readonly width: number;
    readonly cap?: "butt" | "round" | "square";
    readonly join?: "miter" | "round" | "bevel";
    readonly miterLimit?: number;
}
