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

import type { GFXPoint, GFXRect, GFXSize } from "../../FX/GraphicsFX/GFXGeometry";
import type { RangeValue } from "../Models/GeometryValues";
import type { SynCloudOSRuntimeId } from "../Runtime/runtimeInstanceTypes";
import type { RuntimeCacheRegistry } from "../Cache";
import { createTFXFontHost } from "./TFXFontHost";
import {
  TFXUnsupportedTextLayoutFeatureError,
  type TFXLogicalTextInput,
  type TFXTextContainerValue,
  type TFXTextFontDescriptor,
  type TFXTextHitTestRequest,
  type TFXTextLayoutAdapter,
  type TFXTextLayoutResult,
  type TFXTextLayoutService,
  type TFXTextMeasureRequest,
  type TFXTextMeasurement,
  type TFXTextRangeRectsRequest,
  type TFXTextSegment,
} from "../../FX/TextFX/textLayoutTypes";

const maximumTextBytes = 1_048_576;
const maximumSegments = 100_000;
const maximumContainers = 64;
const encoder = new TextEncoder();

function abortError(message: string): DOMException {
  return new DOMException(message, "AbortError");
}

function canonicalAbortReason(reason: unknown, fallback: string): DOMException {
  return reason instanceof DOMException && reason.name === "AbortError"
    ? reason
    : abortError(typeof reason === "string" && reason.length > 0 ? reason : fallback);
}

function finite(value: unknown, label: string, minimum = 0, maximum = 1_000_000): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new TypeError(`${label} must be a finite number from ${minimum} to ${maximum}.`);
  }
  return value;
}

function boundedText(value: unknown): string {
  if (typeof value !== "string") throw new TypeError("Text must be a string.");
  if (encoder.encode(value).byteLength > maximumTextBytes) throw new RangeError("Text exceeds the layout byte limit.");
  return value;
}

function normaliseLocale(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9-]{1,64}$/u.test(value)) throw new TypeError("Locale must be a bounded language tag.");
  return value;
}

function normaliseDirection(value: unknown): "ltr" | "rtl" {
  if (value !== "ltr" && value !== "rtl") throw new TypeError("Text direction must be ltr or rtl.");
  return value;
}

function normaliseWritingMode(value: unknown): "horizontal-tb" | "vertical-rl" | "vertical-lr" {
  if (value !== "horizontal-tb" && value !== "vertical-rl" && value !== "vertical-lr") throw new TypeError("Writing mode is invalid.");
  return value;
}

function normaliseTruncation(value: unknown): TFXTextContainerValue["truncation"] {
  if (value !== "none" && value !== "head" && value !== "middle" && value !== "tail") throw new TypeError("Text truncation is invalid.");
  return value;
}

function dataRecord(value: unknown, label: string, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be a plain data-only object.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be a plain data-only object.`);
  if (Object.getOwnPropertySymbols(value).length > 0) throw new TypeError(`${label} must not contain symbols.`);
  const result: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!allowed.includes(key)) throw new TypeError(`${label} contains unsupported property ${key}.`);
    if (!("value" in descriptor)) throw new TypeError(`${label} must not contain accessors.`);
    result[key] = descriptor.value;
  }
  return result;
}

function denseDataArray(value: unknown, label: string, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) throw new TypeError(`${label} must be a bounded dense plain array.`);
  if (Object.getOwnPropertySymbols(value).length > 0) throw new TypeError(`${label} must not contain symbols.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor)) throw new TypeError(`${label} must not contain sparse or accessor slots.`);
    result.push(descriptor.value);
  }
  const unsupported = Object.keys(descriptors).find((key) => key !== "length" && !/^(?:0|[1-9]\d*)$/u.test(key));
  if (unsupported) throw new TypeError(`${label} contains unsupported property ${unsupported}.`);
  return result;
}

function normaliseSafePoint(value: unknown): GFXPoint {
  const record = dataRecord(value, "Text point", ["x", "y"]);
  return Object.freeze({ x: finite(record.x, "Point x", -1_000_000, 1_000_000), y: finite(record.y, "Point y", -1_000_000, 1_000_000) });
}

function normaliseSafeSize(value: unknown): GFXSize {
  const record = dataRecord(value, "Text size", ["width", "height"]);
  return Object.freeze({ width: finite(record.width, "Size width"), height: finite(record.height, "Size height") });
}

function normaliseSafeRect(value: unknown): GFXRect {
  const record = dataRecord(value, "Text rectangle", ["x", "y", "width", "height"]);
  return Object.freeze({
    x: finite(record.x, "Rectangle x", -1_000_000, 1_000_000),
    y: finite(record.y, "Rectangle y", -1_000_000, 1_000_000),
    width: finite(record.width, "Rectangle width"),
    height: finite(record.height, "Rectangle height"),
  });
}

function normaliseSafeRange(value: unknown, textLength: number): RangeValue {
  const record = dataRecord(value, "Text range", ["location", "length"]);
  if (!Number.isSafeInteger(record.location) || (record.location as number) < 0 || !Number.isSafeInteger(record.length) || (record.length as number) < 0) throw new RangeError("Text range is invalid.");
  const location = record.location as number;
  const length = record.length as number;
  if (location + length > textLength) throw new RangeError("Text range exceeds the input.");
  return Object.freeze({ location, length });
}

function normaliseFont(value: TFXTextFontDescriptor): TFXTextFontDescriptor {
  const record = dataRecord(value, "Font descriptor", ["families", "size", "weight", "style", "stretch"]);
  const rawFamilies = denseDataArray(record.families, "Font families", 16);
  const families = rawFamilies.length > 0
    ? rawFamilies.map((family) => {
      if (typeof family !== "string" || !/^[^\u0000-\u001f\u007f;{}<>\\]{1,128}$/u.test(family)) throw new TypeError("Font family is invalid.");
      return family;
    })
    : null;
  if (!families) throw new TypeError("Font families must be a bounded array.");
  const style = record.style as TFXTextFontDescriptor["style"];
  const stretch = record.stretch as TFXTextFontDescriptor["stretch"];
  if (!(["normal", "italic", "oblique"] as const).includes(style)) throw new TypeError("Font style is invalid.");
  if (!(["normal", "condensed", "semi-condensed", "semi-expanded", "expanded"] as const).includes(stretch)) throw new TypeError("Font stretch is invalid.");
  return Object.freeze({
    families: Object.freeze(families),
    size: finite(record.size, "Font size", 1, 512),
    weight: finite(record.weight, "Font weight", 1, 1_000),
    style,
    stretch,
  });
}

