/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { DFXQueue } from "../../DFXQueue";
import type { DFXSource } from "../../DFXSource";
import type { DFXSourceMemoryPressureEvent } from "../../DFXSourceMemoryPressureEvent";
import { DFXWorkItem } from "../../DFXWorkItem";
import { DFXWorkItemFlags } from "../../DFXWorkItemFlags";
import { DFXQoS } from "../../DFXQoS";
import { objectChanged, objectState, queueChain, resolveQoS } from "../queueState";
import { rootScheduler } from "../rootScheduler";
import { checkedInteger, clientError } from "../time";
import { prepareWork } from "../work";
import { performWorkItem, workItemState } from "../workItemState";

type HandlerKind = "event" | "cancel" | "registration";
interface SourceState {
  queue: DFXQueue;
  handlers: Partial<Record<HandlerKind, DFXWorkItem>>;
  cancelled: boolean;
  cancelDelivered: boolean;
  registered: boolean;
  queued: boolean;
  replaceQueuedHandler?: (kind: HandlerKind) => void;
  pending: number;
  delivered: number;
  mask: number | readonly DFXSourceMemoryPressureEvent[];
  pressure: boolean;
  onActivate?: () => void;
  dispose?: () => void;
}
const states = new WeakMap<DFXSource, SourceState>();
export function initialiseSource(source: DFXSource): void {
  const object = objectState(source); object.active = false; object.initiallyInactive = true;
  states.set(source, { queue: DFXQueue.global(), handlers: {}, cancelled: false, cancelDelivered: false, registered: false, queued: false, pending: 0, delivered: 0, mask: 0, pressure: false });
}
export function sourceState(source: DFXSource): SourceState { const state = states.get(source); if (!state) clientError("invalid dispatch source"); return state; }
export function configureSource(source: DFXSource, queue?: DFXQueue | null): void {
  if (queue != null) { if (!(queue instanceof DFXQueue)) clientError("invalid source queue"); sourceState(source).queue = queue; }
}
export function setSourceHandler(source: DFXSource, kind: HandlerKind, optionsOrHandler: unknown, handler?: (() => unknown) | null): void {
  const state = sourceState(source);
  const execute = optionsOrHandler instanceof DFXWorkItem || typeof optionsOrHandler === "function" || optionsOrHandler === null ? optionsOrHandler : handler;
  if (execute === null) delete state.handlers[kind];
  else state.handlers[kind] = execute instanceof DFXWorkItem ? execute : new DFXWorkItem(typeof optionsOrHandler === "function" ? {} : optionsOrHandler as {}, execute as () => unknown);
  state.replaceQueuedHandler?.(kind);
  sourceChanged(source);
}
function captureHandler(item: DFXWorkItem | undefined, queue: DFXQueue) {
  const data = item ? workItemState(item) : undefined;
  return {
    item, data, prepared: data ? prepareWork(data.work, queue.label) : undefined,
    flags: [...data?.flags ?? []], assigned: data?.qos ?? DFXQoS.unspecified,
    captured: data?.creationQoS ?? DFXQoS.unspecified,
  };
}
export function sourceChanged(source: DFXSource): void {
  const state = sourceState(source); const object = objectState(source);
  if (!object.active || object.suspensionCount || state.queued) return;
  const kind: HandlerKind | undefined = state.cancelled ? state.cancelDelivered ? undefined : "cancel"
    : !state.registered ? "registration" : state.pending && state.handlers.event ? "event" : undefined;
  if (!kind) return;
  state.queued = true;
  const queue = state.queue;
  let invocation = captureHandler(state.handlers[kind], queue);
  const job = {
    queue, appId: null,
    get qos() { return resolveQoS(queueChain(queue), invocation.assigned, invocation.captured, invocation.flags); },
    get barrier() { return !objectState(queue).global && invocation.flags.includes(DFXWorkItemFlags.barrier); },
    resolveQoS: (chain: readonly DFXQueue[]) => resolveQoS(chain, invocation.assigned, invocation.captured, invocation.flags),
    run: () => {
      // Once execution starts, a setter affects the next invocation only.
      const active = invocation; state.replaceQueuedHandler = undefined;
      try {
        if (!object.active || object.suspensionCount) return;
        if (kind === "cancel") {
          if (state.cancelDelivered) return;
          state.cancelDelivered = true; state.pending = 0;
        } else {
          if (state.cancelled) return;
          if (kind === "registration") { state.registered = true; state.onActivate?.(); }
          else {
            if (!state.pending) return;
            state.delivered = state.pending; state.pending = 0;
          }
        }
        if (active.item) performWorkItem(active.item, active.prepared);
      } finally { active.data?.jobs.delete(job); state.delivered = 0; state.queued = false; sourceChanged(source); }
    },
  };
  state.replaceQueuedHandler = changedKind => {
    if (changedKind !== kind || state.handlers[kind] === invocation.item) return;
    // Replace the complete pending continuation, including its wait association.
    invocation.data?.jobs.delete(job);
    invocation = captureHandler(state.handlers[kind], queue);
    invocation.data?.jobs.add(job);
    objectChanged(source); // Reconsider host priority after a QoS replacement.
  };
  invocation.data?.jobs.add(job);
  try { rootScheduler.submit(job); }
  catch (error) { invocation.data?.jobs.delete(job); state.replaceQueuedHandler = undefined; state.queued = false; throw error; }
}
export function mergeSourceData(source: DFXSource, data: number, mode: "add" | "or" | "replace"): void {
  checkedInteger(data, "source data"); if (data < 0) clientError("source data must not be negative");
  const state = sourceState(source); if (state.cancelled) return;
  if (mode === "add") state.pending = checkedInteger(state.pending + data, "source data");
  else if (mode === "or") state.pending = Number(BigInt(state.pending) | BigInt(data));
  else state.pending = data;
  if (data !== 0) sourceChanged(source);
}
