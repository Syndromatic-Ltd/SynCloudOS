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

import { describe, expect, it, vi } from "vitest";
import * as portable from "../../../src/NSE/Text";

describe("portable v1 attributed content", () => {
  it("loads its data helpers from Text", () => {
    expect(portable?.textRun).toBeTypeOf("function");
    expect(portable?.parseAttributedContent).toBeTypeOf("function");
  });
  it("slices UTF-16 attributed ranges without losing paragraph/run/attachment data", async () => {
    const text = await import("../../../src/NSE/Text/index");
    expect(text.sliceNSEAttributedContent).toBeTypeOf("function");
    const attachment=portable.attachmentRun({id:"object:slice",kind:"image",source:{kind:"blob",blobId:"bytes:slice"},alt:"Image"});
    const content=portable.attributedContent([portable.paragraph([portable.textRun("A😀",{italic:true}),attachment],{alignment:"end"}),portable.paragraph([portable.textRun("BC",{bold:true})],{headIndent:7})]);
    expect(text.sliceNSEAttributedContent(content,{location:1,length:6})).toEqual(portable.attributedContent([
      portable.paragraph([portable.textRun("😀",{italic:true}),attachment],{alignment:"end"}),portable.paragraph([portable.textRun("BC",{bold:true})],{headIndent:7}),
    ]));
    expect(()=>text.sliceNSEAttributedContent(content,{location:2,length:1})).toThrow(/surrogate|boundary/i);
  });
  it("preserves v1 runs, empty/final paragraphs and attachment identities", () => {
    expect(portable).not.toBeNull();
    const content = portable!.attributedContent([
      portable!.paragraph([portable!.textRun("A😀é", { bold: true }), portable!.attachmentRun({ id: "image:one", kind: "image", source: {kind:"blob",blobId:"bytes:one"}, alt:"Picture" })]),
      portable!.paragraph([]), portable!.paragraph([]),
    ]);
    expect(portable!.attributedContentLayoutText(content)).toBe("A😀é\uFFFC\n\n");
    expect(portable!.attributedContentText(content)).toBe("A😀éPicture\n\n");
    expect(portable.parseAttributedContent(content)).toEqual(content);
    expect(Object.isFrozen(content.blocks[0].runs[0])).toBe(true);
    expect(portable!.serializeAttributedContent(content)).toBe(portable!.serializeAttributedContent(JSON.parse(JSON.stringify(content))));
  });
  it("rejects hostile values without invoking accessors", () => {
    expect(portable).not.toBeNull();
    const getter = vi.fn();
    const value = {kind:"text"};
    Object.defineProperty(value,"text",{enumerable:true,get:getter});
    expect(()=>portable!.paragraph([value as never])).toThrow(/accessor|data propert/i);
    expect(getter).not.toHaveBeenCalled();
    expect(()=>portable!.parseAttributedContent({type:"nse-attributed-content",version:1,blocks:[{kind:"paragraph",runs:[],surprise:1}]})).toThrow(/unsupported/i);
    expect(()=>portable!.paragraph(Array(2))).toThrow(/dense|sparse/i);
    expect(()=>portable!.textRun("x", Object.create({bold:true}))).toThrow(/plain/i);
    const cycle:any = {}; cycle.self=cycle;
    expect(()=>portable!.parseAttributedContent(cycle)).toThrow(/acyclic|cycle/i);
    expect(()=>portable!.textRun("😀".repeat(300000))).toThrow(/byte limit/i);
    expect(()=>portable!.attributedContent(Array.from({length:21000},()=>({kind:"paragraph",runs:[]})) as never)).toThrow(/node limit/i);
  });
  it("normalizes imported newlines with an explicit immutable original and newline receipt", async () => {
    const text=await import("../../../src/NSE/Text/index");
    expect(text.normalizeNSEAttributedContentNewlines).toBeTypeOf("function");
    const original=portable.attributedContent([portable.paragraph([portable.textRun("a\r\nb\rc\n",{bold:true})])]);
    const receipt=text.normalizeNSEAttributedContentNewlines(original);
    expect(receipt.original).toEqual(original);
    expect(text.attributedContentLayoutText(receipt.content)).toBe("a\nb\nc\n");
    expect(receipt.newlineKinds).toEqual(["crlf","cr","lf"]);
    expect(receipt.changed).toBe(true);
    expect(Object.isFrozen(receipt.newlineKinds)).toBe(true);
    expect(text.createNSETextSnapshot(original).text).toBe("a\nb\nc\n");
  });
});
