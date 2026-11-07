import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentController, InMemoryDocumentAdapter } from '../../src/SynCloudOS/Documents';
import { documentAdoptionAuthority } from '../../src/SynCloudOS/Documents/documentAdoptionAuthority';
import { createDocumentTestDependencies } from '../fixtures/documentTestDependencies';
import { createTestRuntime } from './helpers';
import { noteType } from '../fixtures/noteDocumentType';
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return{promise,resolve};};
const cleanups:(()=>Promise<void>)[]=[];
afterEach(async()=>{for(const cleanup of cleanups.splice(0).reverse())await cleanup();vi.restoreAllMocks();});
async function fixture(key='generated'){
 const dependencies=createDocumentTestDependencies(),controller=new DocumentController(dependencies),adapter=new InMemoryDocumentAdapter(dependencies.environment);
 controller.registerType(noteType);controller.registerAdapter(adapter);cleanups.push(async()=>{for(const doc of controller.openDocuments)await doc.markClosed(documentAdoptionAuthority);await dependencies.cleanup();});
 const doc=await controller.newDocument({typeId:noteType.id,location:{kind:'memory',namespace:'generated-storage-observation',key}});
 return{controller,adapter,doc};
}
const count=(controller:DocumentController)=>(controller.activity.getSnapshot() as unknown as {storageCallbacks:number}).storageCallbacks;
describe('actual document storage callback observation',()=>{
 it.each([false,true])('holds a noncooperative provider past terminal handoff and close, reject=%s',async(fail)=>{
  const {controller,adapter,doc}=await fixture(),gate=deferred(),write=adapter.write.bind(adapter),caller=new AbortController();
  const provider=vi.spyOn(adapter,'write').mockImplementationOnce(async(...args)=>{await gate.promise;if(fail)throw Error('generated provider failure');return write({...args[0],signal:undefined});});
  const token=doc.beginTerminalReconciliation(documentAdoptionAuthority),saving=doc.saveTerminalReconciliation(token,documentAdoptionAuthority,caller.signal).catch(error=>error);
  cleanups.push(async()=>{gate.resolve();await saving;});await vi.waitFor(()=>expect(provider).toHaveBeenCalledOnce());expect(count(controller)).toBe(1);
  caller.abort();expect(await saving).toMatchObject({code:'document-write-outcome-unknown'});expect(count(controller)).toBe(1);
  await doc.endTerminalReconciliation(token,documentAdoptionAuthority);await doc.markClosed(documentAdoptionAuthority);expect(count(controller)).toBe(1);
  gate.resolve();await vi.waitFor(()=>expect(count(controller)).toBe(0));expect(doc.state).toBe('closed');
 });
 it('checks caller authority after observation before starting another provider write',async()=>{
  const {controller,adapter,doc}=await fixture(),caller=new AbortController(),write=vi.spyOn(adapter,'write');
  const stop=controller.activity.subscribe(()=>{if(count(controller)>0)caller.abort();});
  try {await expect(doc.save({reason:'explicit',signal:caller.signal})).rejects.toBeDefined();expect(write).not.toHaveBeenCalled();await vi.waitFor(()=>expect(count(controller)).toBe(0));}
  finally{stop();}
 });
 it('retains overlapping idempotency recovery and original write promises independently',async()=>{
  const {controller,adapter,doc}=await fixture(),writeGate=deferred(),recoveryGate=deferred(),write=adapter.write.bind(adapter),caller=new AbortController();
  const provider=vi.spyOn(adapter,'write').mockImplementationOnce(async request=>{await writeGate.promise;return write({...request,signal:undefined});});
  const recover=vi.fn(async()=>{await recoveryGate.promise;return null;});Object.assign(adapter,{recoverWriteByIdempotencyKey:recover});
  const token=doc.beginTerminalReconciliation(documentAdoptionAuthority),saving=doc.saveTerminalReconciliation(token,documentAdoptionAuthority,caller.signal).catch(error=>error);
  cleanups.push(async()=>{writeGate.resolve();recoveryGate.resolve();await saving;});await vi.waitFor(()=>expect(provider).toHaveBeenCalledOnce());caller.abort();await saving;
  const recovering=doc.recoverTerminalReconciliationWrite(token,documentAdoptionAuthority).catch(error=>error);await vi.waitFor(()=>expect(recover).toHaveBeenCalledOnce());expect(count(controller)).toBe(2);
  recoveryGate.resolve();expect(await recovering).toMatchObject({code:'document-write-outcome-unknown'});await vi.waitFor(()=>expect(count(controller)).toBe(1));writeGate.resolve();await vi.waitFor(()=>expect(count(controller)).toBe(0));await doc.endTerminalReconciliation(token,documentAdoptionAuthority);
 });
 it('publishes busy facts and changed evidence through the actual host without approving activation',async()=>{
  const runtime=createTestRuntime({authenticationPolicy:'disabled',applicationDocuments:{initialAdapters:[]}}),gate=deferred();cleanups.push(async()=>{gate.resolve();await runtime.dispose();});runtime.store.mutate(draft=>{draft.booted=true;});
  const adapter=new InMemoryDocumentAdapter(runtime.environment);runtime.documents.registerType(noteType);runtime.documents.registerAdapter(adapter);const doc=await runtime.documents.newDocument({typeId:noteType.id,location:{kind:'memory',namespace:'generated-host-work',key:'note'}}),write=adapter.write.bind(adapter);
  vi.spyOn(adapter,'write').mockImplementationOnce(async request=>{await gate.promise;return write(request);});const generation=runtime.updateReadiness.inspect().client.generation,saving=doc.save({reason:'explicit'});cleanups.push(async()=>{gate.resolve();await Promise.allSettled([saving]);});
  await vi.waitFor(()=>expect(runtime.updateReadiness.inspect().counts.documentStorageWork).toBe(1));expect(runtime.updateReadiness.getSnapshot().client.generation).toBeGreaterThan(generation);expect(runtime.updateReadiness.getSnapshot().client.blockers).toContain('owner-busy');expect(runtime.updateReadiness.getSnapshot().activationAuthorized).toBe(false);
  gate.resolve();await saving;await vi.waitFor(()=>expect(runtime.updateReadiness.inspect().counts.documentStorageWork).toBe(0));expect(runtime.updateReadiness.getSnapshot().client.readiness).toBe('unknown');expect(runtime.updateReadiness.getSnapshot().coverage.flatMap(row=>row.gaps)).toContain('resource-terminal-work');
 });
 it('keeps mandatory fenced-write compensation observable after the document closes',async()=>{
  const {controller,adapter,doc}=await fixture('compensating'),writeGate=deferred(),cleanupGate=deferred(),write=adapter.write.bind(adapter),remove=adapter.remove.bind(adapter);
  const provider=vi.spyOn(adapter,'write').mockImplementationOnce(async request=>{await writeGate.promise;return write({...request,signal:undefined});});
  const cleanup=vi.spyOn(adapter,'remove').mockImplementationOnce(async(...args)=>{await cleanupGate.promise;return remove(...args);});const saving=doc.save({reason:'explicit'}).catch(error=>error);cleanups.push(async()=>{writeGate.resolve();cleanupGate.resolve();await saving;});
  await vi.waitFor(()=>expect(provider).toHaveBeenCalledOnce());await doc.markClosed(documentAdoptionAuthority);writeGate.resolve();await vi.waitFor(()=>expect(cleanup).toHaveBeenCalledOnce());expect(count(controller)).toBe(1);
  cleanupGate.resolve();expect(await saving).toMatchObject({code:'document-aborted'});await vi.waitFor(()=>expect(count(controller)).toBe(0));expect(doc.state).toBe('closed');
 });
 it('counts independent callbacks without leaking document identity into observations',async()=>{
  const {controller,adapter,doc}=await fixture('one'),other=await controller.newDocument({typeId:noteType.id,location:{kind:'memory',namespace:'generated-storage-observation',key:'two'}}),gate=deferred(),write=adapter.write.bind(adapter);
  vi.spyOn(adapter,'write').mockImplementation(async(...args)=>{await gate.promise;return write(...args);});const first=doc.save({reason:'explicit'}),second=other.save({reason:'explicit'});cleanups.push(async()=>{gate.resolve();await Promise.allSettled([first,second]);});
  await vi.waitFor(()=>expect(count(controller)).toBe(2));const facts=controller.activity.getSnapshot();expect(Object.isFrozen(facts)).toBe(true);expect(JSON.stringify(facts)).not.toContain(doc.id);expect(JSON.stringify(facts)).not.toContain(other.id);
  gate.resolve();await Promise.all([first,second]);await vi.waitFor(()=>expect(count(controller)).toBe(0));
 });
});
