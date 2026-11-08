/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { DFXSource } from "../../DFXSource";
import type { DFXQueue } from "../../DFXQueue";
import type { DFXSourceTimer } from "../../DFXSourceTimer";
import { DFXSourceTimerFlags } from "../../DFXSourceTimerFlags";
import { DFXTime } from "../../DFXTime";
import { DFXTimeInterval } from "../../DFXTimeInterval";
import { DFXWallTime } from "../../DFXWallTime";
import { objectState } from "../queueState";
import { clientError, maximumNanoseconds, nanoseconds } from "../time";
import { remainingNanoseconds, scheduleTimer } from "../timerWheel";
import { configureSource, mergeSourceData, sourceState } from "./sourceState";

export function timerSourceClass(Base: typeof DFXSource): new (flags: DFXSourceTimerFlags[], queue?: DFXQueue | null) => DFXSource & DFXSourceTimer {
  return class TimerSource extends Base implements DFXSourceTimer {
    #deadline: DFXTime | DFXWallTime = DFXTime.distantFuture;
    #repeating = Infinity;
    #leeway = 0;
    #strict: boolean;
    #cancel: () => void = () => {};
    constructor(flags: DFXSourceTimerFlags[], queue?: DFXQueue | null) {
      super(); configureSource(this, queue);
      if (!Array.isArray(flags) || flags.some(flag => flag !== DFXSourceTimerFlags.strict)) clientError("invalid timer flags");
      this.#strict = flags.includes(DFXSourceTimerFlags.strict); sourceState(this).mask = this.#strict ? 1 : 0;
      sourceState(this).onActivate = () => this.#arm(); sourceState(this).dispose = () => this.#cancel();
    }
    override get data(): number { return super.data as number; }
    override get mask(): number { return super.mask as number; }
    schedule(deadline: DFXTime | DFXWallTime, options: { repeating?: DFXTimeInterval | number; leeway?: DFXTimeInterval } = {}): void {
      remainingNanoseconds(deadline);
      const repeating = options.repeating ?? DFXTimeInterval.never;
      const interval = typeof repeating === "number" ? repeating === Infinity ? Infinity : Math.trunc(repeating * 1e9) : nanoseconds(repeating);
      const leeway = nanoseconds(options.leeway ?? DFXTimeInterval.nanoseconds(0));
      if (interval !== Infinity && (!Number.isSafeInteger(interval) || interval < 0)) clientError("timer repeating interval must be non-negative safe nanoseconds");
      if (leeway < 0) clientError("timer leeway must not be negative");
      this.#cancel(); this.#deadline = deadline; this.#repeating = Math.max(1, interval); this.#leeway = leeway;
      sourceState(this).pending = 0;
      if (objectState(this).active && sourceState(this).registered) this.#arm();
    }
    #arm(): void {
      if (sourceState(this).cancelled) return;
      this.#cancel = scheduleTimer(this.#deadline, this.#leeway, this.#strict, () => {
        const elapsed = Math.max(0, -remainingNanoseconds(this.#deadline));
        const count = this.#repeating === Infinity ? 1 : 1 + Math.floor(elapsed / this.#repeating);
        mergeSourceData(this, count, "add");
        if (this.#repeating !== Infinity) {
          const delta = count * this.#repeating;
          this.#deadline = delta > maximumNanoseconds ? this.#deadline instanceof DFXTime ? DFXTime.distantFuture : DFXWallTime.distantFuture : this.#deadline.advanced(DFXTimeInterval.nanoseconds(delta));
          // Apple's subsequent repeating windows are bounded by half the interval.
          this.#leeway = Math.min(this.#leeway, this.#repeating / 2); this.#arm();
        }
      });
    }
  };
}
