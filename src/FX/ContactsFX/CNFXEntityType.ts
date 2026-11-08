/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
export const CNFXEntityType = Object.freeze({ contacts: "contacts" } as const);
export type CNFXEntityType = typeof CNFXEntityType[keyof typeof CNFXEntityType];
