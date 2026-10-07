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

import { effectiveNSETextAttribute, plainNSETextContent, nseGraphemeDeletionRange, attributedContentLayoutText, type NSEAttributedContent, type NSEAttributedTextAttributes, type NSEParagraphAttributes, type NSETextRange } from "../Text";
import type { TextEditingSession } from "./TextEditingSession";
import type { NSETextSelectionTarget } from "./textSessionTypes";
import { createNSETextClipboardPayload, parseNSETextClipboardPayload, withNSETextCancellation, type NSETextClipboardPort } from "./textClipboard";
import { nseTextCommandIds, parseNSETextCommandPayload, type NSETextCommandId, type NSETextCommandValidation } from "./textCommandValidation";
import { nseAttachmentBoundsOperations, nseHeaderLevelOperations, nseListLevelOperations, nseParagraphSpansInRange, nseRestartNumberingOperations, nseToggleListOperations, selectedNSETextAttachment } from "./textStructureCommands";
import type { NSETextListMarker } from "../Text";

export interface NSETextCommandsOptions {
  readonly session:TextEditingSession;
  readonly clipboard?:NSETextClipboardPort;
  readonly historyPresentation?:()=>{readonly canUndo:boolean;readonly canRedo:boolean;readonly undoTitle?:string|null;readonly redoTitle?:string|null};
  readonly signal?:AbortSignal;
}
export class NSETextCommands {
  readonly #options:NSETextCommandsOptions;
  readonly #lifetime=new AbortController();
  #unsubscribe:()=>void=()=>{};
  constructor(options:NSETextCommandsOptions) {
    this.#options=options;
    this.#unsubscribe=options.session.subscribe(()=>{if(options.session.getSnapshot().disposed)this.dispose();});
    options.signal?.addEventListener("abort",this.dispose,{once:true});
    if(options.signal?.aborted || options.session.getSnapshot().disposed)this.dispose();
  }
  subscribe=(listener:()=>void)=>this.#options.session.subscribe(listener);
  validate(command:NSETextCommandId,payload?:unknown,target:NSETextSelectionTarget=this.#options.session.captureTarget()):NSETextCommandValidation {
    const session=this.#options.session,state=session.getSnapshot(),resolved=session.resolveTarget(target);
    let title=command.slice(5).replace(/([A-Z])/g," $1"),check:"off"|"on"|"mixed"="off",reason:string|undefined;
    try{parseNSETextCommandPayload(command,payload);}catch(error){reason=error instanceof Error ? error.message : "Invalid payload.";}
    if(this.#lifetime.signal.aborted || state.disposed || !resolved) reason="Text target is stale or revoked.";
    const readOnlyAllowed=["text.copy","text.selectAll"].includes(command);
    if(!state.editable && !readOnlyAllowed) reason="Text target is read-only.";
    if(state.marked && !readOnlyAllowed) reason="Finish or cancel text composition.";
    if(["text.copy","text.cut"].includes(command) && !resolved?.range.length) reason="No text is selected.";
    if(["text.copy","text.cut","text.paste"].includes(command) && !this.#options.clipboard) reason="Clipboard is unavailable.";
    if(command==="text.undo" || command==="text.redo") {
      const history=this.#options.historyPresentation?.();const undo=command==="text.undo";
      title=(undo ? history?.undoTitle : history?.redoTitle) ?? (undo ? "Undo" : "Redo");
      if(!history || !(undo ? history.canUndo : history.canRedo)) reason="Text history action is unavailable.";
    }
    if(["text.bold","text.italic","text.underline","text.strike"].includes(command) && resolved) {
      const key=command.slice(5) as "bold"|"italic"|"underline"|"strike";
      const value=effectiveNSETextAttribute(state.model,resolved.range,key,{typingAttributes:state.typingAttributes});
      check=value.state==="mixed" ? "mixed" : value.state==="uniform" && value.value ? "on" : "off";
      if(value.state==="unavailable") reason=value.reason;
    }
    if(resolved && command==="text.toggleList" && typeof payload==="string") {
      const spans=nseParagraphSpansInRange(state.model,resolved.range);
      const markers=spans.map(span=>span.attributes.textLists?.at(-1)?.marker);
      check=markers.length && markers.every(marker=>marker===payload) ? "on" : markers.some(marker=>marker===payload) ? "mixed" : "off";
    }
    if(resolved && command==="text.headerLevel" && typeof payload==="number") {
      const levels=nseParagraphSpansInRange(state.model,resolved.range).map(span=>span.attributes.headerLevel ?? 0);
      check=levels.length && levels.every(level=>level===payload) ? "on" : levels.some(level=>level===payload) ? "mixed" : "off";
    }
    if(resolved && (command==="text.listLevel" || command==="text.restartNumbering") && !nseParagraphSpansInRange(state.model,resolved.range).some(span=>span.attributes.textLists?.length)) reason ??= "Select a list item.";
    if(command==="text.attachmentBounds" && payload && typeof payload==="object" && !selectedNSETextAttachment(state.model,(payload as {range:NSETextRange}).range)) reason ??= "Select one attachment.";
    return Object.freeze({enabled:!reason,state:check,title,...(reason ? {disabledReason:reason} : {})});
  }
  async execute(command:NSETextCommandId,payload?:unknown,options:{readonly target?:NSETextSelectionTarget;readonly signal?:AbortSignal}={}):Promise<unknown> {
    const session=this.#options.session,target=options.target ?? session.captureTarget();
    const signal=AbortSignal.any([this.#lifetime.signal,...(options.signal ? [options.signal] : [])]);signal.throwIfAborted();
    const validation=this.validate(command,payload,target);if(!validation.enabled) throw new Error(validation.disabledReason);
    const value=parseNSETextCommandPayload(command,payload);
    const resolve=()=>{signal.throwIfAborted();const resolved=session.resolveTarget(target);if(!resolved)throw new Error("Text target is stale or revoked.");return resolved;};
    const replace=(range:NSETextRange,content:NSEAttributedContent,actionName="Typing")=>{
      resolve();const receipt=session.commit([{kind:"replace",range,content}],target,{actionName});
      session.select(range.location+attributedContentLayoutText(content).length);return receipt;
    };
    if(command==="text.selectAll") {session.select(0,session.getSnapshot().model.text.length);return null;}
    if(command==="text.undo" || command==="text.redo") return session.requestHistory(command==="text.undo" ? "undo" : "redo");
    if(command==="text.copy" || command==="text.cut") {
      const selected=resolve();const snapshot=session.getSnapshot().model;
      await withNSETextCancellation(this.#options.clipboard!.write(createNSETextClipboardPayload(snapshot,selected.range),signal),signal);
      const resolved=resolve();return command==="text.cut" ? replace(resolved.range,plainNSETextContent(""),"Cut") : null;
    }
    if(command==="text.paste") {
      const copied=await withNSETextCancellation(this.#options.clipboard!.read(signal),signal);
      const content=parseNSETextClipboardPayload(copied).content;return replace(resolve().range,content,"Paste");
    }
    if(command==="text.insert") return replace(resolve().range,plainNSETextContent(value as string,session.getSnapshot().typingAttributes));
    if(command==="text.replace") {const replacement=value as {range:NSETextRange;content:NSEAttributedContent};return replace(replacement.range,replacement.content,"Replace");}
    if(command==="text.deleteBackward" || command==="text.deleteForward") {
      const selected=resolve().range;const range=selected.length ? selected : nseGraphemeDeletionRange(session.getSnapshot().model.text,selected.location,command==="text.deleteBackward" ? "backward" : "forward");
      return range.length ? replace(range,plainNSETextContent(""),"Delete") : null;
    }
    if(command==="text.applyAttributes") return session.applyAttributes(value as NSEAttributedTextAttributes,target);
    if(command==="text.removeAttributes") return session.removeAttributes(value as readonly (keyof NSEAttributedTextAttributes)[],target);
    const structure=(operations:ReturnType<typeof nseListLevelOperations>)=>operations.length ? session.commit(operations,target,{actionName:"Paragraph Formatting"}) : null;
    if(command==="text.headerLevel") return structure(nseHeaderLevelOperations(session.getSnapshot().model,resolve().range,value as number));
    if(command==="text.toggleList") return structure(nseToggleListOperations(session.getSnapshot().model,resolve().range,value as NSETextListMarker));
    if(command==="text.listLevel") return structure(nseListLevelOperations(session.getSnapshot().model,resolve().range,value as 1|-1));
    if(command==="text.restartNumbering") return structure(nseRestartNumberingOperations(session.getSnapshot().model,resolve().range));
    if(command==="text.attachmentBounds") {const {range,bounds}=value as {range:NSETextRange;bounds:{width:number;height:number}};resolve();return session.commit(nseAttachmentBoundsOperations(session.getSnapshot().model,range,bounds),target,{actionName:"Resize Image"});}
    if(command==="text.paragraphAttributes") return session.commit([{kind:"paragraph-attributes",range:resolve().range,attributes:value as NSEParagraphAttributes}],target,{actionName:"Paragraph Formatting"});
    const key=command.slice(5) as "bold"|"italic"|"underline"|"strike";return session.applyAttributes({[key]:validation.state!=="on"},target);
  }
  dispose=():void=>{if(this.#lifetime.signal.aborted)return;this.#lifetime.abort(new Error("Text commands revoked."));this.#options.signal?.removeEventListener("abort",this.dispose);this.#unsubscribe();};
}
export interface NSETextScopedCommandsPort {register(declaration:object):{dispose():unknown}}
export function registerNSETextCommands(options:{readonly controller:NSETextCommands;readonly responderId:string;readonly commands:NSETextScopedCommandsPort}):{dispose():void} {
  if(!options.responderId.trim())throw new TypeError("Text commands require a scoped responder identity.");
  const handles:{dispose():unknown}[]=[];
  const dispose=()=>{for(const handle of handles.splice(0))handle.dispose();};
  try {
    for(const id of nseTextCommandIds) handles.push(options.commands.register({id,responderId:options.responderId,scope:"focused",title:{key:`command.${id}`,fallback:id.slice(5)},defaultKeyBindings:[],undo:{kind:"none"},
      payload:{description:"Bounded semantic text payload.",parse(value:unknown){try{return {ok:true,value:parseNSETextCommandPayload(id,value)};}catch(error){return {ok:false,issues:[error instanceof Error ? error.message : "Invalid text payload."]};}}},
      validate({payload}:{payload:unknown}){const state=options.controller.validate(id,payload);return {...state,title:{key:`command.${id}`,fallback:state.title}};},
      execute({payload,signal}:{payload:unknown;signal:AbortSignal}){return options.controller.execute(id,payload,{signal});},
    }));
  } catch(error){dispose();throw error;}
  return Object.freeze({dispose});
}
