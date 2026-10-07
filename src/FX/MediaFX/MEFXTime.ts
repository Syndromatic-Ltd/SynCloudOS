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

import type { MEFXSpecialTimeKind, MEFXTimeJSON } from "./MEFXTimeJSON";

export type MEFXRounding = "toward-zero" | "floor" | "ceil" | "nearest-even";
export type MEFXComparison = -1 | 0 | 1 | "unordered";
export type MEFXTimeValue =
    | Readonly<{
        kind: "finite";
        value: bigint;
        timescale: number;
        epoch: bigint;
        rounded: boolean;
    }>
    | Readonly<{ kind: MEFXSpecialTimeKind }>;

const maximumTimescale = 2_147_483_647;
const maximumIntegerDigits = 256;

function assertBigInt(value: unknown, name: string): asserts value is bigint {
    if (typeof value !== "bigint")
        throw new TypeError(`${name} must be a bigint.`);
    if ((value < 0n ? -value : value).toString().length > maximumIntegerDigits)
        throw new RangeError(`${name} exceeds the 256 digit arithmetic limit.`);
}

function timescale(value: unknown): number {
    if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > maximumTimescale)
        throw new RangeError(`Media time timescale must be an integer from 1 to ${maximumTimescale}.`);
    return value as number;
}

function gcd(left: bigint, right: bigint): bigint {
    let a = left < 0n ? -left : left;
    let b = right < 0n ? -right : right;
    while (b !== 0n) {
        const next = a % b;
        a = b;
        b = next;
    }
    return a || 1n;
}

function reduceFraction(value: bigint, scale: bigint): readonly [bigint, bigint] {
    if (scale <= 0n)
        throw new RangeError("Media time denominator must be positive.");
    if (value === 0n)
        return [0n, 1n];
    const divisor = gcd(value, scale);
    return [value / divisor, scale / divisor];
}

function exactCombine(
    leftValue: bigint,
    leftScale: number,
    rightValue: bigint,
    rightScale: number,
): readonly [bigint, number] {
    const a = BigInt(leftScale);
    const b = BigInt(rightScale);
    const common = (a / gcd(a, b)) * b;
    const numerator = leftValue * (common / a) + rightValue * (common / b);
    const [reducedValue, reducedScale] = reduceFraction(numerator, common);
    if (reducedScale > BigInt(maximumTimescale))
        throw new RangeError("Exact MediaFX arithmetic exceeds the portable timescale limit.");
    assertBigInt(reducedValue, "Media time result");
    return [reducedValue, Number(reducedScale)];
}

function roundedDivision(numerator: bigint, denominator: bigint, mode: MEFXRounding): Readonly<{ value: bigint; rounded: boolean }> {
    if (denominator <= 0n)
        throw new RangeError("Media time rounding denominator must be positive.");
    const quotient = numerator / denominator;
    const remainder = numerator % denominator;
    if (remainder === 0n)
        return Object.freeze({ value: quotient, rounded: false });
    const sign = numerator < 0n ? -1n : 1n;
    if (mode === "toward-zero")
        return Object.freeze({ value: quotient, rounded: true });
    if (mode === "floor")
        return Object.freeze({ value: numerator < 0n ? quotient - 1n : quotient, rounded: true });
    if (mode === "ceil")
        return Object.freeze({ value: numerator > 0n ? quotient + 1n : quotient, rounded: true });
    if (mode !== "nearest-even")
        throw new TypeError("Unsupported MediaFX rounding mode.");
    const doubled = (remainder < 0n ? -remainder : remainder) * 2n;
    if (doubled < denominator)
        return Object.freeze({ value: quotient, rounded: true });
    if (doubled > denominator)
        return Object.freeze({ value: quotient + sign, rounded: true });
    return Object.freeze({ value: quotient % 2n === 0n ? quotient : quotient + sign, rounded: true });
}

function dataRecord(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) || Object.getOwnPropertySymbols(value).length)
        throw new TypeError(`${name} must be plain data.`);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.keys(descriptors).length !== keys.length || keys.some((key) => !descriptors[key] || !("value" in descriptors[key]!)))
        throw new TypeError(`${name} has an invalid data shape.`);
    return Object.fromEntries(keys.map((key) => [key, descriptors[key]!.value]));
}

