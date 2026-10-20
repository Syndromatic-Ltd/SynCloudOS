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
const api=await import("../../../src/NSE/TextEditing/textTypographyAdapter").catch(()=>null);
it("formats a retained semantic target while another window independently selects its flow",()=>{
  expect(api?.NSETextTypographyAdapter).toBeTypeOf("function");const owner=createInMemoryNSETextOwner({content:plainNSETextContent("words")});const a=new TextEditingSession({id:"a",textOwner:owner}),b=new TextEditingSession({id:"b",textOwner:owner});a.select(0,2);const target=a.captureTarget();b.select(3,5);
  const adapter=new api!.NSETextTypographyAdapter({session:a});adapter.colour("#33669980",target);expect(owner.getSnapshot().attributedContent.blocks[0].runs[0].attributes).toEqual({foregroundColour:"#33669980"});adapter.colour(null,target);expect(owner.getSnapshot().attributedContent.blocks[0].runs[0].attributes).toBeUndefined();adapter.baseline("superscript",target);expect(adapter.aggregate(target).character.baseline).toEqual({state:"uniform",value:"superscript"});
});
it("revalidates font readiness and target after acquisition without writing a fallback into content",async()=>{
  expect(api?.NSETextTypographyAdapter).toBeTypeOf("function");const owner=createInMemoryNSETextOwner({content:plainNSETextContent("words")}),session=new TextEditingSession({id:"font",textOwner:owner});session.select(0,5);let ready=false;let generation=0;const adapter=new api!.NSETextTypographyAdapter({session,isFontAvailable:()=>ready,fontGeneration:()=>generation});
  expect(()=>adapter.font({familyId:"missing",size:12})).toThrow(/unavailable/);let resolve!:()=>void;const pending=adapter.acquireFont({familyId:"missing",size:12},()=>new Promise(done=>resolve=done));session.select(0);ready=true;generation++;resolve();await expect(pending).rejects.toThrow(/stale|revoked/);expect(owner.getSnapshot().revision).toBe(0);
  session.select(0,5);await adapter.acquireFont({familyId:"missing",size:12},async()=>{});expect(owner.getSnapshot().revision).toBe(1);
});

it("cancels pending font acquisition when its semantic target is revoked",async()=>{
  expect(api?.NSETextTypographyAdapter).toBeTypeOf("function");const owner=createInMemoryNSETextOwner({content:plainNSETextContent("words")}),session=new TextEditingSession({id:"font-cancel",textOwner:owner});session.select(0,5);
  const adapter=new api!.NSETextTypographyAdapter({session});let acquisitionSignal:AbortSignal|undefined;
  const pending=adapter.acquireFont({familyId:"prelude"},signal=>{acquisitionSignal=signal;return new Promise(()=>{});});session.dispose();
  expect(acquisitionSignal!.aborted).toBe(true);await expect(pending).rejects.toThrow(/stale|revoked/);expect(owner.getSnapshot().revision).toBe(0);
});

it("aggregates and scrubs font size across different faces in one formatting commit",async()=>{
  expect(api?.NSETextTypographyAdapter).toBeTypeOf("function");
  const text=await import("../../../src/NSE/Text");
  const owner=createInMemoryNSETextOwner({content:text.attributedContent([text.paragraph([text.textRun("ab",{font:{familyId:"one",size:12}}),text.textRun("cd",{font:{familyId:"two",face:"Italic",size:16}})])])}),session=new TextEditingSession({id:"size",textOwner:owner});session.select(0,4);
  const adapter=new api!.NSETextTypographyAdapter({session});expect(adapter.aggregate().fontSize).toEqual({state:"mixed"});
  adapter.fontSize(18,{units:"pt"});expect(owner.getSnapshot().revision).toBe(1);
  expect(owner.getSnapshot().attributedContent.blocks[0].runs.map(run=>run.kind==="text" ? run.attributes?.font : null)).toEqual([{familyId:"one",size:24},{familyId:"two",face:"Italic",size:24}]);
  expect(adapter.aggregate().fontSize).toEqual({state:"uniform",value:24});
});

it("retains the exact requested font intent while acquisition awaits",async()=>{
  expect(api?.NSETextTypographyAdapter).toBeTypeOf("function");const owner=createInMemoryNSETextOwner({content:plainNSETextContent("words")}),session=new TextEditingSession({id:"font-intent",textOwner:owner});session.select(0,5);
  const adapter=new api!.NSETextTypographyAdapter({session});const font={familyId:"original",size:12};let resolve!:()=>void;
  const pending=adapter.acquireFont(font,()=>new Promise(done=>resolve=done));font.familyId="changed";font.size=48;resolve();await pending;
  expect(owner.getSnapshot().attributedContent.blocks[0].runs[0].attributes?.font).toEqual({familyId:"original",size:12});
});
