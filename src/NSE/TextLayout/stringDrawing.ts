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

import { normalisePoint, normaliseRect, normaliseSize, type GFXPoint, type GFXRect, type GFXSize } from "../../FX/GraphicsFX/GFXGeometry";
import type { GFXImage } from "../../FX/GraphicsFX/GFXImage";
import type { TFXRunDelegate } from "../../FX/TextFX/TFXRunDelegate";
import type { TFXRunDelegateRequest } from "../../FX/TextFX/textLayoutTypes";
import { type RangeValue, type TFXLogicalTextInput, type TFXTextFontDescriptor, type TFXTextLayoutService, type TFXTextTruncation, type TFXTextWritingMode } from "../../SynCloudOS/SynCloudOS";
import { TFXTextContainer, normaliseTFXTextLayoutRecord } from "../../FX/TextFX/TFXTextContainer";
import { normaliseFontDescriptor } from "../Typography/typographyTypes";
import { attributedContent, attributedContentLayoutText, paragraph, parseAttributedContent, textRun, type NSEAttributedAttachmentRun, type NSEAttributedParagraph, type NSEAttributedTextAttributes } from "../Text/attributedContent";
import { NSEAttachmentProjection, type NSEProjectedAttachmentSource } from "./attachmentProjection";

const maximumDisplayCommands = 10_000;

function throwIfAborted(signal: AbortSignal | undefined): void {
  signal?.throwIfAborted();
}

interface AttributedDisplaySpan {
  readonly start: number;
  readonly end: number;
  readonly font: TFXTextFontDescriptor;
  readonly attachment?: NSEAttributedAttachmentRun;
}

interface AttributedDisplayPiece {
  readonly text: string;
  readonly range: RangeValue;
  readonly font: TFXTextFontDescriptor;
  readonly attachment?: NSEAttributedAttachmentRun;
}

export interface NSETextDisplayTextCommand {
  readonly kind: "text";
  readonly text: string;
  readonly origin: GFXPoint;
  readonly range: RangeValue;
  readonly font: TFXTextFontDescriptor;
  readonly direction: TFXLogicalTextInput["direction"];
  /** Device-independent baseline after the caller-supplied baseline offset. */
  readonly baseline: number;
  /** The canonical scale used to snap display coordinates. */
  readonly deviceScale: number;
}

export interface NSETextDisplayAttachmentCommand {
  readonly kind: "attachment";
  readonly image: GFXImage;
  readonly rect: GFXRect;
  readonly range: RangeValue;
  readonly accessibilityLabel: string;
}

export type NSETextDisplayCommand = NSETextDisplayTextCommand | NSETextDisplayAttachmentCommand;

export interface NSETextDisplayList {
  readonly commands: readonly NSETextDisplayCommand[];
}

export interface NSEStringDrawingOptions extends Omit<TFXLogicalTextInput, "text"> {
  readonly origin: GFXPoint;
  readonly maximumSize: GFXSize;
  readonly paragraphAttributes?: NSEAttributedParagraph["attributes"];
  readonly truncation?: TFXTextTruncation;
  readonly maximumLines?: number;
  readonly writingMode?: TFXTextWritingMode;
  /** Offset from the text-layout baseline in logical display points. */
  readonly baseline?: number;
  /** Positive device scale used to deterministically snap display coordinates. */
  readonly deviceScale?: number;
}

function fontForAttributedText(
  attributes: NSEAttributedTextAttributes | undefined,
  base: TFXTextFontDescriptor,
): TFXTextFontDescriptor {
  const preferredFamily = attributes?.font?.face ?? attributes?.font?.familyId;
  return Object.freeze({
    families: Object.freeze(preferredFamily ? [preferredFamily, ...base.families.filter((family) => family !== preferredFamily)] : [...base.families]),
    size: attributes?.font?.size ?? base.size,
    weight: attributes?.bold ? Math.max(base.weight, 700) : base.weight,
    style: attributes?.italic ? "italic" : base.style,
    stretch: base.stretch,
  });
}

