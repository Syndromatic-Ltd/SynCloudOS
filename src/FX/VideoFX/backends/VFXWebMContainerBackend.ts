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

import { MEFXSampleTimingInfo } from "../../MediaFX/MEFXSampleTimingInfo";
import { MEFXTime } from "../../MediaFX/MEFXTime";
import type {
  VFXContainerBackendReadSession,
  VFXContainerReadLimits,
  VFXContainerReadResult,
  VFXContainerReadableBackend,
  VFXContainerSeekPoint,
} from "../VFXContainerReader";
import { VFXEncodedChunk, ownedVFXEncodedChunk } from "../VFXEncodedChunk";
import type {
  VFXContainerBackendWriter,
  VFXContainerCapability,
  VFXContainerTrack,
} from "../VFXContainerWriter";

const EBML = Object.freeze({
  header: 0x1a45dfa3,
  segment: 0x18538067,
  info: 0x1549a966,
  timecodeScale: 0x2ad7b1,
  muxingApp: 0x4d80,
  writingApp: 0x5741,
  tracks: 0x1654ae6b,
  trackEntry: 0xae,
  trackNumber: 0xd7,
  trackUID: 0x73c5,
  trackType: 0x83,
  codecID: 0x86,
  codecPrivate: 0x63a2,
  codecDelay: 0x56aa,
  seekPreRoll: 0x56bb,
  video: 0xe0,
  pixelWidth: 0xb0,
  pixelHeight: 0xba,
  audio: 0xe1,
  samplingFrequency: 0xb5,
  channels: 0x9f,
  cluster: 0x1f43b675,
  timecode: 0xe7,
  blockGroup: 0xa0,
  block: 0xa1,
  blockDuration: 0x9b,
  discardPadding: 0x75a2,
  referenceBlock: 0xfb,
});

function concat(...parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const byteLength = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(byteLength);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function ebmlId(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 0xffffffff)
    throw new RangeError("EBML id is outside the supported range.");
  const bytes: number[] = [];
  let remaining = value >>> 0;
  do {
    bytes.unshift(remaining & 0xff);
    remaining >>>= 8;
  } while (remaining > 0);
  return Uint8Array.from(bytes);
}

function ebmlVint(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError("EBML value must be a nonnegative safe integer.");
  const big = BigInt(value);
  for (let length = 1; length <= 8; length += 1) {
    const maximum = (1n << BigInt(7 * length)) - 2n;
    if (big > maximum) continue;
    const output = new Uint8Array(length);
    let remaining = big;
    for (let index = length - 1; index >= 0; index -= 1) {
      output[index] = Number(remaining & 0xffn);
      remaining >>= 8n;
    }
    output[0] |= 1 << (8 - length);
    return output;
  }
  throw new RangeError("EBML value exceeds the supported variable integer range.");
}

function unsigned(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError("EBML unsigned integer must be nonnegative.");
  let remaining = BigInt(value);
  const bytes: number[] = [];
  do {
    bytes.unshift(Number(remaining & 0xffn));
    remaining >>= 8n;
  } while (remaining > 0n);
  return Uint8Array.from(bytes);
}

function signed(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < -0x80000000 || value > 0x7fffffff)
    throw new RangeError("EBML signed integer exceeds the supported range.");
  if (value >= -128 && value <= 127) return Uint8Array.of(value & 0xff);
  if (value >= -32768 && value <= 32767)
    return Uint8Array.of((value >> 8) & 0xff, value & 0xff);
  return Uint8Array.of(
    (value >> 24) & 0xff,
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff,
  );
}

function element(id: number, payload: Uint8Array): Uint8Array {
  return concat(ebmlId(id), ebmlVint(payload.byteLength), payload);
}

function uintElement(id: number, value: number): Uint8Array {
  return element(id, unsigned(value));
}

function textElement(id: number, value: string): Uint8Array {
  return element(id, new TextEncoder().encode(value));
}

