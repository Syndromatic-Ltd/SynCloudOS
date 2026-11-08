/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { DFXSource } from "../../DFXSource";
import type { DFXQueue } from "../../DFXQueue";
import type { DFXSourceMemoryPressure } from "../../DFXSourceMemoryPressure";
import { DFXSourceMemoryPressureEvent as E } from "../../DFXSourceMemoryPressureEvent";
import { clientError } from "../time";
import { configureSource, sourceState } from "./sourceState";
const events = [E.normal, E.warning, E.critical];
export function memoryPressureSourceClass(Base: typeof DFXSource) {
  return class MemoryPressureSource extends Base implements DFXSourceMemoryPressure {
    constructor(mask: E[], queue?: DFXQueue | null) {
      super(); configureSource(this, queue);
      if (!Array.isArray(mask) || mask.some(event => event !== E.all && !events.includes(event))) clientError("invalid memory pressure event mask");
      const state = sourceState(this); state.pressure = true;
      state.mask = Object.freeze(mask.includes(E.all) ? [...events] : events.filter(event => mask.includes(event)));
      // BrowserRuntimeEnvironment currently has memory.sample() only, no pressure
      // signal. Measurements are diagnostics, never a basis for invented events.
    }
    override get data(): readonly E[] { return super.data as readonly E[]; }
    override get mask(): readonly E[] { return super.mask as readonly E[]; }
  };
}
