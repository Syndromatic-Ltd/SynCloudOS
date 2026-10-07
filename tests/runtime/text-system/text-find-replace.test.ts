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
const api=await import("../../../src/NSE/TextEditing/textFind").catch(()=>null);
it("finds Unicode word matches with UTF-16 ranges and replaces all in one canonical commit",()=>{
  expect(api?.findNSEText).toBeTypeOf("function");const owner=createInMemoryNSETextOwner({content:plainNSETextContent("😀 Café café cafeteria")}),session=new TextEditingSession({id:"find",owner});
  const result=api!.findNSEText(owner.getSnapshot(),"café",{wholeWord:true});expect(result.matches).toEqual([{location:3,length:4},{location:8,length:4}]);
  let changes=0;owner.subscribe(()=>changes++);api!.replaceAllNSEText(session,result,"tea");expect(owner.getSnapshot().text).toBe("😀 tea tea cafeteria");expect(changes).toBe(1);expect(owner.getSnapshot().revision).toBe(1);
});
it("rejects stale search results/cancellation and preserves owner state",()=>{
  expect(api?.findNSEText).toBeTypeOf("function");const owner=createInMemoryNSETextOwner({content:plainNSETextContent("one one")}),session=new TextEditingSession({id:"find",owner});
  const result=api!.findNSEText(owner.getSnapshot(),"one");session.insertText("prefix ",{location:0,length:0});
  expect(()=>api!.replaceAllNSEText(session,result,"two")).toThrow(/stale/);expect(owner.getSnapshot().text).toBe("prefix one one");
  const abort=new AbortController();abort.abort();expect(()=>api!.findNSEText(owner.getSnapshot(),"one",{signal:abort.signal})).toThrow();
});
