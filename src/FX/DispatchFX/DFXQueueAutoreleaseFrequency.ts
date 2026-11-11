/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/** DispatchQueue.AutoreleaseFrequency. */
export const DFXQueueAutoreleaseFrequency = Object.freeze({
  inherit: "inherit",
  workItem: "workItem",
  never: "never",
} as const);
export type DFXQueueAutoreleaseFrequency = typeof DFXQueueAutoreleaseFrequency[keyof typeof DFXQueueAutoreleaseFrequency];
