import { useState } from 'react';
import { useNSEBinding } from '../../Bindings/useNSEBinding';
import type { NSEBinding, NSEBindingEdit, NSEBindingSnapshot, NSEBoundValueProps } from '../../Bindings/bindingTypes';
import type { NSEControlInteractionPhase } from './controlTypes';
import type { ControllerValidationIssue } from '../../Controllers/NSEController';

const emptySnapshot: NSEBindingSnapshot<never> = Object.freeze({ revision: 0, value: Object.freeze({kind:'empty'}), readOnly:false, issues:Object.freeze([]) });
const emptyBinding: NSEBinding<never> = {
  subscribe: () => () => undefined, getSnapshot: () => emptySnapshot,
  beginEditing: () => ({ preview() {}, cancel() {}, async commit() { return {status:'cancelled'}; } }),
};
interface ValueMapping<T> {
  readonly value?: string;
  readonly change?: string;
  readonly excludes?: readonly string[];
  readonly fallback: T;
  readonly phase?: 'preview' | 'commit';
  readonly mixedValue?: T;
  readonly disableReadOnly?: boolean;
  readonly cancellable?: boolean;
}
/** @internal Passed only to controls that consume it, never to a DOM element. */
export interface ValueBindingControlProps<T> { readonly __nseBindingEditor?:NSEBindingEdit<T> }

/** Shared bridge into each existing control's native interaction implementation. */
export function useNSEValueBinding<T, P extends object, K extends PropertyKey = 'value'|'defaultValue'|'onValueChange'|'undoManager'>(
  input: NSEBoundValueProps<T, P, K>, mapping: ValueMapping<T>,
): P {
  const props = input as P & { binding?: NSEBinding<T> };
  const { binding, ...rest } = props;
  const { snapshot, editor } = useNSEBinding<T>(binding ?? emptyBinding as NSEBinding<T>);
  const [failure, setFailure] = useState<{error:unknown} | null>(null);
  const [validation,setValidation]=useState<{binding:NSEBinding<T>;issues:readonly ControllerValidationIssue[]}|null>(null);
  if (failure) throw failure.error;
  if (!binding) return props;
  const valueKey = mapping.value ?? 'value';
  const changeKey = mapping.change ?? 'onValueChange';
  for (const key of new Set([valueKey, changeKey, 'defaultValue', 'undoManager', ...(mapping.excludes ?? [])])) {
    if (Object.prototype.hasOwnProperty.call(rest, key) && Reflect.get(rest, key) !== undefined) {
      throw new TypeError(`NSE binding cannot be combined with ${key}; choose one value authority.`);
    }
  }
  const unavailable = snapshot.value.kind === 'unavailable' || snapshot.value.kind === 'empty';
  const value = snapshot.value.kind === 'value' ? snapshot.value.value
    : snapshot.value.kind === 'mixed' ? mapping.mixedValue ?? mapping.fallback : mapping.fallback;
  const editIssues=validation?.binding===binding?validation.issues:[];
  const issues=editIssues.length?editIssues:snapshot.issues;
  return {
    ...rest,
    ...(mapping.cancellable?{__nseBindingEditor:editor}:{}),
    [valueKey]: value,
    disabled: Reflect.get(rest, 'disabled') || unavailable || (mapping.disableReadOnly && snapshot.readOnly),
    readOnly: Reflect.get(rest, 'readOnly') || snapshot.readOnly,
    'data-nse-binding-state':snapshot.value.kind,
    ...(snapshot.value.kind==='mixed'?{'aria-valuetext':'Mixed'}:{}),
    ...(issues.length ? { validation: {kind:'invalid', code:issues[0].code, message:issues[0].message} } : {}),
    [changeKey]: (next: T, phase: NSEControlInteractionPhase = mapping.phase ?? 'commit') => {
      if (snapshot.readOnly || unavailable) return;
      if (phase === 'cancel') {editor.cancel();setValidation(null);}
      else if (phase === 'preview') editor.preview(next);
      else void editor.commit(next).then(result => {
        if (result.status === 'invalid') {
          setValidation({binding,issues:result.issues});return;
        }
        if(result.status==='committed')setValidation(null);
      }).catch(error => setFailure({error}));
    },
  } as P;
}
