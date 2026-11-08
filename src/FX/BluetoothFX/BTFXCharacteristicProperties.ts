/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/** CBCharacteristicProperties option-set bit values. */
export const BTFXCharacteristicProperties = Object.freeze({ broadcast: 1, read: 2, writeWithoutResponse: 4, write: 8, notify: 16, indicate: 32, authenticatedSignedWrites: 64, extendedProperties: 128, notifyEncryptionRequired: 256, indicateEncryptionRequired: 512 } as const);
export type BTFXCharacteristicProperties = number;
