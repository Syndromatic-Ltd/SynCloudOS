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

import { MEFXTime } from "./MEFXTime";
import { MEFXTimeRange } from "./MEFXTimeRange";

const maximumTimescale = 2_147_483_647n;

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

function finite(time: MEFXTime, name: string) {
    if (time.value.kind !== "finite")
        throw new RangeError(`${name} must be finite.`);
    return time.value;
}

function scaledDuration(delta: MEFXTime, source: MEFXTime, target: MEFXTime): MEFXTime {
    const d = finite(delta, "Mapping delta");
    const s = finite(source, "Source duration");
    const t = finite(target, "Target duration");
    if (s.value === 0n)
        throw new RangeError("Cannot map through a zero source duration.");
    if (t.value === 0n)
        return MEFXTime.finite(0n, 1, 0n, d.rounded || s.rounded || t.rounded);
    let numerator = d.value * t.value * BigInt(s.timescale);
    let denominator = BigInt(d.timescale) * BigInt(t.timescale) * s.value;
    if (denominator < 0n) {
        numerator = -numerator;
        denominator = -denominator;
    }
    const divisor = gcd(numerator, denominator);
    numerator /= divisor;
    denominator /= divisor;
    if (denominator > maximumTimescale)
        throw new RangeError("Exact MediaFX mapping exceeds the portable timescale limit.");
    return MEFXTime.finite(numerator, Number(denominator), 0n, d.rounded || s.rounded || t.rounded);
}

export class MEFXTimeMapping {
    constructor(
        readonly source: MEFXTimeRange,
        readonly target: MEFXTimeRange,
    ) {
        if (!(source instanceof MEFXTimeRange) || !(target instanceof MEFXTimeRange))
            throw new TypeError("Media time mapping requires source and target ranges.");
        Object.freeze(this);
    }

    map(position: MEFXTime): MEFXTime {
        const sourceStart = finite(this.source.start, "Source start");
        const input = finite(position, "Mapped position");
        if (sourceStart.epoch !== input.epoch)
            throw new RangeError("Mapped position epoch must match the source range.");
        const offset = position.subtract(this.source.start);
        return this.target.start.addDuration(scaledDuration(offset, this.source.duration, this.target.duration));
    }

    inverted(): MEFXTimeMapping {
        const targetDuration = finite(this.target.duration, "Target duration");
        if (targetDuration.value === 0n)
            throw new RangeError("Cannot invert a mapping with zero target duration.");
        return new MEFXTimeMapping(this.target, this.source);
    }
}