function floatElement(id: number, value: number): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, value, false);
  return element(id, bytes);
}

function opusHead(channelCount: number, preSkip: number): Uint8Array {
  const bytes = new Uint8Array(19);
  bytes.set(new TextEncoder().encode("OpusHead"));
  const view = new DataView(bytes.buffer);
  view.setUint8(8, 1);
  view.setUint8(9, channelCount);
  view.setUint16(10, preSkip, true);
  view.setUint32(12, 48_000, true);
  return bytes;
}

function webmHeader(): readonly Uint8Array[] {
  const header = element(EBML.header, concat(
    uintElement(0x4286, 1),
    uintElement(0x42f7, 1),
    uintElement(0x42f2, 4),
    uintElement(0x42f3, 8),
    textElement(0x4282, "webm"),
    uintElement(0x4287, 4),
    uintElement(0x4285, 2),
  ));
  const segment = concat(
    ebmlId(EBML.segment),
    Uint8Array.of(0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff),
  );
  const info = element(EBML.info, concat(
    uintElement(EBML.timecodeScale, 1000),
    textElement(EBML.muxingApp, "SynCloudOS VideoFX"),
    textElement(EBML.writingApp, "SynCloudOS VideoFX"),
  ));
  return Object.freeze([header, segment, info]);
}

// WebM VP9 CodecPrivate features: ID, byte length, value. Preserve a fully
// qualified WebCodecs configuration instead of inventing a profile or level.
// https://www.webmproject.org/docs/container/#vp9-codec-feature-metadata-codecprivate
// This bounded backend supports SDR profile 0 / 8 bit, in the four-field form.
const vp9Levels = new Set([10, 11, 20, 21, 30, 31, 40, 41, 50, 51, 52, 60, 61, 62]);
function vp9Level(codec: string): number | null {
  const match = /^vp09\.00\.(\d{2})\.08$/i.exec(codec);
  return match && vp9Levels.has(Number(match[1])) ? Number(match[1]) : null;
}

function readVP9Codec(privateData: Uint8Array | undefined): string {
  if (!privateData)
    throw new DOMException('Restricted VP9 WebM requires explicit profile, level and bit-depth metadata.', 'NotSupportedError');
  const features = new Map<number, number>();
  for (let offset = 0; offset < privateData.length;) {
    if (offset + 2 > privateData.length) throw new TypeError('Truncated VP9 codec feature.');
    const id = privateData[offset++]!, length = privateData[offset++]!;
    if ((id & 0x80) !== 0 || offset + length > privateData.length)
      throw new TypeError('Invalid VP9 codec feature header.');
    if (id >= 1 && id <= 4) {
      if (length !== 1 || features.has(id)) throw new TypeError('Invalid or duplicate VP9 codec feature.');
      features.set(id, privateData[offset]!);
    }
    offset += length;
  }
  if (features.get(1) !== 0 || features.get(3) !== 8 || !vp9Levels.has(features.get(2)!))
    throw new DOMException('Restricted VP9 WebM requires profile 0, a declared valid level, and eight-bit video.', 'NotSupportedError');
  if (features.has(4) && features.get(4)! > 1)
    throw new DOMException('VP9 profile 0 requires 4:2:0 chroma subsampling.', 'NotSupportedError');
  return `vp09.00.${features.get(2)}.08`;
}

