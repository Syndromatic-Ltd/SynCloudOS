// @vitest-environment jsdom
import { NSEData } from "../../src/Foundation/NSEData";
import {describe,it,expect,vi} from 'vitest';
import {createBrowserFileSystemAccessPanelPort} from '../../src/SynCloudOS/PlatformAdapters/BrowserFileSystemAccessPanelPort';
import {createBrowserDownloadFilePanelPort} from '../../src/SynCloudOS/PlatformAdapters/BrowserDownloadFilePanelPort';

describe('browser file-panel ports',()=>{
  it('uses the native Window receiver and does not infer overwrite absence',async()=>{
    const handle={kind:'file',name:'generated.txt'};let receiver:unknown;
    const native={isSecureContext:true,navigator:{userActivation:{isActive:true}},showSaveFilePicker:async function(this:unknown){receiver=this;return handle;}};
    const port=createBrowserFileSystemAccessPanelPort(native as unknown as Window)!;
    expect(port.isAvailable?.('save')).toBe(true);expect(port.isAvailable?.('open')).toBe(false);
    expect(await port.saveFile({accepts:[],suggestedName:'generated.txt'},new AbortController().signal)).toMatchObject({handle:{kind:"file",name:"generated.txt"},exists:true});expect(receiver).toBe(native);
  });
  it('distinguishes native chooser cancellation from owner interruption',async()=>{
    const owner=new AbortController();const native={navigator:{userActivation:{isActive:true}},showSaveFilePicker:async()=>{throw new DOMException('cancel','AbortError');}};
    const port=createBrowserFileSystemAccessPanelPort(native as unknown as Window)!;
    expect(await port.saveFile({accepts:[],suggestedName:'generated.txt'},owner.signal)).toBeNull();
    owner.abort(new DOMException('owner ended','AbortError'));
    await expect(port.saveFile({accepts:[],suggestedName:'generated.txt'},owner.signal)).rejects.toMatchObject({name:'AbortError'});
  });
  it('settles an aborted picker before a late native result, without using the result',async()=>{
    let settle!:(value:unknown)=>void;const owner=new AbortController();const native={showSaveFilePicker:()=>new Promise(resolve=>{settle=resolve;})};
    const port=createBrowserFileSystemAccessPanelPort(native as unknown as Window)!;
    const pending=port.saveFile({accepts:[],suggestedName:'generated.txt'},owner.signal);owner.abort(new DOMException('closed','AbortError'));
    await expect(pending).rejects.toMatchObject({name:'AbortError'});settle({kind:'file',name:'late.txt'});await Promise.resolve();
  });
  it('releases the generated URL and temporary anchor after dispatch',async()=>{
    const create=vi.fn(()=> 'blob:generated'),revoke=vi.fn();const click=vi.fn();
    const document=window.document.implementation.createHTMLDocument('fixture');
    const original=document.createElement.bind(document);vi.spyOn(document,'createElement').mockImplementation((tag:string)=>{const node=original(tag);if(tag==='a')Object.assign(node,{click});return node;});
    const native={document,URL:{createObjectURL:create,revokeObjectURL:revoke},setTimeout:(callback:()=>void)=>setTimeout(callback,0)};
    const port=createBrowserDownloadFilePanelPort(native as unknown as Window)!;
    expect(await port.export({fileName:'generated.txt',mediaType:'text/plain',data: new TextEncoder().encode('generated')})).toEqual({kind:'exported',fileName:'generated.txt'});
    expect(click).toHaveBeenCalledOnce();expect(revoke).toHaveBeenCalledWith('blob:generated');expect(document.querySelector('a')).toBeNull();
  });
});

it("converts Foundation writes at the native file-handle bridge", async () => {
  let received: unknown;
  const writer = { write: async (value: unknown) => { received = value; }, close: async () => {}, abort: async () => {} };
  const handle = { kind: "file", name: "bytes.bin", createWritable: async () => writer, getFile: async () => new File([], "bytes.bin"),
    queryPermission: async () => "granted", requestPermission: async () => "granted" };
  const native = { isSecureContext: true, navigator: { userActivation: { isActive: true } }, showOpenFilePicker: async () => [handle] } as unknown as Window;
  const port = createBrowserFileSystemAccessPanelPort(native)!;
  const [file] = await port.openFiles({ accepts: [], multiple: false }, new AbortController().signal);
  const output = await file!.createWritable();
  await output.write(NSEData.from(Uint8Array.of(1, 2)));
  expect(received).toBeInstanceOf(Uint8Array);
  expect(Array.from(received as Uint8Array)).toEqual([1, 2]);
});
