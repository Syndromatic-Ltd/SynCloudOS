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

import { attributedContent, attributedContentLayoutText, paragraph, parseAttributedContent, textRun, normalizeNSEAttributedContentNewlines, nseTextCustomKeyPattern } from "./attributedContent";
import type { NSETextCustomAttributes } from "./textTypes";
import { normaliseNSETextAttributes } from "./textAttributes";
import { normaliseNSEParagraphAttributes } from "./paragraphAttributes";
import { canonicalNSETextData } from "./textValidation";
import { validateNSETextRange } from "./textPositions";
import { NSETextChangeMap, type NSETextChangeStep } from "./textChanges";
import type { NSETextChangeReceipt } from "./textOwner";
import type { NSEAttributedContent, NSEAttributedParagraph, NSEAttributedRun, NSEAttributedTextAttributes, NSETextSnapshot, NSETextRange, NSETextEditOperation, NSETextCharacterSpan, NSETextParagraphSpan } from "./textTypes";

const emptyAttributes=Object.freeze({});
const runLength=(run:NSEAttributedRun)=>run.kind === "text" ? run.text.length : 1;
const blockLength=(block:NSEAttributedParagraph)=>block.runs.reduce((length,run)=>length+runLength(run),0);
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

export function createNSETextSnapshot(content: NSEAttributedContent, flowId = "text", revision = 0, ownerGeneration = 0): NSETextSnapshot {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(flowId) || !Number.isSafeInteger(revision) || revision < 0 || !Number.isSafeInteger(ownerGeneration) || ownerGeneration < 0) throw new TypeError("Invalid text flow/revision/generation.");
  const safe=normalizeNSEAttributedContentNewlines(content).content;
  const canonical=safe.blocks.length ? safe : attributedContent([paragraph([])]);
  const characterSpans:NSETextCharacterSpan[]=[],paragraphSpans:NSETextParagraphSpan[]=[];
  let location=0;
  canonical.blocks.forEach((block,paragraphIndex)=>{
    const start=location;
    for(const run of block.runs) {
      const length=runLength(run);
      if (length) characterSpans.push(Object.freeze({range:Object.freeze({location,length}),attributes:run.kind==="text" ? run.attributes ?? emptyAttributes : emptyAttributes,...(run.kind==="attachment" ? {attachment:run} : {})}));
      location+=length;
    }
    paragraphSpans.push(Object.freeze({range:Object.freeze({location:start,length:location-start}),paragraphIndex,attributes:block.attributes ?? emptyAttributes}));
    if(paragraphIndex < canonical.blocks.length-1) location++;
  });
  return Object.freeze({flowId,revision,ownerGeneration,text:attributedContentLayoutText(canonical),attributedContent:canonical,characterSpans:Object.freeze(characterSpans),paragraphSpans:Object.freeze(paragraphSpans)});
}

function locate(content:NSEAttributedContent,offset:number): {index:number;offset:number} {
  let start=0;
  for(let index=0;index<content.blocks.length;index++) {
    const length=blockLength(content.blocks[index]!);
    if(offset<=start+length) return {index,offset:offset-start};
    start+=length+1;
  }
  throw new RangeError("Invalid text range.");
}

function coalesce(runs:readonly NSEAttributedRun[]): readonly NSEAttributedRun[] {
  const result:NSEAttributedRun[]=[];
  for(const run of runs) {
    if(run.kind==="text" && !run.text.length) continue;
    const last=result[result.length-1];
    if(last?.kind==="text" && run.kind==="text" && equal(last.attributes,run.attributes)) result[result.length-1]=textRun(last.text+run.text,last.attributes);
    else result.push(run);
  }
  return result;
}
function sliceRuns(block:NSEAttributedParagraph,start:number,end:number): readonly NSEAttributedRun[] {
  const result:NSEAttributedRun[]=[]; let offset=0;
  for(const run of block.runs) {
    const length=runLength(run),from=Math.max(start-offset,0),to=Math.min(end-offset,length);
    if(to>from) result.push(run.kind==="text" ? textRun(run.text.slice(from,to),run.attributes) : run);
    offset+=length;
  }
  return coalesce(result);
}

export function readNSETextContent(snapshot:NSETextSnapshot,range:NSETextRange): NSEAttributedContent {
  validateNSETextRange(snapshot.text,range);
  const content=snapshot.attributedContent,start=locate(content,range.location),end=locate(content,range.location+range.length);
  return attributedContent(content.blocks.slice(start.index,end.index+1).map((block,i)=>paragraph(sliceRuns(block,i===0 ? start.offset : 0,start.index+i===end.index ? end.offset : blockLength(block)),block.attributes)));
}

