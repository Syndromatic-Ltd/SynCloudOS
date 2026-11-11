/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { DFXQueue } from "../DispatchFX/DFXQueue";
import { fxAttributedClass } from "../../SynCloudOS/fxRuntimeContracts";
import { nfcBinding } from "./internal/nfcSessionBindings";
import { nfcPortFor } from "./internal/nfcPort";
/** NFCReaderSession is abstract; applications construct NFXNDEFReaderSession. */
export abstract class NFXReaderSession {
  static get readingAvailable(): boolean { return nfcPortFor(nfcBinding(this).resolve().context).readingAvailable; }
  abstract readonly delegate: object | null;
  abstract readonly sessionQueue: DFXQueue;
  abstract readonly isReady: boolean;
  abstract alertMessage: string;
  abstract begin(): void;
  abstract invalidate(errorMessage?: string): void;
}
Object.defineProperty(NFXReaderSession, fxAttributedClass, { value: true });
