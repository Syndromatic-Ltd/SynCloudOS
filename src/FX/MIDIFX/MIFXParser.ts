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

import {
  decodeMIFXFixedMessage,
  mifxFixedDataLength,
  mifxIsChannelStatus,
  mifxIsRealtimeByte,
  mifxIsValidRealtimeStatus,
  type MIFXParseError,
  type MIFXParserEvent,
  type MIFXParserRecovery,
} from "./MIFXMessage";

export interface MIFXParserOptions {
  /** Maximum complete SysEx wire length, including F0 and F7. */
  readonly maxSysExBytes?: number;
}

const DEFAULT_MAX_SYSEX_BYTES = 64 * 1024;

export class MIFXParser {
  private readonly maxSysExBytes: number;
  private byteOffset = 0;
  private runningStatus: number | null = null;
  private pendingStatus: number | null = null;
  private pendingExpected = 0;
  private pendingData: number[] = [];
  private pendingStartOffset = 0;
  private sysexData: number[] | null = null;
  private sysexStartOffset = 0;
  private discardingSysEx = false;

  constructor(options: MIFXParserOptions = {}) {
    const maxSysExBytes = options.maxSysExBytes ?? DEFAULT_MAX_SYSEX_BYTES;
    if (!Number.isSafeInteger(maxSysExBytes) || maxSysExBytes < 2) {
      throw new RangeError("maxSysExBytes must be a safe integer of at least 2 bytes.");
    }
    this.maxSysExBytes = maxSysExBytes;
  }

  get bufferedByteCount(): number {
    return this.pendingData.length + (this.sysexData?.length ?? 0);
  }

  push(bytes: Uint8Array): readonly MIFXParserEvent[] {
    if (!(bytes instanceof Uint8Array)) throw new TypeError("MIFXParser.push requires a Uint8Array.");
    const events: MIFXParserEvent[] = [];
    for (const byte of bytes) {
      const offset = this.byteOffset;
      this.byteOffset += 1;
      this.consume(byte, offset, events);
    }
    return events;
  }

  finish(): readonly MIFXParserEvent[] {
    const events: MIFXParserEvent[] = [];
    if (this.sysexData !== null) {
      events.push(this.error("truncated-message", this.sysexStartOffset, "reset-at-end", this.sysexStartOffset));
    } else if (this.pendingStatus !== null) {
      events.push(this.error("truncated-message", this.pendingStartOffset, "reset-at-end", this.pendingStartOffset));
    }
    this.runningStatus = null;
    this.clearPending();
    this.sysexData = null;
    this.discardingSysEx = false;
    return events;
  }

  private consume(byte: number, offset: number, events: MIFXParserEvent[]): void {
    if (this.discardingSysEx) {
      this.consumeDiscardedSysExByte(byte, offset, events);
      return;
    }

    if (this.sysexData !== null) {
      this.consumeSysExByte(byte, offset, events);
      return;
    }

    if (mifxIsRealtimeByte(byte)) {
      this.consumeRealtime(byte, offset, events);
      return;
    }

    if (byte >= 0x80) {
      this.consumeStatus(byte, offset, events);
      return;
    }

    this.consumeData(byte, offset, events);
  }

  private consumeRealtime(byte: number, offset: number, events: MIFXParserEvent[]): void {
    if (!mifxIsValidRealtimeStatus(byte)) {
      events.push(this.error("invalid-status", offset, "drop-byte"));
      return;
    }
    events.push({ kind: "message", offset, message: decodeMIFXFixedMessage(byte, []) });
  }

  private consumeStatus(status: number, offset: number, events: MIFXParserEvent[]): void {
    if (this.pendingStatus !== null) {
      events.push(this.error("truncated-message", offset, "restart-at-status", this.pendingStartOffset));
      this.clearPending();
    }

    if (mifxIsChannelStatus(status)) {
      this.runningStatus = status;
      this.startPending(status, offset);
      return;
    }

    this.runningStatus = null;
    if (status === 0xf0) {
      this.sysexData = [];
      this.sysexStartOffset = offset;
      return;
    }
    if (status === 0xf7) {
      events.push(this.error("unexpected-eox", offset, "drop-byte"));
      return;
    }

    const expected = mifxFixedDataLength(status);
    if (expected === null) {
      events.push(this.error("invalid-status", offset, "drop-byte"));
      return;
    }
    if (expected === 0) {
      events.push({ kind: "message", offset, message: decodeMIFXFixedMessage(status, []) });
      return;
    }
    this.startPending(status, offset);
  }

  private consumeData(byte: number, offset: number, events: MIFXParserEvent[]): void {
    if (this.pendingStatus === null) {
      if (this.runningStatus === null) {
        events.push(this.error("unexpected-data", offset, "drop-byte"));
        return;
      }
      this.startPending(this.runningStatus, offset);
    }

    this.pendingData.push(byte);
    if (this.pendingData.length !== this.pendingExpected) return;

    const status = this.pendingStatus!;
    const startOffset = this.pendingStartOffset;
    const data = this.pendingData;
    this.clearPending();
    events.push({ kind: "message", offset: startOffset, message: decodeMIFXFixedMessage(status, data) });
  }

  private consumeSysExByte(byte: number, offset: number, events: MIFXParserEvent[]): void {
    if (mifxIsRealtimeByte(byte)) {
      this.consumeRealtime(byte, offset, events);
      return;
    }
    if (byte === 0xf7) {
      const data = new Uint8Array(this.sysexData!);
      const startOffset = this.sysexStartOffset;
      this.sysexData = null;
      events.push({ kind: "message", offset: startOffset, message: { kind: "sysex", data } });
      return;
    }
    if (byte >= 0x80) {
      events.push(this.error("truncated-message", offset, "restart-at-status", this.sysexStartOffset));
      this.sysexData = null;
      this.consumeStatus(byte, offset, events);
      return;
    }

    const completedWireLength = this.sysexData!.length + 3;
    if (completedWireLength > this.maxSysExBytes) {
      events.push(this.error("sysex-too-large", offset, "discard-sysex", this.sysexStartOffset));
      this.sysexData = null;
      this.discardingSysEx = true;
      return;
    }
    this.sysexData!.push(byte);
  }

  private consumeDiscardedSysExByte(byte: number, offset: number, events: MIFXParserEvent[]): void {
    if (mifxIsRealtimeByte(byte)) {
      this.consumeRealtime(byte, offset, events);
      return;
    }
    if (byte === 0xf7) {
      this.discardingSysEx = false;
      return;
    }
    if (byte >= 0x80) {
      this.discardingSysEx = false;
      this.consumeStatus(byte, offset, events);
    }
  }

  private startPending(status: number, offset: number): void {
    const expected = mifxFixedDataLength(status);
    if (expected === null || expected === 0) throw new TypeError(`MIDI status 0x${status.toString(16)} cannot start a pending message.`);
    this.pendingStatus = status;
    this.pendingExpected = expected;
    this.pendingData = [];
    this.pendingStartOffset = offset;
  }

  private clearPending(): void {
    this.pendingStatus = null;
    this.pendingExpected = 0;
    this.pendingData = [];
    this.pendingStartOffset = 0;
  }

  private error(code: MIFXParseError["code"], offset: number, recovery: MIFXParserRecovery, messageStartOffset?: number): MIFXParserEvent {
    const error: MIFXParseError = messageStartOffset === undefined
      ? { code, offset, recovery }
      : { code, offset, messageStartOffset, recovery };
    return { kind: "error", error: Object.freeze(error) };
  }
}
