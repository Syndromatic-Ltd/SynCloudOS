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

import { attachmentRun, attributedContent, paragraph, validateNSETextRange, type NSEAttributedAttachmentRun, type NSEParagraphAttributes, type NSETextEditOperation, type NSETextList, type NSETextListMarker, type NSETextParagraphSpan, type NSETextRange, type NSETextSnapshot } from "../Text";

const maxListDepth = 8;
const bulletMarkers: readonly NSETextListMarker[] = ["disc", "circle", "square"];
/** The marker a list nested one level deeper takes, as TextEdit steps bullets and numbering. */
const nestedMarker: Readonly<Record<NSETextListMarker, NSETextListMarker>> = {
  disc: "circle", circle: "square", square: "disc",
  decimal: "lower-alpha", "lower-alpha": "lower-roman", "lower-roman": "decimal",
  "upper-alpha": "upper-roman", "upper-roman": "decimal",
};
let listSequence = 0;
/** A fresh NSTextList identity. */
export function nseNewListId(): string {
  const random = globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10);
  return `list.${random}.${(listSequence++).toString(36)}`;
}
export const isNSEBulletMarker = (marker: NSETextListMarker): boolean => bulletMarkers.includes(marker);

/** Paragraphs a range touches; an exclusive end at a paragraph start does not count it. */
export function nseParagraphSpansInRange(snapshot: NSETextSnapshot, range: NSETextRange): readonly NSETextParagraphSpan[] {
  validateNSETextRange(snapshot.text, range);
  const end = range.location + range.length;
  return snapshot.paragraphSpans.filter((span) => {
    const spanEnd = span.range.location + span.range.length;
    return range.length
      ? span.range.location < end && spanEnd >= range.location
      : range.location >= span.range.location && range.location <= spanEnd;
  });
}

function paragraphListsOperation(span: NSETextParagraphSpan, lists: readonly NSETextList[]): NSETextEditOperation {
  return lists.length
    ? { kind: "paragraph-attributes", range: span.range, attributes: { textLists: lists } }
    : { kind: "paragraph-attributes", range: span.range, attributes: {}, remove: ["textLists"] };
}
const sameIds = (a: readonly NSETextList[], b: readonly NSETextList[], depth: number) => a.length >= depth && b.length >= depth && a.slice(0, depth).every((list, index) => list.id === b[index]!.id);

/** Indent (+1) or outdent (−1) the list items in a range. Paragraphs outside lists are unchanged. */
export function nseListLevelOperations(snapshot: NSETextSnapshot, range: NSETextRange, delta: 1 | -1): NSETextEditOperation[] {
  const spans = nseParagraphSpansInRange(snapshot, range);
  const operations: NSETextEditOperation[] = [];
  let previous: readonly NSETextList[] = spans[0] && spans[0].paragraphIndex > 0 ? snapshot.paragraphSpans[spans[0].paragraphIndex - 1]!.attributes.textLists ?? [] : [];
  for (const span of spans) {
    const lists = span.attributes.textLists ?? [];
    if (!lists.length) { previous = lists; continue; }
    let next: readonly NSETextList[];
    if (delta < 0) next = lists.slice(0, -1);
    else if (lists.length >= maxListDepth) next = lists;
    else {
      const depth = lists.length;
      // Join the deeper list the preceding item already started, so indented siblings number together.
      const joined = sameIds(previous, lists, depth) && previous.length > depth ? previous[depth]! : null;
      next = [...lists, joined ?? { id: nseNewListId(), marker: nestedMarker[lists[depth - 1]!.marker] }];
    }
    if (JSON.stringify(next) !== JSON.stringify(lists)) operations.push(paragraphListsOperation(span, next));
    previous = next;
  }
  return operations;
}

/** Toggle a list kind on a range, as TextEdit's list popup does. */
export function nseToggleListOperations(snapshot: NSETextSnapshot, range: NSETextRange, marker: NSETextListMarker): NSETextEditOperation[] {
  const spans = nseParagraphSpansInRange(snapshot, range);
  if (!spans.length) return [];
  const allOn = spans.every((span) => span.attributes.textLists?.at(-1)?.marker === marker);
  if (allOn) return spans.map((span) => paragraphListsOperation(span, span.attributes.textLists!.slice(0, -1)));
  const before = spans[0]!.paragraphIndex > 0 ? snapshot.paragraphSpans[spans[0]!.paragraphIndex - 1]!.attributes.textLists ?? [] : [];
  const continued = before.at(-1)?.marker === marker ? before : null;
  const fresh: NSETextList = { id: nseNewListId(), marker };
  return spans.map((span) => {
    const lists = span.attributes.textLists ?? [];
    if (!lists.length) return paragraphListsOperation(span, continued ?? [fresh]);
    const outer = lists.slice(0, -1);
    const joined = continued && continued.length === lists.length && sameIds(continued, lists, lists.length - 1) ? continued.at(-1)! : null;
    return paragraphListsOperation(span, [...outer, joined ?? fresh]);
  });
}

