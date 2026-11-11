import { getNSEObjectLifetime } from "./objectLifetime";

interface Finalizer { readonly phase: number; readonly connect: () => void; done: boolean; }
const finalizers = new WeakMap<object, Finalizer[]>();

/** @internal Declarations register work; the session/host chooses the construction boundary. */
export function registerNSEAuthoringFinalizer(owner: object, connect: () => void, phase = 0): void {
  let entries = finalizers.get(owner);
  if (!entries) { entries = []; finalizers.set(owner, entries); }
  entries.push({ phase, connect, done: false });
}

/** @internal Hydrate/connect only after all derived fields and constructors completed. */
export function finalizeNSEAuthoringOwner(owner: object, visited = new Set<object>()): void {
  if (visited.has(owner)) return;
  visited.add(owner);
  const lifetime = getNSEObjectLifetime(owner);
  if (!lifetime || lifetime.isDisposed) return;
  for (const entry of [...(finalizers.get(owner) ?? [])].sort((a, b) => a.phase - b.phase)) {
    if (entry.done) continue;
    entry.connect();
    entry.done = true;
  }
  for (const child of lifetime.scope.adoptedObjects) finalizeNSEAuthoringOwner(child, visited);
}
