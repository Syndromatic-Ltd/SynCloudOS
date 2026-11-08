/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { DFXSourceProtocol } from "./DFXSourceProtocol";
/** DispatchSourceUserDataAdd. Pending data is summed between deliveries. */
export interface DFXSourceUserDataAdd extends DFXSourceProtocol {
  readonly data: number;
  readonly mask: number;
  add(data: number): void;
}
