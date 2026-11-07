import {afterEach,describe,expect,it,vi} from 'vitest';
import {createTestRuntime} from './helpers';
import {createUndoManager} from '../../src/SynCloudOS/Undo/UndoManager';
import {observeOwnedWork} from '../../src/SynCloudOS/Operations/OwnedWorkObservations';
const gate=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return{promise,resolve};};
const cleanups:(()=>Promise<void>)[]=[];
afterEach(async()=>{for(const fn of cleanups.splice(0).reverse())await fn();});
function fixture(){const runtime=createTestRuntime({authenticationPolicy:'disabled'});runtime.store.mutate(draft=>{draft.booted=true;});cleanups.push(async()=>{await runtime.dispose();});return runtime;}
const owner={kind:'application' as const,id:'com.example.generated-undo-observation'};
const pending=(runtime:ReturnType<typeof fixture>)=>(runtime.updateReadiness.inspect().counts as unknown as {undoWork:number}).undoWork;
describe('registry-owned actual undo work observations',()=>{
 it('keeps an awaited action charged after its manager leaves the canonical registry',async()=>{
  const runtime=fixture(),wait=gate(),manager=runtime.undo.create(owner);
  manager.register({name:'Generated private history name',asyncPolicy:'await',undo:()=>wait.promise,redo(){}});
  const doing=manager.undo();cleanups.push(async()=>{wait.resolve();await doing;});expect(pending(runtime)).toBe(1);runtime.undo.remove(owner);expect(runtime.undo.inspect()).toEqual([]);expect(pending(runtime)).toBe(1);
  expect(JSON.stringify(observeOwnedWork(runtime.undo)?.getSnapshot())).not.toContain('Generated private history');expect(runtime.updateReadiness.getSnapshot().activationAuthorized).toBe(false);
  wait.resolve();await doing;await vi.waitFor(()=>expect(pending(runtime)).toBe(0));expect(runtime.updateReadiness.getSnapshot().client.readiness).toBe('unknown');expect(runtime.updateReadiness.getSnapshot().coverage.flatMap(row=>row.gaps)).toContain('command-lifecycle-undo');
 });
 it('holds mandatory compensation until the inverse callback really settles',async()=>{
  const runtime=fixture(),wait=gate(),entered=gate(),manager=runtime.undo.create(owner);
  manager.beginGroup('Generated grouped work');
  manager.register({name:'Fail after first undo',asyncPolicy:'await',undo(){throw Error('generated');},redo(){}});
  manager.register({name:'First applied undo',asyncPolicy:'await',undo(){},redo(){entered.resolve();return wait.promise;}});manager.endGroup();
  const doing=manager.undo();cleanups.push(async()=>{wait.resolve();await doing;});await entered.promise;expect(pending(runtime)).toBe(1);wait.resolve();expect(await doing).toMatchObject({status:'failed'});await vi.waitFor(()=>expect(pending(runtime)).toBe(0));
 });
 it('counts competing managers independently and never counts empty/busy receipts as real work',async()=>{
  const runtime=fixture(),one=gate(),two=gate(),a=runtime.undo.create(owner),b=runtime.undo.create({kind:'application',id:'com.example.other-generated'});
  expect(await a.undo()).toMatchObject({status:'empty'});a.register({name:'One',asyncPolicy:'await',undo:()=>one.promise,redo(){}});b.register({name:'Two',asyncPolicy:'await',undo:()=>two.promise,redo(){}});
  const first=a.undo(),second=b.undo();cleanups.push(async()=>{one.resolve();two.resolve();await Promise.allSettled([first,second]);});expect(pending(runtime)).toBe(2);expect(await a.undo()).toMatchObject({status:'busy'});expect(pending(runtime)).toBe(2);
  one.resolve();await first;await vi.waitFor(()=>expect(pending(runtime)).toBe(1));two.resolve();await second;await vi.waitFor(()=>expect(pending(runtime)).toBe(0));
 });
 it('does not invoke history after a readonly observer disposes its owner at admission',async()=>{
  const runtime=fixture(),manager=runtime.undo.create(owner),undo=vi.fn();manager.register({name:'Generated guarded callback',asyncPolicy:'await',undo,redo(){}});
  const source=observeOwnedWork(runtime.undo);expect(source).not.toBeNull();const stop=source!.subscribe(()=>{if(source!.getSnapshot().pending)runtime.undo.remove(owner);});
  try {expect(await manager.undo()).toMatchObject({status:'cancelled'});expect(undo).not.toHaveBeenCalled();await vi.waitFor(()=>expect(source!.getSnapshot().pending).toBe(0));}finally{stop();}
 });
 it('retains actual work in an ended registry without claiming a live provider',async()=>{
  const runtime=fixture(),manager=runtime.undo.create(owner),wait=gate();manager.register({name:'Generated ended owner',asyncPolicy:'await',undo:()=>wait.promise,redo(){}});const doing=manager.undo();cleanups.push(async()=>{wait.resolve();await doing;});
  const source=observeOwnedWork(runtime.undo);expect(source).not.toBeNull();runtime.undo.dispose();expect(source!.getSnapshot()).toMatchObject({ended:true,pending:1});wait.resolve();await doing;await vi.waitFor(()=>expect(source!.getSnapshot()).toMatchObject({ended:true,pending:0}));
 });
 it('keeps unregistered standalone managers outside known runtime coverage',async()=>{
  const runtime=fixture(),manager=createUndoManager({runtimeId:runtime.runtimeId,owner,maxEntries:10});expect(observeOwnedWork(manager)).toBeNull();expect(pending(runtime)).toBe(0);manager.dispose();
 });
});