function trackElement(track: VFXContainerTrack): Uint8Array {
  const level = track.kind === 'video' ? vp9Level(track.codec) : null;
  const properties = track.kind === "video"
    ? [
        uintElement(EBML.trackType, 1),
        textElement(EBML.codecID, level === null ? "V_VP8" : "V_VP9"),
        ...(level === null ? [] : [element(EBML.codecPrivate, Uint8Array.of(1, 1, 0, 2, 1, level, 3, 1, 8))]),
        element(EBML.video, concat(uintElement(EBML.pixelWidth, track.codedWidth), uintElement(EBML.pixelHeight, track.codedHeight))),
      ]
    : [
        uintElement(EBML.trackType, 2),
        textElement(EBML.codecID, "A_OPUS"),
        element(EBML.codecPrivate, opusHead(track.channelCount, track.preSkip)),
        uintElement(EBML.codecDelay, Math.round(track.preSkip * 1_000_000_000 / 48_000)),
        uintElement(EBML.seekPreRoll, 80_000_000),
        element(EBML.audio, concat(floatElement(EBML.samplingFrequency, track.sampleRate), uintElement(EBML.channels, track.channelCount))),
      ];
  const entry = element(EBML.trackEntry, concat(
    uintElement(EBML.trackNumber, track.id),
    uintElement(EBML.trackUID, track.id),
    ...properties,
  ));
  return element(EBML.tracks, entry);
}

function blockPayload(trackId: number, data: Uint8Array): Uint8Array {
  return concat(ebmlVint(trackId), Uint8Array.of(0, 0, 0), data);
}

function clusterElement(track: VFXContainerTrack, chunk: VFXEncodedChunk): Uint8Array {
  const timing = chunk.webCodecsTiming();
  if (track.kind === "audio" && chunk.type !== "key")
    throw new TypeError("Opus audio packets must be independently decodable key chunks.");
  if (track.kind === "video" && chunk.discardPaddingNanoseconds !== 0)
    throw new TypeError("DiscardPadding belongs to an audio packet.");
  if (timing.timestampMicroseconds < 0)
    throw new RangeError("Restricted WebM output requires nonnegative timestamps.");
  const group: Uint8Array[] = [
    element(EBML.block, blockPayload(track.id, chunk.copyData())),
  ];
  if (timing.durationMicroseconds !== null) {
    if (timing.durationMicroseconds < 0)
      throw new RangeError("Restricted WebM output requires nonnegative durations.");
    group.push(uintElement(EBML.blockDuration, timing.durationMicroseconds));
  }
  if (chunk.type === "delta") group.push(element(EBML.referenceBlock, signed(-1)));
  if (chunk.discardPaddingNanoseconds > 0) group.push(element(EBML.discardPadding, signed(chunk.discardPaddingNanoseconds)));
  return element(EBML.cluster, concat(
    uintElement(EBML.timecode, timing.timestampMicroseconds),
    element(EBML.blockGroup, concat(...group)),
  ));
}

class WebMWriter implements VFXContainerBackendWriter {
  constructor(readonly track: VFXContainerTrack) {}

  start(): readonly Uint8Array[] {
    return Object.freeze([...webmHeader(), trackElement(this.track)]);
  }

  write(chunk: VFXEncodedChunk): readonly Uint8Array[] {
    return Object.freeze([clusterElement(this.track, chunk)]);
  }

  close(): readonly Uint8Array[] {
    return Object.freeze([]);
  }
}

interface ElementHeader {
  readonly id: number;
  readonly size: number | null;
  readonly headerLength: number;
}

function markerLength(first: number, maximum: number): number {
  for (let length = 1; length <= maximum; length += 1)
    if ((first & (1 << (8 - length))) !== 0) return length;
  throw new TypeError("Malformed EBML variable-length integer.");
}

function readElementHeader(bytes: Uint8Array, offset = 0): ElementHeader | null {
  if (offset >= bytes.byteLength) return null;
  const idLength = markerLength(bytes[offset]!, 4);
  if (offset + idLength >= bytes.byteLength) return null;
  let id = 0;
  for (let index = 0; index < idLength; index += 1)
    id = id * 256 + bytes[offset + index]!;
  const sizeOffset = offset + idLength;
  const sizeLength = markerLength(bytes[sizeOffset]!, 8);
  if (sizeOffset + sizeLength > bytes.byteLength) return null;
  const markerMask = (1 << (8 - sizeLength)) - 1;
  let value = BigInt(bytes[sizeOffset]! & markerMask);
  for (let index = 1; index < sizeLength; index += 1)
    value = (value << 8n) | BigInt(bytes[sizeOffset + index]!);
  const maximum = (1n << BigInt(7 * sizeLength)) - 1n;
  if (value === maximum)
    return Object.freeze({ id, size: null, headerLength: idLength + sizeLength });
  const size = Number(value);
  if (!Number.isSafeInteger(size))
    throw new RangeError("EBML element size exceeds the safe integer range.");
  return Object.freeze({ id, size, headerLength: idLength + sizeLength });
}

