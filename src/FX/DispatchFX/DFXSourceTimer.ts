/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { DFXSourceProtocol } from "./DFXSourceProtocol";
import type { DFXTime } from "./DFXTime";
import type { DFXWallTime } from "./DFXWallTime";
import type { DFXTimeInterval } from "./DFXTimeInterval";
/** DispatchSourceTimer; a numeric repeating interval is Apple's Double seconds form. */
export interface DFXSourceTimer extends DFXSourceProtocol {
  readonly data: number;
  readonly mask: number;
  schedule(deadline: DFXTime | DFXWallTime, options?: { repeating?: DFXTimeInterval | number; leeway?: DFXTimeInterval }): void;
}
