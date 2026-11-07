import { NSEData } from "../../Foundation/NSEData";
import type { NativeOperationActivity } from '../SynCloudOS';
import type { AppCapabilityStatus, AppShareClient, AppShareRequest, AppShareResult } from './appEnvironmentClientTypes';
import type { RuntimeBrowserPort } from '../Runtime/runtimeInstanceTypes';

export interface MountedShareOptions {
  /** Optional host-owned coverage of the actual native promise, not caller completion. */
  readonly nativeActivity?: NativeOperationActivity;
  readonly browser: RuntimeBrowserPort;
  readonly signal: AbortSignal;
  readonly assertLive: () => void;
  /** The host delegates both inspection and admission to its existing PolicyKit. */
  readonly access: (audit: boolean) => { readonly declared: boolean; readonly allowed: boolean };
  readonly invoke?: (action: () => Promise<void>, signal: AbortSignal) => Promise<void>;
}

function nameOf(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'name' in error ? error.name : null;
}

type NativeShareRequest = Omit<AppShareRequest,'files'> & { readonly files?: File[] };
function preparedFile(value: unknown): File {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('Share files must be prepared data records.');
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).some(key => typeof key !== 'string' || !['name','mimeType','data','lastModified'].includes(key)) ||
      Object.values(fields).some(field => !('value' in field) || !field.enumerable)) throw new TypeError('Invalid share file record.');
  const name = fields.name?.value, mimeType = fields.mimeType?.value, data = fields.data?.value;
  const lastModified = fields.lastModified?.value;
  if (typeof name !== 'string' || !name.length || name.length > 255 || typeof mimeType !== 'string' || mimeType.length > 255 ||
      (lastModified !== undefined && (!Number.isFinite(lastModified) || lastModified < 0))) throw new TypeError('Invalid share file metadata.');
  return new File([NSEData.from(data).blob(mimeType)], name, { type: mimeType, ...(lastModified === undefined ? {} : { lastModified }) });
}
function normalize(request: AppShareRequest,base:()=>string): NativeShareRequest {
  if (!request || typeof request !== 'object' || Array.isArray(request) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(request))) throw new TypeError('Share data must be a plain record.');
  const values: Record<string,string|File[]> = {};
  for (const key of Reflect.ownKeys(request)) {
    if (typeof key !== 'string' || !['title','text','url','files'].includes(key)) throw new TypeError('Unknown share data.');
    const field=Object.getOwnPropertyDescriptor(request,key)!;
    if (!('value' in field) || !field.enumerable) throw new TypeError('Invalid share data.');
    if(key!=='title'&&field.value===undefined)continue;
    if(key==='files'){
      if(!Array.isArray(field.value)||!field.value.length)throw new TypeError('Share files must be a nonempty prepared array.');
      const files:File[]=[];
      for(let index=0;index<field.value.length;index++){
        const entry=Object.getOwnPropertyDescriptor(field.value,String(index));
        if(!entry||!('value' in entry))throw new TypeError('Share files must be prepared data records.');
        files.push(preparedFile(entry.value));
      }
      values.files=Object.freeze(files) as unknown as File[];
      continue;
    }
    if(typeof field.value!=='string'||field.value.length>65536)throw new TypeError('Invalid share data.');
    values[key]=field.value;
  }
  if (typeof values.title !== 'string' || !Object.values(values).some(value=>typeof value==='string'?value.trim():value.length)) throw new TypeError('Share data is empty.');
  if (values.url !== undefined) {
    const url=new URL(values.url as string,base());
    if(!['https:','http:'].includes(url.protocol))throw new TypeError('Share URL must use HTTP or HTTPS.');
    values.url=url.href;
  }
  return Object.freeze(values) as unknown as NativeShareRequest;
}

function ownedCompletion(operation: Promise<void>, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve,reject)=>{
    const abort=()=>{signal.removeEventListener('abort',abort);reject(signal.reason);};
    signal.addEventListener('abort',abort,{once:true});
    operation.then(()=>{signal.removeEventListener('abort',abort);resolve();},error=>{signal.removeEventListener('abort',abort);reject(error);});
  });
}

