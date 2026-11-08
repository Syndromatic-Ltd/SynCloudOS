/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { DFXSourceProtocol } from "./DFXSourceProtocol";
/** DispatchSourceUserDataOr. Safe unsigned bits are merged without 32-bit truncation. */
export interface DFXSourceUserDataOr extends DFXSourceProtocol {
  readonly data: number;
  readonly mask: number;
  or(data: number): void;
}
