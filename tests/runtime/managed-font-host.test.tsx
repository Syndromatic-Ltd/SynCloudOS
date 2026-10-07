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
import { act } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { mountSynCloudOS } from "../../src/SynCloudOSReact/browserRuntime";
import { defineWebspring } from "../../src/Webspring/public";
import { useHostFontManager } from "../../src/SynCloudOSReact/hostFontsContext";
import { defineFontDeclaration } from "../../src/NSE/Typography";
vi.mock("../../src/App", () => ({ App: () => { const manager = useHostFontManager(); return <output>{manager.availableFamilies.map(family=>family.id).join(",")}</output>; } }));
const shell = defineWebspring({ manifest:{ schemaVersion:1,id:"com.example.font-host",title:"Fonts",version:"1.0.0",webspringShell:{views:[{id:"site",presentations:["desktop","tablet","mobile"],mode:"persistent"}],defaults:{desktop:"site",tablet:"site",mobile:"site"},homeRoute:"/",branding:{name:{key:"site.name",fallback:"Fonts"}}} },components:{site:()=>null} });
const declaration = defineFontDeclaration({ resources:{regular:"Resources/Regular.woff2"},families:[{id:"managed",label:"Managed",defaultFaceId:"managed.regular",faces:[{id:"managed.regular",label:"Regular",browserFamily:"Managed",resource:"regular",weight:400,style:"normal"}]}] });
it("mounts the catalogue from the managed declaration without an independent metadata list", async()=>{
  const element=document.createElement("div");document.body.append(element); window.history.replaceState(null,"","/");
  let host:Awaited<ReturnType<typeof mountSynCloudOS>>|undefined;
  try { await act(async()=>{host=await mountSynCloudOS({element,shell,fonts:{declaration,resourceUrls:{"Resources/Regular.woff2":"/nested/Regular.woff2"}}} as any);}); expect(element.textContent).toBe("managed"); }
  finally { if(host) await act(async()=>{await host!.dispose("cleanup");});element.remove(); }
});
