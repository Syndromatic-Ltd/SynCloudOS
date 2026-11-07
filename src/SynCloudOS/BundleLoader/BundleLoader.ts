/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import type { SynCloudOSAppManifest } from "../AppRegistry/appRegistryTypes";
import { normalizeBundleIdentifier } from "../Identity/bundleIdentifier.mjs";
import { captureSynWareManifest } from "../AppSDK/manifest/canonicalManifest";
import type { SynWareManifestV1 } from "../AppSDK/manifest/manifestTypes";
import type { SynCloudOSRuntime, SynCloudOSEventBus, SynCloudOSBundleLoader, SynCloudOSRuntimeId } from "../Runtime/runtimeInstanceTypes";
import type {
  SynCloudOSAppModule,
  SynCloudOSBundleLifecycleHookName,
  SynCloudOSBundleLoadErrorCode,
  SynCloudOSBundleLoadState,
  SynCloudOSLoadedBundle,
  TrustedSynWareBundle
} from "./bundleTypes";
import {
  getTrustedSynWareBundleProvenance,
  preserveTrustedSynWareBundleProvenance,
} from "./trustedBundleProvenance";
import { captureLazySynWareDefinition } from "./definitionModule";
import { awaitCallerSignal, isAbortError, runDefinitionLifecycle } from "./definitionLifecycle";


export class SynCloudOSBundleLoadError extends Error {
  readonly code: SynCloudOSBundleLoadErrorCode;
  readonly appId: string;
  readonly packageName?: string;
  readonly cause?: unknown;

