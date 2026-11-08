/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
export const NWFXPathStatus = Object.freeze({
  satisfied: "satisfied",
  unsatisfied: "unsatisfied",
  requiresConnection: "requiresConnection",
} as const);
export type NWFXPathStatus = typeof NWFXPathStatus[keyof typeof NWFXPathStatus];
