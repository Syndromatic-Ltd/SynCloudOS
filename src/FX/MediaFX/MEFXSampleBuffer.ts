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

import { MEFXBlockBuffer } from "./MEFXBlockBuffer";
import { MEFXFormatDescription, snapshotMEFXMetadata, type MEFXMetadata } from "./MEFXFormatDescription";
import { MEFXSampleTimingInfo } from "./MEFXSampleTimingInfo";

export type MEFXSampleBufferState = "pending" | "ready" | "failed" | "invalidated";
export type MEFXDropHint = "none" | "droppable" | "discard";

export interface MEFXSampleDiscontinuity {
    readonly reason: string;
    readonly generation?: number;
}

export interface MEFXSampleAttachmentsInit {
    readonly sync?: boolean;
    readonly keyframe?: boolean;
    readonly discontinuity?: MEFXSampleDiscontinuity | null;
    readonly dropHint?: MEFXDropHint;
    readonly extensions?: Readonly<Record<string, unknown>>;
}

export interface MEFXSampleAttachments {
    readonly sync?: boolean;
    readonly keyframe?: boolean;
    readonly discontinuity?: Readonly<MEFXSampleDiscontinuity>;
    readonly dropHint?: MEFXDropHint;
    readonly extensions: MEFXMetadata;
}

export interface MEFXSampleBufferInit {
    readonly payload: MEFXBlockBuffer;
    readonly format: MEFXFormatDescription;
    readonly sampleCount: number;
    readonly sampleSizes: readonly number[];
    readonly timings: readonly MEFXSampleTimingInfo[];
    readonly attachments?: MEFXSampleAttachmentsInit;
    readonly readiness?: PromiseLike<void>;
}

function ownDataArray<T>(value: readonly T[], name: string): readonly T[] {
    if (!Array.isArray(value))
        throw new TypeError(name + " must be an array.");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const result: T[] = [];
    for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !("value" in descriptor))
            throw new TypeError(name + " must be a dense data array.");
        result.push(descriptor.value as T);
    }
    return Object.freeze(result);
}

function snapshotDiscontinuity(value: MEFXSampleDiscontinuity | null | undefined): Readonly<MEFXSampleDiscontinuity> | undefined {
    if (value === undefined || value === null)
        return undefined;
    if (!value || typeof value !== "object" || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null))
        throw new TypeError("Sample discontinuity must be plain data.");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.getOwnPropertySymbols(value).length
        || !descriptors.reason
        || !("value" in descriptors.reason)
        || (descriptors.generation && !("value" in descriptors.generation))
        || Object.keys(descriptors).some(key => !["reason", "generation"].includes(key)))
        throw new TypeError("Sample discontinuity has an invalid data shape.");
    const reason = descriptors.reason.value;
    if (typeof reason !== "string" || reason.length === 0 || reason.length > 256)
        throw new TypeError("Sample discontinuity reason must be a bounded nonempty string.");
    const generation = descriptors.generation?.value;
    if (generation !== undefined && (!Number.isSafeInteger(generation) || generation < 0))
        throw new RangeError("Sample discontinuity generation must be a nonnegative safe integer.");
    return Object.freeze(generation === undefined ? { reason } : { reason, generation });
}

