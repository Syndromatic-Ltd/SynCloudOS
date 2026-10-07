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

import type { NSETextShadow } from "./textAttributes";
import type { NSEParagraphAttributes } from "./paragraphAttributes";

export interface NSETextRange { readonly location: number; readonly length: number }
export type NSETextAffinity = "upstream" | "downstream";
export type NSETextGravity = "before" | "after";
export interface NSETextPosition {
  readonly flowId: string;
  readonly revision: number;
  readonly ownerGeneration: number;
  readonly offset: number;
  readonly affinity: NSETextAffinity;
  readonly gravity: NSETextGravity;
}
export interface NSETextCharacterSpan {
  readonly range: NSETextRange;
  readonly attributes: NSEAttributedTextAttributes;
  readonly attachment?: NSEAttributedAttachmentRun;
}
export interface NSETextParagraphSpan {
  readonly range: NSETextRange;
  readonly paragraphIndex: number;
  readonly attributes: NSEParagraphAttributes;
}
export interface NSETextSnapshot {
  readonly flowId: string;
  readonly revision: number;
  readonly ownerGeneration: number;
  readonly text: string;
  readonly attributedContent: NSEAttributedContent;
  readonly characterSpans: readonly NSETextCharacterSpan[];
  readonly paragraphSpans: readonly NSETextParagraphSpan[];
}
export type NSETextEditOperation =
  | { readonly kind: "replace"; readonly range: NSETextRange; readonly content: NSEAttributedContent }
  | { readonly kind: "apply-attributes"; readonly range: NSETextRange; readonly attributes: NSEAttributedTextAttributes }
  | { readonly kind: "remove-attributes"; readonly range: NSETextRange; readonly keys: readonly (keyof NSEAttributedTextAttributes)[]; readonly customKeys?: readonly string[] }
  | { readonly kind: "paragraph-attributes"; readonly range: NSETextRange; readonly attributes: NSEParagraphAttributes; readonly remove?: readonly (keyof NSEParagraphAttributes)[]; readonly removeCustom?: readonly string[] };
// `custom` merges key by key; removals in the same operation apply before the merge.
export interface NSEAttributedTextAttributes {
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly strike?: boolean;
  /** Hollow letters, stroked in the text colour (NSStrokeWidthAttributeName > 0). */
  readonly outline?: boolean;
  readonly language?: string;
  readonly foregroundColour?: string;
  readonly backgroundColour?: string;
  readonly link?: string;
  readonly baseline?: "normal" | "superscript" | "subscript";
  /** NSBaselineOffsetAttributeName: px the text is raised (negative lowers it), −200 to 200. */
  readonly baselineOffset?: number;
  /** NSKernAttributeName: px added between characters (character spacing), −50 to 200. */
  readonly kern?: number;
  /** Pages' Capitalisation: how the letters are cased when shown; the text keeps its own case. */
  readonly capitalisation?: "none" | "all-caps" | "small-caps" | "title";
  /** NSLigatureAttributeName: the font's default ligatures, none, or all of them. */
  readonly ligatures?: "default" | "none" | "all";
  readonly font?: { readonly familyId: string; readonly face?: string; readonly size?: number };
  /** NSShadowAttributeName: colour (alpha is opacity), blur and offset in px. */
  readonly shadow?: NSETextShadow;
  /** Application attributes, as NSAttributedString custom keys: namespaced, scalar, never rendered. */
  readonly custom?: NSETextCustomAttributes;
}

export type NSETextCustomValue = string | number | boolean | null;
/** Keys are namespaced (`journal.style`); at most 16 per attribute set. */
export type NSETextCustomAttributes = Readonly<Record<string, NSETextCustomValue>>;
export type NSETextListMarker = "disc" | "circle" | "square" | "decimal" | "lower-alpha" | "upper-alpha" | "lower-roman" | "upper-roman";
/** NSTextList: paragraphs sharing an id at the same depth number continuously. */
export interface NSETextList { readonly id: string; readonly marker: NSETextListMarker; readonly start?: number }

export interface NSEDocumentResourceSource {
  readonly kind: "document-resource";
  readonly resourceId: string;
  readonly documentId?: string;
  readonly leaseId?: string;
  readonly generation?: number;
  readonly mimeType?: string;
  readonly byteLength?: number;
}

export interface NSEBlobAttachmentSource {
  readonly kind: "blob";
  readonly blobId: string;
  readonly mimeType?: string;
  readonly byteLength?: number;
}

export interface NSERemoteAttachmentSource {
  readonly kind: "remote";
  readonly url: string;
  readonly mimeType?: string;
  readonly byteLength?: number;
}

