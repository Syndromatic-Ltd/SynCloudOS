/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { NFXNDEFPayload } from "./NFXNDEFPayload";
import { invalidNDEF } from "./internal/ndefEncoding";
/** NFCNDEFMessage. length is the encoded NDEF byte length (unchunked records). */
export class NFXNDEFMessage {
  records: readonly NFXNDEFPayload[];
  constructor(records: readonly NFXNDEFPayload[]) {
    if (!Array.isArray(records) || records.some(record => !(record instanceof NFXNDEFPayload))) throw invalidNDEF("NDEF messages require payload records.");
    this.records = Object.freeze(records.map(record => new NFXNDEFPayload(record.typeNameFormat, record.type, record.identifier, record.payload)));
  }
  get length(): number { return this.records.reduce((length, record) => length + 2 + (record.payload.count < 256 ? 1 : 4) + (record.identifier.count ? 1 : 0) + record.type.count + record.identifier.count + record.payload.count, 0); }
}
