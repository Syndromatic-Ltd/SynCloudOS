/** SDK-private synchronous capabilities, shared by NSE and FX. No runtime construction. */
declare const ownedContextBrand: unique symbol;
export interface OwnedExecutionContext { readonly [ownedContextBrand]: true }

export interface OwnedExecutionLifetime {
  readonly signal: AbortSignal;
  assertLive(): void;
  registerResource(resource: object, dispose: () => void): () => void;
  /** Trusted nonthrowing sink: owner aggregation or the host's existing error reporter. */
  reportResourceError(error: unknown): void;
}

/** Only trusted host seams issue records. The record is never returned to a consumer. */
export interface OwnedExecutionRecord extends OwnedExecutionLifetime {
  readonly process: object;
  readonly ports: ReadonlyMap<symbol, unknown>;
}

const records = new WeakMap<OwnedExecutionContext, OwnedExecutionRecord>();
let current: OwnedExecutionContext | null = null;

function liveRecord(context: OwnedExecutionContext): OwnedExecutionRecord {
  const record = records.get(context);
  if (!record) throw new TypeError("Owned execution requires an authentic issued context.");
  record.signal.throwIfAborted();
  record.assertLive();
  record.signal.throwIfAborted();
  return record;
}

function validateLifetime(lifetime: OwnedExecutionLifetime): void {
  if (!(lifetime.signal instanceof AbortSignal) || typeof lifetime.assertLive !== "function" || typeof lifetime.registerResource !== "function" || typeof lifetime.reportResourceError !== "function") {
    throw new TypeError("Owned execution requires a signal, liveness validator, resource registration callback and error reporting sink.");
  }
  lifetime.signal.throwIfAborted();
  lifetime.assertLive();
  lifetime.signal.throwIfAborted();
}

function publish(record: OwnedExecutionRecord): OwnedExecutionContext {
  validateLifetime(record);
  const context = Object.freeze({}) as OwnedExecutionContext;
  records.set(context, Object.freeze(record));
  return context;
}

export function issueOwnedExecutionContext(record: OwnedExecutionRecord): OwnedExecutionContext {
  if (!record.process || typeof record.process !== "object") throw new TypeError("Owned execution requires an exact process identity object.");
  validateLifetime(record);
  if (!record.ports || typeof record.ports[Symbol.iterator] !== "function") throw new TypeError("Owned execution requires a private port map.");
  const ports = new Map(record.ports);
  for (const key of ports.keys()) if (typeof key !== "symbol") throw new TypeError("Private execution ports require symbol keys.");
  const assertLive = record.assertLive.bind(record);
  const registerResource = record.registerResource.bind(record);
  const reportResourceError = record.reportResourceError.bind(record);
  return publish({
    process: record.process, signal: record.signal, ports,
    assertLive, registerResource, reportResourceError,
  });
}

export function currentOwnedExecutionContext(): OwnedExecutionContext | null { return current; }

export function requireOwnedExecutionContext(operation: string): OwnedExecutionContext {
  if (!current) throw new TypeError(`${operation} requires an active owned execution context.`);
  liveRecord(current);
  return current;
}

/** Returning a promise ends this scope immediately; native async work never inherits it. */
export function runInOwnedExecutionContext<T>(context: OwnedExecutionContext | null, work: () => T): T {
  if (context !== null) liveRecord(context);
  const previous = current;
  current = context;
  try { return work(); }
  finally { current = previous; }
}

export function narrowOwnedExecutionContext(parent: OwnedExecutionContext, lifetime: OwnedExecutionLifetime): OwnedExecutionContext {
  const record = liveRecord(parent);
  validateLifetime(lifetime);
  const assertLive = lifetime.assertLive.bind(lifetime);
  const registerResource = lifetime.registerResource.bind(lifetime);
  const reportResourceError = lifetime.reportResourceError.bind(lifetime);
  return publish({
    process: record.process, ports: record.ports,
    signal: AbortSignal.any([record.signal, lifetime.signal]),
    assertLive() { liveRecord(parent); assertLive(); },
    registerResource, reportResourceError,
  });
}

export function assertOwnedExecutionContextLive(context: OwnedExecutionContext): void { liveRecord(context); }
export function ownedExecutionContextSignal(context: OwnedExecutionContext): AbortSignal { return liveRecord(context).signal; }
export function getOwnedExecutionPort<T>(context: OwnedExecutionContext, key: symbol): T | undefined { return liveRecord(context).ports.get(key) as T | undefined; }
export function sameOwnedExecutionProcess(first: OwnedExecutionContext, second: OwnedExecutionContext): boolean { return liveRecord(first).process === liveRecord(second).process; }
export function registerOwnedExecutionResource(context: OwnedExecutionContext, resource: object, dispose: () => void): () => void {
  if (!resource || (typeof resource !== "object" && typeof resource !== "function") || typeof dispose !== "function") throw new TypeError("Owned execution requires an object resource and cleanup callback.");
  const record = liveRecord(context);
  let active = true;
  let release: (() => void) | undefined;
  let releasePending = false;
  const detach = () => {
    record.signal.removeEventListener("abort", abortCleanup);
    if (release) { const unregister = release; release = undefined; unregister(); }
    else releasePending = true;
  };
  const cleanup = () => {
    if (!active) return;
    active = false;
    try { detach(); } finally { runInOwnedExecutionContext(null, dispose); }
  };
  const abortCleanup = () => {
    try { cleanup(); }
    catch (error) {
      // EventTarget would otherwise turn this into an asynchronous uncaught error.
      // A reentrant abort must not lend the reporter another owner's authority.
      runInOwnedExecutionContext(null, () => record.reportResourceError(error));
    }
  };
  record.signal.addEventListener("abort", abortCleanup, { once: true });
  try {
    release = record.registerResource(resource, cleanup);
    if (typeof release !== "function") throw new TypeError("Owned resource registration must return an unregister callback.");
    // Registration may synchronously revoke its own authority before returning.
    if (releasePending) { const unregister = release; release = undefined; unregister(); }
    liveRecord(context);
    return () => { if (active) { active = false; detach(); } };
  } catch (error) {
    try { cleanup(); } catch { /* Complete rollback without replacing the acquisition error. */ }
    throw error;
  }
}
