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

export interface MEFXSampleTimingInfoInit {
    readonly presentationTime: MEFXTime;
    readonly decodeTime?: MEFXTime | null;
    readonly duration?: MEFXTime | null;
}

function finiteTime(value: unknown, name: string): MEFXTime {
    if (!(value instanceof MEFXTime) || value.value.kind !== "finite")
        throw new TypeError(name + " must be a finite MEFXTime.");
    return value;
}

function optionalFiniteTime(value: unknown, name: string): MEFXTime | null {
    if (value === undefined || value === null)
        return null;
    return finiteTime(value, name);
}

export class MEFXSampleTimingInfo {
    readonly presentationTime: MEFXTime;
    readonly decodeTime: MEFXTime | null;
    readonly duration: MEFXTime | null;

    constructor(init: MEFXSampleTimingInfoInit) {
        if (!init || typeof init !== "object")
            throw new TypeError("Sample timing requires initialization data.");
        this.presentationTime = finiteTime(init.presentationTime, "Sample presentation time");
        this.decodeTime = optionalFiniteTime(init.decodeTime, "Sample decode time");
        this.duration = optionalFiniteTime(init.duration, "Sample duration");

        if (this.decodeTime && this.decodeTime.value.kind === "finite"
            && this.presentationTime.value.kind === "finite"
            && this.decodeTime.value.epoch !== this.presentationTime.value.epoch)
            throw new RangeError("Sample decode and presentation times must use the same epoch.");
        if (this.duration?.value.kind === "finite") {
            if (this.duration.value.epoch !== 0n)
                throw new RangeError("Sample duration epoch must be zero.");
            if (this.duration.value.value < 0n)
                throw new RangeError("Sample duration cannot be negative.");
        }
        Object.freeze(this);
    }

    advancedBySamples(sampleOffset: number): MEFXSampleTimingInfo {
        if (!Number.isSafeInteger(sampleOffset) || sampleOffset < 0)
            throw new RangeError("Sample timing offset must be a nonnegative safe integer.");
        if (sampleOffset === 0)
            return this;
        if (!this.duration || this.duration.value.kind !== "finite")
            throw new RangeError("Sample duration is required to derive repeated timing.");
        const delta = MEFXTime.finite(
            this.duration.value.value * BigInt(sampleOffset),
            this.duration.value.timescale,
            0n,
            this.duration.value.rounded,
        );
        return new MEFXSampleTimingInfo({
            presentationTime: this.presentationTime.addDuration(delta),
            decodeTime: this.decodeTime ? this.decodeTime.addDuration(delta) : null,
            duration: this.duration,
        });
    }
}
