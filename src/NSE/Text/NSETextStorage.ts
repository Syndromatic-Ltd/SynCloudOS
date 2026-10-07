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

import { composeNSETextChangeMaps } from "./textChanges";
import { createInMemoryNSETextOwner, type NSETextOwner, type NSETextChangeReceipt } from "./textOwner";
import { inheritedNSETextAttributes, plainNSETextContent, readNSETextContent } from "./textOperations";
import type { NSEAttributedContent, NSETextRange, NSETextEditOperation, NSEAttributedTextAttributes } from "./textTypes";
import type { NSEParagraphAttributes } from "./paragraphAttributes";

export interface NSETextStorageOptions { readonly owner?: NSETextOwner; readonly content?: NSEAttributedContent; readonly flowId?: string }

/** A view of canonical owner state, never an authoritative mutable mirror. */
export class NSETextStorage {
  readonly #owner:NSETextOwner;
  readonly #ownsOwner:boolean;
  readonly #unsubscribe:()=>void;
  readonly #listeners=new Set<(receipt:NSETextChangeReceipt)=>void>();
  #disposed=false;
  #publishing=false;
  #editingDepth=0;
  #pending:NSETextChangeReceipt|null=null;
  #lastPublished:NSETextChangeReceipt|null=null;

  constructor(options:NSETextStorageOptions={}) {
    if(options.owner && (options.content!==undefined || options.flowId!==undefined)) throw new TypeError("An injected owner supplies its own content and flow identity.");
    this.#ownsOwner=!options.owner;
    this.#owner=options.owner ?? createInMemoryNSETextOwner(options);
    this.#unsubscribe=this.#owner.subscribe(receipt=>{
      if(this.#disposed) return;
      if(this.#editingDepth) this.#pending=this.#pending ? this.#merge(this.#pending,receipt) : receipt;
      else this.#lastPublished=this.#publish(receipt);
    });
  }
  #assertLive():void { if(this.#disposed) throw new Error("Text storage is disposed."); }
  #merge(a:NSETextChangeReceipt,b:NSETextChangeReceipt):NSETextChangeReceipt {
    return Object.freeze({before:a.before,snapshot:b.snapshot,changeMap:composeNSETextChangeMaps(a.changeMap,b.changeMap),operations:Object.freeze([...a.operations,...b.operations]),observerErrors:Object.freeze([...a.observerErrors,...b.observerErrors])});
  }
  #publish(receipt:NSETextChangeReceipt):NSETextChangeReceipt {
    const errors=[...receipt.observerErrors]; this.#publishing=true;
    try {
      for(const listener of [...this.#listeners]) {
        if(!this.#listeners.has(listener)) continue;
        try { listener(receipt); } catch(error) { errors.push(error); }
      }
    } finally { this.#publishing=false; }
    return errors.length ? Object.freeze({...receipt,observerErrors:Object.freeze(errors)}) : receipt;
  }
  getSnapshot=()=>{this.#assertLive();return this.#owner.getSnapshot();};
  subscribe=(listener:(receipt:NSETextChangeReceipt)=>void):(()=>void)=>{this.#assertLive();this.#listeners.add(listener);return()=>{this.#listeners.delete(listener);};};
  commit(operations:readonly NSETextEditOperation[]):NSETextChangeReceipt {
    this.#assertLive(); if(this.#publishing) throw new Error("Reentrant text commit during publishing is forbidden.");
    const before=this.#owner.getSnapshot(); this.#lastPublished=null;
    const receipt=this.#owner.commit({expectedRevision:before.revision,expectedGeneration:before.ownerGeneration,operations});
    const published=this.#lastPublished as NSETextChangeReceipt|null;
    return published ? Object.freeze({...published,observerErrors:Object.freeze([...published.observerErrors,...receipt.observerErrors])}) : receipt;
  }
  replaceCharacters(range:NSETextRange,value:string|NSEAttributedContent,attributes?:NSEAttributedTextAttributes):NSETextChangeReceipt {
    const content=typeof value==="string" ? plainNSETextContent(value,attributes ?? inheritedNSETextAttributes(this.getSnapshot(),range.location)) : value;
    return this.commit([{kind:"replace",range,content}]);
  }
  applyAttributes(range:NSETextRange,attributes:NSEAttributedTextAttributes):NSETextChangeReceipt {return this.commit([{kind:"apply-attributes",range,attributes}]);}
  removeAttributes(range:NSETextRange,keys:readonly (keyof NSEAttributedTextAttributes)[]):NSETextChangeReceipt {return this.commit([{kind:"remove-attributes",range,keys}]);}
  setParagraphAttributes(range:NSETextRange,attributes:NSEParagraphAttributes,remove?:readonly (keyof NSEParagraphAttributes)[]):NSETextChangeReceipt {return this.commit([{kind:"paragraph-attributes",range,attributes,...(remove ? {remove} : {})}]);}
  read(range:NSETextRange):NSEAttributedContent {return readNSETextContent(this.getSnapshot(),range);}
  beginEditing():void {this.#assertLive();this.#editingDepth++;}
  endEditing():NSETextChangeReceipt|null {
    this.#assertLive(); if(!this.#editingDepth) throw new Error("Unbalanced endEditing: call beginEditing first.");
    if(--this.#editingDepth) return null;
    const receipt=this.#pending;this.#pending=null;
    return receipt ? this.#publish(receipt) : null;
  }
  dispose():void {
    if(this.#disposed) return;
    this.#disposed=true;this.#unsubscribe();this.#listeners.clear();this.#pending=null;
    if(this.#ownsOwner) (this.#owner as ReturnType<typeof createInMemoryNSETextOwner>).dispose();
  }
}
