/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { attributeDispatchClass } from "./internal/lifetime";
import { lifetimeOf } from "./internal/lifetime";
import { queueClassForLifetime } from "./internal/sessionBinding";
import { DFXObject } from "./DFXObject";
import { DFXQueue } from "./DFXQueue";
import type { DFXQoS } from "./DFXQoS";
import type { DFXSourceProtocol } from "./DFXSourceProtocol";
import type { DFXSourceTimer } from "./DFXSourceTimer";
import type { DFXSourceTimerFlags } from "./DFXSourceTimerFlags";
import type { DFXSourceUserDataAdd } from "./DFXSourceUserDataAdd";
import type { DFXSourceUserDataOr } from "./DFXSourceUserDataOr";
import type { DFXSourceUserDataReplace } from "./DFXSourceUserDataReplace";
import type { DFXSourceMemoryPressure } from "./DFXSourceMemoryPressure";
import type { DFXSourceMemoryPressureEvent } from "./DFXSourceMemoryPressureEvent";
import type { DFXWorkItem } from "./DFXWorkItem";
import type { DFXWorkItemFlags } from "./DFXWorkItemFlags";
import { objectState } from "./internal/queueState";
import { initialiseSource, setSourceHandler, sourceChanged, sourceState } from "./internal/sources/sourceState";
import { timerSourceClass } from "./internal/sources/timerSource";
import { userDataAddSourceClass } from "./internal/sources/userDataAddSource";
import { userDataOrSourceClass } from "./internal/sources/userDataOrSource";
import { userDataReplaceSourceClass } from "./internal/sources/userDataReplaceSource";
import { memoryPressureSourceClass } from "./internal/sources/memoryPressureSource";
import type { DFXWork } from "./internal/work";
const noPressureEvents: readonly DFXSourceMemoryPressureEvent[] = Object.freeze([]);

/** DispatchSource. Factories return protocol-typed internal subclasses. */
export class DFXSource extends DFXObject implements DFXSourceProtocol {
  protected constructor() {
    super();
    initialiseSource(this);
  }
  static makeTimerSource(options: { flags?: DFXSourceTimerFlags[]; queue?: DFXQueue | null } = {}): DFXSourceTimer {
    return new (timerSourceClass(this))(options.flags ?? [], options.queue);
  }
  static makeUserDataAddSource(queue?: DFXQueue | null): DFXSourceUserDataAdd {
    return new (userDataAddSourceClass(this))(queue);
  }
  static makeUserDataOrSource(queue?: DFXQueue | null): DFXSourceUserDataOr {
    return new (userDataOrSourceClass(this))(queue);
  }
  static makeUserDataReplaceSource(queue?: DFXQueue | null): DFXSourceUserDataReplace {
    return new (userDataReplaceSourceClass(this))(queue);
  }
  static makeMemoryPressureSource(eventMask: DFXSourceMemoryPressureEvent[], queue?: DFXQueue | null): DFXSourceMemoryPressure {
    return new (memoryPressureSourceClass(this))(eventMask, queue);
  }
  get handle(): number {
    return 0;
  }
  get mask(): number | readonly DFXSourceMemoryPressureEvent[] {
    return sourceState(this).mask;
  }
  get data(): number | readonly DFXSourceMemoryPressureEvent[] {
    const state = sourceState(this);
    return state.pressure ? noPressureEvents : state.delivered;
  }
  get isCancelled(): boolean {
    return sourceState(this).cancelled;
  }
  override activate(): void {
    super.activate();
    sourceChanged(this);
  }
  override resume(): void {
    if (!objectState(this).active) this.activate();
    else {
      super.resume();
      sourceChanged(this);
    }
  }
  override setTarget(queue: DFXQueue | null): void {
    super.setTarget(queue);
    sourceState(this).queue = queue ?? queueClassForLifetime(lifetimeOf(this)).global();
  }
  cancel(): void {
    const state = sourceState(this);
    if (!state.cancelled) {
      state.cancelled = true;
      state.pending = 0;
      state.dispose?.();
      sourceChanged(this);
    }
  }
  setEventHandler(handler: DFXWorkItem): void;
  setEventHandler<R>(handler: DFXWork<R> | null): void;
  setEventHandler<R>(options: { qos?: DFXQoS; flags?: DFXWorkItemFlags[] }, handler: DFXWork<R> | null): void;
  setEventHandler<R>(
    optionsOrHandler: DFXWorkItem | DFXWork<R> | null | { qos?: DFXQoS; flags?: DFXWorkItemFlags[] },
    handler?: DFXWork<R> | null,
  ): void {
    setSourceHandler(this, "event", optionsOrHandler, handler);
  }
  setCancelHandler(handler: DFXWorkItem): void;
  setCancelHandler<R>(handler: DFXWork<R> | null): void;
  setCancelHandler<R>(options: { qos?: DFXQoS; flags?: DFXWorkItemFlags[] }, handler: DFXWork<R> | null): void;
  setCancelHandler<R>(
    optionsOrHandler: DFXWorkItem | DFXWork<R> | null | { qos?: DFXQoS; flags?: DFXWorkItemFlags[] },
    handler?: DFXWork<R> | null,
  ): void {
    setSourceHandler(this, "cancel", optionsOrHandler, handler);
  }
  setRegistrationHandler(handler: DFXWorkItem): void;
  setRegistrationHandler<R>(handler: DFXWork<R> | null): void;
  setRegistrationHandler<R>(options: { qos?: DFXQoS; flags?: DFXWorkItemFlags[] }, handler: DFXWork<R> | null): void;
  setRegistrationHandler<R>(
    optionsOrHandler: DFXWorkItem | DFXWork<R> | null | { qos?: DFXQoS; flags?: DFXWorkItemFlags[] },
    handler?: DFXWork<R> | null,
  ): void {
    setSourceHandler(this, "registration", optionsOrHandler, handler);
  }
}

attributeDispatchClass(DFXSource);
