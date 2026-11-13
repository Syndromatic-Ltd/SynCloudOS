/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { attributeDispatchClass } from "./internal/lifetime";
import { DFXObject } from "./DFXObject";
import { DFXGroup } from "./DFXGroup";
import { DFXQoS } from "./DFXQoS";
import { DFXQoSClass } from "./DFXQoSClass";
import { DFXQueueAttributes } from "./DFXQueueAttributes";
import { DFXQueueAutoreleaseFrequency } from "./DFXQueueAutoreleaseFrequency";
import type { DFXSpecificKey } from "./DFXSpecificKey";
import { DFXWorkItemFlags } from "./DFXWorkItemFlags";
import { DFXWorkItem } from "./DFXWorkItem";
import { DFXTime } from "./DFXTime";
import { DFXWallTime } from "./DFXWallTime";
import { currentExecution, withExecution } from "./internal/executionStack";
import { enterGroup, groupState, leaveGroup } from "./internal/groupState";
import { WorkerPool } from "./internal/pool/WorkerPool";
import { objectChanged, objectState, queueChain, resolveQoS } from "./internal/queueState";
import { rootScheduler } from "./internal/rootScheduler";
import { sendableMetadataOf, type SendableMetadata } from "./internal/sendable";
import { assertSyncAvailable } from "./internal/sync";
import { checkedInteger, clientError } from "./internal/time";
import { scheduleTimer } from "./internal/timerWheel";
import { executeSyncWork, executeWork, prepareWork, reportDispatchError, type DFXWork, type DFXIterationWork } from "./internal/work";
import { performWorkItem, workItemState } from "./internal/workItemState";

