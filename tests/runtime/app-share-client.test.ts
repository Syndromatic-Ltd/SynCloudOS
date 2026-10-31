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

import { afterEach, describe, expect, it, vi } from "vitest";
import { createSynWareContextValue } from "../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import {createMountedShareClient} from '../../src/SynCloudOS/AppSDK/mountedShareClient';
import {
  createTestRuntime,
  createTestRuntimeEnvironment,
  mountTestSynWareRuntime,
  registerTestSynWare,
} from "./helpers";

const activeRuntimes: ReturnType<typeof createTestRuntime>[] = [];
const activeMounts: ReturnType<typeof mountTestSynWareRuntime>[] = [];

afterEach(async () => {
  for (const mounted of activeMounts.splice(0)) mounted.dispose("test complete");
  for (const runtime of activeRuntimes.splice(0)) await runtime.dispose("test complete");
});

function createFixture(nativeShare?: (request: ShareData) => Promise<void>, permissions: readonly string[] = ["web.share"]) {
  const environment = createTestRuntimeEnvironment();
  Object.assign(environment.browser, {
    getNavigator: () => nativeShare ? ({ share: nativeShare, userActivation: { isActive: true } } as Navigator) : ({} as Navigator),
    getWindow: () => ({ isSecureContext: true } as Window),
  });
  const runtime = createTestRuntime({ environment });
  activeRuntimes.push(runtime);
  registerTestSynWare(runtime, {
    schemaVersion: 1,
    bundleIdentifier: "com.example.share-reader",
    version: "1.0.0",
    displayName: "Share reader",
    routes: [{ path: "/share-reader", primary: true }],
    permissions,
  });
  const mounted = mountTestSynWareRuntime(runtime, "com.example.share-reader");
  activeMounts.push(mounted);
  return createSynWareContextValue(mounted.runtime).share;
}

const request = Object.freeze({
  title: "A shared document",
  text: "Published document excerpt",
  url: "https://example.test/documents/example",
});

function scopedFixture(native:(this:Navigator,data:ShareData)=>Promise<void>,active:boolean|undefined=true){
  const owner=new AbortController();const environment=createTestRuntimeEnvironment();
  const navigator={share:native,...(active===undefined?{}:{userActivation:{isActive:active}})} as Navigator;
  const access=vi.fn((_audit:boolean)=>({declared:true,allowed:true}));
  const browser={...environment.browser,getNavigator:()=>navigator,getWindow:()=>({isSecureContext:true} as Window),getDocument:():Document|null=>null};
  const client=createMountedShareClient({signal:owner.signal,assertLive:()=>owner.signal.throwIfAborted(),access,browser});
  return {client,owner,navigator,access,browser};
}

