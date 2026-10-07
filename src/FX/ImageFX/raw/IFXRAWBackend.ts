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

import { GFXFloatImage } from "../../GraphicsFX/GFXFloatImage";
import {
  IFXRAWMetadata,
  type IFXRAWCFA,
  type IFXRAWCFAColor,
  type IFXRAWOrientation,
} from "./IFXRAWMetadata";

const TIFF_BYTE = 1;
const TIFF_ASCII = 2;
const TIFF_SHORT = 3;
const TIFF_LONG = 4;
const TIFF_RATIONAL = 5;
const TIFF_UNDEFINED = 7;
const TIFF_SLONG = 9;
const TIFF_SRATIONAL = 10;
const TYPE_BYTES = new Map<number, number>([
  [TIFF_BYTE, 1], [TIFF_ASCII, 1], [TIFF_SHORT, 2], [TIFF_LONG, 4], [TIFF_RATIONAL, 8],
  [TIFF_UNDEFINED, 1], [TIFF_SLONG, 4], [TIFF_SRATIONAL, 8],
]);

const TAG_IMAGE_WIDTH = 256;
const TAG_IMAGE_HEIGHT = 257;
const TAG_BITS_PER_SAMPLE = 258;
const TAG_COMPRESSION = 259;
const TAG_PHOTOMETRIC = 262;
const TAG_STRIP_OFFSETS = 273;
const TAG_ORIENTATION = 274;
const TAG_SAMPLES_PER_PIXEL = 277;
const TAG_ROWS_PER_STRIP = 278;
const TAG_STRIP_BYTE_COUNTS = 279;
const TAG_PLANAR_CONFIGURATION = 284;
const TAG_SUB_IFDS = 330;
const TAG_CFA_REPEAT_PATTERN_DIM = 33421;
const TAG_CFA_PATTERN = 33422;
const TAG_DNG_VERSION = 50706;
const TAG_DNG_BACKWARD_VERSION = 50707;
const TAG_UNIQUE_CAMERA_MODEL = 50708;
const TAG_CFA_PLANE_COLOR = 50710;
const TAG_CFA_LAYOUT = 50711;
const TAG_LINEARIZATION_TABLE = 50712;
const TAG_BLACK_LEVEL_REPEAT_DIM = 50713;
const TAG_BLACK_LEVEL = 50714;
const TAG_BLACK_LEVEL_DELTA_H = 50715;
const TAG_BLACK_LEVEL_DELTA_V = 50716;
const TAG_WHITE_LEVEL = 50717;
const TAG_DEFAULT_CROP_ORIGIN = 50719;
const TAG_DEFAULT_CROP_SIZE = 50720;
const TAG_COLOR_MATRIX_1 = 50721;
const TAG_CAMERA_CALIBRATION_1 = 50723;
const TAG_REDUCTION_MATRIX_1 = 50725;
const TAG_AS_SHOT_NEUTRAL = 50728;
const TAG_AS_SHOT_WHITE_XY = 50729;
const TAG_BASELINE_EXPOSURE = 50730;
const TAG_ACTIVE_AREA = 50829;
const TAG_CALIBRATION_ILLUMINANT_1 = 50778;
const TAG_OPCODE_LIST_1 = 51008;
const TAG_OPCODE_LIST_2 = 51009;
const TAG_OPCODE_LIST_3 = 51022;
const TAG_TILE_WIDTH = 322;
const TAG_TILE_LENGTH = 323;
const TAG_TILE_OFFSETS = 324;
const TAG_TILE_BYTE_COUNTS = 325;

const MAX_INPUT_BYTES = 128 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
const MAX_IFD_ENTRIES = 256;
const MAX_SUB_IFDS = 4;
const MAX_TAG_PAYLOAD_BYTES = 1024 * 1024;
const MAX_LINEARIZATION_VALUES = 65_536;
const DECODER = Object.freeze({ name: "ImageFX Portable DNG", version: "1", model: "classic-tiff-uncompressed-bayer" });
const XYZ_D65_TO_LINEAR_SRGB = Object.freeze([
  3.2404542, -1.5371385, -0.4985314,
  -0.969266, 1.8760108, 0.041556,
  0.0556434, -0.2040259, 1.0572252,
]);

export type IFXRAWUnsupportedReason =
  | "format"
  | "byte-order"
  | "compression"
  | "bits-per-sample"
  | "layout"
  | "cfa-pattern"
  | "camera-metadata"
  | "camera-opcodes"
  | "calibration-illuminant"
  | "orientation";

