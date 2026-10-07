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

import { TFXAttributedString, type TFXTextAttributes } from "../../FX/TextFX/TFXAttributedString";
import { TFXFont } from "../../FX/TextFX/TFXFont";
import { TFXParagraphStyle } from "../../FX/TextFX/TFXParagraphStyle";
import { TFXTextTab } from "../../FX/TextFX/TFXTextTab";
import { attributedContentLayoutText, parseAttributedContent, type NSEAttributedContent, type NSEAttributedTextAttributes } from "../Text/attributedContent";
import type { NSEAttachmentProjection } from "./attachmentProjection";
import { createNSEShapedTextWindows, NSEUnsupportedShapedTextError } from "./shapedTextWindows";
export interface NSEShapedTextProjectionOptions {
  readonly resolveFont: (attributes: NSEAttributedTextAttributes) => TFXFont | Omit<TFXTextAttributes, "start" | "end" | "paragraphStyle" | "runDelegate"> | Promise<TFXFont | Omit<TFXTextAttributes, "start" | "end" | "paragraphStyle" | "runDelegate">>;
  readonly attachments?: NSEAttachmentProjection;
  readonly direction?: "ltr" | "rtl";
  readonly units?: "points" | "css-pixels";
  readonly maximumWindowUnits?: number;
  readonly signal?: AbortSignal;
}
export interface NSEShapedTextProjectionWindow { readonly start: number; readonly end: number; readonly input: TFXAttributedString }
export interface NSEShapedTextProjection {
  readonly emptyParagraph?: Readonly<{ font: TFXFont; paragraphStyle: TFXParagraphStyle }>;
  readonly content: NSEAttributedContent; readonly text: string;
  readonly windows: readonly NSEShapedTextProjectionWindow[];
  readonly direction: "ltr" | "rtl"; readonly units: "points" | "css-pixels";
}
/** Fonts and attachment leases remain owned by the injected authority. The result retains semantic styles for drawing. */
export async function projectNSEAttributedContentToTFX(content: NSEAttributedContent, options: NSEShapedTextProjectionOptions): Promise<NSEShapedTextProjection> {
  options.signal?.throwIfAborted();
  const source = parseAttributedContent(content), text = attributedContentLayoutText(source), direction = options.direction ?? "ltr", units = options.units ?? "css-pixels";
  if (!["ltr", "rtl"].includes(direction) || !["points", "css-pixels"].includes(units) || typeof options.resolveFont !== "function") throw new TypeError("Invalid shaped projection options.");
  const windows = createNSEShapedTextWindows(text, options.maximumWindowUnits);
  const resolved: TFXTextAttributes[] = [];
  const fontFor = async (attributes: NSEAttributedTextAttributes = {}) => {
    if (attributes.baseline && attributes.baseline !== "normal") throw new NSEUnsupportedShapedTextError("baseline-shift");
    const value = await options.resolveFont(attributes);
    options.signal?.throwIfAborted();
    return value instanceof TFXFont ? { font: value } : value;
  };
  const scale = units === "points" ? 72 / 96 : 1;
  let cursor = 0;
  let emptyParagraph: NSEShapedTextProjection["emptyParagraph"];
  for (let blockIndex = 0; blockIndex < source.blocks.length; blockIndex++) {
    const block = source.blocks[blockIndex]!, attrs = block.attributes;
    if (attrs?.lineHeightMultiple !== undefined && attrs.lineHeightMultiple !== 1) throw new NSEUnsupportedShapedTextError("line-height-multiple");
    // Headings and lists carry structure the shaped path cannot draw; refuse rather than flatten.
    if (attrs?.textLists?.length) throw new NSEUnsupportedShapedTextError("text-lists");
    if (attrs?.headerLevel) throw new NSEUnsupportedShapedTextError("header-level");
    if (attrs?.paragraphSpacing || attrs?.paragraphSpacingBefore) throw new NSEUnsupportedShapedTextError("paragraph-spacing");
    if ([attrs?.headIndent, attrs?.firstLineHeadIndent, attrs?.tailIndent].some(value => value !== undefined && value < 0)) throw new NSEUnsupportedShapedTextError("negative-paragraph-indent");
    const alignment = attrs?.alignment;
    const paragraphStyle = new TFXParagraphStyle({
      alignment: alignment === "centre" ? "center" : alignment === "justify" ? "justified" : alignment === "start" ? (direction === "rtl" ? "right" : "left") : alignment === "end" ? (direction === "rtl" ? "left" : "right") : "natural",
      headIndent: (attrs?.headIndent ?? 0) * scale,
      firstLineHeadIndent: (attrs?.firstLineHeadIndent ?? attrs?.headIndent ?? 0) * scale,
      tailIndent: (attrs?.tailIndent ?? 0) * scale,
      ...(attrs?.tabStops ? { tabStops: attrs.tabStops.map(location => new TFXTextTab("left", location * scale)) } : {}),
    });
    let lastFont: Awaited<ReturnType<typeof fontFor>> | undefined;
    for (const run of block.runs) {
      options.signal?.throwIfAborted();
      if (run.kind === "text") {
        lastFont = await fontFor(run.attributes);
        if (run.text.length) resolved.push({ ...lastFont, ...(run.attributes?.language ? { language: run.attributes.language } : {}), start: cursor, end: cursor + run.text.length, paragraphStyle });
        cursor += run.text.length;
      } else {
        if (run.attachmentKind !== "image" || !options.attachments) throw new NSEUnsupportedShapedTextError("attachment-resolution");
        const projected = await options.attachments.project(run, options.signal);
        options.signal?.throwIfAborted();
        const attachmentFont = await fontFor();
        resolved.push({ font: attachmentFont.font, start: cursor, end: cursor + 1, paragraphStyle, runDelegate: projected.delegate });
        cursor++;
      }
    }
    if (blockIndex + 1 < source.blocks.length) {
      const font = lastFont ?? await fontFor();
      resolved.push({ ...font, start: cursor, end: cursor + 1, paragraphStyle }); cursor++;
    }
    if (blockIndex + 1 === source.blocks.length && (!text.length || /[\r\n\u2029]/u.test(text.at(-1)!))) emptyParagraph = Object.freeze({ font: (lastFont ?? await fontFor()).font, paragraphStyle });
  }
  if (!source.blocks.length) emptyParagraph = Object.freeze({ font: (await fontFor()).font, paragraphStyle: new TFXParagraphStyle() });
  return Object.freeze({ content: source, text, direction, units, ...(emptyParagraph ? { emptyParagraph } : {}), windows: Object.freeze(windows.map(window => {
    const runs = resolved.filter(run => run.end > window.start && run.start < window.end).map(run => ({ ...run, start: Math.max(run.start, window.start) - window.start, end: Math.min(run.end, window.end) - window.start }));
    return Object.freeze({ start: window.start, end: window.end, input: new TFXAttributedString(window.text, runs) });
  })) });
}
