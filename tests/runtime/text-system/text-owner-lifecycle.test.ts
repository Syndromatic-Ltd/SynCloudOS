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
import { SynCloudOSLifecycleError } from "../../../src/SynCloudOS/nseRuntimeContracts";
const text=await import("../../../src/NSE/Text/index").catch(()=>null);
const setup=()=>{expect(text?.NSETextStorage).toBeTypeOf("function");return text!;};

it("reads one canonical owner through two facades without losing ownership on view disposal",()=>{
  const t=setup(),owner=t.createInMemoryNSETextOwner({flowId:"shared"});
  const a=new t.NSETextStorage({owner}),b=new t.NSETextStorage({owner});
  let calls=0; b.subscribe(()=>calls++);
  a.replaceCharacters({location:0,length:0},"shared");
  expect(a.getSnapshot()).toBe(owner.getSnapshot()); expect(b.getSnapshot()).toBe(owner.getSnapshot()); expect(calls).toBe(1);
  a.dispose(); a.dispose();
  expect(()=>a.replaceCharacters({location:0,length:0},"bad")).toThrow(SynCloudOSLifecycleError);
  expect(()=>a.replaceCharacters({location:0,length:0},"bad")).toThrow(expect.objectContaining({code:"NSE_TEXT_STORAGE_DISPOSED",operation:"replaceCharacters",disposal:expect.objectContaining({reason:"explicit"})}));
  b.replaceCharacters({location:6,length:0},"!"); expect(owner.getSnapshot().text).toBe("shared!");
  owner.dispose();
  expect(()=>b.replaceCharacters({location:0,length:0},"late")).toThrow(SynCloudOSLifecycleError);
  expect(()=>b.replaceCharacters({location:0,length:0},"late")).toThrow(expect.objectContaining({code:"NSE_TEXT_OWNER_DISPOSED",operation:"getSnapshot"}));
});

it("batches only notifications, rejects reentrant commits, and isolates subscriber failures",()=>{
  const t=setup(),storage=new t.NSETextStorage(); let calls=0;
  storage.subscribe(()=>{calls++; expect(()=>storage.replaceCharacters({location:0,length:0},"reenter")).toThrow(/reentrant|publishing/i);});
  storage.subscribe(()=>{throw new Error("observer failed");});
  storage.beginEditing(); storage.beginEditing();
  storage.replaceCharacters({location:0,length:0},"A"); storage.replaceCharacters({location:1,length:0},"B");
  expect(storage.getSnapshot().text).toBe("AB");expect(calls).toBe(0);
  expect(storage.endEditing()).toBeNull();
  const receipt=storage.endEditing()!; expect(calls).toBe(1); expect(receipt.before.revision).toBe(0);expect(receipt.snapshot.revision).toBe(2);expect(receipt.observerErrors).toHaveLength(1);
  expect(()=>storage.endEditing()).toThrow(/beginEditing|unbalanced/i);
});

it("rejects stale/read-only/invalid requests without notifications or canonical publication",()=>{
  const t=setup(),owner=t.createInMemoryNSETextOwner({editable:false}),storage=new t.NSETextStorage({owner});
  const before=storage.getSnapshot();expect(()=>storage.replaceCharacters({location:0,length:0},"bad")).toThrow(/read.only/i);expect(storage.getSnapshot()).toBe(before);
  const live=t.createInMemoryNSETextOwner();
  expect(()=>live.commit({expectedRevision:1,operations:[]})).toThrow(/stale/i);
  expect(()=>live.commit({expectedRevision:0,expectedGeneration:1,operations:[]})).toThrow(/generation|stale/i);
  let calls=0;live.subscribe(()=>calls++);
  expect(()=>live.commit({expectedRevision:0,operations:[{kind:"apply-attributes",range:{location:0,length:0},attributes:{script:()=>0}} as never]})).toThrow();
  expect(live.getSnapshot().revision).toBe(0);expect(calls).toBe(0);
});

it("adapts a caller's native model without a second canonical mirror",()=>{
  const t=setup(); let model={title:"Native",flow:t.attributedContent([t.paragraph([t.textRun("first")])]),otherFlow:"keep"};let revision=0;
  let canonical=t.createNSETextSnapshot(model.flow,"native",revision,7);
  const observers=new Set<(receipt:import("../../../src/NSE/Text").NSETextChangeReceipt)=>void>();
  const owner:import("../../../src/NSE/Text").NSETextOwner={
    getSnapshot:()=>canonical,
    subscribe(listener){observers.add(listener);return()=>observers.delete(listener);},
    commit(request){
      if(request.expectedRevision!==revision || request.expectedGeneration!==7) throw new Error("stale");
      const receipt=t.applyNSETextOperations(canonical,request.operations);
      model={...model,flow:receipt.snapshot.attributedContent};revision=receipt.snapshot.revision;canonical=receipt.snapshot;
      for(const listener of observers) listener(receipt);
      return receipt;
    },
  };
  const first=new t.NSETextStorage({owner}),second=new t.NSETextStorage({owner});
  first.replaceCharacters({location:0,length:5},"next");
  expect(model).toMatchObject({title:"Native",otherFlow:"keep"});expect(second.getSnapshot()).toBe(canonical);
  const receipt=t.applyNSETextOperations(canonical,[{kind:"replace",range:{location:4,length:0},content:t.plainNSETextContent("!")}]);
  canonical=receipt.snapshot;model={...model,flow:canonical.attributedContent};revision=canonical.revision;
  for(const observer of observers) observer(receipt);
  expect(first.getSnapshot().text).toBe("next!");expect(second.getSnapshot()).toBe(first.getSnapshot());
  first.dispose();expect(observers.size).toBe(1);second.dispose();expect(observers.size).toBe(0);expect(model.otherFlow).toBe("keep");
});

