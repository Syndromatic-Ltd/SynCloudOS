/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { NFXNDEFStatus } from "./NFXNDEFStatus";
import type { NFXNDEFMessage } from "./NFXNDEFMessage";
import type { NFXReaderError } from "./NFXReaderError";
/** NFCNDEFTag. Operations complete on sessionQueue. Web NFC cannot address a selected tag. */
export interface NFXNDEFTag {
  readonly isAvailable: boolean;
  queryNDEFStatus(completionHandler: (status: NFXNDEFStatus, capacity: number, error: NFXReaderError | null) => void): void;
  readNDEF(completionHandler: (message: NFXNDEFMessage | null, error: NFXReaderError | null) => void): void;
  writeNDEF(message: NFXNDEFMessage, completionHandler: (error: NFXReaderError | null) => void): void;
  writeLock(completionHandler: (error: NFXReaderError | null) => void): void;
}
