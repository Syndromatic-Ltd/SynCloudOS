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

import { MIFXEncoder } from "./MIFXEncoder";
import { decodeMIFXFixedMessage, mifxFixedDataLength, type MIFXMessage } from "./MIFXMessage";

export const MIFX_UMP_PROTOCOL_VERSION = "ump-1.1.2" as const;

export type MIFXUniversalPacketKind =
  | "utility"
  | "system"
  | "midi1-channel-voice"
  | "midi2-channel-voice";

export type MIFXMIDI2ChannelVoice =
  | Readonly<{ kind: "note-off"; channel: number; note: number; velocity: number; attributeType: number; attributeData: number }>
  | Readonly<{ kind: "note-on"; channel: number; note: number; velocity: number; attributeType: number; attributeData: number }>
  | Readonly<{ kind: "polyphonic-key-pressure"; channel: number; note: number; pressure: number }>
  | Readonly<{ kind: "control-change"; channel: number; controller: number; value: number }>
  | Readonly<{ kind: "channel-pressure"; channel: number; pressure: number }>
  | Readonly<{ kind: "pitch-bend"; channel: number; value: number }>;

const EXPECTED_WORDS = new Map<number, number>([[0x0, 1], [0x1, 1], [0x2, 1], [0x4, 2]]);

function uint32(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 0xffff_ffff)
    throw new RangeError(`${label} must be an unsigned 32-bit integer.`);
  return Number(value) >>> 0;
}

function group(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 15)
    throw new RangeError("UMP group must be an integer from 0 through 15.");
  return Number(value);
}

function packetKind(messageType: number): MIFXUniversalPacketKind {
  switch (messageType) {
    case 0x0: return "utility";
    case 0x1: return "system";
    case 0x2: return "midi1-channel-voice";
    case 0x4: return "midi2-channel-voice";
    default: throw new TypeError(`Unsupported UMP message type 0x${messageType.toString(16)} in the ${MIFX_UMP_PROTOCOL_VERSION} declared subset.`);
  }
}

function fixedMIDI1Message(word: number, expectedKind: "system" | "midi1-channel-voice"): MIFXMessage {
  const status = (word >>> 16) & 0xff;
  if (expectedKind === "system" ? status < 0xf0 : status < 0x80 || status > 0xef)
    throw new TypeError(`UMP ${expectedKind} packet contains an invalid MIDI status byte 0x${status.toString(16)}.`);
  const length = mifxFixedDataLength(status);
  if (length === null) throw new TypeError(`UMP ${expectedKind} status 0x${status.toString(16)} is unsupported by the declared MIDI 1 subset.`);
  const data = [(word >>> 8) & 0x7f, word & 0x7f].slice(0, length);
  return decodeMIFXFixedMessage(status, data);
}

function sevenBit(value: number, label: string): number {
  if ((value & 0x80) !== 0) throw new RangeError(`${label} must be a 7-bit value.`);
  return value;
}

export class MIFXUniversalPacket {
  readonly protocolVersion = MIFX_UMP_PROTOCOL_VERSION;
  readonly words: readonly number[];
  readonly messageType: number;
  readonly group: number;
  readonly kind: MIFXUniversalPacketKind;

  constructor(words: readonly number[] | Uint32Array) {
    if (!words || typeof words !== "object") throw new TypeError("UMP packet requires a word sequence.");
    const values = Array.from(words, (word, index) => uint32(word, `UMP word ${index}`));
    if (values.length < 1 || values.length > 4) throw new RangeError("UMP packet word count must be between one and four words.");
    const messageType = values[0]! >>> 28;
    const expectedWords = EXPECTED_WORDS.get(messageType);
    if (expectedWords === undefined) packetKind(messageType);
    if (values.length !== expectedWords)
      throw new RangeError(`UMP message type 0x${messageType.toString(16)} requires word count ${expectedWords}.`);
    this.words = Object.freeze(values);
    this.messageType = messageType;
    this.group = (values[0]! >>> 24) & 0x0f;
    this.kind = packetKind(messageType);
    Object.freeze(this);
  }

