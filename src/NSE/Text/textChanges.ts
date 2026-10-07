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

import { isNSEUTF16Boundary } from "./textPositions";
import type { NSETextGravity, NSETextPosition, NSETextRange, NSETextSnapshot } from "./textTypes";

export interface NSETextChangeStep {
  readonly range: NSETextRange;
  readonly insertedLength: number;
  readonly beforeText: string;
  readonly afterText: string;
  readonly kind: "replace" | "attributes" | "paragraph-attributes";
}
export class NSETextChangeMap {
  readonly beforeRevision: number;
  readonly afterRevision: number;
  readonly flowId: string;
  readonly ownerGeneration: number;
  readonly steps: readonly NSETextChangeStep[];
  readonly beforeText: string;
  readonly afterText: string;

  constructor(before: NSETextSnapshot, after: NSETextSnapshot, steps: readonly NSETextChangeStep[]) {
    this.beforeRevision=before.revision; this.afterRevision=after.revision;
    this.flowId=before.flowId; this.ownerGeneration=before.ownerGeneration;
    this.beforeText=before.text; this.afterText=after.text;
    this.steps=Object.freeze(steps.map(step=>Object.freeze({...step,range:Object.freeze({...step.range})})));
    Object.freeze(this);
  }
  map(position: NSETextPosition): NSETextPosition | null {
    if (position.flowId !== this.flowId || position.revision !== this.beforeRevision || position.ownerGeneration !== this.ownerGeneration || !isNSEUTF16Boundary(this.beforeText,position.offset) || !["before","after"].includes(position.gravity) || !["upstream","downstream"].includes(position.affinity)) return null;
    let offset=position.offset;
    for (const step of this.steps) {
      if (step.kind !== "replace") continue;
      const start=step.range.location, end=start+step.range.length;
      if (offset > start && offset < end) return null;
      if (offset < start) continue;
      if (offset > end || offset === end && step.range.length > 0) offset += step.insertedLength-step.range.length;
      else offset = start+(position.gravity === "after" ? step.insertedLength : 0);
      if (!isNSEUTF16Boundary(step.afterText,offset)) return null;
    }
    return Object.freeze({...position,revision:this.afterRevision,offset});
  }
  mapRange(range: NSETextRange, revision: number, startGravity: NSETextGravity = "after", endGravity: NSETextGravity = "before"): NSETextRange | null {
    if (!Number.isSafeInteger(range.length) || range.length < 0) return null;
    const position=(offset:number,gravity:NSETextGravity):NSETextPosition=>({flowId:this.flowId,ownerGeneration:this.ownerGeneration,revision,offset,gravity,affinity:"downstream"});
    const start=this.map(position(range.location,startGravity));
    const end=this.map(position(range.location+range.length,range.length===0 ? startGravity : endGravity));
    if (!start || !end || end.offset < start.offset || range.length > 0 && end.offset===start.offset) return null;
    return Object.freeze({location:start.offset,length:end.offset-start.offset});
  }
  inverse(): NSETextChangeMap {
    const metadata=(revision:number,text:string)=>({flowId:this.flowId,ownerGeneration:this.ownerGeneration,revision,text} as NSETextSnapshot);
    return new NSETextChangeMap(metadata(this.afterRevision,this.afterText),metadata(this.beforeRevision,this.beforeText),[...this.steps].reverse().map(step=>({...step,beforeText:step.afterText,afterText:step.beforeText,range:{location:step.range.location,length:step.insertedLength},insertedLength:step.range.length})));
  }
}

export function composeNSETextChangeMaps(first: NSETextChangeMap, second: NSETextChangeMap): NSETextChangeMap {
  if (first.afterRevision !== second.beforeRevision || first.flowId !== second.flowId || first.ownerGeneration !== second.ownerGeneration || first.afterText !== second.beforeText) throw new Error("Cannot compose stale text change maps.");
  return new NSETextChangeMap({flowId:first.flowId,ownerGeneration:first.ownerGeneration,revision:first.beforeRevision,text:first.beforeText} as NSETextSnapshot,{flowId:first.flowId,ownerGeneration:first.ownerGeneration,revision:second.afterRevision,text:second.afterText} as NSETextSnapshot,[...first.steps,...second.steps]);
}
