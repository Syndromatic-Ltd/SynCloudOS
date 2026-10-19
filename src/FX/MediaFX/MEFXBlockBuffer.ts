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

import { SynCloudOSLifecycleRecord, synCloudOSLifecycleSignalReason } from "../../SynCloudOS/fxRuntimeContracts";

export type MEFXBlockSegmentInput =
    | Uint8Array
    | Readonly<{
        bytes: Uint8Array;
        offset?: number;
        length?: number;
    }>;

export interface MEFXBlockBufferOptions {
    readonly onBackingRelease?: () => void;
}

export interface MEFXBlockCopyOptions {
    readonly sourceOffset?: number;
    readonly targetOffset?: number;
    readonly length?: number;
}

/** Host-private ownership hooks. This type is intentionally not re-exported
 * from the public MediaFX package entry. */
export interface MEFXBlockRuntimeHandle {
    readonly signal: AbortSignal;
    release(): void;
}

/** Host-private owner used by mounted AppSDK acquisition. */
export interface MEFXBlockRuntimeOwner {
    acquireHandle(): MEFXBlockRuntimeHandle;
    onBackingRelease(): void;
}

const maximumPortableBlockBytes = 0x7fff_ffff;
const internalViewToken = Symbol("MEFXBlockBuffer.internalView");
const runtimeOwners = new WeakMap<MEFXBlockBuffer, MEFXBlockRuntimeOwner>();
const runtimeHandles = new WeakMap<MEFXBlockBuffer, Readonly<{
    handle: MEFXBlockRuntimeHandle;
    abort: () => void;
}>>();

interface PreparedSegment {
    readonly bytes: Uint8Array;
    readonly offset: number;
    readonly length: number;
}

interface InternalView {
    readonly token: typeof internalViewToken;
    readonly backing: BlockBacking;
    readonly offset: number;
    readonly length: number;
}

function isInternalView(value: unknown): value is InternalView {
    return Boolean(
        value
        && typeof value === "object"
        && Object.getOwnPropertyDescriptor(value, "token")?.value === internalViewToken,
    );
}

function checkedInteger(value: unknown, name: string, maximum = Number.MAX_SAFE_INTEGER): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > maximum)
        throw new RangeError(name + " must be a nonnegative safe integer.");
    return value as number;
}

function segmentRecord(value: Exclude<MEFXBlockSegmentInput, Uint8Array>): PreparedSegment {
    if (!value || typeof value !== "object" || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null))
        throw new TypeError("Media block segment must be plain data.");
    if (Object.getOwnPropertySymbols(value).length)
        throw new TypeError("Media block segment cannot contain symbol properties.");

    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Object.keys(descriptors);
    if (!descriptors.bytes || !("value" in descriptors.bytes) || keys.some(key => !["bytes", "offset", "length"].includes(key)))
        throw new TypeError("Media block segment has an invalid data shape.");
    if ((descriptors.offset && !("value" in descriptors.offset)) || (descriptors.length && !("value" in descriptors.length)))
        throw new TypeError("Media block segment fields must be data properties.");

    const bytes = descriptors.bytes.value;
    if (!(bytes instanceof Uint8Array))
        throw new TypeError("Media block segment bytes must be Uint8Array.");
    const offset = descriptors.offset ? checkedInteger(descriptors.offset.value, "Media block segment offset", bytes.byteLength) : 0;
    const length = descriptors.length
        ? checkedInteger(descriptors.length.value, "Media block segment length", bytes.byteLength)
        : bytes.byteLength - offset;
    if (offset > bytes.byteLength || length > bytes.byteLength - offset)
        throw new RangeError("Media block segment bounds exceed the supplied bytes.");
    return Object.freeze({ bytes, offset, length });
}

function prepareSegments(input: MEFXBlockSegmentInput | readonly MEFXBlockSegmentInput[]): Readonly<{
    segments: readonly PreparedSegment[];
    byteLength: number;
}> {
    const supplied = input instanceof Uint8Array ? [input] : Array.isArray(input) ? input : [input];
    const prepared: PreparedSegment[] = [];
    let total = 0;

    for (const segment of supplied) {
        const current = segment instanceof Uint8Array
            ? Object.freeze({ bytes: segment, offset: 0, length: segment.byteLength })
            : segmentRecord(segment);
        if (current.length > maximumPortableBlockBytes - total)
            throw new RangeError("Media block exceeds the " + maximumPortableBlockBytes + " byte portable block limit.");
        total += current.length;
        prepared.push(current);
    }

    return Object.freeze({ segments: Object.freeze(prepared), byteLength: total });
}

