import { PreferencePersistenceError } from "../Controllers/NSEPreferencesController";
import { mutableClone, ownImmutable } from "../Controllers/immutableValue";
import { getNSEAuthoringContext, type NSEAuthoringContext } from "../Application/authoringContext";
import { registerNSEAuthoringFinalizer } from "../Application/authoringLifecycle";
import { getNSEObjectLifetime } from "../Application/objectLifetime";
import { publishObservableChange } from "./observable";

export interface NSEPreferenceDescriptor<T> {
  readonly key: string;
  readonly version: number;
  readonly parse: (value: unknown) => { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issues: readonly string[] };
  readonly migrations: readonly { readonly from: number; readonly to: number; readonly migrate: (value: unknown) => unknown }[];
}
export const nsePreferenceEnvelopeTag = "syncloudos:nse-preferences:v1";
const absent = Symbol("absent preference");

/** @internal Version zero explicitly adapts existing raw app formats without adding an envelope. */
export function encodeNSEPreference<T>(descriptor: NSEPreferenceDescriptor<T>, value: T, stored: unknown): unknown {
  return descriptor.version === 0 && !(Array.isArray(stored) && stored[0] === nsePreferenceEnvelopeTag)
    ? value : [nsePreferenceEnvelopeTag, descriptor.version, value];
}

/** @internal Shared descriptor validation for preferences and navigation adapters. */
export function validateNSEPreferenceDescriptor<T>(descriptor: NSEPreferenceDescriptor<T>): void {
  if (!descriptor.key.trim()) throw new TypeError("A preference key must be explicit and nonempty.");
  if (!Number.isSafeInteger(descriptor.version) || descriptor.version < 0) throw new TypeError("A preference version must be a nonnegative safe integer.");
  const seen = new Set<number>();
  for (const migration of descriptor.migrations) {
    if (!Number.isSafeInteger(migration.from) || migration.from < 0 || migration.to !== migration.from + 1 || migration.to > descriptor.version || seen.has(migration.from)) throw new TypeError("Preference migrations must uniquely connect consecutive supported versions.");
    seen.add(migration.from);
  }
}

/** @internal Validated immutable values, using the existing controller boundary. */
export function parseNSEPreference<T>(descriptor: NSEPreferenceDescriptor<T>, value: unknown): T {
  const result = descriptor.parse(value);
  if (!result.ok) throw new TypeError(`Preference "${descriptor.key}" failed validation: ${result.issues.join(", ")}`);
  return ownImmutable(result.value, mutableClone);
}

/** @internal No write is authorized for an envelope from a newer schema. */
export function readNSEPreference<T>(descriptor: NSEPreferenceDescriptor<T>, persisted: unknown): { readonly value?: T; readonly writeForward: boolean; readonly newer: boolean } {
  let version = 0; let raw = persisted;
  if (Array.isArray(persisted) && persisted[0] === nsePreferenceEnvelopeTag) {
    if (persisted.length !== 3 || !Number.isSafeInteger(persisted[1]) || persisted[1] < 0) return { writeForward: false, newer: false };
    version = persisted[1]; raw = persisted[2];
  }
  if (version > descriptor.version) return { writeForward: false, newer: true };
  const initialVersion = version;
  try {
    while (version < descriptor.version) {
      const migration = descriptor.migrations.find(candidate => candidate.from === version);
      if (!migration) return { writeForward: false, newer: false };
      raw = migration.migrate(ownImmutable(raw, mutableClone)); version = migration.to;
    }
    return { value: parseNSEPreference(descriptor, raw), writeForward: initialVersion < descriptor.version, newer: false };
  } catch { return { writeForward: false, newer: false }; }
}

