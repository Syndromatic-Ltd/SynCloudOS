import type { AFXFrameScheduler } from '../../FX/AnimationFX/AFXLayer';
import type { AFXRenderer,AFXRendererOptions } from '../../FX/AnimationFX/AFXRenderer';
import { NSEObject } from '../Objects/NSEObject';
import type { NSEObservable } from '../Objects/observable';
import type { NSEViewController } from './NSEViewController';
import { getNSEOutletBinding,requireNSEOutletOwner,type NSEViewOutlet } from './viewOutlet';
import { getNSETaskLifetime,subscribeNSEActivity } from './viewActivity';
import { getNSEAuthoringContext } from './authoringContext';

export interface NSEManagedAnimationHost {
  readonly client:{createRenderer(target:object,options?:Pick<AFXRendererOptions,'maximumQuads'|'onRenderError'> & Readonly<{layout?:'css'}>,signal?:AbortSignal):AFXRenderer};
  readonly frames:AFXFrameScheduler|null;
}
export type NSEManagedAFXRendererOptions=Pick<AFXRendererOptions,'maximumQuads'|'onRenderError'>;
export interface NSEManagedAFXRendererSnapshot {
  readonly revision:number;readonly active:boolean;readonly reducedMotion:boolean;
  readonly width:number;readonly height:number;readonly pixelRatio:number;
}
export interface NSEManagedAFXRenderer extends NSEObservable {
  readonly renderer:AFXRenderer;
  getSnapshot():NSEManagedAFXRendererSnapshot;
  onFrame(callback:(frame:Readonly<{time:number;delta:number;reducedMotion:boolean}>)=>void,options:Readonly<{reducedMotion:'static'|'continue'}>):()=>void;
  dispose():void;
}
interface FrameObserver {readonly callback:(frame:Readonly<{time:number;delta:number;reducedMotion:boolean}>)=>void;readonly reducedMotion:'static'|'continue';staticPending:boolean}
class ManagedRenderer extends NSEObject<NSEManagedAFXRendererSnapshot> implements NSEManagedAFXRenderer {
  #snapshot:NSEManagedAFXRendererSnapshot=Object.freeze({revision:0,active:false,reducedMotion:false,width:0,height:0,pixelRatio:1});
  #renderer:AFXRenderer|undefined;#failure:unknown;#failed=false;#disposed=false;#onscreen=true;#previousTime:number|undefined;
  #cancelFrame:(()=>void)|undefined;#cancelResize:(()=>void)|undefined;
  readonly #observers=new Set<FrameObserver>();readonly #cleanup:Array<()=>void>=[];readonly #abort=new AbortController();
  readonly #canvas:HTMLCanvasElement;readonly #frames:AFXFrameScheduler;
  constructor(readonly owner:NSEViewController<unknown>,readonly outlet:NSEViewOutlet<HTMLCanvasElement>,readonly host:NSEManagedAnimationHost,readonly options:NSEManagedAFXRendererOptions) {
    super();requireNSEOutletOwner(owner,outlet);this.#canvas=outlet.element;
    const Canvas=this.#canvas.ownerDocument.defaultView?.HTMLCanvasElement;
    if(!Canvas||!(this.#canvas instanceof Canvas))throw new TypeError('Managed renderers require a canvas outlet.');
    if(!host.frames)throw new DOMException('The application frame scheduler is unavailable.','NotSupportedError');
    this.#frames=host.frames;
    try {
      const mountSignal=outlet.mountSignal;
      const end=()=>this.dispose();
      mountSignal.addEventListener('abort',end,{once:true});
      this.#registerCleanup(()=>mountSignal.removeEventListener('abort',end));
      this.#registerCleanup(subscribeNSEActivity(owner,()=>this.#update()));
      this.#registerCleanup(owner.subscribe(()=>{
        for(const observer of this.#observers)observer.staticPending=true;
        this.#update();
      }));
      const stopFrames=this.#frames.subscribeState?.(()=>this.#update());
      if(stopFrames)this.#registerCleanup(stopFrames);
      const win=this.#canvas.ownerDocument.defaultView!;
      const resize=()=>this.#queueResize();
      win.addEventListener('resize',resize);
      this.#registerCleanup(()=>win.removeEventListener('resize',resize));
      const Observer=win.ResizeObserver;
      if(Observer){
        const observer=new Observer(()=>this.#queueResize());
        this.#registerCleanup(()=>observer.disconnect());
        observer.observe(this.#canvas);
      }
      const Intersection=win.IntersectionObserver;
      if(Intersection){
        const observer=new Intersection(entries=>{
          const entry=entries.find(value=>value.target===this.#canvas);
          if(entry){this.#onscreen=entry.isIntersecting;this.#update();}
        });
        this.#registerCleanup(()=>observer.disconnect());
        observer.observe(this.#canvas);
      }
      this.#resize();
    } catch(error){try{this.dispose();}catch{/* Preserve the acquisition error. */}throw error;}
  }
  #registerCleanup(cleanup:()=>void):void {
    if(this.#disposed){
      try{cleanup();}finally{throw new DOMException('The renderer mount ended during acquisition.','AbortError');}
    }
    this.#cleanup.push(cleanup);
  }
  override getSnapshot=():NSEManagedAFXRendererSnapshot=>this.#snapshot;
  get renderer():AFXRenderer {
    if(this.#failed)throw this.#failure;
    if(this.#disposed)throw new DOMException('The managed renderer was disposed.','InvalidStateError');
    if(!this.#renderer)throw new DOMException('The canvas has no positive layout size yet.','InvalidStateError');
    return this.#renderer;
  }
  #error(error:unknown):void {
    if(this.#failed)return;
    this.#failed=true;this.#failure=error;
    // A failed surface must release its quota and stop continuous callbacks.
    try{this.dispose();}catch(cleanup){error=new AggregateError([error,cleanup],'Managed rendering and cleanup failed.');}
    if(this.options.onRenderError)this.options.onRenderError(error);
    else getNSEAuthoringContext(this.owner)?.errors.capture(error,{operation:'NSEManagedAFXRenderer.render'});
  }
  #publish(next:Omit<NSEManagedAFXRendererSnapshot,'revision'>):void {
    const previous=this.#snapshot;
    if(previous.active===next.active&&previous.reducedMotion===next.reducedMotion&&previous.width===next.width&&previous.height===next.height&&previous.pixelRatio===next.pixelRatio)return;
    for(const observer of this.#observers)observer.staticPending=true;
    this.#snapshot=Object.freeze({...next,revision:previous.revision+1});this.notifyObservers();
  }
  #queueResize():void {
    if(this.#disposed||this.#cancelResize)return;
    this.#cancelResize=this.#frames.requestFrame(()=>{this.#cancelResize=undefined;if(!this.#disposed){try{this.#resize();}catch(error){this.#error(error);}}});
  }
  #resize():void {
    const width=this.#canvas.clientWidth,height=this.#canvas.clientHeight;
    const pixelRatio=this.#canvas.ownerDocument.defaultView?.devicePixelRatio??1;
    if(!Number.isFinite(pixelRatio)||pixelRatio<=0)throw new RangeError('Canvas pixel ratio must be positive and finite.');
    if(width>0&&height>0) {
      if(!this.#renderer) {
        // The scoped browser client validates initial backing dimensions before
        // setViewport can supply CSS dimensions, including after a zero-size view.
        if(this.#canvas.width===0)this.#canvas.width=Math.max(1,Math.round(width*pixelRatio));
        if(this.#canvas.height===0)this.#canvas.height=Math.max(1,Math.round(height*pixelRatio));
        const renderer=this.host.client.createRenderer(this.#canvas,{...this.options,layout:'css',onRenderError:error=>this.#error(error)},this.#abort.signal);
        if(this.#disposed){renderer.dispose();throw new DOMException('The renderer mount ended during acquisition.','AbortError');}
        this.#renderer=renderer;
      }
      const previous=this.#snapshot;
      if(width!==previous.width||height!==previous.height||pixelRatio!==previous.pixelRatio)this.#renderer.setViewport({width,height,pixelRatio});
    }
    if(this.#disposed)return;
    this.#publish({...this.#snapshot,width,height,pixelRatio});this.#update();
  }
  #update():void {
    if(this.#disposed)return;
    const active=getNSETaskLifetime(this.owner,'visible').active&&this.#onscreen&&!this.#frames.suspended&&this.#snapshot.width>0&&this.#snapshot.height>0;
    const reducedMotion=this.owner.traitCollection.reducedMotion||this.#frames.reducedMotion;
    if(active!==this.#snapshot.active){this.#previousTime=undefined;for(const observer of this.#observers)observer.staticPending=true;}
    if(reducedMotion!==this.#snapshot.reducedMotion)for(const observer of this.#observers)observer.staticPending=true;
    this.#publish({...this.#snapshot,active,reducedMotion});
    if(!active){this.#cancelFrame?.();this.#cancelFrame=undefined;return;}
    this.#schedule();
  }
  #schedule():void {
    if(this.#disposed||!this.#snapshot.active||this.#cancelFrame||![...this.#observers].some(observer=>!this.#snapshot.reducedMotion||observer.reducedMotion==='continue'||observer.staticPending))return;
    this.#cancelFrame=this.#frames.requestFrame(time=>{
      this.#cancelFrame=undefined;if(this.#disposed||!this.#snapshot.active)return;
      const frame=Object.freeze({time,delta:this.#previousTime===undefined?0:Math.max(0,time-this.#previousTime),reducedMotion:this.#snapshot.reducedMotion});this.#previousTime=time;
      for(const observer of [...this.#observers]){
        if(this.#disposed||!this.#snapshot.active)break;
        if(!this.#observers.has(observer)||frame.reducedMotion&&observer.reducedMotion==='static'&&!observer.staticPending)continue;
        observer.staticPending=false;try{observer.callback(frame);}catch(error){this.#error(error);}
      }
      this.#schedule();
    });
  }
  onFrame(callback:FrameObserver['callback'],options:Readonly<{reducedMotion:'static'|'continue'}>):()=>void {
    if(this.#disposed)throw new DOMException('The managed renderer was disposed.','InvalidStateError');
    if(typeof callback!=='function'||!['static','continue'].includes(options.reducedMotion))throw new TypeError('A frame callback requires an explicit reduced-motion policy.');
    const observer:FrameObserver={callback,reducedMotion:options.reducedMotion,staticPending:true};this.#observers.add(observer);this.#schedule();
    return()=>{this.#observers.delete(observer);if(!this.#observers.size){this.#cancelFrame?.();this.#cancelFrame=undefined;this.#previousTime=undefined;}};
  }
  dispose():void {
    if(this.#disposed)return;this.#disposed=true;const failures:unknown[]=[];
    const attempt=(step:()=>void)=>{try{step();}catch(error){failures.push(error);}};
    attempt(()=>this.#cancelFrame?.());attempt(()=>this.#cancelResize?.());
    for(const cleanup of this.#cleanup.splice(0).reverse())attempt(cleanup);
    this.#observers.clear();attempt(()=>this.#renderer?.dispose());this.#renderer=undefined;attempt(()=>this.#abort.abort());
    attempt(()=>this.#publish({...this.#snapshot,active:false}));
    if(failures.length)throw new AggregateError(failures,'Managed renderer cleanup failed.');
  }
  get disposed():boolean{return this.#disposed;}
}
const managedByOutlet=new WeakMap<object,{signal:AbortSignal;manager:ManagedRenderer}>();
/** @internal Always resolves the current mounted client; remounts cannot reuse a revoked renderer. */
export function manageNSEAnimationRenderer(owner:NSEViewController<unknown>,outlet:NSEViewOutlet<HTMLCanvasElement>,options:NSEManagedAFXRendererOptions={}):NSEManagedAFXRenderer {
  requireNSEOutletOwner(owner,outlet);const signal=outlet.mountSignal;
  const cached=managedByOutlet.get(outlet);
  if(cached?.signal===signal&&!cached.manager.disposed){
    if(cached.manager.options.maximumQuads!==options.maximumQuads||cached.manager.options.onRenderError!==options.onRenderError)throw new TypeError('A mounted canvas already has a renderer with different options.');
    return cached.manager;
  }
  const host=getNSEOutletBinding(owner)?.fx?.animation;
  if(!host)throw new DOMException('Animation rendering is unavailable in this mounted view.','NotSupportedError');
  const manager=new ManagedRenderer(owner,outlet,host,Object.freeze({...options}));managedByOutlet.set(outlet,{signal,manager});return manager;
}
