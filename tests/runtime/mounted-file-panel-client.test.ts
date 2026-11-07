import { NSEData } from "../../src/Foundation/NSEData";
import {describe,it,expect,vi} from 'vitest';
import {createMountedFilePanelClient} from '../../src/SynCloudOS/AppSDK/mountedFilePanelClient';
import type {FileSystemAccessPanelPort,SavePanelRequest} from '../../src/SynCloudOS/FilePanels';
import {createDeterministicRuntimeEnvironment} from '../../src/SynCloudOS/AppSDK/testing/fakeAdapters';

const request:SavePanelRequest={id:'export',accepts:[],suggestedName:'generated.txt',destination:'handle-or-download',conflictPolicy:'fail-if-exists'};
const payload={fileName:'generated.txt',mediaType:'text/plain',data: new TextEncoder().encode('generated test fixture')};
function fixture(native?:Partial<FileSystemAccessPanelPort>){
  const owner=new AbortController();let active:boolean|undefined=true,allowed=true,declared=true;
  const exportFile=vi.fn(async()=>({kind:'exported' as const,fileName:'generated.txt'}));
  const access=vi.fn((_capability:string,_audit:boolean)=>({allowed,declared}));
  const client=createMountedFilePanelClient({signal:owner.signal,assertLive:()=>owner.signal.throwIfAborted(),activation:()=>active,access,
    download:{export:exportFile},...(native?{native:{isSecureContext:()=>true,isAvailable:()=>true,hasTransientUserActivation:()=>true,openFiles:async()=>[],openDirectory:async()=>null,saveFile:async()=>null,...native}}:{})});
  return {client,owner,exportFile,access,setActive:(next:boolean|undefined)=>{active=next;},setAllowed:(next:boolean)=>{allowed=next;},setDeclared:(next:boolean)=>{declared=next;}};
}
describe('mounted file-panel status and completion',()=>{
  it('returns a typed denial when the runtime admission gate rejects',async()=>{
    const f=fixture();f.access.mockImplementation((_capability,audit)=>{if(audit)throw new DOMException('denied','SecurityError');return {declared:true,allowed:true};});
    expect(await f.client.save(request)).toMatchObject({kind:'denied',reason:'policy'});expect(f.exportFile).not.toHaveBeenCalled();
  });
  it('captures deterministic exports only after an explicit file test grant',async()=>{
    const fake=createDeterministicRuntimeEnvironment({}),owner=new AbortController();
    const client=createMountedFilePanelClient({signal:owner.signal,assertLive:()=>owner.signal.throwIfAborted(),activation:()=>undefined,access:()=>({declared:true,allowed:true}),download:fake.environment.downloadExport});
    const denied=await client.save(request);if(denied.kind!=='accepted')throw Error('Missing target');
    await expect(denied.values[0]!.sink.write(payload)).rejects.toMatchObject({name:'SecurityError'});expect(fake.adapters.files.exported()).toEqual([]);
    fake.adapters.files.allow();const granted=await client.save(request);if(granted.kind!=='accepted')throw Error('Missing target');
    await granted.values[0]!.sink.write(payload);expect(fake.adapters.files.exported()).toHaveLength(1);expect(fake.adapters.files.exported()[0]!.data).toBeInstanceOf(NSEData);expect(new TextDecoder().decode(NSEData.from(fake.adapters.files.exported()[0]!.data).bytes)).toBe('generated test fixture');
    fake.adapters.files.reset();expect(fake.adapters.files.exported()).toEqual([]);expect(fake.adapters.files.mode).toBe('deny');owner.abort();
  });
  it('projects download and persistent-save facts without writing or auditing',()=>{
    const f=fixture();f.setActive(false);
    expect(f.client.getStatus()).toMatchObject({save:{availability:'available',provider:'download',activation:'inactive',permission:'unknown'},persistentSave:{availability:'unsupported'}});
    expect(f.exportFile).not.toHaveBeenCalled();expect(f.access.mock.calls.every(call=>call[1]===false)).toBe(true);
  });
  it('requires declared write, ConfigurationProfiles and selection activation without fallback',async()=>{
    const f=fixture();f.setDeclared(false);expect(await f.client.save(request)).toMatchObject({kind:'denied'});
    f.setDeclared(true);f.setAllowed(false);expect(await f.client.save(request)).toMatchObject({kind:'denied'});
    f.setAllowed(true);f.setActive(false);expect(await f.client.save(request)).toMatchObject({kind:'denied'});expect(f.exportFile).not.toHaveBeenCalled();
  });
  it('dispatches one explicit download and does not invent a persistent destination',async()=>{
    const f=fixture();const selection=await f.client.save(request);expect(selection.kind).toBe('accepted');if(selection.kind!=='accepted')return;
    const target=selection.values[0]!;expect(target.kind).toBe('download-export');
    await expect(target.sink.write(payload)).resolves.toEqual({kind:'exported',fileName:'generated.txt'});
    await expect(target.sink.write(payload)).rejects.toMatchObject({code:'reference-released'});expect(f.exportFile).toHaveBeenCalledTimes(1);
  });
  it.each(['owner','caller','policy'] as const)('fences an accepted export after %s revocation',async kind=>{
    const f=fixture();const caller=new AbortController();const selection=await f.client.save(request,caller.signal);if(selection.kind!=='accepted')throw Error('Missing target');
    if(kind==='owner')f.owner.abort();else if(kind==='caller')caller.abort();else f.setAllowed(false);
    await expect(selection.values[0]!.sink.write(payload)).rejects.toMatchObject({code:kind==='policy'?'permission-denied':'operation-aborted'});expect(f.exportFile).not.toHaveBeenCalled();
  });
  it('does not downgrade a persistent-only request to download',async()=>{
    const f=fixture();expect(await f.client.save({...request,destination:'persistent-handle-required'})).toMatchObject({kind:'unavailable'});expect(f.exportFile).not.toHaveBeenCalled();
  });
  it('never falls back after a native cancellation or denial',async()=>{
    for(const saveFile of [async()=>null,async()=>{throw new DOMException('cancelled','AbortError');},async()=>{throw new DOMException('denied','NotAllowedError');},async()=>{throw new DOMException('blocked','SecurityError');}]){
      const f=fixture({saveFile});const result=await f.client.save(request);expect(['cancelled','denied']).toContain(result.kind);expect(f.exportFile).not.toHaveBeenCalled();
    }
  });
  it('falls back only for unavailable native capability',async()=>{
    const native=vi.fn(async()=>null);const f=fixture({isAvailable:()=>false,saveFile:native});
    const result=await f.client.save(request);expect(result.kind).toBe('accepted');expect(native).not.toHaveBeenCalled();
    if(result.kind==='accepted')expect(result.values[0]!.kind).toBe('download-export');
  });
  it('rejects a save target issued by another mount',async()=>{
    const a=fixture(),b=fixture();const selected=await a.client.save(request);if(selected.kind!=='accepted')throw Error('Missing target');
    expect(await b.client.save({...request,existingTarget:selected.values[0]!})).toMatchObject({kind:'denied',reason:'policy'});
  });
  it('preserves committed success when the owner ends only after native close commits',async()=>{
    const abort=vi.fn(async()=>undefined);let end:()=>void=()=>{};
    const handle={kind:'file' as const,name:'generated.txt',queryPermission:async()=> 'granted' as const,requestPermission:async()=> 'granted' as const,getFile:async()=>new File(['generated'],'generated.txt'),createWritable:async()=>({write:async()=>undefined,close:async()=>{end();},abort})};
    const f=fixture({saveFile:async()=>({handle,exists:false})});end=()=>f.owner.abort();
    const selected=await f.client.save({...request,destination:'persistent-handle-required'});if(selected.kind!=='accepted')throw Error('Missing target');
    await expect(selected.values[0]!.sink.write(payload)).resolves.toEqual({kind:'exported',fileName:'generated.txt'});expect(abort).not.toHaveBeenCalled();
  });
});

it("captures immutable export bytes before the test adapter yields", async () => {
  const fake=createDeterministicRuntimeEnvironment({});fake.adapters.files.allow();
  const bytes=new Uint8Array([1,2]),pending=fake.environment.downloadExport!.export({fileName:"bytes.bin",mediaType:"application/octet-stream",data:bytes});
  bytes[0]=99;await pending;
  expect(fake.adapters.files.exported()[0]!.data.bytes).toEqual(new Uint8Array([1,2]));
  fake.dispose();
});
