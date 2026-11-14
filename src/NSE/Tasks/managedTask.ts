import { NSEObject } from '../Objects/NSEObject';
import { NSEOwnershipScope, bindNSEOwnedResource, constructNSEOwnedResource, isNSEOwnedResource } from '../Controllers/ownership';
import { getNSEObjectLifetime } from '../Application/objectLifetime';
import { ownNSEFactory } from '../Application/ownedFactory';
import { getNSEAuthoringContext } from '../Application/authoringContext';
import { getNSETaskLifetime, type ActivitySnapshot } from '../Application/viewActivity';
import type { NSEApplication } from '../Application/NSEApplication';
import type { NSEAnyWindowController } from '../Application/NSEWindowController';
import type { NSEViewController } from '../Application/NSEViewController';
import { NSETaskQueueFullError, type NSEManagedTask, type NSETaskOptions, type NSETaskRun, type NSETaskSettlement, type NSETaskSnapshot, type NSETaskContext } from './taskTypes';

type Owner = NSEApplication|NSEAnyWindowController|NSEViewController<unknown>;
type CancelReason = Extract<NSETaskSettlement<unknown>,{status:'cancelled'}>['reason'];
interface Work<A,T> {
  readonly argument:A;readonly generation:number;readonly epoch:ActivitySnapshot;
  readonly abort:AbortController;readonly handle:NSETaskRun<T>;readonly resolve:(result:NSETaskSettlement<T>)=>void;
  scope?:NSEOwnershipScope;invocationPending?:boolean;releaseObservation?:()=>void;settled:boolean;started:boolean;cancelling?:boolean;stopEpoch:()=>void;timer?:{dispose():void};
}
function assertSynchronous(result:unknown,operation:string):void {
  if(result && typeof (result as {then?:unknown}).then==='function') {
    if(result instanceof Promise) void result.catch(()=>{});
    throw new TypeError(`${operation} must be synchronous.`);
  }
}

