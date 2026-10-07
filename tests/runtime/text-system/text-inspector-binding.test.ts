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

import { expect,it } from "vitest";
import { createInMemoryNSETextOwner,plainNSETextContent } from "../../../src/NSE/Text";
import { TextEditingSession } from "../../../src/NSE/TextEditing/TextEditingSession";
const api=await import("../../../src/NSE/TextEditing/textInspectorBinding").catch(()=>null);
const setup=()=>{expect(api?.NSETextInspectorBinding).toBeTypeOf("function");const owner=createInMemoryNSETextOwner({content:plainNSETextContent("word")}),session=new TextEditingSession({id:"inspector",owner,documentId:"doc:one"});session.select(0,4);return {owner,session,binding:new api!.NSETextInspectorBinding({session,id:"size"})};};
it("retains invalid drafts, previews without commits, and applies one validated field change with no local undo",async()=>{
  const {owner,session,binding}=setup();binding.begin(12);binding.preview(20);expect(owner.getSnapshot().revision).toBe(0);
  const invalid=await binding.commit(()=>{throw new Error("should not apply");},()=>[{code:"bad",message:"Bad size"}]);expect(invalid.status).toBe("invalid");expect(binding.controller.getSnapshot().draft).toEqual({value:20});expect(binding.controller.getSnapshot().issues[0]?.code).toBe("bad");
  const result=await binding.commit((value,target)=>session.applyAttributes({font:{familyId:"prelude",size:value as number}},target));expect(result.status).toBe("committed");expect(result.controller.undoActionId).toBeNull();expect(owner.getSnapshot().revision).toBe(1);
});

it("exposes only field draft observation and keeps responder/history authority private",()=>{
  const {binding}=setup();expect(binding.controller).not.toHaveProperty("attachResponder");expect(binding.controller).not.toHaveProperty("beginEditing");expect(binding.controller).not.toHaveProperty("commitEditing");expect(binding.controller.getSnapshot).toBeTypeOf("function");expect(binding.controller.subscribe).toBeTypeOf("function");
});
it("Escape/disposal cancels pending validation and keeps canonical content intact",async()=>{
  const {owner,session,binding}=setup();binding.begin(12);binding.setDraft(25);let resolve!:(issues:readonly any[])=>void;
  const pending=binding.commit((value,target)=>session.applyAttributes({bold:true},target),()=>new Promise(done=>resolve=done));binding.cancel();resolve([]);
  await expect(pending).rejects.toThrow(/cancel|revoked/);expect(owner.getSnapshot().revision).toBe(0);
  binding.begin(14);session.select(1);await expect(binding.commit((value,target)=>session.applyAttributes({bold:true},target))).rejects.toThrow(/stale|revoked/);
});

it("revokes pending field validation immediately when its selection target changes",async()=>{
  const {owner,session,binding}=setup();binding.begin(20);let validationSignal:AbortSignal|undefined;
  const pending=binding.commit(()=>{throw new Error("cannot apply");},(value,signal)=>{validationSignal=signal;return new Promise(()=>{});});
  session.select(1);expect(validationSignal!.aborted).toBe(true);await expect(pending).rejects.toThrow(/stale|revoked/);expect(owner.getSnapshot().revision).toBe(0);expect(binding.controller.getSnapshot().draft).toEqual({value:20});
});
