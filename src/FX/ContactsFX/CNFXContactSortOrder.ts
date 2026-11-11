/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
export const CNFXContactSortOrder = Object.freeze({ none: "none", userDefault: "userDefault", givenName: "givenName", familyName: "familyName" } as const);
export type CNFXContactSortOrder = typeof CNFXContactSortOrder[keyof typeof CNFXContactSortOrder];
