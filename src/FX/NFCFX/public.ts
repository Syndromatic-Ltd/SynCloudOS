/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { NSEData, type NSEDataConvertible } from "../../Foundation/NSEData";

export type NFXAuthorizationStatus = "unknown" | "prompt" | "granted" | "denied" | "unavailable";

export interface NFXCapabilities {
  readonly reading: boolean;
  readonly writing: boolean;
  readonly makingReadOnly: boolean;
}

export interface NFXNDEFPayloadDescriptor {
  readonly recordType: string;
  readonly mediaType?: string;
  readonly id?: string;
  readonly encoding?: string;
  readonly lang?: string;
  readonly data?: string | NSEDataConvertible | NFXNDEFMessage;
}

/** Web NFC's NDEF record, including text, binary, and nested NDEF payloads. */
export class NFXNDEFPayload {
  readonly recordType: string;
  readonly mediaType?: string;
  readonly id?: string;
  readonly encoding?: string;
  readonly lang?: string;
  readonly data?: string | NSEData | NFXNDEFMessage;

  constructor(descriptor: NFXNDEFPayloadDescriptor) {
    if (!descriptor.recordType) throw new TypeError("An NDEF record type is required.");
    this.recordType = descriptor.recordType;
    this.mediaType = descriptor.mediaType;
    this.id = descriptor.id;
    this.encoding = descriptor.encoding;
    this.lang = descriptor.lang;
    const data = descriptor.data;
    this.data = data === undefined || typeof data === "string" || data instanceof NFXNDEFMessage ? data : NSEData.from(data);
    Object.freeze(this);
  }
}

export class NFXNDEFMessage {
  readonly records: readonly NFXNDEFPayload[];
  constructor(records: readonly (NFXNDEFPayload | NFXNDEFPayloadDescriptor)[]) {
    this.records = Object.freeze(records.map(record => new NFXNDEFPayload(record)));
    Object.freeze(this);
  }
}

export interface NFXNDEFReading {
  readonly serialNumber: string;
  readonly message: NFXNDEFMessage;
}

/** Owner-scoped foreground Web NFC session. Creation and inspection are passive. */
export interface NFXNDEFReaderSession {
  getAuthorizationStatus(): Promise<NFXAuthorizationStatus>;
  scan(listener: (reading: NFXNDEFReading) => void, onError?: (error: unknown) => void): Promise<void>;
  write(message: NFXNDEFMessage, options?: Readonly<{ overwrite?: boolean }>): Promise<void>;
  /** Irreversible tag change; requires the makingReadOnly capability. */
  makeReadOnly(): Promise<void>;
  dispose(): void;
}

export interface NFXNFCClient {
  getCapabilities(): NFXCapabilities;
  createReaderSession(signal?: AbortSignal): NFXNDEFReaderSession;
}