  constructor(code: SynCloudOSBundleLoadErrorCode, message: string, context: { appId: string; packageName?: string; cause?: unknown }) {
    super(message);
    this.name = "SynCloudOSBundleLoadError";
    this.code = code;
    this.appId = context.appId;
    this.packageName = context.packageName;
    this.cause = context.cause;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isV1ManifestCandidate(value: unknown): boolean {
  return isRecord(value) && Object.prototype.hasOwnProperty.call(value, "schemaVersion");
}

function registrationManifestError(errors: readonly { readonly path: string; readonly message: string }[]): TypeError {
  return new TypeError(`SynWare manifest validation failed at registration: ${errors.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`);
}

function canonicalManifestForBundle(bundle: TrustedSynWareBundle): Readonly<SynWareManifestV1> | undefined {
  const declaration = Object.getOwnPropertyDescriptor(bundle, "synWareManifest");
  if (declaration && !("value" in declaration)) {
    throw new TypeError("SynWare bundle declarations must use a data property, not an accessor.");
  }
  if (isV1ManifestCandidate(bundle.manifest)) {
    const validation = captureSynWareManifest(bundle.manifest);
    if (!validation.ok) throw registrationManifestError(validation.errors);
    throw new TypeError("V1 SynWare manifests must be registered through createSynWareBundle().");
  }
  if (!declaration || declaration.value === undefined) return undefined;
  const validation = captureSynWareManifest(declaration.value);
  if (!validation.ok) throw registrationManifestError(validation.errors);
  return validation.value;
}

function declaredServices(manifest: Readonly<SynWareManifestV1> | undefined, required: boolean): string[] | undefined {
  if (!manifest?.services) return undefined;
  return manifest.services
    .filter((service) => required ? service.required !== false : service.required === false)
    .map((service) => service.id);
}

function rejectDirectV1Manifest(manifest: unknown): void {
  if (!isV1ManifestCandidate(manifest)) return;
  const validation = captureSynWareManifest(manifest);
  if (!validation.ok) throw registrationManifestError(validation.errors);
  throw new TypeError("V1 SynWare manifests must be registered through createSynWareBundle().");
}
export interface BundleLoaderFactoryDependencies {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly events: SynCloudOSEventBus;
}

type BundleLoaderRuntimeContext = {
  readonly events: SynCloudOSEventBus;
  readonly store: { readonly runtimeId: SynCloudOSRuntimeId };
  readonly signal: AbortSignal;
};

export function createBundleLoader(runtimeInput: SynCloudOSRuntime | BundleLoaderFactoryDependencies): SynCloudOSBundleLoader {
  const runtime: BundleLoaderRuntimeContext = "store" in runtimeInput
    ? runtimeInput
    : {
        events: runtimeInput.events,
        store: { runtimeId: runtimeInput.runtimeId },
        signal: new AbortController().signal,
      };
  const runtimeId = runtime.store.runtimeId;
  const EventBus = runtime.events;

  const bundles = new Map<string, TrustedSynWareBundle>();
  const loadedBundles = new Map<string, SynCloudOSLoadedBundle>();
  const loadingPromises = new Map<string, Promise<SynCloudOSLoadedBundle>>();
  const loadControllers = new Map<string, AbortController>();
  const loadStates = new Map<string, SynCloudOSBundleLoadState>();
  const loadErrors = new Map<string, SynCloudOSBundleLoadError>();
  let disposed = false;
function createDefaultBundle(manifest: SynCloudOSAppManifest): TrustedSynWareBundle {
  return {
    manifest,
    componentKey: manifest.componentKey,
    modulePath: manifest.path,
    services: [...manifest.requiredServices, ...(manifest.optionalServices ?? [])],
    optionalServices: manifest.optionalServices,
    permissions: manifest.type === "system" ? ["diagnostics.view"] : ["app.open.public"],
    lifecycleHooks: {}
  };
}

function isTrustedBundle(value: SynCloudOSAppManifest | TrustedSynWareBundle): value is TrustedSynWareBundle {
  return "manifest" in value;
}

function prepareBundle(bundle: TrustedSynWareBundle): TrustedSynWareBundle {
  const synWareManifest = canonicalManifestForBundle(bundle);
  const requiredServices = declaredServices(synWareManifest, true) ?? bundle.manifest.requiredServices;
  const optionalServices = declaredServices(synWareManifest, false) ?? bundle.manifest.optionalServices;
  return preserveTrustedSynWareBundleProvenance(bundle, {
    ...bundle,
    ...(synWareManifest === undefined ? {} : { synWareManifest }),
    componentKey: bundle.componentKey || bundle.manifest.componentKey,
    modulePath: bundle.modulePath ?? bundle.manifest.path,
    services: bundle.services ?? [...requiredServices, ...(optionalServices ?? [])],
    optionalServices: bundle.optionalServices ?? optionalServices,
    permissions: bundle.permissions ?? (synWareManifest?.permissions ? [...synWareManifest.permissions] : bundle.manifest.type === "system" ? ["diagnostics.view"] : ["app.open.public"]),
    lifecycleHooks: bundle.lifecycleHooks ?? {}
  });
}

function setLoadFailed(appId: string, error: SynCloudOSBundleLoadError) {
  loadStates.set(normalizeBundleIdentifier(appId), "failed");
  loadErrors.set(normalizeBundleIdentifier(appId), error);
}

function clearLoadedState(appId: string) {
  const controller = loadControllers.get(normalizeBundleIdentifier(appId));
  if (controller && !controller.signal.aborted) {
    controller.abort(new DOMException(`Bundle ${appId} load generation was replaced.`, "AbortError"));
  }
  loadControllers.delete(normalizeBundleIdentifier(appId));
  loadedBundles.delete(normalizeBundleIdentifier(appId));
  loadingPromises.delete(normalizeBundleIdentifier(appId));
  loadStates.delete(normalizeBundleIdentifier(appId));
  loadErrors.delete(normalizeBundleIdentifier(appId));
}

function publishBundleRegistration(bundle: TrustedSynWareBundle, hadExistingBundle: boolean) {
  EventBus.publish(hadExistingBundle ? "bundle.update" : "bundle.register", {
    appId: bundle.manifest.bundleIdentifier,
    packageName: bundle.manifest.packageName,
    componentKey: bundle.componentKey,
    modulePath: bundle.modulePath,
    services: bundle.services,
    permissions: bundle.permissions
  }, bundle.manifest.packageName);
}

async function invokeLifecycleHookForBundle(
  bundle: TrustedSynWareBundle,
  hookName: SynCloudOSBundleLifecycleHookName,
  context: { reason?: string; error?: unknown } = {}
) {
  const hook = bundle.lifecycleHooks?.[hookName];
  if (!hook) return;
  try {
    await hook({
      appId: bundle.manifest.bundleIdentifier,
      packageName: bundle.manifest.packageName,
      ...context
    });
  } catch (error) {
    EventBus.publish("bundle.lifecycle.failed", {
      appId: bundle.manifest.bundleIdentifier,
      packageName: bundle.manifest.packageName,
      hookName,
      error: error instanceof Error ? error.message : String(error)
    }, bundle.manifest.packageName);
  }
}

const bundleLoader = {
  runtimeId,
  createBundle(input: SynCloudOSAppManifest | TrustedSynWareBundle) {
    if (!isTrustedBundle(input)) rejectDirectV1Manifest(input);
    return prepareBundle(isTrustedBundle(input) ? input : createDefaultBundle(input));
  },

  registerBundle(bundle: TrustedSynWareBundle, options: { publish?: boolean } = {}) {
    const prepared = prepareBundle(bundle);
    const existing = bundles.get(normalizeBundleIdentifier(prepared.manifest.bundleIdentifier));
    if (existing && existing.manifest.bundleIdentifier !== prepared.manifest.bundleIdentifier) {
      throw new TypeError(`Duplicate SynWare bundle identifier ${prepared.manifest.bundleIdentifier}.`);
    }
    const hadExistingBundle = bundles.has(normalizeBundleIdentifier(prepared.manifest.bundleIdentifier));
    bundles.set(normalizeBundleIdentifier(prepared.manifest.bundleIdentifier), prepared);
    if (hadExistingBundle) clearLoadedState(prepared.manifest.bundleIdentifier);
    if (options.publish !== false) publishBundleRegistration(prepared, hadExistingBundle);
    return prepared;
  },
  publishBundleRegistration,
  captureBundleRegistrationState(appId: string) {
    return {
      appId,
      bundle: bundles.get(normalizeBundleIdentifier(appId)) ?? null,
      loaded: loadedBundles.get(normalizeBundleIdentifier(appId)) ?? null,
      loading: loadingPromises.get(normalizeBundleIdentifier(appId)) ?? null,
      loadState: loadStates.get(normalizeBundleIdentifier(appId)) ?? null,
      loadError: loadErrors.get(normalizeBundleIdentifier(appId)) ?? null,
    };
  },
  restoreBundleRegistrationState(state: {
    appId: string;
    bundle: TrustedSynWareBundle | null;
    loaded: SynCloudOSLoadedBundle | null;
    loading: Promise<SynCloudOSLoadedBundle> | null;
    loadState: SynCloudOSBundleLoadState | null;
    loadError: SynCloudOSBundleLoadError | null;
  }) {
    const { appId } = state;
    if (state.bundle) bundles.set(normalizeBundleIdentifier(appId), state.bundle); else bundles.delete(normalizeBundleIdentifier(appId));
    if (state.loaded) loadedBundles.set(normalizeBundleIdentifier(appId), state.loaded); else loadedBundles.delete(normalizeBundleIdentifier(appId));
    if (state.loading) loadingPromises.set(normalizeBundleIdentifier(appId), state.loading); else loadingPromises.delete(normalizeBundleIdentifier(appId));
    if (state.loadState) loadStates.set(normalizeBundleIdentifier(appId), state.loadState); else loadStates.delete(normalizeBundleIdentifier(appId));
    if (state.loadError) loadErrors.set(normalizeBundleIdentifier(appId), state.loadError); else loadErrors.delete(normalizeBundleIdentifier(appId));
  },

  registerManifest(manifest: SynCloudOSAppManifest) {
    return this.registerBundle(createDefaultBundle(manifest));
  },

  registerMany(inputs: Array<SynCloudOSAppManifest | TrustedSynWareBundle>) {
    return inputs.map((input) => this.registerBundle(this.createBundle(input)));
  },

  unregisterBundle(appId: string) {
    const bundle = bundles.get(normalizeBundleIdentifier(appId));
    if (!bundle) return null;
    bundles.delete(normalizeBundleIdentifier(appId));
    clearLoadedState(appId);
    EventBus.publish("bundle.unregister", { appId, packageName: bundle.manifest.packageName }, bundle.manifest.packageName);
    return bundle;
  },

  async loadBundle(appId: string, options: { readonly signal?: AbortSignal } = {}) {
    if (disposed) throw new Error(`Bundle loader ${runtimeId} is disposed.`);
    const loaded = loadedBundles.get(normalizeBundleIdentifier(appId));
    if (loaded) return loaded;

    const inFlight = loadingPromises.get(normalizeBundleIdentifier(appId));
    if (inFlight) return awaitCallerSignal(inFlight, options.signal);

    const bundle = bundles.get(normalizeBundleIdentifier(appId));
    if (!bundle) {
      const error = new SynCloudOSBundleLoadError("BUNDLE_NOT_REGISTERED", `No bundle is registered for ${appId}.`, { appId });
      setLoadFailed(appId, error);
      throw error;
    }

    if (!bundle.loadModule && !bundle.synWareDefinition) {
      const error = new SynCloudOSBundleLoadError(
        "BUNDLE_LOADER_MISSING",
        `${bundle.manifest.packageName} has neither an eager definition nor a module loader.`,
        { appId, packageName: bundle.manifest.packageName }
      );
      setLoadFailed(appId, error);
      EventBus.publish("bundle.load.failed", {
        appId,
        packageName: bundle.manifest.packageName,
        modulePath: bundle.modulePath,
        code: error.code,
        error: error.message
      }, bundle.manifest.packageName);
      throw error;
    }

    loadStates.set(normalizeBundleIdentifier(appId), "loading");
    loadErrors.delete(normalizeBundleIdentifier(appId));
    EventBus.publish("bundle.load.begin", {
      appId,
      packageName: bundle.manifest.packageName,
      modulePath: bundle.modulePath
    }, bundle.manifest.packageName);

    const controller = new AbortController();
    loadControllers.set(normalizeBundleIdentifier(appId), controller);
    const signal = AbortSignal.any([runtime.signal, controller.signal]);
    const assertCurrent = () => {
      // Keep the historical stale-success classification stable while still
      // aborting declaration work immediately on replacement.
      if (bundles.get(normalizeBundleIdentifier(appId)) !== bundle) {
        throw new Error(`Bundle ${appId} changed while its module was loading.`);
      }
      if (signal.aborted) throw signal.reason instanceof Error
        ? signal.reason
        : new DOMException("Bundle definition lifecycle was revoked.", "AbortError");
    };
    const importModule: Promise<SynCloudOSAppModule> = (bundle.loadModule ? (() => {
      try {
        return Promise.resolve(bundle.loadModule());
      } catch (error) {
        return Promise.reject(error);
      }
    })() : Promise.resolve({ default: bundle.synWareDefinition! }))
      .catch((error) => {
        throw new SynCloudOSBundleLoadError(
          "BUNDLE_IMPORT_FAILED",
          error instanceof Error ? error.message : String(error),
          { appId, packageName: bundle.manifest.packageName, cause: error },
        );
      });
    let promise!: Promise<SynCloudOSLoadedBundle>;
    // A dynamic module import is not abortable.  Keep observing its actual
    // settlement so a superseded import rejection retains the stable
    // BUNDLE_IMPORT_FAILED classification for its original caller.  Only the
    // post-import lifecycle work is cancellation-bound.
    promise = importModule
      .then(async (module) => {
        // Registration replacement cancels the old load generation. Never
        // capture or publish its definition into the newer bundle record.
        assertCurrent();
        let definition;
        try {
          definition = captureLazySynWareDefinition(module, bundle);
          await runDefinitionLifecycle(definition, { signal, assertCurrent });
        } catch (error) {
          if (isAbortError(error) || bundles.get(normalizeBundleIdentifier(appId)) !== bundle) throw error;
          throw new SynCloudOSBundleLoadError(
            "BUNDLE_INVALID_MODULE",
            `${bundle.manifest.packageName} did not complete a valid SynWare definition lifecycle: ${error instanceof Error ? error.message : String(error)}`,
            { appId, packageName: bundle.manifest.packageName, cause: error },
          );
        }
        assertCurrent();
        const loadedBundle: SynCloudOSLoadedBundle = {
          appId,
          packageName: bundle.manifest.packageName,
          modulePath: bundle.modulePath ?? bundle.manifest.path,
          definition,
          loadedAt: Date.now()
        };
        loadedBundles.set(normalizeBundleIdentifier(appId), loadedBundle);
        loadStates.set(normalizeBundleIdentifier(appId), "ready");
        EventBus.publish("bundle.load.complete", {
          appId,
          packageName: bundle.manifest.packageName,
          modulePath: loadedBundle.modulePath,
          loadedAt: loadedBundle.loadedAt
        }, bundle.manifest.packageName);
        return loadedBundle;
      })
      .catch((error) => {
        // A stale completion belongs to the prior registration and must not
        // turn the replacement bundle into a failed load state.
        if (bundles.get(normalizeBundleIdentifier(appId)) !== bundle) throw error;
        if (signal.aborted || isAbortError(error)) {
          loadStates.delete(normalizeBundleIdentifier(appId));
          loadErrors.delete(normalizeBundleIdentifier(appId));
          throw error;
        }
        const loadError = error instanceof SynCloudOSBundleLoadError
          ? error
          : new SynCloudOSBundleLoadError(
              "BUNDLE_IMPORT_FAILED",
              error instanceof Error ? error.message : String(error),
              { appId, packageName: bundle.manifest.packageName, cause: error }
            );
        setLoadFailed(appId, loadError);
        EventBus.publish("bundle.load.failed", {
          appId,
          packageName: bundle.manifest.packageName,
          modulePath: bundle.modulePath,
          code: loadError.code,
          error: loadError.message
        }, bundle.manifest.packageName);
        throw loadError;
      })
      .finally(() => {
        if (loadingPromises.get(normalizeBundleIdentifier(appId)) === promise) loadingPromises.delete(normalizeBundleIdentifier(appId));
        if (loadControllers.get(normalizeBundleIdentifier(appId)) === controller) loadControllers.delete(normalizeBundleIdentifier(appId));
      });

    loadingPromises.set(normalizeBundleIdentifier(appId), promise);
    return awaitCallerSignal(promise, options.signal);
  },

  getBundle(appId: string) {
    return bundles.get(normalizeBundleIdentifier(appId)) ?? null;
  },
  getTrustedBundleProvenance(appId: string) {
    return getTrustedSynWareBundleProvenance(bundles.get(normalizeBundleIdentifier(appId)));
  },

  getLoadedBundle(appId: string) {
    return loadedBundles.get(normalizeBundleIdentifier(appId)) ?? null;
  },

  getBundleLoadState(appId: string): SynCloudOSBundleLoadState {
    if (loadedBundles.has(normalizeBundleIdentifier(appId))) return "ready";
    if (loadingPromises.has(normalizeBundleIdentifier(appId))) return "loading";
    return loadStates.get(normalizeBundleIdentifier(appId)) ?? "unloaded";
  },

  getBundleLoadError(appId: string) {
    return loadErrors.get(normalizeBundleIdentifier(appId)) ?? null;
  },

  invalidateBundle(appId: string) {
    clearLoadedState(appId);
  },

  getBundles() {
    return Array.from(bundles.values());
  },

  getLifecycleHook(appId: string, hookName: SynCloudOSBundleLifecycleHookName) {
    return bundles.get(normalizeBundleIdentifier(appId))?.lifecycleHooks?.[hookName] ?? null;
  },

  invokeLifecycleHookForBundle,

  async invokeLifecycleHook(appId: string, hookName: SynCloudOSBundleLifecycleHookName, context: { reason?: string; error?: unknown } = {}) {
    const bundle = bundles.get(normalizeBundleIdentifier(appId));
    if (!bundle) return;
    await invokeLifecycleHookForBundle(bundle, hookName, context);
  },

  dispose() {
    if (disposed) return;
    disposed = true;
    for (const controller of loadControllers.values()) {
      if (!controller.signal.aborted) {
        controller.abort(new DOMException("Bundle loader was disposed.", "AbortError"));
      }
    }
    loadControllers.clear();
    bundles.clear();
    loadedBundles.clear();
    loadingPromises.clear();
    loadStates.clear();
    loadErrors.clear();
  }
};

return bundleLoader;
}