describe('explicit mounted share completion',()=>{
  it('shares the same frozen prepared payload accepted by both receiver-bound probes before yielding',async()=>{
    const file=new File(['Generated fixture\n'],'generated.txt',{type:'text/plain'});
    let checked:ShareData|undefined,shared:ShareData|undefined;
    const f=scopedFixture(function(data){expect(this).toBe(f.navigator);shared=data;return Promise.resolve();});
    const probes:ShareData[]=[];
    Object.assign(f.navigator,{canShare:function(this:Navigator,data:ShareData){expect(this).toBe(f.navigator);probes.push(data);if('title' in data)checked=data;return true;}});
    const files=[file],input={title:'Generated fixture',files};
    const pending=f.client.perform(input);
    expect(shared).toBe(checked);expect(shared?.files).toEqual([file]);expect(shared?.files).not.toBe(files);
    expect(Object.isFrozen(shared)).toBe(true);expect(Object.isFrozen(shared?.files)).toBe(true);
    files.splice(0);input.title='Changed';
    expect(shared?.title).toBe('Generated fixture');expect(shared?.files).toEqual([file]);expect(probes).toHaveLength(2);
    await expect(pending).resolves.toEqual({kind:'shared'});
  });
  it('does not let a title mask an unsupported files member or fall back to text',async()=>{
    const native=vi.fn(async()=>undefined),f=scopedFixture(native),file=new File(['Generated'],'generated.txt');
    Object.assign(f.navigator,{canShare:vi.fn((data:ShareData)=>'title' in data)});
    const request={title:'Generated fixture',files:[file]};
    expect(f.client.getStatus(request)).toMatchObject({availability:'unsupported',reason:'unsupported-data'});
    await expect(f.client.perform(request)).resolves.toEqual({kind:'unsupported'});expect(native).not.toHaveBeenCalled();
  });
  it('requires the exact combined payload to be supported even after the files-only probe succeeds',async()=>{
    const native=vi.fn(async()=>undefined),f=scopedFixture(native),file=new File(['Generated'],'generated.txt');
    Object.assign(f.navigator,{canShare:(data:ShareData)=>!('title' in data)});
    await expect(f.client.perform({title:'Generated',files:[file]})).resolves.toEqual({kind:'unsupported'});expect(native).not.toHaveBeenCalled();
  });
  it('reports prepared files unsupported without canShare while preserving ordinary text sharing',async()=>{
    const native=vi.fn(async()=>undefined),f=scopedFixture(native),file=new File(['Generated'],'generated.txt');
    await expect(f.client.perform({title:'Generated',files:[file]})).resolves.toEqual({kind:'unsupported'});
    expect(native).not.toHaveBeenCalled();await expect(f.client.perform({title:'Generated',files:undefined})).resolves.toEqual({kind:'shared'});
    expect(native).toHaveBeenCalledWith({title:'Generated'});
  });
  it('rejects empty, sparse, lazy and forged prepared files without evaluating accessors',async()=>{
    const native=vi.fn(async()=>undefined),f=scopedFixture(native),getter=vi.fn();
    const accessed=Object.defineProperty([],'0',{get:getter});
    for(const files of [[],new Array(1),accessed,[new Blob(['Generated'])],[{name:'forged.txt',type:'text/plain'}],[Promise.resolve(new File(['Generated'],'generated.txt'))]]){
      await expect(f.client.perform({title:'Generated',files:files as File[]})).resolves.toEqual({kind:'invalid'});
    }
    expect(getter).not.toHaveBeenCalled();expect(native).not.toHaveBeenCalled();
  });
  it('fences owner or caller revocation during the native capability probe',async()=>{
    for(const source of ['owner','caller']){
      const native=vi.fn(async()=>undefined),f=scopedFixture(native),caller=new AbortController();
      Object.assign(f.navigator,{canShare:()=>{(source==='owner'?f.owner:caller).abort();return true;}});
      await expect(f.client.perform({title:'Generated',files:[new File(['Generated'],'generated.txt')]},caller.signal)).resolves.toEqual({kind:'aborted'});
      expect(native).not.toHaveBeenCalled();
    }
  });
  it.each(['AbortError','NotAllowedError'])('never substitutes a fallback after prepared-file %s',async name=>{
    const native=vi.fn(async()=>{throw new DOMException('Generated browser outcome',name);}),f=scopedFixture(native);
    Object.assign(f.navigator,{canShare:()=>true});
    expect(await f.client.perform({title:'Generated',files:[new File(['Generated'],'generated.txt')]})).toMatchObject({kind:name==='AbortError'?'cancelled':'denied'});
    expect(native).toHaveBeenCalledOnce();
  });
  it('omits undefined optional fields like a native share dictionary',async()=>{
    const native=vi.fn(async()=>undefined),f=scopedFixture(native);
    await expect(f.client.perform({title:'Generated fixture',text:undefined,url:undefined})).resolves.toEqual({kind:'shared'});
    expect(native).toHaveBeenCalledWith({title:'Generated fixture'});
  });
  it('returns a typed policy denial when the host admission gate rejects before native access',async()=>{
    const native=vi.fn(async()=>undefined),f=scopedFixture(native);
    f.access.mockImplementation(audit=>{if(audit)throw new DOMException('denied','SecurityError');return {declared:true,allowed:true};});
    await expect(f.client.perform(request)).resolves.toEqual({kind:'denied',reason:'policy'});expect(native).not.toHaveBeenCalled();
  });
  it('resolves a relative HTTP share URL against the owned browser location',async()=>{
    const native=vi.fn(async()=>undefined),f=scopedFixture(native);
    f.browser.getLocation=()=>({href:'https://example.test/application/',origin:'https://example.test',pathname:'/application/',search:'',hash:''});
    await expect(f.client.perform({title:'Generated fixture',url:'../document'})).resolves.toEqual({kind:'shared'});
    expect(native).toHaveBeenCalledWith({title:'Generated fixture',url:'https://example.test/document'});
  });
  it('does not turn an unrecognized policy token into a native-share denial',()=>{
    const f=scopedFixture(async()=>undefined),allows=vi.fn(()=>false);
    f.browser.getDocument=()=>({featurePolicy:{features:()=>['fullscreen'],allowsFeature:allows}} as unknown as Document);
    expect(f.client.getStatus().availability).toBe('available');expect(allows).not.toHaveBeenCalled();
  });
  it('respects an actual recognized Permissions Policy denial',async()=>{
    const native=vi.fn(async()=>undefined),f=scopedFixture(native);
    f.browser.getDocument=()=>({featurePolicy:{features:()=>['web-share'],allowsFeature:()=>false}} as unknown as Document);
    expect(f.client.getStatus()).toMatchObject({availability:'blocked',reason:'permissions-policy'});
    await expect(f.client.perform(request)).resolves.toEqual({kind:'denied',reason:'browser'});expect(native).not.toHaveBeenCalled();
  });
  it('preserves the native share and canShare receivers and invokes before yielding',async()=>{
    let receiver:unknown;const f=scopedFixture(function(){receiver=this;return Promise.resolve();});
    const canShare=vi.fn(function(this:Navigator){expect(this).toBe(f.navigator);return true;});Object.assign(f.navigator,{canShare});
    const pending=f.client.perform(request);expect(receiver).toBe(f.navigator);
    await expect(pending).resolves.toEqual({kind:'shared'});expect(canShare).toHaveBeenCalled();
  });
  it('reports inactive activation separately from API availability',async()=>{
    const native=vi.fn(async()=>undefined);const f=scopedFixture(native,false);
    expect(f.client.getStatus()).toMatchObject({availability:'available',activation:'inactive',permission:'unknown'});
    await expect(f.client.perform(request)).resolves.toEqual({kind:'denied',reason:'activation'});expect(native).not.toHaveBeenCalled();
  });
  it('lets the browser decide when activation is not observable',async()=>{
    const f=scopedFixture(async()=>undefined);Object.assign(f.navigator,{userActivation:undefined});
    expect(f.client.getStatus().activation).toBe('unknown');await expect(f.client.perform(request)).resolves.toEqual({kind:'shared'});
  });
  it('does not audit or prompt during status inspection',()=>{
    const native=vi.fn(async()=>undefined);const f=scopedFixture(native);
    f.client.getStatus();expect(f.access).toHaveBeenCalledWith(false);expect(f.access).not.toHaveBeenCalledWith(true);expect(native).not.toHaveBeenCalled();
  });
  it('rejects malformed share data without invoking accessors or native methods',async()=>{
    const native=vi.fn(async()=>undefined),getter=vi.fn(()=> 'hidden');const f=scopedFixture(native);
    const hostile=Object.defineProperty({title:'fixture'},'text',{get:getter,enumerable:true});
    await expect(f.client.perform(hostile)).resolves.toEqual({kind:'invalid'});
    await expect(f.client.perform({title:'fixture',url:'javascript:alert(1)'})).resolves.toEqual({kind:'invalid'});
    expect(getter).not.toHaveBeenCalled();expect(native).not.toHaveBeenCalled();
  });
  it('reports request-specific unsupported data without a share call',async()=>{
    const native=vi.fn(async()=>undefined);const f=scopedFixture(native);Object.assign(f.navigator,{canShare:()=>false});
    expect(f.client.getStatus(request)).toMatchObject({availability:'unsupported',reason:'unsupported-data'});
    await expect(f.client.perform(request)).resolves.toEqual({kind:'unsupported'});expect(native).not.toHaveBeenCalled();
  });
  it.each([['AbortError','cancelled'],['NotAllowedError','denied'],['TypeError','invalid'],['NotSupportedError','unsupported'],['OperationError','failed']])('classifies native %s as %s',async(name,kind)=>{
    const f=scopedFixture(async()=>{throw new DOMException('browser detail',name);});
    expect(await f.client.perform(request)).toMatchObject({kind});
  });
  it.each(['owner','caller'])('distinguishes %s abort from user cancellation and ignores late completion',async source=>{
    let complete!:()=>void;const f=scopedFixture(()=>new Promise(resolve=>{complete=resolve;}));const caller=new AbortController();
    const pending=f.client.perform(request,caller.signal);(source==='owner'?f.owner:caller).abort();
    await expect(pending).resolves.toEqual({kind:'aborted'});complete();await Promise.resolve();
  });
  it('does not start overlapping native share operations',async()=>{
    let complete!:()=>void;const native=vi.fn(()=>new Promise<void>(resolve=>{complete=resolve;}));const f=scopedFixture(native);
    const pending=f.client.perform(request);await expect(f.client.perform(request)).resolves.toEqual({kind:'failed',reason:'busy'});
    expect(native).toHaveBeenCalledOnce();complete();await expect(pending).resolves.toEqual({kind:'shared'});
  });
  it('keeps the native busy lease after caller abort until the native sheet settles',async()=>{
    let complete!:()=>void;const native=vi.fn(()=>new Promise<void>(resolve=>{complete=resolve;})),f=scopedFixture(native),caller=new AbortController();
    const pending=f.client.perform(request,caller.signal);caller.abort();await expect(pending).resolves.toEqual({kind:'aborted'});
    await expect(f.client.perform(request)).resolves.toEqual({kind:'failed',reason:'busy'});expect(native).toHaveBeenCalledOnce();
    complete();await Promise.resolve();
  });
});

