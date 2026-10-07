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

import { describe, expect, it, vi } from "vitest";
import { createTestRuntime, createTestBundle, createTestManifest, flushLaunchTimers, createRuntimeHarness } from "./helpers";
import type { SynCloudOSAppModule } from "../../src/SynCloudOS/BundleLoader/bundleTypes";
import { createBundleLoader } from "../../src/SynCloudOS/BundleLoader/BundleLoader";
import { createSynWare, createSynWareBundle } from "../../src/SynCloudOS/AppSDK/createSynWare";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => { resolve = nextResolve; reject = nextReject; });
  return { promise, resolve, reject };
}

function definitionFor(bundle: ReturnType<typeof createTestBundle>) {
  return createSynWare({ manifest: bundle.synWareManifest!, root: () => null });
}

function authoriseRuntime(runtime: ReturnType<typeof createTestRuntime>) {
  runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
}

describe("BundleLoader dynamic runtime contracts", () => {
  it("loads an eager SynWare definition without requiring a lazy module loader", async () => {
    const runtime = createTestRuntime();
    const fixture = createTestBundle({ id: "eager-definition", route: "/eager-definition" });
    const definition = createSynWare({
      manifest: fixture.synWareManifest!,
      root: () => null,
    });
    runtime.bundles.registerBundle(createSynWareBundle(definition));

    await expect(runtime.bundles.loadBundle("eager-definition")).resolves.toMatchObject({
      appId: "eager-definition",
      definition,
    });
    expect(runtime.bundles.getBundleLoadState("eager-definition")).toBe("ready");
    await runtime.dispose({ reason: "eager bundle test cleanup", inFlight: "cancel" });
  });

  it("registers and updates trusted bundles through AppRegistry while preserving loader metadata", async () => {
    const { AppRegistry, BundleLoader, RuntimeController } = createRuntimeHarness(createTestRuntime());
    const applicationWillRegister = vi.fn();
    const applicationDidRegister = vi.fn();
    const applicationWillUpdate = vi.fn();
    const applicationDidUpdate = vi.fn();
    const moduleApplicationWillLaunch = vi.fn();
    const DynamicComponent = () => null;
    const loadModule = vi.fn(() => Promise.resolve({ default: DynamicComponent }));
    const manifest = createTestManifest({
      id: "dynamic-bundle",
      displayName: "Dynamic Bundle",
      packageName: "DynamicBundle.app",
      route: "/dynamic-bundle",
      componentKey: "DynamicBundleComponent",
      requiredServices: ["webspring", "windowing"]
    });

    const registered = AppRegistry.registerBundle(createTestBundle(manifest, {
      componentKey: "",
      content: { screen: "v1" },
      assets: ["/test-assets/dynamic-bundle/hero.png"],
      permissions: ["app.open.public", "documents.read"],
      services: ["dynamic.service"],
      loadModule,
      lifecycleHooks: {
        applicationWillRegister,
        applicationDidRegister,
        applicationWillLaunch: moduleApplicationWillLaunch,
      }
    }));

    expect(registered).toMatchObject({
      id: "dynamic-bundle",
      route: "/dynamic-bundle",
      componentKey: "DynamicBundleComponent"
    });
    expect(BundleLoader.getBundle("dynamic-bundle")).toMatchObject({
      componentKey: "DynamicBundleComponent",
      content: { screen: "v1" },
      assets: ["/test-assets/dynamic-bundle/hero.png"],
      permissions: ["app.open.public", "documents.read"],
      services: ["dynamic.service"],
      manifest: expect.objectContaining({ id: "dynamic-bundle", packageName: "DynamicBundle.app" })
    });
    expect(RuntimeController.getSnapshot()).toMatchObject({
      rawApps: {
        "dynamic-bundle": expect.objectContaining({ id: "dynamic-bundle" })
      },
      appInfo: {
        "dynamic-bundle": expect.objectContaining({ id: "dynamic-bundle" })
      },
      managers: {
        "dynamic-bundle": expect.objectContaining({ lifecycleState: "registered" })
      }
    });
    expect(applicationWillRegister).toHaveBeenCalledWith({
      appId: "dynamic-bundle",
      packageName: "DynamicBundle.app",
      reason: "AppRegistry.register"
    });
    expect(applicationDidRegister).toHaveBeenCalledWith({
      appId: "dynamic-bundle",
      packageName: "DynamicBundle.app",
      reason: "AppRegistry.register"
    });

    await expect(BundleLoader.loadBundle("dynamic-bundle")).resolves.toMatchObject({
      appId: "dynamic-bundle",
      packageName: "DynamicBundle.app",
      definition: expect.objectContaining({ root: DynamicComponent }),
    });
    await BundleLoader.loadBundle("dynamic-bundle");
    expect(loadModule).toHaveBeenCalledTimes(1);
    expect(BundleLoader.getBundleLoadState("dynamic-bundle")).toBe("ready");
    expect(BundleLoader.getLifecycleHook("dynamic-bundle", "applicationWillLaunch")).toBe(moduleApplicationWillLaunch);

    const updatedManifest = createTestManifest({
      ...manifest,
      route: "/dynamic-bundle/v2",
      componentKey: "DynamicBundleV2Component",
      lifecycle: { preload: false }
    });

    AppRegistry.registerBundle(createTestBundle(updatedManifest, {
      componentKey: "DynamicBundleV2Component",
      content: { screen: "v2" },
      assets: ["/test-assets/dynamic-bundle/hero-v2.png"],
      permissions: ["app.open.public"],
      loadModule: () => Promise.resolve({ default: () => null }),
      lifecycleHooks: {
        applicationWillRegister: applicationWillUpdate,
        applicationDidUpdate
      }
    }));

    expect(BundleLoader.getBundle("dynamic-bundle")).toMatchObject({
      componentKey: "DynamicBundleV2Component",
      content: { screen: "v2" },
      assets: ["/test-assets/dynamic-bundle/hero-v2.png"],
      permissions: ["app.open.public"],
      services: ["webspring", "windowing"],
      manifest: expect.objectContaining({ route: "/dynamic-bundle/v2" })
    });
    expect(applicationWillUpdate).toHaveBeenCalledWith({
      appId: "dynamic-bundle",
      packageName: "DynamicBundle.app",
      reason: "AppRegistry.register update"
    });
    expect(applicationDidUpdate).toHaveBeenCalledWith({
      appId: "dynamic-bundle",
      packageName: "DynamicBundle.app",
      reason: "AppRegistry.register update"
    });
    expect(BundleLoader.getLoadedBundle("dynamic-bundle")).toBeNull();
    expect(BundleLoader.getBundleLoadState("dynamic-bundle")).toBe("unloaded");
    expect(AppRegistry.getRegistrationHistory().map((record) => record.action)).toEqual(["register", "update"]);
    expect(RuntimeController.getEventHistory().map((event) => event.type)).toEqual(
      expect.arrayContaining(["bundle.register", "bundle.load.begin", "bundle.load.complete", "bundle.update", "app.register", "app.register.update"])
    );
  });

  it("drops a stale definition completion after its bundle registration is replaced", async () => {
    const { AppRegistry, BundleLoader } = createRuntimeHarness(createTestRuntime());
    const manifest = createTestManifest({
      id: "stale-definition-bundle",
      displayName: "Stale Definition Bundle",
      packageName: "StaleDefinitionBundle.app",
      route: "/stale-definition-bundle",
    });
    const original = createTestBundle(manifest);
    const firstDefinition = definitionFor(original);
    const staleModule = deferred<SynCloudOSAppModule>();
    AppRegistry.registerBundle({
      ...original,
      synWareDefinition: firstDefinition,
      loadModule: () => staleModule.promise,
    });

    const staleLoad = BundleLoader.loadBundle(manifest.id);
    const replacementBase = createTestBundle(manifest);
    const replacementDefinition = definitionFor(replacementBase);
    const replacementModule = deferred<SynCloudOSAppModule>();
    const replacementLoad = vi.fn(() => replacementModule.promise);
    const replacement = {
      ...replacementBase,
      synWareDefinition: replacementDefinition,
      loadModule: replacementLoad,
    };
    AppRegistry.registerBundle(replacement);
    const firstReplacementLoad = BundleLoader.loadBundle(manifest.id);
    expect(replacementLoad).toHaveBeenCalledTimes(1);
    staleModule.resolve({ default: firstDefinition });
    await expect(staleLoad).rejects.toThrow(/changed while its module was loading/u);

    expect(BundleLoader.getLoadedBundle(manifest.id)).toBeNull();
    expect(BundleLoader.getBundleLoadState(manifest.id)).toBe("loading");
    const secondReplacementLoad = BundleLoader.loadBundle(manifest.id);
    expect(replacementLoad).toHaveBeenCalledTimes(1);
    replacementModule.resolve({ default: replacementDefinition });
    await expect(firstReplacementLoad).resolves.toMatchObject({
      definition: replacementDefinition,
    });
    await expect(secondReplacementLoad).resolves.toMatchObject({ definition: replacementDefinition });
  });

  it("cancels stale definition completion in the classic loader as well", async () => {
    const runtime = createTestRuntime({ id: "runtime:classic-stale-definition" });
    const loader = createBundleLoader(runtime);
    const manifest = createTestManifest({
      id: "classic-stale-definition-bundle",
      displayName: "Classic Stale Definition Bundle",
      packageName: "ClassicStaleDefinitionBundle.app",
      route: "/classic-stale-definition-bundle",
    });
    const original = createTestBundle(manifest);
    const firstDefinition = definitionFor(original);
    const staleModule = deferred<SynCloudOSAppModule>();
    loader.registerBundle({
      ...original,
      synWareDefinition: firstDefinition,
      loadModule: () => staleModule.promise,
    });

    const staleLoad = loader.loadBundle(manifest.id);
    const replacementBase = createTestBundle(manifest);
    const replacementDefinition = definitionFor(replacementBase);
    const replacement = {
      ...replacementBase,
      synWareDefinition: replacementDefinition,
      loadModule: async () => ({ default: replacementDefinition }),
    };
    loader.registerBundle(replacement);
    staleModule.resolve({ default: firstDefinition });

    await expect(staleLoad).rejects.toThrow(/changed while its module was loading/u);
    expect(loader.getLoadedBundle(manifest.id)).toBeNull();
    expect(loader.getBundleLoadState(manifest.id)).toBe("unloaded");
    await expect(loader.loadBundle(manifest.id)).resolves.toMatchObject({
      definition: replacementDefinition,
    });
  });

  it("does not publish or retain a stale rejected import in the production inline loader", async () => {
    const runtime = createTestRuntime({ id: "runtime:inline-stale-rejection" });
    const manifest = createTestManifest({
      id: "inline-stale-rejection-bundle",
      displayName: "Inline stale rejection bundle",
      packageName: "InlineStaleRejection.app",
      route: "/inline-stale-rejection",
    });
    const original = createTestBundle(manifest);
    const originalDefinition = definitionFor(original);
    const staleModule = deferred<SynCloudOSAppModule>();
    runtime.apps.registerBundle({
      ...original,
      synWareDefinition: originalDefinition,
      loadModule: () => staleModule.promise,
    });
    const staleLoad = runtime.bundles.loadBundle(manifest.id);

    const replacementBase = createTestBundle(manifest);
    const replacementDefinition = definitionFor(replacementBase);
    const replacementModule = deferred<SynCloudOSAppModule>();
    runtime.apps.registerBundle({
      ...replacementBase,
      synWareDefinition: replacementDefinition,
      loadModule: () => replacementModule.promise,
    });
    const replacementLoad = runtime.bundles.loadBundle(manifest.id);
    staleModule.reject(new Error("superseded inline import failed"));

    await expect(staleLoad).rejects.toMatchObject({ code: "BUNDLE_IMPORT_FAILED" });
    expect(runtime.bundles.getBundleLoadState(manifest.id)).toBe("loading");
    expect(runtime.bundles.getBundleLoadError(manifest.id)).toBeNull();
    expect(runtime.events.getHistory().filter((event) => (
      event.type === "bundle.load.failed" && String((event.payload as { error?: unknown } | undefined)?.error).includes("superseded inline import failed")
    ))).toEqual([]);

    replacementModule.resolve({ default: replacementDefinition });
    await expect(replacementLoad).resolves.toMatchObject({ definition: replacementDefinition });
    await runtime.dispose("inline stale rejection fixture complete");
  });

  it("keeps a production inline load generation alive when its first caller aborts", async () => {
    const runtime = createTestRuntime({ id: "runtime:inline-first-caller-abort" });
    const manifest = createTestManifest({
      id: "inline-first-caller-abort-bundle",
      displayName: "Inline first caller abort bundle",
      packageName: "InlineFirstCallerAbort.app",
      route: "/inline-first-caller-abort",
    });
    const bundle = createTestBundle(manifest);
    const definition = definitionFor(bundle);
    const module = deferred<SynCloudOSAppModule>();
    runtime.apps.registerBundle({
      ...bundle,
      synWareDefinition: definition,
      loadModule: () => module.promise,
    });

    const firstCaller = new AbortController();
    const firstLoad = runtime.bundles.loadBundle(manifest.id, { signal: firstCaller.signal });
    const laterLoad = runtime.bundles.loadBundle(manifest.id);
    const firstExpectation = expect(firstLoad).rejects.toMatchObject({ name: "AbortError" });
    const laterExpectation = expect(laterLoad).resolves.toMatchObject({ definition });

    firstCaller.abort(new DOMException("first caller cancelled", "AbortError"));
    await firstExpectation;
    module.resolve({ default: definition });

    await laterExpectation;
    expect(runtime.bundles.getLoadedBundle(manifest.id)).toMatchObject({ definition });
    await runtime.dispose("inline first caller abort fixture complete");
  });

  it("cancels only a later production inline load caller", async () => {
    const runtime = createTestRuntime({ id: "runtime:inline-later-caller-abort" });
    const manifest = createTestManifest({
      id: "inline-later-caller-abort-bundle",
      displayName: "Inline later caller abort bundle",
      packageName: "InlineLaterCallerAbort.app",
      route: "/inline-later-caller-abort",
    });
    const bundle = createTestBundle(manifest);
    const definition = definitionFor(bundle);
    const module = deferred<SynCloudOSAppModule>();
    runtime.apps.registerBundle({
      ...bundle,
      synWareDefinition: definition,
      loadModule: () => module.promise,
    });

    const firstLoad = runtime.bundles.loadBundle(manifest.id);
    const laterCaller = new AbortController();
    const laterLoad = runtime.bundles.loadBundle(manifest.id, { signal: laterCaller.signal });
    const firstExpectation = expect(firstLoad).resolves.toMatchObject({ definition });
    const laterExpectation = expect(laterLoad).rejects.toMatchObject({ name: "AbortError" });

    laterCaller.abort(new DOMException("later caller cancelled", "AbortError"));
    module.resolve({ default: definition });

    await Promise.all([firstExpectation, laterExpectation]);
    expect(runtime.bundles.getLoadedBundle(manifest.id)).toMatchObject({ definition });
    await runtime.dispose("inline later caller abort fixture complete");
  });

  it("still revokes a production inline generation after runtime disposal", async () => {
    const runtime = createTestRuntime({ id: "runtime:inline-generation-dispose" });
    const manifest = createTestManifest({
      id: "inline-generation-dispose-bundle",
      displayName: "Inline generation disposal bundle",
      packageName: "InlineGenerationDispose.app",
      route: "/inline-generation-dispose",
    });
    const bundle = createTestBundle(manifest);
    const definition = definitionFor(bundle);
    const module = deferred<SynCloudOSAppModule>();
    runtime.apps.registerBundle({
      ...bundle,
      synWareDefinition: definition,
      loadModule: () => module.promise,
    });

    const firstLoad = runtime.bundles.loadBundle(manifest.id);
    const secondLoad = runtime.bundles.loadBundle(manifest.id);
    const firstExpectation = expect(firstLoad).rejects.toThrow(/changed|revoked|disposed/u);
    const secondExpectation = expect(secondLoad).rejects.toThrow(/changed|revoked|disposed/u);

    await runtime.dispose("inline generation disposal fixture complete");
    module.resolve({ default: definition });

    await Promise.all([firstExpectation, secondExpectation]);
    expect(runtime.bundles.getLoadedBundle(manifest.id)).toBeNull();
  });

  it("does not publish or retain a stale rejected import in the classic loader", async () => {
    const runtime = createTestRuntime({ id: "runtime:classic-stale-rejection" });
    const loader = createBundleLoader(runtime);
    const manifest = createTestManifest({
      id: "classic-stale-rejection-bundle",
      displayName: "Classic stale rejection bundle",
      packageName: "ClassicStaleRejection.app",
      route: "/classic-stale-rejection",
    });
    const original = createTestBundle(manifest);
    const originalDefinition = definitionFor(original);
    const staleModule = deferred<SynCloudOSAppModule>();
    loader.registerBundle({
      ...original,
      synWareDefinition: originalDefinition,
      loadModule: () => staleModule.promise,
    });
    const staleLoad = loader.loadBundle(manifest.id);

    const replacementBase = createTestBundle(manifest);
    const replacementDefinition = definitionFor(replacementBase);
    const replacementModule = deferred<SynCloudOSAppModule>();
    loader.registerBundle({
      ...replacementBase,
      synWareDefinition: replacementDefinition,
      loadModule: () => replacementModule.promise,
    });
    const replacementLoad = loader.loadBundle(manifest.id);
    staleModule.reject(new Error("superseded classic import failed"));

    await expect(staleLoad).rejects.toMatchObject({ code: "BUNDLE_IMPORT_FAILED" });
    expect(loader.getBundleLoadState(manifest.id)).toBe("loading");
    expect(loader.getBundleLoadError(manifest.id)).toBeNull();
    expect(runtime.events.getHistory().filter((event) => (
      event.type === "bundle.load.failed" && String((event.payload as { error?: unknown } | undefined)?.error).includes("superseded classic import failed")
    ))).toEqual([]);

    replacementModule.resolve({ default: replacementDefinition });
    await expect(replacementLoad).resolves.toMatchObject({ definition: replacementDefinition });
    await runtime.dispose("classic stale rejection fixture complete");
  });

  it("cancels stale definition completion in the standalone loader factory as well", async () => {
    const runtime = createTestRuntime({ id: "runtime:factory-stale-definition" });
    const loader = createBundleLoader({ runtimeId: runtime.runtimeId, events: runtime.events });
    const manifest = createTestManifest({
      id: "factory-stale-definition-bundle",
      displayName: "Factory Stale Definition Bundle",
      packageName: "FactoryStaleDefinitionBundle.app",
      route: "/factory-stale-definition-bundle",
    });
    const original = createTestBundle(manifest);
    const firstDefinition = definitionFor(original);
    const staleModule = deferred<SynCloudOSAppModule>();
    loader.registerBundle({
      ...original,
      synWareDefinition: firstDefinition,
      loadModule: () => staleModule.promise,
    });

    const staleLoad = loader.loadBundle(manifest.id);
    const replacementBase = createTestBundle(manifest);
    const replacementDefinition = definitionFor(replacementBase);
    const replacementLoad = vi.fn(async () => ({ default: replacementDefinition }));
    loader.registerBundle({
      ...replacementBase,
      synWareDefinition: replacementDefinition,
      loadModule: replacementLoad,
    });
    const currentLoad = loader.loadBundle(manifest.id);
    expect(replacementLoad).toHaveBeenCalledTimes(1);
    staleModule.resolve({ default: firstDefinition });

    await expect(staleLoad).rejects.toThrow(/changed while its module was loading/u);
    await expect(currentLoad).resolves.toMatchObject({ definition: replacementDefinition });
    expect(loader.getLoadedBundle(manifest.id)).toMatchObject({ definition: replacementDefinition });
    await runtime.dispose("standalone factory stale-definition fixture finished");
  });

  it("keeps a standalone loader generation alive when its first caller aborts", async () => {
    const runtime = createTestRuntime({ id: "runtime:factory-first-caller-abort" });
    const loader = createBundleLoader({ runtimeId: runtime.runtimeId, events: runtime.events });
    const manifest = createTestManifest({
      id: "factory-first-caller-abort-bundle",
      displayName: "Factory first caller abort bundle",
      packageName: "FactoryFirstCallerAbort.app",
      route: "/factory-first-caller-abort",
    });
    const bundle = createTestBundle(manifest);
    const definition = definitionFor(bundle);
    const module = deferred<SynCloudOSAppModule>();
    loader.registerBundle({
      ...bundle,
      synWareDefinition: definition,
      loadModule: () => module.promise,
    });

    const firstCaller = new AbortController();
    const firstLoad = loader.loadBundle(manifest.id, { signal: firstCaller.signal });
    const laterLoad = loader.loadBundle(manifest.id);
    const firstExpectation = expect(firstLoad).rejects.toMatchObject({ name: "AbortError" });
    const laterExpectation = expect(laterLoad).resolves.toMatchObject({ definition });

    firstCaller.abort(new DOMException("first caller cancelled", "AbortError"));
    await firstExpectation;
    module.resolve({ default: definition });

    await laterExpectation;
    expect(loader.getLoadedBundle(manifest.id)).toMatchObject({ definition });
    loader.dispose();
  });

  it("cancels only a later standalone loader caller", async () => {
    const runtime = createTestRuntime({ id: "runtime:factory-later-caller-abort" });
    const loader = createBundleLoader({ runtimeId: runtime.runtimeId, events: runtime.events });
    const manifest = createTestManifest({
      id: "factory-later-caller-abort-bundle",
      displayName: "Factory later caller abort bundle",
      packageName: "FactoryLaterCallerAbort.app",
      route: "/factory-later-caller-abort",
    });
    const bundle = createTestBundle(manifest);
    const definition = definitionFor(bundle);
    const module = deferred<SynCloudOSAppModule>();
    loader.registerBundle({
      ...bundle,
      synWareDefinition: definition,
      loadModule: () => module.promise,
    });

    const firstLoad = loader.loadBundle(manifest.id);
    const laterCaller = new AbortController();
    const laterLoad = loader.loadBundle(manifest.id, { signal: laterCaller.signal });
    const firstExpectation = expect(firstLoad).resolves.toMatchObject({ definition });
    const laterExpectation = expect(laterLoad).rejects.toMatchObject({ name: "AbortError" });

    laterCaller.abort(new DOMException("later caller cancelled", "AbortError"));
    module.resolve({ default: definition });

    await Promise.all([firstExpectation, laterExpectation]);
    expect(loader.getLoadedBundle(manifest.id)).toMatchObject({ definition });
    loader.dispose();
  });

  it("honours caller-local cancellation in the classic loader", async () => {
    const runtime = createTestRuntime({ id: "runtime:classic-caller-abort" });
    const loader = createBundleLoader(runtime);
    const manifest = createTestManifest({
      id: "classic-caller-abort-bundle",
      displayName: "Classic caller abort bundle",
      packageName: "ClassicCallerAbort.app",
      route: "/classic-caller-abort",
    });
    const bundle = createTestBundle(manifest);
    const definition = definitionFor(bundle);
    const module = deferred<SynCloudOSAppModule>();
    loader.registerBundle({
      ...bundle,
      synWareDefinition: definition,
      loadModule: () => module.promise,
    });

    const cancelledCaller = new AbortController();
    const cancelledLoad = loader.loadBundle(manifest.id, { signal: cancelledCaller.signal });
    const survivingLoad = loader.loadBundle(manifest.id);
    const cancelledExpectation = expect(cancelledLoad).rejects.toMatchObject({ name: "AbortError" });
    const survivingExpectation = expect(survivingLoad).resolves.toMatchObject({ definition });

    cancelledCaller.abort(new DOMException("classic caller cancelled", "AbortError"));
    await cancelledExpectation;
    module.resolve({ default: definition });

    await survivingExpectation;
    expect(loader.getLoadedBundle(manifest.id)).toMatchObject({ definition });
    await runtime.dispose("classic caller abort fixture complete");
  });

  it("invokes runtime lifecycle hooks without letting hook failures block launch", async () => {
    vi.useFakeTimers();
    const runtime = createTestRuntime();
    authoriseRuntime(runtime);
    const { AppRegistry, AppManagerController, LaunchServices, PolicyKit, RuntimeController } = createRuntimeHarness(runtime);
    const hookOrder: string[] = [];
    const manifest = createTestManifest({
      id: "hooked-launch",
      displayName: "Hooked Launch",
      packageName: "HookedLaunch.app",
      route: "/hooked-launch",
      componentKey: "HookedLaunchComponent",
      policy: { public: true }
    });

    PolicyKit.setAccessMode("public");
    AppRegistry.registerBundle(createTestBundle(manifest, {
      lifecycleHooks: {
        applicationWillLaunch: vi.fn(() => hookOrder.push("willLaunch")),
        applicationDidLaunch: vi.fn(() => {
          hookOrder.push("didLaunch");
          throw new Error("launch hook failed");
        }),
        applicationWillBecomeActive: vi.fn(() => hookOrder.push("willBecomeActive")),
        applicationDidBecomeActive: vi.fn(() => hookOrder.push("didBecomeActive")),
        applicationWillSuspend: vi.fn(() => hookOrder.push("willSuspend")),
        applicationDidSuspend: vi.fn(() => hookOrder.push("didSuspend")),
        applicationWillClose: vi.fn(() => hookOrder.push("willClose")),
        applicationDidClose: vi.fn(() => hookOrder.push("didClose"))
      }
    }));

    const manager = LaunchServices.openApp("hooked-launch", { source: "developer" });
    await flushLaunchTimers();

    expect(manager?.getState()).toBe("active");
    expect(hookOrder).toEqual(["willLaunch", "willBecomeActive", "didLaunch", "didBecomeActive"]);
    expect(RuntimeController.getEventHistory()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "bundle.lifecycle.failed",
          payload: expect.objectContaining({
            appId: "hooked-launch",
            hookName: "applicationDidLaunch",
            error: "launch hook failed"
          })
        })
      ])
    );

    AppManagerController.getManagerForApp("hooked-launch")?.suspend();
    AppManagerController.getManagerForApp("hooked-launch")?.close();

    expect(hookOrder).toEqual([
      "willLaunch",
      "willBecomeActive",
      "didLaunch",
      "didBecomeActive",
      "willSuspend",
      "didSuspend",
      "willClose",
      "didClose"
    ]);
  });

  it("records preload failures without opening windows or dirtying the launch queue", async () => {
    const { AppRegistry, LaunchServices, PolicyKit, RuntimeController, ServiceRegistry, WindowManager } = createRuntimeHarness(createTestRuntime());
    PolicyKit.setAccessMode("public");
    ServiceRegistry.ensureDefaults();
    ServiceRegistry.stopService("windowing");
    AppRegistry.registerBundle(createTestBundle({
      id: "preload-blocked",
      route: "/preload-blocked",
      requiredServices: ["windowing"],
      policy: { public: true }
    }));

    const preload = await LaunchServices.preloadApp("preload-blocked", { source: "developer" });

    expect(preload).toBeNull();
    expect(WindowManager.list()).toEqual([]);
    expect(LaunchServices.inspect()).toMatchObject({
      active: null,
      queued: [],
      deferred: []
    });
    expect(LaunchServices.getHistory().at(-1)).toMatchObject({
      action: "preload.failed",
      appId: "preload-blocked",
      code: expect.any(String)
    });
    expect(RuntimeController.getSnapshot().lifecycle["preload-blocked"]).toBe("disabled");
  });

  it("fails non-queued launches while another launch request is active", async () => {
    vi.useFakeTimers();
    const runtime = createTestRuntime();
    authoriseRuntime(runtime);
    const { AppRegistry, LaunchServices, PolicyKit, RuntimeController } = createRuntimeHarness(runtime);
    PolicyKit.setAccessMode("public");
    AppRegistry.registerMany([
      createTestBundle({ id: "active-launch", route: "/active-launch", policy: { public: true } }),
      createTestBundle({ id: "no-queue-launch", route: "/no-queue-launch", policy: { public: true } })
    ]);

    const activeManager = LaunchServices.openApp("active-launch", { source: "developer" });
    const rejectedManager = LaunchServices.openApp("no-queue-launch", { source: "developer", queue: false });

    expect(activeManager).not.toBeNull();
    expect(rejectedManager).toBeNull();
    expect(LaunchServices.inspect()).toMatchObject({
      active: expect.objectContaining({ appId: "active-launch" }),
      queued: [],
      deferred: []
    });
    expect(LaunchServices.getHistory().at(-1)).toMatchObject({
      action: "failed",
      appId: "no-queue-launch",
      code: "LAUNCH_IN_PROGRESS"
    });
    expect(RuntimeController.getSnapshot().errors.at(-1)).toMatchObject({
      code: "APP_LAUNCH_FAILED",
      appId: "no-queue-launch"
    });

    await flushLaunchTimers();

    expect(activeManager?.getState()).toBe("active");
  });
});
