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

import type { NSETextRange } from "../Text/textTypes";
import type { NSETextSessionSnapshot } from "./textSessionTypes";

export interface NSETextAccessibilityDescription {
  readonly kind: "link" | "attachment";
  readonly range: NSETextRange;
  readonly text: string;
  readonly description: string;
  readonly destination?: string;
}
export interface NSETextAccessibilityProjection {
  /** One logical UTF-16 reading/input source. Layout pages do not duplicate it. */
  readonly text: string;
  readonly paragraphs: readonly Readonly<{ range: NSETextRange; text: string }>[];
  readonly descriptions: readonly NSETextAccessibilityDescription[];
  readonly description: string;
  readonly selection: NSETextRange;
  readonly markedRange: NSETextRange | null;
}

export function createNSETextAccessibilityProjection(snapshot: NSETextSessionSnapshot, selectedInMarked?: NSETextRange): NSETextAccessibilityProjection {
  const marked = snapshot.marked;
  const text = marked ? snapshot.model.text.slice(0, marked.range.location) + marked.text + snapshot.model.text.slice(marked.range.location + marked.range.length) : snapshot.model.text;
  const markedRange = marked ? Object.freeze({ location: marked.range.location, length: marked.text.length }) : null;
  const local = selectedInMarked ?? { location: marked?.text.length ?? 0, length: 0 };
  const selection = marked ? Object.freeze({ location: marked.range.location + local.location, length: local.length }) : snapshot.selection.range;
  let location = 0;
  const paragraphs = text.split("\n").map(line => {
    const result = Object.freeze({ range: Object.freeze({ location, length: line.length }), text: line });
    location += line.length + 1;
    return result;
  });
  const descriptions: NSETextAccessibilityDescription[] = [];
  for (const span of snapshot.model.characterSpans) {
    const start = span.range.location, end = start + span.range.length;
    if (marked && start < marked.range.location + marked.range.length && end > marked.range.location) continue;
    const shift = marked && start >= marked.range.location + marked.range.length ? marked.text.length - marked.range.length : 0;
    const range = Object.freeze({ location: start + shift, length: span.range.length });
    if (span.attachment) descriptions.push(Object.freeze({ kind: "attachment", range, text: "\uFFFC", description: span.attachment.alt || span.attachment.caption || "Attachment" }));
    if (span.attributes.link) {
      const label = text.slice(range.location, range.location + range.length);
      descriptions.push(Object.freeze({ kind: "link", range, text: label, description: `${label}: ${span.attributes.link}`, destination: span.attributes.link }));
    }
  }
  return Object.freeze({ text, paragraphs: Object.freeze(paragraphs), descriptions: Object.freeze(descriptions), description: descriptions.map(item => item.description).join(". "), selection, markedRange });
}
