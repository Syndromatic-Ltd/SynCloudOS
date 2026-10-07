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
import { createInMemoryNSETextOwner,plainNSETextContent,textRun,paragraph,attributedContent } from "../../../src/NSE/Text";
import { TextEditingSession } from "../../../src/NSE/TextEditing/TextEditingSession";
const api=await import("../../../src/NSE/TextEditing/textCommands").catch(()=>null);
const setup=()=>{expect(api?.NSETextCommands).toBeTypeOf("function");const owner=createInMemoryNSETextOwner({content:attributedContent([paragraph([textRun("ab",{bold:true}),textRun("cd")])])});const session=new TextEditingSession({id:"commands",owner});return {owner,session,api:api!};};

it("aggregates mixed toggle state and formats a collapsed typing target without canonical mutation",async()=>{
  const {session,owner,api}=setup(),commands=new api.NSETextCommands({session});session.select(0,4);
  expect(commands.validate("text.bold").state).toBe("mixed");
  await commands.execute("text.bold");expect(owner.getSnapshot().revision).toBe(1);expect(commands.validate("text.bold").state).toBe("on");
  session.select(1);await commands.execute("text.italic");expect(session.getSnapshot().typingAttributes.italic).toBe(true);expect(owner.getSnapshot().revision).toBe(1);
  session.setEditable(false);expect(commands.validate("text.bold").enabled).toBe(false);
});
it("leaves content intact when cut fails and commits a successful cut only after clipboard completion",async()=>{
  const {session,owner,api}=setup();session.select(0,2);
  const failed=new api.NSETextCommands({session,clipboard:{read:async()=>({}),write:async()=>{throw new Error("clipboard denied");}}});
  await expect(failed.execute("text.cut")).rejects.toThrow(/clipboard denied/);expect(owner.getSnapshot().text).toBe("abcd");
  let copied:any;const good=new api.NSETextCommands({session,clipboard:{read:async()=>({}),write:async payload=>{copied=payload;}}});
  await good.execute("text.cut");expect(copied["text/plain"]).toBe("ab");expect(owner.getSnapshot().text).toBe("cd");expect(owner.getSnapshot().revision).toBe(1);
});
it("rejects malicious attributed paste and revoked or cancelled asynchronous targets",async()=>{
  const {session,owner,api}=setup();session.select(1,3);
  let resolve!:(payload:Readonly<Record<string,string>>)=>void;
  const commands=new api.NSETextCommands({session,clipboard:{read:()=>new Promise(done=>resolve=done),write:async()=>{}}});
  const pending=commands.execute("text.paste");session.select(0);resolve({"text/plain":"BAD"});
  await expect(pending).rejects.toThrow(/stale|revoked/);expect(owner.getSnapshot().text).toBe("abcd");
  const malicious=new api.NSETextCommands({session,clipboard:{read:async()=>({"application/x-syncloudos-attributed-content+json":JSON.stringify({type:"nse-attributed-content",version:1,blocks:[{kind:"paragraph",runs:[],script:"bad"}]})}),write:async()=>{}}});
  await expect(malicious.execute("text.paste")).rejects.toThrow(/unsupported/);expect(owner.getSnapshot().revision).toBe(0);
  const abort=new AbortController();abort.abort();await expect(commands.execute("text.insert","x",{signal:abort.signal})).rejects.toThrow();
});
it("registers scoped payload validation and routes history without a second undo registration",async()=>{
  const {session,api}=setup();let undo=0;const historySession=new TextEditingSession({id:"history",owner:createInMemoryNSETextOwner(),history:{undo(){undo++;},redo(){}}});
  const controller=new api.NSETextCommands({session:historySession,historyPresentation:()=>({canUndo:true,canRedo:false,undoTitle:"Undo Typing"})});
  expect(controller.validate("text.undo").title).toBe("Undo Typing");await controller.execute("text.undo");expect(undo).toBe(1);
  const registrations:any[]=[];let disposed=0;const handle=api.registerNSETextCommands({controller,responderId:"responder:text",commands:{register(declaration){registrations.push(declaration);return {dispose(){disposed++;}};}}});
  expect(registrations.every(item=>item.undo.kind==="none")).toBe(true);expect(registrations.find(item=>item.id==="text.insert").payload.parse({script:1}).ok).toBe(false);
  handle.dispose();expect(disposed).toBe(registrations.length);
  const copy=new api.NSETextCommands({session});session.setMarkedText("draft");expect(copy.validate("text.cut").enabled).toBe(false);
});

it("cancels pending clipboard reads when the captured session is disposed",async()=>{
  const {session,owner,api}=setup();let providerSignal:AbortSignal|undefined;
  const commands=new api.NSETextCommands({session,clipboard:{read(signal){providerSignal=signal;return new Promise(()=>{});},write:async()=>{}}});
  const pending=commands.execute("text.paste");session.dispose();
  expect(providerSignal!.aborted).toBe(true);await expect(pending).rejects.toThrow(/revoked|disposed/);expect(owner.getSnapshot().revision).toBe(0);
});

it("remaps captured paste targets after an unrelated same-owner insertion",async()=>{
  const {session,owner,api}=setup();session.select(2,4);let resolve!:(payload:Readonly<Record<string,string>>)=>void;
  const commands=new api.NSETextCommands({session,clipboard:{read:()=>new Promise(done=>resolve=done),write:async()=>{}}});
  const pending=commands.execute("text.paste");const before=owner.getSnapshot();owner.commit({expectedRevision:before.revision,operations:[{kind:"replace",range:{location:0,length:0},content:plainNSETextContent("prefix ")} ]});
  resolve({"text/plain":"X"});await pending;expect(owner.getSnapshot().text).toBe("prefix abX");expect(owner.getSnapshot().revision).toBe(2);
});

it("admits cut/paste as one named action through the existing standalone document history route",async()=>{
  const {api}=setup();const {createUndoableNSETextOwner}=await import("../../../src/NSE/TextEditing/standaloneTextHistory");
  const owner=createUndoableNSETextOwner({content:plainNSETextContent("word")}),session=new TextEditingSession({id:"named",owner,history:owner.history});session.select(0,4);
  const commands=new api.NSETextCommands({session,historyPresentation:()=>owner.history.getSnapshot(),clipboard:{read:async()=>({"text/plain":"new"}),write:async()=>{}}});
  await commands.execute("text.cut");expect(owner.history.getSnapshot().undoTitle).toMatch(/Cut/);await commands.execute("text.undo");expect(owner.getSnapshot().text).toBe("word");
  session.select(0,4);await commands.execute("text.paste");expect(owner.getSnapshot().text).toBe("new");expect(owner.history.getSnapshot().undoTitle).toMatch(/Paste/);await commands.execute("text.undo");expect(owner.getSnapshot().text).toBe("word");
  commands.dispose();session.dispose();owner.dispose();
});