/** Mount-scoped projection; it neither owns browser permission nor manufactures activation. */
export function createMountedShareClient(options: MountedShareOptions): AppShareClient {
  let pending=false;
  const inspect=(data?:NativeShareRequest,navigator=options.browser.getNavigator()): Readonly<AppCapabilityStatus>=>{
    options.assertLive();
    const activation:AppCapabilityStatus['activation']=navigator?.userActivation ? navigator.userActivation.isActive?'active':'inactive' : 'unknown';
    const facts={provider:typeof navigator?.share==='function'?'native' as const:'none' as const,activation,requiresUserActivation:true,permission:'unknown' as const};
    const access=options.access(false);
    if (!access.declared) return Object.freeze({...facts,availability:'blocked',reason:'manifest'});
    if (!access.allowed) return Object.freeze({...facts,availability:'blocked',reason:'policy'});
    if (typeof navigator?.share !== 'function') return Object.freeze({...facts,provider:'none',availability:'unsupported'});
    if (options.browser.getWindow()?.isSecureContext !== true) return Object.freeze({...facts,availability:'blocked',reason:'insecure-context'});
    type PolicyProbe={features?():readonly string[];allowsFeature(feature:string):boolean};
    const document=options.browser.getDocument() as (Document & {permissionsPolicy?:PolicyProbe;featurePolicy?:PolicyProbe})|null;
    const policy=document?.permissionsPolicy??document?.featurePolicy;
    // Some native-share implementations do not recognize this feature in
    // legacy policy introspection. False for an unknown token is not denial.
    let policyDenied=false;
    try{policyDenied=policy?.features?.().includes('web-share')===true&&policy.allowsFeature('web-share')===false;}catch{/* Native API remains the authority. */}
    if (policyDenied) return Object.freeze({...facts,availability:'blocked',reason:'permissions-policy'});
    if (data) {
      // A title can make a Web Share Level 1 implementation accept the whole
      // dictionary while silently ignoring files. Probe files alone as well.
      if(data.files&&typeof navigator.canShare!=='function')return Object.freeze({...facts,availability:'unsupported',reason:'unsupported-data'});
      try { if (typeof navigator.canShare==='function'&&
        ((data.files&&!navigator.canShare.call(navigator,{files:data.files}))||!navigator.canShare.call(navigator,data))) return Object.freeze({...facts,availability:'unsupported',reason:'unsupported-data'}); }
      catch { return Object.freeze({...facts,availability:'unsupported',reason:'unsupported-data'}); }
    }
    return Object.freeze({...facts,availability:'available'});
  };
  const status=(request?:AppShareRequest):Readonly<AppCapabilityStatus>=>{
    options.assertLive();
    if(request===undefined)return inspect();
    let data:NativeShareRequest;
    try{data=normalize(request,()=>options.browser.getLocation().href);}
    catch{const facts=inspect();return facts.availability==='blocked'?facts:Object.freeze({...facts,availability:'unsupported',reason:'unsupported-data'});}
    return inspect(data);
  };
  const perform=async(request: AppShareRequest,caller?:AbortSignal):Promise<AppShareResult>=>{
    const signal=caller?AbortSignal.any([options.signal,caller]):options.signal;
    if(signal.aborted)return {kind:'aborted'};
    options.assertLive();
    let data:NativeShareRequest;
    try{data=normalize(request,()=>options.browser.getLocation().href);}catch{return {kind:'invalid'};}
    let access:ReturnType<MountedShareOptions['access']>;
    try{access=options.access(true);}catch(error){
      if(signal.aborted)return {kind:'aborted'};
      if(nameOf(error)==='SecurityError'||nameOf(error)==='NotAllowedError')return {kind:'denied',reason:'policy'};
      return {kind:'failed',reason:'runtime'};
    }
    if(!access.declared)return {kind:'denied',reason:'manifest'};
    if(!access.allowed)return {kind:'denied',reason:'policy'};
    const navigator=options.browser.getNavigator();
    const snapshot=inspect(data,navigator);
    if(signal.aborted)return {kind:'aborted'};
    if(snapshot.availability==='unsupported')return {kind:'unsupported'};
    if(snapshot.availability==='blocked')return {kind:'denied',reason:'browser'};
    if(snapshot.activation==='inactive')return {kind:'denied',reason:'activation'};
    if(pending)return {kind:'failed',reason:'busy'};
    pending=true;
    let nativeSettlementOwnsPending=false;
    try {
      // Retain the native receiver and consume activation before the first await.
      const action=()=>{signal.throwIfAborted();options.assertLive();return options.nativeActivity ? options.nativeActivity.track(()=>{signal.throwIfAborted();options.assertLive();return navigator!.share.call(navigator,data);}) : navigator!.share.call(navigator,data);};
      const operation=options.invoke?options.invoke(action,signal):action();
      nativeSettlementOwnsPending=true;
      // Caller cancellation cannot close a native share sheet. Keep the busy
      // lease until the browser settles it, even after this caller is fenced.
      Promise.resolve(operation).then(()=>{pending=false;},()=>{pending=false;});
      await ownedCompletion(operation,signal);
      if(signal.aborted)return {kind:'aborted'};
      options.assertLive();
      return {kind:'shared'};
    } catch(error) {
      if(signal.aborted)return {kind:'aborted'};
      const name=nameOf(error);
      if(name==='AbortError')return {kind:'cancelled'};
      if(name==='NotAllowedError'||name==='SecurityError')return {kind:'denied',reason:'browser'};
      if(name==='TypeError')return {kind:'invalid'};
      if(name==='NotSupportedError')return {kind:'unsupported'};
      return {kind:'failed',reason:'browser'};
    } finally {if(!nativeSettlementOwnsPending)pending=false;}
  };
  return Object.freeze({getStatus:status,perform,
    available(){return status().availability==='available';},
    async share(request:AppShareRequest){
      const result=await perform(request);
      if(result.kind==='shared')return 'shared' as const;
      if(result.kind==='cancelled'||result.kind==='unsupported')return 'cancelled' as const;
      if(result.kind==='aborted')throw new DOMException('Share owner ended.','AbortError');
      if(result.kind==='invalid')throw new TypeError('The share data is invalid.');
      if(result.kind==='denied')throw new DOMException('Sharing was not admitted.',result.reason==='manifest'||result.reason==='policy'?'SecurityError':'NotAllowedError');
      throw new DOMException('The browser could not complete sharing.','OperationError');
    },
  });
}
