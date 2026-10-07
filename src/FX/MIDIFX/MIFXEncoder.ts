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

import type { MIFXMessage } from "./MIFXMessage";

function integerInRange(value: unknown, minimum: number, maximum: number, label: string): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new RangeError(`${label} must be an integer from ${minimum} through ${maximum}.`);
  }
  return value as number;
}

function channel(value: unknown): number {
  return integerInRange(value, 0, 15, "MIDI channel");
}

function dataByte(value: unknown, label: string): number {
  return integerInRange(value, 0, 0x7f, label);
}

function encodeChannel(status: number, channelValue: unknown, first: unknown, second?: unknown): Uint8Array {
  const statusByte = status | channel(channelValue);
  const firstByte = dataByte(first, "MIDI data");
  return second === undefined
    ? new Uint8Array([statusByte, firstByte])
    : new Uint8Array([statusByte, firstByte, dataByte(second, "MIDI data")]);
}

export class MIFXEncoder {
  static encode(message: MIFXMessage): Uint8Array {
    if (!message || typeof message !== "object" || typeof (message as { kind?: unknown }).kind !== "string") {
      throw new TypeError("MIDI message must be a tagged message value.");
    }

    switch (message.kind) {
      case "note-off":
        return new Uint8Array([0x80 | channel(message.channel), dataByte(message.note, "MIDI note"), dataByte(message.velocity, "MIDI velocity")]);
      case "note-on":
        return new Uint8Array([0x90 | channel(message.channel), dataByte(message.note, "MIDI note"), dataByte(message.velocity, "MIDI velocity")]);
      case "polyphonic-key-pressure":
        return new Uint8Array([0xa0 | channel(message.channel), dataByte(message.note, "MIDI note"), dataByte(message.pressure, "MIDI pressure")]);
      case "control-change":
        return new Uint8Array([0xb0 | channel(message.channel), dataByte(message.controller, "MIDI controller"), dataByte(message.value, "MIDI controller value")]);
      case "program-change":
        return encodeChannel(0xc0, message.channel, dataByte(message.program, "MIDI program"));
      case "channel-pressure":
        return encodeChannel(0xd0, message.channel, dataByte(message.pressure, "MIDI pressure"));
      case "pitch-bend": {
        const value = integerInRange(message.value, 0, 0x3fff, "MIDI pitch bend");
        return new Uint8Array([0xe0 | channel(message.channel), value & 0x7f, (value >> 7) & 0x7f]);
      }
      case "time-code-quarter-frame":
        return new Uint8Array([0xf1, dataByte(message.value, "MIDI time-code quarter-frame")]);
      case "song-position": {
        const position = integerInRange(message.position, 0, 0x3fff, "MIDI song position");
        return new Uint8Array([0xf2, position & 0x7f, (position >> 7) & 0x7f]);
      }
      case "song-select":
        return new Uint8Array([0xf3, dataByte(message.song, "MIDI song")]);
      case "tune-request": return new Uint8Array([0xf6]);
      case "timing-clock": return new Uint8Array([0xf8]);
      case "start": return new Uint8Array([0xfa]);
      case "continue": return new Uint8Array([0xfb]);
      case "stop": return new Uint8Array([0xfc]);
      case "active-sensing": return new Uint8Array([0xfe]);
      case "reset": return new Uint8Array([0xff]);
      case "sysex": {
        if (!(message.data instanceof Uint8Array)) throw new TypeError("MIDI SysEx data must be a Uint8Array.");
        for (const byte of message.data) {
          if (byte > 0x7f) throw new RangeError("MIDI SysEx data bytes must be 7-bit values.");
        }
        const encoded = new Uint8Array(message.data.byteLength + 2);
        encoded[0] = 0xf0;
        encoded.set(message.data, 1);
        encoded[encoded.length - 1] = 0xf7;
        return encoded;
      }
      default:
        throw new TypeError(`Unsupported MIDI message kind: ${String((message as { kind?: unknown }).kind)}.`);
    }
  }
}
