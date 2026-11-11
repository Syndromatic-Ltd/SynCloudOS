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

import { SynCloudOSLifecycleRecord } from "../../SynCloudOS/fxRuntimeContracts";

import { MEFXTime } from "./MEFXTime";

export type MEFXBufferQueueOrdering = "insertion" | "presentation";
export type MEFXBufferQueueOverflowPolicy = "wait" | "reject" | "drop-oldest";

export interface MEFXBufferQueueOptions<T> {
    readonly maxCount: number;
    readonly maxBytes: number;
    readonly maxDuration?: MEFXTime | null;
    readonly ordering?: MEFXBufferQueueOrdering;
    readonly overflow?: MEFXBufferQueueOverflowPolicy;
    readonly byteCost: (value: T) => number;
    readonly duration?: (value: T) => MEFXTime | null | undefined;
    readonly presentationTime?: (value: T) => MEFXTime;
    /** Transactional ownership adapter. The sender is consumed only if
     * `accept` returns successfully; an exception must leave it untouched. */
    readonly transfer: <R>(value: T, accept: (owned: T) => R) => R;
    readonly close: (value: T) => void;
}

export interface MEFXBufferQueueConfiguration {
    readonly maxCount: number;
    readonly maxBytes: number;
    readonly maxDuration: MEFXTime | null;
    readonly ordering: MEFXBufferQueueOrdering;
    readonly overflow: MEFXBufferQueueOverflowPolicy;
}

export interface MEFXBufferQueueDurationSnapshot {
    readonly numerator: bigint;
    readonly denominator: bigint;
}

export interface MEFXBufferQueueSnapshot {
    readonly generation: number;
    readonly count: number;
    readonly retainedBytes: number;
    readonly retainedDuration: MEFXBufferQueueDurationSnapshot | null;
    readonly ended: boolean;
    readonly disposed: boolean;
    readonly pendingEnqueues: number;
    readonly pendingDequeues: number;
}

export interface MEFXBufferQueueEnqueueOptions {
    readonly signal?: AbortSignal;
}

export interface MEFXBufferQueueDequeueOptions {
    readonly signal?: AbortSignal;
}

export interface MEFXBufferQueueEnqueueResult<T> {
    readonly accepted: true;
    readonly dropped: readonly T[];
    readonly generation: number;
}

interface Rational {
    readonly numerator: bigint;
    readonly denominator: bigint;
}

interface QueueMeasurement {
    readonly byteCost: number;
    readonly duration: Rational | null;
    readonly presentationTime: MEFXTime | null;
}

interface QueueEntry<T> {
    readonly value: T;
    readonly measurement: QueueMeasurement;
    readonly sequence: bigint;
}

interface ProducerWaiter<T> {
    readonly value: T;
    readonly measurement: QueueMeasurement;
    readonly generation: number;
    readonly signal: AbortSignal | undefined;
    readonly resolve: (result: MEFXBufferQueueEnqueueResult<T>) => void;
    readonly reject: (reason?: unknown) => void;
    abortListener?: () => void;
}

interface ConsumerWaiter<T> {
    readonly generation: number;
    readonly signal: AbortSignal | undefined;
    readonly resolve: (value: T | null) => void;
    readonly reject: (reason?: unknown) => void;
    abortListener?: () => void;
}

const zeroRational: Rational = Object.freeze({ numerator: 0n, denominator: 1n });

function checkedNonnegativeInteger(value: unknown, name: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0)
        throw new RangeError(`${name} must be a nonnegative safe integer.`);
    return value as number;
}

function checkedPositiveInteger(value: unknown, name: string): number {
    const integer = checkedNonnegativeInteger(value, name);
    if (integer < 1)
        throw new RangeError(`${name} must be at least one.`);
    return integer;
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
    let a = left < 0n ? -left : left;
    let b = right < 0n ? -right : right;
    while (b !== 0n) {
        const remainder = a % b;
        a = b;
        b = remainder;
    }
    return a === 0n ? 1n : a;
}

function rational(numerator: bigint, denominator: bigint): Rational {
    if (denominator <= 0n)
        throw new RangeError("Media queue rational denominator must be positive.");
    if (numerator === 0n)
        return zeroRational;
    const divisor = greatestCommonDivisor(numerator, denominator);
    return Object.freeze({
        numerator: numerator / divisor,
        denominator: denominator / divisor,
    });
}

