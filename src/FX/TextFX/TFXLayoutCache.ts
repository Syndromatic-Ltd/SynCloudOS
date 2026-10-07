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

import type {
  TFXTextContainerValue,
  TFXTextDirection,
  TFXTextFontDescriptor,
  TFXTextLayoutResult,
} from "./textLayoutTypes";
import { snapshotTFXTextContainers, type TFXTextContainer } from "./TFXTextContainer";

export interface TFXLayoutCacheKey {
  readonly revision: number;
  readonly attributedRevision: number;
  readonly fontGeneration: number;
  readonly text: string;
  readonly font: TFXTextFontDescriptor;
  readonly locale: string;
  readonly direction: TFXTextDirection;
  readonly containers: readonly TFXTextContainer[];
}

export interface TFXLayoutCacheDiagnostics {
  readonly entryCount: number;
  readonly liveBytes: number;
  readonly hitCount: number;
  readonly missCount: number;
  readonly evictionCount: number;
  readonly disposed: boolean;
}

interface CacheEntry {
  readonly key: string;
  readonly result: TFXTextLayoutResult;
  readonly bytes: number;
}

const encoder = new TextEncoder();

function boundedInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    throw new RangeError(`${label} must be a bounded non-negative integer.`);
  }
  return value;
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
  return value;
}

function keyFor(input: TFXLayoutCacheKey): string {
  boundedInteger(input.revision, "Layout revision");
  boundedInteger(input.attributedRevision, "Attributed revision");
  boundedInteger(input.fontGeneration, "Font generation");
  if (typeof input.text !== "string" || typeof input.locale !== "string") throw new TypeError("Layout cache text and locale must be strings.");
  if (input.direction !== "ltr" && input.direction !== "rtl") throw new TypeError("Layout cache direction is invalid.");
  const containers: readonly TFXTextContainerValue[] = snapshotTFXTextContainers(input.containers);
  const font = input.font;
  if (!font || typeof font !== "object" || !Array.isArray(font.families)) throw new TypeError("Layout cache font descriptor is invalid.");
  const fontKey = {
    families: [...font.families],
    size: finite(font.size, "Font size"),
    weight: finite(font.weight, "Font weight"),
    style: font.style,
    stretch: font.stretch,
  };
  const containerKey = containers.map((container) => ({
    size: container.size,
    insets: container.insets,
    maximumLines: container.maximumLines,
    truncation: container.truncation,
    writingMode: container.writingMode,
    flowOrder: container.flowOrder,
    exclusionRects: container.exclusionRects,
  }));
  return JSON.stringify([
    input.revision,
    input.attributedRevision,
    input.fontGeneration,
    input.text,
    fontKey,
    input.locale,
    input.direction,
    containerKey,
  ]);
}

function estimateResultBytes(key: string, result: TFXTextLayoutResult): number {
  let bytes = encoder.encode(key).byteLength + 64;
  for (const fragment of result.fragments) {
    bytes += encoder.encode(fragment.text).byteLength + 96;
  }
  return bytes;
}

export class TFXLayoutCache {
  readonly #maximumBytes: number;
  readonly #maximumEntries: number;
  readonly #entries = new Map<string, CacheEntry>();
  #liveBytes = 0;
  #hitCount = 0;
  #missCount = 0;
  #evictionCount = 0;
  #disposed = false;

  constructor(options: { readonly maximumBytes?: number; readonly maximumEntries?: number } = {}) {
    const maximumBytes = options.maximumBytes ?? 4 * 1024 * 1024;
    const maximumEntries = options.maximumEntries ?? 64;
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 256 || maximumBytes > 64 * 1024 * 1024) throw new RangeError("Layout cache maximumBytes must be between 256 bytes and 64 MiB.");
    if (!Number.isSafeInteger(maximumEntries) || maximumEntries < 1 || maximumEntries > 1_024) throw new RangeError("Layout cache maximumEntries must be between 1 and 1024.");
    this.#maximumBytes = maximumBytes;
    this.#maximumEntries = maximumEntries;
  }

  lookup(key: TFXLayoutCacheKey): TFXTextLayoutResult | null {
    if (this.#disposed) return null;
    const encoded = keyFor(key);
    const entry = this.#entries.get(encoded);
    if (!entry) {
      this.#missCount += 1;
      return null;
    }
    this.#entries.delete(encoded);
    this.#entries.set(encoded, entry);
    this.#hitCount += 1;
    return entry.result;
  }

  store(key: TFXLayoutCacheKey, result: TFXTextLayoutResult): TFXTextLayoutResult {
    if (this.#disposed) throw new DOMException("Text layout cache is disposed.", "InvalidStateError");
    const encoded = keyFor(key);
    const bytes = estimateResultBytes(encoded, result);
    const existing = this.#entries.get(encoded);
    if (existing) {
      this.#entries.delete(encoded);
      this.#liveBytes -= existing.bytes;
    }
    if (bytes > this.#maximumBytes) {
      return result;
    }
    const entry = Object.freeze({ key: encoded, result, bytes });
    this.#entries.set(encoded, entry);
    this.#liveBytes += bytes;
    while (this.#entries.size > this.#maximumEntries || this.#liveBytes > this.#maximumBytes) {
      const oldestKey = this.#entries.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;
      const oldest = this.#entries.get(oldestKey)!;
      this.#entries.delete(oldestKey);
      this.#liveBytes -= oldest.bytes;
      this.#evictionCount += 1;
    }
    return result;
  }

  clear(): void {
    this.#entries.clear();
    this.#liveBytes = 0;
  }

  diagnostics(): TFXLayoutCacheDiagnostics {
    return Object.freeze({
      entryCount: this.#entries.size,
      liveBytes: this.#liveBytes,
      hitCount: this.#hitCount,
      missCount: this.#missCount,
      evictionCount: this.#evictionCount,
      disposed: this.#disposed,
    });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.clear();
    this.#disposed = true;
  }
}
