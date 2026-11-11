/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/** DispatchQueue.Attributes. Members are opaque option-set values. */
export class DFXQueueAttributes {
  static readonly concurrent = new DFXQueueAttributes();
  static readonly initiallyInactive = new DFXQueueAttributes();
  private constructor() { Object.freeze(this); }
}
Object.freeze(DFXQueueAttributes);
