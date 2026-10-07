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

import type { MEFXClock, MEFXClockReading } from "../MediaFX/MEFXClock";
import { MEFXTime } from "../MediaFX/MEFXTime";
import type { MIFXOutputLease } from "./MIFXAccess";

export type MIFXScheduledSendState = "queued" | "submitted" | "cancelled" | "failed";

export interface MIFXScheduledSend {
  readonly state: MIFXScheduledSendState;
  readonly error: unknown | null;
  cancel(): boolean;
}

export interface MIFXSchedulerOptions {
  readonly clock: MEFXClock;
  readonly output: MIFXOutputLease;
  readonly ownerSignal?: AbortSignal;
  readonly maximumQueuedEvents?: number;
  readonly hostNowMilliseconds?: () => number;
  readonly scheduleHostCallback?: (callback: () => void, delayMilliseconds: number) => unknown;
  readonly cancelHostCallback?: (handle: unknown) => void;
}

interface PendingSend {
  readonly sequence: number;
  readonly data: Uint8Array;
  readonly target: MEFXTime;
  readonly generation: number;
  readonly targetHostMilliseconds: number;
  state: MIFXScheduledSendState;
  error: unknown | null;
  handle: MIFXScheduledSend;
}

/** The single outstanding host wake-up and the queue head it was armed for. */
interface ArmedWake {
  readonly event: PendingSend;
  readonly handle: unknown;
}

function boundedPositive(value: unknown, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || Number(value) <= 0 || Number(value) > 65_536)
    throw new RangeError(`${label} must be a positive bounded safe integer.`);
  return Number(value);
}

function defaultNowMilliseconds(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
  return Date.now();
}

function defaultSchedule(callback: () => void, delay: number): unknown {
  return setTimeout(callback, delay);
}

function defaultCancel(handle: unknown): void {
  clearTimeout(handle as ReturnType<typeof setTimeout>);
}

function checkedHostMilliseconds(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError("MIDI host clock must return a nonnegative finite millisecond value.");
  return value;
}

function checkedData(data: Uint8Array): Uint8Array {
  if (!(data instanceof Uint8Array)) throw new TypeError("Scheduled MIDI output requires Uint8Array data.");
  if (data.byteLength === 0) throw new RangeError("Scheduled MIDI output cannot be empty.");
  return new Uint8Array(data);
}

function compareTimes(left: MEFXTime, right: MEFXTime): number {
  const result = left.compare(right);
  if (result === "unordered") throw new DOMException("Scheduled MIDI time is unordered with the current media clock epoch.", "InvalidStateError");
  return result;
}

export class MIFXScheduler {
  readonly #clock: MEFXClock;
  readonly #output: MIFXOutputLease;
  readonly #ownerSignal?: AbortSignal;
  readonly #maximumQueuedEvents: number;
  readonly #hostNowMilliseconds: () => number;
  readonly #scheduleHostCallback: (callback: () => void, delayMilliseconds: number) => unknown;
  readonly #cancelHostCallback: (handle: unknown) => void;
  readonly #unsubscribeDiscontinuity: () => void;
  readonly #onOwnerAbort: () => void;
  readonly #queue: PendingSend[] = [];
  #nextSequence = 1;
  #armed: ArmedWake | null = null;
  #disposed = false;