function attributedDisplaySpans(
  value: unknown | undefined,
  text: string,
  base: TFXTextFontDescriptor,
): readonly AttributedDisplaySpan[] {
  if (value === undefined) return Object.freeze([Object.freeze({ start: 0, end: text.length, font: base })]);
  const content = parseAttributedContent(value);
  if (attributedContentLayoutText(content) !== text) throw new TypeError("Attributed display content must use one U+FFFC character per attachment.");
  const spans: AttributedDisplaySpan[] = [];
  let offset = 0;
  content.blocks.forEach((block, blockIndex) => {
    block.runs.forEach((run) => {
      const rendered = run.kind === "text" ? run.text : "\uFFFC";
      if (rendered.length > 0) spans.push(Object.freeze({
        start: offset,
        end: offset + rendered.length,
        font: run.kind === "text" ? fontForAttributedText(run.attributes, base) : base,
        ...(run.kind === "attachment" ? { attachment: run } : {}),
      }));
      offset += rendered.length;
    });
    if (blockIndex + 1 < content.blocks.length) {
      spans.push(Object.freeze({ start: offset, end: offset + 1, font: base }));
      offset += 1;
    }
  });
  return Object.freeze(spans);
}

export async function measureNSEString(
  service: Pick<TFXTextLayoutService, "measure">,
  text: string,
  input: Omit<TFXLogicalTextInput, "text">,
): Promise<GFXSize> {
  const data = normaliseTFXTextLayoutRecord(input, "String-measurement input", ["font", "locale", "direction", "signal"]);
  const canonicalFont = normaliseFontDescriptor(data.font);
  const signal = data.signal as AbortSignal | undefined;
  throwIfAborted(signal);
  const measurement = await service.measure({
    text,
    font: canonicalFont,
    locale: data.locale as string,
    direction: data.direction as TFXLogicalTextInput["direction"],
    signal,
  });
  throwIfAborted(signal);
  return normaliseSize({ width: measurement.advance, height: measurement.ascent + measurement.descent });
}

