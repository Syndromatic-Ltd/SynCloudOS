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

import { TFXUnsupportedTextLayoutFeatureError, type TFXTextHitTestRequest, type TFXTextLayoutAdapter, type TFXTextLayoutAdapterFactory, type TFXTextMeasureRequest, type TFXTextRangeRectsRequest, type SynCloudOSRuntimeId } from "../SynCloudOS";
import type { TFXTextMeasurementLease } from "../../FX/TextFX/textLayoutTypes";
import type { BrowserTextLayoutPlatform, BrowserTextMeasurementSurface, BrowserTextSegmenter } from "./browserTextLayoutAdapterTypes";

/** Segmenters are immutable per locale/granularity; a small bound covers the
 * locales a runtime lays out without unbounded growth. */
const maximumCachedSegmenters = 16;

const rtlLetters = /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Adlam}]/u;
const rtlLettersGlobal = /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Adlam}]/gu;
const bidiControls = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;

function preflightHitTestText(text: string): void {
  const containsRtl = rtlLetters.test(text);
  const nonRtlLetters = containsRtl ? text.replace(rtlLettersGlobal, "") : "";
  if (bidiControls.test(text) || (containsRtl && (/\p{Letter}/u.test(nonRtlLetters) || /\p{Number}/u.test(text)))) {
    throw new TFXUnsupportedTextLayoutFeatureError("mixed-bidi-hit-testing");
  }
}

export class BrowserTextLayoutAdapter implements TFXTextLayoutAdapter {
  readonly geometryCapabilities = Object.freeze({ kind: "logical-dom" as const, units: "css-pixels" as const, exclusions: false, shapedCarets: false });
  readonly #platform: BrowserTextLayoutPlatform;
  readonly #activeSurfaces = new Set<BrowserTextMeasurementSurface>();
  readonly #fontFaces = new Set<{ release(): void }>();
  readonly #segmenters = new Map<string, BrowserTextSegmenter>();
  #disposed = false;

  constructor(platform: BrowserTextLayoutPlatform) {
    this.#platform = platform;
  }

  #releaseSurface(surface: BrowserTextMeasurementSurface): void {
    if (!this.#activeSurfaces.delete(surface)) return;
    surface.dispose();
  }

  segment(text: string, granularity: "grapheme" | "word", locale: string) {
    if (this.#disposed) throw new DOMException("Text adapter disposed.", "AbortError");
    const key = `${granularity}\u0000${locale}`;
    let segmenter = this.#segmenters.get(key);
    if (segmenter) {
      this.#segmenters.delete(key);
    } else {
      segmenter = this.#platform.createSegmenter(locale, granularity) ?? undefined;
      if (!segmenter) throw new TFXUnsupportedTextLayoutFeatureError("text-segmentation");
      if (this.#segmenters.size >= maximumCachedSegmenters) this.#segmenters.delete(this.#segmenters.keys().next().value!);
    }
    this.#segmenters.set(key, segmenter);
    return segmenter.segment(text);
  }

  /** One surface for a batch of sequential measurements, released exactly
   * once by the holder, by `signal` aborting, or by adapter disposal. */
  acquireMeasurementLease(signal: AbortSignal): TFXTextMeasurementLease | null {
    signal.throwIfAborted();
    if (this.#disposed) throw new DOMException("Text adapter disposed.", "AbortError");
    const surface = this.#platform.createMeasurementSurface();
    if (!surface) return null;
    this.#activeSurfaces.add(surface);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      signal.removeEventListener("abort", release);
      this.#releaseSurface(surface);
    };
    signal.addEventListener("abort", release, { once: true });
    return Object.freeze({
      measure: (request: Parameters<BrowserTextMeasurementSurface["measure"]>[0]) => {
        if (released || this.#disposed) throw new DOMException("Text measurement lease is released.", "AbortError");
        request.signal.throwIfAborted();
        return surface.measure(request);
      },
      release,
    });
  }

  async #withSurface<T>(signal: AbortSignal, operation: (surface: BrowserTextMeasurementSurface) => T): Promise<T> {
    signal.throwIfAborted();
    if (this.#disposed) throw new DOMException("Text adapter disposed.", "AbortError");
    const surface = this.#platform.createMeasurementSurface();
    if (!surface) throw new TFXUnsupportedTextLayoutFeatureError("text-segmentation");
    this.#activeSurfaces.add(surface);
    try {
      signal.throwIfAborted();
      const result = operation(surface);
      signal.throwIfAborted();
      if (this.#disposed) throw new DOMException("Text adapter disposed.", "AbortError");
      return result;
    } finally {
      this.#releaseSurface(surface);
    }
  }

  measure(request: TFXTextMeasureRequest) {
    return this.#withSurface(request.signal, (surface) => surface.measure(request));
  }

  rangeRects(request: TFXTextRangeRectsRequest) {
    return this.#withSurface(request.signal, (surface) => surface.rangeRects(request));
  }

  async hitTest(request: TFXTextHitTestRequest) {
    request.signal.throwIfAborted();
    if (this.#disposed) throw new DOMException("Text adapter disposed.", "AbortError");
    preflightHitTestText(request.text);
    return this.#withSurface(request.signal, (surface) => surface.hitTest(request));
  }

  async registerFontFace(request: Parameters<NonNullable<TFXTextLayoutAdapter["registerFontFace"]>>[0]) {
    request.signal.throwIfAborted();
    if (this.#disposed) throw new DOMException("Text adapter disposed.", "AbortError");
    if (!this.#platform.registerFontFace) throw new TypeError("This text adapter cannot register browser font faces.");
    const platform = await this.#platform.registerFontFace(request);
    if (this.#disposed || request.signal.aborted) {
      platform.release();
      request.signal.throwIfAborted();
      throw new DOMException("Text adapter disposed.", "AbortError");
    }
    let released = false;
    const lease = Object.freeze({
      familyName: platform.familyName,
      release: () => {
        if (released) return;
        released = true;
        this.#fontFaces.delete(lease);
        platform.release();
      },
    });
    this.#fontFaces.add(lease);
    return lease;
  }

  yieldToHost(signal: AbortSignal) {
    if (this.#disposed) return Promise.reject(new DOMException("Text adapter disposed.", "AbortError"));
    return this.#platform.yieldToHost(signal);
  }

  diagnostics() {
    return Object.freeze({ activeMeasurementNodeCount: this.#activeSurfaces.size });
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#segmenters.clear();
    for (const surface of [...this.#activeSurfaces]) this.#releaseSurface(surface);
    for (const fontFace of [...this.#fontFaces]) fontFace.release();
  }
}

export class BrowserTextLayoutAdapterFactory implements TFXTextLayoutAdapterFactory {
  readonly #platform: BrowserTextLayoutPlatform;

  constructor(platform: BrowserTextLayoutPlatform) {
    this.#platform = platform;
  }

  acquire(_runtimeId: SynCloudOSRuntimeId, signal: AbortSignal) {
    signal.throwIfAborted();
    const adapter = new BrowserTextLayoutAdapter(this.#platform);
    let released = false;
    return Object.freeze({
      adapter,
      release() {
        if (released) return;
        released = true;
        adapter.dispose();
      },
    });
  }
}
