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
import { createHeavyJobAdmission } from "../../src/SynCloudOS/Operations/HeavyJobAdmission";

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("heavy job admission", () => {
  it("admits synchronously while capacity remains and queues beyond it", async () => {
    const admission = createHeavyJobAdmission({ concurrency: 2, maximumBytes: 100 });
    const first = admission.tryAdmit({ owner: "a", kind: "image" });
    const second = admission.tryAdmit({ owner: "a", kind: "image" });
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(admission.tryAdmit({ owner: "a", kind: "image" })).toBeNull();
    let admitted = false;
    const third = admission.admit({ owner: "a", kind: "image" }).then((lease) => { admitted = true; return lease; });
    await flush();
    expect(admitted).toBe(false);
    first!.release();
    first!.release();
    const lease = await third;
    expect(admission.snapshot()).toMatchObject({ active: 2, queued: 0 });
    second!.release();
    lease.release();
    expect(admission.snapshot()).toMatchObject({ active: 0, activeBytes: 0 });
  });

  it("keeps byte charges until release and rejects a job larger than the whole budget", async () => {
    const admission = createHeavyJobAdmission({ concurrency: 4, maximumBytes: 100 });
    const big = admission.tryAdmit({ owner: "a", kind: "image", bytes: 80 })!;
    expect(admission.tryAdmit({ owner: "a", kind: "image", bytes: 30 })).toBeNull();
    await expect(admission.admit({ owner: "a", kind: "image", bytes: 101 })).rejects.toMatchObject({ name: "QuotaExceededError" });
    const waiting = admission.admit({ owner: "a", kind: "image", bytes: 30 });
    expect(admission.snapshot()).toMatchObject({ activeBytes: 80, queued: 1 });
    big.release();
    const lease = await waiting;
    expect(admission.snapshot()).toMatchObject({ activeBytes: 30 });
    lease.release();
  });

  it("orders by priority and shares capacity fairly between owners", async () => {
    const admission = createHeavyJobAdmission({ concurrency: 1, maximumBytes: 1000 });
    const holder = admission.tryAdmit({ owner: "x", kind: "hold" })!;
    const order: string[] = [];
    const track = (label: string, request: Parameters<typeof admission.admit>[0]) =>
      admission.admit(request).then((lease) => { order.push(label); lease.release(); });
    const jobs = [
      track("a1-background", { owner: "a", kind: "index", priority: "background" }),
      track("a2", { owner: "a", kind: "image" }),
      track("a3", { owner: "a", kind: "image" }),
      track("b1", { owner: "b", kind: "image" }),
      track("urgent", { owner: "c", kind: "image", priority: "user-blocking" }),
    ];
    holder.release();
    await Promise.all(jobs);
    expect(order).toEqual(["urgent", "a2", "b1", "a3", "a1-background"]);
  });

  it("supersedes a queued job with the same key and never admits it", async () => {
    const admission = createHeavyJobAdmission({ concurrency: 1, maximumBytes: 1000 });
    const holder = admission.tryAdmit({ owner: "a", kind: "image" })!;
    const stale = admission.admit({ owner: "a", kind: "preview", supersedeKey: "canvas" });
    const current = admission.admit({ owner: "a", kind: "preview", supersedeKey: "canvas" });
    await expect(stale).rejects.toMatchObject({ name: "AbortError" });
    holder.release();
    (await current).release();
    expect(admission.snapshot()).toMatchObject({ superseded: 1, active: 0, queued: 0 });
  });

  it("removes a queued job when its signal aborts and rejects already-aborted requests", async () => {
    const admission = createHeavyJobAdmission({ concurrency: 1, maximumBytes: 1000 });
    const holder = admission.tryAdmit({ owner: "a", kind: "image" })!;
    const controller = new AbortController();
    const queued = admission.admit({ owner: "a", kind: "image", signal: controller.signal });
    controller.abort(new DOMException("gone", "AbortError"));
    await expect(queued).rejects.toMatchObject({ message: "gone" });
    expect(admission.snapshot().queued).toBe(0);
    const aborted = new AbortController();
    aborted.abort(new DOMException("already", "AbortError"));
    await expect(admission.admit({ owner: "a", kind: "image", signal: aborted.signal })).rejects.toMatchObject({ message: "already" });
    expect(admission.tryAdmit({ owner: "a", kind: "image", signal: aborted.signal })).toBeNull();
    holder.release();
  });

  it("bounds the queue and applies a capacity change to waiting jobs", async () => {
    const admission = createHeavyJobAdmission({ concurrency: 1, maximumBytes: 1000, maximumQueued: 2 });
    const holder = admission.tryAdmit({ owner: "a", kind: "image" })!;
    const one = admission.admit({ owner: "a", kind: "image" });
    const two = admission.admit({ owner: "a", kind: "image" });
    await expect(admission.admit({ owner: "a", kind: "image" })).rejects.toMatchObject({ name: "QuotaExceededError" });
    admission.setCapacity({ concurrency: 3 });
    const [first, second] = await Promise.all([one, two]);
    expect(admission.snapshot()).toMatchObject({ active: 3, concurrency: 3 });
    first.release(); second.release(); holder.release();
  });

  it("rejects waiting jobs on dispose and refuses new ones", async () => {
    const admission = createHeavyJobAdmission({ concurrency: 1, maximumBytes: 1000 });
    admission.tryAdmit({ owner: "a", kind: "image" });
    const waiting = admission.admit({ owner: "a", kind: "image" });
    admission.dispose(new DOMException("runtime disposed", "AbortError"));
    await expect(waiting).rejects.toMatchObject({ message: "runtime disposed" });
    await expect(admission.admit({ owner: "a", kind: "image" })).rejects.toMatchObject({ name: "AbortError" });
  });
});
