import { getNSEObjectOwners } from './objectLifetime';

/** @internal Ports supplied by the canonical session; never an ambient current app. */
export interface AuthoringContext {
  /** Optional host observation only; never task scheduling or commit authority. */
  readonly observeManagedTask?: (work: Promise<void>) => void;
  readonly scheduler: {
    setTimeout(callback: () => void, delayMs: number): { dispose(): void };
  };
  readonly errors: { capture(error: unknown, context: {readonly operation:string}): void };
  readonly persistence: {
    getPreference<T>(key:string, fallback:T):T;
    setPreference<T>(key:string, value:T):boolean;
  };
  subscribePreferences(listener:()=>void):()=>void;
}
const contexts = new WeakMap<object,AuthoringContext>();
/** @internal Install once on an owning application, or an explicitly scoped window. */
export function attachNSEAuthoringContext(owner:object, context:AuthoringContext):void { contexts.set(owner,context); }
/** @internal Lookup by recorded containment, not overridable application getters. */
export function getNSEAuthoringContext(owner:object):AuthoringContext|undefined {
  for (const candidate of getNSEObjectOwners(owner)) { const context=contexts.get(candidate); if(context) return context; }
  return undefined;
}
