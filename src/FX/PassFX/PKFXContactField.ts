/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
export const PKFXContactField = Object.freeze({
  emailAddress: "emailAddress",
  name: "name",
  phoneNumber: "phoneNumber",
  phoneticName: "phoneticName",
  postalAddress: "postalAddress",
} as const);
export type PKFXContactField = (typeof PKFXContactField)[keyof typeof PKFXContactField];
