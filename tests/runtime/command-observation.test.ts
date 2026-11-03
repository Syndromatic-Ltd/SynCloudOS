import {afterEach,describe,expect,it,vi} from 'vitest';
import {createTestRuntime} from './helpers';
import {observeOwnedWork} from '../../src/SynCloudOS/Operations/OwnedWorkObservations';
import type {CommandDeclaration} from '../../src/SynCloudOS/Commands/commandTypes';
const deferred=<T,>()=>{let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const cleanups:(()=>Promise<void>)[]=[];
afterEach(async()=>{for(const fn of cleanups.splice(0).reverse())await fn();});
function fixture(){const runtime=createTestRuntime({authenticationPolicy:'disabled'});runtime.store.mutate(draft=>{draft.booted=true;});cleanups.push(async()=>{await runtime.dispose();});return runtime;}
function declaration(validate:CommandDeclaration<undefined,void>['validate']):CommandDeclaration<undefined,void>{return {id:'generated.observed-command',responderId:'workspace',title:{key:'generated',fallback:'Generated private command title'},payload:{parse:()=>({ok:true,value:undefined})},scope:'focused',defaultKeyBindings:[],undo:{kind:'none'},validate,execute(){}};}
const pending=(runtime:ReturnType<typeof fixture>)=>(runtime.updateReadiness.inspect().counts as unknown as {commandWork:number}).commandWork;
describe('canonical async command validation observations',()=>{
 it.each(['prepare','validate'] as const)('retains %s work after caller cancellation and registration removal',async(kind)=>{
  const runtime=fixture(),gate=deferred<{enabled:boolean}>(),caller=new AbortController(),registration=runtime.commands.register(declaration(()=>gate.promise));
  const request=kind==='prepare'?Promise.resolve(runtime.commands.prepareDispatch('generated.observed-command',undefined,{signal:caller.signal,responderId:'workspace'})):runtime.commands.validate('generated.observed-command',undefined,{signal:caller.signal,responderId:'workspace'});
  cleanups.push(async()=>{gate.resolve({enabled:true});await Promise.allSettled([request]);});expect(pending(runtime)).toBe(1);expect(runtime.operations.inspectPending()).toEqual([]);caller.abort();registration.dispose();expect(pending(runtime)).toBe(1);
  expect(JSON.stringify(observeOwnedWork(runtime.commands)?.getSnapshot())).not.toContain('Generated private');gate.resolve({enabled:true});const result=await request;expect(kind==='prepare'?(result as {status:string}).status:(result as {enabled:boolean}).enabled).toBe(kind==='prepare'?'cancelled':false);await vi.waitFor(()=>expect(pending(runtime)).toBe(0));expect(runtime.updateReadiness.getSnapshot().activationAuthorized).toBe(false);
 });
 it('keeps synchronous preparation synchronous and does not self-publish busy facts',async()=>{
  const runtime=fixture();runtime.commands.register(declaration(()=>({enabled:true})));const source=observeOwnedWork(runtime.commands);expect(source).not.toBeNull();const before=source!.getSnapshot();
  const preparation=runtime.commands.prepareDispatch('generated.observed-command',undefined,{responderId:'workspace'});expect(preparation).not.toBeInstanceOf(Promise);expect(preparation).toMatchObject({status:'accepted'});
  for(let i=0;i<10;i++)expect((await runtime.commands.validate('generated.observed-command',undefined,{responderId:'workspace'})).enabled).toBe(true);expect(source!.getSnapshot()).toBe(before);expect(pending(runtime)).toBe(0);
 });
 it('assimilates a foreign thenable once per invocation while observing it',async()=>{
  const runtime=fixture(),gate=deferred<{enabled:boolean}>(),then=vi.fn((resolve:(v:{enabled:boolean})=>void,reject:(e:unknown)=>void)=>gate.promise.then(resolve,reject));runtime.commands.register(declaration(()=>({then}) as never));
  const prepared=Promise.resolve(runtime.commands.prepareDispatch('generated.observed-command',undefined,{responderId:'workspace'}));cleanups.push(async()=>{gate.resolve({enabled:true});await prepared;});await vi.waitFor(()=>expect(then).toHaveBeenCalledOnce());expect(pending(runtime)).toBe(1);gate.resolve({enabled:true});expect(await prepared).toMatchObject({status:'accepted'});await vi.waitFor(()=>expect(pending(runtime)).toBe(0));expect(then).toHaveBeenCalledOnce();
 });
 it('holds concurrent queries through rejection and ended command ownership',async()=>{
  const runtime=fixture(),one=deferred<{enabled:boolean}>(),two=deferred<{enabled:boolean}>();let next=0;runtime.commands.register(declaration(()=>[one.promise,two.promise][next++]!));
  const first=runtime.commands.validate('generated.observed-command',undefined,{responderId:'workspace'}).catch(error=>error),second=Promise.resolve(runtime.commands.prepareDispatch('generated.observed-command',undefined,{responderId:'workspace'}));cleanups.push(async()=>{one.resolve({enabled:true});two.resolve({enabled:true});await Promise.allSettled([first,second]);});expect(pending(runtime)).toBe(2);
  const source=observeOwnedWork(runtime.commands);expect(source).not.toBeNull();runtime.commands.dispose();expect(source!.getSnapshot()).toMatchObject({ended:true,pending:2});one.reject(new Error('generated validation error'));await first;await vi.waitFor(()=>expect(source!.getSnapshot().pending).toBe(1));two.resolve({enabled:true});expect(await second).toMatchObject({status:'cancelled'});await vi.waitFor(()=>expect(source!.getSnapshot()).toMatchObject({ended:true,pending:0}));
 });
});