function decimalBigInt(value: unknown, name: string): bigint {
    if (typeof value !== "string" || !/^-?(?:0|[1-9]\d*)$/u.test(value) || value.replace(/^-/, "").length > maximumIntegerDigits)
        throw new TypeError(`${name} must be a bounded decimal integer string.`);
    return BigInt(value);
}

function specialRank(kind: "positive-infinity" | "negative-infinity"): number {
    return kind === "positive-infinity" ? 1 : -1;
}

export class MEFXTime {
    static readonly invalid = new MEFXTime(Object.freeze({ kind: "invalid" }));
    static readonly indefinite = new MEFXTime(Object.freeze({ kind: "indefinite" }));
    static readonly positiveInfinity = new MEFXTime(Object.freeze({ kind: "positive-infinity" }));
    static readonly negativeInfinity = new MEFXTime(Object.freeze({ kind: "negative-infinity" }));

    private constructor(readonly value: MEFXTimeValue) {
        Object.freeze(this);
    }

    static finite(value: bigint, timescaleValue: number, epoch: bigint = 0n, rounded = false): MEFXTime {
        assertBigInt(value, "Media time value");
        assertBigInt(epoch, "Media time epoch");
        if (typeof rounded !== "boolean")
            throw new TypeError("Media time rounded flag must be boolean.");
        return new MEFXTime(Object.freeze({
            kind: "finite" as const,
            value,
            timescale: timescale(timescaleValue),
            epoch,
            rounded,
        }));
    }

    static fromJSON(value: unknown): MEFXTime {
        if (!value || typeof value !== "object")
            throw new TypeError("Media time JSON must be an object.");
        const kindDescriptor = Object.getOwnPropertyDescriptor(value, "kind");
        if (!kindDescriptor || !("value" in kindDescriptor) || typeof kindDescriptor.value !== "string")
            throw new TypeError("Media time JSON kind must be data.");
        if (kindDescriptor.value === "finite") {
            const record = dataRecord(value, ["kind", "value", "timescale", "epoch", "rounded"], "Finite Media time JSON");
            if (record.kind !== "finite" || typeof record.rounded !== "boolean")
                throw new TypeError("Finite Media time JSON is invalid.");
            return MEFXTime.finite(
                decimalBigInt(record.value, "Media time value"),
                timescale(record.timescale),
                decimalBigInt(record.epoch, "Media time epoch"),
                record.rounded,
            );
        }
        if (!["invalid", "indefinite", "positive-infinity", "negative-infinity"].includes(kindDescriptor.value))
            throw new TypeError("Unknown Media time JSON kind.");
        dataRecord(value, ["kind"], "Special Media time JSON");
        return MEFXTime.#special(kindDescriptor.value as MEFXSpecialTimeKind);
    }

    static fromSeconds(seconds: number, preferredScale: number, rounding: MEFXRounding): MEFXTime {
        const scale = timescale(preferredScale);
        if (!Number.isFinite(seconds))
            throw new RangeError("Media time seconds must be finite.");
        const scaled = seconds * scale;
        if (!Number.isSafeInteger(Math.trunc(scaled)))
            throw new RangeError("Media time seconds exceed the exact host conversion range.");
        let result: number;
        if (rounding === "toward-zero") result = Math.trunc(scaled);
        else if (rounding === "floor") result = Math.floor(scaled);
        else if (rounding === "ceil") result = Math.ceil(scaled);
        else if (rounding === "nearest-even") {
            const floor = Math.floor(scaled);
            const fraction = scaled - floor;
            result = fraction < 0.5 ? floor : fraction > 0.5 ? floor + 1 : floor % 2 === 0 ? floor : floor + 1;
        }
        else throw new TypeError("Unsupported MediaFX rounding mode.");
        return MEFXTime.finite(BigInt(result), scale, 0n, scaled !== result);
    }

    compare(other: MEFXTime): MEFXComparison {
        if (!(other instanceof MEFXTime))
            throw new TypeError("Media time comparison requires MEFXTime.");
        const left = this.value;
        const right = other.value;
        if (left.kind === "invalid" || right.kind === "invalid" || left.kind === "indefinite" || right.kind === "indefinite")
            return "unordered";
        if (left.kind === "finite" && right.kind === "finite") {
            if (left.epoch !== right.epoch)
                return "unordered";
            const l = left.value * BigInt(right.timescale);
            const r = right.value * BigInt(left.timescale);
            return l < r ? -1 : l > r ? 1 : 0;
        }
        if (left.kind === "finite")
            return right.kind === "positive-infinity" ? -1 : 1;
        if (right.kind === "finite")
            return left.kind === "positive-infinity" ? 1 : -1;
        const l = specialRank(left.kind);
        const r = specialRank(right.kind);
        return l < r ? -1 : l > r ? 1 : 0;
    }

