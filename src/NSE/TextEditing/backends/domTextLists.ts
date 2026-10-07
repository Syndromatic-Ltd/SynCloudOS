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

import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node } from "@tiptap/pm/model";
import type { NSEAttributedContent, NSEParagraphAttributes, NSETextListMarker } from "../../Text";

const bullets: Partial<Record<NSETextListMarker, string>> = { disc: "•", circle: "◦", square: "▪" };

function alpha(ordinal: number): string {
  let value = ordinal, result = "";
  while (value > 0) { value -= 1; result = String.fromCharCode(97 + (value % 26)) + result; value = Math.floor(value / 26); }
  return result;
}
function roman(ordinal: number): string {
  if (ordinal >= 4000) return String(ordinal);
  const table: [number, string][] = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  let value = ordinal, result = "";
  for (const [amount, glyph] of table) while (value >= amount) { result += glyph; value -= amount; }
  return result;
}

/** The marker string NSTextList draws for an item. Bullets carry no ordinal. */
export function formatNSETextListMarker(marker: NSETextListMarker, ordinal: number): string {
  const bullet = bullets[marker];
  if (bullet) return bullet;
  if (marker === "decimal") return `${ordinal}.`;
  if (marker === "lower-alpha") return `${alpha(ordinal)}.`;
  if (marker === "upper-alpha") return `${alpha(ordinal).toUpperCase()}.`;
  if (marker === "lower-roman") return `${roman(ordinal)}.`;
  return `${roman(ordinal).toUpperCase()}.`;
}

/** One marker per paragraph (null outside lists). A list's numbering continues while
 *  consecutive paragraphs contain it, and restarts once a paragraph does not. */
export function nseTextListMarkersForAttributes(paragraphs: readonly (NSEParagraphAttributes | undefined)[]): readonly (string | null)[] {
  const counters = new Map<string, number>();
  return paragraphs.map((attributes) => {
    const lists = attributes?.textLists ?? [];
    const present = new Set(lists.map((list) => list.id));
    for (const id of counters.keys()) if (!present.has(id)) counters.delete(id);
    const innermost = lists[lists.length - 1];
    if (!innermost) return null;
    const ordinal = (counters.get(innermost.id) ?? (innermost.start ?? 1) - 1) + 1;
    counters.set(innermost.id, ordinal);
    return formatNSETextListMarker(innermost.marker, ordinal);
  });
}

export function nseTextListMarkers(content: NSEAttributedContent): readonly (string | null)[] {
  return nseTextListMarkersForAttributes(content.blocks.map((block) => block.attributes));
}

function decorations(doc: Node): DecorationSet {
  const attributes: NSEParagraphAttributes[] = [];
  doc.forEach((node) => { attributes.push((node.attrs.value ?? {}) as NSEParagraphAttributes); });
  const markers = nseTextListMarkersForAttributes(attributes);
  const result: Decoration[] = [];
  let index = 0;
  doc.forEach((node, offset) => {
    const marker = markers[index++];
    if (marker !== null && marker !== undefined) result.push(Decoration.node(offset, offset + node.nodeSize, { "data-nse-list-marker": marker }));
  });
  return DecorationSet.create(doc, result);
}

/** Markers are decorations drawn by CSS: never characters in the text flow. */
export function nseTextListPlugin(): Plugin {
  return new Plugin({
    state: {
      init: (_config, state) => decorations(state.doc),
      apply: (transaction, previous) => transaction.docChanged ? decorations(transaction.doc) : previous,
    },
    props: { decorations(state) { return this.getState(state); } },
  });
}
