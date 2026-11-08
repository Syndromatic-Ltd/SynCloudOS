/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { DFXQueue } from "./DFXQueue";
import { DFXQoS } from "./DFXQoS";
import type { DFXTime } from "./DFXTime";
import type { DFXWallTime } from "./DFXWallTime";
import type { DFXTimeoutResult } from "./DFXTimeoutResult";
import { DFXWorkItemFlags } from "./DFXWorkItemFlags";
import { mainThreadWait } from "./internal/blockingRules";
import { currentExecution, withExecution } from "./internal/executionStack";
import { notification } from "./internal/notification";
import { compareQoS } from "./internal/queueState";
import { rootScheduler } from "./internal/rootScheduler";
import type { DFXWork } from "./internal/work";
import { initialiseWorkItem, performWorkItem, workItemState } from "./internal/workItemState";

/** DispatchWorkItem. R is inferred solely to reject synchronous-work thenables. */
export class DFXWorkItem<R = unknown> {
  constructor(block: DFXWork<R>);
  constructor(options: { qos?: DFXQoS; flags?: DFXWorkItemFlags[] }, block: DFXWork<R>);
  constructor(optionsOrBlock: DFXWork<R> | { qos?: DFXQoS; flags?: DFXWorkItemFlags[] }, block?: DFXWork<R>) {
    initialiseWorkItem(this, typeof optionsOrBlock === "function" ? {} : optionsOrBlock, (typeof optionsOrBlock === "function" ? optionsOrBlock : block)!);
  }
  perform(): void {
    const state = workItemState(this); const current = currentExecution();
    const inherited = current?.qos ?? DFXQoS.unspecified;
    const assigned = state.qos.qosClass !== DFXQoS.unspecified.qosClass ? state.qos
      : state.flags.includes(DFXWorkItemFlags.noQoS) || state.flags.includes(DFXWorkItemFlags.detached) ? DFXQoS.unspecified : state.creationQoS ?? inherited;
    const qos = compareQoS(assigned, inherited) > 0 ? assigned : inherited;
    withExecution({ chain: current?.chain ?? [], qos, barrier: current?.barrier ?? false, appId: current?.appId ?? null }, () => performWorkItem(this));
  }
  wait(): void;
  wait(timeout: DFXTime | DFXWallTime): DFXTimeoutResult;
  wait(timeout?: DFXTime | DFXWallTime): void | DFXTimeoutResult {
    const state = workItemState(this);
    const result = mainThreadWait(() => state.complete || rootScheduler.drainJobs(() => state.jobs, () => state.complete), timeout);
    if (timeout !== undefined) return result;
  }
  notify(queue: DFXQueue, execute: DFXWorkItem): void;
  notify<T>(queue: DFXQueue, execute: DFXWork<T>): void;
  notify<T>(queue: DFXQueue, options: { qos?: DFXQoS; flags?: DFXWorkItemFlags[] }, execute: DFXWork<T>): void;
  notify<T>(queue: DFXQueue, optionsOrWork: DFXWorkItem | DFXWork<T> | { qos?: DFXQoS; flags?: DFXWorkItemFlags[] }, execute?: DFXWork<T>): void {
    const notify = notification(queue, optionsOrWork, execute); const state = workItemState(this);
    if (state.complete) notify(); else state.notifications.push(notify);
  }
  cancel(): void { workItemState(this).cancelled = true; }
  get isCancelled(): boolean { return workItemState(this).cancelled; }
}
