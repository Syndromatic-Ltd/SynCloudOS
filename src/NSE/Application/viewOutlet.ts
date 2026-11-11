import type { AFXLayer } from '../../FX/AnimationFX/AFXLayer';
import type { AFXLayerActionMap } from '../../FX/AnimationFX/AFXLayerActions';
import type { NSEViewController, NSEViewControllerBinding } from './NSEViewController';
import { createNSEViewAnimator, type NSEViewAnimator } from '../Animation/NSEViewAnimator';
import { getNSEObjectLifetime } from './objectLifetime';
import { getNSETaskLifetime } from './viewActivity';

/**
 * An element an outlet can connect: any HTML element (including NSEView's div),
 * or a root `<svg>`.
 */
export type NSEOutletElement=HTMLElement|SVGSVGElement;
export interface NSEViewOutlet<T extends NSEOutletElement> {
  readonly ref:(element:T|null)=>void;
  readonly current:T|null;
  readonly element:T;
  readonly layer:AFXLayer;
  /** NSView.animator() on a connected HTML view. */
  animator():NSEViewAnimator;
  readonly mountSignal:AbortSignal;
}
export interface NSEOutletOptions {readonly actions?:AFXLayerActionMap}
interface Connection {readonly element:NSEOutletElement;readonly abort:AbortController;token:object;layer?:AFXLayer;pending?:object}
const bindings=new WeakMap<object,NSEViewControllerBinding>();
const outlets=new WeakMap<object,Set<ManagedOutlet<NSEOutletElement>>>();
const outletOwners=new WeakMap<object,object>();