it("fences replacement standalone owners even when flow and revision coincide",()=>{
  const t=setup(),oldOwner=t.createInMemoryNSETextOwner({flowId:"same"});
  const oldPosition=t.createNSETextPosition(oldOwner.getSnapshot(),0);oldOwner.dispose();
  const replacement=t.createInMemoryNSETextOwner({flowId:"same"});
  const storage=new t.NSETextStorage({owner:replacement});
  const receipt=storage.replaceCharacters({location:0,length:0},"new");
  expect(receipt.changeMap.map(oldPosition)).toBeNull();
});

it("rejects accessors on commit requests without executing them",()=>{
  const t=setup(),owner=t.createInMemoryNSETextOwner();let called=0;
  const request={operations:[]};Object.defineProperty(request,"expectedRevision",{enumerable:true,get(){called++;return 0;}});
  expect(()=>owner.commit(request as never)).toThrow(/accessor|data propert/i);
  expect(called).toBe(0);expect(owner.getSnapshot().revision).toBe(0);
});
it("admits bounded semantic action metadata without acquiring a history authority",()=>{
  const t=setup(),owner=t.createInMemoryNSETextOwner();const before=owner.getSnapshot();
  const receipt=owner.commit({expectedRevision:before.revision,actionName:"Typing",coalescingKey:"session:one",operations:[{kind:"replace",range:{location:0,length:0},content:t.plainNSETextContent("a")}]});
  expect(receipt.snapshot.text).toBe("a");
  expect(()=>owner.commit({expectedRevision:receipt.snapshot.revision,actionName:"x".repeat(257),operations:[]})).toThrow(/metadata|actionName/i);
});

it("exposes an owner lifetime signal and aborts it exactly once on disposal",()=>{
  const t=setup(),owner=t.createInMemoryNSETextOwner();
  expect(owner.signal).toBeInstanceOf(AbortSignal);let aborted=0;
  owner.signal!.addEventListener("abort",()=>{aborted++;expect(()=>owner.getSnapshot()).toThrow(SynCloudOSLifecycleError);});
  expect(owner.signal!.aborted).toBe(false);owner.dispose();owner.dispose();expect(owner.signal!.aborted).toBe(true);expect(aborted).toBe(1);
});

it("identifies each disposed storage and owner operation",()=>{
  const t=setup(),storage=new t.NSETextStorage({flowId:"body"}),owner=t.createInMemoryNSETextOwner({flowId:"owner"});
  storage.dispose();owner.dispose();
  const storageActions:Record<string,()=>unknown>={
    getSnapshot:()=>storage.getSnapshot(),subscribe:()=>storage.subscribe(()=>{}),commit:()=>storage.commit([]),
    replaceCharacters:()=>storage.replaceCharacters({location:0,length:0},"x"),
    applyAttributes:()=>storage.applyAttributes({location:0,length:0},{}),
    removeAttributes:()=>storage.removeAttributes({location:0,length:0},[]),
    setParagraphAttributes:()=>storage.setParagraphAttributes({location:0,length:0},{}),
    read:()=>storage.read({location:0,length:0}),beginEditing:()=>storage.beginEditing(),endEditing:()=>storage.endEditing(),
  };
  for(const [operation,action] of Object.entries(storageActions)){
    expect(action).toThrow(SynCloudOSLifecycleError);
    expect(action).toThrow(expect.objectContaining({code:"NSE_TEXT_STORAGE_DISPOSED",operation}));
  }
  for(const [operation,action] of Object.entries({getSnapshot:()=>owner.getSnapshot(),subscribe:()=>owner.subscribe(()=>{}),commit:()=>owner.commit({expectedRevision:0,operations:[]})})){
    expect(action).toThrow(SynCloudOSLifecycleError);
    expect(action).toThrow(expect.objectContaining({code:"NSE_TEXT_OWNER_DISPOSED",operation}));
  }
  expect(owner.signal!.reason).toBeInstanceOf(SynCloudOSLifecycleError);
  expect(owner.signal!.reason).toMatchObject({code:"NSE_TEXT_OWNER_DISPOSED",operation:"dispose",disposal:{reason:"explicit"}});
});
