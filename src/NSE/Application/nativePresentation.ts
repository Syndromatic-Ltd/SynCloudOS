/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/** Framework-only association for native UI owned through ordinary NSE presentation. */
export const nativePresentations = new WeakMap<object, () => void>();
