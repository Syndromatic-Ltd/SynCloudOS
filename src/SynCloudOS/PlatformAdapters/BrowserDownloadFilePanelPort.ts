import type {DownloadFilePanelPort} from '../SynCloudOS';

/** Explicit download export: dispatch does not claim overwrite identity or disk persistence. */
export function createBrowserDownloadFilePanelPort(window:Window|null):DownloadFilePanelPort|null{
  const urls=(window as (Window&{URL?:Pick<typeof URL,'createObjectURL'|'revokeObjectURL'>})|null)?.URL;
  if(!window?.document.body||typeof urls?.createObjectURL!=='function')return null;
  return {
    id:'browser-download',
    async export(payload,signal){
      signal?.throwIfAborted();
      const anchor=window.document.createElement('a');
      const url=urls.createObjectURL(payload.blob);
      let cleaned=false;
      const cleanup=()=>{if(cleaned)return;cleaned=true;anchor.remove();urls.revokeObjectURL(url);};
      try{
        anchor.href=url;anchor.download=payload.fileName;anchor.rel='noopener';anchor.hidden=true;
        window.document.body.append(anchor);
        signal?.throwIfAborted();
        anchor.click();
        // Let the browser consume the blob URL before revocation (including Firefox).
        await new Promise<void>(resolve=>window.setTimeout(resolve,0));
        return {kind:'exported',fileName:payload.fileName};
      }finally{cleanup();}
    },
  };
}