import { assertOwner, classForLifetime, onLifetimeEnd, selectLifetime, type DispatchLifetime } from "./internal/lifetime";
const dispatchWorkerChunksSymbol = Symbol.for("syncloudos.dfx.workerChunks");
const workerInFlightCounts = new WeakMap<DFXQueue, number>();
const workerActiveCounts = new WeakMap<DFXQueue, number>();
interface HeldWorkerQueue {
  readonly queue: DFXQueue;
  readonly exclusive: boolean;
}
const observedWorkerLifetimes = new WeakSet<DispatchLifetime>();
const caches = new WeakMap<DispatchLifetime, { main?: DFXQueue; globals: Map<DFXQoSClass, DFXQueue> }>();
function cache(lifetime: DispatchLifetime) {
  let value = caches.get(lifetime);
  if (!value) {
    value = { globals: new Map() };
    caches.set(lifetime, value);
  }
  return value;
}
function mainQueueForLifetime(Base: typeof DFXQueue, lifetime: DispatchLifetime): DFXQueue {
  const queues = cache(lifetime);
  if (!queues.main) {
    const Queue = classForLifetime(Base, lifetime);
    queues.main = new Queue("com.apple.main-thread", { qos: DFXQoS.userInteractive });
    objectState(queues.main).main = true;
  }
  return queues.main;
}
function resolveDispatchChunkURL(appId: string | null): string | undefined {
  if (!appId) return undefined;
  const registry = (globalThis as Record<symbol, Map<string, string> | undefined>)[dispatchWorkerChunksSymbol];
  return registry?.get(appId.toLowerCase()) ?? registry?.get(appId);
}
function resolveWorkerTarget(
  chain: readonly DFXQueue[],
  lifetime: DispatchLifetime,
  rawWork: () => unknown,
): { sendable: SendableMetadata; chunkURL: string } | undefined {
  if (typeof Worker !== "function" || chain.some(queue => objectState(queue).main)) return undefined;
  const sendable = sendableMetadataOf(rawWork);
  if (!sendable) return undefined;
  const chunkURL = resolveDispatchChunkURL(lifetime.appId);
  return chunkURL ? { sendable, chunkURL } : undefined;
}
function acquireWorkerInFlight(leaf: DFXQueue, chain: readonly DFXQueue[], barrier: boolean): HeldWorkerQueue[] {
  const held: HeldWorkerQueue[] = [];
  for (const queue of chain) {
    const state = objectState(queue);
    if (state.global) continue;
    const exclusive = !state.concurrent || (queue === leaf && barrier);
    workerActiveCounts.set(queue, (workerActiveCounts.get(queue) ?? 0) + 1);
    state.workerActiveInFlight = true;
    if (exclusive) {
      workerInFlightCounts.set(queue, (workerInFlightCounts.get(queue) ?? 0) + 1);
      state.workerInFlight = true;
    }
    held.push({ queue, exclusive });
  }
  return held;
}
function releaseWorkerInFlight(held: readonly HeldWorkerQueue[]): void {
  for (const { queue, exclusive } of held) {
    const state = objectState(queue);
    let changed = false;
    const active = workerActiveCounts.get(queue) ?? 0;
    if (active > 0) {
      if (active === 1) {
        workerActiveCounts.delete(queue);
        state.workerActiveInFlight = false;
        changed = true;
      } else {
        workerActiveCounts.set(queue, active - 1);
      }
    }
    if (exclusive) {
      const current = workerInFlightCounts.get(queue) ?? 0;
      if (current > 0) {
        if (current === 1) {
          workerInFlightCounts.delete(queue);
          state.workerInFlight = false;
          changed = true;
        } else {
          workerInFlightCounts.set(queue, current - 1);
        }
      }
    }
    if (changed) objectChanged(queue);
  }
}
function ensureAppWorkerCancellation(lifetime: DispatchLifetime): void {
  if (observedWorkerLifetimes.has(lifetime)) return;
  observedWorkerLifetimes.add(lifetime);
  onLifetimeEnd(lifetime, () => WorkerPool.shared.cancelApp(lifetime));
}
function submitScheduledAsync(params: {
  queue: DFXQueue;
  lifetime: DispatchLifetime;
  item: DFXWorkItem | undefined;
  group: DFXGroup | null | undefined;
  rawWork: () => unknown;
  prepared: () => void;
  assigned: DFXQoS;
  captured: DFXQoS;
  flags: readonly DFXWorkItemFlags[];
}): void {
  const { queue, lifetime, item, group, rawWork, prepared, assigned, captured, flags } = params;
  const groupData = group == null ? undefined : groupState(group);
  const itemData = item ? workItemState(item) : undefined;
  const savedFlags = [...flags];
  const initialChain = queueChain(queue);
  const barrier = !objectState(queue).global && savedFlags.includes(DFXWorkItemFlags.barrier);
  const workerTarget = resolveWorkerTarget(initialChain, lifetime, rawWork);
  const workerCaptures = workerTarget ? workerTarget.sendable.getCaptures() : undefined;
  const runInRealm = item ? () => performWorkItem(item, prepared) : prepared;
  const cleanupTracking = (targetJob: { queue: DFXQueue }, completeItem: boolean) => {
    itemData?.jobs.delete(targetJob as never);
    groupData?.jobs.delete(targetJob as never);
    if (group != null) leaveGroup(group, true);
    if (completeItem && item && !lifetime.ended) performWorkItem(item, () => {}, lifetime);
  };
  const job = {
    queue,
    qos: resolveQoS(initialChain, assigned, captured, savedFlags),
    appId: lifetime.appId,
    lifetime,
    barrier,
    resolveQoS: (chain: readonly DFXQueue[]) => resolveQoS(chain, assigned, captured, savedFlags),
    dropped: () => cleanupTracking(job, false),
    run: () => {
      if (!workerTarget) {
        try {
          runInRealm();
        } finally {
          cleanupTracking(job, false);
        }
        return;
      }
      if (itemData?.cancelled || lifetime.ended) {
        if (item && !lifetime.ended) performWorkItem(item, prepared);
        cleanupTracking(job, false);
        return;
      }
      ensureAppWorkerCancellation(lifetime);
      const activeChain = queueChain(queue);
      const held = acquireWorkerInFlight(queue, activeChain, barrier);
      const serialQueue =
        activeChain.find(entry => {
          const state = objectState(entry);
          return !state.global && !state.concurrent;
        }) ?? (barrier ? queue : null);
      let settled = false;
      const stopRelease = onLifetimeEnd(lifetime, () => {
        if (settled) return;
        settled = true;
        releaseWorkerInFlight(held);
        cleanupTracking(job, false);
      });
      const mainBase = queue.constructor as typeof DFXQueue;
      WorkerPool.shared.submit({
        appId: lifetime.appId,
        sessionKey: lifetime,
        closureId: workerTarget.sendable.id,
        chunkURL: workerTarget.chunkURL,
        captures: workerCaptures!,
        qos: resolveQoS(activeChain, assigned, captured, savedFlags),
        queueKey: serialQueue,
        onResult(_values, continuations) {
          if (settled) return;
          settled = true;
          stopRelease();
          releaseWorkerInFlight(held);
          if (lifetime.ended || itemData?.cancelled) {
            cleanupTracking(job, !lifetime.ended);
            return;
          }
          const contDefs = workerTarget.sendable.continuations;
          if (continuations?.length && contDefs?.length) {
            const mainQueue = mainQueueForLifetime(mainBase, lifetime);
            for (const cont of continuations) {
              const def = contDefs.find(candidate => candidate.id === cont.id);
              if (def) mainQueue.async(() => { if (!lifetime.ended && !itemData?.cancelled) def.fn(...cont.workerValues); });
            }
            mainQueue.async(() => cleanupTracking(job, true));
            return;
          }
          cleanupTracking(job, true);
        },
        onError(error) {
          if (settled) return;
          settled = true;
          stopRelease();
          releaseWorkerInFlight(held);
          const wrapped = new Error(`DispatchFX queue "${queue.label}": work item threw`, { cause: error });
          if (item && !lifetime.ended) {
            performWorkItem(item, () => reportDispatchError(wrapped), lifetime);
          } else if (!lifetime.ended && !itemData?.cancelled) {
            reportDispatchError(wrapped);
          }
          cleanupTracking(job, false);
        },
      });
    },
  };
  if (group != null) enterGroup(group, true);
  groupData?.jobs.add(job);
  itemData?.jobs.add(job);
  try {
    rootScheduler.submit(job);
  } catch (error) {
    itemData?.jobs.delete(job);
    groupData?.jobs.delete(job);
    if (group != null) leaveGroup(group, true);
    throw error;
  }
}
/** DispatchQueue. Tier 0 schedules synchronous items on the current realm. */
export class DFXQueue extends DFXObject {
  constructor(
    label: string,
    options: {
      qos?: DFXQoS;
      attributes?: DFXQueueAttributes[];
      autoreleaseFrequency?: DFXQueueAutoreleaseFrequency;
      target?: DFXQueue | null;
    } = {},
  ) {
    super();
    if (typeof label !== "string") clientError("queue label must be a string");
    const state = objectState(this);
    state.label = label;
    state.qos = options.qos ?? DFXQoS.unspecified;
    if (!(state.qos instanceof DFXQoS)) clientError("invalid queue QoS");
    const attributes = options.attributes ?? [];
    if (
      !Array.isArray(attributes) ||
      attributes.some(value => value !== DFXQueueAttributes.concurrent && value !== DFXQueueAttributes.initiallyInactive)
    )
      clientError("invalid queue attributes");
    if (options.autoreleaseFrequency !== undefined && !Object.values(DFXQueueAutoreleaseFrequency).includes(options.autoreleaseFrequency))
      clientError("invalid autorelease frequency");
    state.concurrent = attributes.includes(DFXQueueAttributes.concurrent);
    state.initiallyInactive = attributes.includes(DFXQueueAttributes.initiallyInactive);
    state.active = !state.initiallyInactive;
    if (options.target != null) {
      for (const target of queueChain(options.target)) assertOwner(target);
      state.target = options.target;
    }
  }
  get label(): string {
    return objectState(this).label;
  }
  get qos(): DFXQoS {
    return objectState(this).qos;
  }
  static get main(): DFXQueue {
    return mainQueueForLifetime(this, selectLifetime(this));
  }
  static global(qos: DFXQoSClass = DFXQoSClass.default): DFXQueue {
    if (!Object.values(DFXQoSClass).includes(qos)) clientError("invalid global queue QoS class");
    if (qos === DFXQoSClass.unspecified) qos = DFXQoSClass.default;
    const lifetime = selectLifetime(this),
      globals = cache(lifetime).globals;
    let queue = globals.get(qos);
    if (!queue) {
      const Queue = classForLifetime(this, lifetime);
      queue = new Queue(`com.apple.root.${qos}`, { qos: new DFXQoS(qos, 0), attributes: [DFXQueueAttributes.concurrent] });
      objectState(queue).global = true;
      globals.set(qos, queue);
    }
    return queue;
  }
  async<R>(work: DFXWork<R>): void;
  async<R>(options: { group?: DFXGroup | null; qos?: DFXQoS; flags?: DFXWorkItemFlags[] }, work: DFXWork<R>): void;
  async(item: DFXWorkItem): void;
  async(group: DFXGroup, item: DFXWorkItem): void;
  async<R>(
    optionsOrWork: DFXWorkItem | DFXGroup | DFXWork<R> | { group?: DFXGroup | null; qos?: DFXQoS; flags?: DFXWorkItemFlags[] },
    work?: DFXWorkItem | DFXWork<R>,
  ): void {
    const lifetime = assertOwner(this);
    const item =
      optionsOrWork instanceof DFXWorkItem
        ? optionsOrWork
        : optionsOrWork instanceof DFXGroup && work instanceof DFXWorkItem
          ? work
          : undefined;
    if (optionsOrWork instanceof DFXGroup && !item) clientError("group submission requires a dispatch work item");
    const options =
      item || typeof optionsOrWork === "function"
        ? {}
        : (optionsOrWork as { group?: DFXGroup | null; qos?: DFXQoS; flags?: DFXWorkItemFlags[] });
    const execute = typeof optionsOrWork === "function" ? optionsOrWork : work;
    if (!item && typeof execute !== "function") clientError("work must be a function");
    const group = optionsOrWork instanceof DFXGroup ? optionsOrWork : options.group;
    if (group != null) assertOwner(group);
    const groupData = group == null ? undefined : groupState(group);
    if (item) assertOwner(item);
    const itemData = item ? workItemState(item) : undefined;
    const assigned = itemData?.qos ?? options.qos ?? DFXQoS.unspecified;
    if (!(assigned instanceof DFXQoS)) clientError("invalid work item QoS");
    const flags = itemData?.flags ?? options.flags ?? [];
    if (!Array.isArray(flags) || flags.some(flag => !Object.values(DFXWorkItemFlags).includes(flag)))
      clientError("invalid work item flags");
    const savedFlags = [...flags];
    const captured = itemData?.creationQoS ?? currentExecution()?.qos ?? DFXQoS.unspecified;
    const rawWork = itemData?.work ?? (execute as () => unknown);
    const prepared = prepareWork(rawWork, this.label);
    submitScheduledAsync({
      queue: this,
      lifetime,
      item,
      group,
      rawWork,
      prepared,
      assigned,
      captured,
      flags,
    });
  }
  asyncAfter(deadline: DFXTime | DFXWallTime, execute: DFXWorkItem): void;
  asyncAfter<R>(deadline: DFXTime | DFXWallTime, execute: DFXWork<R>): void;
  asyncAfter<R>(deadline: DFXTime | DFXWallTime, options: { qos?: DFXQoS; flags?: DFXWorkItemFlags[] }, execute: DFXWork<R>): void;
  asyncAfter<R>(
    deadline: DFXTime | DFXWallTime,
    optionsOrWork: DFXWorkItem | DFXWork<R> | { qos?: DFXQoS; flags?: DFXWorkItemFlags[] },
    execute?: DFXWork<R>,
  ): void {
    const lifetime = assertOwner(this);
    const item =
      optionsOrWork instanceof DFXWorkItem
        ? optionsOrWork
        : typeof optionsOrWork === "function"
          ? new (classForLifetime(DFXWorkItem, lifetime))(optionsOrWork)
          : new (classForLifetime(DFXWorkItem, lifetime))(optionsOrWork, execute!);
    assertOwner(item);
    const state = workItemState(item);
    const flags = [...state.flags];
    const captured = state.creationQoS ?? currentExecution()?.qos ?? DFXQoS.unspecified;
    const prepared = prepareWork(state.work, this.label);
    let release: () => void = () => {};
    const cancel = scheduleTimer(deadline, 0, false, () => {
      release();
      if (lifetime.ended) return;
      submitScheduledAsync({
        queue: this,
        lifetime,
        item,
        group: undefined,
        rawWork: state.work,
        prepared,
        assigned: state.qos,
        captured,
        flags,
      });
    });
    release = onLifetimeEnd(lifetime, cancel);
  }
  sync(item: DFXWorkItem): void;
  sync<R>(work: DFXWork<R>): R;
  sync<R>(flags: DFXWorkItemFlags[], work: DFXWork<R>): R;
  sync<R>(flagsOrWork: DFXWorkItem | DFXWorkItemFlags[] | DFXWork<R>, work?: DFXWork<R>): R | void {
    const lifetime = assertOwner(this);
    const item = flagsOrWork instanceof DFXWorkItem ? flagsOrWork : undefined;
    if (item) assertOwner(item);
    const itemData = item ? workItemState(item) : undefined;
    const itemFlags = itemData?.flags ?? [];
    const flags = itemData
      ? itemFlags.some(flag => flag === DFXWorkItemFlags.inheritQoS || flag === DFXWorkItemFlags.enforceQoS)
        ? itemFlags
        : [...itemFlags, DFXWorkItemFlags.enforceQoS]
      : typeof flagsOrWork === "function"
        ? []
        : (flagsOrWork as DFXWorkItemFlags[]);
    const execute = typeof flagsOrWork === "function" ? flagsOrWork : work;
    if (!item && typeof execute !== "function") clientError("work must be a function");
    if (!Array.isArray(flags) || flags.some(flag => !Object.values(DFXWorkItemFlags).includes(flag)))
      clientError("invalid work item flags");
    const chain = queueChain(this);
    const barrier = !objectState(this).global && flags.includes(DFXWorkItemFlags.barrier);
    assertSyncAvailable(chain);
    const callerQoS = currentExecution()?.qos ?? DFXQoS.unspecified;
    const captured = itemData?.creationQoS ?? callerQoS;
    const assigned = itemData?.qos ?? DFXQoS.unspecified;
    const prepared = itemData ? prepareWork(itemData.work, this.label) : undefined;
    let result: R;
    let executed = false;
    const job = {
      queue: this,
      qos: resolveQoS(chain, assigned, captured, flags),
      appId: lifetime.appId,
      lifetime,
      barrier,
      resolveQoS: (targets: readonly DFXQueue[]) => resolveQoS(targets, assigned, captured, flags),
      run: () => {
        executed = true;
        if (item) performWorkItem(item, prepared);
        else result = executeSyncWork(execute!, this.label);
      },
    };
    const restore = rootScheduler.override(this, callerQoS);
    try {
      itemData?.jobs.add(job);
      rootScheduler.submit(job);
      rootScheduler.drainInRealm(this, job);
      if (!executed) for (const target of chain) assertOwner(target);
      return result!;
    } finally {
      itemData?.jobs.delete(job);
      restore();
    }
  }
  setSpecific<T>(key: DFXSpecificKey<T>, value: T | undefined): void {
    assertOwner(this);
    const state = objectState(this);
    if (state.global) return;
    if (value === undefined) state.specifics.delete(key);
    else state.specifics.set(key, value);
  }
  getSpecific<T>(key: DFXSpecificKey<T>): T | undefined {
    assertOwner(this);
    return objectState(this).specifics.get(key) as T | undefined;
  }
  static getSpecific<T>(key: DFXSpecificKey<T>): T | undefined {
    for (const queue of currentExecution()?.chain ?? []) {
      const state = objectState(queue);
      if (state.specifics.has(key)) return state.specifics.get(key) as T;
    }
    return undefined;
  }
  static concurrentPerform<R>(iterations: number, execute: DFXIterationWork<R>): void {
    const lifetime = selectLifetime(this);
    checkedInteger(iterations, "iterations");
    if (iterations < 0) clientError("iterations must not be negative");
    if (typeof execute !== "function") clientError("work must be a function");
    const current = currentExecution();
    withExecution(
      { chain: current?.chain ?? [], qos: current?.qos ?? DFXQoS.unspecified, barrier: current?.barrier ?? false, appId: lifetime.appId },
      () => {
        for (let index = 0; index < iterations && !lifetime.ended; index++) executeWork(() => execute(index), "concurrentPerform");
      },
    );
  }
}

attributeDispatchClass(DFXQueue);
