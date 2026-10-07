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

import { effectiveNSETextAttribute, effectiveNSEParagraphAttribute, type NSEAttributedTextAttributes, type NSEParagraphAttributes, type NSEEffectiveAttribute } from "../Text";
import type { TextEditingSession } from "./TextEditingSession";
import type { NSETextSelectionTarget } from "./textSessionTypes";

export interface NSETextAttributeAggregate {
  readonly target:NSETextSelectionTarget;
  readonly character:{readonly [K in keyof NSEAttributedTextAttributes]-?:NSEEffectiveAttribute<NonNullable<NSEAttributedTextAttributes[K]>>};
  readonly paragraph:{readonly [K in keyof NSEParagraphAttributes]-?:NSEEffectiveAttribute<NonNullable<NSEParagraphAttributes[K]>>};
  /** Independent size aggregation: different families may still have a uniform size. */
  readonly fontSize:NSEEffectiveAttribute<number>;
}
export function aggregateNSETextAttributes(session:TextEditingSession,target:NSETextSelectionTarget=session.captureTarget(),isFontAvailable?:(fontId:string)=>boolean):NSETextAttributeAggregate {
  const resolved=session.resolveTarget(target);if(!resolved) throw new Error("Text aggregate target is stale or revoked.");
  const state=session.getSnapshot();
  const character=Object.fromEntries((["bold","italic","underline","strike","outline","language","foregroundColour","backgroundColour","link","baseline","baselineOffset","kern","capitalisation","ligatures","font","shadow","custom"] as const).map(key=>[key,key==="font" ? effectiveNSETextAttribute(state.model,resolved.range,"font",{typingAttributes:state.typingAttributes,...(isFontAvailable ? {isAvailable:(font:NonNullable<NSEAttributedTextAttributes["font"]>)=>isFontAvailable(font.familyId)} : {})}) : effectiveNSETextAttribute(state.model,resolved.range,key,{typingAttributes:state.typingAttributes})]));
  const paragraph=Object.fromEntries((["alignment","firstLineHeadIndent","headIndent","tailIndent","lineHeightMultiple","tabStops","headerLevel","textLists","paragraphSpacing","paragraphSpacingBefore","custom"] as const).map(key=>[key,effectiveNSEParagraphAttribute(state.model,resolved.range,key)]));
  const spans=state.model.characterSpans.filter(span=>span.range.location<resolved.range.location+resolved.range.length && span.range.location+span.range.length>resolved.range.location);
  const values=resolved.range.length ? spans.map(span=>span.attributes.font?.size) : [state.typingAttributes.font?.size];
  const fontState=(character as NSETextAttributeAggregate["character"]).font;
  const fontSize:NSEEffectiveAttribute<number>=fontState.state==="unavailable" ? fontState : !values.length || values.every(value=>value===undefined) ? Object.freeze({state:"unset"}) : values.some(value=>value!==values[0]) ? Object.freeze({state:"mixed"}) : Object.freeze({state:"uniform",value:values[0]!});
  return Object.freeze({target:resolved,character:Object.freeze(character),paragraph:Object.freeze(paragraph),fontSize}) as NSETextAttributeAggregate;
}
