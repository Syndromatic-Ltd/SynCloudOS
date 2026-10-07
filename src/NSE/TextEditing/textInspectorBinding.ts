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

import { NSEObjectController } from "../Controllers/NSEObjectController";
import type { ControllerValidationIssue, ControllerCommitResult } from "../Controllers/NSEController";
import { canonicalNSETextData } from "../Text";
import { withNSETextCancellation } from "./textClipboard";
import type { TextEditingSession } from "./TextEditingSession";
import type { NSETextSelectionTarget } from "./textSessionTypes";

export interface NSETextInspectorDraftSnapshot {
  readonly revision:number;readonly content:{readonly value:unknown};readonly draft:{readonly value:unknown}|null;
  readonly editable:boolean;readonly issues:readonly ControllerValidationIssue[];
}
export interface NSETextInspectorDraftController {
  getSnapshot():NSETextInspectorDraftSnapshot;
  subscribe(listener:()=>void):()=>void;
}
export class NSETextInspectorBinding {
  readonly controller:NSETextInspectorDraftController;
  readonly #draftController:NSEObjectController<{value:unknown}>;
  readonly #session:TextEditingSession;
  #target:NSETextSelectionTarget|null=null;
  #generation=0;
  #disposed=false;
  #pending:AbortController|null=null;
  #issues:readonly ControllerValidationIssue[]=Object.freeze([]);
  #committing=false;
  constructor(options:{readonly session:TextEditingSession;readonly id:string}) {
    this.#session=options.session;
    this.#draftController=new NSEObjectController<{value:unknown}>({id:`text-inspector:${options.id}`,content:{value:null},fields:{value:{read:content=>content.value,write:(content,value)=>({...content,value}),validate:()=>this.#issues}}});
    this.controller=Object.freeze({getSnapshot:this.#draftController.getSnapshot,subscribe:(listener:()=>void)=>this.#draftController.subscribe(listener)});
  }
  get issues():readonly ControllerValidationIssue[]{return this.#issues;}
  #assertLive():void{if(this.#disposed)throw new Error("Text inspector is revoked.");}
  begin(initial:unknown=null):void {
    this.#assertLive();this.cancel();const state=this.#session.getSnapshot();if(!state.editable || state.disposed || state.marked)throw new Error("Text inspector target is unavailable.");
    this.#target=this.#session.captureTarget();
    this.#draftController.beginEditing({id:`${this.#draftController.id}:${this.#generation}`,actionName:"Formatting"});
    this.#draftController.setField("value",canonicalNSETextData(initial,"Inspector initial value"));
  }
  setDraft(value:unknown):boolean {
    this.#assertLive();if(!this.#target)throw new Error("Begin editing the text inspector first.");
    this.#generation++;this.#pending?.abort(new Error("Text inspector draft changed."));this.#pending=null;this.#issues=Object.freeze([]);
    return this.#draftController.setField("value",canonicalNSETextData(value,"Inspector draft"));
  }
  preview(value:unknown):boolean{return this.setDraft(value);}
  async commit(apply:(value:unknown,target:NSETextSelectionTarget)=>unknown,validate?:(value:unknown,signal:AbortSignal)=>Promise<readonly ControllerValidationIssue[]>|readonly ControllerValidationIssue[]):Promise<{readonly status:"invalid";readonly issues:readonly ControllerValidationIssue[]}|{readonly status:"committed";readonly controller:ControllerCommitResult;readonly result:unknown}> {
    this.#assertLive();if(this.#committing)throw new Error("Text inspector commitment is already in progress.");
    if(!this.#target)throw new Error("Text inspector has no retained target.");
    const target=this.#target,generation=this.#generation,draft=this.controller.getSnapshot().draft;if(!draft)throw new Error("Text inspector has no draft.");
    const cancellation=new AbortController();this.#pending=cancellation;this.#committing=true;
    const unsubscribe=this.#session.subscribe(()=>{if(!this.#session.resolveTarget(target))cancellation.abort(new Error("Text inspector target is stale or revoked."));});
    try {
      const issues=validate ? await withNSETextCancellation(Promise.resolve(validate(draft.value,cancellation.signal)),cancellation.signal) : [];
      cancellation.signal.throwIfAborted();this.#assertLive();
      if(generation!==this.#generation || this.#target!==target)throw new Error("Text inspector operation was cancelled or revoked.");
      const resolved=this.#session.resolveTarget(target);if(!resolved)throw new Error("Text inspector target is stale or revoked.");
      if(issues.length){this.#issues=Object.freeze(issues.map(issue=>Object.freeze({...issue})));this.#draftController.setField("value",draft.value);return Object.freeze({status:"invalid",issues:this.#issues});}
      this.#issues=Object.freeze([]);this.#draftController.setField("value",draft.value);
      // apply must synchronously admit one canonical semantic action. Async preparation is validation above.
      const result=apply(draft.value,resolved);
      const controller=this.#draftController.commitEditing();this.#target=null;this.#issues=Object.freeze([]);
      return Object.freeze({status:"committed",controller,result});
    }finally {unsubscribe();if(this.#pending===cancellation)this.#pending=null;this.#committing=false;}
  }
  cancel():void {
    this.#generation++;this.#pending?.abort(new Error("Text inspector operation cancelled."));this.#pending=null;this.#target=null;this.#issues=Object.freeze([]);this.#draftController.discardEditing();
  }
  dispose():void {if(this.#disposed)return;this.cancel();this.#disposed=true;this.#draftController.dispose();}
}