/** Bounded structural slice for private backend incremental replacement. */
export function sliceNSEAttributedContent(content:NSEAttributedContent,range:NSETextRange):NSEAttributedContent {
  return readNSETextContent(createNSETextSnapshot(content),range);
}

export function inheritedNSETextAttributes(snapshot:NSETextSnapshot,offset:number): NSEAttributedTextAttributes {
  validateNSETextRange(snapshot.text,{location:offset,length:0});
  const paragraphSpan=snapshot.paragraphSpans.find(span=>offset>=span.range.location && offset<=span.range.location+span.range.length);
  const candidates=snapshot.characterSpans.filter(span=>!span.attachment && span.range.location >= (paragraphSpan?.range.location ?? 0) && span.range.location < (paragraphSpan ? paragraphSpan.range.location+paragraphSpan.range.length : snapshot.text.length));
  return candidates.find(span=>offset>span.range.location && offset<=span.range.location+span.range.length)?.attributes ?? candidates.find(span=>span.range.location===offset)?.attributes ?? emptyAttributes;
}

export function plainNSETextContent(text:string,attributes?:NSEAttributedTextAttributes): NSEAttributedContent {
  if(typeof text!=="string") throw new TypeError("Replacement text must be a string.");
  return attributedContent(text.replace(/\r\n?/g,"\n").split("\n").map(line=>paragraph(line ? [textRun(line,attributes)] : [])));
}

function replace(content:NSEAttributedContent,range:NSETextRange,insertion:NSEAttributedContent):NSEAttributedContent {
  const start=locate(content,range.location),end=locate(content,range.location+range.length);
  const left=content.blocks[start.index]!,right=content.blocks[end.index]!;
  const inserted=insertion.blocks.length ? insertion.blocks : [paragraph([])];
  const prefix=sliceRuns(left,0,start.offset),suffix=sliceRuns(right,end.offset,blockLength(right));
  const replacement=inserted.map((block,index)=>paragraph(coalesce([...(index===0 ? prefix : []),...block.runs,...(index===inserted.length-1 ? suffix : [])]),block.attributes ?? left.attributes));
  return attributedContent([...content.blocks.slice(0,start.index),...replacement,...content.blocks.slice(end.index+1)]);
}

const characterKeys:readonly (keyof NSEAttributedTextAttributes)[]=["bold","italic","underline","strike","outline","language","foregroundColour","backgroundColour","link","baseline","baselineOffset","kern","capitalisation","ligatures","font","shadow","custom"];
const paragraphKeys=["alignment","firstLineHeadIndent","headIndent","tailIndent","lineHeightMultiple","tabStops","headerLevel","textLists","paragraphSpacing","paragraphSpacingBefore","custom"] as const;
function assertKeys(value:object,allowed:readonly string[]):void {
  if(Object.keys(value).some(key=>!allowed.includes(key))) throw new TypeError("Unsupported text operation property.");
}
function assertCustomKeys(keys:unknown):readonly string[] {
  if(keys===undefined) return [];
  if(!Array.isArray(keys) || keys.length>64 || keys.some(key=>typeof key!=="string" || !nseTextCustomKeyPattern.test(key))) throw new TypeError("Invalid custom attribute removal keys.");
  return keys;
}
/** Removals first, then a key-wise merge of `custom`; an emptied custom map is dropped. */
function mergeAttributes<T extends {readonly custom?:NSETextCustomAttributes}>(base:T|undefined,patch:T|undefined,remove:readonly string[],removeCustom:readonly string[]):T {
  const next:Record<string,unknown>={...base};
  remove.forEach(key=>delete next[key]);
  let custom:Record<string,unknown>|undefined=next.custom ? {...(next.custom as object)} : undefined;
  if(custom) { removeCustom.forEach(key=>delete custom![key]); }
  Object.assign(next,patch);
  if(patch?.custom) custom={...custom,...patch.custom};
  if(custom && Object.keys(custom).length) next.custom=custom; else delete next.custom;
  return next as T;
}
function mutateAttributes(content:NSEAttributedContent,range:NSETextRange,operation:Extract<NSETextEditOperation,{kind:"apply-attributes"|"remove-attributes"}>):NSEAttributedContent {
  const attributes=operation.kind==="apply-attributes" ? normaliseNSETextAttributes(operation.attributes) : undefined;
  if(operation.kind==="remove-attributes" && (!Array.isArray(operation.keys) || operation.keys.some(key=>!characterKeys.includes(key)))) throw new TypeError("Invalid character attribute removal keys.");
  const removeCustom=operation.kind==="remove-attributes" ? assertCustomKeys(operation.customKeys) : [];
  let offset=0;
  return attributedContent(content.blocks.map(block=>{
    const runs:NSEAttributedRun[]=[];
    for(const run of block.runs) {
      const length=runLength(run),from=Math.max(0,range.location-offset),to=Math.min(length,range.location+range.length-offset);
      if(run.kind==="attachment" || to<=from) runs.push(run);
      else {
        if(from>0) runs.push(textRun(run.text.slice(0,from),run.attributes));
        const next=mergeAttributes<NSEAttributedTextAttributes>(run.attributes,attributes,operation.kind==="remove-attributes" ? operation.keys : [],removeCustom);
        runs.push(textRun(run.text.slice(from,to),Object.keys(next).length ? next : undefined));
        if(to<length) runs.push(textRun(run.text.slice(to),run.attributes));
      }
      offset+=length;
    }
    offset++;
    return paragraph(coalesce(runs),block.attributes);
  }));
}

