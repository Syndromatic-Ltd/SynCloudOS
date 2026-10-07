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

import { attributedContentText, canonicalNSETextData, nseAttributedContentType, parseAttributedContent, plainNSETextContent, serializeAttributedContent, sliceNSEAttributedContent, type NSEAttributedContent, type NSETextSnapshot, type NSETextRange } from "../Text";

export interface NSETextClipboardPort {
  read(signal:AbortSignal):Promise<Readonly<Record<string,string>>>;
  write(payload:Readonly<Record<string,string>>,signal:AbortSignal):Promise<void>;
}
export interface NSETextClipboardContent { readonly content:NSEAttributedContent; readonly kind:"attributed"|"plain" }
export function createNSETextClipboardPayload(snapshot:NSETextSnapshot,range:NSETextRange):Readonly<Record<string,string>> {
  const content=sliceNSEAttributedContent(snapshot.attributedContent,range);
  return Object.freeze({"text/plain":attributedContentText(content),[nseAttributedContentType]:serializeAttributedContent(content)});
}
export function parseNSETextClipboardPayload(payload:unknown):NSETextClipboardContent {
  const safe=canonicalNSETextData(payload,"Text clipboard",{maxDepth:8,maxNodes:128,maxBytes:3*1024*1024}) as Record<string,unknown>;
  if(!safe || typeof safe!=="object" || Array.isArray(safe) || Object.values(safe).some(value=>typeof value!=="string")) throw new TypeError("Clipboard payload must contain bounded MIME strings.");
  if(safe[nseAttributedContentType]!==undefined) {
    const encoded=safe[nseAttributedContentType] as string;
    if(new TextEncoder().encode(encoded).byteLength>1024*1024) throw new RangeError("Attributed clipboard byte limit exceeded.");
    return Object.freeze({kind:"attributed",content:parseAttributedContent(JSON.parse(encoded))});
  }
  if(typeof safe["text/plain"]!=="string") throw new TypeError("Clipboard has no supported text format.");
  return Object.freeze({kind:"plain",content:plainNSETextContent(safe["text/plain"])});
}
/** Abort a waiting UI operation even when an injected provider ignores its signal. */
export function withNSETextCancellation<T>(pending:Promise<T>,signal:AbortSignal):Promise<T> {
  if(signal.aborted) { void pending.catch(()=>{}); return Promise.reject(signal.reason ?? new Error("Text operation cancelled.")); }
  return new Promise<T>((resolve,reject)=>{
    const abort=()=>{cleanup();reject(signal.reason ?? new Error("Text operation cancelled."));};
    const cleanup=()=>signal.removeEventListener("abort",abort);
    signal.addEventListener("abort",abort,{once:true});
    pending.then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});
  });
}
