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
import * as text from "../../../src/NSE/Text/index";
import { NSEFontManager } from "../../../src/NSE/Typography/NSEFontManager";
import { typographyFontFamilies } from "../../fixtures/typographyFontFamilies";

const snapshot=()=>text.createNSETextSnapshot(text.attributedContent([
  text.paragraph([text.textRun("ab",{bold:true,font:{familyId:"missing",size:12}}),text.textRun("cd"),text.textRun("ef",{bold:true})],{alignment:"centre"}),text.paragraph([],{headIndent:8}),text.paragraph([text.textRun("z")]),
]));

it("distinguishes uniform, mixed, unset and unavailable character values",()=>{
  expect(text.effectiveNSETextAttribute).toBeTypeOf("function");
  const s=snapshot();
  expect(text.effectiveNSETextAttribute(s,{location:0,length:2},"bold")).toEqual({state:"uniform",value:true});
  expect(text.effectiveNSETextAttribute(s,{location:1,length:4},"bold")).toEqual({state:"mixed"});
  expect(text.effectiveNSETextAttribute(s,{location:2,length:2},"bold")).toEqual({state:"unset"});
  expect(text.effectiveNSETextAttribute(s,{location:0,length:2},"font",{isAvailable:()=>false})).toEqual({state:"unavailable",reason:"Attribute resource unavailable."});
  expect(text.effectiveNSETextAttribute(s,{location:0,length:2},"font",{isAvailable:()=>true})).toEqual({state:"uniform",value:{familyId:"missing",size:12}});
});
it("reads typing attributes at a collapsed caret and attributes of an empty paragraph",()=>{
  expect(text.effectiveNSEParagraphAttribute).toBeTypeOf("function");
  const s=snapshot();
  expect(text.effectiveNSETextAttribute(s,{location:1,length:0},"bold",{typingAttributes:{bold:false}})).toEqual({state:"uniform",value:false});
  expect(text.effectiveNSETextAttribute(s,{location:1,length:0},"bold")).toEqual({state:"unset"});
  expect(text.effectiveNSEParagraphAttribute(s,{location:7,length:0},"headIndent")).toEqual({state:"uniform",value:8});
  expect(text.effectiveNSEParagraphAttribute(s,{location:0,length:7},"alignment")).toEqual({state:"uniform",value:"centre"});
  expect(text.effectiveNSEParagraphAttribute(s,{location:0,length:8},"alignment")).toEqual({state:"mixed"});
});
it("preserves requested font intent across missing, fallback and later available resources",()=>{
  expect(text.resolveNSEFontRequest).toBeTypeOf("function");
  const request=text.normaliseNSERequestedFontDescriptor({family:"Native Family",familyId:"font:native",size:12,sizeUnit:"css-px",variations:{wght:600},features:{liga:true},language:"en-GB"});
  const fallback={id:"font:fallback",family:"Fallback",faceIndex:0};
  const result=text.resolveNSEFontRequest(request,[],fallback);
  expect(result.status).toBe("fallback");expect(result.requested).toEqual(request);expect(result.descriptor.family).toBe("Fallback");expect(result.descriptor.size).toBe(12);
  const ready=text.resolveNSEFontRequest(request,[{id:"font:native",family:"Native Family",faceIndex:0}]);
  expect(ready.status).toBe("available");expect(ready.requested).toEqual(request);expect(ready.descriptor.family).toBe("Native Family");
  expect(text.resolveNSEFontRequest(request,[]).status).toBe("unavailable");
  expect(()=>text.normaliseNSERequestedFontDescriptor({...request,features:{bad:true}})).toThrow(/feature/i);
  expect(()=>text.normaliseNSERequestedFontDescriptor({...request,sizeUnit:"inches"})).toThrow(/unit/i);
});
it("converts explicit font/paragraph units with supplied manager choices",()=>{
  expect(text.nseFontRequestToTFXDescriptor).toBeTypeOf("function");
  const css=text.normaliseNSERequestedFontDescriptor({size:12,sizeUnit:"css-px"});
  const points=text.normaliseNSERequestedFontDescriptor({size:12,sizeUnit:"pt"});
  expect(text.nseFontRequestToTFXDescriptor(css,"pt").size).toBe(9);
  expect(text.nseFontRequestToTFXDescriptor(points,"css-px").size).toBe(16);
  expect(text.nseCSSPixelsToPoints(12)).toBe(9);
  const manager=new NSEFontManager({families:typographyFontFamilies,library:null});
  expect(manager.descriptorForPreset("fixture.sans.bold-italic",12)).toMatchObject({size:12,weight:700});
  expect(manager.cssForDescriptor(manager.descriptorForPreset("fixture.sans.bold-italic",12)).fontSize).toBe("12px");
});
it("carries Pages' advanced character options and draws each of them",async()=>{
  const { domTextSchema }=await import("../../../src/NSE/TextEditing/backends/domTextSchema");
  const attributes={kern:2,baselineOffset:3,capitalisation:"small-caps",ligatures:"none",outline:true} as const;
  const run=text.textRun("Advanced",attributes);
  expect(run.attributes).toEqual(attributes);
  for (const invalid of [{kern:999},{baselineOffset:Number.NaN},{capitalisation:"shout"},{ligatures:"some"},{outline:"yes"}]) expect(()=>text.textRun("x",invalid as never)).toThrow(TypeError);
  const spec=domTextSchema.marks.attributes!.spec.toDOM!(domTextSchema.marks.attributes!.create({value:attributes}),true) as [string,Record<string,string>];
  expect(spec[1].style).toContain("letter-spacing:2px");
  expect(spec[1].style).toContain("top:-3px");
  expect(spec[1].style).toContain("font-variant-caps:all-small-caps");
  expect(spec[1].style).toContain("font-variant-ligatures:none");
  expect(spec[1].style).toContain("-webkit-text-stroke");
});
