/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
export const CNFXContactFormatterStyle = Object.freeze({ fullName: "fullName", phoneticFullName: "phoneticFullName" } as const);
export type CNFXContactFormatterStyle = typeof CNFXContactFormatterStyle[keyof typeof CNFXContactFormatterStyle];
