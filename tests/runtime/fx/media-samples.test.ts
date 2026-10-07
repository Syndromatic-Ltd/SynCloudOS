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

import { describe, expect, it, vi } from "vitest";
import { MEFXBlockBuffer } from "../../../src/FX/MediaFX/MEFXBlockBuffer";
import { MEFXFormatDescription } from "../../../src/FX/MediaFX/MEFXFormatDescription";
import { MEFXSampleBuffer } from "../../../src/FX/MediaFX/MEFXSampleBuffer";
import { MEFXSampleTimingInfo } from "../../../src/FX/MediaFX/MEFXSampleTimingInfo";
import { MEFXTime } from "../../../src/FX/MediaFX/MEFXTime";

function bytesOf(buffer: MEFXBlockBuffer): number[] {
    const bytes = new Uint8Array(buffer.byteLength);
    expect(buffer.copyTo(bytes)).toBe(bytes.byteLength);
    return [...bytes];
}

function deferred<T = void>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

describe("MEFXBlockBuffer", () => {
    it("preflights segment bounds/aggregate size, snapshots caller bytes, and retains slices independently", () => {
        const released = vi.fn();
        const first = new Uint8Array([1, 2, 3, 4]);
        const second = new Uint8Array([5, 6, 7]);
        const buffer = new MEFXBlockBuffer([
            { bytes: first, offset: 1, length: 2 },
            second,
        ], { onBackingRelease: released });

        first.fill(90);
        second.fill(91);
        expect(bytesOf(buffer)).toEqual([2, 3, 5, 6, 7]);

        expect(() => new MEFXBlockBuffer([{ bytes: new Uint8Array(2), offset: 1, length: 2 }]))
            .toThrow(/segment bounds/i);

        const oneMiB = new Uint8Array(1024 * 1024);
        expect(() => new MEFXBlockBuffer(Array.from({ length: 2048 }, () => oneMiB)))
            .toThrow(/portable block limit/i);

        const retained = buffer.slice(1, 4);
        buffer.close();
        expect(buffer.closed).toBe(true);
        expect(bytesOf(retained)).toEqual([3, 5, 6]);
        expect(released).not.toHaveBeenCalled();

        retained.close();
        retained.close();
        expect(released).toHaveBeenCalledTimes(1);
        expect(() => bytesOf(retained)).toThrow(/closed/i);
    });

    it("commits transfer only after synchronous admission succeeds", () => {
        const failedRelease = vi.fn();
        const failed = new MEFXBlockBuffer(new Uint8Array([8, 9]), { onBackingRelease: failedRelease });
        expect(() => failed.transfer(() => {
            throw new Error("budget denied");
        })).toThrow("budget denied");
        expect(failed.closed).toBe(false);
        expect(bytesOf(failed)).toEqual([8, 9]);
        expect(failedRelease).not.toHaveBeenCalled();
        failed.close();
        expect(failedRelease).toHaveBeenCalledTimes(1);

        const succeededRelease = vi.fn();
        const sender = new MEFXBlockBuffer(new Uint8Array([10, 11]), { onBackingRelease: succeededRelease });
        let receiver: MEFXBlockBuffer | undefined;
        expect(sender.transfer((transferred) => {
            receiver = transferred;
            return "accepted";
        })).toBe("accepted");
        expect(sender.closed).toBe(true);
        expect(bytesOf(receiver!)).toEqual([10, 11]);
        expect(succeededRelease).not.toHaveBeenCalled();
        receiver!.close();
        expect(succeededRelease).toHaveBeenCalledTimes(1);
    });

    it("retains sender ownership until asynchronous admission settles", async () => {
        const rejectedRelease = vi.fn();
        const rejected = new MEFXBlockBuffer(new Uint8Array([12, 13]), { onBackingRelease: rejectedRelease });
        const rejection = deferred<string>();
        const rejectedTransfer = rejected.transfer(() => rejection.promise);
        expect(rejected.closed).toBe(false);
        rejection.reject(new Error("async budget denied"));
        await expect(rejectedTransfer).rejects.toThrow("async budget denied");
        expect(rejected.closed).toBe(false);
        expect(bytesOf(rejected)).toEqual([12, 13]);
        expect(rejectedRelease).not.toHaveBeenCalled();
        rejected.close();
        expect(rejectedRelease).toHaveBeenCalledTimes(1);

        const acceptedRelease = vi.fn();
        const accepted = new MEFXBlockBuffer(new Uint8Array([14, 15]), { onBackingRelease: acceptedRelease });
        const admission = deferred<string>();
        let receiver: MEFXBlockBuffer | undefined;
        const acceptedTransfer = accepted.transfer((transferred) => {
            receiver = transferred;
            return admission.promise;
        });
        expect(accepted.closed).toBe(false);
        admission.resolve("accepted later");
        await expect(acceptedTransfer).resolves.toBe("accepted later");
        expect(accepted.closed).toBe(true);
        expect(bytesOf(receiver!)).toEqual([14, 15]);
        receiver!.close();
        expect(acceptedRelease).toHaveBeenCalledTimes(1);
    });
});

