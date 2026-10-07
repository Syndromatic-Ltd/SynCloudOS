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

import { normaliseNSETextAttributes, normaliseNSEParagraphAttributes, nsePointsToCSSPixels, type NSEAttributedTextAttributes, type NSEParagraphAttributes, type NSETextChangeReceipt, type NSETextEditOperation } from "../Text";
import { aggregateNSETextAttributes, type NSETextAttributeAggregate } from "./textAttributeAggregate";
import { withNSETextCancellation } from "./textClipboard";
import type { TextEditingSession } from "./TextEditingSession";
import type { NSETextSelectionTarget } from "./textSessionTypes";

export interface NSETextTypographyOptions {readonly session:TextEditingSession;readonly isFontAvailable?:(fontId:string)=>boolean;readonly fontGeneration?:()=>number}
export class NSETextTypographyAdapter {
  readonly #options:NSETextTypographyOptions;
  constructor(options:NSETextTypographyOptions){this.#options=options;}
  aggregate(target:NSETextSelectionTarget=this.#options.session.captureTarget()):NSETextAttributeAggregate{return aggregateNSETextAttributes(this.#options.session,target,this.#options.isFontAvailable);}
  font(font:NonNullable<NSEAttributedTextAttributes["font"]>,target:NSETextSelectionTarget=this.#options.session.captureTarget()):NSETextChangeReceipt|null {
    const attributes=normaliseNSETextAttributes({font});
    if(this.#options.isFontAvailable && !this.#options.isFontAvailable(font.familyId))throw new Error("Requested font is unavailable.");
    return this.#options.session.applyAttributes(attributes,target);
  }
  fontSize(size:number,options:{readonly units?:"css-px"|"pt";readonly familyId?:string;readonly target?:NSETextSelectionTarget}={}):NSETextChangeReceipt|null {
    if(options.units!==undefined && !["css-px","pt"].includes(options.units))throw new TypeError("Invalid font-size units.");
    const cssSize=options.units==="pt" ? nsePointsToCSSPixels(size) : size;
    if(!Number.isFinite(cssSize) || cssSize<1 || cssSize>512)throw new RangeError("Font size must be within 1..512 CSS pixels.");
    const session=this.#options.session,target=options.target ?? session.captureTarget(),resolved=session.resolveTarget(target);
    if(!resolved)throw new Error("Font-size target is stale or revoked.");
    const state=session.getSnapshot();
    if(!resolved.range.length) {
      const font=state.typingAttributes.font ?? (options.familyId ? {familyId:options.familyId} : undefined);
      if(!font)throw new Error("Font-size target has no requested family.");
      return this.font({...font,size:cssSize},target);
    }
    const end=resolved.range.location+resolved.range.length;
    const spans=state.model.characterSpans.filter(span=>span.range.location<end && span.range.location+span.range.length>resolved.range.location);
    const operations:NSETextEditOperation[]=spans.map(span=>{
      if(span.attachment)throw new Error("Attachment typography is unavailable in v1.");
      const font=span.attributes.font ?? (options.familyId ? {familyId:options.familyId} : undefined);
      if(!font || this.#options.isFontAvailable && !this.#options.isFontAvailable(font.familyId))throw new Error("Font-size target family is unavailable.");
      const location=Math.max(span.range.location,resolved.range.location);
      return {kind:"apply-attributes",range:{location,length:Math.min(span.range.location+span.range.length,end)-location},attributes:normaliseNSETextAttributes({font:{...font,size:cssSize}})};
    });
    return session.commit(operations,target,{actionName:"Formatting"});
  }
  colour(colour:string|null,target:NSETextSelectionTarget=this.#options.session.captureTarget()):NSETextChangeReceipt|null {
    return colour===null ? this.#options.session.removeAttributes(["foregroundColour"],target) : this.#options.session.applyAttributes(normaliseNSETextAttributes({foregroundColour:colour}),target);
  }
  baseline(value:"normal"|"superscript"|"subscript",target:NSETextSelectionTarget=this.#options.session.captureTarget()):NSETextChangeReceipt|null {return this.#options.session.applyAttributes(normaliseNSETextAttributes({baseline:value}),target);}
  paragraph(attributes:NSEParagraphAttributes,target:NSETextSelectionTarget=this.#options.session.captureTarget()):NSETextChangeReceipt {
    const resolved=this.#options.session.resolveTarget(target);if(!resolved)throw new Error("Paragraph target is stale or revoked.");
    return this.#options.session.commit([{kind:"paragraph-attributes",range:resolved.range,attributes:normaliseNSEParagraphAttributes(attributes)}],target,{actionName:"Paragraph Formatting"});
  }
  async acquireFont(font:NonNullable<NSEAttributedTextAttributes["font"]>,acquire:(signal:AbortSignal)=>Promise<void>,options:{readonly target?:NSETextSelectionTarget;readonly signal?:AbortSignal}={}):Promise<NSETextChangeReceipt|null> {
    const requested=normaliseNSETextAttributes({font}).font!;const target=options.target ?? this.#options.session.captureTarget();
    if(!this.#options.session.resolveTarget(target))throw new Error("Font target is stale or revoked.");
    const cancellation=new AbortController();
    const signal=AbortSignal.any([cancellation.signal,...(options.signal ? [options.signal] : [])]);signal.throwIfAborted();
    const unsubscribe=this.#options.session.subscribe(()=>{if(!this.#options.session.resolveTarget(target))cancellation.abort(new Error("Font target is stale or revoked."));});
    const generation=this.#options.fontGeneration?.();
    try {
      await withNSETextCancellation(acquire(signal),signal);signal.throwIfAborted();
      if(!this.#options.session.resolveTarget(target))throw new Error("Font target is stale or revoked.");
      const current=this.#options.fontGeneration?.();
      if(current!==undefined && (!Number.isSafeInteger(current) || generation!==undefined && current<generation))throw new Error("Font generation is stale.");
      // Acquisition can advance the font generation. Read readiness again before publication.
      return this.font(requested,target);
    }finally {unsubscribe();}
  }
  ruler(marker:"headIndent"|"firstLineHeadIndent"|"tailIndent",clientDelta:number,options:{readonly zoom:number;readonly direction:"ltr"|"rtl";readonly units?:"css-px"|"pt";readonly target?:NSETextSelectionTarget}):NSETextChangeReceipt {
    if(!["headIndent","firstLineHeadIndent","tailIndent"].includes(marker) || !Number.isFinite(clientDelta) || !Number.isFinite(options.zoom) || options.zoom<=0 || !["ltr","rtl"].includes(options.direction) || options.units!==undefined && !["css-px","pt"].includes(options.units))throw new TypeError("Invalid ruler direction, units or presentation transform.");
    const target=options.target ?? this.#options.session.captureTarget();
    const aggregate=this.aggregate(target).paragraph[marker];const base=aggregate.state==="uniform" ? aggregate.value : 0;
    const delta=options.units==="pt" ? nsePointsToCSSPixels(clientDelta) : clientDelta;
    return this.paragraph({[marker]:base+delta/options.zoom*(options.direction==="rtl" ? -1 : 1)},target);
  }
}
