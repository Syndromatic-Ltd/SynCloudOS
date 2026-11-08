/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/** CNError.Code cases used by the supported Contacts surface. */
export class CNFXError extends Error {
  readonly domain = "CNErrorDomain";
  constructor(readonly code: "authorizationDenied" | "featureNotAvailable" | "communicationError" | "dataAccessError" | "unauthorizedKeys" | "validationTypeMismatch", message: string) { super(message); this.name = "CNFXError"; }
}
