import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";
import type { SynCloudOSAppInfo } from "../SynCloudOS";
import type { TrustedSynWareBundle } from "../SynCloudOS";
import { normalizeBundleIdentifier } from "../Identity/bundleIdentifier.mjs";

/** Private process identity. It shares lifetime, never grants a capability. */
export interface ApplicationProcessAuthority {
  readonly identity: object;
  readonly signal: AbortSignal;
  assertLive(): void;
}
export interface ApplicationProcessMembership {
  readonly process: ApplicationProcessAuthority;
  release(reason?: unknown): void;
}
interface ProcessRecord {
  readonly runtime: SynCloudOSRuntime;
  readonly appId: string;
  readonly registration: object;
  readonly bundle: TrustedSynWareBundle | null;
  readonly process: ApplicationProcessAuthority;
  readonly retire: (reason?: unknown) => void;
  members: number;
}
const authentic = new WeakMap<ApplicationProcessAuthority, ProcessRecord>();
const foreground = new WeakMap<SynCloudOSRuntime, Map<object, ProcessRecord>>();
const retiring = new WeakMap<SynCloudOSRuntime, Set<string>>();
function invalid(): DOMException { return new DOMException("The application process authority is no longer live.", "AbortError"); }
function retirementGuard<T>(runtime: SynCloudOSRuntime, appId: string, work: () => T): T {
  let guard = retiring.get(runtime);
  if (!guard) retiring.set(runtime, guard = new Set());
  const key = normalizeBundleIdentifier(appId);
  const held = guard.has(key);
  guard.add(key);
  try { return work(); } finally { if (!held) guard.delete(key); }
}
function admission(runtime: SynCloudOSRuntime, app: SynCloudOSAppInfo): object {
  runtime.signal.throwIfAborted();
  if (retiring.get(runtime)?.has(normalizeBundleIdentifier(app.bundleIdentifier))) throw invalid();
  if (runtime.apps.getApp(app.bundleIdentifier) !== app) throw new DOMException("Process admission requires the canonical application.", "SecurityError");
  const registration = runtime.appManager.getManagerForApp(app.bundleIdentifier);
  if (!registration || runtime.lifecycle.getState(app.bundleIdentifier) === "closed") throw invalid();
  return registration;
}
export function assertApplicationProcessAdmission(runtime: SynCloudOSRuntime, app: SynCloudOSAppInfo): void { admission(runtime, app); }
function createRecord(runtime: SynCloudOSRuntime, app: SynCloudOSAppInfo, registration: object, parent?: AbortSignal): ProcessRecord {
  const appId = app.bundleIdentifier;
  const bundle = runtime.bundles.getBundle(appId);
  const controller = new AbortController();
  const removers: Array<() => void> = [];
  let record!: ProcessRecord;
  const current = () => !runtime.signal.aborted && !parent?.aborted
    && runtime.apps.getApp(appId) !== null
    && runtime.appManager.getManagerForApp(appId) === registration
    && runtime.bundles.getBundle(appId) === bundle
    && runtime.lifecycle.getState(appId) !== "closed";
  const retire = (reason?: unknown) => retirementGuard(runtime, appId, () => {
    if (controller.signal.aborted) return;
    const registry = foreground.get(runtime);
    if (registry?.get(registration) === record) registry.delete(registration);
    for (const remove of removers.splice(0)) remove();
    controller.abort(reason ?? invalid());
  });
  const process = Object.freeze({
    identity: Object.freeze({}), signal: controller.signal,
    assertLive() {
      if (!current()) retire();
      controller.signal.throwIfAborted();
    },
  });
  record = { runtime, appId, registration, bundle, process, retire, members: 0 };
  authentic.set(process, record);
  const observe = () => { if (!current()) retire(); };
  for (const event of ["app.manager.replace", "app.register.update", "app.unregister", "bundle.update", "bundle.unregister"]) {
    removers.push(runtime.events.subscribe(event, observe));
  }
  runtime.signal.addEventListener("abort", observe, { once: true });
  removers.push(() => runtime.signal.removeEventListener("abort", observe));
  parent?.addEventListener("abort", observe, { once: true });
  if (parent) removers.push(() => parent.removeEventListener("abort", observe));
  process.assertLive();
  return record;
}
function membership(record: ProcessRecord): ApplicationProcessMembership {
  record.process.assertLive();
  record.members++;
  let released = false;
  return Object.freeze({ process: record.process, release(reason?: unknown) {
    if (released) return;
    released = true;
    if (--record.members === 0) record.retire(reason);
  } });
}
export function acquireForegroundApplicationProcess(runtime: SynCloudOSRuntime, app: SynCloudOSAppInfo): ApplicationProcessMembership {
  const registration = admission(runtime, app);
  let registry = foreground.get(runtime);
  if (!registry) foreground.set(runtime, registry = new Map());
  let record = registry.get(registration);
  if (record && record.bundle !== runtime.bundles.getBundle(app.bundleIdentifier)) { record.retire(); record = undefined; }
  if (!record) { record = createRecord(runtime, app, registration); registry.set(registration, record); }
  return membership(record);
}
/** Supplied background authority is authenticated, not accepted structurally. */
export function joinApplicationProcess(runtime: SynCloudOSRuntime, app: SynCloudOSAppInfo, process: ApplicationProcessAuthority): ApplicationProcessMembership {
  const registration = admission(runtime, app);
  const record = authentic.get(process);
  if (!record || record.runtime !== runtime || record.registration !== registration || record.bundle !== runtime.bundles.getBundle(app.bundleIdentifier)) throw invalid();
  return membership(record);
}
export function createBackgroundApplicationProcess(runtime: SynCloudOSRuntime, app: SynCloudOSAppInfo, bundle: TrustedSynWareBundle, signal: AbortSignal): ApplicationProcessMembership {
  const registration = admission(runtime, app);
  if (runtime.bundles.getBundle(app.bundleIdentifier) !== bundle) throw invalid();
  signal.throwIfAborted();
  return membership(createRecord(runtime, app, registration, signal));
}
/** Keep admission closed throughout synchronous process and transfer abort handlers. */
export function revokeForegroundApplicationProcess(runtime: SynCloudOSRuntime, appId: string, revokeMounts: () => void): void {
  retirementGuard(runtime, appId, () => {
    for (const record of [...foreground.get(runtime)?.values() ?? []]) {
      if (normalizeBundleIdentifier(record.appId) === normalizeBundleIdentifier(appId)) record.retire();
    }
    revokeMounts();
  });
}
