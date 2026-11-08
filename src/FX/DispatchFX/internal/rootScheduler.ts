/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { createBrowserHostYield } from "../../../Foundation/internal/browserHostYield";
import type { DFXQueue } from "../DFXQueue";
import type { DFXQoS } from "../DFXQoS";
import { DFXQoSClass } from "../DFXQoSClass";
import { compareQoS, objectState, observeObjectChanges, queueChain } from "./queueState";
import { isExecuting, withExecution } from "./executionStack";
import { labelChain } from "./sync";
import { clientError } from "./time";
import { reportDispatchError } from "./work";

export interface ScheduledJob {
  readonly queue: DFXQueue;
  readonly qos: DFXQoS;
  run(): void;
  readonly appId: string | null;
  readonly barrier?: boolean;
  /** Re-evaluate the floor if an inactive object's target is configured. */
  readonly resolveQoS?: (chain: readonly DFXQueue[]) => DFXQoS;
}
interface Entry { readonly job: ScheduledJob; chain: DFXQueue[]; }
type Priority = "user-blocking" | "user-visible" | "background";
interface TaskScheduler {
  postTask?: (callback: () => void, options: { priority: Priority }) => Promise<unknown>;
  yield?: () => Promise<void>;
}
const pending: Entry[] = [];
const overrides = new Map<DFXQueue, Map<object, DFXQoS>>();
let draining = false;
let ticket = 0;
let scheduled: { token: number; rank: number } | undefined;
const signal = new AbortController().signal;
const hostScheduler = () => (globalThis as typeof globalThis & { scheduler?: TaskScheduler }).scheduler;
function priority(qos: DFXQoS): Priority {
  return qos.qosClass === DFXQoSClass.userInteractive || qos.qosClass === DFXQoSClass.userInitiated ? "user-blocking"
    : qos.qosClass === DFXQoSClass.utility || qos.qosClass === DFXQoSClass.background ? "background" : "user-visible";
}
function hostRank(value: Priority): number { return value === "user-blocking" ? 2 : value === "user-visible" ? 1 : 0; }
function higher(left: DFXQoS, right: DFXQoS): DFXQoS { return compareQoS(left, right) >= 0 ? left : right; }
function qos(entry: Entry): DFXQoS {
  let value = entry.job.resolveQoS?.(entry.chain) ?? entry.job.qos;
  for (const queue of entry.chain) for (const override of overrides.get(queue)?.values() ?? []) value = higher(value, override);
  return value;
}
/** The same dependency graph serves host scheduling and synchronous draining. */
function next(upTo?: Entry): Entry | undefined {
  const ready: Entry[] = [];
  const dependencies = new Map<Entry, Set<Entry>>();
  const leaves = new Map<DFXQueue, Entry>();
  const serials = new Map<DFXQueue, Entry>();
  const earlierChains = new Map<DFXQueue, Set<Entry>>();
  const barriers = new Map<DFXQueue, Entry>();
  // One pass identifies the eligible head of each QoS lane. Do not rescan
  // every preceding item for every candidate. A suspended child has not
  // reached its target and cannot hold up independent work on that target.
  for (const entry of pending) {
    const blockers = new Set<Entry>(); dependencies.set(entry, blockers);
    const leafHead = leaves.get(entry.job.queue);
    if (leafHead) blockers.add(leafHead); else leaves.set(entry.job.queue, entry);
    if (entry.chain.some(queue => { const state = objectState(queue); return !state.active || state.suspensionCount > 0; })) {
      if (entry === upTo) break;
      continue;
    }
    const serialChain = entry.chain.filter(queue => { const state = objectState(queue); return !state.global && !state.concurrent; });
    for (const queue of serialChain) { const earlier = serials.get(queue); if (earlier) blockers.add(earlier); }
    for (const queue of entry.chain) { const barrier = barriers.get(queue); if (barrier) blockers.add(barrier); }
    if (entry.job.barrier) for (const earlier of earlierChains.get(entry.job.queue) ?? []) blockers.add(earlier);
    // Only a leaf head can reach and reserve its target chain. Its pending
    // barrier still gates later descendants of that barrier's own queue.
    if (!leafHead) {
      for (const queue of serialChain) if (!serials.has(queue)) serials.set(queue, entry);
      for (const queue of entry.chain) {
        let earlier = earlierChains.get(queue);
        if (!earlier) { earlier = new Set(); earlierChains.set(queue, earlier); }
        earlier.add(entry);
      }
    }
    if (entry.job.barrier && !barriers.has(entry.job.queue)) barriers.set(entry.job.queue, entry);
    const held = isExecuting(entry.job.queue) || entry.chain.some(queue => isExecuting(queue, true) || objectState(queue).workerInFlight)
      || (entry.job.barrier && isExecuting(entry.job.queue));
    if (blockers.size === 0 && !held) ready.push(entry);
    if (entry === upTo) break;
  }
  let required: Set<Entry> | undefined;
  if (upTo) {
    required = new Set([upTo]);
    const visit = [upTo];
    for (let entry = visit.pop(); entry; entry = visit.pop()) for (const predecessor of dependencies.get(entry) ?? []) {
      if (!required.has(predecessor)) { required.add(predecessor); visit.push(predecessor); }
    }
  }
  let selected: Entry | undefined;
  for (const entry of ready) if ((!required || required.has(entry)) && (!selected || compareQoS(qos(entry), qos(selected)) > 0)) selected = entry;
  return selected;
}
function run(entry: Entry, floor?: DFXQoS): void {
  pending.splice(pending.indexOf(entry), 1);
  const effectiveQoS = floor ? higher(qos(entry), floor) : qos(entry);
  withExecution({ chain: entry.chain, qos: effectiveQoS, barrier: !!entry.job.barrier, appId: entry.job.appId }, () => entry.job.run());
}
function freshTask(callback: () => void, value: Priority): void {
  const scheduler = hostScheduler();
  if (typeof scheduler?.postTask === "function") {
    try {
      void scheduler.postTask(callback, { priority: value }).catch(error => {
        reportDispatchError(error);
        globalThis.setTimeout(callback, 0);
      });
    } catch (error) { reportDispatchError(error); globalThis.setTimeout(callback, 0); }
  } else if (value === "background") globalThis.setTimeout(callback, 0);
  else void createBrowserHostYield({ MessageChannel: globalThis.MessageChannel, setTimeout: (run, delay) => globalThis.setTimeout(run, delay) })(signal).then(callback, reportDispatchError);
}
function schedule(entry: Entry, continuation: boolean): void {
  const value = priority(qos(entry));
  const rank = hostRank(value);
  if (scheduled && scheduled.rank >= rank) return;
  const token = ++ticket;
  scheduled = { token, rank };
  const run = () => { if (scheduled?.token !== token) return; scheduled = undefined; drain(); };
  if (continuation) {
    const scheduler = hostScheduler();
    void createBrowserHostYield({ scheduler, MessageChannel: globalThis.MessageChannel, setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay) })(signal).then(run, error => {
      reportDispatchError(error); freshTask(run, value);
    });
  } else freshTask(run, value);
}
function wake(): void { if (!draining) { const entry = next(); if (entry) schedule(entry, false); } }
function drain(): void {
  if (draining) return;
  draining = true;
  const started = performance.now();
  let previousInteractive = false;
  let lastPriority: Priority | undefined;
  try {
    for (let entry = next(); entry; entry = next()) {
      const effectiveQoS = qos(entry);
      const interactive = effectiveQoS.qosClass === DFXQoSClass.userInteractive;
      if (performance.now() - started >= 5 && !(previousInteractive && interactive)) {
        // A higher host priority gets a new postTask rather than inheriting
        // the current background task's scheduler.yield continuation priority.
        schedule(entry, lastPriority === undefined || hostRank(priority(effectiveQoS)) <= hostRank(lastPriority));
        return;
      }
      try { run(entry); } catch (error) { reportDispatchError(error); }
      previousInteractive = interactive;
      lastPriority = priority(effectiveQoS);
    }
  } finally { draining = false; }
}
export const rootScheduler = Object.freeze({
  submit(job: ScheduledJob): void { pending.push({ job, chain: queueChain(job.queue) }); wake(); },
  /** Return an idempotent release function; nested waiters retain their boosts. */
  override(queue: DFXQueue, value: DFXQoS): () => void {
    let values = overrides.get(queue);
    if (!values) { values = new Map(); overrides.set(queue, values); }
    // A distinct token lets nested equal-QoS overrides release independently.
    const token = {}; let released = false;
    values.set(token, value);
    return () => { if (released) return; released = true; values.delete(token); if (values.size === 0) overrides.delete(queue); };
  },
  drainInRealm(queue: DFXQueue, upTo?: ScheduledJob): void {
    let limit = upTo ? pending.find(entry => entry.job === upTo) : undefined;
    if (!upTo) for (let index = pending.length - 1; index >= 0; index--) {
      if (pending[index].job.queue === queue) { limit = pending[index]; break; }
    }
    if (!limit) return;
    const wasDraining = draining; draining = true;
    try {
      while (pending.includes(limit)) {
        const entry = next(limit);
        if (!entry) clientError(`dispatch_sync cannot synchronously drain pending queue chain: ${labelChain(limit.chain)}`);
        try { run(entry, qos(limit)); }
        catch (error) { if (entry === limit && upTo) throw error; reportDispatchError(error); }
      }
    } finally {
      // A failed sync block must never be delivered later by its host task.
      if (upTo) { const index = pending.indexOf(limit); if (index >= 0) pending.splice(index, 1); }
      draining = wasDraining; wake();
    }
  },
});
observeObjectChanges((object, retarget) => {
  if (retarget) for (const entry of pending) {
    const index = entry.chain.indexOf(object as DFXQueue);
    // Earlier active queues retain their associated prefix even if their
    // current configuration has changed since this item was submitted.
    if (index >= 0) entry.chain = entry.chain.slice(0, index).concat(queueChain(entry.chain[index]));
  }
  wake();
});
