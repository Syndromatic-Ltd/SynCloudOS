import type { NSEBinding, NSEBindingAdapter, NSEBindingEdit, NSEBindingOwner, NSEBindingSnapshot } from './bindingTypes';
import { getNSEObjectLifetime } from '../Application/objectLifetime';

function equivalentValue<T>(a: NSEBindingSnapshot<T>["value"], b: NSEBindingSnapshot<T>["value"]): boolean {
  if (a === b) return true;
  if (a.kind !== b.kind) return false;
  if (a.kind === "value" && b.kind === "value") return Object.is(a.value, b.value);
  if (a.kind === "unavailable" && b.kind === "unavailable") return a.reason === b.reason;
  return true;
}
function equivalentSnapshot<T>(a: NSEBindingSnapshot<T>, b: NSEBindingSnapshot<T>): boolean {
  if (a === b) return true;
  return a.revision === b.revision && a.readOnly === b.readOnly && equivalentValue(a.value, b.value)
    && a.issues.length === b.issues.length && a.issues.every((issue, index) => issue === b.issues[index]);
}

/**
 * Adapts an existing document/selection transaction without creating history.
 *
 * `adapter.read()` may build a new snapshot on every call: the binding returns the previous snapshot
 * object while revision, value, readOnly and issues are unchanged, so React sees a stable value.
 */
export function createNSEBinding<T>(owner: NSEBindingOwner, adapter: NSEBindingAdapter<T>): NSEBinding<T> {
  let unavailable: NSEBindingSnapshot<T> | undefined;
  let revision = 0;
  const signal = getNSEObjectLifetime(owner)?.scope.authoritySignal ?? owner.ownerSignal;
  const live = () => !signal?.aborted;
  let last: NSEBindingSnapshot<T> | undefined;
  const read = (): NSEBindingSnapshot<T> => {
    if (live()) {
      const snapshot = adapter.read();
      revision = snapshot.revision;
      // getSnapshot feeds useSyncExternalStore, which loops forever when every call returns a new
      // object. An adapter may build its snapshot on each read; an equivalent one keeps its identity.
      if (live()) return last = last !== undefined && equivalentSnapshot(last, snapshot) ? last : snapshot;
    }
    // The adapter can own a disposed document. Never read it after revocation.
    return unavailable ??= Object.freeze({
      revision: revision + 1, value: Object.freeze({ kind: 'unavailable', reason: 'owner-disposed' }), readOnly: true, issues: Object.freeze([]),
    });
  };
  return Object.freeze({
    getSnapshot: read,
    subscribe(listener: () => void) {
      if (!live()) return () => undefined;
      let subscribed = true;
      let stop: unknown;
      const release = () => { const previous = stop; stop = undefined; if (typeof previous === 'function') previous(); };
      const cleanup = () => {
        if (!subscribed) return;
        subscribed = false;
        signal?.removeEventListener('abort', abort);
        release();
      };
      const abort = () => { cleanup(); listener(); };
      signal?.addEventListener('abort', abort, { once: true });
      try {
        stop = adapter.source.subscribe(() => { if (live() && subscribed) listener(); });
        // Acquisition may synchronously dispose the owner before returning.
        if (!subscribed) release();
        else if (!live()) abort();
      } catch (error) { cleanup(); throw error; }
      return cleanup;
    },
    beginEditing(): NSEBindingEdit<T> {
      const snapshot = read();
      let active = live() && !snapshot.readOnly && snapshot.value.kind !== 'unavailable';
      let edit: NSEBindingEdit<T> | undefined;
      const finish = () => { active = false; edit = undefined; signal?.removeEventListener('abort', abort); };
      const abort = () => {
        const previous = edit;
        finish();
        previous?.cancel();
      };
      if (active) {
        signal?.addEventListener('abort', abort, { once: true });
        try {
          edit = adapter.beginEditing();
          if (!active || !live()) abort();
        } catch (error) { finish(); throw error; }
      }
      return {
        preview(value) {
          if (!active || !live()) return;
          const current = read();
          if (!current.readOnly && current.value.kind !== 'unavailable') edit!.preview(value);
        },
        async commit(value) {
          if (!active || !live() || read().readOnly || read().value.kind === 'unavailable') { abort(); finish(); return { status: 'cancelled' }; }
          // Unexpected/unknown-outcome storage failures remain rejected promises.
          const result = await edit!.commit(value);
          if (!active || !live()) { finish(); return { status: 'cancelled' }; }
          if (result.status !== 'invalid') finish();
          return result;
        },
        cancel: abort,
      };
    },
  });
}
