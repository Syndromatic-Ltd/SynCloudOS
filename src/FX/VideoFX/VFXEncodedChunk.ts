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

import { MEFXSampleTimingInfo } from "../MediaFX/MEFXSampleTimingInfo";
import { MEFXTime } from "../MediaFX/MEFXTime";

export type VFXEncodedChunkType = "key" | "delta";

export interface VFXEncodedChunkInit {
  readonly type: VFXEncodedChunkType;
  readonly data: Uint8Array;
  readonly timing: MEFXSampleTimingInfo;
  /** Positive WebM BlockGroup end padding; only meaningful for an audio packet. */
  readonly discardPaddingNanoseconds?: number;
}

export interface VFXWebCodecsTiming {
  readonly timestampMicroseconds: number;
  readonly durationMicroseconds: number | null;
  readonly rounded: boolean;
}

const encodedBytes = new WeakMap<VFXEncodedChunk, Uint8Array<ArrayBuffer>>();

function validateInit(init: VFXEncodedChunkInit): void {
  if (!init || typeof init !== "object") throw new TypeError("Encoded video chunk initialization is required.");
  if (init.type !== "key" && init.type !== "delta") throw new TypeError("Encoded video chunk type must be key or delta.");
  if (!(init.data instanceof Uint8Array)) throw new TypeError("Encoded video chunk data must be Uint8Array.");
  if (!(init.timing instanceof MEFXSampleTimingInfo)) throw new TypeError("Encoded video chunk timing must be MEFXSampleTimingInfo.");
  if (init.discardPaddingNanoseconds !== undefined && (!Number.isSafeInteger(init.discardPaddingNanoseconds) || init.discardPaddingNanoseconds < 0 || init.discardPaddingNanoseconds > 1_000_000_000))
    throw new RangeError("Encoded chunk discard padding must be a nonnegative nanosecond duration within one second.");
}

function initializeChunk(chunk: VFXEncodedChunk, init: VFXEncodedChunkInit, data: Uint8Array<ArrayBuffer>): VFXEncodedChunk {
  Object.defineProperties(chunk, {
    type: { value: init.type, enumerable: true },
    timing: { value: init.timing, enumerable: true },
    discardPaddingNanoseconds: { value: init.discardPaddingNanoseconds ?? 0, enumerable: true },
  });
  encodedBytes.set(chunk, data);
  return Object.freeze(chunk);
}

/** Internal demux ownership transfer. The backend must own this allocation and
 * never mutate it again. The public constructor/copyData still isolate callers.
 * Deliberately absent from the public SDK barrel. */
export function ownedVFXEncodedChunk(init: VFXEncodedChunkInit): VFXEncodedChunk {
  validateInit(init);
  if (!(init.data.buffer instanceof ArrayBuffer))
    throw new TypeError('Owned encoded data requires a non-shared ArrayBuffer.');
  return initializeChunk(Object.create(VFXEncodedChunk.prototype) as VFXEncodedChunk,
    init, init.data as Uint8Array<ArrayBuffer>);
}

/** Internal adapter access; deliberately absent from the public SDK barrel. */
export function encodedVFXChunkData(chunk: VFXEncodedChunk): Uint8Array<ArrayBuffer> {
  const data = encodedBytes.get(chunk);
  if (!data) throw new DOMException('Encoded video chunk is unavailable.', 'InvalidStateError');
  return data;
}

function microseconds(time: MEFXTime, name: string): Readonly<{ value: number; rounded: boolean }> {
  if (!(time instanceof MEFXTime) || time.value.kind !== "finite") throw new TypeError(`${name} must be finite.`);
  if (time.value.epoch !== 0n) throw new RangeError(`${name} cannot carry a nonzero epoch across the WebCodecs timestamp boundary.`);
  const converted = time.convertScale(1_000_000, "nearest-even");
  if (converted.value.kind !== "finite") throw new TypeError(`${name} conversion must remain finite.`);
  const value = Number(converted.value.value);
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} exceeds the integral microsecond range.`);
  return Object.freeze({ value, rounded: converted.value.rounded });
}

export class VFXEncodedChunk {
  declare readonly type: VFXEncodedChunkType;
  declare readonly timing: MEFXSampleTimingInfo;
  declare readonly discardPaddingNanoseconds: number;

  constructor(init: VFXEncodedChunkInit) {
    validateInit(init);
    initializeChunk(this, init, new Uint8Array(init.data));
  }

  get byteLength(): number { return encodedBytes.get(this)?.byteLength ?? 0; }

  copyData(): Uint8Array {
    const data = encodedBytes.get(this);
    if (!data) throw new DOMException("Encoded video chunk is unavailable.", "InvalidStateError");
    return data.slice();
  }

  /** Core Media-style sample retiming: new timing metadata, shared immutable data. */
  copyWithNewTiming(timing: MEFXSampleTimingInfo): VFXEncodedChunk {
    if (!(timing instanceof MEFXSampleTimingInfo)) throw new TypeError('Encoded video chunk timing must be MEFXSampleTimingInfo.');
    const data = encodedVFXChunkData(this);
    return initializeChunk(Object.create(VFXEncodedChunk.prototype) as VFXEncodedChunk,
      { type: this.type, timing, data, discardPaddingNanoseconds: this.discardPaddingNanoseconds }, data);
  }

  webCodecsTiming(): VFXWebCodecsTiming {
    const presentation = microseconds(this.timing.presentationTime, "Video presentation time");
    const duration = this.timing.duration ? microseconds(this.timing.duration, "Video duration") : null;
    return Object.freeze({
      timestampMicroseconds: presentation.value,
      durationMicroseconds: duration?.value ?? null,
      rounded: presentation.rounded || (duration?.rounded ?? false),
    });
  }
}