describe("MEFXFormatDescription and timing", () => {
    it("snapshots bounded serializable metadata and compares structurally", () => {
        const extensions = {
            profile: "main",
            vendor: { revision: 2, flags: ["a", "b"] },
        };
        const description = new MEFXFormatDescription({
            mediaType: "video",
            codec: "example.codec",
            version: 2,
            extensions,
        });
        extensions.profile = "mutated";
        extensions.vendor.flags[0] = "changed";

        expect(description.extensions).toEqual({
            profile: "main",
            vendor: { revision: 2, flags: ["a", "b"] },
        });
        expect(Object.isFrozen(description.extensions)).toBe(true);
        expect(Object.isFrozen(description.extensions.vendor)).toBe(true);
        expect(description.equals(new MEFXFormatDescription({
            codec: "example.codec",
            mediaType: "video",
            version: 2,
            extensions: {
                vendor: { flags: ["a", "b"], revision: 2 },
                profile: "main",
            },
        }))).toBe(true);

        expect(() => new MEFXFormatDescription({
            mediaType: "data",
            codec: "oversized",
            extensions: { blob: "x".repeat(17 * 1024) },
        })).toThrow(/metadata limit/i);

        const dangerous = Object.create(null) as Record<string, unknown>;
        Object.defineProperty(dangerous, "__proto__", {
            value: { injected: true },
            enumerable: true,
            configurable: true,
            writable: true,
        });
        const dangerousSnapshot = new MEFXFormatDescription({
            mediaType: "data",
            codec: "safe.metadata",
            extensions: dangerous,
        });
        expect(Object.prototype.hasOwnProperty.call(dangerousSnapshot.extensions, "__proto__")).toBe(true);
        expect(Object.getOwnPropertyDescriptor(dangerousSnapshot.extensions, "__proto__")?.value).toEqual({ injected: true });
        expect((dangerousSnapshot.extensions as { injected?: boolean }).injected).toBeUndefined();
    });

    it("keeps missing duration distinct from explicit zero", () => {
        const presentationTime = MEFXTime.finite(0n, 600);
        const missing = new MEFXSampleTimingInfo({ presentationTime });
        const zero = new MEFXSampleTimingInfo({
            presentationTime,
            duration: MEFXTime.finite(0n, 600),
        });

        expect(missing.duration).toBeNull();
        expect(zero.duration?.compare(MEFXTime.finite(0n, 1))).toBe(0);
    });
});