describe("mounted AppSDK share client", () => {
  it("rejects sharing without its manifest capability before accessing the native API", async () => {
    const nativeShare = vi.fn(async () => undefined);
    const share = createFixture(nativeShare, []);
    await expect(share.share(request)).rejects.toMatchObject({ name: "SecurityError" });
    expect(nativeShare).not.toHaveBeenCalled();
  });
  it("reports a completed native share as shared", async () => {
    const nativeShare = vi.fn(async () => undefined);
    const share = createFixture(nativeShare);

    await expect(share.share(request)).resolves.toBe("shared");
    expect(nativeShare).toHaveBeenCalledWith(request);
  });

  it("reports only a genuine AbortError cancellation as cancelled", async () => {
    const share = createFixture(vi.fn(async () => {
      throw new DOMException("The user cancelled sharing.", "AbortError");
    }));

    await expect(share.share(request)).resolves.toBe("cancelled");
  });

  it("reports unavailable native sharing without attempting a native call", async () => {
    const share = createFixture();

    expect(share.available()).toBe(false);
    await expect(share.share(request)).resolves.toBe("cancelled");
  });

  it("rejects an unexpected native share failure for the mounted app to present", async () => {
    const failure = new DOMException("Sharing is forbidden by platform policy.", "NotAllowedError");
    const share = createFixture(vi.fn(async () => {
      throw failure;
    }));

    await expect(share.share(request)).rejects.toMatchObject({ name: "NotAllowedError" });
  });
  it("distinguishes unsupported sharing from cancellation in the explicit API", async () => {
    const share=createFixture();
    expect(share.getStatus()).toMatchObject({availability:'unsupported',permission:'unknown'});
    await expect(share.perform(request)).resolves.toEqual({kind:'unsupported'});
  });
  it("does not treat missing declaration as native permission or unsupported hardware", async () => {
    const native=vi.fn(async()=>undefined);const share=createFixture(native,[]);
    expect(share.getStatus()).toMatchObject({availability:'blocked',reason:'manifest'});
    await expect(share.perform(request)).resolves.toEqual({kind:'denied',reason:'manifest'});
    expect(native).not.toHaveBeenCalled();
  });
});
