import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";
import type { SynCloudOSAppInfo } from "../SynCloudOS";
import { createMountedSynWareRuntime, type MountedSynWareRuntime } from "../AppSDK/appRuntimeFacade";
import { applicationResourceErrorReporter, mountedFXExecutionContext } from "../AppSDK/mountedFXExecutionContext";
import type { ApplicationProcessAuthority } from "../AppSDK/applicationProcessAuthority";
import type { OwnedExecutionContext } from "../nseRuntimeContracts";
import type { ResponderRegistrationHandle } from "../SynCloudOS";
import { assertApplicationProcessAdmission, createBackgroundApplicationProcess } from "../AppSDK/applicationProcessAuthority";
import { assertOwnedExecutionContextLive, narrowOwnedExecutionContext, ownedExecutionContextSignal, runInOwnedExecutionContext } from "../nseRuntimeContracts";
import { awaitCurrentGeneration, type DefinitionBackgroundExecution } from "../BundleLoader/definitionLifecycle";
import type { TrustedSynWareBundle } from "../SynCloudOS";

export interface PreparedApplicationServices {
  readonly mount: MountedSynWareRuntime;
  readonly execution: OwnedExecutionContext;
  readonly ownsApplicationResponder: boolean;
  dispose(reason?: unknown): void;
}

let backgroundSequence = 0;
/** BundleLoader supplies the exact bundle/load, never a foreground session lookup. */
export function prepareDefinitionBackgroundExecution(runtime: SynCloudOSRuntime, bundle: TrustedSynWareBundle,
  loadSignal: AbortSignal, assertCurrent: () => void, revokeLoad: (reason: unknown) => void): DefinitionBackgroundExecution {
  assertCurrent();
  const app = runtime.apps.getApp(bundle.manifest.bundleIdentifier);
  if (!app) throw new TypeError("Background work requires its registered application.");
  const lifetime = new AbortController();
  const signal = AbortSignal.any([loadSignal, lifetime.signal]);
  const membership = createBackgroundApplicationProcess(runtime, app, bundle, signal);
  let prepared: PreparedApplicationServices;
  try { prepared = prepareApplicationServices(runtime, app, `controller:${app.bundleIdentifier}:definition-task:${++backgroundSequence}`, membership.process); }
  catch (error) { lifetime.abort(error); membership.release(error); throw error; }
  let ownerSignal: AbortSignal;
  try { ownerSignal = ownedExecutionContextSignal(prepared.execution); }
  catch (error) { lifetime.abort(error); prepared.dispose(error); membership.release(error); throw error; }
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    ownerSignal.removeEventListener("abort", retireLoad);
    lifetime.abort();
    prepared.dispose();
    membership.release();
  };
  const retireLoad = () => {
    // External mount/process retirement invalidates this exact load's final
    // publication too. Ordinary dispose removes this listener before aborting.
    try { revokeLoad(ownerSignal.reason); } finally { dispose(); }
  };
  ownerSignal.addEventListener("abort", retireLoad, { once: true });
  if (ownerSignal.aborted) retireLoad();
  return {
    run: work => runInOwnedExecutionContext(prepared.execution, work),
    async task(work) {
      assertCurrent();
      const taskLifetime = new AbortController();
      const resources = new Set<() => void>();
      const task = narrowOwnedExecutionContext(prepared.execution, {
        signal: taskLifetime.signal, assertLive: assertCurrent,
        reportResourceError: applicationResourceErrorReporter(runtime, app.bundleIdentifier),
        registerResource(_resource, cleanup) { resources.add(cleanup); return () => { resources.delete(cleanup); }; },
      });
      const taskSignal = ownedExecutionContextSignal(task);
      try {
        return await awaitCurrentGeneration(Promise.resolve().then(() => runInOwnedExecutionContext(task, () => work(taskSignal))), taskSignal, () => {
          assertCurrent();
          assertOwnedExecutionContextLive(task);
        });
      } finally { taskLifetime.abort(); }
    },
    dispose,
  };
}
interface ApplicationResponderLease { readonly handle: ResponderRegistrationHandle; readonly generation: number; references: number }
const applicationResponders = new WeakMap<SynCloudOSRuntime, Map<string, ApplicationResponderLease>>();

/** Only host-owned handles are released; a borrowed responder is never removed. */
export function prepareApplicationServices(runtime: SynCloudOSRuntime, app: SynCloudOSAppInfo,
  responderId = `controller:${app.bundleIdentifier}:application-services`, process?: ApplicationProcessAuthority): PreparedApplicationServices {
  if (runtime.apps.getApp(app.bundleIdentifier) !== app) throw new TypeError("Application services require the canonical application.");
  assertApplicationProcessAdmission(runtime, app);
  const applicationId = `application:${app.bundleIdentifier}`;
  const existing = runtime.responders.get(applicationId);
  if (existing && (existing.kind !== "application" || existing.parentId !== "workspace" || existing.scopeId !== applicationId
    || existing.undoOwner?.kind !== "application" || existing.undoOwner.id !== app.bundleIdentifier)) {
    throw new TypeError("The application responder has incompatible ownership.");
  }
  if (runtime.responders.get(responderId)) throw new TypeError("Application services are already being prepared.");
  let leases = applicationResponders.get(runtime);
  if (!leases) applicationResponders.set(runtime, leases = new Map());
  let lease = leases.get(applicationId);
  if (lease && runtime.responders.getRegistrationToken(applicationId)?.generation !== lease.generation) lease = undefined;
  if (!existing) {
    const handle = runtime.responders.register({ id: applicationId, kind: "application", parentId: "workspace", scopeId: applicationId,
      undoOwner: { kind: "application", id: app.bundleIdentifier } });
    lease = { handle, generation: runtime.responders.getRegistrationToken(applicationId)!.generation, references: 0 };
    leases.set(applicationId, lease);
  }
  if (lease) lease.references++;
  const retained = lease;
  let responder: ResponderRegistrationHandle | undefined;
  let mount: MountedSynWareRuntime | undefined;
  let disposed = false;
  const report = applicationResourceErrorReporter(runtime, app.bundleIdentifier);
  const dispose = (reason?: unknown) => {
    if (disposed) return;
    disposed = true;
    for (const cleanup of [
      () => mount?.dispose(reason),
      () => responder?.dispose({ cascade: true }),
      () => {
        if (retained && --retained.references === 0) {
          if (leases.get(applicationId) === retained) leases.delete(applicationId);
          // Foreign children can have borrowed this ancestry while we were live.
          if (!runtime.responders.inspect().registrations.some(child => child.parentId === applicationId)) retained.handle.dispose();
        }
      },
    ]) { try { cleanup(); } catch (error) { report(error); } }
  };
  try {
    responder = runtime.responders.register({ id: responderId, kind: "controller", parentId: applicationId, scopeId: applicationId });
    mount = createMountedSynWareRuntime({ runtime, app, responderId, ...(process ? { process } : {}) });
    const execution = mountedFXExecutionContext(mount.runtime);
    if (!execution) throw new TypeError("Application services did not issue execution authority.");
    return { mount, execution, ownsApplicationResponder: Boolean(retained), dispose };
  } catch (error) { dispose(error); throw error; }
}