class ManagedTask<A,T> extends NSEObject<NSETaskSnapshot<T>> implements NSEManagedTask<A,T> {
  #snapshot:NSETaskSnapshot<T>=Object.freeze({revision:0,pending:false,value:undefined,error:null});
  #generation=0;#disposed=false;#cancelling=false;#current:Work<A,T>|undefined;readonly #queue:Work<A,T>[]=[];
  readonly #works=new Set<Work<A,T>>();readonly #authority:AbortSignal;
  readonly #owner:Owner;readonly #options:NSETaskOptions<A,T>;
  readonly #ownerAbort=()=>this.#dispose('owner-disposed');
  constructor(owner:Owner,options:NSETaskOptions<A,T>) {
    super();this.#owner=owner;this.#options=options;
    if(!['owner','mounted','visible'].includes(options.lifetime)||!['latest','serial'].includes(options.policy)) throw new TypeError('Invalid managed task lifetime or concurrency policy.');
    if(options.policy==='latest' && (options.maximumQueued!==undefined || !Number.isFinite(options.debounceMs??0) || (options.debounceMs??0)<0)) throw new TypeError('Latest tasks accept a finite nonnegative debounceMs and no queue limit.');
    if(options.policy==='serial' && (options.debounceMs!==undefined || !Number.isSafeInteger(options.maximumQueued??32) || (options.maximumQueued??32)<0)) throw new TypeError('Serial tasks accept a nonnegative maximumQueued and no debounce.');
    const lifetime=getNSEObjectLifetime(owner);
    if(!lifetime) throw new TypeError('A managed task requires an NSE lifetime owner.');
    getNSETaskLifetime(owner,options.lifetime);
    this.#authority=lifetime.scope.authoritySignal;
    this.#authority.addEventListener('abort',this.#ownerAbort,{once:true});
  }
  override getSnapshot=():NSETaskSnapshot<T>=>this.#snapshot;
  #publish(value:T|undefined=this.#snapshot.value,error:unknown|null=this.#snapshot.error):void {
    this.#snapshot=Object.freeze({revision:this.#snapshot.revision+1,pending:this.#works.size>0,value,error});
    if(!this.#authority.aborted && !this.#disposed) {
      try {this.notifyObservers();} catch(error) {this.#report(error);}
    }
  }
  #report(error:unknown):void {
    try {getNSEAuthoringContext(this.#owner)?.errors.capture(error,{operation:'NSEManagedTask.run'});} catch { /* Diagnostics cannot prevent run settlement or cleanup. */ }
  }
  #live(work:Work<A,T>):boolean {
    return !this.#disposed && !this.#authority.aborted && !work.settled && !work.abort.signal.aborted && !work.epoch.signal.aborted
      && getNSETaskLifetime(this.#owner,this.#options.lifetime)===work.epoch
      && (this.#options.policy!=='latest'||work.generation===this.#generation);
  }
  run(argument:A):NSETaskRun<T> {
    const epoch=getNSETaskLifetime(this.#owner,this.#options.lifetime);
    const abort=new AbortController();let resolve!:(result:NSETaskSettlement<T>)=>void;
    const finished=new Promise<NSETaskSettlement<T>>(done=>{resolve=done;});
    const work:Work<A,T>={argument,generation:++this.#generation,epoch,abort,resolve,settled:false,started:false,stopEpoch:()=>{},handle:{signal:abort.signal,finished,cancel:()=>this.#cancel(work,'explicit')}};
    if(this.#disposed||this.#authority.aborted||!epoch.active||this.#cancelling) {
      this.#cancel(work,this.#authority.aborted?'owner-disposed':this.#cancelling||this.#disposed?'explicit':'lifetime-ended');return work.handle;
    }
    if(this.#options.policy==='serial' && this.#current && this.#queue.length>=(this.#options.maximumQueued??32)) {
      const error=new NSETaskQueueFullError();work.settled=true;resolve({status:'failed',error});this.#report(error);return work.handle;
    }
    this.#works.add(work);
    const end=()=>this.#cancel(work,this.#authority.aborted?'owner-disposed':'lifetime-ended');
    epoch.signal.addEventListener('abort',end,{once:true});work.stopEpoch=()=>epoch.signal.removeEventListener('abort',end);
    // Reserve FIFO/latest authority before cancellation or notification can
    // synchronously admit another run.
    if(this.#options.policy==='serial' && this.#current) this.#queue.push(work);
    else this.#current=work;
    if(this.#options.policy==='latest') {
      for(const old of [...this.#works]) if(old!==work && old.generation<work.generation) this.#cancel(old,'superseded');
    }
    if(work.settled)return work.handle;
    const observe = getNSEAuthoringContext(this.#owner)?.observeManagedTask;
    if (observe) {
      const actual = new Promise<void>(resolve => { work.releaseObservation = resolve; });
      try { observe(actual); } catch (error) { this.#report(error); }
      // Observation may synchronously dispose the owner or cancel this run.
      if (work.settled) { this.#releaseObservation(work); return work.handle; }
    }
    this.#publish(this.#snapshot.value,null);
    if(work.settled)return work.handle;
    if(this.#options.policy==='serial' && this.#current!==work)return work.handle;
    if(this.#options.policy==='latest' && (this.#options.debounceMs??0)>0) {
      const scheduler=getNSEAuthoringContext(this.#owner)?.scheduler;
      if(!scheduler) this.#settle(work,{status:'failed',error:new TypeError('Debounced tasks require the owning application scheduler.')});
      else try {
        const timer=scheduler.setTimeout(()=>{work.timer=undefined;this.#start(work);},this.#options.debounceMs!);
        if(work.settled||work.started)timer.dispose();else work.timer=timer;
      } catch(error) {this.#settle(work,{status:'failed',error});}
    } else this.#start(work);
    return work.handle;
  }
  #start(work:Work<A,T>):void {
    if(work.settled||work.started)return;
    if(!this.#live(work)) {this.#cancel(work,this.#options.policy==='latest'&&work.generation!==this.#generation?'superseded':'lifetime-ended');return;}
    this.#current=work;work.started=true;work.scope=new NSEOwnershipScope('NSETask',String(work.generation));
    const context:NSETaskContext={
      signal:work.abort.signal,generation:work.generation,
      throwIfCancelled:()=>{if(!this.#live(work)) throw new DOMException('The task run was cancelled.','AbortError');},
      commit:change=>{
        if(!this.#live(work)) return false;
        if(change.constructor.name==='AsyncFunction') throw new TypeError('Task commits must be synchronous.');
        assertSynchronous(change(),'Task commit');return this.#live(work);
      },
      own:factory=>{
        context.throwIfCancelled();
        if(factory.constructor.name==='AsyncFunction')throw new TypeError('Task owned construction must be synchronous.');
        return constructNSEOwnedResource(work.scope!,()=>{
          const result=factory(work.abort.signal);assertSynchronous(result,'Task owned construction');
          if(!result||typeof result.dispose!=='function'||getNSEObjectLifetime(result)) throw new TypeError('Task owned factories must return a disposable resource; use addChild/openWindow for controllers.');
          if(!isNSEOwnedResource(result,work.scope!.signal)) {
            if(!this.#live(work)) {try{result.dispose();}finally{context.throwIfCancelled();}}
            bindNSEOwnedResource(result,work.scope!.signal,()=>result.dispose());
          }
          context.throwIfCancelled();return result;
        });
      },
    };
    // Begin synchronously: actions may depend on browser user activation.
    let result:T|Promise<T>;
    work.invocationPending=true;
    try {result=this.#options.run(work.argument,context);} catch(error) {
      work.invocationPending=false;this.#settle(work,{status:'failed',error});return;
    }
    void Promise.resolve(result).then(value=>{
      if(!this.#live(work)) return;
      try {
        if(this.#options.apply) {
          if(this.#options.apply.constructor.name==='AsyncFunction') throw new TypeError('Task apply must be synchronous.');
          assertSynchronous(this.#options.apply(value,work.argument),'Task apply');
        }
        if(this.#live(work)) this.#settle(work,{status:'succeeded',value});
      } catch(error) {this.#settle(work,{status:'failed',error});}
    },error=>{if(this.#live(work)) this.#settle(work,{status:'failed',error});}).then(() => {
      work.invocationPending=false;this.#releaseObservation(work);
    }, error => {
      work.invocationPending=false;this.#releaseObservation(work);this.#report(error);
    });
  }
  #releaseObservation(work:Work<A,T>):void {
    if (!work.settled || work.invocationPending) return;
    const release=work.releaseObservation;work.releaseObservation=undefined;release?.();
  }
  #cancel(work:Work<A,T>,reason:CancelReason):void {
    if(work.settled||work.cancelling) return;
    work.cancelling=true;
    work.abort.abort(new DOMException(`Task cancelled: ${reason}.`,'AbortError'));
    this.#settle(work,{status:'cancelled',reason});
  }
  #settle(work:Work<A,T>,settlement:NSETaskSettlement<T>):void {
    if(work.settled) return;
    work.settled=true;
    const failures:unknown[]=settlement.status==='failed'?[settlement.error]:[];
    try {const timer=work.timer;work.timer=undefined;timer?.dispose();} catch(error) {failures.push(error);}
    try {work.stopEpoch();} catch(error) {failures.push(error);}
    let retain=true;
    if(settlement.status==='succeeded' && settlement.value && typeof settlement.value==='object' && work.scope) {
      try { retain=!isNSEOwnedResource(settlement.value,work.scope.signal); } catch {retain=false;}
    }
    try {work.scope?.disposeAdopted('explicit');} catch(error) {failures.push(error);}
    try {work.scope?.release('explicit');} catch(error) {failures.push(error);}
    if(failures.length){
      const error=failures.length===1?failures[0]:new AggregateError(failures,'The task operation and resource cleanup failed.');
      if(settlement.status==='cancelled')this.#report(error);
      else settlement={status:'failed',error};
    }
    this.#works.delete(work);const index=this.#queue.indexOf(work);if(index>=0)this.#queue.splice(index,1);
    if(this.#current===work) this.#current=undefined;
    // Reserve the next serial entry before notifying observers, too.
    let next:Work<A,T>|undefined;
    if(this.#options.policy==='serial'&&!this.#current&&!this.#disposed&&!this.#cancelling) {
      next=this.#queue.shift();this.#current=next;
    }
    if(settlement.status==='failed')this.#report(settlement.error);
    if(this.#options.policy==='latest'&&work.generation!==this.#generation)this.#publish();
    else if(settlement.status==='failed')this.#publish(this.#snapshot.value,settlement.error);
    else this.#publish(settlement.status==='succeeded' && retain ? settlement.value : this.#snapshot.value,null);
    work.resolve(settlement);
    if(next)this.#start(next);
    this.#releaseObservation(work);
  }
  cancel():void {
    const previous=this.#cancelling;this.#cancelling=true;
    try{for(const work of [...this.#works])this.#cancel(work,'explicit');}
    finally{this.#cancelling=previous;}
  }
  #dispose(reason:CancelReason):void {if(this.#disposed)return;this.#disposed=true;for(const work of [...this.#works])this.#cancel(work,reason);this.#authority.removeEventListener('abort',this.#ownerAbort);}
  dispose():void {this.#dispose('explicit');}
}
export function managedTask<A,T>(owner:NSEViewController<unknown>,options:NSETaskOptions<A,T>):NSEManagedTask<A,T>;
export function managedTask<A,T>(owner:NSEApplication|NSEAnyWindowController,options:NSETaskOptions<A,T,'owner'>):NSEManagedTask<A,T>;
export function managedTask<A,T>(owner:Owner,options:NSETaskOptions<A,T>):NSEManagedTask<A,T> {
  return ownNSEFactory(owner,()=>new ManagedTask(owner,options));
}