function addRational(left: Rational, right: Rational): Rational {
    return rational(
        left.numerator * right.denominator + right.numerator * left.denominator,
        left.denominator * right.denominator,
    );
}

function subtractRational(left: Rational, right: Rational): Rational {
    const result = rational(
        left.numerator * right.denominator - right.numerator * left.denominator,
        left.denominator * right.denominator,
    );
    if (result.numerator < 0n)
        throw new Error("Media queue retained duration underflow.");
    return result;
}

function compareRational(left: Rational, right: Rational): -1 | 0 | 1 {
    const leftScaled = left.numerator * right.denominator;
    const rightScaled = right.numerator * left.denominator;
    return leftScaled < rightScaled ? -1 : leftScaled > rightScaled ? 1 : 0;
}

function finiteTimeValue(time: MEFXTime, name: string) {
    if (!(time instanceof MEFXTime) || time.value.kind !== "finite")
        throw new TypeError(`${name} must be a finite MEFXTime.`);
    return time.value;
}

function durationRational(time: MEFXTime, name: string): Rational {
    const value = finiteTimeValue(time, name);
    if (value.epoch !== 0n)
        throw new RangeError(`${name} must use epoch zero.`);
    if (value.value < 0n)
        throw new RangeError(`${name} cannot be negative.`);
    return rational(value.value, BigInt(value.timescale));
}

function comparePresentationTime(left: MEFXTime, right: MEFXTime): -1 | 0 | 1 {
    const a = finiteTimeValue(left, "Queue presentation time");
    const b = finiteTimeValue(right, "Queue presentation time");
    if (a.epoch < b.epoch)
        return -1;
    if (a.epoch > b.epoch)
        return 1;
    const leftScaled = a.value * BigInt(b.timescale);
    const rightScaled = b.value * BigInt(a.timescale);
    return leftScaled < rightScaled ? -1 : leftScaled > rightScaled ? 1 : 0;
}

function abortError(): Error {
    const error = new Error("Media queue operation aborted.");
    error.name = "AbortError";
    return error;
}

function endedError(): Error {
    return new Error("Media queue has ended.");
}


function budgetError(kind = "budget"): Error {
    return new Error(`Media queue ${kind} budget is full.`);
}

function freezeResult<T>(
    generation: number,
    dropped: readonly T[] = [],
): MEFXBufferQueueEnqueueResult<T> {
    return Object.freeze({
        accepted: true as const,
        dropped: Object.freeze([...dropped]),
        generation,
    });
}

export class MEFXBufferQueue<T> {
    readonly #lifecycle = new SynCloudOSLifecycleRecord({ kind: "MEFXBufferQueue" });
    readonly configuration: MEFXBufferQueueConfiguration;

    readonly #byteCost: (value: T) => number;
    readonly #duration: ((value: T) => MEFXTime | null | undefined) | undefined;
    readonly #presentationTime: ((value: T) => MEFXTime) | undefined;
    readonly #transfer: <R>(value: T, accept: (owned: T) => R) => R;
    readonly #close: (value: T) => void;
    readonly #maxDuration: Rational | null;

