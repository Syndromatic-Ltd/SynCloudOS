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

// @vitest-environment jsdom
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, cleanup, act } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import * as sdk from "../../src/SynCloudOS/AppSDK/sdkPackageEntry";
import { SynWareProvider } from "../../src/SynCloudOS/AppSDK/SynWareContext";
import { HostFontsProvider } from "../../src/SynCloudOSReact/hostFontsContext";
import { NSEFontLibrary } from "../../src/NSE/Typography/NSEFontLibrary";
import { NSEFontManager } from "../../src/NSE/Typography/NSEFontManager";
import { TFXFontDescriptor } from "../../src/FX/TextFX/TFXFontDescriptor";
import { createRuntimeCacheRegistry } from "../../src/SynCloudOS/Cache";
import { createTFXFontHost } from "../../src/SynCloudOS/TextFX/TFXFontHost";
import { readNotoSans } from "../fixtures/fx/fonts/noto-font-encodings";
import { defineFontDeclaration } from "../../src/NSE/Typography";
afterEach(cleanup);
const faces = defineFontDeclaration({ resources:{regular:"Resources/Regular.ttf"}, families:[{ id:"example", label:"Example", defaultFaceId:"example.regular", faces:[{id:"example.regular",label:"Regular",browserFamily:"Example",resource:"regular",weight:400,style:"normal"}] }] });
describe("managed font access", () => {
  it("provides a supported SDK hook", () => { expect((sdk as any).useFonts).toBeTypeOf("function"); });
  it("supplies separate host managers to mounted applications", () => {
    const signal = new AbortController().signal;
    const context = { signal, textLayout:{} } as any;
    function Probe({ id }: {id:string}) { const fonts = (sdk as any).useFonts(); return <output data-testid={id}>{fonts.manager.availableFamilies.map((family:any)=>family.id).join(",")}</output>; }
    render(<><HostFontsProvider families={faces.families}><SynWareProvider value={context}><Probe id="first" /></SynWareProvider></HostFontsProvider><HostFontsProvider><SynWareProvider value={context}><Probe id="second" /></SynWareProvider></HostFontsProvider></>);
    expect(screen.getByTestId("first").textContent).toBe("example"); expect(screen.getByTestId("second").textContent).toBe("");
  });
  it("retains imported bytes as owned copies and releases them with their face", async () => {
    const library = new NSEFontLibrary({ storage:null, preferences:null, faceHost:{register:async()=>()=>{}} });
    const source = new Uint8Array(readFileSync(resolve("tests/fixtures/fx/fonts/notosans-NotoSans[wdth,wght].ttf")));
    const result = await library.addFonts([{ name:"Noto.ttf", size:source.length, arrayBuffer:async()=>source.slice().buffer as ArrayBuffer }]);
    const id = result.added[0]!.id;
    expect((library as any).fontBytes).toBeTypeOf("function");
    const first = (library as any).fontBytes(id); first[0] = 255;
    expect((library as any).fontBytes(id)[0]).toBe(source[0]);
    await library.removeFont(id); expect((library as any).fontBytes(id)).toBeNull();
  });
  it("updates mounted catalogue consumers when a person imports or removes a face",async()=>{
    const library=new NSEFontLibrary({storage:null,preferences:null,faceHost:{register:async()=>()=>{}}});
    const manager=new NSEFontManager({library});
    const context={signal:new AbortController().signal,textLayout:{}} as any;
    function Probe(){const fonts=(sdk as any).useFonts();return <output data-testid="catalogue">{fonts.manager.allFamilies().flatMap((family:any)=>family.presets.map((preset:any)=>preset.id)).join(",")}</output>;}
    render(<HostFontsProvider catalogue={{manager}}><SynWareProvider value={context}><Probe/></SynWareProvider></HostFontsProvider>);
    const source=new Uint8Array(readFileSync(resolve("tests/fixtures/fx/fonts/notosans-NotoSans[wdth,wght].ttf")));
    let id="";await act(async()=>{const imported=await library.addFonts([{name:"Imported.ttf",size:source.length,arrayBuffer:async()=>source.slice().buffer as ArrayBuffer}]);id=imported.added[0]!.id;});
    expect(screen.getByTestId("catalogue").textContent).toBe(id);
    await act(async()=>{await library.removeFont(id);});expect(screen.getByTestId("catalogue").textContent).toBe("");
  });
});
