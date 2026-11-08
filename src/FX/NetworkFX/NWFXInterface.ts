/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { NWFXInterfaceType } from "./NWFXInterfaceType";
import { interfaceValues } from "./internal/pathValues";
/** NWInterface. Instances are issued by paths, never synthesized from browser transport hints. */
export class NWFXInterface {
  private constructor() {}
  get type(): NWFXInterfaceType { return interfaceValues.get(this)!.type; }
  /** Browser adapters cannot enumerate interface names or indices. */
  get name(): string { return interfaceValues.get(this)!.name; }
  get index(): number { return interfaceValues.get(this)!.index; }
}
