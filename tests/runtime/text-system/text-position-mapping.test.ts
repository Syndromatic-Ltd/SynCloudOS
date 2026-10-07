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
const text=await import("../../../src/NSE/Text/index").catch(()=>null);
const setup=()=>{expect(text?.NSETextStorage).toBeTypeOf("function");return new text!.NSETextStorage({flowId:"flow:one"});};

it("keeps insertion gravity independent of bidi affinity and rejects stale/invalid/deleted positions",()=>{
  const storage=setup(); storage.replaceCharacters({location:0,length:0},"abc\ndef");
  const before=storage.getSnapshot();
  const left=text!.createNSETextPosition(before,1,{gravity:"before",affinity:"downstream"});
  const right=text!.createNSETextPosition(before,1,{gravity:"after",affinity:"upstream"});
  const receipt=storage.replaceCharacters({location:1,length:0},"XY");
  expect(receipt.changeMap.map(left)).toMatchObject({offset:1,affinity:"downstream",revision:2});
  expect(receipt.changeMap.map(right)).toMatchObject({offset:3,affinity:"upstream",revision:2});
  expect(receipt.changeMap.map({...left,revision:0})).toBeNull();
  expect(receipt.changeMap.map({...left,flowId:"other"})).toBeNull();
  expect(receipt.changeMap.map({...left,offset:NaN})).toBeNull();
  expect(receipt.changeMap.map({...left,ownerGeneration:999})).toBeNull();
  const bookmark=text!.createNSETextBookmark(storage.getSnapshot(),{location:6,length:3});
  const deleted=storage.replaceCharacters({location:5,length:4},"");
  expect(text!.mapNSETextBookmark(bookmark,deleted.changeMap)).toBeNull();
});

it("maps sequential edits and inverse surviving positions without reviving deleted targets",()=>{
  const storage=setup(); storage.replaceCharacters({location:0,length:0},"abcd");
  const before=storage.getSnapshot(), end=text!.createNSETextPosition(before,4);
  storage.beginEditing(); storage.replaceCharacters({location:0,length:0},"X"); storage.replaceCharacters({location:2,length:1},"");
  const receipt=storage.endEditing()!;
  expect(receipt.changeMap.map(end)).toMatchObject({offset:4});
  const mapped=receipt.changeMap.map(end)!;
  expect(receipt.changeMap.inverse().map(mapped)).toEqual(end);
  expect(receipt.changeMap.map(text!.createNSETextPosition(before,2))).toMatchObject({offset:2});
});

it("does not remap targets through a no-op canonical replacement",()=>{
  const storage=setup();storage.replaceCharacters({location:0,length:0},"abc");
  const before=storage.getSnapshot(),position=text!.createNSETextPosition(before,1);
  const receipt=storage.replaceCharacters({location:0,length:3},before.attributedContent);
  expect(receipt.snapshot).toBe(before);
  expect(receipt.changeMap.map(position)).toEqual(position);
});

it("rejects a noncollapsed bookmark completely deleted at its exact boundaries",()=>{
  const storage=setup();storage.replaceCharacters({location:0,length:0},"abc");
  const before=storage.getSnapshot(),bookmark=text!.createNSETextBookmark(before,{location:0,length:3});
  const receipt=storage.replaceCharacters({location:0,length:3},"");
  expect(text!.mapNSETextBookmark(bookmark,receipt.changeMap)).toBeNull();
  expect(receipt.changeMap.mapRange({location:0,length:3},before.revision)).toBeNull();
});
