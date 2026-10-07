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

export type IFXModelPurpose = "image" | "person-segmentation" | "saliency-map" | "face-mask" | "text-region-mask";
export type IFXModelQualityLevel = "fast" | "balanced" | "accurate";

export interface IFXModelProvenance {
  readonly source: string;
  readonly license: string;
}

export interface IFXModelHeadDescriptor {
  readonly channels: 1 | 4;
  readonly activation: "linear" | "sigmoid";
}

export interface IFXModelAsset {
  readonly format: "ifx-linear-pixel-v1";
  readonly id: string;
  readonly version: number;
  readonly purpose: IFXModelPurpose;
  readonly provenance: IFXModelProvenance;
  readonly heads: readonly IFXModelHeadDescriptor[];
  readonly data: readonly number[];
  readonly sha256: string;
  readonly qualityLevel?: IFXModelQualityLevel;
}

export interface IFXModelLoadContext {
  checkpoint(): Promise<void>;
}

export interface IFXModelSession {
  readonly id: string;
  readonly version: number;
  readonly purpose: IFXModelPurpose;
  readonly heads: readonly IFXModelHeadDescriptor[];
  evaluate(input: readonly [number, number, number, number], headIndex: number, softmaxNormalization?: boolean): readonly number[];
}

export interface IFXModelBackend {
  readonly id: string;
  readonly version: number;
  load(asset: IFXModelAsset, context: IFXModelLoadContext): Promise<IFXModelSession>;
}

export class IFXModelIntegrityError extends Error {
  readonly name = "IFXModelIntegrityError";
}

const purposes: readonly IFXModelPurpose[] = Object.freeze(["image", "person-segmentation", "saliency-map", "face-mask", "text-region-mask"]);
const qualityLevels: readonly IFXModelQualityLevel[] = Object.freeze(["fast", "balanced", "accurate"]);
const maximumModelBytes = 64 * 1024;

function record(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) || Object.getOwnPropertySymbols(value).length)
    throw new TypeError(message);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some(descriptor => !("value" in descriptor))) throw new TypeError(message);
  return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, (descriptor as PropertyDescriptor & { value: unknown }).value]));
}

function text(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum) throw new TypeError(`${label} is invalid.`);
  return value;
}

function heads(value: unknown): readonly IFXModelHeadDescriptor[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < 1 || value.length > 16)
    throw new TypeError("Model heads are invalid.");
  return Object.freeze(value.map(entry => {
    const raw = record(entry, "Model head must contain plain data.");
    if (Object.keys(raw).length !== 2 || ![1, 4].includes(raw.channels as number) || !["linear", "sigmoid"].includes(raw.activation as string))
      throw new TypeError("Model head is invalid.");
    return Object.freeze({ channels: raw.channels as 1 | 4, activation: raw.activation as "linear" | "sigmoid" });
  }));
}

function bytes(value: unknown, expected: number): readonly number[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length !== expected || value.length > maximumModelBytes)
    throw new RangeError("Model byte length is invalid or exceeds its budget.");
  const result = new Array<number>(value.length);
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    const byte = descriptor && "value" in descriptor ? descriptor.value : undefined;
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) throw new TypeError("Model data must be byte values.");
    result[index] = byte;
  }
  return Object.freeze(result);
}