function abortReason(signal: AbortSignal): Error {
    return signal.reason instanceof Error
        ? signal.reason
        : new DOMException("Mounted media block was revoked.", "AbortError");
}

function attachRuntimeHandle(
    buffer: MEFXBlockBuffer,
    owner: MEFXBlockRuntimeOwner,
    handle: MEFXBlockRuntimeHandle,
): void {
    const abort = () => buffer.close();
    runtimeOwners.set(buffer, owner);
    runtimeHandles.set(buffer, Object.freeze({ handle, abort }));
    handle.signal.addEventListener("abort", abort, { once: true });
    if (handle.signal.aborted) {
        buffer.close();
        throw abortReason(handle.signal);
    }
}

class BlockBacking {
    #segments: Uint8Array[] | null;
    #handles = 1;
    #released = false;
    readonly byteLength: number;
    readonly #onRelease: (() => void) | undefined;

    constructor(segments: readonly Uint8Array[], byteLength: number, onRelease?: () => void) {
        this.#segments = [...segments];
        this.byteLength = byteLength;
        this.#onRelease = onRelease;
    }

    retain(): void {
        if (this.#released)
            throw new Error("Media block backing has been released.");
        this.#handles += 1;
    }

    release(): void {
        if (this.#released)
            return;
        this.#handles -= 1;
        if (this.#handles > 0)
            return;
        this.#released = true;
        this.#segments = null;
        this.#onRelease?.();
    }

    copyRange(sourceOffset: number, length: number, target: Uint8Array, targetOffset: number): void {
        const segments = this.#segments;
        if (this.#released || !segments)
            throw new Error("Media block backing has been released.");
        if (length === 0)
            return;

        let logicalOffset = 0;
        let source = sourceOffset;
        let remaining = length;
        let output = targetOffset;

        for (const segment of segments) {
            const segmentEnd = logicalOffset + segment.byteLength;
            if (source >= segmentEnd) {
                logicalOffset = segmentEnd;
                continue;
            }
            const localStart = Math.max(0, source - logicalOffset);
            const available = segment.byteLength - localStart;
            const amount = Math.min(available, remaining);
            target.set(segment.subarray(localStart, localStart + amount), output);
            output += amount;
            source += amount;
            remaining -= amount;
            if (remaining === 0)
                return;
            logicalOffset = segmentEnd;
        }

        throw new RangeError("Media block copy exceeded backing bounds.");
    }
}

export class MEFXBlockBuffer {
    readonly #lifecycle = new SynCloudOSLifecycleRecord({ kind: "MEFXBlockBuffer" });
    #backing: BlockBacking | null;
    readonly #offset: number;
    readonly #length: number;

    constructor(
        input: MEFXBlockSegmentInput | readonly MEFXBlockSegmentInput[] | InternalView,
        options: MEFXBlockBufferOptions = {},
    ) {
        if (isInternalView(input)) {
            input.backing.retain();
            this.#backing = input.backing;
            this.#offset = input.offset;
            this.#length = input.length;
            return;
        }
        if (options.onBackingRelease !== undefined && typeof options.onBackingRelease !== "function")
            throw new TypeError("Media block release callback must be a function.");

        const prepared = prepareSegments(input);
        const ownedSegments = prepared.segments.map(segment =>
            segment.bytes.slice(segment.offset, segment.offset + segment.length),
        );
        this.#backing = new BlockBacking(ownedSegments, prepared.byteLength, options.onBackingRelease);
        this.#offset = 0;
        this.#length = prepared.byteLength;
    }

    get byteLength(): number {
        return this.#length;
    }

    get closed(): boolean {
        return this.#backing === null;
    }

    copyTo(target: Uint8Array, options: MEFXBlockCopyOptions = {}): number {
        if (!(target instanceof Uint8Array))
            throw new TypeError("Media block copy target must be Uint8Array.");
        const backing = this.#assertOpen("copyTo");
        const sourceOffset = checkedInteger(options.sourceOffset ?? 0, "Media block source offset", this.#length);
        const targetOffset = checkedInteger(options.targetOffset ?? 0, "Media block target offset", target.byteLength);
        const defaultLength = this.#length - sourceOffset;
        const length = checkedInteger(options.length ?? defaultLength, "Media block copy length", this.#length);
        if (length > this.#length - sourceOffset)
            throw new RangeError("Media block source copy range exceeds the view.");
        if (length > target.byteLength - targetOffset)
            throw new RangeError("Media block target copy range exceeds the destination.");
        backing.copyRange(this.#offset + sourceOffset, length, target, targetOffset);
        return length;
    }

    slice(start = 0, end = this.#length): MEFXBlockBuffer {
        const backing = this.#assertOpen("slice");
        const checkedStart = checkedInteger(start, "Media block slice start", this.#length);
        const checkedEnd = checkedInteger(end, "Media block slice end", this.#length);
        if (checkedEnd < checkedStart)
            throw new RangeError("Media block slice end cannot precede its start.");
        const owner = runtimeOwners.get(this);
        const handle = owner?.acquireHandle();
        let slice: MEFXBlockBuffer | null = null;
        try {
            slice = new MEFXBlockBuffer({
                token: internalViewToken,
                backing,
                offset: this.#offset + checkedStart,
                length: checkedEnd - checkedStart,
            });
            if (owner && handle)
                attachRuntimeHandle(slice, owner, handle);
            return slice;
        }
        catch (error) {
            if (slice)
                slice.close();
            else
                handle?.release();
            throw error;
        }
    }

    transfer<T>(accept: (transferred: MEFXBlockBuffer) => PromiseLike<T>): Promise<T>;
    transfer<T>(accept: (transferred: MEFXBlockBuffer) => T): T;
    transfer<T>(accept: (transferred: MEFXBlockBuffer) => T | PromiseLike<T>): T | Promise<T> {
        if (typeof accept !== "function")
            throw new TypeError("Media block transfer requires an admission function.");
        this.#assertOpen("transfer");
        const transferred = this.slice();
        const transferredRuntimeHandle = runtimeHandles.get(transferred)?.handle;
        const assertRuntimeTransferLive = () => {
            if (!transferredRuntimeHandle?.signal.aborted)
                return;
            transferred.close();
            throw abortReason(transferredRuntimeHandle.signal);
        };
        try {
            const result = accept(transferred);
            if (result !== null
                && (typeof result === "object" || typeof result === "function")
                && typeof (result as PromiseLike<T>).then === "function") {
                return Promise.resolve(result).then(
                    value => {
                        assertRuntimeTransferLive();
                        this.close();
                        return value;
                    },
                    error => {
                        transferred.close();
                        throw error;
                    },
                );
            }
            assertRuntimeTransferLive();
            this.close();
            return result as T;
        }
        catch (error) {
            transferred.close();
            throw error;
        }
    }

    close(): void {
        const backing = this.#backing;
        if (!backing)
            return;
        const runtimeHandle = runtimeHandles.get(this);
        const signal = runtimeHandle?.handle.signal;
        this.#lifecycle.markDisposed(signal?.aborted ? synCloudOSLifecycleSignalReason(signal) : "explicit");
        this.#backing = null;
        runtimeHandles.delete(this);
        runtimeOwners.delete(this);
        if (runtimeHandle) {
            runtimeHandle.handle.signal.removeEventListener("abort", runtimeHandle.abort);
            runtimeHandle.handle.release();
        }
        backing.release();
    }

    #assertOpen(operation: string): BlockBacking {
        if (!this.#backing)
            throw this.#lifecycle.error({ code: "MEFX_BLOCK_BUFFER_DISPOSED", operation: operation });
        return this.#backing;
    }
}

/** Creates a runtime-owned block after its backing allocation has already been
 * budget-reserved by the mounted host. Slices inherit the same owner and take
 * their own mounted handle while sharing one backing-byte reservation. */
export function createRuntimeOwnedMEFXBlockBuffer(
    input: MEFXBlockSegmentInput | readonly MEFXBlockSegmentInput[],
    owner: MEFXBlockRuntimeOwner,
): MEFXBlockBuffer {
    const handle = owner.acquireHandle();
    let block: MEFXBlockBuffer | null = null;
    try {
        block = new MEFXBlockBuffer(input, { onBackingRelease: () => owner.onBackingRelease() });
        attachRuntimeHandle(block, owner, handle);
        return block;
    }
    catch (error) {
        if (block)
            block.close();
        else
            handle.release();
        throw error;
    }
}
