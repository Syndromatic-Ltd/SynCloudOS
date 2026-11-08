import { bindNSEOwnedResource, constructNSEOwnedResource, isNSEOwnedResource } from "../Controllers/ownership";
import { getNSEObjectLifetime } from "./objectLifetime";

export type NSEDisposable = { dispose(): void };
/** A thenable disposable is still asynchronous and cannot be an owned factory result. */
export type NSESynchronousDisposable<T extends NSEDisposable> = T & { readonly then?: never };

/** @internal Shared implementation of application/window/view own(factory). */
export function ownNSEFactory<T extends NSEDisposable>(owner: object, factory: (signal: AbortSignal) => NSESynchronousDisposable<T>): T {
  const lifetime = getNSEObjectLifetime(owner);
  if (!lifetime) throw new TypeError("Owned construction requires an NSE application, window or view controller.");
  const assertLive = () => {
    if (lifetime.isDisposed) throw lifetime.record.error({ code: "NSE_CONTROLLER_DISPOSED", operation: "own", access: "call" });
    lifetime.scope.assertLive();
  };
  assertLive();
  if (factory.constructor.name === "AsyncFunction") throw new TypeError("own(factory) requires synchronous construction; async factory bodies cannot run. Use managedTask instead.");
  return constructNSEOwnedResource(lifetime.scope, () => {
    const result = factory(lifetime.scope.authoritySignal);
    if (result && typeof (result as { then?: unknown }).then === "function") {
      // Observe native promise rejection so invalid async factories cannot cause an unhandled rejection.
      const asynchronous: unknown = result;
      if (asynchronous instanceof Promise) void asynchronous.catch(() => {});
      throw new TypeError("own(factory) requires synchronous construction; async/thenable results are forbidden. Use managedTask for asynchronous work.");
    }
    if (!result || typeof result.dispose !== "function") throw new TypeError("own(factory) must return a disposable resource.");
    if (getNSEObjectLifetime(result)) throw new TypeError("own(factory) cannot construct application/window/view controllers; use addChild(Class, ...args) or openWindow instead.");
    const alreadyOwned = isNSEOwnedResource(result, lifetime.scope.signal);
    if (!alreadyOwned) {
      if (lifetime.isDisposed || lifetime.scope.authoritySignal.aborted) {
        try { result.dispose(); } finally { assertLive(); }
      }
      bindNSEOwnedResource(result, lifetime.scope.signal, () => result.dispose());
    }
    assertLive();
    return result;
  });
}
