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
import { MIFXUniversalPacket } from "./MIFXUniversalPacket";

export type MIFXPrecisionLossPolicy = "reject" | "allow";

export interface MIFXProtocolConversionOptions {
  readonly precisionLoss: MIFXPrecisionLossPolicy;
}

export interface MIFXProtocolConversionResult {
  readonly message: MIFXMessage;
  readonly losses: readonly string[];
}

export class MIFXProtocolLossError extends RangeError {
  readonly losses: readonly string[];

  constructor(losses: readonly string[]) {
    super(`MIDI 2 to MIDI 1 conversion would lose precision: ${losses.join(", ")}.`);
    this.name = "MIFXProtocolLossError";
    this.losses = Object.freeze([...losses]);
  }
}

function scaled(value: number, sourceMaximum: number, targetMaximum: number): Readonly<{ value: number; exact: boolean }> {
  const numerator = BigInt(value) * BigInt(targetMaximum);
  const denominator = BigInt(sourceMaximum);
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const rounded = Number(quotient + (remainder * 2n >= denominator ? 1n : 0n));
  return Object.freeze({ value: rounded, exact: remainder === 0n });
}

function finish(message: MIFXMessage, losses: readonly string[], options: MIFXProtocolConversionOptions): MIFXProtocolConversionResult {
  if (!options || (options.precisionLoss !== "reject" && options.precisionLoss !== "allow"))
    throw new TypeError("MIDI protocol conversion requires an explicit precisionLoss policy.");
  if (losses.length > 0 && options.precisionLoss === "reject") throw new MIFXProtocolLossError(losses);
  return Object.freeze({ message: Object.freeze(message), losses: Object.freeze([...losses]) });
}

export class MIFXProtocolConversion {
  static toMIDI1(packet: MIFXUniversalPacket, options: MIFXProtocolConversionOptions): MIFXProtocolConversionResult {
    if (!(packet instanceof MIFXUniversalPacket)) throw new TypeError("MIDI protocol conversion requires a MIFXUniversalPacket.");
    if (packet.kind === "system" || packet.kind === "midi1-channel-voice")
      return finish(packet.toMIDI1Message(), [], options);
    if (packet.kind !== "midi2-channel-voice")
      throw new TypeError(`${packet.kind} UMP packets have no conversion in the declared MIDI 1 subset.`);

    const message = packet.midi2ChannelVoice();
    switch (message.kind) {
      case "note-on":
      case "note-off": {
        const velocity = scaled(message.velocity, 0xffff, 0x7f);
        return finish(
          { kind: message.kind, channel: message.channel, note: message.note, velocity: velocity.value },
          velocity.exact && message.attributeType === 0 && message.attributeData === 0 ? [] : [
            ...(!velocity.exact ? ["velocity-16-to-7-bit"] : []),
            ...(message.attributeType !== 0 || message.attributeData !== 0 ? ["note-attribute-unrepresentable"] : []),
          ],
          options,
        );
      }
      case "polyphonic-key-pressure": {
        const pressure = scaled(message.pressure, 0xffff_ffff, 0x7f);
        return finish({ kind: message.kind, channel: message.channel, note: message.note, pressure: pressure.value }, pressure.exact ? [] : ["pressure-32-to-7-bit"], options);
      }
      case "control-change": {
        const value = scaled(message.value, 0xffff_ffff, 0x7f);
        return finish({ kind: message.kind, channel: message.channel, controller: message.controller, value: value.value }, value.exact ? [] : ["controller-32-to-7-bit"], options);
      }
      case "channel-pressure": {
        const pressure = scaled(message.pressure, 0xffff_ffff, 0x7f);
        return finish({ kind: message.kind, channel: message.channel, pressure: pressure.value }, pressure.exact ? [] : ["pressure-32-to-7-bit"], options);
      }
      case "pitch-bend": {
        const value = scaled(message.value, 0xffff_ffff, 0x3fff);
        return finish({ kind: message.kind, channel: message.channel, value: value.value }, value.exact ? [] : ["pitch-bend-32-to-14-bit"], options);
      }
    }
  }
}
