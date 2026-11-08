/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/** DispatchQoS.QoSClass. */
export const DFXQoSClass = Object.freeze({
  background: "background",
  utility: "utility",
  default: "default",
  userInitiated: "userInitiated",
  userInteractive: "userInteractive",
  unspecified: "unspecified",
} as const);
export type DFXQoSClass = typeof DFXQoSClass[keyof typeof DFXQoSClass];
