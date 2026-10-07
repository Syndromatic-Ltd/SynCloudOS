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

import { describe, expect, it, vi } from "vitest";
import { BrowserTextLayoutAdapter } from "../../src/SynCloudOS/PlatformAdapters/BrowserTextLayoutAdapter";
import type { BrowserTextMeasurementSurface } from "../../src/SynCloudOS/PlatformAdapters/browserTextLayoutAdapterTypes";
import { createTextFXLayoutService } from "../../src/SynCloudOS/TextFX/TextLayoutService";
import { createRuntimeCacheRegistry } from "../../src/SynCloudOS/Cache/RuntimeCacheRegistry";
import type { TFXTextMeasureRequest } from "../../src/FX/TextFX/textLayoutTypes";

const font = Object.freeze({ families: Object.freeze(["Prelude"]), size: 10, weight: 400, style: "normal" as const, stretch: "normal" as const });
const container = Object.freeze({
  size: Object.freeze({ width: 60, height: 1000 }),
  insets: Object.freeze({ blockStart: 0, inlineEnd: 0, blockEnd: 0, inlineStart: 0 }),
  maximumLines: 100,
  truncation: "none" as const,
  writingMode: "horizontal-tb" as const,
  flowOrder: 0,
  exclusionRects: Object.freeze([]),
});

function platform() {
  const surfaces: Array<{ measured: TFXTextMeasureRequest[]; dispose: ReturnType<typeof vi.fn> }> = [];
  const segmenters: string[] = [];
  const value = {
    createSegmenter(locale: string, granularity: "grapheme" | "word") {
      segmenters.push(`${granularity}:${locale}`);
      const segmenter = new Intl.Segmenter(locale, { granularity });
      return {
        segment: (text: string) => Object.freeze(Array.from(segmenter.segment(text), (entry) => Object.freeze({
          segment: entry.segment, index: entry.index, end: entry.index + entry.segment.length,
          breakOpportunity: granularity === "word" ? !entry.isWordLike || /^\s+$/u.test(entry.segment) : false,
        }))),
      };
    },
    createMeasurementSurface() {
      const record = { measured: [] as TFXTextMeasureRequest[], dispose: vi.fn() };
      surfaces.push(record);
      return {
        measure(request) {
          record.measured.push(request);
          const advance = request.text.length * 6;
          return { advance, ascent: 8, descent: 2, baseline: 8, inkBounds: { x: 0, y: 0, width: advance, height: 10 } };
        },
        rangeRects: () => [],
        hitTest: () => ({ offset: 0, affinity: "downstream" as const }),
        dispose: record.dispose,
      } satisfies BrowserTextMeasurementSurface;
    },
    yieldToHost: () => Promise.resolve(),
  };
  return { value, surfaces, segmenters };
}

function serviceFor(adapter: BrowserTextLayoutAdapter) {
  const controller = new AbortController();
  const service = createTextFXLayoutService({
    runtimeId: "runtime:lease-test",
    signal: controller.signal,
    caches: createRuntimeCacheRegistry({ runtimeId: "runtime:lease-test", now: () => 0 }),
    adapterLease: { adapter, release: () => adapter.dispose() },
  });
  return { service, controller };
}

describe("text measurement leases", () => {
  it("measures a whole layout through one surface and releases it once", async () => {
    const { value, surfaces } = platform();
    const adapter = new BrowserTextLayoutAdapter(value);
    const { service } = serviceFor(adapter);
    const result = await service.layout({ text: "alpha beta gamma delta epsilon zeta", font, locale: "en-GB", direction: "ltr" }, [container]);
    expect(result.fragments.length).toBeGreaterThan(1);
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]!.dispose).toHaveBeenCalledTimes(1);
    expect(adapter.diagnostics()).toEqual({ activeMeasurementNodeCount: 0 });
  });

  it("produces the same layout as per-measurement surfaces", async () => {
    const leased = platform();
    const perCall = platform();
    const leasedAdapter = new BrowserTextLayoutAdapter(leased.value);
    const perCallAdapter = new BrowserTextLayoutAdapter(perCall.value);
    Object.defineProperty(perCallAdapter, "acquireMeasurementLease", { value: undefined });
    const text = "the quick brown fox jumps over the lazy dog the end";
    const first = await serviceFor(leasedAdapter).service.layout({ text, font, locale: "en-GB", direction: "ltr" }, [container]);
    const second = await serviceFor(perCallAdapter).service.layout({ text, font, locale: "en-GB", direction: "ltr" }, [container]);
    expect(first.fragments).toEqual(second.fragments);
    expect(perCall.surfaces.length).toBeGreaterThan(1);
    expect(leased.surfaces).toHaveLength(1);
  });

  it("releases the leased surface exactly once when a layout is cancelled mid-batch", async () => {
    const { value, surfaces } = platform();
    let yields = 0;
    const caller = new AbortController();
    value.yieldToHost = () => {
      yields += 1;
      if (yields === 1) caller.abort(new DOMException("cancelled", "AbortError"));
      return Promise.resolve();
    };
    const adapter = new BrowserTextLayoutAdapter(value);
    const { service } = serviceFor(adapter);
    const text = Array.from({ length: 200 }, (_, index) => `w${index}`).join(" ");
    await expect(service.layout({ text, font, locale: "en-GB", direction: "ltr", signal: caller.signal }, [container]))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]!.dispose).toHaveBeenCalledTimes(1);
    expect(adapter.diagnostics()).toEqual({ activeMeasurementNodeCount: 0 });
  });

  it("refuses measurement through a released lease", () => {
    const { value } = platform();
    const adapter = new BrowserTextLayoutAdapter(value);
    const lease = adapter.acquireMeasurementLease!(new AbortController().signal)!;
    lease.release();
    lease.release();
    expect(() => lease.measure({ text: "a", font, locale: "en-GB", direction: "ltr", signal: new AbortController().signal }))
      .toThrow(expect.objectContaining({ name: "AbortError" }));
  });

  it("reuses a segmenter per locale and granularity", async () => {
    const { value, segmenters } = platform();
    const adapter = new BrowserTextLayoutAdapter(value);
    for (let index = 0; index < 5; index++) adapter.segment(`text ${index}`, "word", "en-GB");
    adapter.segment("text", "grapheme", "en-GB");
    adapter.segment("text", "word", "fr-FR");
    expect(segmenters).toEqual(["word:en-GB", "grapheme:en-GB", "word:fr-FR"]);
  });
});