/** @internal Persist before publishing; adapters returning anything but true refused. */
export function writeNSEPreference(context: NSEAuthoringContext, key: string, value: unknown): void {
  try {
    if (context.persistence.setPreference(key, mutableClone(value)) !== true) throw new Error("The storage adapter refused the write.");
  } catch (error) {
    throw new PreferencePersistenceError(`Preference "${key}" could not be persisted: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** @internal Compare validated persisted projections, not their freshly read identities. */
export function equalNSEPreference(left: unknown, right: unknown): boolean {
  return Object.is(left, right) || JSON.stringify(mutableClone(left)) === JSON.stringify(mutableClone(right));
}

// Scoped notifications complement the canonical store subscription; storage
// writes themselves do not necessarily publish a runtime-store revision.
const channels = new WeakMap<NSEAuthoringContext, Map<string, Set<() => void>>>();
function channel(context: NSEAuthoringContext, key: string): Set<() => void> {
  let keys = channels.get(context); if (!keys) { keys = new Map(); channels.set(context, keys); }
  let listeners = keys.get(key); if (!listeners) { listeners = new Set(); keys.set(key, listeners); }
  return listeners;
}

export function preference(key: string): <This extends object, T extends string | number | boolean>(target: ClassAccessorDecoratorTarget<This, T>, context: ClassAccessorDecoratorContext<This, T>) => ClassAccessorDecoratorResult<This, T>;
export function preference<T>(descriptor: NSEPreferenceDescriptor<T>): <This extends object>(target: ClassAccessorDecoratorTarget<This, T>, context: ClassAccessorDecoratorContext<This, T>) => ClassAccessorDecoratorResult<This, T>;
export function preference<T>(declaration: string | NSEPreferenceDescriptor<T>) {
  if (typeof declaration === "string") { if (!declaration.trim()) throw new TypeError("A preference key must be explicit and nonempty."); }
  else validateNSEPreferenceDescriptor(declaration);
  return <This extends object>(_target: ClassAccessorDecoratorTarget<This, T>, member: ClassAccessorDecoratorContext<This, T>): ClassAccessorDecoratorResult<This, T> => {
    if (member.static || member.private || typeof member.name !== "string") throw new TypeError("@preference requires a public instance accessor.");
    type State = { value: T; defaultValue: T; dirty: boolean; ready: boolean; writing: boolean; newer: boolean; context?: NSEAuthoringContext };
    const states = new WeakMap<This, State>();
    const key = typeof declaration === "string" ? declaration : declaration.key;
    const validate = (state: State, value: unknown): T => {
      if (typeof declaration !== "string") return parseNSEPreference(declaration, value);
      if (!["string", "number", "boolean"].includes(typeof state.defaultValue) || typeof value !== typeof state.defaultValue || (typeof value === "number" && !Number.isFinite(value))) throw new TypeError(`Preference "${key}" requires its initializer's finite primitive kind.`);
      return value as T;
    };
    const persisted = (value: T, ports: NSEAuthoringContext): unknown => typeof declaration === "string" ? value
      : encodeNSEPreference(declaration, value, ports.persistence.getPreference<unknown>(key, absent));
    member.addInitializer(function (this: This) {
      registerNSEAuthoringFinalizer(this, () => {
        const state = states.get(this)!;
        const ports = getNSEAuthoringContext(this);
        if (!ports) throw new TypeError(`Preference "${key}" requires an attached app context before finalization.`);
        const lifetime = getNSEObjectLifetime(this)!;
        state.context = ports;
        const read = () => {
          const stored = ports.persistence.getPreference<unknown>(key, absent);
          if (stored === absent) return { value: state.defaultValue, writeForward: false, newer: false };
          if (typeof declaration !== "string") return readNSEPreference(declaration, stored);
          try { return { value: validate(state, stored), writeForward: false, newer: false }; } catch { return { writeForward: false, newer: false }; }
        };
        const stored = read(); state.newer = stored.newer;
        if (state.dirty || stored.writeForward) {
          if (stored.newer) throw new PreferencePersistenceError(`Preference "${key}" uses a newer unsupported schema.`);
          const value = state.dirty ? state.value : stored.value!;
          writeNSEPreference(ports, key, persisted(value, ports));
          state.value = value;
        } else if (stored.value !== undefined) state.value = stored.value;
        state.ready = true;
        const echo = () => {
          if (state.writing || lifetime.scope.authoritySignal.aborted) return;
          const result = read(); state.newer = result.newer;
          if (result.value !== undefined && !equalNSEPreference(result.value, state.value)) { state.value = result.value; publishObservableChange(this); }
        };
        const listeners = channel(ports, key);
        const signal = lifetime.scope.authoritySignal;
        let stop: (() => void) | undefined;
        let released = false;
        const cleanup = () => {
          if (released) return;
          released = true;
          try { stop?.(); } finally { listeners.delete(echo); signal.removeEventListener("abort", cleanup); }
        };
        signal.addEventListener("abort", cleanup, { once: true });
        try {
          listeners.add(echo);
          stop = ports.subscribePreferences(echo);
          if (released) { const acquired = stop; stop = undefined; acquired(); }
          else if (signal.aborted) cleanup();
        } catch (error) { state.ready = false; cleanup(); throw error; }
      }, 10);
    });
    return {
      init(this: This, value: T) {
        if (!getNSEObjectLifetime(this)) throw new TypeError("@preference requires an NSE application/window/view owner.");
        const state: State = { value, defaultValue: value, dirty: false, ready: false, writing: false, newer: false };
        state.value = state.defaultValue = validate(state, value); states.set(this, state); return state.value;
      },
      get(this: This) { return states.get(this)!.value; },
      set(this: This, candidate: T) {
        const state = states.get(this)!;
        const lifetime = getNSEObjectLifetime(this)!; lifetime.scope.assertLive();
        const value = validate(state, candidate);
        if (!state.ready) { state.value = value; state.dirty = true; return; }
        if (equalNSEPreference(value, state.value)) return;
        const ports = state.context!;
        const stored = ports.persistence.getPreference<unknown>(key, absent);
        if (typeof declaration !== "string" && readNSEPreference(declaration, stored).newer) throw new PreferencePersistenceError(`Preference "${key}" uses a newer unsupported schema.`);
        state.writing = true;
        try { writeNSEPreference(ports, key, persisted(value, ports)); } finally { state.writing = false; }
        state.value = value; publishObservableChange(this);
        for (const echo of [...channel(ports, key)]) echo();
      },
    };
  };
}
