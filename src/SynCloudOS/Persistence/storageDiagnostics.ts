/* SynWare SDK — Copyright © 2026 Syndromatic Ltd. Apache-2.0. */

/** A refusal applies to this query; it is not a persistent permission verdict. */
export interface StorageDiagnosticsUnavailable {
  readonly state: "unsupported" | "denied" | "failed";
}
export type StorageEstimateObservation = StorageDiagnosticsUnavailable | Readonly<{
  state: "observed";
  /** Approximate origin-level bytes; null means the browser omitted this field. */
  usageBytes: number | null;
  quotaBytes: number | null;
  approximate: true;
}>;
export type StoragePersistenceObservation = StorageDiagnosticsUnavailable | Readonly<{
  state: "observed";
  /** Current default-bucket status, not a durability or offline guarantee. */
  persisted: boolean;
}>;
export interface StorageDiagnosticsSnapshot {
  readonly estimate: StorageEstimateObservation;
  readonly persistence: StoragePersistenceObservation;
}
export interface StorageDiagnosticsClient {
  /** Queries only on demand. Cancellation/revoked ownership rejects without
   * returning late results; it cannot cancel the browser's underlying query. */
  inspect(signal?: AbortSignal): Promise<StorageDiagnosticsSnapshot>;
}


const unsupported: StorageDiagnosticsUnavailable = Object.freeze({ state: "unsupported" });
function failure(error: unknown): StorageDiagnosticsUnavailable {
  let name: unknown;
  try { name = error && typeof error === "object" ? Reflect.get(error, "name") : null; } catch { /* Never expose the raw error. */ }
  return Object.freeze({ state: name === "SecurityError" || name === "NotAllowedError" ? "denied" : "failed" });
}
function estimate(value: unknown): StorageEstimateObservation {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid estimate");
  const bytes = (key: string) => {
    const v: unknown = Reflect.get(value, key);
    if (v === undefined) return null;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new TypeError("Invalid estimate field");
    return v;
  };
  // Ignore usageDetails and every unrelated field. Do not enumerate stores,
  // infer device free space or clamp inconsistent browser estimates.
  return Object.freeze({ state: "observed", usageBytes: bytes("usage"), quotaBytes: bytes("quota"), approximate: true });
}
function persistence(value: unknown): StoragePersistenceObservation {
  if (typeof value !== "boolean") throw new TypeError("Invalid persistence status");
  return Object.freeze({ state: "observed", persisted: value });
}
async function query<T>(storage: StorageManager | null, key: "estimate" | "persisted", signal: AbortSignal, parse: (value: unknown) => T): Promise<T | StorageDiagnosticsUnavailable> {
  signal.throwIfAborted();
  try {
    const method = storage?.[key];
    if (typeof method !== "function") return unsupported;
    signal.throwIfAborted();
    return parse(await Reflect.apply(method, storage, []));
  } catch (error) {
    signal.throwIfAborted();
    return failure(error);
  }
}
function whileOwned<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", abort);
    const abort = () => { cleanup(); reject(signal.reason); };
    signal.addEventListener("abort", abort, { once: true });
    // Both branches remain attached after logical cancellation. Browser
    // promises are not cancellable; late rejections must remain observed.
    pending.then(value => { cleanup(); if (signal.aborted) reject(signal.reason); else resolve(value); }, error => { cleanup(); reject(error); });
    if (signal.aborted) abort();
  });
}
/** A request-only reader shared by scoped app clients and host Settings.
 * No subscriptions, caches, writes, permission probes or persistence requests. */
export function createStorageDiagnosticsClient(input: {
  readonly signal: AbortSignal;
  readonly assertLive: () => void;
  readonly getNavigator: () => Navigator | null;
}): StorageDiagnosticsClient {
  return Object.freeze({
    async inspect(callerSignal?: AbortSignal): Promise<StorageDiagnosticsSnapshot> {
      input.assertLive(); input.signal.throwIfAborted(); callerSignal?.throwIfAborted();
      const signal = callerSignal ? AbortSignal.any([input.signal, callerSignal]) : input.signal;
      let storage: StorageManager | null;
      try { storage = input.getNavigator()?.storage ?? null; }
      catch (error) { const result = failure(error); input.assertLive(); signal.throwIfAborted(); return Object.freeze({ estimate: result, persistence: result }); }
      const pending = Promise.all([query(storage, "estimate", signal, estimate), query(storage, "persisted", signal, persistence)]);
      const [estimateResult, persistenceResult] = await whileOwned(pending, signal);
      input.assertLive(); signal.throwIfAborted();
      return Object.freeze({ estimate: estimateResult, persistence: persistenceResult });
    },
  });
}
