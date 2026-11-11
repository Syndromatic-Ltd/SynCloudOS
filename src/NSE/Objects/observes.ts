import { registerNSEAuthoringFinalizer } from "../Application/authoringLifecycle";
import { getNSEAuthoringContext } from "../Application/authoringContext";
import { getNSEObjectLifetime } from "../Application/objectLifetime";
import { getNSETaskLifetime, subscribeNSEActivity, type NSEActivitySnapshot, type NSETaskLifetime } from "../Application/viewActivity";
import type { NSEObservable } from "./observable";

export interface NSEObservationOptions { readonly lifetime: NSETaskLifetime; readonly initial?: boolean; }
type Observer<This, Value> = (this: This, value: Value, previous: Value | undefined) => void;
type Synchronous<Method extends (...args: never[]) => unknown> = ReturnType<Method> extends PromiseLike<unknown> ? never : Method;

export function observes<Key extends string>(key: Key, options: NSEObservationOptions): <This extends Record<Key, unknown>, Method extends Observer<This, This[Key]>>(method: Method & Synchronous<Method>, context: ClassMethodDecoratorContext<This, Method>) => void;
export function observes<This extends object, Source extends NSEObservable, Value>(source: (owner: This) => Source, options: NSEObservationOptions & { readonly select: (snapshot: ReturnType<Source["getSnapshot"]>) => Value }): <Method extends Observer<This, Value>>(method: Method & Synchronous<Method>, context: ClassMethodDecoratorContext<This, Method>) => void;
export function observes<This extends object, Source extends NSEObservable>(source: (owner: This) => Source, options: NSEObservationOptions): <Method extends Observer<This, ReturnType<Source["getSnapshot"]>>>(method: Method & Synchronous<Method>, context: ClassMethodDecoratorContext<This, Method>) => void;
export function observes(source: string | Function, options: NSEObservationOptions & { readonly select?: Function }): unknown {
  if (!["owner", "mounted", "visible"].includes(options.lifetime)) throw new TypeError("An observation requires an explicit supported lifetime.");
  return (method: Function, member: ClassMethodDecoratorContext) => {
    if (member.static || member.private || typeof member.name !== "string") throw new TypeError("@observes requires a public string-named instance method.");
    if (method.constructor.name === "AsyncFunction") throw new TypeError("@observes methods must be synchronous; start a managedTask explicitly.");
    const name = member.name;
    member.addInitializer(function (this: unknown) {
      const owner = this as object & NSEObservable;
      registerNSEAuthoringFinalizer(owner, () => connectObservation(owner, source, options, name), 20);
    });
  };
}

function connectObservation(owner: object & NSEObservable, source: string | Function, options: NSEObservationOptions & { readonly select?: Function }, name: string): void {
  const lifetime = getNSEObjectLifetime(owner);
  if (!lifetime) throw new TypeError("@observes requires an NSE lifetime owner.");
  let epoch: NSEActivitySnapshot | undefined;
  let currentSource: NSEObservable | undefined;
  let stopSource: (() => void) | undefined;
  let stopOwner: (() => void) | undefined;
  let queued = false;
  let delivered: unknown;
  let deliveries = 0;
  let reset: { dispose(): void } | undefined;
  let blocked = false;
  const report = (error: unknown) => {
    const context = getNSEAuthoringContext(owner);
    if (context) context.errors.capture(error, { operation: `observes.${name}` });
    else queueMicrotask(() => { throw error; });
  };
  const select = () => {
    if (typeof source === "string") return Reflect.get(owner, source);
    const snapshot = currentSource!.getSnapshot();
    return options.select ? options.select(snapshot as never) : snapshot;
  };
  const invoke = (value: unknown, previous: unknown) => {
    if (++deliveries > 100) { blocked = true; throw new Error(`Observation "${name}" did not converge after 100 synchronous deliveries.`); }
    if (!reset) {
      const clear = () => { reset = undefined; deliveries = 0; };
      reset = getNSEAuthoringContext(owner)?.scheduler.setTimeout(clear, 0) ?? (() => { const id = setTimeout(clear, 0); return { dispose: () => clearTimeout(id) }; })();
    }
    const result: unknown = Reflect.get(owner, name).call(owner, value, previous);
    if (result && (typeof result === "object" || typeof result === "function") && typeof Reflect.get(result, "then") === "function") {
      void Promise.resolve(result).catch(() => {});
      throw new TypeError(`Observation "${name}" returned a thenable; observer methods must be synchronous.`);
    }
  };
  const rebind = () => {
    const candidate = typeof source === "string" ? owner : source(owner as never);
    if (!candidate || typeof candidate.subscribe !== "function" || typeof candidate.getSnapshot !== "function") throw new TypeError(`Observation "${name}" did not resolve an observable source.`);
    if (candidate === currentSource) return;
    stopSource?.(); stopSource = undefined; currentSource = candidate;
    if (candidate !== owner) { const stop = candidate.subscribe(schedule); stopSource = typeof stop === "function" ? stop as () => void : undefined; }
  };
  const schedule = () => {
    if (queued || !epoch?.active || epoch.signal.aborted || blocked) return;
    queued = true; const captured = epoch;
    queueMicrotask(() => {
      if (epoch !== captured) return;
      queued = false;
      if (captured.signal.aborted || blocked) return;
      try {
        rebind(); const value = select();
        if (Object.is(value, delivered)) return;
        const previous = delivered; delivered = value; invoke(value, previous);
      } catch (error) { report(error); }
    });
  };
  const end = () => {
    epoch = undefined; queued = false;
    stopSource?.(); stopOwner?.(); stopSource = stopOwner = undefined; currentSource = undefined;
    reset?.dispose(); reset = undefined; deliveries = 0;
  };
  const update = () => {
    const next = getNSETaskLifetime(owner, options.lifetime);
    if (!next.active) { end(); return; }
    if (epoch === next) return;
    end(); epoch = next; blocked = false;
    rebind(); delivered = select();
    const stop = owner.subscribe(schedule); stopOwner = typeof stop === "function" ? stop as () => void : undefined;
    if (options.initial) invoke(delivered, undefined);
  };
  const stopActivity = subscribeNSEActivity(owner, update);
  lifetime.scope.authoritySignal.addEventListener("abort", () => { end(); stopActivity(); }, { once: true });
  try { update(); } catch (error) { end(); stopActivity(); throw error; }
}
