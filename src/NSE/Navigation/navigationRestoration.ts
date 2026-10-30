import type { NSEViewController } from "../Application/NSEViewController";
import { getNSEAuthoringContext, type NSEAuthoringContext } from "../Application/authoringContext";
import { getNSEObjectLifetime } from "../Application/objectLifetime";
import type { PreferencesAdapter } from "../Controllers/NSEPreferencesController";
import { encodeNSEPreference, equalNSEPreference, parseNSEPreference, readNSEPreference, validateNSEPreferenceDescriptor, writeNSEPreference, type NSEPreferenceDescriptor } from "../Objects/preference";
import type { NSETabBarController } from "./NSETabBarController";

export interface NSENavigationRestorationDescriptor<Controller extends NSEViewController<unknown>, Value> extends NSEPreferenceDescriptor<Value> {
  capture(snapshot: ReturnType<Controller["getSnapshot"]>): Value;
  restore(controller: Controller, value: Value): void;
  /** Existing preferences adapter for use outside an attached application. */
  readonly preferences?: PreferencesAdapter;
  /** App-owned route policy; explicit incoming routes take precedence on connection. */
  hasExplicitRoute?(controller: Controller): boolean;
}

/** @internal Connect to canonical controller state after construction/context attachment. */
export function connectNSENavigationRestoration<Controller extends NSEViewController<unknown>, Value>(controller: Controller, descriptor: NSENavigationRestorationDescriptor<Controller, Value>): void {
  validateNSEPreferenceDescriptor(descriptor);
  const attached = getNSEAuthoringContext(controller);
  const adapter = descriptor.preferences;
  if (!attached && !adapter) throw new TypeError("Navigation restoration requires an attached app context or explicit preferences adapter.");
  const context: NSEAuthoringContext = adapter ? {
    scheduler: attached?.scheduler ?? { setTimeout: () => { throw new TypeError("No scheduler is attached."); } },
    errors: attached?.errors ?? { capture: error => { throw error; } },
    subscribePreferences: attached?.subscribePreferences ?? (() => () => {}),
    persistence: {
      getPreference: <T,>(key: string, fallback: T): T => { const value = adapter.read(key); return value === undefined ? fallback : value as T; },
      setPreference: (key, value) => {
        const result = adapter.write(key, value);
        if (result && typeof result.then === "function") { void Promise.resolve(result).catch(() => {}); throw new TypeError("Navigation preference writes must be synchronous."); }
        return true;
      },
    },
  } : attached!;
  const stored = context.persistence.getPreference<unknown>(descriptor.key, undefined);
  const hydrated = readNSEPreference(descriptor, stored);
  if (!descriptor.hasExplicitRoute?.(controller) && hydrated.value !== undefined) {
    const restored: unknown = descriptor.restore(controller, hydrated.value);
    if (restored && typeof Reflect.get(restored as object, "then") === "function") { void Promise.resolve(restored).catch(() => {}); throw new TypeError("Navigation restoration callbacks must be synchronous."); }
  }
  let captured = parseNSEPreference(descriptor, descriptor.capture(controller.getSnapshot() as ReturnType<Controller["getSnapshot"]>));
  const persist = (value: Value) => writeNSEPreference(context, descriptor.key,
    encodeNSEPreference(descriptor, value, context.persistence.getPreference<unknown>(descriptor.key, undefined)));
  if (hydrated.writeForward && !descriptor.hasExplicitRoute?.(controller)) persist(captured);
  const lifetime = getNSEObjectLifetime(controller)!;
  const stop = controller.subscribe(() => {
    if (lifetime.scope.authoritySignal.aborted) return;
    try {
      const next = parseNSEPreference(descriptor, descriptor.capture(controller.getSnapshot() as ReturnType<Controller["getSnapshot"]>));
      if (equalNSEPreference(next, captured)) return;
      // Re-read before each write: an external newer schema is never overwritten.
      if (readNSEPreference(descriptor, context.persistence.getPreference(descriptor.key, undefined)).newer) return;
      persist(next); captured = next;
    } catch (error) { context.errors.capture(error, { operation: "navigation.restoration" }); }
  });
  lifetime.scope.authoritySignal.addEventListener("abort", stop, { once: true });
}

/** Persist only selected identity; localized titles never become navigation state. */
export function createNSETabSelectionRestoration(options: {
  readonly key: string;
  readonly preferences?: PreferencesAdapter;
  readonly hasExplicitRoute?: (controller: NSETabBarController) => boolean;
}): NSENavigationRestorationDescriptor<NSETabBarController, string> {
  return {
    ...options, version: 1, migrations: [],
    parse: value => typeof value === "string" ? { ok: true, value } : { ok: false, issues: ["A tab selection must be a destination id."] },
    capture: snapshot => snapshot.selectedDestinationId,
    restore: (controller, value) => controller.restore({ selectedDestinationId: value }),
  };
}
