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

import type { NSEAttributedContent, NSEAttributedParagraph, NSEAttributedRun, NSEAttributedTextRun, NSEAttributedAttachmentRun, NSEAttributedTextAttributes, NSEAttributedAttachmentSource, NSEAttachmentAppearance, NSEAttachmentPlacement, NSETextCustomAttributes, NSETextListMarker } from "./textTypes";
export type * from "./textTypes";
import { normaliseTextShadow } from "./textAttributes";
import { canonicalNSETextData } from "./textValidation";

export const nseAttributedContentType = "application/x-syncloudos-attributed-content+json" as const;

const limits = Object.freeze({ maxDepth: 24, maxNodes: 20_000, maxBytes: 1024 * 1024 });
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const colourPattern = /^(?:#[0-9a-f]{6}|#[0-9a-f]{8})$/i;

function canonical<T>(value: T, typeId = "nse.attributed-content"): T {
  try {
    return canonicalNSETextData(value, typeId, limits);
  } catch (error) {
    throw new TypeError(`Canonical attributed content rejected: ${error instanceof Error ? error.message : "invalid value"}.`, { cause: error });
  }
}

function assertKeys(record: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unknown = Object.keys(record).find((key) => !allowed.includes(key));
  if (unknown) throw new TypeError(`${label} contains unsupported property ${unknown}.`);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be a plain object.`);
  return value as Record<string, unknown>;
}

export const nseTextCustomKeyPattern = /^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+$/;
export const nseTextListMarkerStyles: readonly NSETextListMarker[] = Object.freeze(["disc", "circle", "square", "decimal", "lower-alpha", "upper-alpha", "lower-roman", "upper-roman"]);
const maxListDepth = 8;

/** NSAttributedString custom keys: namespaced, scalar, bounded. */
export function validateNSETextCustomAttributes(value: unknown, label = "Custom attributes"): NSETextCustomAttributes {
  const custom = asRecord(value, label);
  const keys = Object.keys(custom);
  if (keys.length > 16) throw new TypeError(`${label} may hold at most 16 keys.`);
  for (const key of keys) {
    if (!nseTextCustomKeyPattern.test(key) || key.length > 128) throw new TypeError(`Invalid custom attribute key ${key}; keys are namespaced, such as app.key.`);
    const entry = custom[key];
    const valid = entry === null || typeof entry === "boolean" || (typeof entry === "number" && Number.isFinite(entry)) || (typeof entry === "string" && entry.length <= 256);
    if (!valid) throw new TypeError(`Invalid custom attribute value for ${key}.`);
  }
  return custom as NSETextCustomAttributes;
}

function validateTextLists(value: unknown): void {
  if (!Array.isArray(value) || value.length > maxListDepth) throw new TypeError(`Invalid textLists: at most ${maxListDepth} nested lists.`);
  for (const entry of value) {
    const list = asRecord(entry, "Text list");
    assertKeys(list, ["id", "marker", "start"], "Text list");
    if (typeof list.id !== "string" || !idPattern.test(list.id)) throw new TypeError("Invalid text list id.");
    if (!nseTextListMarkerStyles.includes(list.marker as NSETextListMarker)) throw new TypeError("Invalid text list marker.");
    if (list.start !== undefined && (!Number.isSafeInteger(list.start) || (list.start as number) < 1)) throw new TypeError("Invalid text list start.");
  }
}

const numberIn = (value: unknown, minimum: number, maximum: number) => typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;

function validateAttachmentPlacement(value: unknown): void {
  const placement = asRecord(value, "Attachment placement");
  assertKeys(placement, ["wrap", "alignment", "textFit", "spacing", "alphaThreshold"], "Attachment placement");
  if (!["inline", "above-and-below", "around"].includes(placement.wrap as string)) throw new TypeError("Invalid attachment wrap.");
  if (placement.alignment !== undefined && !["start", "centre", "end"].includes(placement.alignment as string)) throw new TypeError("Invalid attachment alignment.");
  if (placement.wrap === "around" && placement.alignment === "centre") throw new TypeError("Text cannot wrap around a centred attachment; align it to the start or end.");
  if (placement.textFit !== undefined && placement.textFit !== "rectangle" && placement.textFit !== "shape") throw new TypeError("Invalid attachment text fit.");
  if (placement.spacing !== undefined && !numberIn(placement.spacing, 0, 200)) throw new TypeError("Invalid attachment text spacing.");
  if (placement.alphaThreshold !== undefined && !numberIn(placement.alphaThreshold, 0, 1)) throw new TypeError("Invalid attachment alpha threshold.");
}

function validateAttachmentAppearance(value: unknown): void {
  const appearance = asRecord(value, "Attachment appearance");
  assertKeys(appearance, ["border", "shadow", "reflection", "opacity", "rotation", "flipHorizontal", "flipVertical", "exposure", "saturation"], "Attachment appearance");
  if (appearance.border !== undefined) {
    const border = asRecord(appearance.border, "Attachment border");
    if (border.kind === "line") {
      assertKeys(border, ["kind", "pattern", "width", "colour"], "Attachment border");
      if (!["solid", "dashed", "dotted"].includes(border.pattern as string)) throw new TypeError("Invalid attachment border pattern.");
      if (!numberIn(border.width, 0.25, 100)) throw new TypeError("Invalid attachment border width.");
      if (typeof border.colour !== "string" || !colourPattern.test(border.colour)) throw new TypeError("Invalid attachment border colour.");
    } else if (border.kind === "picture-frame") {
      assertKeys(border, ["kind", "scale"], "Attachment border");
      if (!numberIn(border.scale, 0.1, 4)) throw new TypeError("Invalid picture frame scale.");
    } else throw new TypeError("Invalid attachment border.");
  }
  if (appearance.shadow !== undefined) {
    const shadow = asRecord(appearance.shadow, "Attachment shadow");
    assertKeys(shadow, ["kind", "blur", "offset", "opacity", "angle", "colour", "curvature"], "Attachment shadow");
    if (!["drop", "contact", "curved"].includes(shadow.kind as string)) throw new TypeError("Invalid attachment shadow kind.");
    if (!numberIn(shadow.blur, 0, 200) || !numberIn(shadow.offset, 0, 200) || !numberIn(shadow.opacity, 0, 1) || !numberIn(shadow.angle, 0, 360)) throw new TypeError("Invalid attachment shadow geometry.");
    if (typeof shadow.colour !== "string" || !colourPattern.test(shadow.colour)) throw new TypeError("Invalid attachment shadow colour.");
    if (shadow.curvature !== undefined && !numberIn(shadow.curvature, -1, 1)) throw new TypeError("Invalid attachment shadow curvature.");
  }
  for (const key of ["reflection", "opacity"] as const) if (appearance[key] !== undefined && !numberIn(appearance[key], 0, 1)) throw new TypeError(`Invalid attachment ${key}.`);
  for (const key of ["exposure", "saturation"] as const) if (appearance[key] !== undefined && !numberIn(appearance[key], -1, 1)) throw new TypeError(`Invalid attachment ${key}.`);
  if (appearance.rotation !== undefined && !numberIn(appearance.rotation, -360, 360)) throw new TypeError("Invalid attachment rotation.");
  for (const key of ["flipHorizontal", "flipVertical"] as const) if (appearance[key] !== undefined && typeof appearance[key] !== "boolean") throw new TypeError(`Invalid attachment ${key}.`);
}

function validateRun(value: unknown): NSEAttributedRun {
  const run = asRecord(value, "Attributed run");
  if (run.kind === "text") {
    assertKeys(run, ["kind", "text", "attributes"], "Text run");
    if (typeof run.text !== "string") throw new TypeError("Text run text must be a string.");
    if (run.attributes !== undefined) {
      const attrs = asRecord(run.attributes, "Text attributes");
      assertKeys(attrs, ["bold", "italic", "underline", "strike", "outline", "language", "foregroundColour", "backgroundColour", "link", "baseline", "baselineOffset", "kern", "capitalisation", "ligatures", "font", "shadow", "custom"], "Text attributes");
      if (attrs.shadow !== undefined) normaliseTextShadow(attrs.shadow);
      if (attrs.custom !== undefined) validateNSETextCustomAttributes(attrs.custom, "Text custom attributes");
      for (const key of ["bold", "italic", "underline", "strike", "outline"] as const) {
        if (attrs[key] !== undefined && typeof attrs[key] !== "boolean") throw new TypeError(`${key} must be boolean.`);
      }
      if (attrs.language !== undefined && (typeof attrs.language !== "string" || attrs.language.length > 64)) throw new TypeError("Invalid language.");
      if (attrs.foregroundColour !== undefined && (typeof attrs.foregroundColour !== "string" || !colourPattern.test(attrs.foregroundColour))) throw new TypeError("Invalid foreground colour.");
      if (attrs.backgroundColour !== undefined && (typeof attrs.backgroundColour !== "string" || !colourPattern.test(attrs.backgroundColour))) throw new TypeError("Invalid background colour.");
      if (attrs.link !== undefined && (typeof attrs.link !== "string" || attrs.link.length > 4096 || !/^(?:https?:|mailto:|\/|#)/i.test(attrs.link))) throw new TypeError("Invalid attributed link URL.");
      if (attrs.baseline !== undefined && !["normal", "superscript", "subscript"].includes(attrs.baseline as string)) throw new TypeError("Invalid baseline.");
      if (attrs.baselineOffset !== undefined && (typeof attrs.baselineOffset !== "number" || !Number.isFinite(attrs.baselineOffset) || attrs.baselineOffset < -200 || attrs.baselineOffset > 200)) throw new TypeError("Invalid baseline offset.");
      if (attrs.kern !== undefined && (typeof attrs.kern !== "number" || !Number.isFinite(attrs.kern) || attrs.kern < -50 || attrs.kern > 200)) throw new TypeError("Invalid character spacing.");
      if (attrs.capitalisation !== undefined && !["none", "all-caps", "small-caps", "title"].includes(attrs.capitalisation as string)) throw new TypeError("Invalid capitalisation.");
      if (attrs.ligatures !== undefined && !["default", "none", "all"].includes(attrs.ligatures as string)) throw new TypeError("Invalid ligatures.");
      if (attrs.font !== undefined) {
        const font = asRecord(attrs.font, "Font descriptor");
        assertKeys(font, ["familyId", "face", "size"], "Font descriptor");
        if (typeof font.familyId !== "string" || !idPattern.test(font.familyId)) throw new TypeError("Invalid font family.");
        if (font.face !== undefined && (typeof font.face !== "string" || font.face.length > 128)) throw new TypeError("Invalid font face.");
        if (font.size !== undefined && (typeof font.size !== "number" || !Number.isFinite(font.size) || font.size < 1 || font.size > 512)) throw new TypeError("Invalid font size.");
      }
    }
    return run as unknown as NSEAttributedTextRun;
  }
  if (run.kind === "attachment") {
    assertKeys(run, ["kind", "id", "attachmentKind", "source", "alt", "intrinsicSize", "bounds", "caption", "placement", "appearance"], "Attachment run");
    if (run.placement !== undefined) validateAttachmentPlacement(run.placement);
    if (run.appearance !== undefined) validateAttachmentAppearance(run.appearance);
    if (run.bounds !== undefined) {
      const bounds = asRecord(run.bounds, "Attachment bounds");
      assertKeys(bounds, ["width", "height"], "Attachment bounds");
      if (![bounds.width, bounds.height].every((entry) => typeof entry === "number" && Number.isFinite(entry) && entry > 0 && entry <= 32_768)) throw new TypeError("Invalid attachment bounds.");
    }
    if (typeof run.id !== "string" || !idPattern.test(run.id)) throw new TypeError("Invalid attachment id.");
    if (run.attachmentKind !== "image" && run.attachmentKind !== "file") throw new TypeError("Invalid attachment kind.");
    if (typeof run.alt !== "string" || run.alt.length > 4096) throw new TypeError("Invalid attachment alternative text.");
    if (run.caption !== undefined && (typeof run.caption !== "string" || run.caption.length > 4096)) throw new TypeError("Invalid attachment caption.");
    const source = asRecord(run.source, "Attachment source");
    const mimeType = source.mimeType;
    if (mimeType !== undefined && (typeof mimeType !== "string" || !/^(?:image|application)\/[a-z0-9.+-]+$/u.test(mimeType))) throw new TypeError("Invalid resource MIME type.");
    if (source.byteLength !== undefined && (!Number.isSafeInteger(source.byteLength) || (source.byteLength as number) < 0 || (source.byteLength as number) > 8 * 1024 * 1024)) throw new TypeError("Invalid resource byte length.");
    if (source.kind === "document-resource") {
      assertKeys(source, ["kind", "resourceId", "documentId", "leaseId", "generation", "mimeType", "byteLength"], "Attachment source");
      if (typeof source.resourceId !== "string" || !idPattern.test(source.resourceId)) throw new TypeError("Invalid resource identifier.");
      if (source.leaseId !== undefined && (typeof source.leaseId !== "string" || !idPattern.test(source.leaseId))) throw new TypeError("Invalid resource lease.");
      if (source.documentId !== undefined && (typeof source.documentId !== "string" || !idPattern.test(source.documentId))) throw new TypeError("Invalid resource document.");
      if (source.generation !== undefined && (!Number.isSafeInteger(source.generation) || (source.generation as number) < 0)) throw new TypeError("Invalid resource generation.");
    } else if (source.kind === "blob") {
      assertKeys(source, ["kind", "blobId", "mimeType", "byteLength"], "Attachment source");
      if (typeof source.blobId !== "string" || !idPattern.test(source.blobId)) throw new TypeError("Invalid blob identifier.");
    } else if (source.kind === "remote") {
      assertKeys(source, ["kind", "url", "mimeType", "byteLength"], "Attachment source");
      if (typeof source.url !== "string" || source.url.length > 4_096 || !/^https:\/\//i.test(source.url)) throw new TypeError("Remote attachment URLs require HTTPS.");
      try { if (new URL(source.url).protocol !== "https:") throw new TypeError("Remote attachment URLs require HTTPS."); } catch (error) { throw new TypeError("Remote attachment URL is invalid.", { cause: error }); }
    } else {
      throw new TypeError("Unsupported attachment source.");
    }
    if (run.intrinsicSize !== undefined) {
      const size = asRecord(run.intrinsicSize, "Attachment size");
      assertKeys(size, ["inline", "block"], "Attachment size");
      if (![size.inline, size.block].every((entry) => typeof entry === "number" && Number.isFinite(entry) && entry > 0 && entry <= 32_768)) throw new TypeError("Invalid attachment size.");
    }
    return run as unknown as NSEAttributedAttachmentRun;
  }
  throw new TypeError("Unsupported attributed run kind.");
}

export function textRun(text: string, attributes?: NSEAttributedTextAttributes): NSEAttributedTextRun {
  return validateRun(canonical({ kind: "text", text, ...(attributes && !(Object.getPrototypeOf(attributes) === Object.prototype && Reflect.ownKeys(attributes).length === 0) ? { attributes } : {}) }, "nse.attributed-text")) as NSEAttributedTextRun;
}

export function attachmentRun(value: { readonly id: string; readonly kind: "image" | "file"; readonly source: NSEAttributedAttachmentSource | unknown; readonly alt: string; readonly intrinsicSize?: { readonly inline: number; readonly block: number }; readonly bounds?: { readonly width: number; readonly height: number }; readonly caption?: string; readonly placement?: NSEAttachmentPlacement; readonly appearance?: NSEAttachmentAppearance }): NSEAttributedAttachmentRun {
  const input = canonical(value, "nse.attributed-attachment-input") as unknown as typeof value;
  return validateRun(canonical({ kind: "attachment", id: input.id, attachmentKind: input.kind, source: input.source, alt: input.alt, ...(input.intrinsicSize ? { intrinsicSize: input.intrinsicSize } : {}), ...(input.bounds ? { bounds: input.bounds } : {}), ...(input.caption ? { caption: input.caption } : {}), ...(input.placement && input.placement.wrap !== "inline" ? { placement: input.placement } : {}), ...(input.appearance && Object.keys(input.appearance).length ? { appearance: input.appearance } : {}) }, "nse.attributed-attachment")) as NSEAttributedAttachmentRun;
}

export function paragraph(runs: readonly NSEAttributedRun[], attributes?: NSEAttributedParagraph["attributes"]): NSEAttributedParagraph {
  const candidate = canonical({ kind: "paragraph", runs, ...(attributes ? { attributes } : {}) }, "nse.attributed-paragraph");
  const record = asRecord(candidate, "Paragraph");
  assertKeys(record, ["kind", "runs", "attributes"], "Paragraph");
  if (record.kind !== "paragraph" || !Array.isArray(record.runs)) throw new TypeError("Invalid paragraph.");
  record.runs.forEach(validateRun);
  if (record.attributes !== undefined) {
    const attrs = asRecord(record.attributes, "Paragraph attributes");
    assertKeys(attrs, ["alignment", "firstLineHeadIndent", "headIndent", "tailIndent", "lineHeightMultiple", "tabStops", "headerLevel", "textLists", "paragraphSpacing", "paragraphSpacingBefore", "custom"], "Paragraph attributes");
    if (attrs.headerLevel !== undefined && (!Number.isInteger(attrs.headerLevel) || (attrs.headerLevel as number) < 0 || (attrs.headerLevel as number) > 6)) throw new TypeError("Invalid headerLevel: an integer from 0 to 6.");
    if (attrs.textLists !== undefined) validateTextLists(attrs.textLists);
    for (const key of ["paragraphSpacing", "paragraphSpacingBefore"] as const) if (attrs[key] !== undefined && (typeof attrs[key] !== "number" || !Number.isFinite(attrs[key]) || (attrs[key] as number) < 0 || (attrs[key] as number) > 100_000)) throw new TypeError(`Invalid ${key}.`);
    if (attrs.custom !== undefined) validateNSETextCustomAttributes(attrs.custom, "Paragraph custom attributes");
    if (attrs.alignment !== undefined && !["start", "centre", "end", "justify"].includes(attrs.alignment as string)) throw new TypeError("Invalid paragraph alignment.");
    for (const key of ["firstLineHeadIndent", "headIndent", "tailIndent"] as const) if (attrs[key] !== undefined && (typeof attrs[key] !== "number" || !Number.isFinite(attrs[key]) || Math.abs(attrs[key] as number) > 100_000)) throw new TypeError(`Invalid ${key}.`);
    if (attrs.lineHeightMultiple !== undefined && (typeof attrs.lineHeightMultiple !== "number" || !Number.isFinite(attrs.lineHeightMultiple) || attrs.lineHeightMultiple <= 0 || attrs.lineHeightMultiple > 100)) throw new TypeError("Invalid line height multiple.");
    if (attrs.tabStops !== undefined && (!Array.isArray(attrs.tabStops) || !attrs.tabStops.every((entry) => typeof entry === "number" && Number.isFinite(entry) && entry >= 0 && entry <= 100_000))) throw new TypeError("Invalid tab stops.");
  }
  return canonicalNSETextData(candidate as unknown as NSEAttributedParagraph, "nse.attributed-paragraph");
}

export function attributedContent(blocks: readonly NSEAttributedParagraph[]): NSEAttributedContent {
  const candidate = canonical({ type: "nse-attributed-content", version: 1, blocks }, "nse.attributed-content");
  const record = asRecord(candidate, "Attributed content");
  assertKeys(record, ["type", "version", "blocks"], "Attributed content");
  if (record.type !== "nse-attributed-content" || record.version !== 1 || !Array.isArray(record.blocks)) throw new TypeError("Unsupported attributed content version.");
  const validated = record.blocks.map((block) => {
    const value = asRecord(block, "Paragraph");
    assertKeys(value, ["kind", "runs", "attributes"], "Paragraph");
    if (value.kind !== "paragraph" || !Array.isArray(value.runs)) throw new TypeError("Attributed blocks must be paragraphs.");
    return paragraph(value.runs as unknown as readonly NSEAttributedRun[], value.attributes as NSEAttributedParagraph["attributes"]);
  });
  return canonicalNSETextData({ type: "nse-attributed-content", version: 1, blocks: validated }, "nse.attributed-content");
}

export function parseAttributedContent(value: unknown): NSEAttributedContent {
  const record = asRecord(canonical(value, "nse.attributed-content"), "Attributed content");
  assertKeys(record, ["type", "version", "blocks"], "Attributed content");
  if (record.type !== "nse-attributed-content" || record.version !== 1 || !Array.isArray(record.blocks)) throw new TypeError("Unsupported attributed content version.");
  return attributedContent(record.blocks as readonly NSEAttributedParagraph[]);
}

export function attributedContentText(value: NSEAttributedContent): string {
  return value.blocks.map((block) => block.runs.map((run) => run.kind === "text" ? run.text : run.alt).join("")).join("\n");
}

/** Canonical editor/layout string. Inline attachments occupy one UTF-16 unit;
 * their alternative text remains available through attributedContentText for
 * accessibility and plain-text transfer. */
export function attributedContentLayoutText(value: NSEAttributedContent): string {
  const safe = parseAttributedContent(value);
  return safe.blocks.map((block) => block.runs.map((run) => run.kind === "text" ? run.text : "\uFFFC").join("")).join("\n");
}


export function serializeAttributedContent(value: NSEAttributedContent): string { return JSON.stringify(parseAttributedContent(value)); }

export interface NSENewlineNormalizationReceipt {
  readonly content: NSEAttributedContent;
  readonly original: NSEAttributedContent;
  readonly newlineKinds: readonly ("crlf" | "cr" | "lf")[];
  readonly changed: boolean;
}
/** v1 parsing preserves imported bytes. Storage uses this explicit LF projection. */
export function normalizeNSEAttributedContentNewlines(value:NSEAttributedContent):NSENewlineNormalizationReceipt {
  const original=parseAttributedContent(value);
  const kinds=new Set<"crlf"|"cr"|"lf">();
  let changed=false;
  const blocks=original.blocks.map((block,index)=>{
    if(index<original.blocks.length-1) kinds.add("lf");
    return paragraph(block.runs.map(run=>{
      if(run.kind!=="text") return run;
      for(const match of run.text.matchAll(/\r\n|\r|\n/g)) kinds.add(match[0]==="\r\n" ? "crlf" : match[0]==="\r" ? "cr" : "lf");
      const text=run.text.replace(/\r\n?/g,"\n");
      changed ||= text!==run.text;
      return text===run.text ? run : textRun(text,run.attributes);
    }),block.attributes);
  });
  return Object.freeze({original,content:changed ? attributedContent(blocks) : original,newlineKinds:Object.freeze([...kinds]),changed});
}
