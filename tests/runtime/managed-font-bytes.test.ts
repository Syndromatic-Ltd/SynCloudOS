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
import { createSynWareFontAccess, createFontCatalogueResourceLoader, type SynWareFontCatalogue } from "../../src/SynCloudOS/AppSDK/fontAccess";
import { defineFontDeclaration } from "../../src/NSE/Typography";
import { NSEFontLibrary } from "../../src/NSE/Typography/NSEFontLibrary";
import { NSEFontManager } from "../../src/NSE/Typography/NSEFontManager";
import { createRuntimeCacheRegistry } from "../../src/SynCloudOS/Cache";
import { createTFXFontHost } from "../../src/SynCloudOS/TextFX/TFXFontHost";
import { TFXFontDescriptor } from "../../src/FX/TextFX/TFXFontDescriptor";
import { readNotoSans } from "../fixtures/fx/fonts/noto-font-encodings";
import { createMountedSynWareRuntime } from "../../src/SynCloudOS/AppSDK/appRuntimeFacade";
import { createTestBundle, createTestRuntime } from "./helpers";

const declaration = defineFontDeclaration({resources:{face:"Resources/Face.ttf"},families:[{id:"example",label:"Example",defaultFaceId:"example.book",faces:[{id:"example.book",label:"Book",resource:"face",browserFamily:"Example Book",weight:400,style:"normal"}]}]});
function setup(catalogue?: SynWareFontCatalogue) {
  const owner=new AbortController();
  const caches=createRuntimeCacheRegistry({runtimeId:"runtime:managed-fonts",now:()=>0});
  const host=createTFXFontHost({runtimeId:"runtime:managed-fonts",signal:owner.signal,caches});
  const scope=host.createScope(owner.signal, catalogue && createFontCatalogueResourceLoader(catalogue));
  return {owner,host,scope};
}
describe("managed byte-backed font resolution",()=>{
  it("composes registered host faces and private bundle resources in the production mount", async () => {
    const bundleLoader = vi.fn(async () => ({ bytes: readNotoSans(), mimeType: "font/ttf" as const }));
    const hostLoader = vi.fn(async () => ({ bytes: readNotoSans(), mimeType: "font/ttf" as const }));
    const catalogue = { manager: new NSEFontManager({ families: declaration.families, library: null }), declaration, loadResource: hostLoader };
    const bundle = createTestBundle({ id: "managed-font-composition" }, { fontResourceLoader: bundleLoader });
    const runtime = createTestRuntime({ initialBundles: [bundle] });
    const responderId = `application:${bundle.manifest.id}`;
    runtime.responders.register({ id: responderId, kind: "application", parentId: "runtime", scopeId: responderId });
    const mount = createMountedSynWareRuntime({ runtime, app: runtime.apps.getApp(bundle.manifest.id)!, responderId, hostFontResourceLoader: createFontCatalogueResourceLoader(catalogue) });
    const access = createSynWareFontAccess(catalogue, mount.runtime.textLayout, mount.runtime.signal);
    try {
      const managed = await access.loadFace("example.book", new TFXFontDescriptor({ size: 14 }));
      const ordinary = await mount.runtime.textLayout.registerFontResource("Resources/Ordinary.ttf", new TFXFontDescriptor({ size: 14 }));
      expect(managed.font.shape("office").glyphs.length).toBeLessThan(6);
      expect(ordinary.font.shape("A").glyphs).toHaveLength(1);
      expect(hostLoader).toHaveBeenCalledWith("Resources/Face.ttf", expect.any(AbortSignal));
      expect(bundleLoader).toHaveBeenCalledWith("Resources/Ordinary.ttf", expect.any(AbortSignal));
      await expect(mount.runtime.textLayout.registerFontResource("Resources/HostTypography/unknown.ttf", new TFXFontDescriptor({ size: 14 }))).rejects.toMatchObject({ name: "NotFoundError" });
      expect(hostLoader).toHaveBeenCalledTimes(1);
      expect(bundleLoader).toHaveBeenCalledTimes(1);
      mount.dispose();
      expect(() => managed.font.shape("A")).toThrow(expect.objectContaining({ code: "TFX_FONT_DISPOSED" }));
      expect(() => ordinary.font.shape("A")).toThrow(expect.objectContaining({ code: "TFX_FONT_DISPOSED" }));
    } finally { mount.dispose(); await runtime.dispose("test"); }
  });
  it("shares pending resource capacity with ordinary mount font registrations", async () => {
    const owner = new AbortController();
    const caches = createRuntimeCacheRegistry({ runtimeId: "runtime:font-capacity", now: () => 0 });
    const host = createTFXFontHost({ runtimeId: "runtime:font-capacity", signal: owner.signal, caches });
    const loader = vi.fn(() => new Promise<{ bytes: Uint8Array; mimeType: "font/ttf" }>(() => {}));
    const scope = host.createScope(owner.signal, loader);
    const access = createSynWareFontAccess({ manager: new NSEFontManager({ families: declaration.families, library: null }), declaration, loadResource: loader }, scope, owner.signal);
    const descriptor = new TFXFontDescriptor({ size: 14 });
    const ordinary = scope.registerFontResource("Resources/Ordinary.ttf", descriptor);
    const requests: Promise<unknown>[] = [ordinary];
    void ordinary.catch(() => {});
    try {
      await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
      const managed = access.loadFace("example.book", descriptor);
      void managed.catch(() => {});
      const excess = access.loadFace("example.book", descriptor).then(() => null, error => error);
      requests.push(managed, excess);
      await vi.waitFor(() => expect(loader.mock.calls.length).toBeGreaterThanOrEqual(2));
      expect(loader).toHaveBeenCalledTimes(2);
      expect(await excess).toMatchObject({ name: "QuotaExceededError" });
      expect(scope.fontReadinessGeneration).toBe(0);
    } finally {
      owner.abort(); await Promise.allSettled(requests); host.dispose();
    }
  });
  it("declarations alone have no ready glyph data; declared bytes shape with independent registrations",async()=>{
    const manager=new NSEFontManager({families:declaration.families,library:null});
    let paths:string[]=[];
    const catalogue: SynWareFontCatalogue = {manager,declaration,loadResource:async(path)=>{paths.push(path);return {bytes:readNotoSans(),mimeType:"font/ttf"};}};
    const {owner,host,scope}=setup(catalogue);
    const access=createSynWareFontAccess(catalogue,scope,owner.signal);
    try {
      expect(manager.getPreset("example.book")).not.toBeNull(); expect(scope.fontReadinessGeneration).toBe(0);
      const first=await access.loadFace("example.book",new TFXFontDescriptor({size:18}));
      const second=await access.loadFace("example.book",new TFXFontDescriptor({size:18}));
      expect(paths).toEqual(["Resources/Face.ttf","Resources/Face.ttf"]);
      expect(first.font.shape("office").glyphs.length).toBeLessThan(6);
      first.dispose(); expect(second.font.shape("A").glyphs).toHaveLength(1);
      owner.abort(); expect(()=>second.font.shape("A")).toThrow(expect.objectContaining({ code: "TFX_FONT_DISPOSED" }));
      await expect(access.loadFace("example.book",new TFXFontDescriptor({size:18}))).rejects.toMatchObject({name:"AbortError"});
    } finally {host.dispose();}
  });
  it("restores imported bytes and registers them through the same real mount authority",async()=>{
    const {owner,host,scope}=setup(); const source=readNotoSans();
    const library=new NSEFontLibrary({storage:null,preferences:null,faceHost:{register:async()=>()=>{}}});
    const imported=await library.addFonts([{name:"Imported.ttf",size:source.length,arrayBuffer:async()=>source.slice().buffer as ArrayBuffer}]);
    const manager=new NSEFontManager({families:declaration.families,library});
    const access=createSynWareFontAccess({manager,declaration},scope,owner.signal);
    try { const registration=await access.loadFace(imported.added[0]!.id,new TFXFontDescriptor({size:14})); expect(registration.font.shape("A").glyphs).toHaveLength(1); owner.abort();expect(()=>registration.font.shape("A")).toThrow(expect.objectContaining({ code: "TFX_FONT_DISPOSED" })); }
    finally {host.dispose();}
  });
  it("aborts pending host loads promptly and cannot publish readiness after unmount",async()=>{
    let finish:(value:{bytes:Uint8Array;mimeType:"font/ttf"})=>void=()=>{};
    const pending=new Promise<{bytes:Uint8Array;mimeType:"font/ttf"}>(resolve=>{finish=resolve;});
    const catalogue = {manager:new NSEFontManager({families:declaration.families,library:null}),declaration,loadResource:()=>pending};
    const {owner,host,scope}=setup(catalogue);
    const access=createSynWareFontAccess(catalogue,scope,owner.signal);
    const request=access.loadFace("example.book",new TFXFontDescriptor({size:14})); owner.abort();
    await expect(request).rejects.toMatchObject({name:"AbortError"});finish({bytes:readNotoSans(),mimeType:"font/ttf"});
    await Promise.resolve();expect(scope.fontReadinessGeneration).toBe(0);host.dispose();
  });
  it("honours caller cancellation without releasing a peer mount registration",async()=>{
    const manager=new NSEFontManager({families:declaration.families,library:null});
    const catalogue: SynWareFontCatalogue = {manager,declaration,loadResource:async()=>({bytes:readNotoSans(),mimeType:"font/ttf"})};
    const {owner,host,scope}=setup(catalogue);
    const access=createSynWareFontAccess(catalogue,scope,owner.signal);
    try { const live=await access.loadFace("example.book",new TFXFontDescriptor({size:14}));const caller=new AbortController();caller.abort();await expect(access.loadFace("example.book",new TFXFontDescriptor({size:14}),caller.signal)).rejects.toMatchObject({name:"AbortError"});expect(live.font.shape("A").glyphs).toHaveLength(1);live.dispose(); }
    finally {host.dispose();}
  });
});