function childElements(payload: Uint8Array, maximumElementBytes: number) {
  const output: Array<{ id: number; payload: Uint8Array; offset: number }> = [];
  let offset = 0;
  while (offset < payload.byteLength) {
    const header = readElementHeader(payload, offset);
    if (!header || header.size === null) throw new TypeError("Malformed nested WebM element.");
    if (header.size > maximumElementBytes)
      throw new DOMException("WebM element exceeds the configured element limit.", "QuotaExceededError");
    const start = offset + header.headerLength, end = start + header.size;
    if (end > payload.byteLength) throw new TypeError("Malformed truncated WebM element.");
    // Nested elements borrow the parser-owned input during synchronous parsing.
    // VFXEncodedChunk takes its own copy at the public ownership boundary.
    output.push(Object.freeze({ id: header.id, payload: payload.subarray(start, end), offset }));
    offset = end;
  }
  return Object.freeze(output);
}

function decodeUnsigned(bytes: Uint8Array): number {
  if (bytes.byteLength < 1 || bytes.byteLength > 8)
    throw new TypeError("Malformed WebM unsigned integer.");
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric))
    throw new RangeError("WebM integer exceeds the safe integer range.");
  return numeric;
}

function decodeFloat(bytes: Uint8Array): number {
  if (bytes.byteLength !== 8) throw new TypeError("Restricted WebM audio requires a float64 sample rate.");
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getFloat64(0, false);
}

function decodeSigned(bytes: Uint8Array): number {
  if (bytes.byteLength < 1 || bytes.byteLength > 4)
    throw new TypeError("Malformed WebM signed integer.");
  let value = 0;
  for (const byte of bytes) value = value * 256 + byte;
  const bits = bytes.byteLength * 8;
  if ((bytes[0]! & 0x80) !== 0) value -= 2 ** bits;
  return value;
}

function decodeBlock(bytes: Uint8Array) {
  if (bytes.byteLength < 4) throw new TypeError("Malformed WebM Block.");
  const trackLength = markerLength(bytes[0]!, 8);
  if (trackLength !== 1 || bytes.byteLength < trackLength + 3)
    throw new DOMException("Restricted WebM reader supports one-byte track numbers only.", "NotSupportedError");
  const track = bytes[0]! & 0x7f;
  const raw = (bytes[trackLength]! << 8) | bytes[trackLength + 1]!;
  const relativeTimecode = (raw & 0x8000) !== 0 ? raw - 0x10000 : raw;
  return Object.freeze({
    track,
    relativeTimecode,
    data: bytes.subarray(trackLength + 3),
  });
}

class WebMReader implements VFXContainerBackendReadSession {
  readonly #limits: VFXContainerReadLimits;
  #buffer = new Uint8Array();
  #phase: "ebml" | "segment" | "children" = "ebml";
  #track: VFXContainerTrack | null = null;
  #chunks: VFXEncodedChunk[] = [];
  #seekIndex: VFXContainerSeekPoint[] = [];
  #streamOffset = 0;

  constructor(limits: VFXContainerReadLimits) {
    this.#limits = limits;
  }

