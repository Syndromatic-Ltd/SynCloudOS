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

import {
  applyNSETextOperations, createNSETextSnapshot, sliceNSEAttributedContent, isNSEUTF16Boundary,
  type NSEAttributedContent, type NSEAttributedTextAttributes, type NSETextCustomAttributes, type NSETextEditOperation, type NSETextSnapshot,
} from "../../Text";

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Custom keys merge, so keys the backend no longer has must be removed explicitly. */
const staleCustomKeys = (existing: readonly (NSETextCustomAttributes | undefined)[], desired: NSETextCustomAttributes): string[] =>
  [...new Set(existing.flatMap(custom => Object.keys(custom ?? {})))].filter(key => !(key in desired));
/** Convert private backend changes to one owner transaction with local semantic edits. */
export function translateBackendContent(before: NSETextSnapshot, content: NSEAttributedContent): readonly NSETextEditOperation[] {
  const after = createNSETextSnapshot(content, before.flowId, before.revision, before.ownerGeneration);
  const operations: NSETextEditOperation[] = [];
  if (before.text !== after.text) {
    let prefix = 0;
    while (prefix < before.text.length && prefix < after.text.length && before.text[prefix] === after.text[prefix]) prefix++;
    while (!isNSEUTF16Boundary(before.text, prefix) || !isNSEUTF16Boundary(after.text, prefix)) prefix--;
    let oldEnd = before.text.length, newEnd = after.text.length;
    while (oldEnd > prefix && newEnd > prefix && before.text[oldEnd - 1] === after.text[newEnd - 1]) { oldEnd--; newEnd--; }
    while (!isNSEUTF16Boundary(before.text, oldEnd) || !isNSEUTF16Boundary(after.text, newEnd)) { oldEnd++; newEnd++; }
    operations.push({ kind: "replace", range: { location: prefix, length: oldEnd - prefix }, content: sliceNSEAttributedContent(after.attributedContent, { location: prefix, length: newEnd - prefix }) });
  }
  const intermediate = operations.length ? applyNSETextOperations(before, operations).snapshot : before;
  // A hard break and a paragraph separator have the same flat character, but
  // different native semantics. Use a conservative whole-flow replacement
  // when the local character edit cannot reproduce the desired block topology.
  if (!equal(intermediate.paragraphSpans.map(span => span.range), after.paragraphSpans.map(span => span.range))) {
    return Object.freeze([{ kind: "replace", range: { location: 0, length: before.text.length }, content: after.attributedContent }]);
  }
  let cursor = 0;
  for (const desired of after.characterSpans) {
    const end = desired.range.location + desired.range.length;
    while (cursor < intermediate.characterSpans.length && intermediate.characterSpans[cursor].range.location + intermediate.characterSpans[cursor].range.length <= desired.range.location) cursor++;
    const existing = [];
    for (let i = cursor; i < intermediate.characterSpans.length && intermediate.characterSpans[i].range.location < end; i++) existing.push(intermediate.characterSpans[i]);
    if (desired.attachment) {
      if (existing.length !== 1 || !equal(existing[0].attachment, desired.attachment)) operations.push({ kind: "replace", range: desired.range, content: sliceNSEAttributedContent(after.attributedContent, desired.range) });
      continue;
    }
    if (existing.every(span => !span.attachment && equal(span.attributes, desired.attributes))) continue;
    const remove = [...new Set(existing.flatMap(span => Object.keys(span.attributes)))].filter(key => !(key in desired.attributes)) as (keyof NSEAttributedTextAttributes)[];
    const customKeys = desired.attributes.custom ? staleCustomKeys(existing.map(span => span.attributes.custom), desired.attributes.custom) : [];
    if (remove.length || customKeys.length) operations.push({ kind: "remove-attributes", range: desired.range, keys: remove, ...(customKeys.length ? { customKeys } : {}) });
    if (Object.keys(desired.attributes).length) operations.push({ kind: "apply-attributes", range: desired.range, attributes: desired.attributes });
  }
  for (let index = 0; index < after.paragraphSpans.length; index++) {
    const desired = after.paragraphSpans[index];
    const existing = intermediate.paragraphSpans[index]?.attributes ?? {};
    if (equal(existing, desired.attributes)) continue;
    const remove = Object.keys(existing).filter(key => !(key in desired.attributes)) as (keyof typeof desired.attributes)[];
    const removeCustom = desired.attributes.custom ? staleCustomKeys([existing.custom], desired.attributes.custom) : [];
    operations.push({ kind: "paragraph-attributes", range: desired.range, attributes: desired.attributes, ...(remove.length ? { remove } : {}), ...(removeCustom.length ? { removeCustom } : {}) });
  }
  return Object.freeze(operations);
}
