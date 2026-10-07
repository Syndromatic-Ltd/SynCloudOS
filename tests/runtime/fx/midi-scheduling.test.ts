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
import type { MEFXClock, MEFXClockReading } from "../../../src/FX/MediaFX/MEFXClock";
import { MEFXTime } from "../../../src/FX/MediaFX/MEFXTime";
import { MIFXScheduler } from "../../../src/FX/MIDIFX/MIFXScheduler";
import { MIDIOutputArbiter } from "../../../src/SynCloudOS/MIDIFX/MIDIOutputArbiter";
import { AUFXAudioFormat } from "../../../src/FX/AudioFX/AUFXAudioFormat";
import { AUFXAudioPCMBuffer } from "../../../src/FX/AudioFX/AUFXAudioPCMBuffer";
import { MIFXParser } from "../../../src/FX/MIDIFX/MIFXParser";

function clockHarness() {
  let position = MEFXTime.finite(10n, 1);
  let generation = 0;
  const listeners = new Set<(reading: MEFXClockReading) => void>();
  const now = (): MEFXClockReading => Object.freeze({ position, domain: "runtime:test:midi", generation, uncertaintySeconds: 0 });
  const clock: MEFXClock = { now, subscribeDiscontinuities(listener) { listeners.add(listener); return () => listeners.delete(listener); } };
  return {
    clock,
    set(positionValue: MEFXTime) { position = positionValue; },
    invalidate() { generation += 1; for (const listener of [...listeners]) listener(now()); },
  };
}

function timerHarness() {
  let nextId = 1;
  const timers = new Map<number, { due: number; order: number; callback: () => void }>();
  let now = 5_000;
  let order = 0;
  let scheduled = 0;
  return {
    now: () => now,
    schedule(callback: () => void, delayMs: number) { scheduled += 1; const id = nextId++; timers.set(id, { due: now + delayMs, order: order++, callback }); return id; },
    cancel(id: unknown) { timers.delete(id as number); },
    scheduledCount: () => scheduled,
    dueTimes: () => [...timers.values()].map((timer) => timer.due).sort((a, b) => a - b),
    advance(milliseconds: number) {
      now += milliseconds;
      while (true) {
        const due = [...timers.entries()].filter(([, timer]) => timer.due <= now).sort((a, b) => a[1].due - b[1].due || a[1].order - b[1].order)[0];
        if (!due) break;
        timers.delete(due[0]);
        due[1].callback();
      }
    },
    pending: () => timers.size,
  };
}

