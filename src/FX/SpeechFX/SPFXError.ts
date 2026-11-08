/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/** Speech's NSError result, retaining its domain, numeric code and description.
 * Unsupported web operations use NSCocoaErrorDomain / 3328 (featureUnsupported). */
export class SPFXError extends Error {
  constructor(readonly domain: string, readonly code: number, description: string) { super(description); this.name = "SPFXError"; }
  get localizedDescription(): string { return this.message; }
}
