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

import { describe, expect, it } from "vitest";

import { MEFXBufferQueue } from "../../../src/FX/MediaFX/MEFXBufferQueue";
import { MEFXTime } from "../../../src/FX/MediaFX/MEFXTime";

type LeaseState = "live" | "transferred" | "closed";

class LeaseTracker {
    liveHandles = 0;
    liveBytes = 0;
    peakLiveBytes = 0;
    transferCalls = 0;

    opened(byteLength: number): void {
        this.liveHandles += 1;
        this.liveBytes += byteLength;
        this.peakLiveBytes = Math.max(this.peakLiveBytes, this.liveBytes);
    }

    moved(): void {
        this.transferCalls += 1;
    }

    closed(byteLength: number): void {
        this.liveHandles -= 1;
        this.liveBytes -= byteLength;
    }
}

class TestLease {
    readonly id: string;
    readonly byteLength: number;
    readonly presentationTime: MEFXTime;
    readonly duration: MEFXTime;
    readonly #tracker: LeaseTracker;
    #state: LeaseState = "live";

    constructor(
        tracker: LeaseTracker,
        id: string,
        byteLength = 1,
        presentationTime = MEFXTime.finite(0n, 1),
        duration = MEFXTime.finite(1n, 1),
        adopted = false,
    ) {
        this.#tracker = tracker;
        this.id = id;
        this.byteLength = byteLength;
        this.presentationTime = presentationTime;
        this.duration = duration;
        if (!adopted)
            tracker.opened(byteLength);
    }

    get live(): boolean {
        return this.#state === "live";
    }

