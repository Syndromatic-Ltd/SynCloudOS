import type { AppCapabilityStatus, AppShareClient, AppShareRequest, AppShareResult } from './appEnvironmentClientTypes';
import type { RuntimeBrowserPort } from '../Runtime/runtimeInstanceTypes';

export interface MountedShareOptions {
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

function normalize(request: AppShareRequest,base:()=>string): AppShareRequest {
  if (!request || typeof request !== 'object' || Array.isArray(request) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(request))) throw new TypeError('Share data must be a plain record.');
  const values: Record<string,string> = {};
  for (const key of Reflect.ownKeys(request)) {
    if (typeof key !== 'string' || !['title','text','url'].includes(key)) throw new TypeError('Unknown share data.');
    const field=Object.getOwnPropertyDescriptor(request,key)!;
    if (!('value' in field) || !field.enumerable || typeof field.value !== 'string' || field.value.length>65536) throw new TypeError('Invalid share data.');
    values[key]=field.value;
  }
  if (typeof values.title !== 'string' || !Object.values(values).some(value=>value.trim())) throw new TypeError('Share data is empty.');
  if (values.url !== undefined) {
    const url=new URL(values.url,base());
    if(!['https:','http:'].includes(url.protocol))throw new TypeError('Share URL must use HTTP or HTTPS.');
    values.url=url.href;
  }
  return Object.freeze(values) as unknown as AppShareRequest;
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
  const status=(request?: AppShareRequest): Readonly<AppCapabilityStatus>=>{
    options.assertLive();
    const navigator=options.browser.getNavigator();
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
    if (request && typeof navigator.canShare==='function') {
      try { if (!navigator.canShare.call(navigator,normalize(request,()=>options.browser.getLocation().href))) return Object.freeze({...facts,availability:'unsupported',reason:'unsupported-data'}); }
      catch { return Object.freeze({...facts,availability:'unsupported',reason:'unsupported-data'}); }
    }
    return Object.freeze({...facts,availability:'available'});
  };
  const perform=async(request: AppShareRequest,caller?:AbortSignal):Promise<AppShareResult>=>{
    const signal=caller?AbortSignal.any([options.signal,caller]):options.signal;
    if(signal.aborted)return {kind:'aborted'};
    options.assertLive();
    let data:AppShareRequest;
    try{data=normalize(request,()=>options.browser.getLocation().href);}catch{return {kind:'invalid'};}
    let access:ReturnType<MountedShareOptions['access']>;
    try{access=options.access(true);}catch(error){
      if(signal.aborted)return {kind:'aborted'};
      if(nameOf(error)==='SecurityError'||nameOf(error)==='NotAllowedError')return {kind:'denied',reason:'policy'};
      return {kind:'failed',reason:'runtime'};
    }
    if(!access.declared)return {kind:'denied',reason:'manifest'};
    if(!access.allowed)return {kind:'denied',reason:'policy'};
    const snapshot=status(data);
    if(snapshot.availability==='unsupported')return {kind:'unsupported'};
    if(snapshot.availability==='blocked')return {kind:'denied',reason:'browser'};
    if(snapshot.activation==='inactive')return {kind:'denied',reason:'activation'};
    if(pending)return {kind:'failed',reason:'busy'};
    const navigator=options.browser.getNavigator()!;
    pending=true;
    let nativeSettlementOwnsPending=false;
    try {
      // Retain the native receiver and consume activation before the first await.
      const action=()=>navigator.share.call(navigator,data);
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
