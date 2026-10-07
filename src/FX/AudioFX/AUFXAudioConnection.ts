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

import type { AUFXAudioFormat } from "./AUFXAudioFormat";
import type { AUFXAudioNode } from "./AUFXAudioNode";

export type AUFXAudioChannelMap = readonly (readonly number[])[];

export type AUFXAudioConnectionOptions = Readonly<{
  sourceBus?: number;
  destinationBus?: number;
  channelMap?: AUFXAudioChannelMap;
}>;

function identityChannelMap(sourceChannels: number, destinationChannels: number): AUFXAudioChannelMap {
  if (sourceChannels === 1) return Object.freeze(Array.from({ length: destinationChannels }, () => Object.freeze([1])));
  if (destinationChannels === 1) return Object.freeze([Object.freeze(Array.from({ length: sourceChannels }, () => 1 / sourceChannels))]);
  return Object.freeze(Array.from({ length: destinationChannels }, (_, destination) => Object.freeze(Array.from({ length: sourceChannels }, (_, source) => source === Math.min(destination, sourceChannels - 1) ? 1 : 0))));
}

export function normalizeAUFXAudioChannelMap(sourceChannels: number, destinationChannels: number, value?: AUFXAudioChannelMap): AUFXAudioChannelMap {
  const map = value ?? identityChannelMap(sourceChannels, destinationChannels);
  if (!Array.isArray(map) || map.length !== destinationChannels) throw new RangeError("Audio channel map must provide one row per destination channel.");
  const normalized = map.map(row => {
    if (!Array.isArray(row) || row.length !== sourceChannels || row.some(weight => !Number.isFinite(weight) || Math.abs(weight) > 16)) throw new RangeError("Audio channel map has an invalid source-channel weight matrix.");
    return Object.freeze([...row]);
  });
  return Object.freeze(normalized);
}

/** Immutable portable graph edge. It carries no browser/native node authority. */
export class AUFXAudioConnection {
  readonly channelMap: AUFXAudioChannelMap;
  readonly negotiatedFormat: AUFXAudioFormat;

  constructor(
    readonly id: number,
    readonly source: AUFXAudioNode,
    readonly destination: AUFXAudioNode,
    readonly sourceBus: number,
    readonly destinationBus: number,
    readonly sourceFormat: AUFXAudioFormat,
    readonly destinationFormat: AUFXAudioFormat,
    channelMap?: AUFXAudioChannelMap,
  ) {
    if (!Number.isSafeInteger(id) || id < 1) throw new RangeError("Invalid audio connection identity.");
    if (!Number.isInteger(sourceBus) || sourceBus < 0 || sourceBus >= source.outputBusCount) throw new RangeError("Invalid audio source bus index.");
    if (!Number.isInteger(destinationBus) || destinationBus < 0 || destinationBus >= destination.inputBusCount) throw new RangeError("Invalid audio destination bus index.");
    this.channelMap = normalizeAUFXAudioChannelMap(sourceFormat.channelCount, destinationFormat.channelCount, channelMap);
    this.negotiatedFormat = destinationFormat;
    Object.freeze(this);
  }
}
