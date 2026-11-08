/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { BTFXUUID } from "./BTFXUUID";
import { attributes } from "./internal/bluetoothObjects";
export abstract class BTFXAttribute { protected constructor() {} get uuid(): BTFXUUID { return attributes.get(this)!; } }
