import { getNSEObjectOwners } from './objectLifetime';

/** @internal Ports supplied by the canonical session; never an ambient current app. */
export interface NSEAuthoringContext {
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
const contexts = new WeakMap<object,NSEAuthoringContext>();
/** @internal Install once on an owning application, or an explicitly scoped window. */
export function attachNSEAuthoringContext(owner:object, context:NSEAuthoringContext):void { contexts.set(owner,context); }
/** @internal Lookup by recorded containment, not overridable application getters. */
export function getNSEAuthoringContext(owner:object):NSEAuthoringContext|undefined {
  for (const candidate of getNSEObjectOwners(owner)) { const context=contexts.get(candidate); if(context) return context; }
  return undefined;
}
