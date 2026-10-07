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

import { TFXTextContainer, TFXLayoutPlanner } from "../../src/FX/TextFX/public";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  NSELayoutManager,
  drawNSEString,
  measureNSEString,
} from "../../src/NSE/TextLayout";
import { attachmentRun, attributedContent, attributedContentLayoutText, attributedContentText, paragraph, textRun } from "../../src/NSE/Text";
import type {
  TFXTextHitTestRequest,
  TFXTextLayoutAdapter,
  TFXTextLayoutResult,
  TFXTextLayoutService,
  TFXTextMeasureRequest,
  TFXTextMeasurement,
  TFXTextRangeRectsRequest,
  TFXTextSegment,
} from "../../src/FX/TextFX/textLayoutTypes";
import { createTestRuntime, createTestRuntimeEnvironment } from "./helpers";

const font = Object.freeze({
  families: Object.freeze(["Prelude", "system-ui"]),
  size: 16,
  weight: 400,
  style: "normal" as const,
  stretch: "normal" as const,
});

class FixedTextLayoutAdapter implements TFXTextLayoutAdapter {
  readonly measurements: TFXTextMeasureRequest[] = [];
  readonly rangeRequests: TFXTextRangeRectsRequest[] = [];
  readonly hitRequests: TFXTextHitTestRequest[] = [];
  dispose = vi.fn();
  activeNodeCount = 0;

  segment(text: string, granularity: "grapheme" | "word", locale: string): readonly TFXTextSegment[] {
    const segments = [...new Intl.Segmenter(locale, { granularity }).segment(text)];
    return Object.freeze(segments.map((entry) => Object.freeze({
      segment: entry.segment,
      index: entry.index,
      end: entry.index + entry.segment.length,
      breakOpportunity: granularity === "word" ? !entry.isWordLike || /\s/u.test(entry.segment) : false,
    })));
  }

  async measure(request: TFXTextMeasureRequest): Promise<TFXTextMeasurement> {
    request.signal.throwIfAborted();
    this.measurements.push(request);
    const graphemes = this.segment(request.text, "grapheme", request.locale).length;
    return Object.freeze({
      advance: graphemes * 8,
      ascent: 12,
      descent: 4,
      baseline: 12,
      inkBounds: Object.freeze({ x: 0, y: 0, width: graphemes * 8, height: 16 }),
    });
  }

  async rangeRects(request: TFXTextRangeRectsRequest) {
    request.signal.throwIfAborted();
    this.rangeRequests.push(request);
    return Object.freeze([Object.freeze({ x: 18, y: 2, width: 22, height: 16 })]);
  }

  async hitTest(request: TFXTextHitTestRequest) {
    request.signal.throwIfAborted();
    this.hitRequests.push(request);
    return Object.freeze({ offset: 3, affinity: "downstream" as const });
  }

  diagnostics() {
    return Object.freeze({ activeMeasurementNodeCount: this.activeNodeCount });
  }

  yieldToHost(signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      const handle = setTimeout(resolve, 0);
      signal.addEventListener("abort", () => { clearTimeout(handle); reject(signal.reason); }, { once: true });
    });
  }
}

const runtimes: ReturnType<typeof createTestRuntime>[] = [];
function runtimeWithTextLayout(id: string, adapter = new FixedTextLayoutAdapter()) {
  const environment = createTestRuntimeEnvironment();
  Object.defineProperty(environment, "textLayout", { enumerable: true, value: {
    acquire: () => {
      let released = false;
      return { adapter, release: () => { if (!released) { released = true; adapter.dispose(); } } };
    },
  } });
  const runtime = createTestRuntime({ id, environment });
  runtimes.push(runtime);
  return { runtime, adapter };
}

afterEach(async () => {
  for (const runtime of runtimes.splice(0).reverse()) await runtime.dispose("text layout test cleanup");
});

