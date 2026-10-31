import type {AppCapabilityStatus,AppFilePanelClient} from './appEnvironmentClientTypes';
import {createBrowserFilePanelAdapter,createDownloadFilePanelAdapter,createFilePanelService,createFileSystemAccessPanelAdapter,FilePanelReferenceError} from '../FilePanels';
import type {BrowserFilePanelPort,DownloadFilePanelPort,FileSystemAccessPanelPort,FilePanelResult,FilePanelSaveTarget} from '../FilePanels';

export interface MountedFilePanelOptions {
  readonly picker?:BrowserFilePanelPort|null;
  readonly native?:FileSystemAccessPanelPort|null;
  readonly download?:DownloadFilePanelPort|null;
  readonly signal:AbortSignal;
  readonly assertLive:()=>void;
  readonly activation:()=>boolean|undefined;
  readonly access:(capability:'file.open'|'file.write',audit:boolean)=>{readonly declared:boolean;readonly allowed:boolean};
}

/** Scopes the existing panel service; it is not a browser permission broker. */
export function createMountedFilePanelClient(options:MountedFilePanelOptions):AppFilePanelClient {
  const native=options.native?createFileSystemAccessPanelAdapter(options.native):null;
  const adapters=[...(options.picker?[createBrowserFilePanelAdapter(options.picker)]:[]),...(native?[{...native,
    // Portable read-only input must not unexpectedly fall through to another
    // native chooser. Handles/directories are explicitly requested capabilities.
    supports:(request:Parameters<typeof native.supports>[0])=>!('selection'in request)||!options.picker||request.access==='readwrite'||request.selection==='single-directory'||request.requires.includes('persistent-handle'),
  }]:[]),...(options.download?[createDownloadFilePanelAdapter(options.download)]:[])];
  const service=createFilePanelService(adapters);
  const ownedTargets=new WeakSet<FilePanelSaveTarget>();
  const dispose=()=>service.dispose();
  if(options.signal.aborted)dispose();
  else options.signal.addEventListener('abort',dispose,{once:true});
  const signalFor=(caller?:AbortSignal)=>caller?AbortSignal.any([options.signal,caller]):options.signal;
  const denied=(capability:'file.open'|'file.write',audit:boolean):FilePanelResult<never>|null=>{
    let access:ReturnType<MountedFilePanelOptions['access']>;
    try{access=options.access(capability,audit);}catch{
      return {kind:'denied',reason:'policy',message:'Runtime policy did not admit this file action.'};
    }
    return !access.declared||!access.allowed?{kind:'denied',reason:'policy',message:!access.declared?'The file capability must be declared.':'PolicyKit did not admit this file action.'}:null;
  };
  const status=(capability:'file.open'|'file.write',provider:AppCapabilityStatus['provider']):AppCapabilityStatus=>{
    const active=options.activation();
    const base={provider,activation:active===undefined?'unknown' as const:active?'active' as const:'inactive' as const,requiresUserActivation:true,permission:'unknown' as const};
    const access=options.access(capability,false);
    if(!access.declared)return Object.freeze({...base,availability:'blocked',reason:'manifest'});
    if(!access.allowed)return Object.freeze({...base,availability:'blocked',reason:'policy'});
    return Object.freeze({...base,availability:provider==='none'?'unsupported':'available'});
  };
  const nativeAvailable=(operation:'open'|'save')=>!!options.native?.isSecureContext()&&(!options.native.isAvailable||options.native.isAvailable(operation));
  const admit=(capability:'file.open'|'file.write',signal:AbortSignal):FilePanelResult<never>|null=>{
    if(signal.aborted)return {kind:'interrupted',message:'The file action owner ended.'};
    options.assertLive();
    const blocked=denied(capability,true);if(blocked)return blocked;
    if(options.activation()===false)return {kind:'denied',reason:'policy',message:'File selection requires an active user action.'};
    return null;
  };
  return Object.freeze<AppFilePanelClient>({
    getStatus(){
      options.assertLive();
      const nativeSave=nativeAvailable('save');
      let persistentSave=status('file.write',nativeSave?'native':'none');
      if(persistentSave.availability==='unsupported'&&options.native&&!options.native.isSecureContext()&&options.native.isAvailable?.('save'))persistentSave=Object.freeze({...persistentSave,provider:'native',availability:'blocked',reason:'insecure-context'});
      return Object.freeze({open:status('file.open',options.picker?'browser-input':nativeAvailable('open')?'native':'none'),save:status('file.write',nativeSave?'native':options.download?'download':'none'),persistentSave});
    },
    open(request,caller){
      const signal=signalFor(caller);
      const write=typeof request==='object'&&request!==null&&Object.getOwnPropertyDescriptor(request,'access')?.value==='readwrite';
      const blocked=admit(write?'file.write':'file.open',signal);
      return blocked?Promise.resolve(blocked):service.open(request,signal);
    },
    async save(request,caller){
      const signal=signalFor(caller);
      const blocked=admit('file.write',signal);if(blocked)return blocked;
      const existing=typeof request==='object'&&request!==null?Object.getOwnPropertyDescriptor(request,'existingTarget')?.value:undefined;
      if(existing!==undefined&&!ownedTargets.has(existing))return {kind:'denied',reason:'policy',message:'The save target belongs to another owner.'};
      const result=await service.save(request,signal);
      if(result.kind!=='accepted')return result;
      const values=result.values.map(target=>{
        let dispatched=false;
        const wrapped=Object.freeze({...target,sink:Object.freeze({kind:target.sink.kind,
          async write(payload:import('../FilePanels').FilePanelExportPayload,writeSignal?:AbortSignal){
            const lease=writeSignal?AbortSignal.any([signal,writeSignal]):signal;
            if(lease.aborted)throw new FilePanelReferenceError('operation-aborted','The export owner ended.');
            options.assertLive();
            if(denied('file.write',true))throw new FilePanelReferenceError('permission-denied','PolicyKit did not admit this export.');
            if(target.kind==='download-export'&&dispatched)throw new FilePanelReferenceError('reference-released','This download target has already been used.');
            dispatched=true;
            const completion=await target.sink.write(payload,lease);
            if(completion.kind==='cancelled'&&lease.aborted)throw new FilePanelReferenceError('operation-aborted','The export owner ended.');
            return completion;
          },
        })}) as FilePanelSaveTarget;
        ownedTargets.add(wrapped);return wrapped;
      });
      return {kind:'accepted',values:Object.freeze(values)};
    },
    release(reference,reason='caller-finished'){service.release(reference,reason);},
    dispose(){/* The mount owns the panel service. */},
  });
}
