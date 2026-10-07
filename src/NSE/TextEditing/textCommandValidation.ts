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

import { canonicalNSETextData, normaliseNSETextAttributes, normaliseNSEParagraphAttributes, plainNSETextContent, parseAttributedContent, nseTextListMarkerStyles, type NSETextListMarker, type NSETextRange } from "../Text";

export const nseTextCommandIds=Object.freeze(["text.insert","text.replace","text.deleteBackward","text.deleteForward","text.selectAll","text.copy","text.cut","text.paste","text.undo","text.redo","text.bold","text.italic","text.underline","text.strike","text.applyAttributes","text.removeAttributes","text.paragraphAttributes","text.headerLevel","text.toggleList","text.listLevel","text.restartNumbering","text.attachmentBounds"] as const);
export type NSETextCommandId=typeof nseTextCommandIds[number];
export interface NSETextCommandValidation { readonly enabled:boolean; readonly state:"off"|"on"|"mixed"; readonly title:string; readonly disabledReason?:string }
export function parseNSETextCommandPayload(command:NSETextCommandId,value:unknown):unknown {
  if(!nseTextCommandIds.includes(command)) throw new TypeError("Unknown text command.");
  if(command==="text.insert") { if(typeof value!=="string") throw new TypeError("Text insertion requires a bounded string."); plainNSETextContent(value); return value; }
  if(command==="text.applyAttributes") return normaliseNSETextAttributes(value);
  if(command==="text.paragraphAttributes") return normaliseNSEParagraphAttributes(value);
  if(command==="text.removeAttributes") {
    const keys=canonicalNSETextData(value,"Remove text attributes",{maxDepth:2,maxNodes:32,maxBytes:1024});
    const allowed=["bold","italic","underline","strike","outline","language","foregroundColour","backgroundColour","link","baseline","baselineOffset","kern","capitalisation","ligatures","font","shadow","custom"];
    if(!Array.isArray(keys) || keys.some(key=>typeof key!=="string" || !allowed.includes(key))) throw new TypeError("Invalid text attribute keys.");return keys;
  }
  if(command==="text.replace") {
    const data=canonicalNSETextData(value,"Text replacement",{maxDepth:24,maxNodes:20000,maxBytes:1024*1024}) as {range:NSETextRange;content:unknown};
    if(!data || Object.keys(data).some(key=>!["range","content"].includes(key)) || !data.range || !Number.isSafeInteger(data.range.location) || !Number.isSafeInteger(data.range.length) || data.range.location<0 || data.range.length<0) throw new TypeError("Invalid text replacement range.");
    return Object.freeze({range:data.range,content:parseAttributedContent(data.content)});
  }
  if(command==="text.headerLevel") { if(!Number.isInteger(value) || (value as number)<0 || (value as number)>6) throw new TypeError("Heading level must be an integer from 0 to 6."); return value; }
  if(command==="text.toggleList") { if(!nseTextListMarkerStyles.includes(value as NSETextListMarker)) throw new TypeError("Unknown list marker."); return value; }
  if(command==="text.listLevel") { if(value!==1 && value!==-1) throw new TypeError("List level changes by 1 or -1."); return value; }
  if(command==="text.attachmentBounds") {
    const data=canonicalNSETextData(value,"Attachment bounds",{maxDepth:3,maxNodes:16,maxBytes:512}) as {range:NSETextRange;bounds:{width:number;height:number}};
    if(!data || !data.range || !Number.isSafeInteger(data.range.location) || data.range.length!==1 || !data.bounds || ![data.bounds.width,data.bounds.height].every(entry=>typeof entry==="number" && entry>0 && entry<=32768)) throw new TypeError("Invalid attachment bounds payload.");
    return Object.freeze({range:Object.freeze({location:data.range.location,length:1}),bounds:Object.freeze({width:data.bounds.width,height:data.bounds.height})});
  }
  if(value!==undefined) throw new TypeError("This text command accepts no payload.");
  return undefined;
}
