import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentController, InMemoryDocumentAdapter } from '../../src/SynCloudOS/Documents';
import { documentAdoptionAuthority } from '../../src/SynCloudOS/Documents/documentAdoptionAuthority';
import { createDocumentTestDependencies } from '../fixtures/documentTestDependencies';
import { noteType } from '../fixtures/noteDocumentType';
const cleanups: (() => Promise<unknown> | void)[] = [];
const gate = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { resolve, promise }; };
afterEach(async () => { for (const clean of cleanups.splice(0).reverse()) await clean(); vi.restoreAllMocks(); });
async function fixture() {
 const dependencies = createDocumentTestDependencies(), controller = new DocumentController(dependencies);
 controller.registerType(noteType); controller.registerAdapter(new InMemoryDocumentAdapter(dependencies.environment));
 cleanups.push(async () => { for (const d of controller.openDocuments) await d.markClosed(documentAdoptionAuthority); await dependencies.cleanup(); });
 const document = await controller.newDocument({ typeId: noteType.id });
 return { controller, document, read: () => controller.activity.getSnapshot() };
}
describe('document editing owner observations', () => {
 it('counts membership without invoking participant or lifetime callbacks during inspection', async () => {
  const {document,read}=await fixture(), settle=vi.fn(()=>({status:'settled' as const})), discard=vi.fn(), isCurrent=vi.fn(()=>true);
  const member={id:'generated-private-id',settle,discard}; const registration=document.registerEditingParticipant(member,{isCurrent});
  isCurrent.mockClear();expect(read().editingParticipants).toBe(1);const prior=read();expect(Object.isFrozen(prior)).toBe(true);
  expect(read()).toBe(prior);expect(settle).not.toHaveBeenCalled();expect(discard).not.toHaveBeenCalled();expect(isCurrent).not.toHaveBeenCalled();
  expect(Object.keys(prior).sort()).toEqual(['admissions','cleanup','editingCallbacks','editingParticipants','editingSettlements','recovery','revision']);
  expect(JSON.stringify(prior)).not.toContain('generated-private-id');
  member.id='changed';registration.dispose();registration.dispose();expect(read().editingParticipants).toBe(0);expect(read().revision).toBeGreaterThan(prior.revision);
 });
 it('holds a noncooperative callback after caller cancellation, unregistering and document close', async () => {
  const {document,read}=await fixture(), held=gate<{status:'settled'}>(), caller=new AbortController();cleanups.push(()=>held.resolve({status:'settled'}));
  let late: {status:string} | undefined;
  const registration=document.registerEditingParticipant({id:'generated',settle: async context=>{ await held.promise;late=context.transact(m=>({...m,body:'late'}),{expectedRevision:document.dirtyRevision,actionName:'Generated late attempt'});return{status:'settled'}; }});
  expect(read().editingParticipants).toBe(1);const pending=document.settleEditing('save',caller.signal);
  await vi.waitFor(()=>expect(read()).toMatchObject({editingSettlements:1,editingCallbacks:1}));caller.abort();expect((await pending).status).toBe('revoked');
  await vi.waitFor(()=>expect(read().editingSettlements).toBe(0));registration.dispose();await document.markClosed(documentAdoptionAuthority);
  expect(read()).toMatchObject({editingParticipants:0,editingCallbacks:1});held.resolve({status:'settled'});
  await vi.waitFor(()=>expect(read().editingCallbacks).toBe(0));expect(late?.status).toBe('rejected');
 });
 it('counts queued settlement until execution retires, including early queued cancellation', async () => {
  const {document,read}=await fixture(),held=gate<{status:'settled'}>(),secondAbort=new AbortController();cleanups.push(()=>held.resolve({status:'settled'}));
  document.registerEditingParticipant({id:'generated',settle:()=>held.promise});expect(read().editingParticipants).toBe(1);
  const first=document.settleEditing('save'),second=document.settleEditing('export',secondAbort.signal);
  await vi.waitFor(()=>expect(read()).toMatchObject({editingSettlements:2,editingCallbacks:1}));secondAbort.abort();expect((await second).status).toBe('revoked');
  expect(read().editingSettlements).toBe(2);held.resolve({status:'settled'});await first;
  await vi.waitFor(()=>expect(read()).toMatchObject({editingSettlements:0,editingCallbacks:0}));
 });
 it.each(['throw','refuse'] as const)('releases actual stages on %s without changing settlement receipts', async mode=>{
  const {document,read}=await fixture();document.registerEditingParticipant({id:'generated',settle:()=>{if(mode==='throw')throw new Error('Generated failure');return {status:'refused',reason:'generated-refusal'};}});
  expect(read().editingParticipants).toBe(1);expect((await document.settleEditing('save')).status).toBe('refused');
  await vi.waitFor(()=>expect(read()).toMatchObject({editingSettlements:0,editingCallbacks:0}));
 });
 it('does not leak membership when its notification revokes the registering lifetime', async()=>{
  const {document,controller,read}=await fixture(),lifetime=new AbortController();
  const release=controller.activity.subscribe(()=>{if(read().editingParticipants)lifetime.abort();});cleanups.push(release);
  const registration=document.registerEditingParticipant({id:'generated',settle:()=>({status:'settled'})},{signal:lifetime.signal});
  expect(registration.isLive).toBe(false);expect(read().editingParticipants).toBe(0);
 });
 it('rechecks admission when a callback-stage observer cancels before invocation', async()=>{
  const {document,controller,read}=await fixture(),caller=new AbortController(),settle=vi.fn(()=>({status:'settled' as const}));
  document.registerEditingParticipant({id:'generated',settle});expect(read().editingParticipants).toBe(1);
  const release=controller.activity.subscribe(()=>{if(read().editingCallbacks)caller.abort();});cleanups.push(release);
  expect((await document.settleEditing('save',caller.signal)).status).toBe('revoked');expect(settle).not.toHaveBeenCalled();
  await vi.waitFor(()=>expect(read()).toMatchObject({editingSettlements:0,editingCallbacks:0}));
 });
});