/** @internal Committed view binding, consumed by layers/renderers, not a new host. */
export function getNSEOutletBinding(owner:object):NSEViewControllerBinding|undefined{return bindings.get(owner);}
/** @internal Refuse foreign/controller-crossing handles before acquiring renderer resources. */
export function requireNSEOutletOwner(owner:object,handle:object):void {
  if(outletOwners.get(handle)!==owner)throw new TypeError('An outlet must belong to this view controller.');
}
/** @internal The owning controller calls this before load and at real detach. */
export function bindNSEViewOutlets(owner:object,binding:NSEViewControllerBinding|null):void {
  if(binding){
    try{for(const outlet of outlets.get(owner)??[])outlet.validateDocument(binding.element.ownerDocument);bindings.set(owner,binding);}
    catch(error){for(const outlet of outlets.get(owner)??[])outlet.detach();bindings.delete(owner);throw error;}
  }
  else {for(const outlet of outlets.get(owner)??[])outlet.detach();bindings.delete(owner);}
}
class ManagedOutlet<T extends NSEOutletElement> implements NSEViewOutlet<T> {
  #connection:Connection|undefined;
  constructor(readonly owner:NSEViewController<unknown>,readonly options:NSEOutletOptions) {
    const lifetime=getNSEObjectLifetime(owner);
    if(!lifetime)throw new TypeError('@outlet requires a view controller.');
    getNSETaskLifetime(owner,'mounted');
    let set=outlets.get(owner);if(!set){set=new Set();outlets.set(owner,set);}set.add(this as unknown as ManagedOutlet<NSEOutletElement>);
    outletOwners.set(this,owner);
    lifetime.scope.authoritySignal.addEventListener('abort',()=>{this.detach();set!.delete(this as unknown as ManagedOutlet<NSEOutletElement>);},{once:true});
  }
  get current():T|null{return (this.#connection?.element??null) as T|null;}
  #require():Connection {
    const connection=this.#connection;
    if(!connection||connection.abort.signal.aborted||!bindings.has(this.owner))throw getNSEObjectLifetime(this.owner)!.record.error({code:'NSE_VIEW_NOT_LOADED',operation:'outlet',access:'get'});
    return connection;
  }
  get element():T{return this.#require().element as T;}
  animator():NSEViewAnimator {
    const element=()=>{
      const view=this.element;
      if(!(view instanceof view.ownerDocument.defaultView!.HTMLElement))throw new TypeError('A view animator requires an HTML view.');
      return view;
    };
    return createNSEViewAnimator(element,()=>this.layer,()=>this.owner.traitCollection.reducedMotion);
  }
  get mountSignal():AbortSignal{return this.#require().abort.signal;}
  get layer():AFXLayer {
    const connection=this.#require();
    if(!connection.layer){
      const binding=bindings.get(this.owner)!;
      if(!binding.bindLayer)throw new TypeError('Outlet layers require a mounted application animation client.');
      const layer=binding.bindLayer(connection.element,connection.abort.signal);
      try {
        if(this.options.actions)layer.actions=this.options.actions;
        if(this.#require()!==connection)throw new DOMException('The outlet changed during layer acquisition.','AbortError');
        connection.layer=layer;
      } catch(error) {try{layer.dispose();}catch{/* Preserve the acquisition error. */}throw error;}
    }
    return connection.layer;
  }
  validateDocument(document:Document):void {
    if(this.#connection && this.#connection.element.ownerDocument!==document)throw new TypeError('An outlet cannot connect an element from another runtime document.');
  }
  readonly ref=(element:T|null):void|(()=>void)=>{
    if(element===null){this.#deferDetach(this.#connection);return;}
    const lifetime=getNSEObjectLifetime(this.owner)!;lifetime.scope.assertLive();
    const view=element.ownerDocument?.defaultView;
    if(!view||!(element instanceof view.HTMLElement||element instanceof view.SVGSVGElement))throw new TypeError('An outlet ref requires an HTMLElement or an <svg> element.');
    // Abort callbacks may attach a replacement before detach finishes.
    if(this.#connection?.abort.signal.aborted)this.#connection=undefined;
    const previous=this.#connection;
    if(previous && previous.element!==element) {
      if(!previous.pending)throw new TypeError('An outlet cannot connect two live elements. Use separate keyed outlets for repeated items.');
      this.detach();
    }
    if(this.#connection?.element===element) this.#connection.pending=undefined;
    else this.#connection={element,abort:new AbortController(),token:{}};
    const binding=bindings.get(this.owner);
    try{if(binding)this.validateDocument(binding.element.ownerDocument);}catch(error){this.detach();throw error;}
    const connection=this.#connection!;
    const token={};connection.token=token;
    return ()=>{if(connection.token===token)this.#deferDetach(connection);};
  };
  #deferDetach(connection:Connection|undefined):void {
    if(!connection||connection!==this.#connection)return;
    const pending={};connection.pending=pending;
    queueMicrotask(()=>{if(this.#connection===connection && connection.pending===pending)this.detach();});
  }
  detach():void {
    const connection=this.#connection;if(!connection)return;
    // Revocation releases renderers/layers before clearing their physical node.
    connection.abort.abort(new DOMException('The outlet unmounted.','AbortError'));
    connection.layer=undefined;if(this.#connection===connection)this.#connection=undefined;
  }
}
function decorateOutlet<This extends NSEViewController<unknown>,T extends NSEOutletElement>(options:NSEOutletOptions,
  _target:ClassAccessorDecoratorTarget<This,NSEViewOutlet<T>>,context:ClassAccessorDecoratorContext<This,NSEViewOutlet<T>>):ClassAccessorDecoratorResult<This,NSEViewOutlet<T>> {
  if(context.static||context.private||typeof context.name!=='string')throw new TypeError('@outlet requires a public instance accessor.');
  const values=new WeakMap<This,NSEViewOutlet<T>>();
  return {
    init(this:This,value:NSEViewOutlet<T>){if(value!==undefined)throw new TypeError('@outlet creates its handle; omit the initializer.');const handle=new ManagedOutlet<T>(this,options);values.set(this,handle);return handle;},
    get(this:This){return values.get(this)!;},
    set(){throw new TypeError('Managed outlet handles cannot be replaced.');},
  };
}
export function outlet<This extends NSEViewController<unknown>,T extends NSEOutletElement>(target:ClassAccessorDecoratorTarget<This,NSEViewOutlet<T>>,context:ClassAccessorDecoratorContext<This,NSEViewOutlet<T>>):ClassAccessorDecoratorResult<This,NSEViewOutlet<T>>;
export function outlet(options:NSEOutletOptions):<This extends NSEViewController<unknown>,T extends NSEOutletElement>(target:ClassAccessorDecoratorTarget<This,NSEViewOutlet<T>>,context:ClassAccessorDecoratorContext<This,NSEViewOutlet<T>>)=>ClassAccessorDecoratorResult<This,NSEViewOutlet<T>>;
export function outlet(first:NSEOutletOptions|ClassAccessorDecoratorTarget<NSEViewController<unknown>,NSEViewOutlet<HTMLElement>>,context?:ClassAccessorDecoratorContext<NSEViewController<unknown>,NSEViewOutlet<HTMLElement>>):unknown {
  if(context)return decorateOutlet({},first as ClassAccessorDecoratorTarget<NSEViewController<unknown>,NSEViewOutlet<HTMLElement>>,context);
  return (target:ClassAccessorDecoratorTarget<NSEViewController<unknown>,NSEViewOutlet<HTMLElement>>,next:ClassAccessorDecoratorContext<NSEViewController<unknown>,NSEViewOutlet<HTMLElement>>)=>decorateOutlet(first as NSEOutletOptions,target,next);
}
