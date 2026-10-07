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

export type MIFXMessage =
  | { readonly kind: "note-off"; readonly channel: number; readonly note: number; readonly velocity: number }
  | { readonly kind: "note-on"; readonly channel: number; readonly note: number; readonly velocity: number }
  | { readonly kind: "polyphonic-key-pressure"; readonly channel: number; readonly note: number; readonly pressure: number }
  | { readonly kind: "control-change"; readonly channel: number; readonly controller: number; readonly value: number }
  | { readonly kind: "program-change"; readonly channel: number; readonly program: number }
  | { readonly kind: "channel-pressure"; readonly channel: number; readonly pressure: number }
  | { readonly kind: "pitch-bend"; readonly channel: number; readonly value: number }
  | { readonly kind: "time-code-quarter-frame"; readonly value: number }
  | { readonly kind: "song-position"; readonly position: number }
  | { readonly kind: "song-select"; readonly song: number }
  | { readonly kind: "tune-request" }
  | { readonly kind: "timing-clock" }
  | { readonly kind: "start" }
  | { readonly kind: "continue" }
  | { readonly kind: "stop" }
  | { readonly kind: "active-sensing" }
  | { readonly kind: "reset" }
  | { readonly kind: "sysex"; readonly data: Uint8Array };

export type MIFXParserErrorCode =
  | "unexpected-data"
  | "invalid-status"
  | "truncated-message"
  | "unexpected-eox"
  | "sysex-too-large";

export type MIFXParserRecovery =
  | "drop-byte"
  | "restart-at-status"
  | "discard-sysex"
  | "reset-at-end";

export interface MIFXParseError {
  readonly code: MIFXParserErrorCode;
  readonly offset: number;
  readonly messageStartOffset?: number;
  readonly recovery: MIFXParserRecovery;
}

export type MIFXParserEvent =
  | { readonly kind: "message"; readonly offset: number; readonly message: MIFXMessage }
  | { readonly kind: "error"; readonly error: MIFXParseError };

export function mifxFixedDataLength(status: number): number | null {
  if (status >= 0x80 && status <= 0xef) {
    const command = status & 0xf0;
    return command === 0xc0 || command === 0xd0 ? 1 : 2;
  }

  switch (status) {
    case 0xf1: return 1;
    case 0xf2: return 2;
    case 0xf3: return 1;
    case 0xf6: return 0;
    case 0xf8:
    case 0xfa:
    case 0xfb:
    case 0xfc:
    case 0xfe:
    case 0xff:
      return 0;
    default:
      return null;
  }
}

export function mifxIsChannelStatus(status: number): boolean {
  return status >= 0x80 && status <= 0xef;
}

export function mifxIsRealtimeByte(status: number): boolean {
  return status >= 0xf8 && status <= 0xff;
}

export function mifxIsValidRealtimeStatus(status: number): boolean {
  return status === 0xf8 || status === 0xfa || status === 0xfb || status === 0xfc || status === 0xfe || status === 0xff;
}

export function decodeMIFXFixedMessage(status: number, data: readonly number[]): MIFXMessage {
  const expected = mifxFixedDataLength(status);
  if (expected === null || data.length !== expected) {
    throw new TypeError(`MIDI status 0x${status.toString(16)} does not accept ${data.length} data byte(s).`);
  }
  for (const byte of data) {
    if (!Number.isInteger(byte) || byte < 0 || byte > 0x7f) throw new RangeError("MIDI data bytes must be 7-bit values.");
  }

  if (mifxIsChannelStatus(status)) {
    const channel = status & 0x0f;
    switch (status & 0xf0) {
      case 0x80: return Object.freeze({ kind: "note-off", channel, note: data[0]!, velocity: data[1]! });
      case 0x90: return Object.freeze({ kind: "note-on", channel, note: data[0]!, velocity: data[1]! });
      case 0xa0: return Object.freeze({ kind: "polyphonic-key-pressure", channel, note: data[0]!, pressure: data[1]! });
      case 0xb0: return Object.freeze({ kind: "control-change", channel, controller: data[0]!, value: data[1]! });
      case 0xc0: return Object.freeze({ kind: "program-change", channel, program: data[0]! });
      case 0xd0: return Object.freeze({ kind: "channel-pressure", channel, pressure: data[0]! });
      case 0xe0: return Object.freeze({ kind: "pitch-bend", channel, value: data[0]! | (data[1]! << 7) });
    }
  }

  switch (status) {
    case 0xf1: return Object.freeze({ kind: "time-code-quarter-frame", value: data[0]! });
    case 0xf2: return Object.freeze({ kind: "song-position", position: data[0]! | (data[1]! << 7) });
    case 0xf3: return Object.freeze({ kind: "song-select", song: data[0]! });
    case 0xf6: return Object.freeze({ kind: "tune-request" });
    case 0xf8: return Object.freeze({ kind: "timing-clock" });
    case 0xfa: return Object.freeze({ kind: "start" });
    case 0xfb: return Object.freeze({ kind: "continue" });
    case 0xfc: return Object.freeze({ kind: "stop" });
    case 0xfe: return Object.freeze({ kind: "active-sensing" });
    case 0xff: return Object.freeze({ kind: "reset" });
    default: throw new TypeError(`Unsupported MIDI status 0x${status.toString(16)}.`);
  }
}
