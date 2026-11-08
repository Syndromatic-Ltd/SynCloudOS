/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/** DispatchSource.TimerFlags. Members are opaque option-set values. */
export class DFXSourceTimerFlags {
  static readonly strict = new DFXSourceTimerFlags();
  private constructor() { Object.freeze(this); }
}
Object.freeze(DFXSourceTimerFlags);
