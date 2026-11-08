// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { NSEViewController } from '../../src/NSE/Application/NSEViewController';
import { NSEWindowController } from '../../src/NSE/Application/NSEWindowController';
import { NSEApplication } from '../../src/NSE/Application/NSEApplication';
import { nseUnowned } from '../../src/NSE/Controllers/ownership';
import { attachNSEAuthoringContext } from '../../src/NSE/Application/authoringContext';
import { managedTask } from '../../src/NSE/Tasks/managedTask';
import { OwnedWorkObservations } from '../../src/SynCloudOS/Operations/OwnedWorkObservations';
import { applicationSessionFor } from '../../src/SynCloudOS/AppHosting/applicationSession';
import { createClassApplicationHost } from './fixtures/classApplicationHost';

function deferred<T=void>() { let resolve!:(value:T)=>void, reject!:(reason:unknown)=>void; const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; }
function fixture(port?: (work:Promise<void>)=>void) {
 const owner=new NSEViewController({owner:nseUnowned}), observations=new OwnedWorkObservations();
 attachNSEAuthoringContext(owner, { scheduler:{setTimeout:()=>({dispose(){}})}, errors:{capture(){}}, persistence:{getPreference:(_,fallback)=>fallback,setPreference:()=>true},subscribePreferences:()=>()=>{},observeManagedTask:port??((work:Promise<void>)=>{observations.track(()=>work);}) } as any);
 return {owner,source:observations.source};
}
const idle=async(source:OwnedWorkObservations['source'])=>vi.waitFor(()=>expect(source.getSnapshot().pending).toBe(0));
describe('managed task actual work observation',()=>{
 it('retains a non-cooperative callback after logical cancellation and rejects stale apply',async()=>{
  const {owner,source}=fixture(),gate=deferred<number>(),apply=vi.fn();
  const task=managedTask(owner,{lifetime:'owner',policy:'latest',run:()=>gate.promise,apply});
  const run=task.run(undefined);expect(source.getSnapshot().pending).toBe(1);run.cancel();
  expect(await run.finished).toMatchObject({status:'cancelled'});expect(task.getSnapshot().pending).toBe(false);expect(source.getSnapshot().pending).toBe(1);
  gate.resolve(7);await idle(source);expect(apply).not.toHaveBeenCalled();owner.dispose();
 });
 it('counts overlapping latest callbacks independently until each really settles',async()=>{
  const {owner,source}=fixture(),gates=[deferred<number>(),deferred<number>()];
  const task=managedTask(owner,{lifetime:'owner',policy:'latest',run:(n:number)=>gates[n].promise});
  const old=task.run(0),next=task.run(1);await old.finished;expect(source.getSnapshot().pending).toBe(2);
  gates[1].resolve(2);await next.finished;await vi.waitFor(()=>expect(source.getSnapshot().pending).toBe(1));gates[0].resolve(1);await idle(source);owner.dispose();
 });
 it('includes serial admissions but never executes a cancelled queued callback',async()=>{
  const {owner,source}=fixture(),gate=deferred(),run=vi.fn(()=>gate.promise);
  const task=managedTask(owner,{lifetime:'owner',policy:'serial',run});const first=task.run(undefined),queued=task.run(undefined);
  expect(source.getSnapshot().pending).toBe(2);queued.cancel();await queued.finished;await vi.waitFor(()=>expect(source.getSnapshot().pending).toBe(1));expect(run).toHaveBeenCalledTimes(1);
  gate.resolve();await first.finished;await idle(source);owner.dispose();
 });
 it('releases a cancelled debounced admission without starting its callback',async()=>{
  const {owner,source}=fixture(),run=vi.fn();const task=managedTask(owner,{lifetime:'owner',policy:'latest',debounceMs:100,run});
  const handle=task.run(undefined);expect(source.getSnapshot().pending).toBe(1);handle.cancel();await handle.finished;await idle(source);expect(run).not.toHaveBeenCalled();owner.dispose();
 });
 it('holds owner-disposed work through late rejection without publishing it',async()=>{
  const {owner,source}=fixture(),gate=deferred<number>(),apply=vi.fn();const task=managedTask(owner,{lifetime:'owner',policy:'latest',run:()=>gate.promise,apply});
  const handle=task.run(undefined);owner.dispose();expect(await handle.finished).toMatchObject({status:'cancelled',reason:'owner-disposed'});expect(source.getSnapshot().pending).toBe(1);
  gate.reject(new Error('generated late failure'));await idle(source);expect(apply).not.toHaveBeenCalled();
 });
 it.each([false,true])('retains observation through resource cleanup, failure=%s',async(fail)=>{
  const {owner,source}=fixture(),seen:number[]=[];const task=managedTask(owner,{lifetime:'owner',policy:'latest',run:(_,context)=>{
   context.own(()=>({dispose(){seen.push(source.getSnapshot().pending);}}));if(fail)throw Error('generated');return 3;
  }});
  expect(await task.run(undefined).finished).toMatchObject({status:fail?'failed':'succeeded'});await idle(source);expect(seen).toEqual([1]);owner.dispose();
 });
 it('allows observation reentrancy to dispose the owner before a callback starts',async()=>{
  const gate=deferred();let owner!:NSEViewController;const observed:Promise<void>[]=[];
  ({owner}=fixture(work=>{observed.push(work);owner.dispose();}));const run=vi.fn(()=>gate.promise),task=managedTask(owner,{lifetime:'owner',policy:'latest',run});
  expect(await task.run(undefined).finished).toMatchObject({status:'cancelled',reason:'owner-disposed'});expect(run).not.toHaveBeenCalled();await Promise.all(observed);
 });
 it('does not change execution for absent or failing optional diagnostic ports',async()=>{
  const plain=new NSEViewController({owner:nseUnowned}),{owner}=fixture(()=>{throw Error('generated observer failure');});
  for(const view of [plain,owner]){const task=managedTask(view,{lifetime:'owner',policy:'latest',run:()=>5});expect(await task.run(undefined).finished).toEqual({status:'succeeded',value:5});view.dispose();}
 });
 it('does not count rejected serial queue overflow as admitted work',async()=>{
  const {owner,source}=fixture(),gate=deferred();const task=managedTask(owner,{lifetime:'owner',policy:'serial',maximumQueued:0,run:()=>gate.promise});
  const current=task.run(undefined);expect(await task.run(undefined).finished).toMatchObject({status:'failed'});expect(source.getSnapshot().pending).toBe(1);
  gate.resolve();await current.finished;await idle(source);owner.dispose();
 });
 it('uses canonical recorded controller containment and retains work past window disposal',async()=>{
  const gate=deferred<number>();class View extends NSEViewController { readonly task=managedTask(this,{lifetime:'owner',policy:'latest',run:()=>gate.promise}); static override view=()=>null; }
  class Main extends NSEWindowController { static override contentViewControllerClass=View; }
  class App extends NSEApplication { static override mainWindow=Main; }
  const host=createClassApplicationHost(App,'com.example.managed-owner-chain');
  try {
   await host.launch();host.mountWindows();await host.openMainWindow();
   const session=applicationSessionFor({runtimeId:host.runtime.runtimeId,appId:host.appId})!;const main=session.app.windows[0],view=main.contentViewController as View;
   await vi.waitFor(()=>expect(host.runtime.updateReadiness.inspect().counts.lifecycleWork).toBe(0));const run=view.task.run(undefined);expect(host.runtime.updateReadiness.inspect().counts.lifecycleWork).toBe(1);
   main.dispose();expect(await run.finished).toMatchObject({status:'cancelled',reason:'owner-disposed'});expect(host.runtime.updateReadiness.inspect().counts.lifecycleWork).toBe(1);
   gate.resolve(9);await vi.waitFor(()=>expect(host.runtime.updateReadiness.inspect().counts.lifecycleWork).toBe(0));expect(view.task.getSnapshot().value).toBeUndefined();
  } finally {gate.resolve(9);await host.dispose();}
 });
 it('connects the canonical class application to existing host lifecycle observations',async()=>{
  const gate=deferred<number>();class App extends NSEApplication { readonly task=managedTask(this,{lifetime:'owner',policy:'latest',run:()=>gate.promise}); }
  const host=createClassApplicationHost(App,'com.example.managed-observation');
  try {
   await host.launch();const session=applicationSessionFor({runtimeId:host.runtime.runtimeId,appId:host.appId})!;const app=session.app as App;
   await vi.waitFor(()=>expect(host.runtime.updateReadiness.inspect().counts.lifecycleWork).toBe(0));const run=app.task.run(undefined);
   expect(host.runtime.updateReadiness.inspect().counts.lifecycleWork).toBe(1);run.cancel();await run.finished;expect(host.runtime.updateReadiness.inspect().counts.lifecycleWork).toBe(1);
   host.runtime.store.mutate(draft=>{draft.loginServices.synId='generated-switched-account';});expect(host.runtime.updateReadiness.inspect().activationAuthorized).toBe(false);
   gate.resolve(4);await vi.waitFor(()=>expect(host.runtime.updateReadiness.inspect().counts.lifecycleWork).toBe(0));
   expect(host.runtime.updateReadiness.inspect().coverage.flatMap(row=>row.gaps)).toContain('managed-task-owners');expect(host.runtime.updateReadiness.getSnapshot().client.readiness).toBe('unknown');
  } finally {gate.resolve(4);await host.dispose();}
 });
});