/** Restart numbering at the range's first item: it and the rest of its contiguous list take a new identity. */
export function nseRestartNumberingOperations(snapshot: NSETextSnapshot, range: NSETextRange): NSETextEditOperation[] {
  const first = nseParagraphSpansInRange(snapshot, range)[0];
  const lists = first?.attributes.textLists;
  if (!first || !lists?.length) return [];
  const depth = lists.length - 1, old = lists[depth]!;
  const renamed: NSETextList = { id: nseNewListId(), marker: old.marker };
  const operations: NSETextEditOperation[] = [];
  for (let index = first.paragraphIndex; index < snapshot.paragraphSpans.length; index++) {
    const span = snapshot.paragraphSpans[index]!;
    const current = span.attributes.textLists ?? [];
    if (current[depth]?.id !== old.id) break;
    operations.push(paragraphListsOperation(span, current.map((list, level) => level === depth ? renamed : list)));
  }
  return operations;
}

/** NSParagraphStyle.headerLevel for every paragraph in the range; 0 returns them to body text. */
export function nseHeaderLevelOperations(snapshot: NSETextSnapshot, range: NSETextRange, level: number): NSETextEditOperation[] {
  if (!Number.isInteger(level) || level < 0 || level > 6) throw new RangeError("Heading levels run from 0 to 6.");
  return nseParagraphSpansInRange(snapshot, range).map((span) => level
    ? { kind: "paragraph-attributes", range: span.range, attributes: { headerLevel: level as NonNullable<NSEParagraphAttributes["headerLevel"]> } }
    : { kind: "paragraph-attributes", range: span.range, attributes: {}, remove: ["headerLevel"] });
}

/** The attachment a selection covers exactly, if any. */
export function selectedNSETextAttachment(snapshot: NSETextSnapshot, range: NSETextRange): { readonly range: NSETextRange; readonly run: NSEAttributedAttachmentRun } | null {
  if (range.length !== 1) return null;
  const span = snapshot.characterSpans.find((candidate) => candidate.attachment && candidate.range.location === range.location);
  return span?.attachment ? Object.freeze({ range: span.range, run: span.attachment }) : null;
}

/** What may change on an attachment in place; its identity never does. Null removes a property. */
export interface NSEAttachmentChanges {
  readonly bounds?: NSEAttributedAttachmentRun["bounds"] | null;
  readonly placement?: NSEAttributedAttachmentRun["placement"] | null;
  readonly appearance?: NSEAttributedAttachmentRun["appearance"] | null;
  readonly alt?: string;
  readonly caption?: string | null;
  /** Replace…: a new image in the same place, keeping its size, wrap and style. */
  readonly source?: NSEAttributedAttachmentRun["source"];
  readonly intrinsicSize?: NSEAttributedAttachmentRun["intrinsicSize"];
}

/**
 * Changes how one attachment is shown (size, text wrap, description, caption):
 * the attachment character is replaced with the same run, edited. The
 * replacement paragraph has no attributes, so the one it sits in keeps its own.
 */
export function nseAttachmentUpdateOperations(snapshot: NSETextSnapshot, range: NSETextRange, changes: NSEAttachmentChanges): NSETextEditOperation[] {
  const selected = selectedNSETextAttachment(snapshot, range);
  if (!selected) throw new Error("Select one attachment to change it.");
  const { kind: _kind, attachmentKind, bounds, placement, appearance, caption, ...rest } = selected.run;
  const pick = <T,>(key: keyof NSEAttachmentChanges, current: T): T | undefined => key in changes ? (changes[key] as T | null) ?? undefined : current;
  const nextBounds = pick("bounds", bounds), nextPlacement = pick("placement", placement), nextAppearance = pick("appearance", appearance), nextCaption = pick("caption", caption);
  const intrinsicSize = changes.intrinsicSize ?? rest.intrinsicSize;
  const updated = attachmentRun({ ...rest, kind: attachmentKind, alt: changes.alt ?? rest.alt, source: changes.source ?? rest.source, ...(intrinsicSize ? { intrinsicSize } : {}),
    ...(nextBounds ? { bounds: nextBounds } : {}), ...(nextPlacement ? { placement: nextPlacement } : {}), ...(nextAppearance ? { appearance: nextAppearance } : {}), ...(nextCaption ? { caption: nextCaption } : {}) });
  return [{ kind: "replace", range: selected.range, content: attributedContent([paragraph([updated])]) }];
}

/** NSTextAttachment bounds: replace the attachment character with the same run at a new display size. */
export function nseAttachmentBoundsOperations(snapshot: NSETextSnapshot, range: NSETextRange, bounds: { readonly width: number; readonly height: number }): NSETextEditOperation[] {
  return nseAttachmentUpdateOperations(snapshot, range, { bounds });
}
