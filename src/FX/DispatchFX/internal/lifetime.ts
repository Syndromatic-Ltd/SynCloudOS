import { createFXSessionBinding, fxAttributedClass, observeFXSessionEnd, type FXAppSession } from "../../../SynCloudOS/fxRuntimeContracts";
import { clientError } from "./time";
import { reportDispatchError } from "./work";

/** Cooperative attribution, never a service or permission authority. */
export interface DispatchLifetime {
  readonly appId: string | null;
  ended: boolean;
  readonly jobs: Set<() => void>;
  readonly resources: Set<() => void>;
}
const sessions = new WeakMap<FXAppSession, DispatchLifetime>();
const owners = new WeakMap<object, DispatchLifetime>();
const selectedClasses = new WeakMap<Function, DispatchLifetime>();
const classes = new WeakMap<Function, WeakMap<DispatchLifetime, Function>>();
export const systemLifetime: DispatchLifetime = { appId: null, ended: false, jobs: new Set(), resources: new Set() };
export function sessionLifetime(session: FXAppSession): DispatchLifetime {
  let lifetime = sessions.get(session);
  if (!lifetime) {
    lifetime = { appId: session.appId, ended: false, jobs: new Set(), resources: new Set() };
    sessions.set(session, lifetime);
    const selected = lifetime;
    observeFXSessionEnd(session, () => {
      selected.ended = true;
      // Drop normal continuations before resources enqueue their cancel callouts.
      for (const set of [selected.jobs, selected.resources]) {
        for (const dispose of [...set]) {
          try {
            dispose();
          } catch (error) {
            reportDispatchError(error);
          }
        }
        set.clear();
      }
    });
  }
  return lifetime;
}
export function assertLifetime(lifetime: DispatchLifetime): void {
  if (lifetime.ended) clientError("application session ended");
}
export function selectLifetime(type: Function): DispatchLifetime {
  for (let current: Function | null = type; current; current = Object.getPrototypeOf(current)) {
    const lifetime = selectedClasses.get(current);
    if (lifetime) {
      assertLifetime(lifetime);
      return lifetime;
    }
  }
  try {
    return sessionLifetime(
      createFXSessionBinding(type, reason => new Error(`BUG IN CLIENT OF LIBDISPATCH: application session ${reason}`)).resolve(),
    );
  } catch (error) {
    if (error instanceof Error && !error.message.startsWith("BUG IN CLIENT OF LIBDISPATCH: ")) clientError(error.message);
    throw error;
  }
}
export function initialiseLifetime(object: object, type: Function): void {
  const lifetime = selectLifetime(type);
  assertLifetime(lifetime);
  owners.set(object, lifetime);
}
export function lifetimeOf(object: object): DispatchLifetime {
  const value = owners.get(object);
  if (!value) clientError("invalid dispatch lifetime");
  return value;
}
export function assertOwner(object: object): DispatchLifetime {
  const value = lifetimeOf(object);
  assertLifetime(value);
  return value;
}
export function onLifetimeEnd(lifetime: DispatchLifetime, callback: () => void, jobs = false): () => void {
  if (lifetime === systemLifetime) return () => {};
  if (lifetime.ended) {
    callback();
    return () => {};
  }
  const set = jobs ? lifetime.jobs : lifetime.resources;
  set.add(callback);
  return () => {
    set.delete(callback);
  };
}
/** Hidden subclasses retain both owning app-class and base-class identity. */
export function classForLifetime<T extends Function>(Base: T, lifetime: DispatchLifetime): T {
  let values = classes.get(Base);
  if (!values) {
    values = new WeakMap();
    classes.set(Base, values);
  }
  let value = values.get(lifetime);
  if (!value) {
    value = class extends (Base as unknown as new (...args: any[]) => object) {};
    Object.defineProperty(value, "name", { value: Base.name });
    selectedClasses.set(value, lifetime);
    values.set(lifetime, value);
  }
  return value as T;
}
/** Attach metadata outside the declaration-bearing Apple class body. */
export function attributeDispatchClass(type: Function): void {
  Object.defineProperty(type, fxAttributedClass, { value: true });
}