    transfer(): TestLease {
        if (this.#state !== "live")
            throw new Error(`Lease ${this.id} is not live.`);
        this.#state = "transferred";
        this.#tracker.moved();
        return new TestLease(
            this.#tracker,
            this.id,
            this.byteLength,
            this.presentationTime,
            this.duration,
            true,
        );
    }

    transferIfAccepted<R>(accept: (owned: TestLease) => R): R {
        if (this.#state !== "live")
            throw new Error(`Lease ${this.id} is not live.`);
        const owned = new TestLease(
            this.#tracker,
            this.id,
            this.byteLength,
            this.presentationTime,
            this.duration,
            true,
        );
        try {
            const result = accept(owned);
            this.#state = "transferred";
            this.#tracker.moved();
            return result;
        }
        catch (error) {
            // `owned` has not acquired independent accounting until commit;
            // sender ownership therefore remains unchanged on rejection.
            throw error;
        }
    }

    close(): void {
        if (this.#state !== "live")
            return;
        this.#state = "closed";
        this.#tracker.closed(this.byteLength);
    }
}

function makeQueue(
    tracker: LeaseTracker,
    overrides: Record<string, unknown> = {},
): MEFXBufferQueue<TestLease> {
    const Queue = MEFXBufferQueue as unknown as new (options: Record<string, unknown>) => MEFXBufferQueue<TestLease>;
    return new Queue({
        maxCount: 8,
        maxBytes: 64,
        ordering: "insertion",
        overflow: "wait",
        byteCost: (value: TestLease) => value.byteLength,
        duration: (value: TestLease) => value.duration,
        presentationTime: (value: TestLease) => value.presentationTime,
        transfer: <R>(value: TestLease, accept: (owned: TestLease) => R) => value.transferIfAccepted(accept),
        close: (value: TestLease) => value.close(),
        ...overrides,
    });
}

function requireQueueApi(queue: MEFXBufferQueue<TestLease>): asserts queue is MEFXBufferQueue<TestLease> & {
    readonly configuration: Readonly<Record<string, unknown>>;
    enqueue(value: TestLease, options?: { readonly signal?: AbortSignal }): Promise<{
        readonly accepted: true;
        readonly dropped: readonly TestLease[];
        readonly generation: number;
    }>;
    dequeue(options?: { readonly signal?: AbortSignal }): Promise<TestLease | null>;
    end(): void;
    reset(reason?: unknown): void;
    dispose(reason?: unknown): void;
    snapshot(): Readonly<{
        generation: number;
        count: number;
        retainedBytes: number;
        retainedDuration: Readonly<{ numerator: bigint; denominator: bigint }> | null;
        ended: boolean;
        disposed: boolean;
        pendingEnqueues: number;
        pendingDequeues: number;
    }>;
} {
    const candidate = queue as unknown as Record<string, unknown>;
    expect(candidate.enqueue).toBeTypeOf("function");
    expect(candidate.dequeue).toBeTypeOf("function");
    expect(candidate.end).toBeTypeOf("function");
    expect(candidate.reset).toBeTypeOf("function");
    expect(candidate.dispose).toBeTypeOf("function");
    expect(candidate.snapshot).toBeTypeOf("function");
}

async function expectRejected(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
    await expect(promise).rejects.toThrow(pattern);
}

describe("MEFXBufferQueue", () => {
    it("snapshots immutable configuration and enforces count, byte, and duration budgets exactly", async () => {
        const countTracker = new LeaseTracker();
        const mutableOptions = {
            maxCount: 2,
            maxBytes: 100,
            overflow: "reject",
        };
        const countQueue = makeQueue(countTracker, mutableOptions);
        requireQueueApi(countQueue);
        expect(Object.isFrozen(countQueue.configuration)).toBe(true);
        mutableOptions.maxCount = 50;
        expect(countQueue.configuration.maxCount).toBe(2);

        const c1 = new TestLease(countTracker, "c1");
        const c2 = new TestLease(countTracker, "c2");
        const c3 = new TestLease(countTracker, "c3");
        await countQueue.enqueue(c1);
        await countQueue.enqueue(c2);
        expect(countQueue.snapshot().count).toBe(2);
        await expectRejected(countQueue.enqueue(c3), /count|full|budget/i);
        expect(c3.live).toBe(true);
        expect(countTracker.transferCalls).toBe(2);
        c3.close();
        countQueue.dispose();
        expect(countTracker.liveHandles).toBe(0);

        const byteTracker = new LeaseTracker();
        const byteQueue = makeQueue(byteTracker, {
            maxCount: 10,
            maxBytes: 4,
            overflow: "reject",
        });
        requireQueueApi(byteQueue);
        await byteQueue.enqueue(new TestLease(byteTracker, "b1", 2));
        await byteQueue.enqueue(new TestLease(byteTracker, "b2", 2));
        expect(byteQueue.snapshot().retainedBytes).toBe(4);
        const byteOverflow = new TestLease(byteTracker, "b3", 1);
        await expectRejected(byteQueue.enqueue(byteOverflow), /byte|full|budget/i);
        expect(byteOverflow.live).toBe(true);
        byteOverflow.close();
        byteQueue.dispose();
        expect(byteTracker.liveHandles).toBe(0);

        const durationTracker = new LeaseTracker();
        const durationQueue = makeQueue(durationTracker, {
            maxCount: 10,
            maxBytes: 100,
            maxDuration: MEFXTime.finite(2n, 3),
            overflow: "reject",
        });
        requireQueueApi(durationQueue);
        await durationQueue.enqueue(new TestLease(
            durationTracker,
            "d1",
            1,
            MEFXTime.finite(0n, 3),
            MEFXTime.finite(1n, 3),
        ));
        await durationQueue.enqueue(new TestLease(
            durationTracker,
            "d2",
            1,
            MEFXTime.finite(1n, 3),
            MEFXTime.finite(1n, 3),
        ));
        expect(durationQueue.snapshot().retainedDuration).toEqual({
            numerator: 2n,
            denominator: 3n,
        });
        const durationOverflow = new TestLease(
            durationTracker,
            "d3",
            1,
            MEFXTime.finite(2n, 3),
            MEFXTime.finite(1n, 3),
        );
        await expectRejected(durationQueue.enqueue(durationOverflow), /duration|full|budget/i);
        expect(durationOverflow.live).toBe(true);
        durationOverflow.close();
        durationQueue.dispose();
        expect(durationTracker.liveHandles).toBe(0);
    });

    it("waits for capacity without transferring early, then admits in FIFO producer order", async () => {
        const tracker = new LeaseTracker();
        const queue = makeQueue(tracker, {
            maxCount: 1,
            maxBytes: 64,
            overflow: "wait",
        });
        requireQueueApi(queue);

        await queue.enqueue(new TestLease(tracker, "first"));
        const second = new TestLease(tracker, "second");
        const waiting = queue.enqueue(second);
        let settled = false;
        void waiting.then(() => {
            settled = true;
        });
        await Promise.resolve();

        expect(settled).toBe(false);
        expect(second.live).toBe(true);
        expect(tracker.transferCalls).toBe(1);
        expect(queue.snapshot().pendingEnqueues).toBe(1);

        const first = await queue.dequeue();
        expect(first?.id).toBe("first");
        first?.close();
        await waiting;
        expect(second.live).toBe(false);
        expect(tracker.transferCalls).toBe(2);
        expect(queue.snapshot().count).toBe(1);

        queue.dispose();
        expect(tracker.liveHandles).toBe(0);
    });

    it("aborts one waiting producer or consumer without disturbing unrelated waiters", async () => {
        const producerTracker = new LeaseTracker();
        const producerQueue = makeQueue(producerTracker, {
            maxCount: 1,
            overflow: "wait",
        });
        requireQueueApi(producerQueue);
        await producerQueue.enqueue(new TestLease(producerTracker, "held"));

        const p1 = new TestLease(producerTracker, "p1");
        const p2 = new TestLease(producerTracker, "p2");
        const c1 = new AbortController();
        const c2 = new AbortController();
        const firstWait = producerQueue.enqueue(p1, { signal: c1.signal });
        const secondWait = producerQueue.enqueue(p2, { signal: c2.signal });
        const firstRejected = expect(firstWait).rejects.toMatchObject({ name: "AbortError" });
        c1.abort();
        await firstRejected;
        expect(p1.live).toBe(true);
        expect(producerQueue.snapshot().pendingEnqueues).toBe(1);

        const held = await producerQueue.dequeue();
        held?.close();
        await secondWait;
        expect(p2.live).toBe(false);
        expect(producerQueue.snapshot().count).toBe(1);
        p1.close();
        producerQueue.dispose();
        expect(producerTracker.liveHandles).toBe(0);

        const consumerTracker = new LeaseTracker();
        const consumerQueue = makeQueue(consumerTracker);
        requireQueueApi(consumerQueue);
        const d1 = new AbortController();
        const d2 = new AbortController();
        const firstConsumer = consumerQueue.dequeue({ signal: d1.signal });
        const secondConsumer = consumerQueue.dequeue({ signal: d2.signal });
        const consumerRejected = expect(firstConsumer).rejects.toMatchObject({ name: "AbortError" });
        d1.abort();
        await consumerRejected;
        expect(consumerQueue.snapshot().pendingDequeues).toBe(1);

        const delivered = new TestLease(consumerTracker, "delivered");
        await consumerQueue.enqueue(delivered);
        const received = await secondConsumer;
        expect(received?.id).toBe("delivered");
        received?.close();
        expect(consumerQueue.snapshot().pendingDequeues).toBe(0);
        consumerQueue.dispose();
        expect(consumerTracker.liveHandles).toBe(0);
    });

    it("orders by exact presentation time and keeps insertion order for equal timestamps", async () => {
        const tracker = new LeaseTracker();
        const queue = makeQueue(tracker, {
            maxCount: 8,
            ordering: "presentation",
            overflow: "reject",
        });
        requireQueueApi(queue);

        await queue.enqueue(new TestLease(tracker, "late", 1, MEFXTime.finite(2n, 3)));
        await queue.enqueue(new TestLease(tracker, "equal-a", 1, MEFXTime.finite(1n, 3)));
        await queue.enqueue(new TestLease(tracker, "equal-b", 1, MEFXTime.finite(2n, 6)));

        const first = await queue.dequeue();
        const second = await queue.dequeue();
        const third = await queue.dequeue();
        expect([first?.id, second?.id, third?.id]).toEqual(["equal-a", "equal-b", "late"]);
        first?.close();
        second?.close();
        third?.close();
        queue.dispose();
        expect(tracker.liveHandles).toBe(0);
    });

    it("ends by draining accepted entries and then yields end-of-stream", async () => {
        const tracker = new LeaseTracker();
        const queue = makeQueue(tracker, { overflow: "reject" });
        requireQueueApi(queue);
        await queue.enqueue(new TestLease(tracker, "one"));
        await queue.enqueue(new TestLease(tracker, "two"));

        queue.end();
        expect(queue.snapshot().ended).toBe(true);
        const afterEnd = new TestLease(tracker, "after-end");
        await expectRejected(queue.enqueue(afterEnd), /end|closed/i);
        expect(afterEnd.live).toBe(true);
        afterEnd.close();

        const one = await queue.dequeue();
        const two = await queue.dequeue();
        expect([one?.id, two?.id]).toEqual(["one", "two"]);
        one?.close();
        two?.close();
        await expect(queue.dequeue()).resolves.toBeNull();
        queue.dispose();
        expect(tracker.liveHandles).toBe(0);
    });

    it("reset closes queued leases, rejects all waiters, increments generation, and remains reusable", async () => {
        const tracker = new LeaseTracker();
        const queue = makeQueue(tracker, {
            maxCount: 3,
            overflow: "wait",
        });
        requireQueueApi(queue);
        await queue.enqueue(new TestLease(tracker, "one"));
        await queue.enqueue(new TestLease(tracker, "two"));
        await queue.enqueue(new TestLease(tracker, "three"));
        const waitingSource = new TestLease(tracker, "waiting");
        const waitingProducer = queue.enqueue(waitingSource);
        const resetReason = new Error("timeline discontinuity");
        const producerRejected = expect(waitingProducer).rejects.toBe(resetReason);

        queue.reset(resetReason);
        await producerRejected;
        expect(waitingSource.live).toBe(true);
        expect(queue.snapshot()).toMatchObject({
            generation: 1,
            count: 0,
            retainedBytes: 0,
            pendingEnqueues: 0,
        });
        expect(tracker.liveHandles).toBe(1);
        waitingSource.close();

        const waitingConsumer = queue.dequeue();
        const secondReset = new Error("second discontinuity");
        const consumerRejected = expect(waitingConsumer).rejects.toBe(secondReset);
        queue.reset(secondReset);
        await consumerRejected;
        expect(queue.snapshot().generation).toBe(2);

        await queue.enqueue(new TestLease(tracker, "new-generation"));
        const current = await queue.dequeue();
        expect(current?.id).toBe("new-generation");
        current?.close();
        queue.dispose();
        expect(tracker.liveHandles).toBe(0);
    });

    it("does not consume enqueue ownership when transfer fails or admission is impossible", async () => {
        const tracker = new LeaseTracker();
        const queue = makeQueue(tracker, {
            maxCount: 2,
            maxBytes: 4,
            overflow: "reject",
            transfer: <R>(value: TestLease, accept: (owned: TestLease) => R) => {
                if (value.id === "transfer-fails")
                    throw new Error("transfer refused");
                return value.transferIfAccepted(accept);
            },
        });
        requireQueueApi(queue);

        const transferFails = new TestLease(tracker, "transfer-fails", 2);
        await expectRejected(queue.enqueue(transferFails), /transfer refused/i);
        expect(transferFails.live).toBe(true);
        expect(queue.snapshot().count).toBe(0);

        const tooLarge = new TestLease(tracker, "too-large", 5);
        await expectRejected(queue.enqueue(tooLarge), /byte|budget/i);
        expect(tooLarge.live).toBe(true);
        expect(tracker.transferCalls).toBe(0);

        transferFails.close();
        tooLarge.close();
        queue.dispose();
        expect(tracker.liveHandles).toBe(0);
    });

    it("drop-oldest returns the evicted owned samples and admits the replacement", async () => {
        const tracker = new LeaseTracker();
        const queue = makeQueue(tracker, {
            maxCount: 2,
            maxBytes: 64,
            overflow: "drop-oldest",
        });
        requireQueueApi(queue);
        await queue.enqueue(new TestLease(tracker, "one"));
        await queue.enqueue(new TestLease(tracker, "two"));

        const replacement = await queue.enqueue(new TestLease(tracker, "three"));
        expect(replacement.accepted).toBe(true);
        expect(replacement.dropped.map(value => value.id)).toEqual(["one"]);
        expect(replacement.dropped[0]?.live).toBe(true);
        replacement.dropped.forEach(value => value.close());

        const two = await queue.dequeue();
        const three = await queue.dequeue();
        expect([two?.id, three?.id]).toEqual(["two", "three"]);
        two?.close();
        three?.close();
        queue.dispose();
        expect(tracker.liveHandles).toBe(0);
    });

    it("drop-oldest evicts every byte/duration victim required for one atomic admission", async () => {
        const tracker = new LeaseTracker();
        const queue = makeQueue(tracker, {
            maxCount: 8,
            maxBytes: 10,
            maxDuration: MEFXTime.finite(5n, 1),
            overflow: "drop-oldest",
        });
        await queue.enqueue(new TestLease(tracker, "one", 4, MEFXTime.finite(0n, 1), MEFXTime.finite(2n, 1)));
        await queue.enqueue(new TestLease(tracker, "two", 4, MEFXTime.finite(1n, 1), MEFXTime.finite(2n, 1)));
        const result = await queue.enqueue(new TestLease(
            tracker,
            "replacement",
            7,
            MEFXTime.finite(2n, 1),
            MEFXTime.finite(3n, 1),
        ));
        expect(result.dropped.map(value => value.id)).toEqual(["one", "two"]);
        result.dropped.forEach(value => value.close());
        expect(queue.snapshot()).toMatchObject({ count: 1, retainedBytes: 7 });
        expect(queue.snapshot().retainedDuration).toEqual({ numerator: 3n, denominator: 1n });
        const replacement = await queue.dequeue();
        expect(replacement?.id).toBe("replacement");
        replacement?.close();
        queue.dispose();
        expect(tracker.liveHandles).toBe(0);
    });

    it("admits multiple blocked producers in FIFO order as capacity becomes available", async () => {
        const tracker = new LeaseTracker();
        const queue = makeQueue(tracker, { maxCount: 1, maxBytes: 8, overflow: "wait" });
        await queue.enqueue(new TestLease(tracker, "held"));
        const second = new TestLease(tracker, "second");
        const third = new TestLease(tracker, "third");
        const fourth = new TestLease(tracker, "fourth");
        const secondPending = queue.enqueue(second);
        const thirdPending = queue.enqueue(third);
        const fourthPending = queue.enqueue(fourth);
        expect(queue.snapshot().pendingEnqueues).toBe(3);

        for (const expected of ["held", "second", "third", "fourth"]) {
            const value = await queue.dequeue();
            expect(value?.id).toBe(expected);
            value?.close();
            await Promise.resolve();
        }
        await Promise.all([secondPending, thirdPending, fourthPending]);
        queue.dispose();
        expect(tracker.liveHandles).toBe(0);
    });

    it("prevents a waiting producer from inserting across a reset generation", async () => {
        const tracker = new LeaseTracker();
        const queue = makeQueue(tracker, {
            maxCount: 1,
            overflow: "wait",
        });
        requireQueueApi(queue);
        await queue.enqueue(new TestLease(tracker, "old"));
        const stale = new TestLease(tracker, "stale");
        const pending = queue.enqueue(stale);
        const resetReason = new Error("seek");
        const rejected = expect(pending).rejects.toBe(resetReason);

        const removedPromise = queue.dequeue();
        queue.reset(resetReason);
        const removed = await removedPromise;
        removed?.close();
        await rejected;

        expect(stale.live).toBe(true);
        expect(queue.snapshot()).toMatchObject({
            generation: 1,
            count: 0,
            pendingEnqueues: 0,
        });
        stale.close();
        queue.dispose();
        expect(tracker.liveHandles).toBe(0);
    });

    it("keeps ownership with the sender when measurement or transfer admission re-enters lifecycle", async () => {
        for (const action of ["reset", "end", "dispose"] as const) {
            const tracker = new LeaseTracker();
            let queue!: MEFXBufferQueue<TestLease>;
            let reentered = false;
            queue = makeQueue(tracker, {
                byteCost: (value: TestLease) => {
                    if (!reentered) {
                        reentered = true;
                        if (action === "reset") queue.reset(new Error("measurement reset"));
                        else if (action === "end") queue.end();
                        else queue.dispose(new Error("measurement dispose"));
                    }
                    return value.byteLength;
                },
            });
            const value = new TestLease(tracker, `measure-${action}`);
            await expect(queue.enqueue(value)).rejects.toThrow(/re-enter|generation|ended|disposed/i);
            expect(value.live).toBe(true);
            expect(tracker.transferCalls).toBe(0);
            value.close();
            queue.dispose();
            expect(tracker.liveHandles).toBe(0);
        }

        const tracker = new LeaseTracker();
        let queue!: MEFXBufferQueue<TestLease>;
        const value = new TestLease(tracker, "transactional-transfer");
        queue = makeQueue(tracker, {
            transfer: <R>(source: TestLease, accept: (owned: TestLease) => R) => {
                queue.dispose(new Error("reentrant dispose"));
                return source.transferIfAccepted(accept);
            },
        });
        await expect(queue.enqueue(value)).rejects.toThrow(/re-enter|disposed|generation/i);
        expect(value.live).toBe(true);
        expect(tracker.transferCalls).toBe(0);
        expect(queue.snapshot()).toMatchObject({ disposed: false, count: 0, retainedBytes: 0 });
        value.close();
        queue.dispose();
        expect(tracker.liveHandles).toBe(0);
    });

    it("does not let an abort during transactional admission consume a producer or remove the next waiter", async () => {
        const tracker = new LeaseTracker();
        const firstAbort = new AbortController();
        let abortDuringTransfer = false;
        const queue = makeQueue(tracker, {
            maxCount: 1,
            overflow: "wait",
            transfer: <R>(value: TestLease, accept: (owned: TestLease) => R) => {
                if (value.id === "first-waiter" && !abortDuringTransfer) {
                    abortDuringTransfer = true;
                    firstAbort.abort();
                }
                return value.transferIfAccepted(accept);
            },
        });
        await queue.enqueue(new TestLease(tracker, "held"));
        const first = new TestLease(tracker, "first-waiter");
        const second = new TestLease(tracker, "second-waiter");
        const firstPending = queue.enqueue(first, { signal: firstAbort.signal });
        const secondPending = queue.enqueue(second);

        const held = await queue.dequeue();
        held?.close();
        await expect(firstPending).rejects.toMatchObject({ name: "AbortError" });
        expect(first.live).toBe(true);
        await expect(secondPending).resolves.toMatchObject({ accepted: true });
        expect(second.live).toBe(false);
        const received = await queue.dequeue();
        expect(received?.id).toBe("second-waiter");
        received?.close();
        first.close();
        queue.dispose();
        expect(tracker.liveHandles).toBe(0);
    });

    it("keeps retained bytes bounded with a stalled consumer and releases every handle", async () => {
        const tracker = new LeaseTracker();
        const queue = makeQueue(tracker, {
            maxCount: 100,
            maxBytes: 32,
            overflow: "drop-oldest",
        });
        requireQueueApi(queue);

        for (let index = 0; index < 1_000; index += 1) {
            const result = await queue.enqueue(new TestLease(tracker, `stall-${index}`, 4));
            result.dropped.forEach(value => value.close());
            expect(queue.snapshot().retainedBytes).toBeLessThanOrEqual(32);
        }

        expect(queue.snapshot().retainedBytes).toBe(32);
        expect(tracker.peakLiveBytes).toBeLessThanOrEqual(36);
        queue.dispose();
        expect(tracker.liveHandles).toBe(0);
        expect(tracker.liveBytes).toBe(0);
    });

    it("matches a fixed-seed 100,000-event ownership/order/budget model", async () => {
        const tracker = new LeaseTracker();
        const queue = makeQueue(tracker, {
            maxCount: 64,
            maxBytes: 256,
            maxDuration: MEFXTime.finite(97n, 1),
            overflow: "drop-oldest",
        });
        requireQueueApi(queue);
        const model: Array<{ id: string; bytes: number; duration: number }> = [];
        let modelBytes = 0;
        let modelDuration = 0;

        let seed = 0x5eed_1234;
        const next = () => {
            seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
            return seed;
        };

        for (let index = 0; index < 100_000; index += 1) {
            const snapshot = queue.snapshot();
            const shouldDequeue = snapshot.count > 0 && (next() % 100) < 37;
            if (shouldDequeue) {
                const value = await queue.dequeue();
                const expected = model.shift();
                if (!expected || value?.id !== expected.id)
                    throw new Error(`queue/model dequeue divergence at event ${index}`);
                modelBytes -= expected.bytes;
                modelDuration -= expected.duration;
                value?.close();
            }
            else {
                const byteLength = (next() % 8) + 1;
                const duration = (next() % 4) + 1;
                const id = `event-${index}`;
                const expectedDropped: string[] = [];
                while (
                    model.length >= 64
                    || modelBytes + byteLength > 256
                    || modelDuration + duration > 97
                ) {
                    const victim = model.shift();
                    if (!victim) throw new Error("model underflow while making admission capacity");
                    expectedDropped.push(victim.id);
                    modelBytes -= victim.bytes;
                    modelDuration -= victim.duration;
                }
                const result = await queue.enqueue(new TestLease(
                    tracker,
                    id,
                    byteLength,
                    MEFXTime.finite(BigInt(index), 60),
                    MEFXTime.finite(BigInt(duration), 1),
                ));
                if (result.dropped.map(value => value.id).join("|") !== expectedDropped.join("|"))
                    throw new Error(`queue/model drop divergence at event ${index}`);
                result.dropped.forEach(value => value.close());
                model.push({ id, bytes: byteLength, duration });
                modelBytes += byteLength;
                modelDuration += duration;
            }

            const current = queue.snapshot();
            if (current.count !== model.length || current.retainedBytes !== modelBytes)
                throw new Error(`queue/model accounting divergence at event ${index}`);
            if (!current.retainedDuration
                || current.retainedDuration.numerator !== BigInt(modelDuration) * current.retainedDuration.denominator)
                throw new Error(`queue/model duration divergence at event ${index}`);
        }

        queue.dispose();
        expect(tracker.liveHandles).toBe(0);
        expect(tracker.liveBytes).toBe(0);
    }, 20_000);
});