  static fromBytes(bytes: Uint8Array): MIFXUniversalPacket {
    if (!(bytes instanceof Uint8Array)) throw new TypeError("UMP bytes must be a Uint8Array.");
    if (bytes.byteLength === 0 || bytes.byteLength % 4 !== 0)
      throw new RangeError("UMP byte length must be a nonzero multiple of four.");
    if (bytes.byteLength > 16) throw new RangeError("UMP packet cannot exceed four 32-bit words.");
    const words: number[] = [];
    for (let offset = 0; offset < bytes.byteLength; offset += 4) {
      words.push((((bytes[offset]! << 24) >>> 0) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0);
    }
    return new MIFXUniversalPacket(words);
  }

  static fromMIDI1Message(groupValue: number, message: MIFXMessage): MIFXUniversalPacket {
    const packetGroup = group(groupValue);
    const encoded = MIFXEncoder.encode(message);
    if (encoded[0] === 0xf0) throw new TypeError("SysEx requires a data-message UMP packet outside the declared initial subset.");
    if (encoded.length > 3) throw new RangeError("MIDI 1 message does not fit the declared 32-bit UMP subset.");
    const status = encoded[0]!;
    const messageType = status >= 0xf0 ? 0x1 : 0x2;
    const word = ((messageType << 28) | (packetGroup << 24) | (status << 16) | ((encoded[1] ?? 0) << 8) | (encoded[2] ?? 0)) >>> 0;
    return new MIFXUniversalPacket([word]);
  }

  toBytes(): Uint8Array {
    const bytes = new Uint8Array(this.words.length * 4);
    for (let index = 0; index < this.words.length; index += 1) {
      const word = this.words[index]!;
      const offset = index * 4;
      bytes[offset] = word >>> 24;
      bytes[offset + 1] = word >>> 16;
      bytes[offset + 2] = word >>> 8;
      bytes[offset + 3] = word;
    }
    return bytes;
  }

  toMIDI1Message(): MIFXMessage {
    if (this.kind !== "system" && this.kind !== "midi1-channel-voice")
      throw new TypeError(`${this.kind} UMP packets do not directly contain a MIDI 1 message.`);
    return fixedMIDI1Message(this.words[0]!, this.kind);
  }

  midi2ChannelVoice(): MIFXMIDI2ChannelVoice {
    if (this.kind !== "midi2-channel-voice") throw new TypeError("UMP packet is not MIDI 2 channel voice.");
    const first = this.words[0]!;
    const second = this.words[1]!;
    const status = (first >>> 20) & 0x0f;
    const channel = (first >>> 16) & 0x0f;
    const index = sevenBit((first >>> 8) & 0xff, "MIDI 2 note/controller index");
    switch (status) {
      case 0x8:
      case 0x9:
        return Object.freeze({
          kind: status === 0x8 ? "note-off" as const : "note-on" as const,
          channel,
          note: index,
          velocity: (second >>> 16) & 0xffff,
          attributeType: first & 0xff,
          attributeData: second & 0xffff,
        });
      case 0xa:
        if ((first & 0xff) !== 0) throw new RangeError("MIDI 2 poly-pressure reserved bits must be zero.");
        return Object.freeze({ kind: "polyphonic-key-pressure" as const, channel, note: index, pressure: second });
      case 0xb:
        if ((first & 0xff) !== 0) throw new RangeError("MIDI 2 control-change reserved bits must be zero.");
        return Object.freeze({ kind: "control-change" as const, channel, controller: index, value: second });
      case 0xd:
        if ((first & 0xffff) !== 0) throw new RangeError("MIDI 2 channel-pressure reserved bits must be zero.");
        return Object.freeze({ kind: "channel-pressure" as const, channel, pressure: second });
      case 0xe:
        if ((first & 0xffff) !== 0) throw new RangeError("MIDI 2 pitch-bend reserved bits must be zero.");
        return Object.freeze({ kind: "pitch-bend" as const, channel, value: second });
      default:
        throw new TypeError(`Unsupported MIDI 2 channel-voice status 0x${status.toString(16)} in the declared subset.`);
    }
  }
}
