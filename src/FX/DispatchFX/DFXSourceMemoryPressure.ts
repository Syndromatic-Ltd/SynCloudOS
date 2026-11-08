/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { DFXSourceProtocol } from "./DFXSourceProtocol";
import type { DFXSourceMemoryPressureEvent } from "./DFXSourceMemoryPressureEvent";
/** DispatchSourceMemoryPressure. Dormant while the runtime exposes no pressure signal. */
export interface DFXSourceMemoryPressure extends DFXSourceProtocol {
  readonly data: readonly DFXSourceMemoryPressureEvent[];
  readonly mask: readonly DFXSourceMemoryPressureEvent[];
}