export async function drawNSEString(
  service: Pick<TFXTextLayoutService, "layout" | "measure"> & {
    resolveRunDelegate?(request: TFXRunDelegateRequest, signal?: AbortSignal): Promise<TFXRunDelegate>;
    acquireAttachmentSource?(run: NSEAttributedAttachmentRun, signal?: AbortSignal): Promise<NSEProjectedAttachmentSource>;
  },
  text: string,
  input: NSEStringDrawingOptions,
): Promise<NSETextDisplayList> {
  const data = normaliseTFXTextLayoutRecord(input, "String-drawing input", ["attributedContent", "font", "locale", "direction", "signal", "origin", "maximumSize", "paragraphAttributes", "truncation", "maximumLines", "writingMode", "baseline", "deviceScale"]);
  const originData = normaliseTFXTextLayoutRecord(data.origin, "String-drawing origin", ["x", "y"]);
  const maximumSizeData = normaliseTFXTextLayoutRecord(data.maximumSize, "String-drawing maximum size", ["width", "height"]);
  const origin = normalisePoint({ x: originData.x as number, y: originData.y as number });
  const canonicalFont = normaliseFontDescriptor(data.font);
  const maximumLines = data.maximumLines ?? 10_000;
  if (!Number.isSafeInteger(maximumLines) || (maximumLines as number) < 1 || (maximumLines as number) > 10_000) throw new RangeError("String-drawing maximum lines must be a bounded positive integer.");
  const truncation = data.truncation ?? "none";
  if (truncation !== "none" && truncation !== "head" && truncation !== "middle" && truncation !== "tail") throw new TypeError("String-drawing truncation is invalid.");
  const writingMode = data.writingMode ?? "horizontal-tb";
  if (writingMode !== "horizontal-tb" && writingMode !== "vertical-rl" && writingMode !== "vertical-lr") throw new TypeError("String-drawing writing mode is invalid.");
  const baseline = data.baseline ?? 0;
  if (typeof baseline !== "number" || !Number.isFinite(baseline) || baseline < -1_000_000 || baseline > 1_000_000) throw new RangeError("String-drawing baseline must be finite and bounded.");
  const deviceScale = data.deviceScale ?? 1;
  if (typeof deviceScale !== "number" || !Number.isFinite(deviceScale) || deviceScale < 0.1 || deviceScale > 8) throw new RangeError("String-drawing device scale must be finite and bounded.");
  if (data.attributedContent !== undefined && data.paragraphAttributes !== undefined) throw new TypeError("String drawing accepts paragraph attributes or attributed content, not both.");
  const paragraphAttributes = data.paragraphAttributes === undefined
    ? undefined
    : normaliseTFXTextLayoutRecord(data.paragraphAttributes, "String-drawing paragraph attributes", ["alignment", "firstLineHeadIndent", "headIndent", "tailIndent", "lineHeightMultiple", "tabStops"]) as NSEAttributedParagraph["attributes"];
  const drawingAttributedContent = data.attributedContent ?? (paragraphAttributes === undefined
    ? undefined
    : attributedContent([paragraph([textRun(text)], paragraphAttributes)]));
  const container = new TFXTextContainer({
    size: normaliseSize({ width: maximumSizeData.width as number, height: maximumSizeData.height as number }),
    maximumLines: maximumLines as number,
    truncation,
    writingMode,
    flowOrder: 0,
  });
  const direction = data.direction as TFXLogicalTextInput["direction"];
  const spans = attributedDisplaySpans(drawingAttributedContent, text, canonicalFont);
  const signal = data.signal as AbortSignal | undefined;
  const snap = (value: number) => Math.round(value * deviceScale) / deviceScale;
  throwIfAborted(signal);
  const result = await service.layout({ text, attributedContent: drawingAttributedContent, font: canonicalFont, locale: data.locale as string, direction, signal: data.signal as AbortSignal | undefined }, [Object.freeze({
    size: container.size, insets: container.insets, maximumLines: container.maximumLines,
    truncation: container.truncation, writingMode: container.writingMode, flowOrder: container.flowOrder, exclusionRects: container.exclusionRects,
  })]);
  throwIfAborted(signal);
  const commands: NSETextDisplayCommand[] = [];
  for (const fragment of result.fragments) {
    throwIfAborted(signal);
    const fragmentStart = fragment.range.location;
    const fragmentEnd = fragmentStart + fragment.range.length;
    const overlapping = spans.filter((span) => span.end > fragmentStart && span.start < fragmentEnd);
    const sourceText = text.slice(fragmentStart, fragmentEnd);
    const pieces: readonly AttributedDisplayPiece[] = fragment.text !== sourceText || fragment.text.includes("\t") || overlapping.length === 0
      ? [Object.freeze({ text: fragment.text, range: fragment.range, font: overlapping[0]?.font ?? canonicalFont })]
      : overlapping.map((span) => {
        const start = Math.max(fragmentStart, span.start);
        const end = Math.min(fragmentEnd, span.end);
        return Object.freeze({ text: text.slice(start, end), range: Object.freeze({ location: start, length: end - start }), font: span.font, ...(span.attachment ? { attachment: span.attachment } : {}) });
      }).filter((piece) => piece.text.length > 0);
    let inline = direction === "rtl" ? fragment.rect.x + fragment.rect.width : fragment.rect.x;
    for (const piece of pieces) {
      throwIfAborted(signal);
      if (commands.length >= maximumDisplayCommands) throw new RangeError("Text display command limit exceeded.");
      if (piece.attachment) {
        if (!service.resolveRunDelegate) throw new TypeError("NSE attachment drawing requires scoped attachment projection authority.");
        const projection = new NSEAttachmentProjection({
          resolveRunDelegate: service.resolveRunDelegate,
          ...(service.acquireAttachmentSource ? { acquireSource: service.acquireAttachmentSource } : {}),
        });
        const { delegate } = await projection.project(piece.attachment, signal);
        throwIfAborted(signal);
        if (direction === "rtl") inline -= delegate.width;
        commands.push(Object.freeze({
          kind: "attachment" as const,
          image: delegate.attachment.image,
          rect: normaliseRect({
            x: snap(origin.x + inline),
            y: snap(origin.y + fragment.baseline - delegate.ascent),
            width: delegate.width,
            height: delegate.ascent + delegate.descent,
          }),
          range: piece.range,
          accessibilityLabel: delegate.attachment.accessibilityLabel,
        }));
        if (direction !== "rtl") inline += delegate.width;
        continue;
      }
      const measurement = await service.measure({ text: piece.text, font: piece.font, locale: data.locale as string, direction, signal });
      throwIfAborted(signal);
      if (direction === "rtl") inline -= measurement.advance;
      commands.push(Object.freeze({
        kind: "text" as const,
        text: piece.text,
        origin: normalisePoint({ x: snap(origin.x + inline), y: snap(origin.y + fragment.rect.y + baseline) }),
        range: piece.range,
        font: piece.font,
        direction,
        baseline: snap(origin.y + fragment.baseline + baseline),
        deviceScale,
      }));
      if (direction !== "rtl") inline += measurement.advance;
    }
  }
  throwIfAborted(signal);
  return Object.freeze({ commands: Object.freeze(commands) });
}
