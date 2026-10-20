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
import { act, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { mountSynCloudOS, type MountedSynCloudOSHost } from "../../src/SynCloudOSReact/browserRuntime";
import { defineWebspring } from "../../src/Webspring/public";
import { useHostFontManager } from "../../src/SynCloudOSReact/hostFontsContext";
import { defineFontDeclaration, type NSEFontManager } from "../../src/NSE/Typography";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { createSynWareDefinitionFromApplicationClass } from "../../src/SynCloudOS/AppSDK/applicationClass";
import { createAppSCOS } from "../../src/SynCloudOS/AppSDK/scos/scosFacade";
import { useFonts } from "../../src/SynCloudOS/AppSDK/fontAccess";
vi.mock("../../src/App", () => ({ App: () => { const manager = useHostFontManager(); return <output>{manager.availableFamilies.map(family=>family.id).join(",")}</output>; } }));
const shell = defineWebspring({ manifest:{ schemaVersion:1,bundleIdentifier:"com.example.font-host",displayName:"Fonts",version:"1.0.0",webspringShell:{views:[{id:"site",presentations:["desktop","tablet","mobile"],mode:"persistent"}],defaults:{desktop:"site",tablet:"site",mobile:"site"},homeRoute:"/",branding:{name:{key:"site.name",fallback:"Fonts"}}} },components:{site:()=>null} });
const declaration = defineFontDeclaration({ resources:{regular:"Resources/Regular.woff2"},families:[{id:"managed",label:"Managed",defaultFaceId:"managed.regular",faces:[{id:"managed.regular",label:"Regular",browserFamily:"Managed",resource:"regular",weight:400,style:"normal"}]}] });
it("mounts the catalogue from the managed declaration without an independent metadata list", async()=>{
  const element=document.createElement("div");document.body.append(element); window.history.replaceState(null,"","/");
  let host:Awaited<ReturnType<typeof mountSynCloudOS>>|undefined;
  try { await act(async()=>{host=await mountSynCloudOS({element,shell,fonts:{declaration,resourceUrls:{"Resources/Regular.woff2":"/nested/Regular.woff2"}}} as any);}); expect(element.textContent).toBe("managed"); }
  finally { if(host) await act(async()=>{await host!.dispose("cleanup");});element.remove(); }
});

it("supplies the same managed font catalogue during class launch and in its mounted view", async () => {
  const appId = "com.example.managed-font-class";
  const scos = createAppSCOS(appId);
  let launchedManager: NSEFontManager | undefined;
  let mountedManager: NSEFontManager | undefined;
  class MainWindow extends NSEWindowController {
    static override view = () => {
      mountedManager = useFonts().manager;
      return <output>{mountedManager.descriptorForPreset("managed.regular").families.join(",")}</output>;
    };
  }
  class Application extends NSEApplication {
    static override mainWindow = MainWindow;
    override applicationDidFinishLaunching() {
      launchedManager = scos.fonts.manager;
      expect(launchedManager.descriptorForPreset("managed.regular").families).toContain("Managed");
    }
  }
  const app = createSynWareDefinitionFromApplicationClass(Application, {
    schemaVersion: 1, bundleIdentifier: appId, displayName: "Managed font class", version: "1.0.0",
    routes: [{ path: "/fonts", primary: true }],
    runtime: { presentation: "windowedView", policy: { public: true, requiresLogin: false } },
  });
  const element = document.createElement("div");
  document.body.append(element);
  window.history.replaceState(null, "", "/");
  let host: MountedSynCloudOSHost | undefined;
  try {
    await act(async () => {
      host = await mountSynCloudOS({ element, bundles: [app], application: { bundleIdentifier: appId }, authentication: "disabled",
        fonts: { declaration, resourceUrls: { "Resources/Regular.woff2": "/nested/Regular.woff2" } } });
    });
    await waitFor(() => expect(element.textContent).toContain("Managed"));
    expect(launchedManager).toBeDefined();
    expect(mountedManager).toBe(launchedManager);
    expect(scos.fonts.manager).toBe(launchedManager);
  } finally {
    if (host) await act(async () => { await host!.dispose("cleanup"); });
    element.remove();
    window.history.replaceState(null, "", "/");
  }
});
