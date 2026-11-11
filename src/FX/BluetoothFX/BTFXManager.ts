/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { fxAttributedClass } from "../../SynCloudOS/fxRuntimeContracts";
import type { BTFXManagerState } from "./BTFXManagerState";
import type { BTFXManagerAuthorization } from "./BTFXManagerAuthorization";
import { bluetoothBinding } from "./internal/bluetoothBindings";
import { bluetoothPortFor } from "./internal/bluetoothPort";
export abstract class BTFXManager {
  static get authorization(): BTFXManagerAuthorization { return bluetoothPortFor(bluetoothBinding(this).resolve().context).authorization; }
  abstract readonly state: BTFXManagerState;
}
Object.defineProperty(BTFXManager, fxAttributedClass, { value: true });
