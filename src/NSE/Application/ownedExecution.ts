import {
  assertOwnedExecutionContextLive, narrowOwnedExecutionContext, runInOwnedExecutionContext,
  type OwnedExecutionContext,
} from "../../SynCloudOS/nseRuntimeContracts";
import { bindNSEOwnedResource, getNSEOwnerScope, isNSEOwnershipScope, type NSEOwnershipScope } from "../Controllers/ownership";

const contexts = new WeakMap<NSEOwnershipScope, OwnedExecutionContext>();

/** One attachment per real scope; callers cannot replace a retired mount's authority. */
export function attachNSEExecutionContext(scope: NSEOwnershipScope, parent: OwnedExecutionContext): void {
  if (!isNSEOwnershipScope(scope)) throw new TypeError("Execution authority requires a recorded NSE ownership scope.");
  if (contexts.has(scope)) throw new TypeError("An NSE scope's execution context is already attached; rebinding is forbidden.");
  assertOwnedExecutionContextLive(parent);
  const context = narrowOwnedExecutionContext(parent, {
    signal: scope.authoritySignal,
    assertLive: () => scope.assertLive(),
    registerResource: (resource, dispose) => bindNSEOwnedResource(resource, scope.signal, dispose),
  });
  contexts.set(scope, context);
}

/** Inherit only exact framework scope records, never the ambient execution context. */
export function inheritNSEExecutionContext(scope: NSEOwnershipScope, parent: NSEOwnershipScope | undefined): void {
  if (contexts.has(scope) || !parent) return;
  const context = contexts.get(parent);
  if (context) attachNSEExecutionContext(scope, context);
}

/** Internal construction boundary; explicit null prevents borrowing an outer owner's context. */
export function runWithNSEScopeExecution<T>(scope: NSEOwnershipScope, work: () => T): T {
  return runInOwnedExecutionContext(contexts.get(scope) ?? null, work);
}

/** Private callback entry uses recorded ownership, never overridable application getters. */
export function runWithNSEOwnerExecution<T>(owner: object, work: () => T): T {
  const scope = getNSEOwnerScope(owner);
  scope?.assertLive();
  return runInOwnedExecutionContext(scope ? contexts.get(scope) ?? null : null, work);
}