  push(bytes: Uint8Array): void {
    if (!(bytes instanceof Uint8Array)) throw new TypeError("WebM reader input must be Uint8Array.");
    if (this.#buffer.byteLength + bytes.byteLength > this.#limits.maximumBufferedBytes)
      throw new DOMException("WebM buffered input exceeds the configured limit.", "QuotaExceededError");
    this.#buffer = concat(this.#buffer, bytes);
    this.#parseAvailable();
  }

  finish(): VFXContainerReadResult {
    this.#parseAvailable();
    if (this.#phase !== "children" || this.#buffer.byteLength !== 0)
      throw new TypeError("Malformed or truncated WebM stream.");
    if (!this.#track) throw new TypeError("WebM stream is missing a supported track.");
    return Object.freeze({
      container: "webm",
      track: this.#track,
      chunks: Object.freeze([...this.#chunks]),
      seekIndex: Object.freeze([...this.#seekIndex]),
    });
  }

  #parseAvailable(): void {
    while (this.#buffer.byteLength > 0) {
      const header = readElementHeader(this.#buffer);
      if (!header) return;
      if (this.#phase === "segment") {
        if (header.id !== EBML.segment || header.size !== null)
          throw new TypeError("Restricted WebM stream requires an unknown-size Segment.");
        this.#consume(header.headerLength);
        this.#phase = "children";
        continue;
      }
      if (header.size === null) throw new TypeError("Unexpected unknown-size WebM element.");
      if (header.size > this.#limits.maximumElementBytes)
        throw new DOMException("WebM element exceeds the configured element limit.", "QuotaExceededError");
      const total = header.headerLength + header.size;
      if (total > this.#limits.maximumBufferedBytes)
        throw new DOMException("WebM element exceeds the configured buffer limit.", "QuotaExceededError");
      if (this.#buffer.byteLength < total) return;
      const payload = this.#buffer.subarray(header.headerLength, total);
      const byteOffset = this.#streamOffset;

      if (this.#phase === "ebml") {
        if (header.id !== EBML.header) throw new TypeError("WebM stream is missing the EBML header.");
        const docType = childElements(payload, this.#limits.maximumElementBytes)
          .find(item => item.id === 0x4282);
        if (!docType || new TextDecoder().decode(docType.payload) !== "webm")
          throw new TypeError("EBML document is not WebM.");
        this.#consume(total);
        this.#phase = "segment";
        continue;
      }

      if (header.id === EBML.info) this.#parseInfo(payload);
      else if (header.id === EBML.tracks) this.#parseTracks(payload);
      else if (header.id === EBML.cluster) this.#parseCluster(payload, byteOffset);
      this.#consume(total);
    }
  }

  #parseInfo(payload: Uint8Array): void {
    const scale = childElements(payload, this.#limits.maximumElementBytes)
      .find(item => item.id === EBML.timecodeScale);
    if (scale && decodeUnsigned(scale.payload) !== 1000)
      throw new DOMException("Restricted WebM reader supports one-microsecond timecodes only.", "NotSupportedError");
  }

  #parseTracks(payload: Uint8Array): void {
    const entries = childElements(payload, this.#limits.maximumElementBytes).filter(item => item.id === EBML.trackEntry);
    if (entries.length !== 1 || this.#track) throw new DOMException("Restricted WebM reader requires exactly one track.", "NotSupportedError");
    const entry = entries[0]!;
    const fields = childElements(entry.payload, this.#limits.maximumElementBytes);
    const number = fields.find(item => item.id === EBML.trackNumber);
    const type = fields.find(item => item.id === EBML.trackType);
    const codec = fields.find(item => item.id === EBML.codecID);
    if (!number || !type || !codec) throw new TypeError("WebM track metadata is incomplete.");
    const codecId = new TextDecoder().decode(codec.payload);
    const trackType = decodeUnsigned(type.payload);
    if (trackType === 1) {
      const video = fields.find(item => item.id === EBML.video);
      if (!video) throw new TypeError("WebM video track is missing dimensions.");
      const videoFields = childElements(video.payload, this.#limits.maximumElementBytes);
      const width = videoFields.find(item => item.id === EBML.pixelWidth);
      const height = videoFields.find(item => item.id === EBML.pixelHeight);
      if (!width || !height) throw new TypeError("WebM video track is missing dimensions.");
      const configuredCodec = codecId === 'V_VP9'
        ? readVP9Codec(fields.find(item => item.id === EBML.codecPrivate)?.payload)
        : codecId === 'V_VP8' ? 'vp8' : codecId;
      this.#track = Object.freeze({ id: decodeUnsigned(number.payload), kind: "video", codec: configuredCodec,
        codedWidth: decodeUnsigned(width.payload), codedHeight: decodeUnsigned(height.payload), timescale: 1_000_000 });
      return;
    }
    if (trackType !== 2 || codecId !== "A_OPUS") throw new DOMException("Unsupported WebM track codec.", "NotSupportedError");
    const audio = fields.find(item => item.id === EBML.audio);
    const privateData = fields.find(item => item.id === EBML.codecPrivate);
    const delay = fields.find(item => item.id === EBML.codecDelay);
    const preRoll = fields.find(item => item.id === EBML.seekPreRoll);
    if (!audio || !privateData || !delay || !preRoll) throw new TypeError("Opus WebM track is missing decoder metadata.");
    const audioFields = childElements(audio.payload, this.#limits.maximumElementBytes);
    const rate = audioFields.find(item => item.id === EBML.samplingFrequency);
    const channels = audioFields.find(item => item.id === EBML.channels);
    if (!rate || !channels) throw new TypeError("Opus WebM audio format is incomplete.");
    const header = privateData.payload;
    if (header.byteLength !== 19 || new TextDecoder().decode(header.subarray(0, 8)) !== "OpusHead")
      throw new TypeError("Unsupported Opus identification header.");
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const channelCount = decodeUnsigned(channels.payload);
    const preSkip = view.getUint16(10, true);
    if (view.getUint8(8) !== 1 || view.getUint8(9) !== channelCount || view.getUint32(12, true) !== 48_000 || view.getInt16(16, true) !== 0 || view.getUint8(18) !== 0 || decodeFloat(rate.payload) !== 48_000 ||
        Math.abs(decodeUnsigned(delay.payload) - Math.round(preSkip * 1_000_000_000 / 48_000)) > 1 || decodeUnsigned(preRoll.payload) < 80_000_000)
      throw new DOMException("Unsupported Opus WebM decoder configuration.", "NotSupportedError");
    this.#track = Object.freeze({ id: decodeUnsigned(number.payload), kind: "audio", codec: "opus", sampleRate: 48_000, channelCount, preSkip, timescale: 1_000_000 });
  }

  #parseCluster(payload: Uint8Array, byteOffset: number): void {
    if (!this.#track) throw new TypeError("WebM Cluster arrived before track metadata.");
    const fields = childElements(payload, this.#limits.maximumElementBytes);
    const timecode = fields.find(item => item.id === EBML.timecode);
    if (!timecode) throw new TypeError("WebM Cluster is missing Timecode.");
    const base = decodeUnsigned(timecode.payload);
    for (const group of fields.filter(item => item.id === EBML.blockGroup)) {
      const groupFields = childElements(group.payload, this.#limits.maximumElementBytes);
      const blockElement = groupFields.find(item => item.id === EBML.block);
      if (!blockElement) throw new TypeError("WebM BlockGroup is missing Block.");
      const block = decodeBlock(blockElement.payload);
      if (block.track !== this.#track.id) continue;
      const durationElement = groupFields.find(item => item.id === EBML.blockDuration);
      const duration = durationElement ? decodeUnsigned(durationElement.payload) : null;
      const reference = groupFields.find(item => item.id === EBML.referenceBlock);
      if (reference) decodeSigned(reference.payload);
      if (this.#track.kind === "audio" && reference) throw new TypeError("Opus WebM packet must be a key chunk.");
      const paddingElement = groupFields.find(item => item.id === EBML.discardPadding);
      const discardPaddingNanoseconds = paddingElement ? decodeSigned(paddingElement.payload) : 0;
      if (discardPaddingNanoseconds < 0 || discardPaddingNanoseconds > 1_000_000_000 || this.#track.kind === "video" && discardPaddingNanoseconds !== 0)
        throw new DOMException("Unsupported WebM discard padding.", "NotSupportedError");
      const timestamp = base + block.relativeTimecode;
      if (!Number.isSafeInteger(timestamp) || timestamp < 0)
        throw new RangeError("WebM timestamp is outside the supported range.");
      // push() copied the caller's bytes; parsing only advances immutable views.
      // All packets can retain that one allocation rather than copying it again.
      const chunk = ownedVFXEncodedChunk({
        type: reference ? "delta" : "key",
        data: block.data,
        discardPaddingNanoseconds,
        timing: new MEFXSampleTimingInfo({
          presentationTime: MEFXTime.finite(BigInt(timestamp), 1_000_000),
          duration: duration === null ? null : MEFXTime.finite(BigInt(duration), 1_000_000),
        }),
      });
      if (this.#chunks.length >= this.#limits.maximumChunks)
        throw new DOMException("WebM packet count exceeds the configured limit.", "QuotaExceededError");
      this.#chunks.push(chunk);
      if (!reference)
        this.#seekIndex.push(Object.freeze({ timestampMicroseconds: timestamp, byteOffset }));
    }
  }

  #consume(length: number): void {
    // Advancing a cursor must not copy the entire remaining segment for every
    // packet. Release the backing allocation as soon as the buffer is empty.
    this.#buffer = length === this.#buffer.byteLength ? new Uint8Array() : this.#buffer.subarray(length);
    this.#streamOffset += length;
  }
}

const CAPABILITIES: readonly VFXContainerCapability[] = Object.freeze([
  Object.freeze({
    container: "webm",
    codec: "vp8",
    read: true,
    write: true,
    streaming: true,
    seekIndex: true,
    provenance: "built-in-restricted-webm-vp8",
  }),
  Object.freeze({
    container: "webm", codec: "opus", read: true, write: true, streaming: true, seekIndex: true,
    provenance: "built-in-restricted-webm-opus",
  }),
  Object.freeze({
    container: 'webm', codec: 'vp09', read: true, write: true, streaming: true, seekIndex: true,
    provenance: 'built-in-restricted-webm-vp9-profile0-8bit',
  }),
]);

export class VFXWebMContainerBackend implements VFXContainerReadableBackend {
  readonly container = "webm";
  readonly capabilities = CAPABILITIES;

  supports(track: VFXContainerTrack, operation: "read" | "write"): boolean {
    if (!track || track.timescale !== 1_000_000) return false;
    if (track.kind === "video") {
      const codec = track.codec.toLowerCase() === 'vp8' ? 'vp8' : vp9Level(track.codec) !== null ? 'vp09' : null;
      return codec !== null && this.capabilities.some(capability => capability.codec === codec && capability[operation]);
    }
    return track.kind === "audio" && track.codec.toLowerCase() === "opus"
      && track.sampleRate === 48_000 && (track.channelCount === 1 || track.channelCount === 2)
      && Number.isSafeInteger(track.preSkip) && track.preSkip >= 0 && track.preSkip <= 65_535
      && this.capabilities.some(capability => capability.codec === "opus" && capability[operation]);
  }

  createWriter(track: VFXContainerTrack): VFXContainerBackendWriter {
    if (!this.supports(track, "write"))
      throw new DOMException("Unsupported codec/container combination for restricted WebM.", "NotSupportedError");
    return new WebMWriter(track);
  }

  createReader(limits: VFXContainerReadLimits): VFXContainerBackendReadSession {
    return new WebMReader(limits);
  }
}