function snapshotAttachments(value: MEFXSampleAttachmentsInit | undefined): MEFXSampleAttachments {
    if (value === undefined)
        return Object.freeze({ extensions: Object.freeze({}) });
    if (!value || typeof value !== "object" || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null))
        throw new TypeError("Sample attachments must be plain data.");
    if (Object.getOwnPropertySymbols(value).length)
        throw new TypeError("Sample attachments cannot contain symbol properties.");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const allowed = ["sync", "keyframe", "discontinuity", "dropHint", "extensions"];
    if (Object.keys(descriptors).some(key => !allowed.includes(key))
        || Object.values(descriptors).some(descriptor => !("value" in descriptor)))
        throw new TypeError("Sample attachments have an invalid data shape.");

    const sync = descriptors.sync?.value;
    const keyframe = descriptors.keyframe?.value;
    const dropHint = descriptors.dropHint?.value;
    if (sync !== undefined && typeof sync !== "boolean")
        throw new TypeError("Sample sync attachment must be boolean.");
    if (keyframe !== undefined && typeof keyframe !== "boolean")
        throw new TypeError("Sample keyframe attachment must be boolean.");
    if (dropHint !== undefined && !["none", "droppable", "discard"].includes(dropHint))
        throw new TypeError("Sample drop hint is invalid.");

    const discontinuity = snapshotDiscontinuity(descriptors.discontinuity?.value);
    const extensionsValue = descriptors.extensions?.value;
    const extensions = extensionsValue === undefined
        ? Object.freeze({})
        : snapshotMEFXMetadata(extensionsValue as Readonly<Record<string, unknown>>, "Sample attachment metadata");
    return Object.freeze({
        ...(sync === undefined ? {} : { sync }),
        ...(keyframe === undefined ? {} : { keyframe }),
        ...(discontinuity === undefined ? {} : { discontinuity }),
        ...(dropHint === undefined ? {} : { dropHint: dropHint as MEFXDropHint }),
        extensions,
    });
}

function checkedSampleIndex(index: number, sampleCount: number): number {
    if (!Number.isSafeInteger(index) || index < 0 || index >= sampleCount)
        throw new RangeError("Sample index is outside the sample buffer.");
    return index;
}

export class MEFXSampleBuffer {
    readonly format: MEFXFormatDescription;
    readonly sampleCount: number;
    readonly attachments: MEFXSampleAttachments;
    readonly ready: Promise<void>;
    readonly #sizes: readonly number[];
    readonly #timings: readonly MEFXSampleTimingInfo[];
    #payload: MEFXBlockBuffer | null;
    #state: MEFXSampleBufferState;
    #settled = false;
    #resolveReady: (() => void) | null = null;
    #rejectReady: ((reason?: unknown) => void) | null = null;

    constructor(init: MEFXSampleBufferInit) {
        if (!init || typeof init !== "object")
            throw new TypeError("Sample buffer requires initialization data.");
        if (!(init.payload instanceof MEFXBlockBuffer) || init.payload.closed)
            throw new TypeError("Sample buffer payload must be a live MEFXBlockBuffer.");
        if (!(init.format instanceof MEFXFormatDescription))
            throw new TypeError("Sample buffer format must be MEFXFormatDescription.");
        if (!Number.isSafeInteger(init.sampleCount) || init.sampleCount < 1)
            throw new RangeError("Sample count must be a positive safe integer.");

        const sizes = ownDataArray(init.sampleSizes, "Sample sizes");
        const timings = ownDataArray(init.timings, "Sample timings");
        if (sizes.length !== 1 && sizes.length !== init.sampleCount)
            throw new RangeError("Sample size cardinality must be one repeated value or exactly sampleCount values.");
        if (timings.length !== 1 && timings.length !== init.sampleCount)
            throw new RangeError("Sample timing cardinality must be one repeated entry or exactly sampleCount entries.");
        if (timings.some(timing => !(timing instanceof MEFXSampleTimingInfo)))
            throw new TypeError("Sample timings must contain MEFXSampleTimingInfo values.");
        if (timings.length === 1 && init.sampleCount > 1 && timings[0]!.duration === null)
            throw new RangeError("Sample duration is required to derive repeated timing.");

        for (const size of sizes) {
            if (!Number.isSafeInteger(size) || size < 0)
                throw new RangeError("Sample sizes must be nonnegative safe integers.");
        }
        const totalBytes = sizes.length === 1
            ? BigInt(sizes[0]!) * BigInt(init.sampleCount)
            : sizes.reduce((total, size) => total + BigInt(size), 0n);
        if (totalBytes > BigInt(Number.MAX_SAFE_INTEGER))
            throw new RangeError("Sample byte ranges overflow the portable integer range.");
        if (totalBytes > BigInt(init.payload.byteLength))
            throw new RangeError("Sample byte ranges exceed payload bounds.");

        this.format = init.format;
        this.sampleCount = init.sampleCount;
        this.#sizes = sizes;
        this.#timings = timings;
        this.attachments = snapshotAttachments(init.attachments);
        this.#payload = init.payload.slice();

        if (init.readiness === undefined) {
            this.#state = "ready";
            this.#settled = true;
            this.ready = Promise.resolve();
        }
        else {
            if (!init.readiness || typeof init.readiness.then !== "function") {
                this.#payload.close();
                this.#payload = null;
                throw new TypeError("Sample readiness must be promise-like.");
            }
            this.#state = "pending";
            this.ready = new Promise<void>((resolve, reject) => {
                this.#resolveReady = resolve;
                this.#rejectReady = reject;
            });
            Promise.resolve(init.readiness).then(
                () => this.#settleReady(),
                error => this.#settleFailed(error),
            );
        }
        Object.freeze(this);
    }

