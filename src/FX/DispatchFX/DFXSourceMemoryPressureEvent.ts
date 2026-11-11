/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/** DispatchSource.MemoryPressureEvent. Members are opaque option-set values. */
export class DFXSourceMemoryPressureEvent {
  static readonly normal = new DFXSourceMemoryPressureEvent();
  static readonly warning = new DFXSourceMemoryPressureEvent();
  static readonly critical = new DFXSourceMemoryPressureEvent();
  static readonly all = new DFXSourceMemoryPressureEvent();
  private constructor() { Object.freeze(this); }
}
Object.freeze(DFXSourceMemoryPressureEvent);
