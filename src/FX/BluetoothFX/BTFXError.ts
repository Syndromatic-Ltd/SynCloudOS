/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/** CBError domain and cases. Browser failures retain Apple's error vocabulary. */
export class BTFXError extends Error {
  static readonly errorDomain = "CBErrorDomain";
  constructor(readonly code: "unknown" | "invalidParameters" | "invalidHandle" | "notConnected" | "outOfSpace" | "operationCancelled" | "connectionTimeout" | "peripheralDisconnected" | "uuidNotAllowed" | "alreadyAdvertising" | "connectionFailed" | "connectionLimitReached" | "unknownDevice" | "operationNotSupported" | "peerRemovedPairingInformation" | "encryptionTimedOut" | "tooManyLEPairedDevices", message: string = code) { super(message); this.name = "BTFXError"; }
}