describe("NSE logical text layout", () => {
  it("lays measured word fragments into an immutable bounded container", async () => {
    const { runtime } = runtimeWithTextLayout("runtime:text-layout-wrap");
    const manager = new NSELayoutManager({ service: runtime.textLayout });
    const container = new TFXTextContainer({
      size: { width: 40, height: 48 },
      insets: { blockStart: 0, inlineEnd: 0, blockEnd: 0, inlineStart: 0 },
      maximumLines: 3,
    });
    const result = await manager.layout({ text: "one two three", font, locale: "en-GB", direction: "ltr" }, [container]);
    expect(result.fragments.map(({ text, range, graphemeRange, rect }) => ({ text, range, graphemeRange, rect }))).toEqual([
      { text: "one ", range: { location: 0, length: 4 }, graphemeRange: { location: 0, length: 4 }, rect: { x: 0, y: 0, width: 32, height: 16 } },
      { text: "two ", range: { location: 4, length: 4 }, graphemeRange: { location: 4, length: 4 }, rect: { x: 0, y: 16, width: 32, height: 16 } },
      { text: "three", range: { location: 8, length: 5 }, graphemeRange: { location: 8, length: 5 }, rect: { x: 0, y: 32, width: 40, height: 16 } },
    ]);
    expect(Object.isFrozen(result.fragments)).toBe(true);
  });

  it("preserves code-unit and grapheme ranges for combining and ZWJ clusters", async () => {
    const { runtime } = runtimeWithTextLayout("runtime:text-layout-graphemes");
    const manager = new NSELayoutManager({ service: runtime.textLayout });
    const text = "A e\u0301 👩‍👩‍👧‍👦";
    const result = await manager.layout({ text, font, locale: "en-GB", direction: "ltr" }, [
      new TFXTextContainer({ size: { width: 400, height: 40 } }),
    ]);
    expect(result.fragments).toHaveLength(1);
    expect(result.fragments[0]?.range).toEqual({ location: 0, length: text.length });
    expect(result.fragments[0]?.graphemeRange.length).toBeLessThan(text.length);
    expect(result.fragments[0]?.text).toBe(text);
  });

  it("fails closed for exclusions instead of claiming shaping", async () => {
    const { runtime } = runtimeWithTextLayout("runtime:text-layout-unsupported");
    const manager = new NSELayoutManager({ service: runtime.textLayout });
    await expect(manager.layout({ text: "excluded", font, locale: "en-GB", direction: "ltr" }, [
      new TFXTextContainer({ size: { width: 100, height: 100 }, exclusionRects: [{ x: 2, y: 2, width: 8, height: 8 }] }),
    ])).rejects.toMatchObject({ name: "TFXUnsupportedTextLayoutFeatureError", feature: "exclusion-paths" });
  });

  it("produces fragments for vertical-rl and vertical-lr through the measurement adapter", async () => {
    const { runtime, adapter } = runtimeWithTextLayout("runtime:text-layout-vertical");
    const manager = new NSELayoutManager({ service: runtime.textLayout });
    const verticalRl = await manager.layout({ text: "ab", font, locale: "ja", direction: "ltr" }, [
      new TFXTextContainer({ size: { width: 48, height: 200 }, writingMode: "vertical-rl" }),
    ]);
    const verticalLr = await manager.layout({ text: "ab", font, locale: "ja", direction: "ltr" }, [
      new TFXTextContainer({ size: { width: 48, height: 200 }, writingMode: "vertical-lr" }),
    ]);
    expect(verticalRl.fragments).toHaveLength(1);
    expect(verticalLr.fragments).toHaveLength(1);
    expect(verticalRl.fragments[0]?.rect.height).toBe(16);
    expect(verticalRl.fragments[0]?.rect.x).toBeGreaterThan(verticalLr.fragments[0]?.rect.x ?? 0);
    expect(adapter.measurements.some((request) => request.writingMode === "vertical-rl")).toBe(true);
    expect(adapter.measurements.some((request) => request.writingMode === "vertical-lr")).toBe(true);
  });

  it("carries explicit container flow order and tail truncation through layout and drawing", async () => {
    const { runtime } = runtimeWithTextLayout("runtime:text-layout-flow-truncation");
    const manager = new NSELayoutManager({ service: runtime.textLayout });
    const later = new TFXTextContainer({
      size: { width: 32, height: 16 },
      maximumLines: 1,
      truncation: "tail",
      flowOrder: 20,
    });
    const first = new TFXTextContainer({
      size: { width: 32, height: 16 },
      maximumLines: 1,
      truncation: "tail",
      flowOrder: 10,
    });

    const result = await manager.layout({ text: "abcd efgh", font, locale: "en-GB", direction: "ltr" }, [later, first]);

    expect(first.truncation).toBe("tail");
    expect(first.flowOrder).toBe(10);
    expect(result.fragments).toEqual([expect.objectContaining({ containerIndex: 1, text: "abc…" })]);
    expect(result.truncated).toBe(true);

    const displayList = await drawNSEString(runtime.textLayout, "abcdef", {
      font,
      locale: "en-GB",
      direction: "ltr",
      origin: { x: 0.1, y: 0.1 },
      maximumSize: { width: 32, height: 16 },
      paragraphAttributes: { alignment: "end" },
      truncation: "middle",
      maximumLines: 1,
      baseline: 1.25,
      deviceScale: 2,
    });
    expect(displayList.commands).toEqual([expect.objectContaining({ text: "ab…f", origin: { x: 0, y: 1.5 }, baseline: 13.5, deviceScale: 2 })]);
  });

  it("places RTL fragments from the inline-end side", async () => {
    const { runtime } = runtimeWithTextLayout("runtime:text-layout-rtl-origin");
    const manager = new NSELayoutManager({ service: runtime.textLayout });
    const container = new TFXTextContainer({
      size: { width: 200, height: 40 },
      insets: { inlineStart: 10, inlineEnd: 0, blockStart: 0, blockEnd: 0 },
    });
    const ltr = await manager.layout({ text: "ab", font, locale: "en-GB", direction: "ltr" }, [container]);
    const rtl = await manager.layout({ text: "ab", font, locale: "ar", direction: "rtl" }, [container]);
    expect(ltr.fragments[0]?.rect.x).toBe(10);
    expect(rtl.fragments[0]?.rect.x).toBe(200 - 10 - 16);
    expect(rtl.fragments[0]?.rect.x).not.toBe(ltr.fragments[0]?.rect.x);
    const displayList = await drawNSEString(runtime.textLayout, "ab", {
      font, locale: "ar", direction: "rtl", origin: { x: 0, y: 0 }, maximumSize: { width: 200, height: 40 },
    });
    expect(displayList.commands[0]?.origin.x).toBe(200 - 16);
  });

  it("rejects when the caller aborts after layout, before publishing a command", async () => {
    const controller = new AbortController();
    const measure = vi.fn(async () => Object.freeze({
      advance: 8,
      ascent: 12,
      descent: 4,
      baseline: 12,
      inkBounds: Object.freeze({ x: 0, y: 0, width: 8, height: 16 }),
    }));
    const service = {
      layout: vi.fn(async (): Promise<TFXTextLayoutResult> => {
        controller.abort(new DOMException("layout was superseded", "AbortError"));
        return Object.freeze({
          fragments: Object.freeze([Object.freeze({
            text: "a",
            range: Object.freeze({ location: 0, length: 1 }),
            graphemeRange: Object.freeze({ location: 0, length: 1 }),
            rect: Object.freeze({ x: 0, y: 0, width: 8, height: 16 }),
            baseline: 12,
            containerIndex: 0,
          })]),
          laidOutRange: Object.freeze({ location: 0, length: 1 }),
          truncated: false,
        });
      }),
      measure,
    };

    await expect(drawNSEString(service, "a", {
      font, locale: "en-GB", direction: "ltr", origin: { x: 0, y: 0 }, maximumSize: { width: 80, height: 20 }, signal: controller.signal,
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(measure).not.toHaveBeenCalled();
  });

  it("does not return partial commands when a cooperative per-span measurement aborts", async () => {
    const controller = new AbortController();
    const measure = vi.fn(({ text, signal }: TFXTextMeasureRequest) => new Promise<TFXTextMeasurement>((resolve, reject) => {
      if (text === "a") {
        resolve(Object.freeze({ advance: 8, ascent: 12, descent: 4, baseline: 12, inkBounds: Object.freeze({ x: 0, y: 0, width: 8, height: 16 }) }));
        return;
      }
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      queueMicrotask(() => controller.abort(new DOMException("span was superseded", "AbortError")));
    }));
    const service = {
      layout: async (): Promise<TFXTextLayoutResult> => Object.freeze({
        fragments: Object.freeze([Object.freeze({
          text: "ab", range: Object.freeze({ location: 0, length: 2 }), graphemeRange: Object.freeze({ location: 0, length: 2 }),
          rect: Object.freeze({ x: 0, y: 0, width: 16, height: 16 }), baseline: 12, containerIndex: 0,
        })]),
        laidOutRange: Object.freeze({ location: 0, length: 2 }), truncated: false,
      }),
      measure,
    };

    await expect(drawNSEString(service, "ab", {
      attributedContent: attributedContent([paragraph([textRun("a"), textRun("b")])]),
      font, locale: "en-GB", direction: "ltr", origin: { x: 0, y: 0 }, maximumSize: { width: 80, height: 20 }, signal: controller.signal,
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(measure).toHaveBeenCalledTimes(2);
  });

  it("rechecks a non-cooperative delayed span measurement before returning", async () => {
    const controller = new AbortController();
    let releaseSecond: ((value: TFXTextMeasurement) => void) | undefined;
    let spanStarted!: () => void;
    const secondStarted = new Promise<void>((resolve) => { spanStarted = resolve; });
    const measurement = Object.freeze({ advance: 8, ascent: 12, descent: 4, baseline: 12, inkBounds: Object.freeze({ x: 0, y: 0, width: 8, height: 16 }) });
    const measure = vi.fn(({ text }: TFXTextMeasureRequest) => text === "a"
      ? Promise.resolve(measurement)
      : new Promise<TFXTextMeasurement>((resolve) => { releaseSecond = resolve; spanStarted(); }));
    const service = {
      layout: async (): Promise<TFXTextLayoutResult> => Object.freeze({
        fragments: Object.freeze([Object.freeze({
          text: "ab", range: Object.freeze({ location: 0, length: 2 }), graphemeRange: Object.freeze({ location: 0, length: 2 }),
          rect: Object.freeze({ x: 0, y: 0, width: 16, height: 16 }), baseline: 12, containerIndex: 0,
        })]),
        laidOutRange: Object.freeze({ location: 0, length: 2 }), truncated: false,
      }),
      measure,
    };
    const pending = drawNSEString(service, "ab", {
      attributedContent: attributedContent([paragraph([textRun("a"), textRun("b")])]),
      font, locale: "en-GB", direction: "ltr", origin: { x: 0, y: 0 }, maximumSize: { width: 80, height: 20 }, signal: controller.signal,
    });
    await secondStarted;
    controller.abort(new DOMException("late span was superseded", "AbortError"));
    releaseSecond?.(measurement);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(measure).toHaveBeenCalledTimes(2);
  });

  it("consumes canonical attributed runs and paragraph metrics, including tab stops", async () => {
    const { runtime, adapter } = runtimeWithTextLayout("runtime:text-layout-attributed-metrics");
    const manager = new NSELayoutManager({ service: runtime.textLayout });
    const content = attributedContent([paragraph([
      textRun("A\tB", { bold: true, font: { familyId: "prelude", size: 20 } }),
    ], {
      firstLineHeadIndent: 2,
      headIndent: 4,
      tailIndent: 0,
      lineHeightMultiple: 2,
      tabStops: [24],
    })]);
    const result = await manager.layout({ text: "A\tB", attributedContent: content, font, locale: "en-GB", direction: "ltr" }, [
      new TFXTextContainer({ size: { width: 80, height: 80 }, maximumLines: 2 }),
    ]);

    expect(result.fragments).toEqual([expect.objectContaining({
      text: "A\tB",
      rect: { x: 6, y: 0, width: 32, height: 32 },
      baseline: 20,
    })]);
    expect(adapter.measurements).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: "A", font: expect.objectContaining({ size: 20, weight: 700 }) }),
      expect.objectContaining({ text: "B", font: expect.objectContaining({ size: 20, weight: 700 }) }),
    ]));
  });

  it("keeps attachment alt text in transfer while laying out one unshaped object atom", async () => {
    const { runtime, adapter } = runtimeWithTextLayout("runtime:text-layout-attachment-atom");
    const content = attributedContent([paragraph([
      textRun("A"),
      attachmentRun({
        id: "attachment:one",
        kind: "image",
        source: { kind: "document-resource", documentId: "doc:one", resourceId: "resource:one", leaseId: "lease:one", generation: 1, mimeType: "image/png", byteLength: 68 },
        alt: "Long accessible description",
        intrinsicSize: { inline: 12, block: 18 },
      }),
      textRun("B"),
    ])]);
    const text = attributedContentLayoutText(content);
    expect(text).toBe("A\uFFFCB");
    expect(attributedContentText(content)).toBe("ALong accessible descriptionB");

    const manager = new NSELayoutManager({ service: runtime.textLayout });
    const result = await manager.layout({ text, attributedContent: content, font, locale: "en-GB", direction: "ltr" }, [
      new TFXTextContainer({ size: { width: 80, height: 40 }, maximumLines: 2 }),
    ]);
    expect(result.fragments).toEqual([expect.objectContaining({ text: "A\uFFFCB", range: { location: 0, length: 3 }, rect: expect.objectContaining({ width: 28, height: 22 }) })]);
    expect(adapter.measurements.map((entry) => entry.text)).not.toContain("\uFFFC");
    expect(adapter.measurements.map((entry) => entry.text)).not.toContain("Long accessible description");
    expect(() => manager.replaceCharacters({ location: 1, length: 1 }, "x")).toThrow(/attachment|boundary/i);
  });

  it("carries one canonical attributed value through layout into SVG display commands", async () => {
    const { runtime, adapter } = runtimeWithTextLayout("runtime:text-layout-attributed-drawing");
    const content = attributedContent([paragraph([
      textRun("Bold", { bold: true, font: { familyId: "prelude", size: 20 } }),
      textRun(" plain"),
    ])]);

    const displayList = await drawNSEString(runtime.textLayout, "Bold plain", {
      attributedContent: content,
      font,
      locale: "en-GB",
      direction: "ltr",
      origin: { x: 4, y: 6 },
      maximumSize: { width: 160, height: 40 },
    });

    expect(displayList.commands).toEqual([
      expect.objectContaining({ text: "Bold", range: { location: 0, length: 4 }, font: expect.objectContaining({ size: 20, weight: 700 }) }),
      expect.objectContaining({ text: " plain", range: { location: 4, length: 6 }, font: expect.objectContaining({ size: 16, weight: 400 }) }),
    ]);
    expect(adapter.measurements).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: "Bold", font: expect.objectContaining({ size: 20, weight: 700 }) }),
    ]));
  });

  it("retains a canonical run's layout attributes through a supported incremental replacement", async () => {
    const { runtime, adapter } = runtimeWithTextLayout("runtime:text-layout-attributed-replace");
    const manager = new NSELayoutManager({ service: runtime.textLayout });
    const full = new NSELayoutManager({ service: runtime.textLayout });
    const content = attributedContent([paragraph([
      textRun("prefix target suffix", { bold: true, font: { familyId: "prelude", size: 20 } }),
    ], { firstLineHeadIndent: 2, headIndent: 4, lineHeightMultiple: 2 })]);
    const expectedContent = attributedContent([paragraph([
      textRun("prefix REPLACED suffix", { bold: true, font: { familyId: "prelude", size: 20 } }),
    ], { firstLineHeadIndent: 2, headIndent: 4, lineHeightMultiple: 2 })]);
    const containers = [new TFXTextContainer({ size: { width: 120, height: 160 }, maximumLines: 8 })];
    const input = { text: "prefix target suffix", attributedContent: content, font, locale: "en-GB", direction: "ltr" as const };

    await manager.layout(input, containers);
    const measuredBefore = adapter.measurements.length;
    manager.replaceCharacters({ location: 7, length: 6 }, "REPLACED");
    const incremental = await manager.layout();
    const expected = await full.layout({ ...input, text: "prefix REPLACED suffix", attributedContent: expectedContent }, containers);

    expect(manager.attributedContent).toEqual(expectedContent);
    expect(incremental.fragments).toEqual(expected.fragments);
    expect(adapter.measurements.slice(measuredBefore)).toEqual(expect.arrayContaining([
      expect.objectContaining({ font: expect.objectContaining({ size: 20, weight: 700 }) }),
    ]));
  });

  it("relayouts only the dirty range after replaceCharacters", async () => {
    const { runtime, adapter } = runtimeWithTextLayout("runtime:text-layout-dirty-range");
    const manager = new NSELayoutManager({ service: runtime.textLayout });
    const prefix = "word ".repeat(12);
    const text = `${prefix}TAIL`;
    const container = new TFXTextContainer({ size: { width: 40, height: 400 }, maximumLines: 20 });
    await manager.layout({ text, font, locale: "en-GB", direction: "ltr" }, [container]);
    const measuredBefore = adapter.measurements.length;
    manager.replaceCharacters({ location: prefix.length, length: 4 }, "END!");
    await manager.layout();
    const remasured = adapter.measurements.slice(measuredBefore).map((request) => request.text);
    expect(remasured.some((value) => value.startsWith("word"))).toBe(false);
    expect(remasured.some((value) => value.includes("END"))).toBe(true);
    expect(manager.fragments.some((fragment) => fragment.text.includes("END"))).toBe(true);
    expect(manager.fragments.some((fragment) => fragment.range.location + fragment.range.length <= prefix.length)).toBe(true);
  });

  it("keeps incremental geometry equivalent to a full relayout after a middle edit", async () => {
    const { runtime } = runtimeWithTextLayout("runtime:text-layout-geometry-equivalence");
    const manager = new NSELayoutManager({ service: runtime.textLayout });
    const full = new NSELayoutManager({ service: runtime.textLayout });
    const input = { text: "one two three four five six", font, locale: "en-GB", direction: "ltr" as const };
    const container = new TFXTextContainer({ size: { width: 40, height: 240 }, maximumLines: 20 });

    await manager.layout(input, [container]);
    manager.replaceCharacters({ location: 4, length: 3 }, "TWO-LONG");
    const incremental = await manager.layout();
    const expected = await full.layout({ ...input, text: "one TWO-LONG three four five six" }, [container]);

    expect(incremental.fragments).toEqual(expected.fragments);
    expect(incremental.laidOutRange).toEqual(expected.laidOutRange);
    expect(incremental.truncated).toBe(expected.truncated);
  });

  it("uses the injected text-layout segmentation authority for incremental grapheme offsets", async () => {
    const adapter = new FixedTextLayoutAdapter();
    adapter.segment = vi.fn((text, granularity) => {
      const entries: TFXTextSegment[] = [];
      let index = 0;
      for (const segment of Array.from(text)) {
        entries.push(Object.freeze({ segment, index, end: index + segment.length, breakOpportunity: granularity === "word" && /\s/u.test(segment) }));
        index += segment.length;
      }
      return Object.freeze(entries);
    });
    const { runtime } = runtimeWithTextLayout("runtime:text-layout-injected-segmentation", adapter);
    const manager = new NSELayoutManager({ service: runtime.textLayout });
    const container = new TFXTextContainer({ size: { width: 80, height: 160 }, maximumLines: 12 });
    await manager.layout({ text: "A\ud83d\ude00BC DEF", font, locale: "en-GB", direction: "ltr" }, [container]);
    const segmenter = Intl.Segmenter;
    Object.defineProperty(Intl, "Segmenter", { configurable: true, value: undefined });
    try {
      manager.replaceCharacters({ location: 3, length: 1 }, "ZZ");
      await expect(manager.layout()).resolves.toMatchObject({ fragments: expect.any(Array) });
      expect(adapter.segment).toHaveBeenCalled();
    } finally {
      Object.defineProperty(Intl, "Segmenter", { configurable: true, value: segmenter });
    }
  });

  it.each([
    { label: "mid-line LTR", direction: "ltr" as const, locale: "en-GB", writingMode: "horizontal-tb" as const, size: { width: 40, height: 32 } },
    { label: "mid-line RTL", direction: "rtl" as const, locale: "ar", writingMode: "horizontal-tb" as const, size: { width: 40, height: 32 } },
    { label: "mid-container vertical-rl", direction: "ltr" as const, locale: "ja", writingMode: "vertical-rl" as const, size: { width: 32, height: 40 } },
    { label: "mid-container vertical-lr", direction: "ltr" as const, locale: "ja", writingMode: "vertical-lr" as const, size: { width: 32, height: 40 } },
  ])("keeps $label and later container geometry equivalent without measuring the unaffected prefix", async ({ direction, locale, writingMode, size }) => {
    const { runtime, adapter } = runtimeWithTextLayout(`runtime:text-layout-incremental-${writingMode}-${direction}`);
    const manager = new NSELayoutManager({ service: runtime.textLayout });
    const full = new NSELayoutManager({ service: runtime.textLayout });
    const text = "one two three four five six seven eight nine";
    const replacement = "RE-LONG";
    const location = text.indexOf("three") + 2;
    const containers = [
      new TFXTextContainer({ size, maximumLines: 2, writingMode }),
      new TFXTextContainer({ size, maximumLines: 3, writingMode }),
    ];
    const input = { text, font, locale, direction };

    await manager.layout(input, containers);
    const measuredBefore = adapter.measurements.length;
    manager.replaceCharacters({ location, length: 2 }, replacement);
    const incremental = await manager.layout();
    const incrementalMeasurements = adapter.measurements.slice(measuredBefore);
    const expected = await full.layout({ ...input, text: `${text.slice(0, location)}${replacement}${text.slice(location + 2)}` }, containers);

    expect(incremental.fragments).toEqual(expected.fragments);
    expect(incremental.laidOutRange).toEqual(expected.laidOutRange);
    expect(incremental.truncated).toBe(expected.truncated);
    expect(incrementalMeasurements.some((request) => request.text.includes("one") || request.text.includes("two"))).toBe(false);
  });

  it("does not publish a stale asynchronous layout over newer owned content", async () => {
    let resolveOld!: (result: TFXTextLayoutResult) => void;
    let resolveNew!: (result: TFXTextLayoutResult) => void;
    let call = 0;
    const result = (text: string): TFXTextLayoutResult => Object.freeze({
      fragments: Object.freeze([Object.freeze({
        text,
        range: Object.freeze({ location: 0, length: text.length }),
        graphemeRange: Object.freeze({ location: 0, length: text.length }),
        rect: Object.freeze({ x: 0, y: 0, width: text.length, height: 16 }),
        baseline: 12,
        containerIndex: 0,
      })]),
      laidOutRange: Object.freeze({ location: 0, length: text.length }),
      truncated: false,
    });
    const service: TFXTextLayoutService = {
      runtimeId: "runtime:stale-layout" as never,
      segment: vi.fn(() => Object.freeze([])),
      layout: vi.fn((input) => {
        call += 1;
        return new Promise<TFXTextLayoutResult>((resolve) => {
          if (call === 1) resolveOld = resolve;
          else resolveNew = resolve;
        });
      }),
      measure: vi.fn(),
      rangeRects: vi.fn(),
      hitTest: vi.fn(),
      diagnostics: () => ({ activeOperationCount: 0, activeMeasurementNodeCount: 0, lastLayoutWork: { segmentCount: 0, measurementCount: 0, graphemeAdvanceCount: 0, lineCount: 0 } }),
      dispose: vi.fn(),
    };
    const manager = new NSELayoutManager({ service });
    const container = new TFXTextContainer({ size: { width: 100, height: 40 } });
    const oldLayout = manager.layout({ text: "old", font, locale: "en-GB", direction: "ltr" }, [container]);
    const newLayout = manager.layout({ text: "new", font, locale: "en-GB", direction: "ltr" }, [container]);

    resolveNew(result("new"));
    await expect(newLayout).resolves.toMatchObject({ fragments: [{ text: "new" }] });
    resolveOld(result("old"));
    await expect(oldLayout).rejects.toMatchObject({ name: "AbortError" });
    expect(manager.text).toBe("new");
    expect(manager.fragments[0]?.text).toBe("new");
  });

  it("delegates RTL visual rectangles and hit testing to the measurement adapter", async () => {
    const { runtime, adapter } = runtimeWithTextLayout("runtime:text-layout-rtl");
    const rects = await runtime.textLayout.rangeRects({
      text: "مرحبا", range: { location: 1, length: 3 }, font, locale: "ar", direction: "rtl",
    });
    const hit = await runtime.textLayout.hitTest({
      text: "مرحبا", point: { x: 20, y: 8 }, font, locale: "ar", direction: "rtl",
    });
    expect(rects).toEqual([{ x: 18, y: 2, width: 22, height: 16 }]);
    expect(hit).toEqual({ offset: 3, affinity: "downstream" });
    expect(adapter.rangeRequests[0]?.direction).toBe("rtl");
    expect(adapter.hitRequests[0]?.direction).toBe("rtl");
  });

  it("produces bounded measurements and a closed immutable text display list", async () => {
    const { runtime } = runtimeWithTextLayout("runtime:string-drawing");
    const measured = await measureNSEString(runtime.textLayout, "hello", { font, locale: "en-GB", direction: "ltr" });
    const displayList = await drawNSEString(runtime.textLayout, "hello", {
      font, locale: "en-GB", direction: "ltr", origin: { x: 4, y: 6 }, maximumSize: { width: 80, height: 40 },
    });
    expect(measured).toEqual({ width: 40, height: 16 });
    expect(displayList.commands).toEqual([
      expect.objectContaining({ kind: "text", text: "hello", origin: { x: 4, y: 6 }, range: { location: 0, length: 5 } }),
    ]);
    expect(Object.isFrozen(displayList.commands)).toBe(true);
  });

  it("bounds planner work for long input and records precise invalidation ranges", async () => {
    const { runtime, adapter } = runtimeWithTextLayout("runtime:text-layout-bounds");
    const manager = new NSELayoutManager({ service: runtime.textLayout });
    const container = new TFXTextContainer({ size: { width: 80, height: 160 }, maximumLines: 10 });
    await manager.layout({ text: `${"word ".repeat(1_000)}tail`, font, locale: "en-GB", direction: "ltr" }, [container]);
    expect(adapter.measurements.length).toBeLessThanOrEqual(40);
    expect(runtime.textLayout.diagnostics().lastLayoutWork).toMatchObject({ lineCount: 10, measurementCount: adapter.measurements.length });
    manager.replaceCharacters({ location: 6, length: 9 }, "framework");
    expect(manager.invalidations).toEqual([
      { kind: "graphemes", range: { location: 6, length: 9 } },
      { kind: "layout", fromCharacter: 6 },
    ]);
  });

  it("cancels pending measurement on disposal and isolates two runtime adapters", async () => {
    const firstAdapter = new FixedTextLayoutAdapter();
    const secondAdapter = new FixedTextLayoutAdapter();
    let firstSignal: AbortSignal | undefined;
    firstAdapter.measure = vi.fn((request: TFXTextMeasureRequest) => {
      firstSignal = request.signal;
      return new Promise<TFXTextMeasurement>((_resolve, reject) => {
        request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true });
      });
    });
    const first = runtimeWithTextLayout("runtime:text-layout-first", firstAdapter);
    const second = runtimeWithTextLayout("runtime:text-layout-second", secondAdapter);
    const pending = first.runtime.textLayout.measure({ text: "pending", font, locale: "en-GB", direction: "ltr" });
    await first.runtime.dispose("measurement owner gone");
    runtimes.splice(runtimes.indexOf(first.runtime), 1);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(firstSignal?.aborted).toBe(true);
    expect(firstAdapter.dispose).toHaveBeenCalledTimes(1);
    expect(secondAdapter.dispose).not.toHaveBeenCalled();
    expect(second.runtime.textLayout.diagnostics()).toMatchObject({ activeOperationCount: 0, activeMeasurementNodeCount: 0 });
  });

  it("rejects hostile descriptor input without executing accessors", async () => {
    const { runtime } = runtimeWithTextLayout("runtime:text-layout-hostile");
    const read = vi.fn(() => ["Hostile"]);
    const hostileFont = Object.defineProperty({}, "families", { enumerable: true, get: read });
    await expect(runtime.textLayout.measure({
      text: "safe", font: hostileFont as typeof font, locale: "en-GB", direction: "ltr",
    })).rejects.toThrow(/data-only|accessor/i);
    expect(read).not.toHaveBeenCalled();
  });

  it("cancels one caller without poisoning the runtime-owned measurement port", async () => {
    const adapter = new FixedTextLayoutAdapter();
    const normalMeasure = adapter.measure.bind(adapter);
    adapter.measure = vi.fn((request: TFXTextMeasureRequest) => request.text === "pending"
      ? new Promise<TFXTextMeasurement>((_resolve, reject) => request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true }))
      : normalMeasure(request));
    const { runtime } = runtimeWithTextLayout("runtime:text-layout-caller-abort", adapter);
    const controller = new AbortController();
    const pending = runtime.textLayout.measure({ text: "pending", font, locale: "en-GB", direction: "ltr", signal: controller.signal });
    controller.abort(new DOMException("caller left", "AbortError"));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await expect(runtime.textLayout.measure({ text: "healthy", font, locale: "en-GB", direction: "ltr" })).resolves.toMatchObject({ advance: 56 });
    expect(runtime.textLayout.diagnostics()).toMatchObject({ activeOperationCount: 0, activeMeasurementNodeCount: 0 });
  });

  it("honours CRLF and LF hard breaks and exposes an explicit trailing line", async () => {
    const { runtime } = runtimeWithTextLayout("runtime:text-layout-hard-breaks");
    const manager = new NSELayoutManager({ service: runtime.textLayout });
    const result = await manager.layout({ text: "one\r\ntwo\n", font, locale: "en-GB", direction: "ltr" }, [
      new TFXTextContainer({ size: { width: 100, height: 64 }, maximumLines: 4 }),
    ]);
    expect(result.fragments.map(({ text, range, rect }) => ({ text, range, y: rect.y }))).toEqual([
      { text: "one", range: { location: 0, length: 3 }, y: 0 },
      { text: "two", range: { location: 5, length: 3 }, y: 16 },
      { text: "", range: { location: 9, length: 0 }, y: 32 },
    ]);
    expect(result.laidOutRange).toEqual({ location: 0, length: 9 });
    expect(result.truncated).toBe(false);
  });

  it("normalises text containers without invoking accessors and rejects non-finite geometry", () => {
    const sizeRead = vi.fn(() => ({ width: 20, height: 20 }));
    const hostile = Object.defineProperty({}, "size", { enumerable: true, get: sizeRead });
    expect(() => new TFXTextContainer(hostile as { size: { width: number; height: number } })).toThrow(/accessor|data-only/i);
    expect(sizeRead).not.toHaveBeenCalled();
    expect(() => new TFXTextContainer({ size: { width: Number.NaN, height: 20 } })).toThrow(/finite/i);
    expect(() => new TFXTextContainer({ size: { width: 20, height: 20 }, maximumLines: 0 })).toThrow(/maximum lines/i);
  });

  it("coalesces and bounds public invalidations", () => {
    const { runtime } = runtimeWithTextLayout("runtime:text-layout-invalidation-bound");
    const manager = new NSELayoutManager({ service: runtime.textLayout });
    for (let index = 0; index < 1_000; index += 1) manager.replaceCharacters({ location: index, length: 1 }, "x");
    expect(manager.invalidations).toEqual([
      { kind: "graphemes", range: { location: 0, length: 1_000 } },
      { kind: "layout", fromCharacter: 0 },
    ]);
    expect(Object.isFrozen(manager.invalidations)).toBe(true);
  });

  it("deeply snapshots display-list font inputs", async () => {
    const { runtime } = runtimeWithTextLayout("runtime:text-layout-display-snapshot");
    const families = ["Prelude", "system-ui"];
    const mutableFont = { ...font, families };
    const displayList = await drawNSEString(runtime.textLayout, "safe", {
      font: mutableFont, locale: "en-GB", direction: "ltr", origin: { x: 0, y: 0 }, maximumSize: { width: 100, height: 20 },
    });
    families[0] = "Mutated";
    expect(displayList.commands[0]?.font.families).toEqual(["Prelude", "system-ui"]);
    expect(Object.isFrozen(displayList.commands[0]?.font)).toBe(true);
    expect(Object.isFrozen(displayList.commands[0]?.font.families)).toBe(true);
  });

  it("normalises complete NSE drawing records before dereferencing nested values", async () => {
    const { runtime } = runtimeWithTextLayout("runtime:text-layout-nse-drawing-hostile");
    const fontRead = vi.fn(() => font);
    const hostileMeasureInput = Object.defineProperty(
      { locale: "en-GB", direction: "ltr" },
      "font",
      { enumerable: true, get: fontRead },
    );
    await expect(measureNSEString(runtime.textLayout, "safe", hostileMeasureInput as never)).rejects.toThrow(/accessor|data-only/i);
    expect(fontRead).not.toHaveBeenCalled();

    const familiesRead = vi.fn(() => ["Prelude"]);
    const hostileFont = Object.defineProperty({ size: 16, weight: 400, style: "normal", stretch: "normal" }, "families", { enumerable: true, get: familiesRead });
    await expect(measureNSEString(runtime.textLayout, "safe", {
      font: hostileFont as never, locale: "en-GB", direction: "ltr",
    })).rejects.toThrow(/accessor|data-only/i);
    expect(familiesRead).not.toHaveBeenCalled();

    const originRead = vi.fn(() => 0);
    const hostileOrigin = Object.defineProperty({ y: 0 }, "x", { enumerable: true, get: originRead });
    await expect(drawNSEString(runtime.textLayout, "safe", {
      font, locale: "en-GB", direction: "ltr", origin: hostileOrigin as never, maximumSize: { width: 100, height: 20 },
    })).rejects.toThrow(/accessor|data-only/i);
    expect(originRead).not.toHaveBeenCalled();

    const widthRead = vi.fn(() => 100);
    const hostileSize = Object.defineProperty({ height: 20 }, "width", { enumerable: true, get: widthRead });
    await expect(drawNSEString(runtime.textLayout, "safe", {
      font, locale: "en-GB", direction: "ltr", origin: { x: 0, y: 0 }, maximumSize: hostileSize as never,
    })).rejects.toThrow(/accessor|data-only/i);
    expect(widthRead).not.toHaveBeenCalled();
  });

  it("normalises manager and typesetter options and dense container slots before use", async () => {
    const { runtime } = runtimeWithTextLayout("runtime:text-layout-nse-containers-hostile");
    const serviceRead = vi.fn(() => runtime.textLayout);
    const hostileOptions = Object.defineProperty({}, "service", { enumerable: true, get: serviceRead });
    expect(() => new NSELayoutManager(hostileOptions as never)).toThrow(/accessor|data-only/i);
    expect(() => new TFXLayoutPlanner(hostileOptions as never)).toThrow(/accessor|data-only/i);
    expect(serviceRead).not.toHaveBeenCalled();

    const manager = new NSELayoutManager({ service: runtime.textLayout });
    const typesetter = new TFXLayoutPlanner({ service: runtime.textLayout });
    const containerRead = vi.fn(() => new TFXTextContainer({ size: { width: 100, height: 20 } }));
    const hostileContainers: TFXTextContainer[] = [];
    Object.defineProperty(hostileContainers, "0", { enumerable: true, get: containerRead });
    hostileContainers.length = 1;
    const input = { text: "safe", font, locale: "en-GB", direction: "ltr" as const };
    await expect(Promise.resolve().then(() => manager.layout(input, hostileContainers))).rejects.toThrow(/accessor|data-only|dense/i);
    await expect(Promise.resolve().then(() => typesetter.plan(input, hostileContainers))).rejects.toThrow(/accessor|data-only|dense/i);
    expect(containerRead).not.toHaveBeenCalled();

    const sparseContainers = new Array<TFXTextContainer>(1);
    await expect(Promise.resolve().then(() => manager.layout(input, sparseContainers))).rejects.toThrow(/sparse|dense/i);
    await expect(Promise.resolve().then(() => typesetter.plan(input, sparseContainers))).rejects.toThrow(/sparse|dense/i);
  });

  it("cooperatively cancels long unbroken layout with bounded advancing work", async () => {
    const { runtime } = runtimeWithTextLayout("runtime:text-layout-cooperative");
    const manager = new NSELayoutManager({ service: runtime.textLayout });
    const controller = new AbortController();
    const pending = manager.layout({ text: "a".repeat(5_000), font, locale: "en-GB", direction: "ltr", signal: controller.signal }, [
      new TFXTextContainer({ size: { width: 8, height: 80_000 }, maximumLines: 5_000 }),
    ]);
    setTimeout(() => controller.abort(new DOMException("input superseded", "AbortError")), 0);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(runtime.textLayout.diagnostics()).toMatchObject({
      activeOperationCount: 0,
      lastLayoutWork: { graphemeAdvanceCount: expect.any(Number), measurementCount: expect.any(Number) },
    });
    expect(runtime.textLayout.diagnostics().lastLayoutWork.graphemeAdvanceCount).toBeLessThanOrEqual(128);
  });

  it("advances once through a completed long unbroken token", async () => {
    const { runtime } = runtimeWithTextLayout("runtime:text-layout-linear-token");
    const manager = new NSELayoutManager({ service: runtime.textLayout });
    await manager.layout({ text: "a".repeat(512), font, locale: "en-GB", direction: "ltr" }, [
      new TFXTextContainer({ size: { width: 8, height: 8_192 }, maximumLines: 512 }),
    ]);
    expect(runtime.textLayout.diagnostics().lastLayoutWork).toMatchObject({
      graphemeAdvanceCount: 512,
      lineCount: 512,
    });
    expect(runtime.textLayout.diagnostics().lastLayoutWork.measurementCount).toBeLessThanOrEqual(513);
  });
});
