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

import { validateNSETextRange } from "./textPositions";
import { normaliseNSETextAttributes } from "./textAttributes";
import type { NSEParagraphAttributes } from "./paragraphAttributes";
import type { NSEAttributedTextAttributes, NSETextCustomValue, NSETextSnapshot, NSETextRange } from "./textTypes";

export type NSEEffectiveAttribute<T> =
  | { readonly state: "uniform"; readonly value: T }
  | { readonly state: "mixed" }
  | { readonly state: "unset" }
  | { readonly state: "unavailable"; readonly reason: string };
export interface NSEEffectiveTextAttributeOptions<K extends keyof NSEAttributedTextAttributes> {
  readonly typingAttributes?: NSEAttributedTextAttributes;
  readonly isAvailable?: (value: NonNullable<NSEAttributedTextAttributes[K]>) => boolean;
}

function aggregate<T>(values:readonly (T|undefined)[],isAvailable?: (value:T)=>boolean):NSEEffectiveAttribute<T> {
  if(values.some(value=>value!==undefined && isAvailable && !isAvailable(value))) return Object.freeze({state:"unavailable",reason:"Attribute resource unavailable."});
  if(!values.length || values.every(value=>value===undefined)) return Object.freeze({state:"unset"});
  const first=values[0];
  if(values.some(value=>JSON.stringify(value)!==JSON.stringify(first))) return Object.freeze({state:"mixed"});
  return Object.freeze({state:"uniform",value:first!});
}
export function effectiveNSETextAttribute<K extends keyof NSEAttributedTextAttributes>(snapshot:NSETextSnapshot,range:NSETextRange,key:K,options:NSEEffectiveTextAttributeOptions<K>={}):NSEEffectiveAttribute<NonNullable<NSEAttributedTextAttributes[K]>> {
  validateNSETextRange(snapshot.text,range);
  const spans=snapshot.characterSpans.filter(span=>span.range.location<range.location+range.length && span.range.location+span.range.length>range.location);
  if(spans.some(span=>span.attachment)) return Object.freeze({state:"unavailable",reason:"Attachment character attributes unavailable in v1."});
  const values=!range.length ? [normaliseNSETextAttributes(options.typingAttributes ?? {})[key]] : spans.map(span=>span.attributes[key]);
  return aggregate(values as readonly (NonNullable<NSEAttributedTextAttributes[K]>|undefined)[],options.isAvailable);
}
export function effectiveNSEParagraphAttribute<K extends keyof NSEParagraphAttributes>(snapshot:NSETextSnapshot,range:NSETextRange,key:K):NSEEffectiveAttribute<NonNullable<NSEParagraphAttributes[K]>> {
  validateNSETextRange(snapshot.text,range);
  const spans=snapshot.paragraphSpans.filter(span=>range.length ? span.range.location<range.location+range.length && span.range.location+span.range.length>=range.location : span.range.location<=range.location && span.range.location+span.range.length>=range.location);
  return aggregate(spans.map(span=>span.attributes[key]) as readonly (NonNullable<NSEParagraphAttributes[K]>|undefined)[]);
}

/** Aggregate one application custom key across a selection, as the inspector reads any attribute. */
export function effectiveNSETextCustomAttribute(snapshot:NSETextSnapshot,range:NSETextRange,key:string,options:{readonly typingAttributes?:NSEAttributedTextAttributes}={}):NSEEffectiveAttribute<NSETextCustomValue> {
  validateNSETextRange(snapshot.text,range);
  if(!range.length) return aggregate([normaliseNSETextAttributes(options.typingAttributes ?? {}).custom?.[key]]);
  const spans=snapshot.characterSpans.filter(span=>!span.attachment && span.range.location<range.location+range.length && span.range.location+span.range.length>range.location);
  return aggregate(spans.map(span=>span.attributes.custom?.[key]));
}
export function effectiveNSEParagraphCustomAttribute(snapshot:NSETextSnapshot,range:NSETextRange,key:string):NSEEffectiveAttribute<NSETextCustomValue> {
  validateNSETextRange(snapshot.text,range);
  const spans=snapshot.paragraphSpans.filter(span=>range.length ? span.range.location<range.location+range.length && span.range.location+span.range.length>=range.location : span.range.location<=range.location && span.range.location+span.range.length>=range.location);
  return aggregate(spans.map(span=>span.attributes.custom?.[key]));
}
