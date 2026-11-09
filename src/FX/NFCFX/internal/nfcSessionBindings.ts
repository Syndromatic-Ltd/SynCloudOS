/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { createFXSessionBinding, type FXAppSession } from "../../../SynCloudOS/fxRuntimeContracts";
import { NFXReaderError } from "../NFXReaderError";
import type { NFXNDEFReaderSession } from "../NFXNDEFReaderSession";
export const nfcSessionBindings = new WeakMap<Function, Readonly<{ resolve(): FXAppSession }>>();
export const nfcSessions = new WeakMap<NFXNDEFReaderSession, { dispose(): void }>();
export const nfcBinding = (type: Function) =>
  nfcSessionBindings.get(type) ??
  createFXSessionBinding(
    type,
    reason => new NFXReaderError("readerTransceiveErrorSessionInvalidated", `NFC application session is ${reason}.`),
  );
