import { createNSEBinding } from './createNSEBinding';
import { PreferencePersistenceError } from '../Controllers/NSEPreferencesController';
import { getNSEObjectLifetime } from '../Application/objectLifetime';
import type { NSEBinding, NSEBindingOwner, NSEBindingSnapshot } from './bindingTypes';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
export type NSEWritableBindingKey<T> = { [K in keyof T]-?: T[K] extends (...args: never[]) => unknown ? never
  : Equal<{ [P in K]: T[P] }, { -readonly [P in K]: T[P] }> extends true ? K : never }[keyof T];
const bindings = new WeakMap<object, Map<PropertyKey, NSEBinding<unknown>>>();
const noIssues = Object.freeze([]);

/** Inert, stable property projection; editor leases subscribe only when mounted. */
export function bind<Owner extends NSEBindingOwner, Key extends NSEWritableBindingKey<Owner>>(owner: Owner, key: Key): NSEBinding<Owner[Key]> {
  let byKey = bindings.get(owner);
  if (!byKey) { byKey = new Map(); bindings.set(owner, byKey); }
  const cached = byKey.get(key);
  if (cached) return cached as NSEBinding<Owner[Key]>;
  type Value = Owner[Key];
  const signal = getNSEObjectLifetime(owner)?.scope.authoritySignal ?? owner.ownerSignal;
  let revision = 0;
  let writeEpoch = 0;
  let snapshot: NSEBindingSnapshot<Value> | undefined;
  const read = (): NSEBindingSnapshot<Value> => {
    const value = owner[key];
    if (!snapshot || snapshot.value.kind !== 'value' || !Object.is(snapshot.value.value, value)) {
      snapshot = Object.freeze({ revision: ++revision, value: Object.freeze({ kind: 'value' as const, value }), readOnly: false, issues: noIssues });
    }
    return snapshot;
  };
  const result = createNSEBinding<Value>(owner, { source: owner, read,
    beginEditing() {
      const opening = owner[key]; let mine = -1; let epoch = -1;
      // A lease tracks selected-property revisions even without a mounted React
      // subscriber. An external A -> B -> A edit still supersedes our preview.
      const stop=owner.subscribe(()=>{read();});
      const cleanup=()=>{if(typeof stop==='function')stop();};
      const write = (value: Value) => {
        read(); owner[key] = value; mine = read().revision; epoch = ++writeEpoch;
      };
      return {
        preview(value) {
          try { write(value); } catch(error) {
            // A refused synchronous preference write preserves the canonical
            // value. Keep the draft until commit can present its validation.
            if(!(error instanceof PreferencePersistenceError))throw error;
          }
        },
        async commit(value) {
          try { write(value); } catch(error) {
            if(!(error instanceof PreferencePersistenceError))throw error;
            return {status:'invalid',issues:[{code:'preference-persistence',message:error.message}]};
          }
          cleanup();return { status: 'committed' };
        },
        cancel() { try{if (!signal?.aborted && epoch === writeEpoch && mine === read().revision) write(opening);}finally{cleanup();} },
      };
    },
  });
  byKey.set(key, result as NSEBinding<unknown>);
  return result;
}
