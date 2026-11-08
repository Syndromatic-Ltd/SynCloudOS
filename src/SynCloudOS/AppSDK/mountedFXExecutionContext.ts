import type { SynWareRuntime } from "./appRuntimeTypes";
import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";
import { runInOwnedExecutionContext, type OwnedExecutionContext } from "../nseRuntimeContracts";

// Terminal associations intentionally survive revocation until the facade is GC'd.
const contexts = new WeakMap<SynWareRuntime, OwnedExecutionContext>();
export function registerMountedFXExecutionContext(runtime: SynWareRuntime, context: OwnedExecutionContext): void {
  if (contexts.has(runtime)) throw new TypeError("A mounted facade cannot replace its execution authority.");
  contexts.set(runtime, context);
}
/** Lookup conveys identity only; entering or using the context still checks liveness. */
export function mountedFXExecutionContext(runtime: SynWareRuntime): OwnedExecutionContext | undefined { return contexts.get(runtime); }

export function applicationResourceErrorReporter(runtime: SynCloudOSRuntime, appId: string): (error: unknown) => void {
  const capture = runtime.errors.capture.bind(runtime.errors);
  return error => runInOwnedExecutionContext(null, () => {
    try {
      capture({ code: "APP_CONTENT_FAILED", title: "An application resource could not close",
        message: "The application could not finish releasing a resource.", error, appId,
        source: "Application resource cleanup", category: "resource" });
    } catch { /* The error reporter is terminal and must never escape an AbortSignal listener. */ }
  });
}
