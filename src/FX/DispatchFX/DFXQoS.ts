/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { DFXQoSClass } from "./DFXQoSClass";
import { clientError } from "./internal/time";

/** DispatchQoS. Relative priorities range from -15 through 0. */
export class DFXQoS {
  static readonly background = new DFXQoS(DFXQoSClass.background, 0);
  static readonly utility = new DFXQoS(DFXQoSClass.utility, 0);
  static readonly default = new DFXQoS(DFXQoSClass.default, 0);
  static readonly userInitiated = new DFXQoS(DFXQoSClass.userInitiated, 0);
  static readonly userInteractive = new DFXQoS(DFXQoSClass.userInteractive, 0);
  static readonly unspecified = new DFXQoS(DFXQoSClass.unspecified, 0);
  constructor(readonly qosClass: DFXQoSClass, readonly relativePriority: number) {
    if (!Object.values(DFXQoSClass).includes(qosClass)) clientError("invalid QoS class");
    if (!Number.isInteger(relativePriority) || relativePriority < -15 || relativePriority > 0)
      clientError("relativePriority must be an integer in -15...0");
    Object.freeze(this);
  }
}
Object.freeze(DFXQoS);
