/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { DFXSourceProtocol } from "./DFXSourceProtocol";
/** DispatchSourceUserDataReplace. Pending data keeps its latest value. */
export interface DFXSourceUserDataReplace extends DFXSourceProtocol {
  readonly data: number;
  readonly mask: number;
  replace(data: number): void;
}