function normaliseContainer(value: TFXTextContainerValue): TFXTextContainerValue {
  const record = dataRecord(value, "Text container", ["size", "insets", "maximumLines", "truncation", "writingMode", "flowOrder", "exclusionRects"]);
  const insetRecord = dataRecord(record.insets, "Text-container insets", ["blockStart", "inlineEnd", "blockEnd", "inlineStart"]);
  const size = normaliseSafeSize(record.size);
  const insets = Object.freeze({
    blockStart: finite(insetRecord.blockStart, "Block-start inset"),
    inlineEnd: finite(insetRecord.inlineEnd, "Inline-end inset"),
    blockEnd: finite(insetRecord.blockEnd, "Block-end inset"),
    inlineStart: finite(insetRecord.inlineStart, "Inline-start inset"),
  });
  if (insets.inlineStart + insets.inlineEnd > size.width || insets.blockStart + insets.blockEnd > size.height) {
    throw new RangeError("Text-container insets exceed its size.");
  }
  if (!Number.isSafeInteger(record.maximumLines) || (record.maximumLines as number) < 1 || (record.maximumLines as number) > 10_000) {
    throw new RangeError("Maximum lines must be a bounded positive integer.");
  }
  if (!Number.isSafeInteger(record.flowOrder) || (record.flowOrder as number) < -1_000_000 || (record.flowOrder as number) > 1_000_000) {
    throw new RangeError("Text-container flow order must be a bounded integer.");
  }
  const exclusions = denseDataArray(record.exclusionRects, "Text-container exclusions", 1_024).map(normaliseSafeRect);
  return Object.freeze({
    size,
    insets,
    maximumLines: record.maximumLines as number,
    truncation: normaliseTruncation(record.truncation),
    writingMode: normaliseWritingMode(record.writingMode),
    flowOrder: record.flowOrder as number,
    exclusionRects: Object.freeze(exclusions),
  });
}

function normaliseContinuation(
  value: unknown,
  containers: readonly TFXTextContainerValue[],
): { readonly containerIndex: number; readonly lineIndex: number; readonly blockOffset: number; readonly textOffset: number } | null {
  if (value === undefined) return null;
  const record = dataRecord(value, "Text-layout continuation", ["containerIndex", "lineIndex", "blockOffset", "textOffset"]);
  const containerIndex = record.containerIndex;
  const lineIndex = record.lineIndex;
  if (!Number.isSafeInteger(containerIndex) || (containerIndex as number) < 0 || (containerIndex as number) >= containers.length) {
    throw new RangeError("Text-layout continuation container index is invalid.");
  }
  const container = containers[containerIndex as number]!;
  if (!Number.isSafeInteger(lineIndex) || (lineIndex as number) < 0 || (lineIndex as number) > container.maximumLines) {
    throw new RangeError("Text-layout continuation line index is invalid.");
  }
  const vertical = container.writingMode !== "horizontal-tb";
  const blockExtent = (vertical ? container.size.width : container.size.height)
    - container.insets.blockStart - container.insets.blockEnd;
  const blockOffset = finite(record.blockOffset, "Text-layout continuation block offset");
  if (blockOffset > blockExtent) throw new RangeError("Text-layout continuation block offset exceeds its container.");
  if (!Number.isSafeInteger(record.textOffset) || (record.textOffset as number) < 0 || (record.textOffset as number) > 1_000_000) {
    throw new RangeError("Text-layout continuation text offset is invalid.");
  }
  return Object.freeze({ containerIndex: containerIndex as number, lineIndex: lineIndex as number, blockOffset, textOffset: record.textOffset as number });
}

interface ParagraphLayoutMetrics {
  readonly alignment: "start" | "centre" | "end" | "justify";
  readonly firstLineHeadIndent: number;
  readonly headIndent: number;
  readonly tailIndent: number;
  readonly lineHeightMultiple: number;
  readonly tabStops: readonly number[];
}

interface AttributedLayoutSpan {
  readonly start: number;
  readonly end: number;
  readonly font: TFXTextFontDescriptor;
  readonly paragraph: ParagraphLayoutMetrics;
  readonly attachment: { readonly inline: number; readonly block: number } | null;
}

interface AttributedLayoutParagraph {
  readonly start: number;
  readonly end: number;
  readonly metrics: ParagraphLayoutMetrics;
}

interface AttributedLayoutModel {
  readonly spans: readonly AttributedLayoutSpan[];
  readonly paragraphs: readonly AttributedLayoutParagraph[];
}

interface LayoutStyle {
  readonly font: TFXTextFontDescriptor;
  readonly paragraph: ParagraphLayoutMetrics;
  readonly paragraphStart: number;
  readonly until: number;
  readonly attachment: { readonly inline: number; readonly block: number } | null;
}

function sameLayoutStyle(left: LayoutStyle, right: LayoutStyle): boolean {
  return left.font === right.font && left.paragraph === right.paragraph && left.paragraphStart === right.paragraphStart && left.attachment === right.attachment;
}

const defaultParagraphMetrics: ParagraphLayoutMetrics = Object.freeze({
  alignment: "start",
  firstLineHeadIndent: 0,
  headIndent: 0,
  tailIndent: 0,
  lineHeightMultiple: 1,
  tabStops: Object.freeze([]),
});

