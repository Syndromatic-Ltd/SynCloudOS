import type { NativeOperationActivity } from '../SynCloudOS';
import type {FilePanelAcceptType,FilePanelDirectoryHandle,FilePanelFileHandle,FileSystemAccessPanelPort} from '../SynCloudOS';

interface NativeOptions {readonly multiple?:boolean;readonly suggestedName?:string;readonly types?:readonly {description:string;accept:Record<string,string[]>}[];}
type NativeFileWindow=Window&{
  showOpenFilePicker?:(options:NativeOptions)=>Promise<readonly FilePanelFileHandle[]>;
  showDirectoryPicker?:()=>Promise<FilePanelDirectoryHandle>;
  showSaveFilePicker?:(options:NativeOptions)=>Promise<FilePanelFileHandle>;
};
function types(accepts:readonly FilePanelAcceptType[]):NativeOptions['types'] {
  return accepts.flatMap(entry=>entry.mimeTypes.length?[{description:entry.description,accept:Object.fromEntries(entry.mimeTypes.map(type=>[type,[...entry.extensions]]))}]:[]);
}
function owned<T>(operation:Promise<T>,signal:AbortSignal):Promise<T>{
  if(signal.aborted)return Promise.reject(signal.reason);
  return new Promise((resolve,reject)=>{
    const abort=()=>{signal.removeEventListener('abort',abort);reject(signal.reason);};
    signal.addEventListener('abort',abort,{once:true});
    operation.then(value=>{signal.removeEventListener('abort',abort);resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
  });
}
function cancelled(error:unknown,signal:AbortSignal){return !signal.aborted&&typeof error==='object'&&error!==null&&'name'in error&&error.name==='AbortError';}

/** Host-only browser picker boundary. A late handle is never persisted or wrapped for a revoked owner. */
export function createBrowserFileSystemAccessPanelPort(window:Window|null,nativeActivity?:NativeOperationActivity):FileSystemAccessPanelPort|null{
  if(!window)return null;
  const native=window as NativeFileWindow;
  // Activity observers may end a shorter-lived caller while the host survives.
  const invoke=<T>(signal:AbortSignal,action:()=>Promise<T>):Promise<T>=>nativeActivity?nativeActivity.track(()=>{signal.throwIfAborted();return action();}):action();
  return {
    isSecureContext:()=>native.isSecureContext===true,
    isAvailable:(operation)=>operation==='save'?typeof native.showSaveFilePicker==='function':operation==='directory'?typeof native.showDirectoryPicker==='function':operation==='open'?typeof native.showOpenFilePicker==='function':typeof native.showSaveFilePicker==='function'||typeof native.showOpenFilePicker==='function'||typeof native.showDirectoryPicker==='function',
    hasTransientUserActivation:()=>native.navigator.userActivation?.isActive===true,
    async openFiles(options,signal){
      signal.throwIfAborted();
      if(!native.showOpenFilePicker)throw new DOMException('Native open is unavailable.','NotSupportedError');
      try{return await owned(invoke(signal,()=>native.showOpenFilePicker!.call(native,{multiple:options.multiple,types:types(options.accepts)})),signal);}
      catch(error){if(cancelled(error,signal))return [];throw error;}
    },
    async openDirectory(signal){
      signal.throwIfAborted();
      if(!native.showDirectoryPicker)throw new DOMException('Native directory selection is unavailable.','NotSupportedError');
      try{return await owned(invoke(signal,()=>native.showDirectoryPicker!.call(native)),signal);}
      catch(error){if(cancelled(error,signal))return null;throw error;}
    },
    async saveFile(options,signal){
      signal.throwIfAborted();
      if(!native.showSaveFilePicker)throw new DOMException('Native save is unavailable.','NotSupportedError');
      try{
        const handle=await owned(invoke(signal,()=>native.showSaveFilePicker!.call(native,{suggestedName:options.suggestedName,types:types(options.accepts)})),signal);
        // The returned handle exists. The picker exposes no trustworthy new-vs-overwrite bit.
        // Preserve fail-if-exists conservatively; callers may explicitly confirm replacement.
        return {handle,exists:true};
      }catch(error){if(cancelled(error,signal))return null;throw error;}
    },
  };
}