/** Pure staging helper. No publication, runtime authority, history or observer work. */
export function applyNSETextOperations(before:NSETextSnapshot,operations:readonly NSETextEditOperation[]):NSETextChangeReceipt {
  const safe=canonicalNSETextData(operations,"Text operations",{maxDepth:24,maxNodes:100_000,maxBytes:4*1024*1024});
  if(!Array.isArray(safe) || safe.length>1024) throw new TypeError("Text operations must be a bounded array.");
  let content=before.attributedContent,current=before;
  const steps:NSETextChangeStep[]=[];
  for(const operation of safe as readonly NSETextEditOperation[]) {
    if(!operation || typeof operation!=="object") throw new TypeError("Invalid text operation.");
    const range=validateNSETextRange(current.text,operation.range);
    let kind:NSETextChangeStep["kind"]="attributes",insertedLength=range.length;
    if(operation.kind==="replace") {
      assertKeys(operation,["kind","range","content"]);
      const insertion=normalizeNSEAttributedContentNewlines(operation.content).content;
      content=replace(content,range,insertion);
      insertedLength=attributedContentLayoutText(insertion).length; kind="replace";
    } else if(operation.kind==="apply-attributes" || operation.kind==="remove-attributes") {
      assertKeys(operation,["kind","range",...(operation.kind==="apply-attributes" ? ["attributes"] : ["keys","customKeys"])]);
      content=mutateAttributes(content,range,operation);
    } else if(operation.kind==="paragraph-attributes") {
      assertKeys(operation,["kind","range","attributes","remove","removeCustom"]);
      const attrs=normaliseNSEParagraphAttributes(operation.attributes);
      if(operation.remove && (!Array.isArray(operation.remove) || operation.remove.some(key=>!paragraphKeys.includes(key)))) throw new TypeError("Invalid paragraph removal keys.");
      const removeCustom=assertCustomKeys(operation.removeCustom);
      const start=locate(content,range.location),end=locate(content,range.location+range.length);
      // An exclusive end at the next paragraph's start does not format it.
      const endIndex=range.length && end.offset===0 && end.index>start.index ? end.index-1 : end.index;
      content=attributedContent(content.blocks.map((block,index)=>{
        if(index<start.index || index>endIndex) return block;
        const next=mergeAttributes(block.attributes,attrs,operation.remove ?? [],removeCustom);
        return paragraph(block.runs,Object.keys(next).length ? next : undefined);
      })); kind="paragraph-attributes";
    } else throw new TypeError("Unsupported text operation kind.");
    const next=createNSETextSnapshot(content,before.flowId,before.revision,before.ownerGeneration);
    steps.push({range,insertedLength,beforeText:current.text,afterText:next.text,kind}); current=next;
  }
  const snapshot=equal(content,before.attributedContent) ? before : createNSETextSnapshot(content,before.flowId,before.revision+1,before.ownerGeneration);
  return Object.freeze({before,snapshot,changeMap:new NSETextChangeMap(before,snapshot,snapshot===before ? [] : steps),operations:safe,observerErrors:Object.freeze([])});
}