function normaliseAttributedParagraphMetrics(value: unknown): ParagraphLayoutMetrics {
  if (value === undefined) return defaultParagraphMetrics;
  const record = dataRecord(value, "Attributed paragraph metrics", ["alignment", "firstLineHeadIndent", "headIndent", "tailIndent", "lineHeightMultiple", "tabStops"]);
  const alignment = record.alignment ?? "start";
  if (alignment !== "start" && alignment !== "centre" && alignment !== "end" && alignment !== "justify") {
    throw new TypeError("Attributed paragraph alignment is invalid.");
  }
  const firstLineHeadIndent = finite(record.firstLineHeadIndent ?? 0, "Attributed first-line indent", -100_000, 100_000);
  const headIndent = finite(record.headIndent ?? 0, "Attributed head indent", -100_000, 100_000);
  const tailIndent = finite(record.tailIndent ?? 0, "Attributed tail indent", -100_000, 100_000);
  const lineHeightMultiple = finite(record.lineHeightMultiple ?? 1, "Attributed line-height multiple", 0.01, 100);
  const tabStops = denseDataArray(record.tabStops ?? [], "Attributed tab stops", 64).map((stop) => finite(stop, "Attributed tab stop", 0, 100_000));
  for (let index = 1; index < tabStops.length; index += 1) {
    if (tabStops[index]! <= tabStops[index - 1]!) throw new TypeError("Attributed tab stops must be strictly ascending.");
  }
  return Object.freeze({
    alignment,
    firstLineHeadIndent,
    headIndent,
    tailIndent,
    lineHeightMultiple,
    tabStops: Object.freeze(tabStops),
  });
}

function normaliseAttributedFont(value: unknown, base: TFXTextFontDescriptor): TFXTextFontDescriptor {
  if (value === undefined) return base;
  const record = dataRecord(value, "Attributed text attributes", ["bold", "italic", "underline", "strike", "language", "foregroundColour", "backgroundColour", "link", "baseline", "font"]);
  if (record.bold !== undefined && typeof record.bold !== "boolean") throw new TypeError("Attributed bold value is invalid.");
  if (record.italic !== undefined && typeof record.italic !== "boolean") throw new TypeError("Attributed italic value is invalid.");
  if (record.font === undefined) {
    return Object.freeze({
      ...base,
      weight: record.bold === true ? Math.max(base.weight, 700) : base.weight,
      style: record.italic === true ? "italic" : base.style,
    });
  }
  const descriptor = dataRecord(record.font, "Attributed run font", ["familyId", "face", "size"]);
  if (typeof descriptor.familyId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(descriptor.familyId)) {
    throw new TypeError("Attributed run font family is invalid.");
  }
  if (descriptor.face !== undefined && (typeof descriptor.face !== "string" || !/^[^\u0000-\u001f\u007f;{}<>\\]{1,128}$/u.test(descriptor.face))) {
    throw new TypeError("Attributed run font face is invalid.");
  }
  const family = (descriptor.face as string | undefined) ?? descriptor.familyId;
  const families = Object.freeze([family, ...base.families.filter((candidate) => candidate !== family)]);
  return Object.freeze({
    families,
    size: descriptor.size === undefined ? base.size : finite(descriptor.size, "Attributed run font size", 1, 512),
    weight: record.bold === true ? Math.max(base.weight, 700) : base.weight,
    style: record.italic === true ? "italic" : base.style,
    stretch: base.stretch,
  });
}

function normaliseAttachmentSize(value: unknown): { readonly inline: number; readonly block: number } | null {
  if (value === undefined) return null;
  const record = dataRecord(value, "Attributed attachment size", ["inline", "block"]);
  return Object.freeze({
    inline: finite(record.inline, "Attributed attachment inline size", 0.01, 32_768),
    block: finite(record.block, "Attributed attachment block size", 0.01, 32_768),
  });
}

function normaliseAttributedLayout(
  value: unknown,
  text: string,
  baseFont: TFXTextFontDescriptor,
  textOffset: number,
): AttributedLayoutModel | null {
  if (value === undefined) return null;
  const content = dataRecord(value, "Attributed text content", ["type", "version", "blocks"]);
  if (content.type !== "nse-attributed-content" || content.version !== 1) throw new TypeError("Attributed text content version is invalid.");
  const spans: AttributedLayoutSpan[] = [];
  const paragraphs: AttributedLayoutParagraph[] = [];
  let canonicalText = "";
  const blocks = denseDataArray(content.blocks, "Attributed paragraphs", 20_000);
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = dataRecord(blocks[blockIndex], "Attributed paragraph", ["kind", "runs", "attributes"]);
    if (block.kind !== "paragraph") throw new TypeError("Attributed text blocks must be paragraphs.");
    const metrics = normaliseAttributedParagraphMetrics(block.attributes);
    const paragraphStart = canonicalText.length;
    const runs = denseDataArray(block.runs, "Attributed paragraph runs", 20_000);
    for (const rawRun of runs) {
      const run = dataRecord(rawRun, "Attributed text run", ["kind", "text", "attributes", "id", "attachmentKind", "source", "alt", "intrinsicSize", "caption"]);
      if (run.kind === "text") {
        if (typeof run.text !== "string") throw new TypeError("Attributed text run text is invalid.");
        const start = canonicalText.length;
        canonicalText += run.text;
        if (run.text.length > 0) spans.push(Object.freeze({
          start,
          end: canonicalText.length,
          font: normaliseAttributedFont(run.attributes, baseFont),
          paragraph: metrics,
          attachment: null,
        }));
        continue;
      }
      if (run.kind !== "attachment" || typeof run.alt !== "string") throw new TypeError("Attributed attachment run is invalid.");
      const start = canonicalText.length;
      canonicalText += "\uFFFC";
      const attachment = normaliseAttachmentSize(run.intrinsicSize);
      if (!attachment) throw new TypeError("Attributed image layout requires resolved intrinsic attachment metrics.");
      spans.push(Object.freeze({
        start,
        end: canonicalText.length,
        font: baseFont,
        paragraph: metrics,
        attachment,
      }));
    }
    const paragraphEnd = canonicalText.length;
    paragraphs.push(Object.freeze({ start: paragraphStart, end: paragraphEnd, metrics }));
    if (blockIndex + 1 < blocks.length) {
      spans.push(Object.freeze({ start: canonicalText.length, end: canonicalText.length + 1, font: baseFont, paragraph: metrics, attachment: null }));
      canonicalText += "\n";
    }
  }
  if (blocks.length === 0) throw new TypeError("Attributed text content requires at least one paragraph.");
  if (textOffset + text.length > canonicalText.length || canonicalText.slice(textOffset, textOffset + text.length) !== text ||
      (textOffset === 0 && canonicalText.length !== text.length)) {
    throw new TypeError("Attributed text content does not match the requested layout text.");
  }
  return Object.freeze({ spans: Object.freeze(spans), paragraphs: Object.freeze(paragraphs) });
}

