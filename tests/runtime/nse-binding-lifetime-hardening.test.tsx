// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { NSEObject } from '../../src/NSE/Objects/NSEObject';
import { createNSEBinding } from '../../src/NSE/Bindings/createNSEBinding';
import { bind } from '../../src/NSE/Bindings/propertyBinding';
import { PreferencePersistenceError } from '../../src/NSE/Controllers/NSEPreferencesController';
import { NSEViewController } from '../../src/NSE/Application/NSEViewController';
import { nseUnowned } from '../../src/NSE/Controllers/ownership';
import { observable } from '../../src/NSE/Objects/observable';
import { useNSEBinding } from '../../src/NSE/Bindings/useNSEBinding';
import { useNSEValueBinding } from '../../src/NSE/Controls/Core/useNSEValueBinding';
import type { NSEBinding, NSEBindingCommitResult } from '../../src/NSE/Bindings/bindingTypes';

class Owner extends NSEObject {
  readonly abort = new AbortController();
  get ownerSignal() { return this.abort.signal; }
}
const snapshot = Object.freeze({ revision: 1, value: { kind: 'value' as const, value: 'opening' }, readOnly: false, issues: [] });
afterEach(cleanup);

describe('binding acquisition and pending commit authority', () => {
  it('releases an adapter acquired while beginEditing synchronously disposes the owner', () => {
    const owner = new Owner(); const cancel = vi.fn();
    const binding = createNSEBinding<string>(owner, { source: owner, read: () => snapshot, beginEditing() {
      owner.abort.abort();
      return { preview() {}, cancel, async commit() { return { status: 'committed' }; } };
    } });
    binding.beginEditing();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('releases a subscription acquired while the source synchronously disposes the owner', () => {
    const owner = new Owner(); const stop = vi.fn(); const listener = vi.fn();
    const binding = createNSEBinding<string>(owner, {
      source: { getSnapshot: () => 0, subscribe() { owner.abort.abort(); return stop; } }, read: () => snapshot,
      beginEditing: () => ({ preview() {}, cancel() {}, async commit() { return { status: 'committed' }; } }),
    });
    binding.subscribe(listener);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not read a disposed adapter to construct its unavailable snapshot', () => {
    const owner = new Owner();
    const binding = createNSEBinding<string>(owner, { source: owner, read() {
      if (owner.ownerSignal.aborted) throw new Error('disposed document');
      return snapshot;
    }, beginEditing: () => ({ preview() {}, cancel() {}, async commit() { return { status: 'committed' }; } }) });
    binding.getSnapshot(); owner.abort.abort();
    expect(binding.getSnapshot()).toMatchObject({ readOnly: true, value: { kind: 'unavailable' } });
  });

  it('preserves a rejected write after cancellation as an unknown outcome', async () => {
    const owner = new Owner(); const failure = new Error('unknown write outcome');
    let reject!: (error: unknown) => void;
    const binding = createNSEBinding<string>(owner, { source: owner, read: () => snapshot,
      beginEditing: () => ({ preview() {}, cancel() {}, commit: () => new Promise((_, fail) => { reject = fail; }) }),
    });
    const editor = binding.beginEditing(); const pending = editor.commit('value');
    editor.cancel(); reject(failure);
    await expect(pending).rejects.toBe(failure);
  });

  it('fences a pending result after cancelling an arbitrary binding editor', async () => {
    let resolve!: (result: NSEBindingCommitResult) => void;
    const binding: NSEBinding<string> = { subscribe: () => () => {}, getSnapshot: () => snapshot,
      beginEditing: () => ({ preview() {}, cancel() {}, commit: () => new Promise(done => { resolve = done; }) }),
    };
    const hook = renderHook(() => useNSEBinding(binding));
    const pending = hook.result.current.editor.commit('old');
    hook.result.current.editor.cancel();
    resolve({ status: 'invalid', issues: [{ code: 'old', message: 'Obsolete issue' }] });
    await expect(pending).resolves.toEqual({ status: 'cancelled' });
  });

  it('clears an edit before calling arbitrary cancellation that reenters the hook', () => {
    const cancel = vi.fn();
    let editor!: ReturnType<typeof useNSEBinding<string>>['editor'];
    const binding: NSEBinding<string> = { subscribe: () => () => {}, getSnapshot: () => snapshot,
      beginEditing: () => ({ preview() {}, cancel() { cancel(); if (cancel.mock.calls.length === 1) editor.cancel(); }, async commit() { return { status: 'committed' }; } }),
    };
    const hook = renderHook(() => useNSEBinding(binding)); editor = hook.result.current.editor;
    act(() => editor.preview('draft')); editor.cancel();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('does not cancel an already committed canonical adapter transaction', async () => {
    const owner = new Owner(); const cancel = vi.fn();
    const binding = createNSEBinding<string>(owner, { source: owner, read: () => snapshot,
      beginEditing: () => ({ preview() {}, cancel, async commit() { return { status: 'committed' }; } }),
    });
    const edit = binding.beginEditing(); await edit.commit('saved'); edit.cancel();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('does not retain validation from a previously selected binding', async () => {
    const owner = new Owner();
    const one = createNSEBinding<string>(owner, { source: owner, read: () => snapshot,
      beginEditing: () => ({ preview() {}, cancel() {}, async commit() { return { status: 'invalid', issues: [{ code: 'old', message: 'Old validation' }] }; } }),
    });
    const two = createNSEBinding<string>(owner, { source: owner, read: () => snapshot,
      beginEditing: () => ({ preview() {}, cancel() {}, async commit() { return { status: 'committed' }; } }),
    });
    type Props = { value?: string; onValueChange?: (value: string) => void; validation?: { message: string } };
    const hook = renderHook(({ binding }) => useNSEValueBinding<string, Props>({ binding }, { fallback: '' }), { initialProps: { binding: one } });
    await act(async () => { hook.result.current.onValueChange!('invalid'); });
    expect(hook.result.current.validation?.message).toBe('Old validation');
    hook.rerender({ binding: two });
    expect(hook.result.current.validation).toBeUndefined();
  });

  it('presents a refused preference write as an invalid edit and permits retry', async () => {
    let value = 'opening'; let refused = true;
    class Preferences extends Owner {
      get title() { return value; }
      set title(next: string) { if (refused) throw new PreferencePersistenceError('Storage refused this preference.'); value = next; }
    }
    const owner = new Preferences(); const edit = bind(owner, 'title').beginEditing();
    expect(() => edit.preview('draft')).not.toThrow();
    expect(await edit.commit('saved')).toMatchObject({ status: 'invalid', issues: [{ message: 'Storage refused this preference.' }] });
    expect(owner.title).toBe('opening'); refused = false;
    expect(await edit.commit('saved')).toEqual({ status: 'committed' });
    expect(owner.title).toBe('saved');
  });

  it('revokes a controller editor before ordered controller teardown begins', () => {
    let edit!: ReturnType<NSEBinding<string>['beginEditing']>;
    class View extends NSEViewController {
      @observable accessor title = 'opening';
      protected override didDispose() {
        expect(this.ownerSignal.aborted).toBe(false);
        edit.preview('late teardown write');
      }
    }
    const view = new View({ owner: nseUnowned }); const binding = bind(view, 'title');
    edit = binding.beginEditing(); edit.preview('draft');
    view.dispose();
    expect(view.title).toBe('draft');
    expect(binding.getSnapshot().value.kind).toBe('unavailable');
  });
});