export type NSEAttributedAttachmentSource = NSEDocumentResourceSource | NSEBlobAttachmentSource | NSERemoteAttachmentSource;

export interface NSEAttributedTextRun {
  readonly kind: "text";
  readonly text: string;
  readonly attributes?: NSEAttributedTextAttributes;
}

export interface NSEAttributedAttachmentRun {
  readonly kind: "attachment";
  readonly id: string;
  readonly attachmentKind: "image" | "file";
  readonly source: NSEAttributedAttachmentSource;
  readonly alt: string;
  readonly intrinsicSize?: { readonly inline: number; readonly block: number };
  /** NSTextAttachment bounds: the displayed size in CSS px. */
  readonly bounds?: { readonly width: number; readonly height: number };
  readonly caption?: string;
  /** How text flows around the attachment. Absent means inline with text. */
  readonly placement?: NSEAttachmentPlacement;
  /** How the image itself is drawn: border, shadow, reflection and adjustments. */
  readonly appearance?: NSEAttachmentAppearance;
}

/**
 * Pages' Arrange ▸ Text Wrap. `inline` sits on the line like a character;
 * `above-and-below` takes the full line, aligned; `around` floats to the start
 * or end edge and text wraps beside it. `around` never centres.
 */
export interface NSEAttachmentPlacement {
  readonly wrap: "inline" | "above-and-below" | "around";
  readonly alignment?: "start" | "centre" | "end";
  /** Around only: wrap to the image's bounding box, or to the outline of its opaque pixels. */
  readonly textFit?: "rectangle" | "shape";
  /** Around only: the gap kept between the image and the text, in CSS px (0–200). */
  readonly spacing?: number;
  /** Shape fit only: the opacity (0–1) above which a pixel counts as part of the outline. */
  readonly alphaThreshold?: number;
}

export type NSEAttachmentLinePattern = "solid" | "dashed" | "dotted";
/** Pages' Border: a stroked line, or a picture frame (a matte with a soft edge). */
export type NSEAttachmentBorder =
  | { readonly kind: "line"; readonly pattern: NSEAttachmentLinePattern; readonly width: number; readonly colour: string }
  | { readonly kind: "picture-frame"; readonly scale: number };
/**
 * Pages' Shadow. A drop shadow follows the image's opaque pixels; a contact
 * shadow pools beneath it; a curved shadow lifts its lower corners. Angles are
 * degrees anticlockwise from the right, so 270 falls straight down.
 */
export interface NSEAttachmentShadow {
  readonly kind: "drop" | "contact" | "curved";
  readonly blur: number;
  readonly offset: number;
  readonly opacity: number;
  readonly angle: number;
  readonly colour: string;
  /** Curved only: −1 curls the corners inward, 1 outward. */
  readonly curvature?: number;
}
export interface NSEAttachmentAppearance {
  readonly border?: NSEAttachmentBorder;
  readonly shadow?: NSEAttachmentShadow;
  /** Strength of the reflection below the image, 0–1. */
  readonly reflection?: number;
  /** 0–1. */
  readonly opacity?: number;
  /** Degrees, clockwise. */
  readonly rotation?: number;
  readonly flipHorizontal?: boolean;
  readonly flipVertical?: boolean;
  /** −1 to 1; 0 leaves the image as it is. */
  readonly exposure?: number;
  readonly saturation?: number;
}

export type NSEAttributedRun = NSEAttributedTextRun | NSEAttributedAttachmentRun;
export interface NSEAttributedParagraph {
  readonly kind: "paragraph";
  readonly runs: readonly NSEAttributedRun[];
  readonly attributes?: {
    readonly alignment?: "start" | "centre" | "end" | "justify";
    readonly firstLineHeadIndent?: number;
    readonly headIndent?: number;
    readonly tailIndent?: number;
    readonly lineHeightMultiple?: number;
    readonly tabStops?: readonly number[];
    /** NSParagraphStyle.headerLevel: 0 is body text, 1–6 are headings. */
    readonly headerLevel?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
    /** NSParagraphStyle.textLists, outermost first; the length is the nesting depth. */
    readonly textLists?: readonly NSETextList[];
    /** NSParagraphStyle.paragraphSpacing (after) and paragraphSpacingBefore, in CSS px. */
    readonly paragraphSpacing?: number;
    readonly paragraphSpacingBefore?: number;
    readonly custom?: NSETextCustomAttributes;
  };
}
export interface NSEAttributedContent {
  readonly type: "nse-attributed-content";
  readonly version: 1;
  readonly blocks: readonly NSEAttributedParagraph[];
}