    get state(): MEFXSampleBufferState {
        return this.#state;
    }

    get byteLength(): number {
        return this.#assertPayload().byteLength;
    }

    sampleSizeAt(index: number): number {
        const sampleIndex = checkedSampleIndex(index, this.sampleCount);
        return this.#sizes.length === 1 ? this.#sizes[0]! : this.#sizes[sampleIndex]!;
    }

    sampleByteRangeAt(index: number): Readonly<{ offset: number; length: number }> {
        const sampleIndex = checkedSampleIndex(index, this.sampleCount);
        if (this.#sizes.length === 1) {
            const length = this.#sizes[0]!;
            return Object.freeze({ offset: length * sampleIndex, length });
        }
        let offset = 0;
        for (let position = 0; position < sampleIndex; position += 1)
            offset += this.#sizes[position]!;
        return Object.freeze({ offset, length: this.#sizes[sampleIndex]! });
    }

    timingAt(index: number): MEFXSampleTimingInfo {
        const sampleIndex = checkedSampleIndex(index, this.sampleCount);
        return this.#timings.length === 1
            ? this.#timings[0]!.advancedBySamples(sampleIndex)
            : this.#timings[sampleIndex]!;
    }

    sampleBlock(index: number): MEFXBlockBuffer {
        const payload = this.#assertPayload();
        const range = this.sampleByteRangeAt(index);
        return payload.slice(range.offset, range.offset + range.length);
    }

    invalidate(reason: unknown = new Error("Sample buffer invalidated.")): void {
        if (this.#state === "invalidated")
            return;
        if (this.#state === "failed") {
            this.#releasePayload();
            return;
        }
        this.#state = "invalidated";
        if (!this.#settled) {
            this.#settled = true;
            this.#rejectReady?.(reason);
            this.#resolveReady = null;
            this.#rejectReady = null;
        }
        this.#releasePayload();
    }

    close(): void {
        this.invalidate(new Error("Sample buffer closed."));
    }

    #settleReady(): void {
        if (this.#state !== "pending" || this.#settled)
            return;
        this.#state = "ready";
        this.#settled = true;
        this.#resolveReady?.();
        this.#resolveReady = null;
        this.#rejectReady = null;
    }

    #settleFailed(error: unknown): void {
        if (this.#state !== "pending" || this.#settled)
            return;
        this.#state = "failed";
        this.#settled = true;
        this.#rejectReady?.(error);
        this.#resolveReady = null;
        this.#rejectReady = null;
        this.#releasePayload();
    }

    #releasePayload(): void {
        this.#payload?.close();
        this.#payload = null;
    }

    #assertPayload(): MEFXBlockBuffer {
        if (!this.#payload)
            throw new Error("Sample buffer payload is no longer available.");
        return this.#payload;
    }
}
