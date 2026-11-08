/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
export const BTFXCharacteristicWriteType = Object.freeze({ withResponse: "withResponse", withoutResponse: "withoutResponse" } as const);
export type BTFXCharacteristicWriteType = typeof BTFXCharacteristicWriteType[keyof typeof BTFXCharacteristicWriteType];