function layoutStyleAt(
  model: AttributedLayoutModel | null,
  baseFont: TFXTextFontDescriptor,
  textOffset: number,
  localOffset: number,
  textLength: number,
): LayoutStyle {
  const globalOffset = textOffset + localOffset;
  if (!model) return Object.freeze({
    font: baseFont,
    paragraph: defaultParagraphMetrics,
    paragraphStart: 0,
    until: textLength,
    attachment: null,
  });
  let low = 0;
  let high = model.spans.length - 1;
  while (low <= high) {
    const index = Math.floor((low + high) / 2);
    const span = model.spans[index]!;
    if (globalOffset < span.start) high = index - 1;
    else if (globalOffset >= span.end) low = index + 1;
    else {
      const paragraph = model.paragraphs.find((candidate) => globalOffset >= candidate.start && globalOffset <= candidate.end);
      return Object.freeze({
        font: span.font,
        paragraph: span.paragraph,
        paragraphStart: paragraph?.start ?? span.start,
        until: Math.min(textLength, span.end - textOffset),
        attachment: span.attachment,
      });
    }
  }
  const paragraph = model.paragraphs.find((candidate) => globalOffset >= candidate.start && globalOffset <= candidate.end)
    ?? model.paragraphs.at(-1);
  return Object.freeze({
    font: baseFont,
    paragraph: paragraph?.metrics ?? defaultParagraphMetrics,
    paragraphStart: paragraph?.start ?? textOffset,
    until: textLength,
    attachment: null,
  });
}

function validateSegments(segments: readonly TFXTextSegment[], text: string, label: string): readonly TFXTextSegment[] {
  const rawSegments = denseDataArray(segments, `${label} segmentation`, maximumSegments);
  let expected = 0;
  const result = rawSegments.map((value) => {
    const record = dataRecord(value, `${label} segment`, ["segment", "index", "end", "breakOpportunity"]);
    if (typeof record.segment !== "string" || record.index !== expected || record.end !== (record.index as number) + record.segment.length || text.slice(record.index as number, record.end as number) !== record.segment) {
      throw new TypeError(`${label} segmentation does not form an exact ordered partition.`);
    }
    expected = record.end as number;
    return Object.freeze({ segment: record.segment, index: record.index as number, end: record.end as number, breakOpportunity: record.breakOpportunity === true });
  });
  if (expected !== text.length) throw new TypeError(`${label} segmentation is incomplete.`);
  return Object.freeze(result);
}

function composeSignal(runtime: AbortSignal, caller?: AbortSignal): { readonly signal: AbortSignal; readonly release: () => void } {
  if (runtime.aborted) throw canonicalAbortReason(runtime.reason, "Runtime disposed.");
  if (caller?.aborted) throw canonicalAbortReason(caller.reason, "Text layout cancelled.");
  const controller = new AbortController();
  const abortRuntime = () => controller.abort(canonicalAbortReason(runtime.reason, "Runtime disposed."));
  const abortCaller = () => controller.abort(canonicalAbortReason(caller?.reason, "Text layout cancelled."));
  runtime.addEventListener("abort", abortRuntime, { once: true });
  caller?.addEventListener("abort", abortCaller, { once: true });
  return {
    signal: controller.signal,
    release: () => {
      runtime.removeEventListener("abort", abortRuntime);
      caller?.removeEventListener("abort", abortCaller);
    },
  };
}

const maximumCoalescedMeasurements = 4_096;
const maximumCoalescedMeasurementText = 256;

function measurementKey(request: TFXTextMeasureRequest): string {
  const font = request.font;
  return [request.text, font.families.join("\u0001"), font.size, font.weight, font.style, font.stretch, request.locale, request.direction, request.writingMode ?? "horizontal-tb"].join("\u0000");
}

function freezeMeasurement(value: TFXTextMeasurement): TFXTextMeasurement {
  const record = dataRecord(value, "Text measurement", ["advance", "ascent", "descent", "baseline", "inkBounds"]);
  return Object.freeze({
    advance: finite(record.advance, "Text advance"),
    ascent: finite(record.ascent, "Text ascent"),
    descent: finite(record.descent, "Text descent"),
    baseline: finite(record.baseline, "Text baseline"),
    inkBounds: normaliseSafeRect(record.inkBounds),
  });
}

