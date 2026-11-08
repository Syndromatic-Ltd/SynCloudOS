/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { DFXObject } from "./DFXObject";
import { DFXQoS } from "./DFXQoS";
import { DFXQoSClass } from "./DFXQoSClass";
import { DFXQueueAttributes } from "./DFXQueueAttributes";
import { DFXQueueAutoreleaseFrequency } from "./DFXQueueAutoreleaseFrequency";
import type { DFXSpecificKey } from "./DFXSpecificKey";
import { DFXWorkItemFlags } from "./DFXWorkItemFlags";
import { currentExecution } from "./internal/executionStack";
import { objectState, queueChain, resolveQoS } from "./internal/queueState";
import { rootScheduler } from "./internal/rootScheduler";
import { checkedInteger, clientError } from "./internal/time";
import { executeWork, prepareWork, type DFXWork, type DFXIterationWork } from "./internal/work";

let main: DFXQueue | undefined;
const globals = new Map<DFXQoSClass, DFXQueue>();
/** DispatchQueue. Tier 0 schedules synchronous items on the current realm. */
export class DFXQueue extends DFXObject {
  constructor(label: string, options: {
    qos?: DFXQoS; attributes?: DFXQueueAttributes[];
    autoreleaseFrequency?: DFXQueueAutoreleaseFrequency; target?: DFXQueue;
  } = {}) {
    super();
    if (typeof label !== "string") clientError("queue label must be a string");
    const state = objectState(this);
    state.label = label;
    state.qos = options.qos ?? DFXQoS.unspecified;
    if (!(state.qos instanceof DFXQoS)) clientError("invalid queue QoS");
    const attributes = options.attributes ?? [];
    if (!Array.isArray(attributes) || attributes.some(value => value !== DFXQueueAttributes.concurrent && value !== DFXQueueAttributes.initiallyInactive)) clientError("invalid queue attributes");
    if (options.autoreleaseFrequency !== undefined && !Object.values(DFXQueueAutoreleaseFrequency).includes(options.autoreleaseFrequency)) clientError("invalid autorelease frequency");
    state.concurrent = attributes.includes(DFXQueueAttributes.concurrent);
    state.initiallyInactive = attributes.includes(DFXQueueAttributes.initiallyInactive);
    state.active = !state.initiallyInactive;
    if (options.target !== undefined) { objectState(options.target); state.target = options.target; }
  }
  get label(): string { return objectState(this).label; }
  get qos(): DFXQoS { return objectState(this).qos; }
  static get main(): DFXQueue {
    if (!main) { main = new DFXQueue("com.apple.main-thread", { qos: DFXQoS.userInteractive }); objectState(main).main = true; }
    return main;
  }
  static global(qos: DFXQoSClass = DFXQoSClass.default): DFXQueue {
    if (!Object.values(DFXQoSClass).includes(qos)) clientError("invalid global queue QoS class");
    if (qos === DFXQoSClass.unspecified) qos = DFXQoSClass.default;
    let queue = globals.get(qos);
    if (!queue) {
      queue = new DFXQueue(`com.apple.root.${qos}`, { qos: new DFXQoS(qos, 0), attributes: [DFXQueueAttributes.concurrent] });
      objectState(queue).global = true; globals.set(qos, queue);
    }
    return queue;
  }
  async<R>(work: DFXWork<R>): void;
  async<R>(options: { qos?: DFXQoS; flags?: DFXWorkItemFlags[] }, work: DFXWork<R>): void;
  async<R>(optionsOrWork: DFXWork<R> | { qos?: DFXQoS; flags?: DFXWorkItemFlags[] }, work?: DFXWork<R>): void {
    const options = typeof optionsOrWork === "function" ? {} : optionsOrWork;
    const execute = typeof optionsOrWork === "function" ? optionsOrWork : work;
    if (typeof execute !== "function") clientError("work must be a function");
    const assigned = options.qos ?? DFXQoS.unspecified;
    if (!(assigned instanceof DFXQoS)) clientError("invalid work item QoS");
    const flags = [...(options.flags ?? [])];
    if (flags.some(flag => !Object.values(DFXWorkItemFlags).includes(flag))) clientError("invalid work item flags");
    const captured = currentExecution()?.qos ?? DFXQoS.unspecified;
    rootScheduler.submit({
      queue: this, qos: resolveQoS(queueChain(this), assigned, captured, flags), appId: null,
      barrier: !objectState(this).global && flags.includes(DFXWorkItemFlags.barrier),
      resolveQoS: chain => resolveQoS(chain, assigned, captured, flags),
      run: prepareWork(execute, this.label),
    });
  }
  setSpecific<T>(key: DFXSpecificKey<T>, value: T | undefined): void {
    const state = objectState(this);
    if (state.global) return;
    if (value === undefined) state.specifics.delete(key); else state.specifics.set(key, value);
  }
  getSpecific<T>(key: DFXSpecificKey<T>): T | undefined { return objectState(this).specifics.get(key) as T | undefined; }
  static getSpecific<T>(key: DFXSpecificKey<T>): T | undefined {
    for (const queue of currentExecution()?.chain ?? []) {
      const state = objectState(queue);
      if (state.specifics.has(key)) return state.specifics.get(key) as T;
    }
    return undefined;
  }
  static concurrentPerform<R>(iterations: number, execute: DFXIterationWork<R>): void {
    checkedInteger(iterations, "iterations");
    if (iterations < 0) clientError("iterations must not be negative");
    if (typeof execute !== "function") clientError("work must be a function");
    for (let index = 0; index < iterations; index++) executeWork(() => execute(index), "concurrentPerform");
  }
}