describe("MIDIFX scheduling and output arbitration", () => {
  it("orders identical timestamps, converts media seconds to DOM milliseconds once and reports submitted state", () => {
    const clock = clockHarness();
    const timers = timerHarness();
    const sends: Array<{ data: number[]; timestamp: number | undefined }> = [];
    const output = { endpoint: {} as any, send(data: Uint8Array, timestamp?: number) { sends.push({ data: [...data], timestamp }); }, dispose() {} };
    const scheduler = new MIFXScheduler({ clock: clock.clock, output, hostNowMilliseconds: timers.now, scheduleHostCallback: timers.schedule, cancelHostCallback: timers.cancel });

    const first = scheduler.schedule(new Uint8Array([0x90, 60, 100]), MEFXTime.finite(21n, 2));
    const second = scheduler.schedule(new Uint8Array([0x90, 62, 100]), MEFXTime.finite(21n, 2));
    expect(first.state).toBe("queued");
    expect(second.state).toBe("queued");
    expect(timers.pending()).toBe(1);
    clock.set(MEFXTime.finite(21n, 2));
    timers.advance(500);
    expect(sends).toEqual([
      { data: [0x90, 60, 100], timestamp: 5_500 },
      { data: [0x90, 62, 100], timestamp: 5_500 },
    ]);
    expect(first.state).toBe("submitted");
    expect(second.state).toBe("submitted");
    expect(first.cancel()).toBe(false);
    scheduler.dispose();
  });

  it("rearms for a newly inserted deadline that is earlier than the armed one", () => {
    const clock = clockHarness();
    const timers = timerHarness();
    const sends: Array<{ note: number; timestamp: number | undefined; hostNow: number }> = [];
    const output = { endpoint: {} as any, send(data: Uint8Array, timestamp?: number) { sends.push({ note: data[1]!, timestamp, hostNow: timers.now() }); }, dispose() {} };
    const scheduler = new MIFXScheduler({ clock: clock.clock, output, hostNowMilliseconds: timers.now, scheduleHostCallback: timers.schedule, cancelHostCallback: timers.cancel });

    scheduler.schedule(new Uint8Array([0x90, 61, 100]), MEFXTime.finite(11n, 1));
    scheduler.schedule(new Uint8Array([0x90, 60, 100]), MEFXTime.finite(101n, 10));
    expect(timers.dueTimes()).toEqual([5_100]);

    clock.set(MEFXTime.finite(101n, 10));
    timers.advance(100);
    expect(sends).toEqual([{ note: 60, timestamp: 5_100, hostNow: 5_100 }]);
    expect(timers.dueTimes()).toEqual([6_000]);

    clock.set(MEFXTime.finite(11n, 1));
    timers.advance(900);
    expect(sends).toEqual([
      { note: 60, timestamp: 5_100, hostNow: 5_100 },
      { note: 61, timestamp: 6_000, hostNow: 6_000 },
    ]);
    expect(timers.pending()).toBe(0);
    scheduler.dispose();
  });

  it("does not rearm the host timer for later or equal-time insertions", () => {
    const clock = clockHarness();
    const timers = timerHarness();
    const notes: number[] = [];
    const output = { endpoint: {} as any, send(data: Uint8Array) { notes.push(data[1]!); }, dispose() {} };
    const scheduler = new MIFXScheduler({ clock: clock.clock, output, hostNowMilliseconds: timers.now, scheduleHostCallback: timers.schedule, cancelHostCallback: timers.cancel });

    scheduler.schedule(new Uint8Array([0x90, 60, 1]), MEFXTime.finite(21n, 2));
    scheduler.schedule(new Uint8Array([0x90, 61, 1]), MEFXTime.finite(11n, 1));
    scheduler.schedule(new Uint8Array([0x90, 62, 1]), MEFXTime.finite(21n, 2));
    expect(timers.scheduledCount()).toBe(1);
    expect(timers.dueTimes()).toEqual([5_500]);

    clock.set(MEFXTime.finite(21n, 2));
    timers.advance(500);
    expect(notes).toEqual([60, 62]);
    scheduler.dispose();
  });

  it("keeps equal-time FIFO order when an earlier group is inserted ahead of the armed head", () => {
    const clock = clockHarness();
    const timers = timerHarness();
    const notes: number[] = [];
    const output = { endpoint: {} as any, send(data: Uint8Array) { notes.push(data[1]!); }, dispose() {} };
    const scheduler = new MIFXScheduler({ clock: clock.clock, output, hostNowMilliseconds: timers.now, scheduleHostCallback: timers.schedule, cancelHostCallback: timers.cancel });

    scheduler.schedule(new Uint8Array([0x90, 70, 1]), MEFXTime.finite(11n, 1));
    scheduler.schedule(new Uint8Array([0x90, 71, 1]), MEFXTime.finite(21n, 2));
    scheduler.schedule(new Uint8Array([0x90, 72, 1]), MEFXTime.finite(21n, 2));
    expect(timers.pending()).toBe(1);
    expect(timers.dueTimes()).toEqual([5_500]);

    clock.set(MEFXTime.finite(21n, 2));
    timers.advance(500);
    expect(notes).toEqual([71, 72]);
    clock.set(MEFXTime.finite(11n, 1));
    timers.advance(500);
    expect(notes).toEqual([71, 72, 70]);
    scheduler.dispose();
  });

  it("rearms to the next live deadline when the armed head is cancelled", () => {
    const clock = clockHarness();
    const timers = timerHarness();
    const notes: number[] = [];
    const output = { endpoint: {} as any, send(data: Uint8Array) { notes.push(data[1]!); }, dispose() {} };
    const scheduler = new MIFXScheduler({ clock: clock.clock, output, hostNowMilliseconds: timers.now, scheduleHostCallback: timers.schedule, cancelHostCallback: timers.cancel });

    const head = scheduler.schedule(new Uint8Array([0x90, 60, 1]), MEFXTime.finite(101n, 10));
    const tail = scheduler.schedule(new Uint8Array([0x90, 61, 1]), MEFXTime.finite(11n, 1));
    const scheduledBeforeTailCancel = timers.scheduledCount();
    expect(head.cancel()).toBe(true);
    expect(timers.dueTimes()).toEqual([6_000]);

    const later = scheduler.schedule(new Uint8Array([0x90, 62, 1]), MEFXTime.finite(12n, 1));
    const armedCount = timers.scheduledCount();
    expect(later.cancel()).toBe(true);
    expect(timers.scheduledCount()).toBe(armedCount);
    expect(timers.dueTimes()).toEqual([6_000]);
    expect(armedCount).toBe(scheduledBeforeTailCancel + 1);

    clock.set(MEFXTime.finite(11n, 1));
    timers.advance(1_000);
    expect(notes).toEqual([61]);
    expect(tail.state).toBe("submitted");
    expect(timers.pending()).toBe(0);
    scheduler.dispose();
  });

  it("leaves no armed host timer and sends nothing after disposal or a clock discontinuity", () => {
    const clock = clockHarness();
    const timers = timerHarness();
    const send = vi.fn();
    const output = { endpoint: {} as any, send, dispose() {} };
    const scheduler = new MIFXScheduler({ clock: clock.clock, output, hostNowMilliseconds: timers.now, scheduleHostCallback: timers.schedule, cancelHostCallback: timers.cancel });

    scheduler.schedule(new Uint8Array([0x90, 60, 1]), MEFXTime.finite(11n, 1));
    scheduler.schedule(new Uint8Array([0x90, 61, 1]), MEFXTime.finite(101n, 10));
    clock.invalidate();
    expect(timers.pending()).toBe(0);
    expect(scheduler.queuedCount).toBe(0);

    const fresh = scheduler.schedule(new Uint8Array([0x90, 62, 1]), MEFXTime.finite(11n, 1));
    scheduler.schedule(new Uint8Array([0x90, 63, 1]), MEFXTime.finite(101n, 10));
    expect(timers.dueTimes()).toEqual([5_100]);
    scheduler.dispose();
    expect(timers.pending()).toBe(0);
    expect(fresh.state).toBe("cancelled");
    clock.set(MEFXTime.finite(11n, 1));
    timers.advance(2_000);
    expect(send).not.toHaveBeenCalled();
  });

  it("submits past timestamps immediately, cancels queued work and enforces the queue budget before allocation", () => {
    const clock = clockHarness();
    const timers = timerHarness();
    const send = vi.fn();
    const output = { endpoint: {} as any, send, dispose() {} };
    const scheduler = new MIFXScheduler({ clock: clock.clock, output, maximumQueuedEvents: 1, hostNowMilliseconds: timers.now, scheduleHostCallback: timers.schedule, cancelHostCallback: timers.cancel });

    const past = scheduler.schedule(new Uint8Array([0x80, 60, 0]), MEFXTime.finite(9n, 1));
    expect(past.state).toBe("submitted");
    expect(send).toHaveBeenCalledWith(expect.any(Uint8Array), 5_000);
    const future = scheduler.schedule(new Uint8Array([0x90, 60, 1]), MEFXTime.finite(11n, 1));
    expect(() => scheduler.schedule(new Uint8Array([0x90, 61, 1]), MEFXTime.finite(12n, 1))).toThrow(expect.objectContaining({ name: "QuotaExceededError" }));
    expect(future.cancel()).toBe(true);
    expect(future.state).toBe("cancelled");
    expect(timers.pending()).toBe(0);
    scheduler.dispose();
  });

  it("cancels stale generation work and revokes queued owner work without submitting it", () => {
    const clock = clockHarness();
    const timers = timerHarness();
    const send = vi.fn();
    const owner = new AbortController();
    const scheduler = new MIFXScheduler({ clock: clock.clock, output: { endpoint: {} as any, send, dispose() {} }, ownerSignal: owner.signal, hostNowMilliseconds: timers.now, scheduleHostCallback: timers.schedule, cancelHostCallback: timers.cancel });
    const stale = scheduler.schedule(new Uint8Array([0x90, 60, 1]), MEFXTime.finite(11n, 1));
    clock.invalidate();
    expect(stale.state).toBe("cancelled");
    const next = scheduler.schedule(new Uint8Array([0x90, 61, 1]), MEFXTime.finite(12n, 1));
    owner.abort(new DOMException("owner revoked", "AbortError"));
    expect(next.state).toBe("cancelled");
    clock.set(MEFXTime.finite(12n, 1));
    timers.advance(2_000);
    expect(send).not.toHaveBeenCalled();
    expect(() => scheduler.schedule(new Uint8Array([0x90, 62, 1]), MEFXTime.finite(13n, 1))).toThrow(expect.objectContaining({ name: "AbortError" }));
  });

  it("isolates shared clients and clears only an exclusive lease on teardown", () => {
    const port = { send: vi.fn(), clear: vi.fn() };
    const arbiter = new MIDIOutputArbiter(port);
    const a = arbiter.acquire("a");
    const b = arbiter.acquire("b");
    a.send(new Uint8Array([0x90, 60, 1]), 100);
    b.send(new Uint8Array([0x90, 62, 1]), 101);
    a.dispose();
    expect(port.clear).not.toHaveBeenCalled();
    b.send(new Uint8Array([0x80, 62, 0]), 102);
    b.dispose();
    expect(port.clear).not.toHaveBeenCalled();

    const exclusive = arbiter.acquire("solo", { exclusive: true });
    expect(() => arbiter.acquire("foreign")).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
    exclusive.dispose();
    expect(port.clear).toHaveBeenCalledTimes(1);
    arbiter.dispose();
  });

  it("reports send failures without corrupting later queued work", () => {
    const clock = clockHarness();
    const timers = timerHarness();
    let fail = true;
    const output = { endpoint: {} as any, send() { if (fail) { fail = false; throw new Error("port failed"); } }, dispose() {} };
    const scheduler = new MIFXScheduler({ clock: clock.clock, output, hostNowMilliseconds: timers.now, scheduleHostCallback: timers.schedule, cancelHostCallback: timers.cancel });
    const first = scheduler.schedule(new Uint8Array([0x90, 60, 1]), MEFXTime.finite(11n, 1));
    const second = scheduler.schedule(new Uint8Array([0x90, 61, 1]), MEFXTime.finite(12n, 1));
    clock.set(MEFXTime.finite(11n, 1)); timers.advance(1_000);
    expect(first.state).toBe("failed");
    expect(first.error).toBeInstanceOf(Error);
    clock.set(MEFXTime.finite(12n, 1)); timers.advance(1_000);
    expect(second.state).toBe("submitted");
    scheduler.dispose();
  });

  it("drives a deterministic AUFX synthesis specimen from scheduled MIDI note data", () => {
    const clock = clockHarness();
    const format = new AUFXAudioFormat(48_000, 1);
    const parser = new MIFXParser();
    let rendered: AUFXAudioPCMBuffer | null = null;
    const output = {
      endpoint: {} as any,
      send(data: Uint8Array) {
        const event = parser.push(data).find((entry) => entry.kind === "message");
        if (!event || event.kind !== "message" || event.message.kind !== "note-on") return;
        const frequency = 440 * 2 ** ((event.message.note - 69) / 12);
        const buffer = new AUFXAudioPCMBuffer(format, 480);
        buffer.frameLength = 480;
        for (let frame = 0; frame < buffer.frameLength; frame += 1) {
          buffer.setSample(0, frame, Math.sin(2 * Math.PI * frequency * frame / format.sampleRate) * (event.message.velocity / 127));
        }
        rendered = buffer;
      },
      dispose() {},
    };
    const scheduler = new MIFXScheduler({ clock: clock.clock, output });
    const send = scheduler.schedule(new Uint8Array([0x90, 69, 100]), MEFXTime.finite(10n, 1));
    expect(send.state).toBe("submitted");
    expect(rendered).not.toBeNull();
    let peak = 0;
    for (let frame = 0; frame < rendered!.frameLength; frame += 1) peak = Math.max(peak, Math.abs(rendered!.getSample(0, frame)));
    expect(peak).toBeGreaterThan(0.7);
    scheduler.dispose();
  });
});
