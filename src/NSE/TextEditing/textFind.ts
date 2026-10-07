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

import { canonicalNSETextData, inheritedNSETextAttributes, isNSEUTF16Boundary, plainNSETextContent, validateNSETextRange, type NSETextSnapshot, type NSETextRange, type NSETextChangeReceipt, type NSETextEditOperation } from "../Text";
import type { TextEditingSession } from "./TextEditingSession";

export interface NSETextFindOptions {readonly caseSensitive?:boolean;readonly wholeWord?:boolean;readonly signal?:AbortSignal}
export interface NSETextFindResult {
  readonly flowId:string;readonly revision:number;readonly ownerGeneration:number;readonly query:string;
  readonly caseSensitive:boolean;readonly wholeWord:boolean;readonly matches:readonly NSETextRange[];
}
export function findNSEText(snapshot:NSETextSnapshot,query:string,options:NSETextFindOptions={}):NSETextFindResult {
  options.signal?.throwIfAborted();
  if(typeof query!=="string" || !query.length || query.length>4096)throw new TypeError("Text find requires a bounded nonempty literal query.");
  if(options.caseSensitive!==undefined && typeof options.caseSensitive!=="boolean" || options.wholeWord!==undefined && typeof options.wholeWord!=="boolean")throw new TypeError("Invalid text find options.");
  const escaped=query.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const pattern=new RegExp(escaped,options.caseSensitive ? "gu" : "giu");
  const words=options.wholeWord ? [...new Intl.Segmenter(undefined,{granularity:"word"}).segment(snapshot.text)].filter(segment=>segment.isWordLike) : [];
  const starts=new Set(words.map(segment=>segment.index)),ends=new Set(words.map(segment=>segment.index+segment.segment.length));
  const matches:NSETextRange[]=[];
  for(const match of snapshot.text.matchAll(pattern)) {
    options.signal?.throwIfAborted();const location=match.index,length=match[0].length;
    if(!isNSEUTF16Boundary(snapshot.text,location) || !isNSEUTF16Boundary(snapshot.text,location+length))continue;
    if(options.wholeWord && (!starts.has(location) || !ends.has(location+length)))continue;
    if(matches.length>=20_000)throw new RangeError("Text find match limit exceeded.");
    matches.push(Object.freeze({location,length}));
  }
  return Object.freeze({flowId:snapshot.flowId,revision:snapshot.revision,ownerGeneration:snapshot.ownerGeneration,query,caseSensitive:options.caseSensitive ?? false,wholeWord:options.wholeWord ?? false,matches:Object.freeze(matches)});
}
export function replaceAllNSEText(session:TextEditingSession,result:NSETextFindResult,replacement:string,signal?:AbortSignal):NSETextChangeReceipt|null {
  signal?.throwIfAborted();const snapshot=session.getSnapshot().model;
  const safe=canonicalNSETextData(result,"Text find result",{maxDepth:8,maxNodes:100_000,maxBytes:1024*1024});
  if(safe.flowId!==snapshot.flowId || safe.revision!==snapshot.revision || safe.ownerGeneration!==snapshot.ownerGeneration)throw new Error("Text find result is stale.");
  const current=findNSEText(snapshot,safe.query,{caseSensitive:safe.caseSensitive,wholeWord:safe.wholeWord,signal});
  if(!Array.isArray(safe.matches) || current.matches.length!==safe.matches.length || current.matches.some((range,index)=>range.location!==safe.matches[index]?.location || range.length!==safe.matches[index]?.length))throw new Error("Text find result is invalid or stale.");
  if(!current.matches.length)return null;
  const operations:NSETextEditOperation[]=[...current.matches].reverse().map(range=>{validateNSETextRange(snapshot.text,range);return {kind:"replace",range,content:plainNSETextContent(replacement,inheritedNSETextAttributes(snapshot,range.location))};});
  signal?.throwIfAborted();return session.commit(operations,session.captureTarget(),{actionName:"Replace All"});
}
