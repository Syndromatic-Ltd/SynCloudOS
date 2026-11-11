import { useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import type { NSEBinding, NSEBindingEdit, NSEBindingSnapshot } from './bindingTypes';

export interface NSEBindingView<T> { readonly snapshot: NSEBindingSnapshot<T>; readonly editor: NSEBindingEdit<T> }

/** Each mounted consumer has an independent edit lease. No lease starts in render. */
export function useNSEBinding<T>(binding: NSEBinding<T>): NSEBindingView<T> {
  const snapshot = useSyncExternalStore(binding.subscribe, binding.getSnapshot, binding.getSnapshot);
  const lease = useMemo(() => ({ edit: undefined as NSEBindingEdit<T> | undefined, epoch: null as object | null }), [binding]);
  const cancel = useMemo(() => () => {
    const edit = lease.edit;
    lease.edit = undefined;
    edit?.cancel();
  }, [lease]);
  useLayoutEffect(() => {
    const epoch = {};
    lease.epoch = epoch;
    return () => {
      if (lease.epoch === epoch) lease.epoch = null;
      cancel();
    };
  }, [lease, cancel]);
  const editor = useMemo(() => {
    const get = () => {
      const epoch = lease.epoch;
      if (!epoch) return undefined;
      if (lease.edit) return lease.edit;
      const edit = binding.beginEditing();
      if (lease.epoch !== epoch) { edit.cancel(); return undefined; }
      return lease.edit = edit;
    };
    return {
      preview(value: T) { get()?.preview(value); },
      async commit(value: T) {
        const epoch = lease.epoch;
        const edit = get();
        if (!edit) return { status: 'cancelled' as const };
        const result = await edit.commit(value);
        if (lease.epoch !== epoch || lease.edit !== edit) return { status: 'cancelled' as const };
        if (result.status !== 'invalid') lease.edit = undefined;
        return result;
      },
      cancel,
    };
  }, [binding, lease, cancel]);
  return { snapshot, editor };
}
