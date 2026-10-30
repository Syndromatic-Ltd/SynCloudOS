import type { NSEObservable } from '../Objects/observable';
import type { NSEDisposable, NSESynchronousDisposable } from '../Application/ownedFactory';
export type { NSETaskLifetime } from '../Application/viewActivity';
import type { NSETaskLifetime } from '../Application/viewActivity';
export type NSETaskSettlement<T> =
  | {readonly status:'succeeded';readonly value:T}
  | {readonly status:'failed';readonly error:unknown}
  | {readonly status:'cancelled';readonly reason:'superseded'|'lifetime-ended'|'owner-disposed'|'explicit'};
export interface NSETaskContext {
  readonly signal:AbortSignal;
  readonly generation:number;
  throwIfCancelled():void;
  commit<R>(change:()=>R & (R extends PromiseLike<unknown> ? never : unknown)):boolean;
  own<T extends NSEDisposable>(factory:(signal:AbortSignal)=>NSESynchronousDisposable<T>):T;
}
export interface NSETaskRun<T> {readonly signal:AbortSignal;readonly finished:Promise<NSETaskSettlement<T>>;cancel():void}
export interface NSETaskSnapshot<T> {readonly revision:number;readonly pending:boolean;readonly value:T|undefined;readonly error:unknown|null}
export interface NSEManagedTask<A,T> extends NSEObservable {
  getSnapshot():NSETaskSnapshot<T>;
  run(argument:A):NSETaskRun<T>;
  cancel():void;
  dispose():void;
}
export type NSETaskOptions<A,T,L extends NSETaskLifetime=NSETaskLifetime> = Readonly<{
  lifetime:L;
  run:(argument:A,context:NSETaskContext)=>T|Promise<T>;
  apply?:(value:T,argument:A)=>void;
}> & (Readonly<{policy:'latest';debounceMs?:number;maximumQueued?:never}>|Readonly<{policy:'serial';maximumQueued?:number;debounceMs?:never}>);
export class NSETaskQueueFullError extends Error {constructor(){super('The managed task queue is full.');this.name='NSETaskQueueFullError';}}
