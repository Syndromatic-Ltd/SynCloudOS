/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { createBrowserHostYield } from "../../../Foundation/internal/browserHostYield";
import type { DFXQueue } from "../DFXQueue";
import type { DFXQoS } from "../DFXQoS";
import { DFXQoSClass } from "../DFXQoSClass";
import { compareQoS, objectState, observeObjectChanges, queueChain } from "./queueState";
import { withExecution } from "./executionStack";
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
function qos(entry: Entry): DFXQoS { return entry.job.resolveQoS?.(entry.chain) ?? entry.job.qos; }
function next(): Entry | undefined {
  let selected: Entry | undefined;
  const leaves = new Set<DFXQueue>();
  const serials = new Set<DFXQueue>();
  const earlierChains = new Set<DFXQueue>();
  const barriers = new Set<DFXQueue>();
  // One pass identifies the eligible head of each QoS lane. Do not rescan
  // every preceding item for every candidate. A suspended child has not
  // reached its target and cannot hold up independent work on that target.
  for (const entry of pending) {
    const leafBlocked = leaves.has(entry.job.queue);
    leaves.add(entry.job.queue);
    if (entry.chain.some(queue => { const state = objectState(queue); return !state.active || state.suspensionCount > 0; })) continue;
    const serialChain = entry.chain.filter(queue => { const state = objectState(queue); return !state.global && !state.concurrent; });
    const blocked = leafBlocked || serialChain.some(queue => serials.has(queue))
      || entry.chain.some(queue => barriers.has(queue)) || (entry.job.barrier && earlierChains.has(entry.job.queue));
    // Only a leaf head can reach and reserve its target chain. Its pending
    // barrier still gates later descendants of that barrier's own queue.
    if (!leafBlocked) {
      for (const queue of serialChain) serials.add(queue);
      for (const queue of entry.chain) earlierChains.add(queue);
    }
    if (entry.job.barrier) barriers.add(entry.job.queue);
    if (!blocked && (!selected || compareQoS(qos(entry), qos(selected)) > 0)) selected = entry;
  }
  return selected;
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
      pending.splice(pending.indexOf(entry), 1);
      try {
        withExecution({ chain: entry.chain, qos: effectiveQoS, barrier: !!entry.job.barrier, appId: entry.job.appId }, () => entry.job.run());
      } catch (error) { reportDispatchError(error); }
      previousInteractive = interactive;
      lastPriority = priority(effectiveQoS);
    }
  } finally { draining = false; }
}
export const rootScheduler = Object.freeze({
  submit(job: ScheduledJob): void { pending.push({ job, chain: queueChain(job.queue) }); wake(); },
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