    #disposedError(operation: string): Error {
        return this.#lifecycle.error({ code: "MEFX_BUFFER_QUEUE_DISPOSED", operation: operation });
    }

    #entries: QueueEntry<T>[] = [];
    #producerWaiters: ProducerWaiter<T>[] = [];
    #consumerWaiters: ConsumerWaiter<T>[] = [];
    #retainedBytes = 0;
    #retainedDuration: Rational = zeroRational;
    #generation = 0;
    #sequence = 0n;
    #ended = false;
    #disposed = false;
    #pumpScheduled = false;
    #externalCallbackDepth = 0;

    constructor(options: MEFXBufferQueueOptions<T>) {
        if (!options || typeof options !== "object")
            throw new TypeError("Media queue options are required.");

        const maxCount = checkedPositiveInteger(options.maxCount, "Media queue maxCount");
        const maxBytes = checkedNonnegativeInteger(options.maxBytes, "Media queue maxBytes");
        const ordering = options.ordering ?? "insertion";
        const overflow = options.overflow ?? "wait";
        if (ordering !== "insertion" && ordering !== "presentation")
            throw new TypeError("Media queue ordering must be insertion or presentation.");
        if (overflow !== "wait" && overflow !== "reject" && overflow !== "drop-oldest")
            throw new TypeError("Media queue overflow must be wait, reject, or drop-oldest.");
        if (typeof options.byteCost !== "function")
            throw new TypeError("Media queue byteCost must be a function.");
        if (options.duration !== undefined && typeof options.duration !== "function")
            throw new TypeError("Media queue duration must be a function.");
        if (options.presentationTime !== undefined && typeof options.presentationTime !== "function")
            throw new TypeError("Media queue presentationTime must be a function.");
        if (typeof options.transfer !== "function")
            throw new TypeError("Media queue transfer must be a function.");
        if (typeof options.close !== "function")
            throw new TypeError("Media queue close must be a function.");
        if (ordering === "presentation" && !options.presentationTime)
            throw new TypeError("Presentation-ordered media queues require presentationTime.");
        if (options.maxDuration !== undefined && options.maxDuration !== null && !options.duration)
            throw new TypeError("Duration-bounded media queues require a duration function.");

        const maxDurationTime = options.maxDuration ?? null;
        this.#maxDuration = maxDurationTime
            ? durationRational(maxDurationTime, "Media queue maxDuration")
            : null;
        this.configuration = Object.freeze({
            maxCount,
            maxBytes,
            maxDuration: maxDurationTime,
            ordering,
            overflow,
        });
        this.#byteCost = options.byteCost;
        this.#duration = options.duration;
        this.#presentationTime = options.presentationTime;
        this.#transfer = options.transfer;
        this.#close = options.close;
    }

    get generation(): number {
        return this.#generation;
    }

    snapshot(): MEFXBufferQueueSnapshot {
        const retainedDuration = this.#maxDuration
            ? Object.freeze({
                numerator: this.#retainedDuration.numerator,
                denominator: this.#retainedDuration.denominator,
            })
            : null;
        return Object.freeze({
            generation: this.#generation,
            count: this.#entries.length,
            retainedBytes: this.#retainedBytes,
            retainedDuration,
            ended: this.#ended,
            disposed: this.#disposed,
            pendingEnqueues: this.#producerWaiters.length,
            pendingDequeues: this.#consumerWaiters.length,
        });
    }

    enqueue(value: T, options: MEFXBufferQueueEnqueueOptions = {}): Promise<MEFXBufferQueueEnqueueResult<T>> {
        try {
            this.#assertMutationAllowed();
        }
        catch (error) {
            return Promise.reject(error);
        }
        if (this.#disposed)
            return Promise.reject(this.#disposedError("enqueue"));
        if (this.#ended)
            return Promise.reject(endedError());
        if (options.signal?.aborted)
            return Promise.reject(abortError());
        const generation = this.#generation;

        let measurement: QueueMeasurement;
        try {
            measurement = this.#measure(value);
            this.#assertCanEverFit(measurement);
            this.#assertEnqueueCurrent(generation, options.signal);
        }
        catch (error) {
            return Promise.reject(error);
        }

        if (this.configuration.overflow === "wait" && this.#producerWaiters.length > 0)
            return this.#waitToEnqueue(value, measurement, options.signal);

        const canDeliverDirectly = this.#entries.length === 0 && this.#consumerWaiters.length > 0;
        const canInsert = this.#canFit(measurement);

        if (!canDeliverDirectly && !canInsert && this.configuration.overflow === "reject")
            return Promise.reject(this.#currentBudgetError(measurement));

        if (!canDeliverDirectly && !canInsert && this.configuration.overflow === "wait")
            return this.#waitToEnqueue(value, measurement, options.signal);

        try {
            const result = this.#transactionallyTransfer(value, (owned) => {
                this.#assertEnqueueCurrent(generation, options.signal);
                if (this.#entries.length === 0 && this.#consumerWaiters.length > 0) {
                    const consumer = this.#consumerWaiters.shift()!;
                    this.#cleanupConsumer(consumer);
                    consumer.resolve(owned);
                    return freezeResult<T>(this.#generation);
                }
                if (this.#canFit(measurement)) {
                    this.#insertEntry(this.#ownedEntry(owned, measurement));
                return freezeResult<T>(this.#generation);
                }
                if (this.configuration.overflow === "drop-oldest") {
                    const victimCount = this.#victimCountToFit(measurement);
                    const dropped: T[] = [];
                    for (let index = 0; index < victimCount; index += 1)
                        dropped.push(this.#removeFirstEntry());
                    this.#insertEntry(this.#ownedEntry(owned, measurement));
                    return freezeResult(this.#generation, dropped);
                }
                throw this.#currentBudgetError(measurement);
            });
            return Promise.resolve(result);
        }
        catch (error) {
            return Promise.reject(error);
        }
    }

    dequeue(options: MEFXBufferQueueDequeueOptions = {}): Promise<T | null> {
        try {
            this.#assertMutationAllowed();
        }
        catch (error) {
            return Promise.reject(error);
        }
        if (this.#disposed)
            return Promise.reject(this.#disposedError("dequeue"));
        if (options.signal?.aborted)
            return Promise.reject(abortError());
        if (this.#entries.length > 0) {
            const value = this.#removeFirstEntry();
            if (!this.#ended)
                this.#scheduleProducerPump();
            return Promise.resolve(value);
        }
        if (this.#ended)
            return Promise.resolve(null);

        return new Promise<T | null>((resolve, reject) => {
            const waiter: ConsumerWaiter<T> = {
                generation: this.#generation,
                signal: options.signal,
                resolve,
                reject,
            };
            if (options.signal) {
                const abort = () => {
                    const index = this.#consumerWaiters.indexOf(waiter);
                    if (index < 0)
                        return;
                    this.#consumerWaiters.splice(index, 1);
                    this.#cleanupConsumer(waiter);
                    reject(abortError());
                };
                waiter.abortListener = abort;
                options.signal.addEventListener("abort", abort, { once: true });
            }
            this.#consumerWaiters.push(waiter);
            this.#scheduleProducerPump();
        });
    }

    end(): void {
        this.#assertMutationAllowed();
        if (this.#disposed || this.#ended)
            return;
        this.#ended = true;
        const reason = endedError();
        this.#rejectAllProducers(reason);
        while (this.#entries.length > 0 && this.#consumerWaiters.length > 0) {
            const consumer = this.#consumerWaiters.shift()!;
            this.#cleanupConsumer(consumer);
            consumer.resolve(this.#removeFirstEntry());
        }
        if (this.#entries.length === 0)
            this.#resolveAllConsumersAtEnd();
    }

    reset(reason: unknown = new Error("Media queue reset.")): void {
        this.#assertMutationAllowed();
        if (this.#disposed)
            return;
        this.#generation += 1;
        this.#ended = false;
        this.#rejectAllProducers(reason);
        this.#rejectAllConsumers(reason);
        const closeError = this.#closeAllEntries();
        if (closeError !== undefined)
            throw closeError;
    }

    dispose(reason: unknown = new Error("Media queue disposed.")): void {
        this.#assertMutationAllowed();
        if (this.#disposed)
            return;
        this.#generation += 1;
        this.#lifecycle.markDisposed("explicit");
        this.#disposed = true;
        this.#ended = true;
        this.#rejectAllProducers(reason);
        this.#rejectAllConsumers(reason);
        const closeError = this.#closeAllEntries();
        if (closeError !== undefined)
            throw closeError;
    }

    #measure(value: T): QueueMeasurement {
        const byteCost = checkedNonnegativeInteger(
            this.#withExternalCallback(() => this.#byteCost(value)),
            "Media queue item byte cost",
        );
        let duration: Rational | null = null;
        if (this.#duration) {
            const measured = this.#withExternalCallback(() => this.#duration!(value));
            if (measured !== undefined && measured !== null)
                duration = durationRational(measured, "Media queue item duration");
        }
        if (this.#maxDuration && !duration)
            throw new RangeError("Duration-bounded media queues require a finite item duration.");

        let presentationTime: MEFXTime | null = null;
        if (this.configuration.ordering === "presentation") {
            presentationTime = this.#withExternalCallback(() => this.#presentationTime!(value));
            finiteTimeValue(presentationTime, "Media queue presentation time");
        }
        return Object.freeze({ byteCost, duration, presentationTime });
    }

    #assertCanEverFit(measurement: QueueMeasurement): void {
        if (measurement.byteCost > this.configuration.maxBytes)
            throw budgetError("byte");
        if (this.#maxDuration && compareRational(measurement.duration!, this.#maxDuration) > 0)
            throw budgetError("duration");
    }

    #canFit(measurement: QueueMeasurement): boolean {
        return this.#canFitTotals(
            this.#entries.length,
            this.#retainedBytes,
            this.#retainedDuration,
            measurement,
        );
    }

    #canFitTotals(
        count: number,
        retainedBytes: number,
        retainedDuration: Rational,
        measurement: QueueMeasurement,
    ): boolean {
        if (count >= this.configuration.maxCount)
            return false;
        if (measurement.byteCost > this.configuration.maxBytes - retainedBytes)
            return false;
        if (this.#maxDuration) {
            const nextDuration = addRational(retainedDuration, measurement.duration!);
            if (compareRational(nextDuration, this.#maxDuration) > 0)
                return false;
        }
        return true;
    }

    #currentBudgetError(measurement: QueueMeasurement): Error {
        if (this.#entries.length >= this.configuration.maxCount)
            return budgetError("count");
        if (measurement.byteCost > this.configuration.maxBytes - this.#retainedBytes)
            return budgetError("byte");
        return budgetError("duration");
    }

    #victimCountToFit(measurement: QueueMeasurement): number {
        let count = this.#entries.length;
        let retainedBytes = this.#retainedBytes;
        let retainedDuration = this.#retainedDuration;
        let victims = 0;
        while (!this.#canFitTotals(count, retainedBytes, retainedDuration, measurement)) {
            const entry = this.#entries[victims];
            if (!entry)
                throw budgetError();
            count -= 1;
            retainedBytes -= entry.measurement.byteCost;
            if (this.#maxDuration)
                retainedDuration = subtractRational(retainedDuration, entry.measurement.duration!);
            victims += 1;
        }
        return victims;
    }

    #ownedEntry(owned: T, measurement: QueueMeasurement): QueueEntry<T> {
        const entry = Object.freeze({
            value: owned,
            measurement,
            sequence: this.#sequence,
        });
        this.#sequence += 1n;
        return entry;
    }

    #assertMutationAllowed(): void {
        if (this.#externalCallbackDepth > 0)
            throw new Error("Media queue callbacks cannot re-enter queue mutations.");
    }

    #withExternalCallback<R>(callback: () => R): R {
        this.#externalCallbackDepth += 1;
        try {
            return callback();
        }
        finally {
            this.#externalCallbackDepth -= 1;
        }
    }

    #transactionallyTransfer<R>(value: T, accept: (owned: T) => R): R {
        return this.#withExternalCallback(() => this.#transfer(value, accept));
    }

    #assertEnqueueCurrent(generation: number, signal: AbortSignal | undefined): void {
        if (signal?.aborted)
            throw abortError();
        if (this.#disposed)
            throw this.#disposedError("enqueue");
        if (this.#ended)
            throw endedError();
        if (generation !== this.#generation)
            throw new Error("Media queue generation changed during admission.");
    }

    #insertEntry(entry: QueueEntry<T>): void {
        if (this.configuration.ordering === "insertion") {
            this.#entries.push(entry);
        }
        else {
            let low = 0;
            let high = this.#entries.length;
            while (low < high) {
                const middle = (low + high) >>> 1;
                if (this.#compareEntries(entry, this.#entries[middle]!) < 0)
                    high = middle;
                else
                    low = middle + 1;
            }
            this.#entries.splice(low, 0, entry);
        }
        this.#retainedBytes += entry.measurement.byteCost;
        if (this.#maxDuration)
            this.#retainedDuration = addRational(this.#retainedDuration, entry.measurement.duration!);
    }

    #compareEntries(left: QueueEntry<T>, right: QueueEntry<T>): -1 | 0 | 1 {
        const timeOrder = comparePresentationTime(
            left.measurement.presentationTime!,
            right.measurement.presentationTime!,
        );
        if (timeOrder !== 0)
            return timeOrder;
        return left.sequence < right.sequence ? -1 : left.sequence > right.sequence ? 1 : 0;
    }

    #removeFirstEntry(): T {
        const entry = this.#entries.shift();
        if (!entry)
            throw new Error("Media queue entry underflow.");
        this.#retainedBytes -= entry.measurement.byteCost;
        if (this.#maxDuration)
            this.#retainedDuration = subtractRational(this.#retainedDuration, entry.measurement.duration!);
        return entry.value;
    }

    #waitToEnqueue(
        value: T,
        measurement: QueueMeasurement,
        signal: AbortSignal | undefined,
    ): Promise<MEFXBufferQueueEnqueueResult<T>> {
        return new Promise<MEFXBufferQueueEnqueueResult<T>>((resolve, reject) => {
            const waiter: ProducerWaiter<T> = {
                value,
                measurement,
                generation: this.#generation,
                signal,
                resolve,
                reject,
            };
            if (signal) {
                const abort = () => {
                    const index = this.#producerWaiters.indexOf(waiter);
                    if (index < 0)
                        return;
                    this.#producerWaiters.splice(index, 1);
                    this.#cleanupProducer(waiter);
                    reject(abortError());
                    this.#scheduleProducerPump();
                };
                waiter.abortListener = abort;
                signal.addEventListener("abort", abort, { once: true });
            }
            this.#producerWaiters.push(waiter);
            this.#scheduleProducerPump();
        });
    }

    #scheduleProducerPump(): void {
        if (this.#pumpScheduled || this.#disposed || this.#ended)
            return;
        this.#pumpScheduled = true;
        queueMicrotask(() => {
            this.#pumpScheduled = false;
            this.#pumpProducers();
        });
    }

    #pumpProducers(): void {
        if (this.#disposed || this.#ended)
            return;
        while (this.#producerWaiters.length > 0) {
            const waiter = this.#producerWaiters[0]!;
            if (waiter.generation !== this.#generation) {
                this.#producerWaiters.shift();
                this.#cleanupProducer(waiter);
                waiter.reject(new Error("Media queue generation changed."));
                continue;
            }
            if (waiter.signal?.aborted) {
                this.#producerWaiters.shift();
                this.#cleanupProducer(waiter);
                waiter.reject(abortError());
                continue;
            }

            const canDeliverDirectly = this.#entries.length === 0 && this.#consumerWaiters.length > 0;
            if (!canDeliverDirectly && !this.#canFit(waiter.measurement))
                break;

            try {
                const result = this.#transactionallyTransfer(waiter.value, (owned) => {
                    this.#assertEnqueueCurrent(waiter.generation, waiter.signal);
                    if (this.#producerWaiters[0] !== waiter)
                        throw abortError();
                    this.#producerWaiters.shift();
                    this.#cleanupProducer(waiter);
                    if (this.#entries.length === 0 && this.#consumerWaiters.length > 0) {
                        const consumer = this.#consumerWaiters.shift()!;
                        this.#cleanupConsumer(consumer);
                        consumer.resolve(owned);
                    }
                    else {
                        if (!this.#canFit(waiter.measurement))
                            throw this.#currentBudgetError(waiter.measurement);
                        this.#insertEntry(this.#ownedEntry(owned, waiter.measurement));
                    }
                    return freezeResult<T>(this.#generation);
                });
                waiter.resolve(result);
            }
            catch (error) {
                const index = this.#producerWaiters.indexOf(waiter);
                if (index >= 0) {
                    this.#producerWaiters.splice(index, 1);
                    this.#cleanupProducer(waiter);
                    waiter.reject(error);
                }
                continue;
            }
        }
    }

    #cleanupProducer(waiter: ProducerWaiter<T>): void {
        if (waiter.signal && waiter.abortListener)
            waiter.signal.removeEventListener("abort", waiter.abortListener);
        waiter.abortListener = undefined;
    }

    #cleanupConsumer(waiter: ConsumerWaiter<T>): void {
        if (waiter.signal && waiter.abortListener)
            waiter.signal.removeEventListener("abort", waiter.abortListener);
        waiter.abortListener = undefined;
    }

    #rejectAllProducers(reason: unknown): void {
        const waiters = this.#producerWaiters;
        this.#producerWaiters = [];
        for (const waiter of waiters) {
            this.#cleanupProducer(waiter);
            waiter.reject(reason);
        }
    }

    #rejectAllConsumers(reason: unknown): void {
        const waiters = this.#consumerWaiters;
        this.#consumerWaiters = [];
        for (const waiter of waiters) {
            this.#cleanupConsumer(waiter);
            waiter.reject(reason);
        }
    }

    #resolveAllConsumersAtEnd(): void {
        const waiters = this.#consumerWaiters;
        this.#consumerWaiters = [];
        for (const waiter of waiters) {
            this.#cleanupConsumer(waiter);
            waiter.resolve(null);
        }
    }

    #closeAllEntries(): unknown | undefined {
        const entries = this.#entries;
        this.#entries = [];
        this.#retainedBytes = 0;
        this.#retainedDuration = zeroRational;
        let firstError: unknown | undefined;
        for (const entry of entries) {
            try {
                this.#close(entry.value);
            }
            catch (error) {
                firstError ??= error;
            }
        }
        return firstError;
    }
}
