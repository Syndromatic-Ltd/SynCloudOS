/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/** DispatchWorkItemFlags. Members are opaque option-set values. */
export class DFXWorkItemFlags {
  static readonly barrier = new DFXWorkItemFlags();
  static readonly detached = new DFXWorkItemFlags();
  static readonly assignCurrentContext = new DFXWorkItemFlags();
  static readonly noQoS = new DFXWorkItemFlags();
  static readonly inheritQoS = new DFXWorkItemFlags();
  static readonly enforceQoS = new DFXWorkItemFlags();
  private constructor() { Object.freeze(this); }
}
Object.freeze(DFXWorkItemFlags);