export class IFXRAWUnsupportedError extends Error {
  readonly name = "IFXRAWUnsupportedError";
  readonly reason: IFXRAWUnsupportedReason;
  readonly cameraModel: string | null;

  constructor(reason: IFXRAWUnsupportedReason, message: string, cameraModel: string | null = null) {
    super(message);
    this.reason = reason;
    this.cameraModel = cameraModel;
  }
}

export type IFXRAWDecodeErrorCode = "invalid-header" | "truncated" | "invalid-metadata" | "bounds";

export class IFXRAWDecodeError extends Error {
  readonly name = "IFXRAWDecodeError";
  readonly code: IFXRAWDecodeErrorCode;

  constructor(code: IFXRAWDecodeErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export interface IFXRAWBackendCapabilities {
  readonly backend: "portable-dng";
  readonly decoder: typeof DECODER;
  readonly formats: readonly ["dng"];
  readonly byteOrders: readonly ["little-endian"];
  readonly compressions: readonly ["uncompressed"];
  readonly bitsPerSample: readonly [16];
  readonly cfaPatterns: readonly IFXRAWCFA[];
  readonly orientations: readonly IFXRAWOrientation[];
  readonly outputColourSpaces: readonly ["linear-srgb"];
  readonly outputSampleFormats: readonly ["float32"];
  readonly maximumInputBytes: number;
  readonly maximumOutputBytes: number;
  readonly embeddedPreviewDevelopment: false;
}

export interface IFXRAWDevelopmentOptions {
  readonly exposureEV?: number;
  readonly whiteBalance?: "as-shot" | "none";
  readonly signal?: AbortSignal;
}

export interface IFXRAWDevelopmentProvenance {
  readonly source: "sensor-plane";
  readonly embeddedPreviewUsed: false;
  readonly sensorIFDOffset: number;
  readonly demosaic: "bilinear-bayer";
  readonly orientationApplied: true;
  readonly decoder: typeof DECODER;
}

export interface IFXRAWDevelopmentResult {
  readonly image: GFXFloatImage;
  readonly metadata: IFXRAWMetadata;
  readonly provenance: IFXRAWDevelopmentProvenance;
}

export interface IFXRAWBackend {
  readonly capabilities: IFXRAWBackendCapabilities;
  inspect(source: Uint8Array): IFXRAWMetadata;
  develop(source: Uint8Array, options?: IFXRAWDevelopmentOptions): Promise<IFXRAWDevelopmentResult>;
}

interface TIFFTag {
  readonly tag: number;
  readonly type: number;
  readonly count: number;
  readonly dataOffset: number;
  readonly byteLength: number;
}

interface TIFFIFD {
  readonly offset: number;
  readonly tags: ReadonlyMap<number, TIFFTag>;
}

interface ParsedDNG {
  readonly metadata: IFXRAWMetadata;
  readonly view: DataView;
  readonly sensorOffset: number;
  readonly linearization: Uint16Array | null;
  readonly cfaValues: readonly [number, number, number, number];
}

function checkedProduct(left: number, right: number, message: string): number {
  const result = left * right;
  if (!Number.isSafeInteger(result) || result < 0) throw new IFXRAWDecodeError("bounds", message);
  return result;
}

function ensureRange(offset: number, length: number, total: number, message: string): void {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset > total - length) {
    throw new IFXRAWDecodeError("truncated", message);
  }
}

function parseIFD(view: DataView, offset: number): TIFFIFD {
  ensureRange(offset, 2, view.byteLength, "DNG IFD header is truncated.");
  const count = view.getUint16(offset, true);
  if (count > MAX_IFD_ENTRIES) throw new IFXRAWDecodeError("bounds", "DNG IFD contains too many metadata entries.");
  const tableBytes = 2 + count * 12 + 4;
  ensureRange(offset, tableBytes, view.byteLength, "DNG IFD table is truncated.");
  const tags = new Map<number, TIFFTag>();
  for (let index = 0; index < count; index++) {
    const entry = offset + 2 + index * 12;
    const tag = view.getUint16(entry, true);
    const type = view.getUint16(entry + 2, true);
    const valueCount = view.getUint32(entry + 4, true);
    const typeBytes = TYPE_BYTES.get(type);
    if (!typeBytes) throw new IFXRAWUnsupportedError("camera-metadata", `DNG TIFF field type ${type} is unsupported.`);
    const byteLength = checkedProduct(valueCount, typeBytes, "DNG metadata value is too large.");
    if (byteLength > MAX_TAG_PAYLOAD_BYTES) throw new IFXRAWDecodeError("bounds", "DNG metadata value exceeds the bounded parser limit.");
    const dataOffset = byteLength <= 4 ? entry + 8 : view.getUint32(entry + 8, true);
    ensureRange(dataOffset, byteLength, view.byteLength, `DNG tag ${tag} points outside the file.`);
    if (tags.has(tag)) throw new IFXRAWDecodeError("invalid-metadata", `DNG tag ${tag} is duplicated.`);
    tags.set(tag, Object.freeze({ tag, type, count: valueCount, dataOffset, byteLength }));
  }
  const nextOffset = view.getUint32(offset + 2 + count * 12, true);
  if (nextOffset !== 0) throw new IFXRAWUnsupportedError("layout", "Multi-page TIFF/DNG IFD chains are outside the portable RAW subset.");
  return Object.freeze({ offset, tags });
}

function tag(ifd: TIFFIFD, tagNumber: number): TIFFTag | null {
  return ifd.tags.get(tagNumber) ?? null;
}

function inheritedTag(sensor: TIFFIFD, root: TIFFIFD, tagNumber: number): TIFFTag | null {
  return tag(sensor, tagNumber) ?? tag(root, tagNumber);
}

function requireTag(ifd: TIFFIFD, tagNumber: number, name: string): TIFFTag {
  const value = tag(ifd, tagNumber);
  if (!value) throw new IFXRAWDecodeError("invalid-metadata", `DNG ${name} tag is required.`);
  return value;
}

function requireInheritedTag(sensor: TIFFIFD, root: TIFFIFD, tagNumber: number, name: string): TIFFTag {
  const value = inheritedTag(sensor, root, tagNumber);
  if (!value) throw new IFXRAWDecodeError("invalid-metadata", `DNG ${name} tag is required.`);
  return value;
}

function unsignedValues(view: DataView, value: TIFFTag): number[] {
  if (![TIFF_BYTE, TIFF_SHORT, TIFF_LONG].includes(value.type)) {
    throw new IFXRAWDecodeError("invalid-metadata", `DNG tag ${value.tag} requires an unsigned integer TIFF type.`);
  }
  const output: number[] = [];
  for (let index = 0; index < value.count; index++) {
    const offset = value.dataOffset + index * (value.type === TIFF_BYTE ? 1 : value.type === TIFF_SHORT ? 2 : 4);
    output.push(value.type === TIFF_BYTE ? view.getUint8(offset) : value.type === TIFF_SHORT ? view.getUint16(offset, true) : view.getUint32(offset, true));
  }
  return output;
}

function numericValues(view: DataView, value: TIFFTag): number[] {
  if ([TIFF_BYTE, TIFF_SHORT, TIFF_LONG].includes(value.type)) return unsignedValues(view, value);
  if (value.type !== TIFF_RATIONAL && value.type !== TIFF_SRATIONAL) {
    throw new IFXRAWDecodeError("invalid-metadata", `DNG tag ${value.tag} requires a numeric TIFF type.`);
  }
  const output: number[] = [];
  for (let index = 0; index < value.count; index++) {
    const offset = value.dataOffset + index * 8;
    const signed = value.type === TIFF_SRATIONAL;
    const numerator = signed ? view.getInt32(offset, true) : view.getUint32(offset, true);
    const denominator = signed ? view.getInt32(offset + 4, true) : view.getUint32(offset + 4, true);
    if (denominator === 0) throw new IFXRAWDecodeError("invalid-metadata", `DNG tag ${value.tag} contains a zero rational denominator.`);
    const result = numerator / denominator;
    if (!Number.isFinite(result)) throw new IFXRAWDecodeError("invalid-metadata", `DNG tag ${value.tag} contains a non-finite value.`);
    output.push(result);
  }
  return output;
}

function singleUnsigned(view: DataView, value: TIFFTag, name: string): number {
  if (value.count !== 1) throw new IFXRAWDecodeError("invalid-metadata", `DNG ${name} must contain one value.`);
  return unsignedValues(view, value)[0]!;
}

function asciiValue(view: DataView, value: TIFFTag, name: string): string {
  if (value.type !== TIFF_ASCII || value.count < 2 || value.count > 256) {
    throw new IFXRAWDecodeError("invalid-metadata", `DNG ${name} must be bounded ASCII text.`);
  }
  const bytes = new Uint8Array(view.buffer, view.byteOffset + value.dataOffset, value.count);
  const nul = bytes.indexOf(0);
  if (nul < 1) throw new IFXRAWDecodeError("invalid-metadata", `DNG ${name} must be NUL-terminated and nonempty.`);
  for (let index = 0; index < nul; index++) if (bytes[index]! > 0x7f) throw new IFXRAWDecodeError("invalid-metadata", `DNG ${name} must use ASCII characters.`);
  return new TextDecoder("ascii", { fatal: true }).decode(bytes.subarray(0, nul));
}

function inverse3x3(matrix: readonly number[]): readonly number[] {
  const [a, b, c, d, e, f, g, h, i] = matrix as readonly [number, number, number, number, number, number, number, number, number];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-10) throw new IFXRAWDecodeError("invalid-metadata", "DNG ColorMatrix1 is singular.");
  return Object.freeze([
    (e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det,
    (f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det,
    (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det,
  ]);
}

function multiply3x3(matrix: readonly number[], vector: readonly [number, number, number]): readonly [number, number, number] {
  return Object.freeze([
    matrix[0]! * vector[0] + matrix[1]! * vector[1] + matrix[2]! * vector[2],
    matrix[3]! * vector[0] + matrix[4]! * vector[1] + matrix[5]! * vector[2],
    matrix[6]! * vector[0] + matrix[7]! * vector[1] + matrix[8]! * vector[2],
  ]);
}

function cfaPattern(values: readonly number[]): IFXRAWCFA {
  const key = values.join("");
  if (key === "0112") return "rggb";
  if (key === "2110") return "bggr";
  if (key === "1021") return "grbg";
  if (key === "1201") return "gbrg";
  throw new IFXRAWUnsupportedError("cfa-pattern", "Only rectangular RGGB/BGGR/GRBG/GBRG Bayer CFA patterns are supported.");
}

function cfaColour(value: number): IFXRAWCFAColor {
  if (value === 0) return "red";
  if (value === 1) return "green";
  if (value === 2) return "blue";
  throw new IFXRAWUnsupportedError("cfa-pattern", "Only red/green/blue DNG CFA plane colors are supported.");
}

function orientation(value: number): IFXRAWOrientation {
  if (value === 1 || value === 3 || value === 6 || value === 8) return value;
  throw new IFXRAWUnsupportedError("orientation", "The portable DNG backend supports rotation-only orientations 1, 3, 6 and 8.");
}

function parseDNG(source: Uint8Array): ParsedDNG {
  if (!(source instanceof Uint8Array)) throw new TypeError("RAW source must be Uint8Array.");
  if (source.byteLength < 8) throw new IFXRAWDecodeError("invalid-header", "DNG/TIFF header is truncated.");
  if (source.byteLength > MAX_INPUT_BYTES) throw new IFXRAWDecodeError("bounds", "DNG source exceeds the 128 MiB portable input limit.");
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  if (view.getUint8(0) !== 0x49 || view.getUint8(1) !== 0x49) throw new IFXRAWUnsupportedError("byte-order", "Only little-endian classic TIFF/DNG is supported.");
  if (view.getUint16(2, true) !== 42) throw new IFXRAWUnsupportedError("format", "RAW source is not classic TIFF/DNG.");
  const rootOffset = view.getUint32(4, true);
  const root = parseIFD(view, rootOffset);

  const dngVersionTag = requireTag(root, TAG_DNG_VERSION, "DNGVersion");
  const dngVersion = unsignedValues(view, dngVersionTag);
  if (dngVersionTag.type !== TIFF_BYTE || dngVersionTag.count !== 4 || dngVersion[0] !== 1) {
    throw new IFXRAWUnsupportedError("format", "Only DNG 1.x metadata is supported.");
  }
  const backwards = tag(root, TAG_DNG_BACKWARD_VERSION);
  if (backwards) {
    const values = unsignedValues(view, backwards);
    if (backwards.type !== TIFF_BYTE || backwards.count !== 4 || values[0] !== 1 || values[1]! > 4) {
      throw new IFXRAWUnsupportedError("format", "DNGBackwardVersion requires a reader newer than the portable 1.4 subset.");
    }
  }

  const ifds: TIFFIFD[] = [root];
  const subIFDs = tag(root, TAG_SUB_IFDS);
  if (subIFDs) {
    if (subIFDs.type !== TIFF_LONG || subIFDs.count < 1 || subIFDs.count > MAX_SUB_IFDS) {
      throw new IFXRAWUnsupportedError("layout", "DNG SubIFDs must contain 1..4 classic TIFF offsets.");
    }
    for (const offset of unsignedValues(view, subIFDs)) ifds.push(parseIFD(view, offset));
  }
  const sensorIFDs = ifds.filter(candidate => {
    const photometric = tag(candidate, TAG_PHOTOMETRIC);
    return photometric !== null && photometric.count === 1 && unsignedValues(view, photometric)[0] === 32803;
  });
  if (sensorIFDs.length !== 1) throw new IFXRAWUnsupportedError("layout", "Portable DNG development requires exactly one CFA sensor IFD.");
  const sensor = sensorIFDs[0]!;
  const cameraModel = asciiValue(view, requireInheritedTag(sensor, root, TAG_UNIQUE_CAMERA_MODEL, "UniqueCameraModel"), "UniqueCameraModel");

  for (const unsupportedTag of [TAG_TILE_WIDTH, TAG_TILE_LENGTH, TAG_TILE_OFFSETS, TAG_TILE_BYTE_COUNTS]) {
    if (tag(sensor, unsupportedTag)) throw new IFXRAWUnsupportedError("layout", "Tiled DNG sensor storage is outside the single-strip portable subset.", cameraModel);
  }
  for (const opcodeTag of [TAG_OPCODE_LIST_1, TAG_OPCODE_LIST_2, TAG_OPCODE_LIST_3]) {
    if (inheritedTag(sensor, root, opcodeTag)) throw new IFXRAWUnsupportedError("camera-opcodes", "DNG camera opcode lists require a camera-specific backend.", cameraModel);
  }
  for (const unsupportedMetadata of [TAG_BLACK_LEVEL_DELTA_H, TAG_BLACK_LEVEL_DELTA_V, TAG_DEFAULT_CROP_ORIGIN, TAG_DEFAULT_CROP_SIZE, TAG_CAMERA_CALIBRATION_1, TAG_REDUCTION_MATRIX_1, TAG_AS_SHOT_WHITE_XY, TAG_BASELINE_EXPOSURE, TAG_ACTIVE_AREA]) {
    if (inheritedTag(sensor, root, unsupportedMetadata)) throw new IFXRAWUnsupportedError("camera-metadata", `Camera metadata tag ${unsupportedMetadata} requires a wider DNG development backend.`, cameraModel);
  }

  const width = singleUnsigned(view, requireTag(sensor, TAG_IMAGE_WIDTH, "ImageWidth"), "ImageWidth");
  const height = singleUnsigned(view, requireTag(sensor, TAG_IMAGE_HEIGHT, "ImageLength"), "ImageLength");
  if (width < 2 || height < 2 || width > 16_384 || height > 16_384) throw new IFXRAWDecodeError("bounds", "DNG sensor dimensions are outside the portable bounds.");
  const pixels = checkedProduct(width, height, "DNG sensor dimensions overflow.");
  const outputBytes = checkedProduct(pixels, 16, "DNG float output dimensions overflow.");
  if (outputBytes > MAX_OUTPUT_BYTES) throw new IFXRAWDecodeError("bounds", "DNG float output exceeds the 32 MiB portable development limit.");

  const bits = singleUnsigned(view, requireTag(sensor, TAG_BITS_PER_SAMPLE, "BitsPerSample"), "BitsPerSample");
  if (bits !== 16) throw new IFXRAWUnsupportedError("bits-per-sample", "Portable DNG development currently supports 16-bit sensor samples only.", cameraModel);
  const compression = singleUnsigned(view, requireTag(sensor, TAG_COMPRESSION, "Compression"), "Compression");
  if (compression !== 1) throw new IFXRAWUnsupportedError("compression", `DNG compression ${compression} is unsupported; only uncompressed sensor strips are accepted.`, cameraModel);
  const samples = singleUnsigned(view, requireTag(sensor, TAG_SAMPLES_PER_PIXEL, "SamplesPerPixel"), "SamplesPerPixel");
  const planar = tag(sensor, TAG_PLANAR_CONFIGURATION);
  if (samples !== 1 || (planar && singleUnsigned(view, planar, "PlanarConfiguration") !== 1)) throw new IFXRAWUnsupportedError("layout", "Portable DNG development requires a single chunky CFA sample plane.", cameraModel);
  const rows = singleUnsigned(view, requireTag(sensor, TAG_ROWS_PER_STRIP, "RowsPerStrip"), "RowsPerStrip");
  if (rows !== height) throw new IFXRAWUnsupportedError("layout", "Portable DNG development requires one full-height sensor strip.", cameraModel);
  const stripOffsetTag = requireTag(sensor, TAG_STRIP_OFFSETS, "StripOffsets");
  const stripCountTag = requireTag(sensor, TAG_STRIP_BYTE_COUNTS, "StripByteCounts");
  if (stripOffsetTag.count !== 1 || stripCountTag.count !== 1) throw new IFXRAWUnsupportedError("layout", "Portable DNG development requires exactly one sensor strip.", cameraModel);
  const sensorOffset = singleUnsigned(view, stripOffsetTag, "StripOffsets");
  const sensorByteCount = singleUnsigned(view, stripCountTag, "StripByteCounts");
  const expectedSensorBytes = checkedProduct(pixels, 2, "DNG sensor byte count overflow.");
  if (sensorByteCount !== expectedSensorBytes) throw new IFXRAWDecodeError("invalid-metadata", "DNG sensor strip byte count does not match dimensions and sample depth.");
  ensureRange(sensorOffset, sensorByteCount, view.byteLength, "DNG sensor strip is truncated.");

  const repeat = unsignedValues(view, requireTag(sensor, TAG_CFA_REPEAT_PATTERN_DIM, "CFARepeatPatternDim"));
  if (repeat.length !== 2 || repeat[0] !== 2 || repeat[1] !== 2) throw new IFXRAWUnsupportedError("cfa-pattern", "Only 2x2 Bayer CFA repetition is supported.", cameraModel);
  const cfaTag = requireTag(sensor, TAG_CFA_PATTERN, "CFAPattern");
  const cfaValues = unsignedValues(view, cfaTag);
  if (cfaTag.type !== TIFF_BYTE || cfaValues.length !== 4) throw new IFXRAWUnsupportedError("cfa-pattern", "DNG CFAPattern must contain four byte-valued Bayer entries.", cameraModel);
  const pattern = cfaPattern(cfaValues);
  const cfaPlaneTag = inheritedTag(sensor, root, TAG_CFA_PLANE_COLOR);
  if (cfaPlaneTag) {
    const planes = unsignedValues(view, cfaPlaneTag);
    if (cfaPlaneTag.type !== TIFF_BYTE || planes.join(",") !== "0,1,2") throw new IFXRAWUnsupportedError("cfa-pattern", "Portable DNG expects CFAPlaneColor [red, green, blue].", cameraModel);
  }
  const layout = inheritedTag(sensor, root, TAG_CFA_LAYOUT);
  if (layout && singleUnsigned(view, layout, "CFALayout") !== 1) throw new IFXRAWUnsupportedError("cfa-pattern", "Only rectangular DNG CFA layout is supported.", cameraModel);
  const blackRepeat = inheritedTag(sensor, root, TAG_BLACK_LEVEL_REPEAT_DIM);
  if (blackRepeat) {
    const values = unsignedValues(view, blackRepeat);
    if (values.length !== 2 || values[0] !== 1 || values[1] !== 1) throw new IFXRAWUnsupportedError("camera-metadata", "Only scalar DNG BlackLevel is supported.", cameraModel);
  }
  const blackValues = numericValues(view, requireInheritedTag(sensor, root, TAG_BLACK_LEVEL, "BlackLevel"));
  const whiteValues = numericValues(view, requireInheritedTag(sensor, root, TAG_WHITE_LEVEL, "WhiteLevel"));
  if (blackValues.length !== 1 || whiteValues.length !== 1) throw new IFXRAWUnsupportedError("camera-metadata", "Portable DNG development requires scalar black and white levels.", cameraModel);
  const blackLevel = blackValues[0]!, whiteLevel = whiteValues[0]!;
  if (!Number.isFinite(blackLevel) || !Number.isFinite(whiteLevel) || blackLevel < 0 || whiteLevel <= blackLevel || whiteLevel > 65_535) {
    throw new IFXRAWDecodeError("invalid-metadata", "DNG black/white levels are invalid for 16-bit sensor data.");
  }

  let linearization: Uint16Array | null = null;
  const linearizationTag = inheritedTag(sensor, root, TAG_LINEARIZATION_TABLE);
  if (linearizationTag) {
    if (linearizationTag.type !== TIFF_SHORT || linearizationTag.count < 2 || linearizationTag.count > MAX_LINEARIZATION_VALUES) {
      throw new IFXRAWUnsupportedError("camera-metadata", "DNG LinearizationTable must contain 2..65536 unsigned-short entries.", cameraModel);
    }
    linearization = Uint16Array.from(unsignedValues(view, linearizationTag));
  }

  const matrixTag = requireInheritedTag(sensor, root, TAG_COLOR_MATRIX_1, "ColorMatrix1");
  if (matrixTag.type !== TIFF_SRATIONAL || matrixTag.count !== 9) throw new IFXRAWUnsupportedError("camera-metadata", "Portable DNG development requires a 3x3 SRATIONAL ColorMatrix1.", cameraModel);
  const matrix = numericValues(view, matrixTag);
  inverse3x3(matrix);
  const neutralTag = requireInheritedTag(sensor, root, TAG_AS_SHOT_NEUTRAL, "AsShotNeutral");
  if (neutralTag.type !== TIFF_RATIONAL || neutralTag.count !== 3) throw new IFXRAWUnsupportedError("camera-metadata", "Portable DNG development requires three RATIONAL AsShotNeutral values.", cameraModel);
  const neutral = numericValues(view, neutralTag) as [number, number, number];
  if (neutral.some(value => !Number.isFinite(value) || value <= 0)) throw new IFXRAWDecodeError("invalid-metadata", "DNG AsShotNeutral values must be positive finite values.");
  const gains = Object.freeze([neutral[1] / neutral[0], 1, neutral[1] / neutral[2]]) as readonly [number, number, number];
  if (gains.some(value => !Number.isFinite(value) || value <= 0 || value > 64)) throw new IFXRAWDecodeError("invalid-metadata", "DNG AsShotNeutral yields invalid white-balance gains.");
  const illuminant = singleUnsigned(view, requireInheritedTag(sensor, root, TAG_CALIBRATION_ILLUMINANT_1, "CalibrationIlluminant1"), "CalibrationIlluminant1");
  if (illuminant !== 21) throw new IFXRAWUnsupportedError("calibration-illuminant", "Portable DNG colour conversion currently supports D65 ColorMatrix1 metadata only.", cameraModel);

  const rootOrientation = tag(root, TAG_ORIENTATION);
  const sensorOrientation = tag(sensor, TAG_ORIENTATION);
  if (rootOrientation && sensorOrientation) {
    const rootValue = singleUnsigned(view, rootOrientation, "Orientation"), sensorValue = singleUnsigned(view, sensorOrientation, "Orientation");
    if (rootValue !== sensorValue) throw new IFXRAWDecodeError("invalid-metadata", "DNG root and sensor orientation metadata conflict.");
  }
  const orientationValue = orientation(sensorOrientation || rootOrientation ? singleUnsigned(view, sensorOrientation ?? rootOrientation!, "Orientation") : 1);

  const metadata = new IFXRAWMetadata({
    format: "dng",
    cameraModel,
    sourceWidth: width,
    sourceHeight: height,
    bitsPerSample: 16,
    cfaPattern: pattern,
    cfaPlane: Object.freeze(cfaValues.map(cfaColour)),
    blackLevel,
    whiteLevel,
    orientation: orientationValue,
    asShotNeutral: Object.freeze([...neutral]) as readonly [number, number, number],
    whiteBalanceGains: gains,
    colorMatrix1: Object.freeze([...matrix]),
    calibrationIlluminant: "D65",
    workingColourSpace: "linear-srgb",
    outputSampleFormat: "float32",
    sensorIFDOffset: sensor.offset,
    sensorPlaneByteCount: sensorByteCount,
    embeddedPreviewCount: ifds.length - sensorIFDs.length,
    hasLinearizationTable: linearization !== null,
    decoder: DECODER,
  });
  return Object.freeze({ metadata, view, sensorOffset, linearization, cfaValues: Object.freeze([...cfaValues]) as readonly [number, number, number, number] });
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function orientedPosition(x: number, y: number, width: number, height: number, orientationValue: IFXRAWOrientation): readonly [number, number] {
  if (orientationValue === 3) return [width - 1 - x, height - 1 - y];
  if (orientationValue === 6) return [height - 1 - y, x];
  if (orientationValue === 8) return [y, width - 1 - x];
  return [x, y];
}

export class IFXPortableDNGRAWBackend implements IFXRAWBackend {
  readonly capabilities: IFXRAWBackendCapabilities = Object.freeze({
    backend: "portable-dng",
    decoder: DECODER,
    formats: Object.freeze(["dng"] as const),
    byteOrders: Object.freeze(["little-endian"] as const),
    compressions: Object.freeze(["uncompressed"] as const),
    bitsPerSample: Object.freeze([16] as const),
    cfaPatterns: Object.freeze(["rggb", "bggr", "grbg", "gbrg"] as const),
    orientations: Object.freeze([1, 3, 6, 8] as const),
    outputColourSpaces: Object.freeze(["linear-srgb"] as const),
    outputSampleFormats: Object.freeze(["float32"] as const),
    maximumInputBytes: MAX_INPUT_BYTES,
    maximumOutputBytes: MAX_OUTPUT_BYTES,
    embeddedPreviewDevelopment: false,
  });

  inspect(source: Uint8Array): IFXRAWMetadata {
    return parseDNG(source).metadata;
  }

  async develop(source: Uint8Array, options: IFXRAWDevelopmentOptions = {}): Promise<IFXRAWDevelopmentResult> {
    options.signal?.throwIfAborted();
    await Promise.resolve();
    options.signal?.throwIfAborted();
    const parsed = parseDNG(source);
    const { metadata, view } = parsed;
    const exposureEV = options.exposureEV ?? 0;
    if (!Number.isFinite(exposureEV) || exposureEV < -8 || exposureEV > 8) throw new RangeError("RAW exposureEV must be finite within -8...+8 EV.");
    const whiteBalance = options.whiteBalance ?? "as-shot";
    if (whiteBalance !== "as-shot" && whiteBalance !== "none") throw new TypeError("Unsupported RAW white-balance mode.");
    const exposure = 2 ** exposureEV;
    const gains = whiteBalance === "as-shot" ? metadata.whiteBalanceGains : ([1, 1, 1] as const);
    const cameraToXYZ = inverse3x3(metadata.colorMatrix1);
    const outputWidth = metadata.orientation === 6 || metadata.orientation === 8 ? metadata.sourceHeight : metadata.sourceWidth;
    const outputHeight = metadata.orientation === 6 || metadata.orientation === 8 ? metadata.sourceWidth : metadata.sourceHeight;
    const data = new Float32Array(outputWidth * outputHeight * 4);
    const cfaAt = (x: number, y: number): number => parsed.cfaValues[(y & 1) * 2 + (x & 1)]!;
    const sensorAt = (x: number, y: number): number => {
      const stored = view.getUint16(parsed.sensorOffset + (y * metadata.sourceWidth + x) * 2, true);
      const linearized = parsed.linearization ? parsed.linearization[stored] : stored;
      if (linearized === undefined) throw new IFXRAWDecodeError("invalid-metadata", "DNG LinearizationTable does not cover a stored sensor code.");
      return clampUnit((linearized - metadata.blackLevel) / (metadata.whiteLevel - metadata.blackLevel));
    };
    const demosaic = (x: number, y: number, channel: number): number => {
      if (cfaAt(x, y) === channel) return sensorAt(x, y);
      let sum = 0, count = 0;
      for (let deltaY = -1; deltaY <= 1; deltaY++) for (let deltaX = -1; deltaX <= 1; deltaX++) {
        if (deltaX === 0 && deltaY === 0) continue;
        const sampleX = x + deltaX, sampleY = y + deltaY;
        if (sampleX < 0 || sampleY < 0 || sampleX >= metadata.sourceWidth || sampleY >= metadata.sourceHeight || cfaAt(sampleX, sampleY) !== channel) continue;
        sum += sensorAt(sampleX, sampleY); count++;
      }
      if (count === 0) throw new IFXRAWDecodeError("invalid-metadata", "Bayer neighbourhood cannot supply all RGB channels.");
      return sum / count;
    };

    for (let y = 0; y < metadata.sourceHeight; y++) {
      if ((y & 31) === 0) {
        options.signal?.throwIfAborted();
        if (y !== 0) await Promise.resolve();
        options.signal?.throwIfAborted();
      }
      for (let x = 0; x < metadata.sourceWidth; x++) {
        const camera = Object.freeze([
          clampUnit(demosaic(x, y, 0) * gains[0] * exposure),
          clampUnit(demosaic(x, y, 1) * gains[1] * exposure),
          clampUnit(demosaic(x, y, 2) * gains[2] * exposure),
        ]) as readonly [number, number, number];
        const xyz = multiply3x3(cameraToXYZ, camera);
        const linearSRGB = multiply3x3(XYZ_D65_TO_LINEAR_SRGB, xyz);
        const [outputX, outputY] = orientedPosition(x, y, metadata.sourceWidth, metadata.sourceHeight, metadata.orientation);
        const offset = (outputY * outputWidth + outputX) * 4;
        data[offset] = clampUnit(linearSRGB[0]);
        data[offset + 1] = clampUnit(linearSRGB[1]);
        data[offset + 2] = clampUnit(linearSRGB[2]);
        data[offset + 3] = 1;
      }
    }
    options.signal?.throwIfAborted();
    const image = new GFXFloatImage({ width: outputWidth, height: outputHeight, sampleFormat: "float32", alpha: "opaque", colourSpace: "linear-srgb", data });
    options.signal?.throwIfAborted();
    return Object.freeze({
      image,
      metadata,
      provenance: Object.freeze({ source: "sensor-plane", embeddedPreviewUsed: false, sensorIFDOffset: metadata.sensorIFDOffset, demosaic: "bilinear-bayer", orientationApplied: true, decoder: DECODER }),
    });
  }
}
