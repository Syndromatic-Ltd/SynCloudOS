import type { NSEObservable } from '../Objects/observable';
import type { ControllerValidationIssue } from '../Controllers/NSEController';

export type NSEBindingValue<T> =
  | { readonly kind: 'value'; readonly value: T }
  | { readonly kind: 'empty' }
  | { readonly kind: 'mixed' }
  | { readonly kind: 'unavailable'; readonly reason: string };
export interface NSEBindingSnapshot<T> {
  readonly revision: number;
  readonly value: NSEBindingValue<T>;
  readonly readOnly: boolean;
  readonly issues: readonly ControllerValidationIssue[];
}
export type NSEBindingCommitResult =
  | { readonly status: 'committed' }
  | { readonly status: 'invalid'; readonly issues: readonly ControllerValidationIssue[] }
  | { readonly status: 'cancelled' };
export interface NSEBindingEdit<T> {
  preview(value: T): void;
  commit(value: T): Promise<NSEBindingCommitResult>;
  cancel(): void;
}
export interface NSEBinding<T> extends NSEObservable {
  subscribe(listener: () => void): () => void;
  getSnapshot(): NSEBindingSnapshot<T>;
  beginEditing(): NSEBindingEdit<T>;
}
export interface NSEBindingOwner extends NSEObservable {
  readonly ownerSignal?: AbortSignal;
}
export interface NSEBindingAdapter<T> {
  readonly source: NSEObservable;
  read(): NSEBindingSnapshot<T>;
  beginEditing(): NSEBindingEdit<T>;
}
/** Binding is an alternative value authority, never a second writer/history. */
export type NSEBoundValueProps<T, Props, Keys extends PropertyKey = 'value' | 'defaultValue' | 'onValueChange' | 'undoManager'> =
  | (Props & { readonly binding?: never })
  | (Omit<Props, Keys> & { readonly binding: NSEBinding<T> } & { readonly [K in Keys]?: never });