describe("MEFXSampleBuffer", () => {
    it("validates repeated/per-sample cardinality, payload bounds, and derives repeated timing", () => {
        const payload = new MEFXBlockBuffer(new Uint8Array([1, 2, 3, 4, 5, 6]));
        const format = new MEFXFormatDescription({ mediaType: "data", codec: "raw" });
        const repeated = new MEFXSampleTimingInfo({
            presentationTime: MEFXTime.finite(0n, 30),
            decodeTime: MEFXTime.finite(-1n, 30),
            duration: MEFXTime.finite(1n, 30),
        });
        const attachments = {
            sync: true,
            keyframe: true,
            discontinuity: { reason: "seek", generation: 4 },
            dropHint: "droppable" as const,
            extensions: { source: { label: "fixture" } },
        };

        const samples = new MEFXSampleBuffer({
            payload,
            format,
            sampleCount: 3,
            sampleSizes: [2],
            timings: [repeated],
            attachments,
        });
        attachments.discontinuity.reason = "mutated";
        attachments.extensions.source.label = "changed";

        expect(samples.timingAt(1).presentationTime.compare(MEFXTime.finite(1n, 30))).toBe(0);
        expect(samples.timingAt(2).decodeTime?.compare(MEFXTime.finite(1n, 30))).toBe(0);
        expect(samples.sampleSizeAt(2)).toBe(2);
        expect(samples.sampleByteRangeAt(2)).toEqual({ offset: 4, length: 2 });
        const last = samples.sampleBlock(2);
        expect(bytesOf(last)).toEqual([5, 6]);
        expect(samples.attachments.discontinuity).toEqual({ reason: "seek", generation: 4 });
        expect(samples.attachments.extensions).toEqual({ source: { label: "fixture" } });

        expect(() => new MEFXSampleBuffer({
            payload,
            format,
            sampleCount: 3,
            sampleSizes: [2, 2],
            timings: [repeated],
        })).toThrow(/sample size cardinality/i);
        expect(() => new MEFXSampleBuffer({
            payload,
            format,
            sampleCount: 3,
            sampleSizes: [2],
            timings: [repeated, repeated],
        })).toThrow(/timing cardinality/i);
        expect(() => new MEFXSampleBuffer({
            payload,
            format,
            sampleCount: 2,
            sampleSizes: [3],
            timings: [new MEFXSampleTimingInfo({ presentationTime: MEFXTime.finite(0n, 30) })],
        })).toThrow(/duration is required/i);
        expect(() => new MEFXSampleBuffer({
            payload,
            format,
            sampleCount: 3,
            sampleSizes: [3],
            timings: [repeated],
        })).toThrow(/payload bounds/i);

        samples.close();
        payload.close();
        expect(bytesOf(last)).toEqual([5, 6]);
        last.close();
    });

    it("settles readiness once and invalidation wins over a late producer", async () => {
        const payload = new MEFXBlockBuffer(new Uint8Array([1]));
        const format = new MEFXFormatDescription({ mediaType: "data", codec: "raw" });
        const timing = new MEFXSampleTimingInfo({
            presentationTime: MEFXTime.finite(0n, 1),
            duration: MEFXTime.finite(1n, 1),
        });
        const pending = deferred();
        const samples = new MEFXSampleBuffer({
            payload,
            format,
            sampleCount: 1,
            sampleSizes: [1],
            timings: [timing],
            readiness: pending.promise,
        });

        expect(samples.state).toBe("pending");
        const invalidated = new Error("superseded");
        samples.invalidate(invalidated);
        expect(samples.state).toBe("invalidated");
        await expect(samples.ready).rejects.toBe(invalidated);
        pending.resolve();
        await pending.promise;
        await Promise.resolve();
        expect(samples.state).toBe("invalidated");

        const failedPayload = new MEFXBlockBuffer(new Uint8Array([2]));
        const failedProducer = deferred();
        const failed = new MEFXSampleBuffer({
            payload: failedPayload,
            format,
            sampleCount: 1,
            sampleSizes: [1],
            timings: [timing],
            readiness: failedProducer.promise,
        });
        const failure = new Error("decode failed");
        failedProducer.reject(failure);
        await expect(failed.ready).rejects.toBe(failure);
        expect(failed.state).toBe("failed");

        samples.close();
        failed.close();
        payload.close();
        failedPayload.close();
    });
});
