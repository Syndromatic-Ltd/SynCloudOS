/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { attributeDispatchClass } from "./internal/lifetime";
import { assertOwner } from "./internal/lifetime";
import { DFXObject } from "./DFXObject";
import type { DFXQueue } from "./DFXQueue";
import type { DFXQoS } from "./DFXQoS";
import type { DFXTime } from "./DFXTime";
import type { DFXWallTime } from "./DFXWallTime";
import type { DFXTimeoutResult } from "./DFXTimeoutResult";
import type { DFXWorkItem } from "./DFXWorkItem";
import type { DFXWorkItemFlags } from "./DFXWorkItemFlags";
import { mainThreadWait } from "./internal/blockingRules";
import { enterGroup, groupState, initialiseGroup, leaveGroup } from "./internal/groupState";
import { notification } from "./internal/notification";
import { rootScheduler } from "./internal/rootScheduler";
import type { DFXWork } from "./internal/work";

/** DispatchGroup. Both manual entries and queue submissions share one count. */
export class DFXGroup extends DFXObject {
  constructor() { super(); initialiseGroup(this); }
  enter(): void { enterGroup(this); }
  leave(): void { leaveGroup(this); }
  notify(queue: DFXQueue, work: DFXWorkItem): void;
  notify<R>(queue: DFXQueue, work: DFXWork<R>): void;
  notify<R>(queue: DFXQueue, options: { qos?: DFXQoS; flags?: DFXWorkItemFlags[] }, work: DFXWork<R>): void;
  notify<R>(queue: DFXQueue, optionsOrWork: DFXWorkItem | DFXWork<R> | { qos?: DFXQoS; flags?: DFXWorkItemFlags[] }, work?: DFXWork<R>): void {
    assertOwner(this);
    const notify = notification(queue, optionsOrWork, work); const state = groupState(this);
    if (state.count === 0) notify(); else state.notifications.push(notify);
  }
  wait(): void;
  wait(timeout: DFXTime | DFXWallTime): DFXTimeoutResult;
  wait(timeout?: DFXTime | DFXWallTime): void | DFXTimeoutResult {
    assertOwner(this);
    const state = groupState(this);
    const result = mainThreadWait(() => state.count === 0 || rootScheduler.drainJobs(() => state.jobs, () => state.count === 0, true), timeout);
    if (timeout !== undefined) return result;
  }
}

attributeDispatchClass(DFXGroup);