    convertScale(nextTimescale: number, rounding: MEFXRounding): MEFXTime {
        const scale = timescale(nextTimescale);
        if (this.value.kind !== "finite")
            return this;
        const converted = roundedDivision(this.value.value * BigInt(scale), BigInt(this.value.timescale), rounding);
        return MEFXTime.finite(converted.value, scale, this.value.epoch, this.value.rounded || converted.rounded);
    }

    addDuration(duration: MEFXTime): MEFXTime {
        if (!(duration instanceof MEFXTime))
            throw new TypeError("Media duration must be MEFXTime.");
        if (duration.value.kind === "finite" && duration.value.epoch !== 0n)
            throw new RangeError("Media duration epoch must be zero.");
        if (this.value.kind === "invalid" || duration.value.kind === "invalid")
            return MEFXTime.invalid;
        if (this.value.kind === "indefinite" || duration.value.kind === "indefinite")
            return MEFXTime.indefinite;
        if (this.value.kind !== "finite" || duration.value.kind !== "finite") {
            if (this.value.kind === "finite") return duration;
            if (duration.value.kind === "finite") return this;
            return this.value.kind === duration.value.kind ? this : MEFXTime.invalid;
        }
        const [value, scale] = exactCombine(this.value.value, this.value.timescale, duration.value.value, duration.value.timescale);
        return MEFXTime.finite(value, scale, this.value.epoch, this.value.rounded || duration.value.rounded);
    }

    subtract(other: MEFXTime): MEFXTime {
        if (!(other instanceof MEFXTime))
            throw new TypeError("Media subtraction requires MEFXTime.");
        if (this.value.kind === "invalid" || other.value.kind === "invalid")
            return MEFXTime.invalid;
        if (this.value.kind === "indefinite" || other.value.kind === "indefinite")
            return MEFXTime.indefinite;
        if (this.value.kind === "finite" && other.value.kind === "finite") {
            if (this.value.epoch !== other.value.epoch)
                throw new RangeError("Media time subtraction requires matching epochs.");
            const [value, scale] = exactCombine(this.value.value, this.value.timescale, -other.value.value, other.value.timescale);
            return MEFXTime.finite(value, scale, 0n, this.value.rounded || other.value.rounded);
        }
        if (this.value.kind === "finite")
            return other.value.kind === "positive-infinity" ? MEFXTime.negativeInfinity : MEFXTime.positiveInfinity;
        if (other.value.kind === "finite")
            return this;
        if (this.value.kind === other.value.kind)
            return MEFXTime.invalid;
        return this.value.kind === "positive-infinity" ? MEFXTime.positiveInfinity : MEFXTime.negativeInfinity;
    }

    toSeconds(): number {
        if (this.value.kind !== "finite")
            throw new RangeError("Finite Media time required for seconds conversion.");
        const result = Number(this.value.value) / this.value.timescale;
        if (!Number.isFinite(result))
            throw new RangeError("Media time seconds exceed the host number range.");
        return result;
    }

    toMicroseconds(rounding: MEFXRounding): bigint {
        const converted = this.convertScale(1_000_000, rounding);
        if (converted.value.kind !== "finite")
            throw new RangeError("Finite Media time required for microsecond conversion.");
        return converted.value.value;
    }

    toJSON(): MEFXTimeJSON {
        if (this.value.kind !== "finite")
            return Object.freeze({ kind: this.value.kind });
        return Object.freeze({
            kind: "finite",
            value: this.value.value.toString(),
            timescale: this.value.timescale,
            epoch: this.value.epoch.toString(),
            rounded: this.value.rounded,
        });
    }

    static #special(kind: MEFXSpecialTimeKind): MEFXTime {
        if (kind === "invalid") return MEFXTime.invalid;
        if (kind === "indefinite") return MEFXTime.indefinite;
        if (kind === "positive-infinity") return MEFXTime.positiveInfinity;
        return MEFXTime.negativeInfinity;
    }
}
