/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/** CNPhoneNumber.init(stringValue:). No invented normalization is applied. */
export class CNFXPhoneNumber {
  readonly stringValue: string;
  constructor(stringValue: string) { if (typeof stringValue !== "string") throw new TypeError("A phone number requires a string."); this.stringValue = stringValue; Object.freeze(this); }
}
