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

type Entry = Readonly<{ tag: number; type: number; count: number; value: number | readonly number[] }>;

const TYPE_BYTE = 1;
const TYPE_ASCII = 2;
const TYPE_SHORT = 3;
const TYPE_LONG = 4;
const TYPE_RATIONAL = 5;
const TYPE_SRATIONAL = 10;

function writeEntry(view: DataView, offset: number, entry: Entry): void {
  view.setUint16(offset, entry.tag, true);
  view.setUint16(offset + 2, entry.type, true);
  view.setUint32(offset + 4, entry.count, true);
  const values = Array.isArray(entry.value) ? entry.value : [entry.value];
  if (entry.type === TYPE_BYTE && entry.count <= 4) {
    for (let index = 0; index < entry.count; index++) view.setUint8(offset + 8 + index, values[index]!);
    return;
  }
  if (entry.type === TYPE_SHORT && entry.count <= 2) {
    for (let index = 0; index < entry.count; index++) view.setUint16(offset + 8 + index * 2, values[index]!, true);
    return;
  }
  if (entry.type === TYPE_LONG && entry.count === 1) {
    view.setUint32(offset + 8, values[0]!, true);
    return;
  }
  view.setUint32(offset + 8, values[0]!, true);
}

function writeIFD(view: DataView, offset: number, entries: readonly Entry[]): void {
  const sorted = [...entries].sort((left, right) => left.tag - right.tag);
  view.setUint16(offset, sorted.length, true);
  sorted.forEach((entry, index) => writeEntry(view, offset + 2 + index * 12, entry));
  view.setUint32(offset + 2 + sorted.length * 12, 0, true);
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): number {
  const encoded = new TextEncoder().encode(`${value}\0`);
  bytes.set(encoded, offset);
  return encoded.length;
}

function writeSRationals(view: DataView, offset: number, values: readonly number[]): void {
  values.forEach((value, index) => {
    view.setInt32(offset + index * 8, Math.round(value * 1_000_000), true);
    view.setInt32(offset + index * 8 + 4, 1_000_000, true);
  });
}

function writeRationals(view: DataView, offset: number, values: readonly [number, number][]): void {
  values.forEach(([numerator, denominator], index) => {
    view.setUint32(offset + index * 8, numerator, true);
    view.setUint32(offset + index * 8 + 4, denominator, true);
  });
}

export function syntheticSensorDNG(options: Readonly<{ orientation?: 1 | 3 | 6 | 8 | null; linearization?: boolean }> = {}): Uint8Array {
  const rootIFD = 8;
  const rawIFD = 256;
  const previewBits = 512;
  const previewPixels = 520;
  const cameraModel = 544;
  const colourMatrix = 592;
  const asShotNeutral = 672;
  const rawPixels = 704;
  const linearizationTable = 768;
  const bytes = new Uint8Array(options.linearization ? 132_000 : 736);
  const view = new DataView(bytes.buffer);

  bytes[0] = 0x49; bytes[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, rootIFD, true);
  view.setUint16(previewBits, 8, true); view.setUint16(previewBits + 2, 8, true); view.setUint16(previewBits + 4, 8, true);
  bytes.set(new Uint8Array([255, 0, 255, 0, 255, 255, 255, 255, 0, 0, 0, 0]), previewPixels);
  const modelLength = writeAscii(bytes, cameraModel, "SynCloudOS Synthetic Bayer DNG");
  writeSRationals(view, colourMatrix, [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  writeRationals(view, asShotNeutral, [[1, 2], [1, 1], [1, 4]]);
  if (options.linearization) {
    for (let value = 0; value < 65_536; value++) view.setUint16(linearizationTable + value * 2, Math.min(65_535, value * 2), true);
  }

  // RGGB sensor values. After black subtraction/white normalization and AsShotNeutral,
  // every channel resolves to the same linear camera value (192 / 959).
  const sensor = [160, 256, 160, 256, 256, 112, 256, 112];
  sensor.forEach((value, index) => view.setUint16(rawPixels + index * 2, value, true));

  const rootEntries: Entry[] = [
    { tag: 256, type: TYPE_LONG, count: 1, value: 2 },
    { tag: 257, type: TYPE_LONG, count: 1, value: 2 },
    { tag: 258, type: TYPE_SHORT, count: 3, value: previewBits },
    { tag: 259, type: TYPE_SHORT, count: 1, value: 1 },
    { tag: 262, type: TYPE_SHORT, count: 1, value: 2 },
    { tag: 273, type: TYPE_LONG, count: 1, value: previewPixels },
    { tag: 277, type: TYPE_SHORT, count: 1, value: 3 },
    { tag: 278, type: TYPE_LONG, count: 1, value: 2 },
    { tag: 279, type: TYPE_LONG, count: 1, value: 12 },
    { tag: 284, type: TYPE_SHORT, count: 1, value: 1 },
    { tag: 330, type: TYPE_LONG, count: 1, value: rawIFD },
    { tag: 50706, type: TYPE_BYTE, count: 4, value: [1, 4, 0, 0] },
    { tag: 50707, type: TYPE_BYTE, count: 4, value: [1, 1, 0, 0] },
    { tag: 50708, type: TYPE_ASCII, count: modelLength, value: cameraModel },
  ];
  const orientation = options.orientation === undefined ? 6 : options.orientation;
  if (orientation !== null) rootEntries.push({ tag: 274, type: TYPE_SHORT, count: 1, value: orientation });
  writeIFD(view, rootIFD, rootEntries);

  const rawEntries: Entry[] = [
    { tag: 256, type: TYPE_LONG, count: 1, value: 4 },
    { tag: 257, type: TYPE_LONG, count: 1, value: 2 },
    { tag: 258, type: TYPE_SHORT, count: 1, value: 16 },
    { tag: 259, type: TYPE_SHORT, count: 1, value: 1 },
    { tag: 262, type: TYPE_SHORT, count: 1, value: 32803 },
    { tag: 273, type: TYPE_LONG, count: 1, value: rawPixels },
    { tag: 277, type: TYPE_SHORT, count: 1, value: 1 },
    { tag: 278, type: TYPE_LONG, count: 1, value: 2 },
    { tag: 279, type: TYPE_LONG, count: 1, value: 16 },
    { tag: 284, type: TYPE_SHORT, count: 1, value: 1 },
    { tag: 33421, type: TYPE_SHORT, count: 2, value: [2, 2] },
    { tag: 33422, type: TYPE_BYTE, count: 4, value: [0, 1, 1, 2] },
    { tag: 50714, type: TYPE_SHORT, count: 1, value: options.linearization ? 128 : 64 },
    { tag: 50717, type: TYPE_SHORT, count: 1, value: options.linearization ? 2046 : 1023 },
    { tag: 50721, type: TYPE_SRATIONAL, count: 9, value: colourMatrix },
    { tag: 50728, type: TYPE_RATIONAL, count: 3, value: asShotNeutral },
    { tag: 50778, type: TYPE_SHORT, count: 1, value: 21 },
  ];
  if (options.linearization) rawEntries.push({ tag: 50712, type: TYPE_SHORT, count: 65_536, value: linearizationTable });
  writeIFD(view, rawIFD, rawEntries);
  return bytes;
}
