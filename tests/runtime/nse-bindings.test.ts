import { describe, expect, it } from 'vitest';
import { NSEObject } from '../../src/NSE/Objects/NSEObject';
import { observable } from '../../src/NSE/Objects/observable';
import { bind } from '../../src/NSE/Bindings/propertyBinding';
import { createNSEBinding } from '../../src/NSE/Bindings/createNSEBinding';

class Model extends NSEObject {
  @observable accessor title = 'opening';
  readonly abort = new AbortController();
  get ownerSignal() { return this.abort.signal; }
}

describe('value binding authority', () => {
  it('caches inert descriptors, publishes only selected property changes and shares a value', async () => {
    const owner = new Model();
    const binding = bind(owner, 'title');
    expect(bind(owner, 'title')).toBe(binding);
    const opening = binding.getSnapshot();
    owner.title = 'opening';
    expect(binding.getSnapshot()).toBe(opening);
    const edit = binding.beginEditing();
    edit.preview('draft');
    expect(owner.title).toBe('draft');
    expect(await edit.commit('saved')).toEqual({ status: 'committed' });
    expect(binding.getSnapshot().value).toEqual({ kind: 'value', value: 'saved' });
  });
  it('cancels its own preview but preserves an external edit', () => {
    const owner = new Model();
    const binding = bind(owner, 'title');
    const first = binding.beginEditing();
    first.preview('draft'); first.cancel();
    expect(owner.title).toBe('opening');
    const second = binding.beginEditing();
    second.preview('mine'); owner.title = 'external'; second.cancel();
    expect(owner.title).toBe('external');
  });
  it('does not let an old editor cancel a newer editor with an equal value', () => {
    const owner = new Model(); const binding = bind(owner, 'title');
    const first = binding.beginEditing(); first.preview('same');
    const second = binding.beginEditing(); second.preview('same');
    first.cancel(); expect(owner.title).toBe('same');
  });
  it('preserves an external edit that cycles back to the preview value between reads',()=>{
    const owner=new Model();const binding=bind(owner,'title');const edit=binding.beginEditing();
    edit.preview('mine');owner.title='external';owner.title='mine';edit.cancel();
    expect(owner.title).toBe('mine');
  });
  it('refuses edits and publications after owner disposal', async () => {
    const owner = new Model(); const binding = bind(owner, 'title');
    const edit = binding.beginEditing(); owner.abort.abort();
    edit.preview('late');
    expect(await edit.commit('late')).toEqual({ status: 'cancelled' });
    expect(owner.title).toBe('opening');
    expect(binding.getSnapshot()).toMatchObject({ readOnly: true, value: { kind: 'unavailable' } });
  });
  it('delegates transactions and keeps invalid edits active', async () => {
    const owner = new Model(); let committed = 0;
    const snapshot = { revision: 0, value: { kind: 'mixed' as const }, readOnly: false, issues: [] };
    const binding = createNSEBinding<string>(owner, {
      source: owner, read: () => snapshot,
      beginEditing: () => ({ preview() {}, cancel() {}, async commit(value) {
        if (!value) return { status: 'invalid', issues: [] };
        committed++; return { status: 'committed' };
      } }),
    });
    const edit = binding.beginEditing();
    expect(await edit.commit('')).toMatchObject({ status: 'invalid' });
    expect(await edit.commit('valid')).toMatchObject({ status: 'committed' });
    expect(committed).toBe(1);
    expect(binding.getSnapshot()).toBe(snapshot);
  });
  it('cancels pending adapter settlement after lifetime ends without hiding a rejected write', async () => {
    const owner = new Model(); let resolve!: (value: {status:'committed'}) => void;
    const binding = createNSEBinding<string>(owner, { source: owner,
      read: () => ({ revision: 0, value: { kind: 'empty' }, readOnly: false, issues: [] }),
      beginEditing: () => ({ preview() {}, cancel() {}, commit: () => new Promise(done => { resolve = done; }) }),
    });
    const result = binding.beginEditing().commit('late'); owner.abort.abort(); resolve({status:'committed'});
    expect(await result).toEqual({ status: 'cancelled' });
  });
});
