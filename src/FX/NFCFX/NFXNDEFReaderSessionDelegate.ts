/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { NFXNDEFReaderSession } from "./NFXNDEFReaderSession";
import type { NFXNDEFMessage } from "./NFXNDEFMessage";
import type { NFXNDEFTag } from "./NFXNDEFTag";
import type { NFXReaderError } from "./NFXReaderError";
/** NFCNDEFReaderSessionDelegate; all deliveries are queued and lifetime checked. */
export interface NFXNDEFReaderSessionDelegate {
  readerSessionDidInvalidateWithError(session: NFXNDEFReaderSession, error: NFXReaderError): void;
  readerSessionDidDetectNDEFs?(session: NFXNDEFReaderSession, messages: readonly NFXNDEFMessage[]): void;
  readerSessionDidDetectTags?(session: NFXNDEFReaderSession, tags: readonly NFXNDEFTag[]): void;
  readerSessionDidBecomeActive?(session: NFXNDEFReaderSession): void;
}
