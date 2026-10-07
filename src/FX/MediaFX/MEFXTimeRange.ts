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

function finiteValue(time: MEFXTime, name: string) {
    if (!(time instanceof MEFXTime) || time.value.kind !== "finite")
        throw new TypeError(`${name} must be a finite MEFXTime.`);
    return time.value;
}

function assertSameEpoch(left: MEFXTime, right: MEFXTime): void {
    const a = finiteValue(left, "Range start");
    const b = finiteValue(right, "Range start");
    if (a.epoch !== b.epoch)
        throw new RangeError("Media time ranges require matching epochs.");
}

export class MEFXTimeRange {
    readonly start: MEFXTime;
    readonly duration: MEFXTime;
    readonly end: MEFXTime;

    constructor(start: MEFXTime, duration: MEFXTime) {
        finiteValue(start, "Range start");
        const d = finiteValue(duration, "Range duration");
        if (d.epoch !== 0n)
            throw new RangeError("Media range duration epoch must be zero.");
        if (d.value < 0n)
            throw new RangeError("Media range duration must be nonnegative.");
        this.start = start;
        this.duration = duration;
        this.end = start.addDuration(duration);
        Object.freeze(this);
    }

    get empty(): boolean {
        const d = finiteValue(this.duration, "Range duration");
        return d.value === 0n;
    }

    contains(position: MEFXTime): boolean {
        if (this.empty)
            return false;
        const lower = this.start.compare(position);
        const upper = position.compare(this.end);
        return lower !== "unordered" && upper !== "unordered" && lower <= 0 && upper < 0;
    }

    intersection(other: MEFXTimeRange): MEFXTimeRange {
        if (!(other instanceof MEFXTimeRange))
            throw new TypeError("Range intersection requires MEFXTimeRange.");
        assertSameEpoch(this.start, other.start);
        const start = this.start.compare(other.start) === -1 ? other.start : this.start;
        const end = this.end.compare(other.end) === 1 ? other.end : this.end;
        const order = start.compare(end);
        if (order === "unordered")
            throw new RangeError("Media time ranges require matching epochs.");
        return order >= 0
            ? new MEFXTimeRange(start, MEFXTime.finite(0n, 1))
            : new MEFXTimeRange(start, end.subtract(start));
    }

    union(other: MEFXTimeRange): MEFXTimeRange | null {
        if (!(other instanceof MEFXTimeRange))
            throw new TypeError("Range union requires MEFXTimeRange.");
        assertSameEpoch(this.start, other.start);
        if (this.end.compare(other.start) === -1 || other.end.compare(this.start) === -1)
            return null;
        return this.boundingUnion(other);
    }

    boundingUnion(other: MEFXTimeRange): MEFXTimeRange {
        if (!(other instanceof MEFXTimeRange))
            throw new TypeError("Bounding union requires MEFXTimeRange.");
        assertSameEpoch(this.start, other.start);
        const start = this.start.compare(other.start) === 1 ? other.start : this.start;
        const end = this.end.compare(other.end) === -1 ? other.end : this.end;
        return new MEFXTimeRange(start, end.subtract(start));
    }
}
