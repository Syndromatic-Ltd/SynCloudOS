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

import { describe, expect, it } from "vitest";
import { attributedContent, paragraph, textRun, attachmentRun } from "../../../src/NSE/Text";
import * as text from "../../../src/NSE/Text";
const setup=()=>{expect(text?.NSETextStorage).toBeTypeOf("function");return new text!.NSETextStorage({flowId:"main",content:attributedContent([paragraph([textRun("ab",{bold:true}),textRun("cd",{italic:true})],{alignment:"centre"}),paragraph([textRun("EF")]),paragraph([])])});};

describe("owner-backed storage",()=>{
  it("replaces across runs/paragraphs and preserves left paragraph and surviving attributes",()=>{
    const storage=setup(); const before=storage.getSnapshot();
    const receipt=storage.replaceCharacters({location:1,length:5},"X\nY");
    expect(before.text).toBe("abcd\nEF\n");
    expect(receipt.snapshot.text).toBe("aX\nYF\n");
    expect(receipt.snapshot.attributedContent.blocks[0].attributes).toEqual({alignment:"centre"});
    expect(receipt.snapshot.attributedContent.blocks[1].runs).toEqual([textRun("Y",{bold:true}),textRun("F")]);
    expect(storage.getSnapshot()).toBe(receipt.snapshot);
    expect(Object.isFrozen(receipt.snapshot.paragraphSpans)).toBe(true);
    expect(storage.read({location:1,length:3}).blocks).toHaveLength(2);
  });
  it("retains attachment references as one UTF-16 unit and joins paragraphs",()=>{
    const storage=setup();
    storage.replaceCharacters({location:0,length:8},attributedContent([paragraph([textRun("a"),attachmentRun({id:"object:one",kind:"file",source:{kind:"blob",blobId:"bytes:one"},alt:"File"})]),paragraph([textRun("b")])]));
    expect(storage.getSnapshot().text).toBe("a\uFFFC\nb");
    storage.replaceCharacters({location:2,length:1},"");
    expect(storage.getSnapshot().text).toBe("a\uFFFCb");
    expect(storage.getSnapshot().attributedContent.blocks[0].runs[1]).toMatchObject({id:"object:one"});
  });
  it("validates UTF-16 ranges and stages a failed multi-operation commit atomically",()=>{
    const storage=setup(); const before=storage.getSnapshot();
    expect(()=>storage.commit([{kind:"replace",range:{location:0,length:1},content:attributedContent([paragraph([textRun("ok")])])},{kind:"replace",range:{location:99,length:0},content:attributedContent([])}])).toThrow(/range/i);
    expect(storage.getSnapshot()).toBe(before);
    for(const range of [{location:-1,length:0},{location:0,length:NaN},{location:0.5,length:1},{location:9,length:0}]) expect(()=>storage.replaceCharacters(range,"x")).toThrow(/range|finite/i);
    storage.replaceCharacters({location:0,length:8},"😀é");
    expect(()=>storage.replaceCharacters({location:1,length:0},"x")).toThrow(/surrogate|boundary/i);
    expect(text!.nseGraphemeDeletionRange("😀é👨‍👩‍👧‍👦",15,"backward")).toEqual({location:4,length:11});
    expect(text!.nseGraphemeDeletionRange("😀é",4,"backward")).toEqual({location:2,length:2});
  });
  it("applies/removes only selected attributes and changes explicit paragraph scopes",()=>{
    const storage=setup();
    storage.applyAttributes({location:1,length:5},{underline:true});
    expect(storage.getSnapshot().attributedContent.blocks[0].runs[0]).toEqual(textRun("a",{bold:true}));
    storage.removeAttributes({location:1,length:2},["bold","underline"]);
    expect(storage.getSnapshot().attributedContent.blocks[0].runs[1]).toEqual(textRun("b"));
    storage.setParagraphAttributes({location:5,length:0},{alignment:"end"});
    expect(storage.getSnapshot().attributedContent.blocks[1].attributes).toEqual({alignment:"end"});
  });
  it("normalizes newline input and retains final empty paragraphs",()=>{
    const storage=setup(); storage.replaceCharacters({location:0,length:8},"a\r\nb\rc\n");
    expect(storage.getSnapshot().text).toBe("a\nb\nc\n");
    expect(storage.getSnapshot().paragraphSpans).toHaveLength(4);
  });
});
