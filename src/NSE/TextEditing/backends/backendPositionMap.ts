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

import type { Node } from "@tiptap/pm/model";

/** Private bridge: backend structural positions never escape as text offsets. */
export interface BackendPositionMap {
  readonly text: string;
  toSemantic(position: number): number;
  toBackend(offset: number): number;
}

export function createBackendPositionMap(document: Node): BackendPositionMap {
  const offsets: number[] = [];
  let text = "";
  let paragraphs = 0;
  document.descendants((node, position) => {
    if (!node.isTextblock) {
      if (node.isLeaf && !node.isText) throw new TypeError(`Unsupported backend block ${node.type.name}.`);
      return true;
    }
    if (paragraphs++) text += "\n";
    offsets[text.length] = position + 1;
    node.forEach((child, childOffset) => {
      const start = position + 1 + childOffset;
      const value = child.isText ? child.text! : child.type.name === "hardBreak" || child.type.name === "hard_break" ? "\n" : child.isAtom ? "\uFFFC" : null;
      if (value === null) throw new TypeError(`Unsupported backend inline ${child.type.name}.`);
      for (let i = 0; i < value.length; i++) offsets[text.length + i] = start + i;
      text += value;
      offsets[text.length] = start + child.nodeSize;
    });
    offsets[text.length] = position + node.nodeSize - 1;
    return false;
  });
  if (!paragraphs) throw new TypeError("Text backend requires at least one text block.");
  if (text.length > 1024 * 1024) throw new RangeError("Backend text exceeds the bounded text view limit.");
  return Object.freeze({
    text,
    toBackend(offset: number) {
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > text.length) throw new RangeError("Text offset is outside the backend document.");
      return offsets[offset];
    },
    toSemantic(position: number) {
      if (!Number.isSafeInteger(position) || position < 0 || position > document.content.size) throw new RangeError("Backend position is outside the document.");
      let low = 0, high = offsets.length - 1;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (offsets[middle] <= position) low = middle;
        else high = middle - 1;
      }
      return low;
    },
  });
}