export function createTextFXLayoutService(options: {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly signal: AbortSignal;
  readonly caches: RuntimeCacheRegistry;
  readonly adapterLease?: { readonly adapter: TFXTextLayoutAdapter; release(): void } | null;
}): TFXTextLayoutService {
  const active = new Set<AbortController>();
  let disposed = false;
  const adapterLease = options.adapterLease ?? null;
  const adapter = adapterLease?.adapter ?? null;
  const fontHost = createTFXFontHost({ runtimeId: options.runtimeId, signal: options.signal, caches: options.caches, adapter });
  const runtimeFontScope = fontHost.createScope(options.signal);
  let lastLayoutWork = { segmentCount: 0, measurementCount: 0, graphemeAdvanceCount: 0, lineCount: 0 };

  const run = async <T>(caller: AbortSignal | undefined, operation: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    if (disposed) throw abortError("Text-layout service disposed.");
    if (!adapter) throw new TFXUnsupportedTextLayoutFeatureError("text-segmentation");
    const composed = composeSignal(options.signal, caller);
    const owner = new AbortController();
    const abortOwner = () => owner.abort(composed.signal.reason);
    composed.signal.addEventListener("abort", abortOwner, { once: true });
    active.add(owner);
    try {
      owner.signal.throwIfAborted();
      const result = await operation(owner.signal);
      owner.signal.throwIfAborted();
      if (disposed) throw abortError("Text-layout service disposed.");
      return result;
    } finally {
      active.delete(owner);
      composed.signal.removeEventListener("abort", abortOwner);
      composed.release();
    }
  };

  /**
   * Runs one layout batch with a measurement lease when the adapter offers
   * one: one measurement surface for the whole batch instead of one per
   * token, and identical requests within the batch measured once. Adapters
   * without leases are measured per request, as before.
   */
  const withMeasurementLease = async <T>(
    signal: AbortSignal,
    operation: (measureText: (request: TFXTextMeasureRequest) => Promise<TFXTextMeasurement>) => Promise<T>,
  ): Promise<T> => {
    const lease = adapter!.acquireMeasurementLease?.(signal) ?? null;
    if (!lease) return operation((request) => adapter!.measure(request));
    const measurements = new Map<string, TFXTextMeasurement>();
    try {
      return await operation(async (request) => {
        const key = request.text.length > maximumCoalescedMeasurementText ? null : measurementKey(request);
        const cached = key === null ? undefined : measurements.get(key);
        if (cached) return cached;
        const result = freezeMeasurement(await lease.measure(request));
        if (key !== null && measurements.size < maximumCoalescedMeasurements) measurements.set(key, result);
        return result;
      });
    } finally {
      lease.release();
    }
  };

  const measure = (input: Omit<TFXTextMeasureRequest, "signal"> & { readonly signal?: AbortSignal }) => {
    const record = dataRecord(input, "Text-measurement request", ["text", "font", "locale", "direction", "writingMode", "signal"]);
    return run(record.signal as AbortSignal | undefined, async (signal) => {
    const request = Object.freeze({
      text: boundedText(record.text), font: normaliseFont(record.font as TFXTextFontDescriptor), locale: normaliseLocale(record.locale),
      direction: normaliseDirection(record.direction), writingMode: normaliseWritingMode(record.writingMode ?? "horizontal-tb"), signal,
    });
    return freezeMeasurement(await adapter!.measure(request));
    });
  };

  const service: TFXTextLayoutService = {
    geometryCapabilities: Object.freeze({ kind: "logical-dom", units: "css-pixels", exclusions: false, shapedCarets: false }),
    runtimeId: options.runtimeId,
    get fontReadinessGeneration() { return runtimeFontScope.fontReadinessGeneration; },
    registerFont(bytes, descriptor, signal) {
      return runtimeFontScope.registerFont(bytes, descriptor, signal);
    },
    registerFontResource(relativeBundlePath, descriptor, signal) {
      return runtimeFontScope.registerFontResource(relativeBundlePath, descriptor, signal);
    },
    subscribeFontReadiness(listener) {
      return runtimeFontScope.subscribeFontReadiness(listener);
    },
    createFontScope(signal, resourceLoader) {
      if (disposed) throw abortError("Text-layout service disposed.");
      return fontHost.createScope(signal, resourceLoader);
    },
    segment(input) {
      const record = dataRecord(input, "Text-segmentation request", ["text", "granularity", "locale", "signal"]);
      if (disposed) throw abortError("Text-layout service disposed.");
      if (!adapter) throw new TFXUnsupportedTextLayoutFeatureError("text-segmentation");
      const signal = record.signal as AbortSignal | undefined;
      signal?.throwIfAborted();
      options.signal.throwIfAborted();
      const granularity = record.granularity;
      if (granularity !== "grapheme" && granularity !== "word") throw new TypeError("Text segmentation granularity is invalid.");
      const text = boundedText(record.text);
      const locale = normaliseLocale(record.locale);
      const segments = validateSegments(adapter.segment(text, granularity, locale), text, granularity === "grapheme" ? "Grapheme" : "Word");
      signal?.throwIfAborted();
      options.signal.throwIfAborted();
      return segments;
    },
    async layout(input: TFXLogicalTextInput, rawContainers: readonly TFXTextContainerValue[]): Promise<TFXTextLayoutResult> {
      const inputRecord = dataRecord(input, "Text-layout request", ["text", "attributedContent", "font", "locale", "direction", "continuation", "signal"]);
      return run(inputRecord.signal as AbortSignal | undefined, (signal) => withMeasurementLease(signal, async (measureText) => {
        const text = boundedText(inputRecord.text);
        const font = normaliseFont(inputRecord.font as TFXTextFontDescriptor);
        const locale = normaliseLocale(inputRecord.locale);
        if (!Array.isArray(rawContainers) || rawContainers.length === 0 || rawContainers.length > maximumContainers) throw new RangeError("Text layout requires bounded containers.");
        const containers = denseDataArray(rawContainers, "Text containers", maximumContainers).map((container) => normaliseContainer(container as TFXTextContainerValue));
        const flowedContainers = Object.freeze(containers.map((container, sourceIndex) => Object.freeze({ container, sourceIndex }))
          .sort((left, right) => left.container.flowOrder - right.container.flowOrder || left.sourceIndex - right.sourceIndex));
        if (containers.some(({ exclusionRects }) => exclusionRects.length > 0)) throw new TFXUnsupportedTextLayoutFeatureError("exclusion-paths");
        const continuation = normaliseContinuation(inputRecord.continuation, containers);
        const textOffset = continuation?.textOffset ?? 0;
        const attributed = normaliseAttributedLayout(inputRecord.attributedContent, text, font, textOffset);
        signal.throwIfAborted();
        const direction = normaliseDirection(inputRecord.direction);
        const graphemes = validateSegments(adapter!.segment(text, "grapheme", locale), text, "Grapheme");
        const words = validateSegments(adapter!.segment(text, "word", locale), text, "Word");
        const work = { segmentCount: graphemes.length + words.length, measurementCount: 0, graphemeAdvanceCount: 0, lineCount: 0 };
        lastLayoutWork = work;
        let cooperativeUnits = 0;
        const cooperate = async () => {
          cooperativeUnits += 1;
          signal.throwIfAborted();
          if (cooperativeUnits % 64 === 0) await adapter!.yieldToHost(signal);
          signal.throwIfAborted();
        };
        const measured = async (
          value: string,
          writingMode: TFXTextContainerValue["writingMode"],
          measuredFont: TFXTextFontDescriptor = font,
        ) => {
          work.measurementCount += 1;
          const result = freezeMeasurement(await measureText(Object.freeze({ text: value, font: measuredFont, locale, direction, writingMode, signal })));
          await cooperate();
          return result;
        };
        const placeLine = (
          container: TFXTextContainerValue,
          lineAdvance: number,
          lineHeight: number,
          blockOffset: number,
          inlineLeading: number,
          inlineTrailing: number,
          alignment: ParagraphLayoutMetrics["alignment"],
        ) => {
          const insets = container.insets;
          const inlineExtent = (container.writingMode === "horizontal-tb" ? container.size.width : container.size.height)
            - insets.inlineStart - insets.inlineEnd - inlineLeading - inlineTrailing;
          const centredOffset = Math.max(0, (inlineExtent - lineAdvance) / 2);
          if (container.writingMode === "horizontal-tb") {
            const x = direction === "rtl"
              ? alignment === "end"
                ? insets.inlineEnd + inlineTrailing
                : alignment === "centre"
                  ? insets.inlineEnd + inlineTrailing + centredOffset
                  : container.size.width - insets.inlineStart - inlineLeading - lineAdvance
              : alignment === "end"
                ? container.size.width - insets.inlineEnd - inlineTrailing - lineAdvance
                : alignment === "centre"
                  ? insets.inlineStart + inlineLeading + centredOffset
                  : insets.inlineStart + inlineLeading;
            const y = insets.blockStart + blockOffset;
            return Object.freeze({ x, y, width: lineAdvance, height: lineHeight });
          }
          const y = alignment === "end"
            ? container.size.height - insets.inlineEnd - inlineTrailing - lineAdvance
            : alignment === "centre"
              ? insets.inlineStart + inlineLeading + centredOffset
              : insets.inlineStart + inlineLeading;
          const width = lineHeight;
          const x = container.writingMode === "vertical-rl"
            ? container.size.width - insets.blockStart - blockOffset - width
            : insets.blockStart + blockOffset;
          return Object.freeze({ x, y, width, height: lineAdvance });
        };
        type TextLayoutItem = { readonly kind: "text"; start: number; end: number; split: boolean; readonly style: LayoutStyle };
        type LayoutItem =
          | { readonly kind: "break"; readonly start: number; readonly end: number }
          | { readonly kind: "tab"; readonly start: number; readonly end: number; readonly style: LayoutStyle }
          | { readonly kind: "attachment"; readonly start: number; readonly end: number; readonly style: LayoutStyle }
          | TextLayoutItem;
        const items: LayoutItem[] = [];
        const appendText = (start: number, end: number, breakOpportunity: boolean, style: LayoutStyle) => {
          if (end <= start) return;
          const previous = items.at(-1);
          const value = text.slice(start, end);
          if (previous?.kind === "text" && sameLayoutStyle(previous.style, style) && breakOpportunity && /^\s+$/u.test(value)) {
            previous.end = end;
          } else items.push({ kind: "text", start, end, split: false, style });
        };
        const pushText = (start: number, end: number, breakOpportunity: boolean) => {
          let cursor = start;
          while (cursor < end) {
            const style = layoutStyleAt(attributed, font, textOffset, cursor, text.length);
            const styledEnd = Math.max(cursor + 1, Math.min(end, style.until));
            if (style.attachment) {
              if (text[cursor] !== "\uFFFC" || styledEnd !== cursor + 1) throw new TypeError("Attributed attachment must occupy one U+FFFC character.");
              items.push({ kind: "attachment", start: cursor, end: cursor + 1, style });
              cursor += 1;
              continue;
            }
            const tab = text.indexOf("\t", cursor);
            if (tab >= cursor && tab < styledEnd) {
              appendText(cursor, tab, breakOpportunity, style);
              items.push({ kind: "tab", start: tab, end: tab + 1, style: layoutStyleAt(attributed, font, textOffset, tab, text.length) });
              cursor = tab + 1;
            } else {
              appendText(cursor, styledEnd, breakOpportunity, style);
              cursor = styledEnd;
            }
          }
        };
        let consumedThrough = 0;
        for (const word of words) {
          let cursor = Math.max(word.index, consumedThrough);
          while (cursor < word.end) {
            let breakStart = -1;
            for (let scan = cursor; scan < word.end; scan += 1) {
              if (text[scan] === "\r" || text[scan] === "\n") {
                breakStart = scan;
                break;
              }
            }
            if (breakStart < 0) {
              pushText(cursor, word.end, word.breakOpportunity);
              break;
            }
            pushText(cursor, breakStart, word.breakOpportunity);
            const breakEnd = text[breakStart] === "\r" && text[breakStart + 1] === "\n" ? breakStart + 2 : breakStart + 1;
            items.push({ kind: "break", start: breakStart, end: breakEnd });
            consumedThrough = breakEnd;
            cursor = breakEnd;
          }
          await cooperate();
        }
        if (text.length > 0 && items.length === 0) throw new TypeError("Word segmentation is empty.");
        const graphemeOffsets = new Map<number, number>(graphemes.map(({ index: offset }, ordinal) => [offset, ordinal]));
        graphemeOffsets.set(text.length, graphemes.length);
        const graphemeLocation = (offset: number) => {
          const index = graphemeOffsets.get(offset);
          if (index === undefined) throw new TypeError("A word boundary split a grapheme cluster.");
          return index;
        };
        const truncateLine = async (
          lineStart: number,
          lineEnd: number,
          mode: Exclude<TFXTextContainerValue["truncation"], "none">,
          maximumAdvance: number,
          writingMode: TFXTextContainerValue["writingMode"],
          style: LayoutStyle,
        ) => {
          const carriageReturn = text.indexOf("\r", lineStart);
          const lineFeed = text.indexOf("\n", lineStart);
          const paragraphEnd = Math.min(
            carriageReturn < 0 ? text.length : carriageReturn,
            lineFeed < 0 ? text.length : lineFeed,
          );
          const sourceEnd = Math.max(lineEnd, paragraphEnd);
          const clusters = graphemes.filter((grapheme) => grapheme.index >= lineStart && grapheme.end <= sourceEnd).map((grapheme) => grapheme.segment);
          const candidateFor = (visible: number) => {
            if (mode === "tail") return `${clusters.slice(0, visible).join("")}…`;
            if (mode === "head") return `…${clusters.slice(Math.max(0, clusters.length - visible)).join("")}`;
            const leading = Math.ceil(visible / 2);
            return `${clusters.slice(0, leading).join("")}…${clusters.slice(Math.max(leading, clusters.length - (visible - leading))).join("")}`;
          };
          for (let visible = Math.max(0, clusters.length - 1); visible >= 0; visible -= 1) {
            const text = candidateFor(visible);
            const metrics = await measured(text, writingMode, style.font);
            if (metrics.advance <= maximumAdvance) return Object.freeze({ text, metrics });
          }
          return Object.freeze({ text: "", metrics: await measured("", writingMode, style.font) });
        };
        const fragments = [] as Array<TFXTextLayoutResult["fragments"][number]>;
        let itemIndex = 0;
        let pendingTrailingLine = text.length === 0;
        let laidOutEnd = 0;
        let carriedGrapheme: { readonly ordinal: number; readonly metrics: TFXTextMeasurement } | null = null;
        let terminatedByTruncation = false;
        const continuationFlowIndex = continuation === null ? 0 : flowedContainers.findIndex(({ sourceIndex }) => sourceIndex === continuation.containerIndex);
        if (continuationFlowIndex < 0) throw new RangeError("Text-layout continuation container index is invalid.");
        flow: for (let flowedIndex = continuationFlowIndex; flowedIndex < flowedContainers.length && (itemIndex < items.length || pendingTrailingLine); flowedIndex += 1) {
          const { container, sourceIndex: containerIndex } = flowedContainers[flowedIndex]!;
          const vertical = container.writingMode !== "horizontal-tb";
          const inlineExtent = (vertical ? container.size.height : container.size.width)
            - container.insets.inlineStart - container.insets.inlineEnd;
          const blockExtent = (vertical ? container.size.width : container.size.height)
            - container.insets.blockStart - container.insets.blockEnd;
          let line = continuation && containerIndex === continuation.containerIndex ? continuation.lineIndex : 0;
          let blockOffset = continuation && containerIndex === continuation.containerIndex ? continuation.blockOffset : 0;
          while ((itemIndex < items.length || pendingTrailingLine) && line < container.maximumLines) {
            await cooperate();
            const lineItemIndex = itemIndex;
            const linePendingTrailing = pendingTrailingLine;
            const lineLaidOutEnd = laidOutEnd;
            const lineCarriedGrapheme: { readonly ordinal: number; readonly metrics: TFXTextMeasurement } | null = carriedGrapheme;
            let mutatedToken: Extract<LayoutItem, { kind: "text" }> | null = null;
            let mutatedTokenStart = 0;
            let lineStart = pendingTrailingLine ? text.length : items[itemIndex]!.start;
            let lineEnd = lineStart;
            const lineStyle = layoutStyleAt(attributed, font, textOffset, lineStart, text.length);
            const inlineLeading = lineStyle.paragraph.headIndent + (textOffset + lineStart === lineStyle.paragraphStart
              ? lineStyle.paragraph.firstLineHeadIndent
              : 0);
            const inlineTrailing = lineStyle.paragraph.tailIndent;
            const lineInlineExtent = inlineExtent - inlineLeading - inlineTrailing;
            if (lineInlineExtent <= 0) break;
            let lineText = "";
            let lineAdvance = 0;
            let ascent = 0;
            let descent = 0;
            if (pendingTrailingLine) pendingTrailingLine = false;
            while (itemIndex < items.length) {
              const item = items[itemIndex]!;
              if (item.kind === "break") {
                itemIndex += 1;
                laidOutEnd = item.end;
                pendingTrailingLine = item.end === text.length;
                break;
              }
              if (item.kind === "tab") {
                const metrics = await measured("", container.writingMode, item.style.font);
                const customStop = item.style.paragraph.tabStops.find((stop) => stop > lineAdvance);
                const defaultTab = Math.max(1, item.style.font.size * 4);
                const target = customStop ?? Math.ceil((lineAdvance + Number.EPSILON) / defaultTab) * defaultTab;
                const advance = Math.max(0, target - lineAdvance);
                if (lineText && lineAdvance + advance > lineInlineExtent) break;
                lineText += "\t";
                lineAdvance = Math.min(lineInlineExtent, lineAdvance + advance);
                ascent = Math.max(ascent, metrics.ascent);
                descent = Math.max(descent, metrics.descent);
                lineEnd = item.end;
                itemIndex += 1;
                continue;
              }
              if (item.kind === "attachment") {
                const attachment = item.style.attachment!;
                const advance = attachment.inline;
                if (lineText && lineAdvance + advance > lineInlineExtent) break;
                if (!lineText && advance > lineInlineExtent) break;
                lineText += "\uFFFC";
                lineAdvance += advance;
                ascent = Math.max(ascent, attachment.block);
                lineEnd = item.end;
                itemIndex += 1;
                continue;
              }
              const tokenText = text.slice(item.start, item.end);
              const metrics = item.split ? null : await measured(tokenText, container.writingMode, item.style.font);
              if (metrics && lineText && lineAdvance + metrics.advance > lineInlineExtent) break;
              if (item.split || (!lineText && metrics!.advance > lineInlineExtent)) {
                item.split = true;
                const startOrdinal = graphemeLocation(item.start);
                let ordinal = startOrdinal;
                let pieceEnd = item.start;
                while (ordinal < graphemes.length && graphemes[ordinal]!.index < item.end) {
                  const piece = graphemes[ordinal]!;
                  const pieceMetrics: TFXTextMeasurement = carriedGrapheme?.ordinal === ordinal ? carriedGrapheme.metrics : await measured(piece.segment, container.writingMode, item.style.font);
                  carriedGrapheme = null;
                  if (lineText && lineAdvance + pieceMetrics.advance > lineInlineExtent) {
                    carriedGrapheme = { ordinal, metrics: pieceMetrics };
                    break;
                  }
                  lineText += piece.segment;
                  lineAdvance += pieceMetrics.advance;
                  ascent = Math.max(ascent, pieceMetrics.ascent);
                  descent = Math.max(descent, pieceMetrics.descent);
                  pieceEnd = piece.end;
                  ordinal += 1;
                  work.graphemeAdvanceCount += 1;
                }
                if (!lineText) break;
                lineEnd = pieceEnd;
                if (pieceEnd === item.end) itemIndex += 1;
                else {
                  mutatedToken = item;
                  mutatedTokenStart = item.start;
                  item.start = pieceEnd;
                }
                break;
              }
              lineText += tokenText;
              lineAdvance += metrics!.advance;
              ascent = Math.max(ascent, metrics!.ascent);
              descent = Math.max(descent, metrics!.descent);
              lineEnd = item.end;
              itemIndex += 1;
            }
            if (!lineText) {
              const emptyMetrics = await measured("", container.writingMode, lineStyle.font);
              ascent = emptyMetrics.ascent;
              descent = emptyMetrics.descent;
            }
            const truncatesHere = container.truncation !== "none"
              && line + 1 >= container.maximumLines
              && (itemIndex < items.length || pendingTrailingLine);
            if (truncatesHere) {
              const truncated = await truncateLine(lineStart, lineEnd, container.truncation, lineInlineExtent, container.writingMode, lineStyle);
              lineText = truncated.text;
              lineAdvance = truncated.metrics.advance;
              ascent = truncated.metrics.ascent;
              descent = truncated.metrics.descent;
            }
            const naturalLineHeight = ascent + descent;
            const lineHeight = naturalLineHeight * lineStyle.paragraph.lineHeightMultiple;
            const blockLeading = (lineHeight - naturalLineHeight) / 2;
            if (lineHeight <= 0 || blockOffset + lineHeight > blockExtent) {
              itemIndex = lineItemIndex;
              pendingTrailingLine = linePendingTrailing;
              laidOutEnd = lineLaidOutEnd;
              if (mutatedToken) mutatedToken.start = mutatedTokenStart;
              carriedGrapheme = lineCarriedGrapheme;
              break;
            }
            const graphemeStart = graphemeLocation(lineStart);
            const graphemeEnd = graphemeLocation(lineEnd);
            const rect = placeLine(container, lineAdvance, lineHeight, blockOffset, inlineLeading, inlineTrailing, lineStyle.paragraph.alignment);
            fragments.push(Object.freeze({
              text: lineText,
              range: Object.freeze({ location: lineStart, length: lineEnd - lineStart }),
              graphemeRange: Object.freeze({ location: graphemeStart, length: graphemeEnd - graphemeStart }),
              rect,
              baseline: container.writingMode === "horizontal-tb"
                ? container.insets.blockStart + blockOffset + blockLeading + ascent
                : rect.x + blockLeading + ascent,
              containerIndex,
            }));
            laidOutEnd = Math.max(laidOutEnd, lineEnd);
            blockOffset += lineHeight;
            line += 1;
            work.lineCount += 1;
            if (truncatesHere) {
              terminatedByTruncation = true;
              break flow;
            }
          }
        }
        return Object.freeze({
          fragments: Object.freeze(fragments),
          laidOutRange: Object.freeze({ location: 0, length: laidOutEnd }),
          truncated: terminatedByTruncation || laidOutEnd < text.length || itemIndex < items.length || pendingTrailingLine,
          geometry: Object.freeze({ kind: "logical-dom", units: "css-pixels", fontGeneration: runtimeFontScope.fontReadinessGeneration, complete: !(terminatedByTruncation || laidOutEnd < text.length || itemIndex < items.length || pendingTrailingLine) }),
        });
      }));
    },
    measure,
    rangeRects(input) {
      const record = dataRecord(input, "Text-range request", ["text", "range", "font", "locale", "direction", "writingMode", "signal"]);
      return run(record.signal as AbortSignal | undefined, async (signal) => {
        const text = boundedText(record.text);
        const range = normaliseSafeRange(record.range, text.length);
        const writingMode = normaliseWritingMode(record.writingMode ?? "horizontal-tb");
        const rects = await adapter!.rangeRects(Object.freeze({ text, range, font: normaliseFont(record.font as TFXTextFontDescriptor), locale: normaliseLocale(record.locale), direction: normaliseDirection(record.direction), writingMode, signal }) as TFXTextRangeRectsRequest);
        signal.throwIfAborted();
        return Object.freeze(denseDataArray(rects, "Text range rectangles", maximumSegments).map(normaliseSafeRect));
      });
    },
    hitTest(input) {
      const record = dataRecord(input, "Text-hit request", ["text", "point", "font", "locale", "direction", "writingMode", "signal"]);
      return run(record.signal as AbortSignal | undefined, async (signal) => {
        const text = boundedText(record.text);
        const writingMode = normaliseWritingMode(record.writingMode ?? "horizontal-tb");
        const hit = await adapter!.hitTest(Object.freeze({ text, point: normaliseSafePoint(record.point), font: normaliseFont(record.font as TFXTextFontDescriptor), locale: normaliseLocale(record.locale), direction: normaliseDirection(record.direction), writingMode, signal }) as TFXTextHitTestRequest);
        signal.throwIfAborted();
        const hitRecord = dataRecord(hit, "Text hit-test result", ["offset", "affinity"]);
        if (!Number.isSafeInteger(hitRecord.offset) || (hitRecord.offset as number) < 0 || (hitRecord.offset as number) > text.length || (hitRecord.affinity !== "upstream" && hitRecord.affinity !== "downstream")) throw new TypeError("Text hit-test result is invalid.");
        return Object.freeze({ offset: hitRecord.offset as number, affinity: hitRecord.affinity });
      });
    },
    diagnostics: () => Object.freeze({
      activeOperationCount: active.size,
      activeMeasurementNodeCount: adapter?.diagnostics().activeMeasurementNodeCount ?? 0,
      lastLayoutWork: Object.freeze({ ...lastLayoutWork }),
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      const reason = abortError("Text-layout service disposed.");
      for (const operation of active) operation.abort(reason);
      active.clear();
      fontHost.dispose();
      adapterLease?.release();
    },
  };
  return Object.freeze(service);
}