export function normaliseIFXModelAsset(value: unknown): IFXModelAsset {
  const raw = record(value, "Model asset must contain plain data.");
  const allowed = ["format", "id", "version", "purpose", "provenance", "heads", "data", "sha256", "qualityLevel"];
  if (Object.keys(raw).some(key => !allowed.includes(key))) throw new TypeError("Model asset contains an unknown field.");
  if (raw.format !== "ifx-linear-pixel-v1") throw new TypeError("Unsupported ImageFX model format.");
  const id = text(raw.id, "Model id", 64);
  if (!/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(id)) throw new TypeError("Model id is invalid.");
  if (!Number.isSafeInteger(raw.version) || (raw.version as number) < 1 || (raw.version as number) > 65535) throw new RangeError("Model version is invalid.");
  if (!purposes.includes(raw.purpose as IFXModelPurpose)) throw new TypeError("Model purpose is invalid.");
  const provenanceRaw = record(raw.provenance, "Model provenance must contain plain data.");
  if (Object.keys(provenanceRaw).length !== 2) throw new TypeError("Model provenance is invalid.");
  const provenance = Object.freeze({ source: text(provenanceRaw.source, "Model provenance source", 512), license: text(provenanceRaw.license, "Model provenance license", 128) });
  const modelHeads = heads(raw.heads);
  const expectedBytes = modelHeads.reduce((sum, head) => sum + head.channels * 5 * Float32Array.BYTES_PER_ELEMENT, 0);
  const data = bytes(raw.data, expectedBytes);
  if (typeof raw.sha256 !== "string" || !/^[0-9a-fA-F]{64}$/.test(raw.sha256)) throw new TypeError("Model SHA-256 is invalid.");
  const qualityLevel = raw.qualityLevel === undefined ? undefined : raw.qualityLevel as IFXModelQualityLevel;
  if (qualityLevel !== undefined && !qualityLevels.includes(qualityLevel)) throw new TypeError("Model quality level is invalid.");
  if (raw.purpose !== "person-segmentation" && qualityLevel !== undefined) throw new TypeError("Model quality level is only valid for person segmentation.");
  return Object.freeze({
    format: "ifx-linear-pixel-v1",
    id,
    version: raw.version as number,
    purpose: raw.purpose as IFXModelPurpose,
    provenance,
    heads: modelHeads,
    data,
    sha256: raw.sha256.toLowerCase(),
    ...(qualityLevel ? { qualityLevel } : {}),
  });
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}

function sigmoid(value: number): number {
  if (value >= 0) return 1 / (1 + Math.exp(-Math.min(value, 80)));
  const exponent = Math.exp(Math.max(value, -80));
  return exponent / (1 + exponent);
}

function softmax(values: readonly number[]): readonly number[] {
  const maximum = Math.max(...values);
  const exponentials = values.map(value => Math.exp(Math.max(-80, Math.min(80, value - maximum))));
  const total = exponentials.reduce((sum, value) => sum + value, 0);
  return Object.freeze(exponentials.map(value => value / total));
}

export class IFXPortableModelBackend implements IFXModelBackend {
  readonly id = "portable-linear-pixel";
  readonly version = 1;

  async load(value: IFXModelAsset, context: IFXModelLoadContext): Promise<IFXModelSession> {
    if (!context || typeof context.checkpoint !== "function") throw new TypeError("Model load context is invalid.");
    const asset = normaliseIFXModelAsset(value);
    await context.checkpoint();
    if (!globalThis.crypto?.subtle) throw new DOMException("SHA-256 is unavailable for model verification.", "NotSupportedError");
    const storage = Uint8Array.from(asset.data).buffer;
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", storage));
    await context.checkpoint();
    if (hex(digest) !== asset.sha256) throw new IFXModelIntegrityError("ImageFX model hash verification failed.");

    const view = new DataView(storage), weights: number[][][] = [];
    let offset = 0;
    for (const head of asset.heads) {
      const channels: number[][] = [];
      for (let channel = 0; channel < head.channels; channel++) {
        const row: number[] = [];
        for (let coefficient = 0; coefficient < 5; coefficient++, offset += Float32Array.BYTES_PER_ELEMENT) {
          const value = view.getFloat32(offset, true);
          if (!Number.isFinite(value)) throw new IFXModelIntegrityError("ImageFX model contains a non-finite coefficient.");
          row.push(value);
        }
        channels.push(row);
      }
      weights.push(channels);
    }
    const frozenWeights = Object.freeze(weights.map(head => Object.freeze(head.map(row => Object.freeze([...row])))));
    const session: IFXModelSession = Object.freeze({
      id: asset.id,
      version: asset.version,
      purpose: asset.purpose,
      heads: asset.heads,
      evaluate(input: readonly [number, number, number, number], headIndex: number, softmaxNormalization = false) {
        if (!Array.isArray(input) || input.length !== 4 || input.some(value => typeof value !== "number" || !Number.isFinite(value))) throw new TypeError("Model input must contain four finite channels.");
        if (!Number.isSafeInteger(headIndex) || headIndex < 0 || headIndex >= asset.heads.length) throw new RangeError("Model head index is invalid.");
        const descriptor = asset.heads[headIndex]!, rows = frozenWeights[headIndex]!;
        const raw = rows.map(row => row[0]! * input[0] + row[1]! * input[1] + row[2]! * input[2] + row[3]! * input[3] + row[4]!);
        if (softmaxNormalization) return softmax(raw);
        return Object.freeze(raw.map(value => descriptor.activation === "sigmoid" ? sigmoid(value) : value));
      },
    });
    return session;
  }
}