  constructor(options: MIFXSchedulerOptions) {
    if (!options?.clock || typeof options.clock.now !== "function" || typeof options.clock.subscribeDiscontinuities !== "function")
      throw new TypeError("MIDI scheduler requires a MediaFX clock.");
    if (!options.output || typeof options.output.send !== "function") throw new TypeError("MIDI scheduler requires an output lease.");
    this.#clock = options.clock;
    this.#output = options.output;
    this.#ownerSignal = options.ownerSignal;
    this.#maximumQueuedEvents = boundedPositive(options.maximumQueuedEvents, 256, "MIDI scheduler queue limit");
    this.#hostNowMilliseconds = options.hostNowMilliseconds ?? defaultNowMilliseconds;
    this.#scheduleHostCallback = options.scheduleHostCallback ?? defaultSchedule;
    this.#cancelHostCallback = options.cancelHostCallback ?? defaultCancel;
    this.#unsubscribeDiscontinuity = this.#clock.subscribeDiscontinuities(() => this.#cancelQueued());
    this.#onOwnerAbort = () => this.#revokeOwner();
    this.#ownerSignal?.addEventListener("abort", this.#onOwnerAbort, { once: true });
    if (this.#ownerSignal?.aborted) this.#revokeOwner();
  }

  get queuedCount(): number { return this.#queue.length; }

  schedule(data: Uint8Array, target: MEFXTime): MIFXScheduledSend {
    this.#assertActive();
    if (!(target instanceof MEFXTime) || target.value.kind !== "finite") throw new TypeError("Scheduled MIDI time must be finite MEFXTime.");
    const reading = this.#clock.now();
    const hostNow = checkedHostMilliseconds(this.#hostNowMilliseconds());
    const deltaMilliseconds = target.subtract(reading.position).toSeconds() * 1_000;
    if (!Number.isFinite(deltaMilliseconds)) throw new RangeError("Scheduled MIDI host-time conversion overflowed.");

    let event!: PendingSend;
    const handle: MIFXScheduledSend = Object.freeze({
      get state() { return event.state; },
      get error() { return event.error; },
      cancel: () => this.#cancelEvent(event),
    });
    event = {
      sequence: this.#nextSequence++,
      data: checkedData(data),
      target,
      generation: reading.generation,
      targetHostMilliseconds: deltaMilliseconds <= 0 ? hostNow : hostNow + deltaMilliseconds,
      state: "queued",
      error: null,
      handle,
    };

    if (deltaMilliseconds <= 0) {
      this.#submit(event, hostNow);
      return handle;
    }
    if (this.#queue.length >= this.#maximumQueuedEvents)
      throw new DOMException("MIDI scheduler queue limit exceeded.", "QuotaExceededError");
    // Locate the slot before mutating: an unordered comparison throws with the
    // queue unchanged. Upper-bound insertion keeps equal targets in FIFO order.
    this.#queue.splice(this.#insertionIndex(target), 0, event);
    this.#arm(reading, hostNow);
    return handle;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#ownerSignal?.removeEventListener("abort", this.#onOwnerAbort);
    this.#unsubscribeDiscontinuity();
    this.#cancelQueued();
  }

  #insertionIndex(target: MEFXTime): number {
    let low = 0;
    let high = this.#queue.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (compareTimes(this.#queue[middle]!.target, target) <= 0) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  /** Keeps exactly one host wake-up armed for the current queue head. A wake
   * already armed for that head is left alone, so later or equal-time
   * insertions cause no timer churn; a new earlier head (or a cancelled head)
   * replaces it. */
  #arm(reading?: MEFXClockReading, hostNow?: number): void {
    if (this.#disposed) return;
    const first = this.#queue[0];
    if (!first) {
      this.#resetTimer();
      return;
    }
    if (this.#armed?.event === first) return;
    this.#resetTimer();
    const current = reading ?? this.#clock.now();
    if (first.generation !== current.generation) {
      this.#cancelQueued();
      return;
    }
    const delay = Math.max(0, first.target.subtract(current.position).toSeconds() * 1_000);
    const now = hostNow ?? checkedHostMilliseconds(this.#hostNowMilliseconds());
    if (!Number.isFinite(delay) || !Number.isFinite(now)) throw new RangeError("MIDI scheduler timer conversion overflowed.");
    let armed!: ArmedWake;
    const handle = this.#scheduleHostCallback(() => {
      // A host that fires a callback after cancellation must not clobber the
      // wake-up that replaced it.
      if (this.#armed !== armed) return;
      this.#armed = null;
      this.#drain();
    }, delay);
    armed = { event: first, handle };
    this.#armed = armed;
  }

  #drain(): void {
    if (this.#disposed) return;
    const reading = this.#clock.now();
    const hostNow = checkedHostMilliseconds(this.#hostNowMilliseconds());
    while (this.#queue.length > 0) {
      const event = this.#queue[0]!;
      if (event.generation !== reading.generation) {
        this.#queue.shift();
        event.state = "cancelled";
        continue;
      }
      if (compareTimes(event.target, reading.position) > 0) break;
      this.#queue.shift();
      this.#submit(event, Math.max(hostNow, event.targetHostMilliseconds));
    }
    this.#arm(reading, hostNow);
  }

  #submit(event: PendingSend, timestampMilliseconds: number): void {
    if (event.state !== "queued") return;
    try {
      this.#output.send(new Uint8Array(event.data), timestampMilliseconds);
      event.state = "submitted";
    } catch (error) {
      event.error = error;
      event.state = "failed";
    }
  }

  #cancelEvent(event: PendingSend): boolean {
    if (event.state !== "queued") return false;
    const index = this.#queue.indexOf(event);
    if (index >= 0) this.#queue.splice(index, 1);
    event.state = "cancelled";
    this.#arm();
    return true;
  }

  #cancelQueued(): void {
    this.#resetTimer();
    for (const event of this.#queue.splice(0)) {
      if (event.state === "queued") event.state = "cancelled";
    }
  }

  #resetTimer(): void {
    const armed = this.#armed;
    if (armed === null) return;
    this.#armed = null;
    this.#cancelHostCallback(armed.handle);
  }

  #revokeOwner(): void {
    this.#cancelQueued();
    this.#unsubscribeDiscontinuity();
    this.#disposed = true;
  }

  #assertActive(): void {
    if (this.#ownerSignal?.aborted) throw this.#ownerSignal.reason ?? new DOMException("MIDI scheduler owner was revoked.", "AbortError");
    if (this.#disposed) throw new DOMException("MIDI scheduler is disposed.", "AbortError");
  }
}
