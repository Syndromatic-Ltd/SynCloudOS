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

import { testPolicyProfile } from "./testPolicyProfile";
import { vi } from "vitest";
import { choreographyTimings } from "../../src/FX/AnimationFX/choreographyTimings";
import type {
  SynCloudOSAppIconManifest,
  SynCloudOSAppFrameManifest,
  SynCloudOSAppLifecycleManifest,
  SynCloudOSAppManifest,
  SynCloudOSAppNotificationManifest,
  SynCloudOSAppSeoManifest,
  SynCloudOSAppWebspringManifest,
  SynCloudOSAppWindowManifest
} from "../../src/SynCloudOS/AppRegistry/appRegistryTypes";
import type { SynCloudOSAppModule, SynCloudOSBundleModuleLoader, TrustedSynWareBundle } from "../../src/SynCloudOS/BundleLoader/bundleTypes";
import type {
  RuntimeBrowserLocation,
  RuntimeScreenSnapshot,
  RuntimeVisualViewportSnapshot,
  RuntimeWorkAreaSnapshot,
  SynCloudOSRuntimeEnvironment
} from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";
import { createSynCloudOS } from "../../src/SynCloudOS/Runtime/createSynCloudOS";
import { createSynCloudOSFacade } from "../../src/SynCloudOS/SynCloudOS";
import { createBrowserRuntimeEnvironment, hasNativeProxyBrand } from "../../src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment";
import { createSynCloudOSBrowserRouteSynchronizer } from "../../src/SynCloudOS/PlatformAdapters/BrowserRouteSync";
import type { SynCloudOSRuntime, SynCloudOSRuntimeConfig } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";
import type { SynCloudOSPolicySubject, SynCloudOSPolicySubjectGrant } from "../../src/SynCloudOS/PolicyKit/policyTypes";
import type { IdentitySessionAdapter, IdentitySessionAdapterSnapshot } from "../../src/SynCloudOS/Identity/identitySessionTypes";
import { createMountedSynWareRuntime, type MountedSynWareRuntime } from "../../src/SynCloudOS/AppSDK/appRuntimeFacade";
import {
  createSynCloudOSHostInstallContext,
  prepareSynCloudOSHostContributions,
  type SynCloudOSHostContribution,
  type SynCloudOSHostInstallContext,
} from "../../src/SynCloudOS/HostContributions/hostContribution";
import { createSynWare, createSynWareBundle } from "../../src/SynCloudOS/AppSDK/createSynWare";
import type { SynWareManifestV1 } from "../../src/SynCloudOS/AppSDK/manifest";
import {
  trustSynWareBundleForTest,
  type SynWareTrustedPrivilege,
} from "../../src/SynCloudOS/BundleLoader/trustedBundleProvenance";
import type { SynWareDefinition } from "../../src/SynCloudOS/AppSDK/appDefinitionTypes";
import type { WebspringContentSource } from "../../src/Webspring/webspringContent";
import { InMemoryDocumentAdapter } from "../../src/SynCloudOS/Documents/Adapters/InMemoryDocumentAdapter";

type TestManifestOverrides = Partial<
  Omit<SynCloudOSAppManifest, "icon" | "webspring" | "window" | "frame" | "lifecycle" | "notifications" | "seo">
> & {
  icon?: Partial<SynCloudOSAppIconManifest>;
  webspring?: Partial<SynCloudOSAppWebspringManifest>;
  window?: Partial<SynCloudOSAppWindowManifest>;
  frame?: Partial<SynCloudOSAppFrameManifest>;
  lifecycle?: Partial<SynCloudOSAppLifecycleManifest>;
  notifications?: Partial<SynCloudOSAppNotificationManifest>;
  seo?: Partial<SynCloudOSAppSeoManifest>;
};

function titleCase(value: string) {
  return value
    .split(/[-.\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function createTestManifest(overrides: TestManifestOverrides = {}): SynCloudOSAppManifest {
  const id = overrides.id ?? "test-app";
  const displayName = overrides.displayName ?? titleCase(id);
  const packageName = overrides.packageName ?? `${displayName.replace(/\s+/g, "")}.app`;

  return {
    id,
    name: overrides.name ?? id,
    packageName,
    bundleId: overrides.bundleId ?? `com.syndromatic.tests.${id}`,
    displayName,
    shortName: overrides.shortName ?? displayName,
    description: overrides.description ?? `${displayName} test fixture.`,
    type: overrides.type ?? "internal",
    route: overrides.route ?? `/${id}`,
    path: overrides.path ?? `${packageName}/`,
    componentKey: overrides.componentKey ?? `${displayName.replace(/\s+/g, "")}Component`,
    presentation: overrides.presentation ?? "appView",
    requiredServices: overrides.requiredServices ?? ["webspring", "routing", "windowing"],
    optionalServices: overrides.optionalServices ?? [],
    icon: {
      src: `/test-assets/icons/${id}.png`,
      alt: `${displayName} icon`,
      ...overrides.icon
    },
    webspring: {
      visible: true,
      order: 10,
      ...overrides.webspring
    },
    window: {
      title: displayName,
      defaultWidth: 720,
      defaultHeight: 520,
      minWidth: 320,
      minHeight: 280,
      chrome: "system",
      resizable: true,
      ...overrides.window
    },
    frame: overrides.frame,
    lifecycle: {
      preload: true,
      ...overrides.lifecycle
    },
    notifications: {
      showsNotifications: false,
      badgeCount: 0,
      ...overrides.notifications
    },
    seo: {
      title: displayName,
      description: `${displayName} fixture route.`,
      ...overrides.seo
    },
    policy: overrides.policy
  };
}

export function createTestBundle(
  overrides: TestManifestOverrides | SynCloudOSAppManifest = {},
  bundleOverrides: Omit<Partial<TrustedSynWareBundle>, "manifest"> = {}
): TrustedSynWareBundle {
  const manifest = "icon" in overrides && "webspring" in overrides && "window" in overrides
    ? overrides
    : createTestManifest(overrides);
  const testManifest = {
    schemaVersion: 1,
    id: manifest.id,
    version: "1.0.0",
    title: manifest.displayName,
    routes: [{ path: manifest.route, primary: true }],
    services: [...manifest.requiredServices, ...(manifest.optionalServices ?? [])].map((id) => ({
      id,
      required: manifest.requiredServices.includes(id),
    })),
    permissions: manifest.type === "system" ? ["diagnostics.view"] : ["app.open.public"],
    webspring: {
      visible: manifest.webspring.visible,
      order: manifest.webspring.order,
    },
  } as const satisfies SynWareManifestV1;
  const TestSynWareComponent = () => null;
  const defaultDefinition = createSynWare({ manifest: testManifest, root: TestSynWareComponent });
  const { loadModule: suppliedLoadModule, ...remainingBundleOverrides } = bundleOverrides;
  const requestedLoadModule = suppliedLoadModule ?? (() => Promise.resolve({
    default: defaultDefinition,
  } satisfies SynCloudOSAppModule));
  const loadModule: SynCloudOSBundleModuleLoader = async () => {
    const module = await requestedLoadModule();
    const candidate = module.default;
    if (typeof candidate !== "function") return module;
    return {
      default: createSynWare({ manifest: testManifest, root: candidate }),
    };
  };

  return {
    manifest,
    synWareManifest: defaultDefinition.manifest,
    componentKey: manifest.componentKey,
    modulePath: `${manifest.path}Contents/index.tsx`,
    services: [...manifest.requiredServices, ...(manifest.optionalServices ?? [])],
    optionalServices: manifest.optionalServices,
    permissions: manifest.type === "system" ? ["diagnostics.view"] : ["app.open.public"],
    loadModule,
    ...remainingBundleOverrides
  };
}

export function createRuntimeHarness(runtime: SynCloudOSRuntime) {
  // Runtime tests deliberately exercise the same public graph exposed to the
  // browser. Compatibility coverage may not create a second, test-only
  // collection of stateful services.
  const SynCloudOS = createSynCloudOSFacade(runtime) as any;
  testRuntimeByLoginService.set(SynCloudOS.LoginServices, runtime);

  return {
    runtime,
    RuntimeController: SynCloudOS.Runtime,
    RuntimeStore: runtime.store,
    run: SynCloudOS.run,
    transactions: SynCloudOS.Runtime,
    WebspringChoreography: SynCloudOS.WebspringChoreography,
    AppLifecycle: SynCloudOS.AppLifecycle,
    AppRegistry: SynCloudOS.AppRegistry,
    AppManagerController: SynCloudOS.AppManager,
    BootManager: SynCloudOS.BootManager,
    BundleLoader: SynCloudOS.BundleLoader,
    Inspector: SynCloudOS.Inspector,
    Lifecycle: SynCloudOS.Lifecycle,
    LaunchServices: SynCloudOS.LaunchServices,
    LocaleServices: SynCloudOS.LocaleServices,
    LoginServices: SynCloudOS.LoginServices,
    PermissionManager: SynCloudOS.PermissionManager,
    PluginRegistry: SynCloudOS.PluginRegistry,
    PolicyKit: SynCloudOS.PolicyKit,
    ResponsiveModeManager: SynCloudOS.ResponsiveModeManager,
    RouteManager: SynCloudOS.RouteManager,
    ServiceRegistry: SynCloudOS.ServiceRegistry,
    Statechart: SynCloudOS.Statechart,
    WindowManager: SynCloudOS.WindowManager,
    SynCloudOS
  };
}

const activeTestIdentitySession: IdentitySessionAdapterSnapshot = Object.freeze({
  id: "test-session",
  subjectId: "test-subject",
  state: "active",
  expiresAt: Date.UTC(2100, 0, 1),
  claims: Object.freeze({
    displayName: "Test User",
    email: "test@example.test",
    roles: "employee",
    synId: "test@example.test",
  }),
});

type TestIdentitySessionAdapter = IdentitySessionAdapter & {
  set(snapshot: IdentitySessionAdapterSnapshot | null): void;
};

const testRuntimeIdentityAdapters = new WeakMap<SynCloudOSRuntime, TestIdentitySessionAdapter>();
const testRuntimeByLoginService = new WeakMap<object, SynCloudOSRuntime>();

function throwIfTestIdentityAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new Error("Test identity session operation cancelled.");
}

function createTestIdentitySessionAdapter(): TestIdentitySessionAdapter {
  let snapshot: IdentitySessionAdapterSnapshot | null = null;
  let disposed = false;
  const listeners = new Set<(value: IdentitySessionAdapterSnapshot | null) => void>();
  const publish = (value: IdentitySessionAdapterSnapshot | null) => {
    snapshot = value;
    listeners.forEach((listener) => listener(snapshot));
  };
  return {
    id: "test-identity-session",
    async read(signal) {
      throwIfTestIdentityAborted(signal);
      return snapshot;
    },
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async end({ signal }) {
      throwIfTestIdentityAborted(signal);
      if (!disposed) publish(null);
    },
    dispose() {
      disposed = true;
      snapshot = null;
      listeners.clear();
    },
    set(value) {
      if (!disposed) publish(value);
    },
  };
}

function resolveTestRuntime(runtimeOrLoginService: SynCloudOSRuntime | object): SynCloudOSRuntime {
  if ("identity" in runtimeOrLoginService) return runtimeOrLoginService as SynCloudOSRuntime;
  const runtime = testRuntimeByLoginService.get(runtimeOrLoginService);
  if (!runtime) throw new Error("The test login service is not associated with a SynCloudOS runtime.");
  return runtime;
}

export function unlockRuntime(runtimeOrLoginService: SynCloudOSRuntime | object) {
  const runtime = resolveTestRuntime(runtimeOrLoginService);
  const adapter = testRuntimeIdentityAdapters.get(runtime);
  if (!adapter) throw new Error("This runtime uses an explicitly supplied identity adapter and cannot be unlocked by the default test fixture.");
  adapter.set(activeTestIdentitySession);
  void runtime.identity.session.refresh();
  return {
    ok: true as const,
    reason: "authorised" as const,
    message: "Test identity session authorised.",
    synId: "test@example.test",
    accessClass: "external" as const,
    displayName: "Test User",
  };
}

// Runtime tests drive LaunchServices without a React tree, so no app frame ever reports that it
// has painted. Draining the staging ceiling stands in for that report.
export function authoriseTestRuntime(runtime: SynCloudOSRuntime): SynCloudOSRuntime {
  unlockRuntime(runtime);
  return runtime;
}

export async function flushLaunchTimers() {
  await flushMultiSwitchLaunch();
  await vi.advanceTimersByTimeAsync(choreographyTimings.webspringLaunchStageFallbackMs);
}

// MultiSwitch presents through its own choreography and never stages, so it settles as soon as the
// route delay and the activation frame have passed. Flushing further would run past
// `multiSwitchSettleFallbackMs` and close the switch these tests are trying to observe.
export async function flushMultiSwitchLaunch() {
  await vi.advanceTimersByTimeAsync(choreographyTimings.routeReopenDelayMs);
  await vi.advanceTimersByTimeAsync(32);
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear() { values.clear(); },
    getItem(key) { return values.get(key) ?? null; },
    key(index) { return Array.from(values.keys())[index] ?? null; },
    removeItem(key) { values.delete(key); },
    setItem(key, value) { values.set(key, String(value)); }
  };
}

type TestRuntimeEnvironmentOptions = {
  readonly proxyBrandProbe?: "host" | "omit";
};

export function createTestRuntimeEnvironment(
  options: TestRuntimeEnvironmentOptions = {},
) {
  const hostSetTimeout = globalThis.setTimeout.bind(globalThis);
  const hostClearTimeout = globalThis.clearTimeout.bind(globalThis);
  const schedule = (callback: () => void, delayMs: number) =>
    (vi.isFakeTimers() ? globalThis.setTimeout : hostSetTimeout)(callback, delayMs);
  const cancel = (handle: unknown) =>
    (vi.isFakeTimers() ? globalThis.clearTimeout : hostClearTimeout)(handle as ReturnType<typeof setTimeout>);
  const listeners = new Map<string, Set<unknown>>();
  const visualViewport: RuntimeVisualViewportSnapshot = {
    width: 1440,
    height: 900,
    offsetLeft: 0,
    offsetTop: 0,
    scale: 1
  };
  const screen: RuntimeScreenSnapshot = {
    width: 1440,
    height: 900,
    availableLeft: 0,
    availableTop: 0,
    availableWidth: 1440,
    availableHeight: 900,
    colourDepth: 24,
    pixelDepth: 24,
    orientation: "landscape-primary"
  };
  const workArea: RuntimeWorkAreaSnapshot = {
    x: 0,
    y: 0,
    width: 1440,
    height: 900,
    devicePixelRatio: 1,
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 }
  };
  const addWindowListener = vi.fn((type: string, listener: unknown) => {
    const bucket = listeners.get(type) ?? new Set<unknown>();
    bucket.add(listener);
    listeners.set(type, bucket);
    return vi.fn(() => bucket.delete(listener));
  });
  const browser = {
    getLocation: (): RuntimeBrowserLocation => {
      const location = typeof window === "undefined" ? null : window.location;
      return location
        ? {
            href: location.href,
            origin: location.origin,
            pathname: location.pathname,
            search: location.search,
            hash: location.hash,
          }
        : {
            href: "http://syncloudos.test/",
            origin: "http://syncloudos.test",
            pathname: "/",
            search: "",
            hash: "",
          };
    },
    getWindow: () => typeof window === "undefined" ? null : window,
    getDocument: () => typeof document === "undefined" ? null : document,
    getNavigator: () => typeof navigator === "undefined" ? null : navigator,
  };
  const environment: SynCloudOSRuntimeEnvironment & {
    activeListenerCount(): number;
    addWindowListener: typeof addWindowListener;
  } = {
    get navigation() {
      const host = typeof window === "undefined" ? null : window as Window & { navigation?: SynCloudOSRuntimeEnvironment["navigation"] };
      return host?.navigation ?? null;
    },
    browser,
    routeSynchronization: createSynCloudOSBrowserRouteSynchronizer(browser),
    localStorage: createMemoryStorage(),
    sessionStorage: createMemoryStorage(),
    platform: "unknown",
    layoutViewport: {
      getSnapshot: () => ({ width: visualViewport.width, height: visualViewport.height }),
      subscribe: vi.fn(() => () => undefined)
    },
    visualViewport: {
      getSnapshot: () => visualViewport,
      subscribe: vi.fn(() => () => undefined)
    },
    screen: {
      getSnapshot: () => screen,
      subscribe: vi.fn(() => () => undefined)
    },
    workArea: {
      getSnapshot: () => workArea,
      subscribe: vi.fn(() => () => undefined)
    },
    ...(options.proxyBrandProbe === "omit"
      ? {}
      : { isNativeProxy: hasNativeProxyBrand }),
    now: vi.fn(() => Date.now()),
    randomUUID: vi.fn(() => `test-uuid-${Math.random().toString(16).slice(2)}`),
    // Resolve fake timers at invocation time, while keeping a real runtime
    // environment independent from later process-global timer stubs.
    setTimeout: vi.fn((callback: () => void, delayMs: number) => schedule(callback, delayMs)),
    clearTimeout: vi.fn((handle: unknown) => cancel(handle)),
    requestAnimationFrame: vi.fn((callback: (timestamp: number) => void) => schedule(() => callback(Date.now()), 16)),
    cancelAnimationFrame: vi.fn((handle: unknown) => cancel(handle)),
    matchMedia: vi.fn((query: string) => ({
      media: query,
      matches: false,
      subscribe: vi.fn(() => () => undefined),
      dispose: vi.fn()
    })),
    addWindowListener: addWindowListener as SynCloudOSRuntimeEnvironment["addWindowListener"],
    activeListenerCount: () => Array.from(listeners.values()).reduce((total, bucket) => total + bucket.size, 0)
  };
  return environment;
}

let testRuntimeSequence = 0;

export function createTestRuntime(
  overrides: Partial<SynCloudOSRuntimeConfig> = {},
): SynCloudOSRuntime {
  testRuntimeSequence += 1;
  const environment = overrides.environment ?? createTestRuntimeEnvironment();
  const applicationDocuments = overrides.applicationDocuments;
  const testIdentityAdapter = overrides.identity ? null : createTestIdentitySessionAdapter();
  const runtime = createSynCloudOS({
    id: overrides.id ?? `runtime:test:${testRuntimeSequence}`,
    environment,
    initialBundles: overrides.initialBundles ?? [],
    policyProfile: testPolicyProfile,
    applicationDocuments: {
      ...(applicationDocuments ?? {}),
      initialAdapters: applicationDocuments?.initialAdapters ?? [new InMemoryDocumentAdapter(environment)],
      initialTypes: applicationDocuments?.initialTypes ?? [],
    },
    ...overrides,
    identity: overrides.identity ?? { sessionAdapter: testIdentityAdapter! },
    trustedDocumentKinds: overrides.trustedDocumentKinds ?? [],
  });
  if (testIdentityAdapter) testRuntimeIdentityAdapters.set(runtime, testIdentityAdapter);
  return runtime;
}

/**
 * Test-only equivalent of a rendered SynWare mount. It deliberately mints the
 * production AppSDK facade instead of rest-spreading a kernel runtime and
 * casting it as an application capability object.
 */
export function mountTestSynWareRuntime(
  runtime: SynCloudOSRuntime,
  appId: string,
  responderId = `application:${appId}`,
): MountedSynWareRuntime {
  const app = runtime.apps.getApp(appId);
  if (!app) throw new Error(`Test application ${appId} must be registered before it is mounted.`);
  if (!runtime.responders.get(responderId)) {
    runtime.responders.register({ id: responderId, kind: "application", parentId: "runtime", scopeId: responderId });
  }
  return createMountedSynWareRuntime({ runtime, app, responderId });
}

export interface TestHostContributionsInstallation {
  readonly contexts: readonly SynCloudOSHostInstallContext[];
  readonly runBootNotifications(): Promise<void>;
  readonly cleanup(): Promise<void>;
}

export interface TestHostServiceResolution<TClient> {
  readonly client: TClient;
  readonly installation: TestHostContributionsInstallation;
}

export async function installTestHostContributions(
  runtime: SynCloudOSRuntime,
  contributions: readonly SynCloudOSHostContribution[],
  resources: Readonly<Record<string, string>> = {},
): Promise<TestHostContributionsInstallation> {
  const prepared = await prepareSynCloudOSHostContributions(contributions, runtime.environment);
  const contentSources: Record<string, WebspringContentSource> = Object.create(null) as Record<string, WebspringContentSource>;
  const installed: Array<{
    readonly context: SynCloudOSHostInstallContext;
    readonly runBootNotifications(): Promise<void>;
    readonly cleanup(): Promise<void>;
  }> = [];
  let cleaned = false;
  const cleanupInstalled = async () => {
    for (const handle of [...installed].reverse()) await handle.cleanup();
  };
  try {
    for (const contribution of prepared) {
      for (const bundle of contribution.initialBundles) {
        const appId = bundle.synWareManifest?.id ?? bundle.manifest.id;
        if (!runtime.bundles.getBundle(appId) && !runtime.apps.register(bundle)) {
          throw new Error(`Test host contribution bundle ${appId} could not be registered.`);
        }
      }
      const handle = createSynCloudOSHostInstallContext(contribution, runtime, contentSources, resources);
      let contributionCleanup: (() => void | Promise<void>) | undefined;
      try {
        for (const adapter of contribution.applicationDocuments?.initialAdapters ?? []) {
          handle.context.documents.registerAdapter(adapter);
        }
        for (const type of contribution.applicationDocuments?.initialTypes ?? []) {
          handle.context.documents.registerType(type);
        }
        contributionCleanup = await contribution.install?.(handle.context);
        if (contributionCleanup !== undefined && typeof contributionCleanup !== "function") {
          throw new TypeError(`Host contribution ${contribution.id} cleanup must be a function.`);
        }
      } catch (error) {
        if (contributionCleanup) await contributionCleanup();
        await handle.cleanup();
        throw error;
      }
      let contributionCleaned = false;
      installed.push({
        context: handle.context,
        runBootNotifications: handle.runBootNotifications,
        async cleanup() {
          if (contributionCleaned) return;
          contributionCleaned = true;
          if (contributionCleanup) await contributionCleanup();
          await handle.cleanup();
        },
      });
    }
  } catch (error) {
    await cleanupInstalled();
    throw error;
  }
  const contexts = Object.freeze(installed.map(({ context }) => context));
  return Object.freeze({
    contexts,
    async runBootNotifications() {
      if (cleaned) return;
      for (const handle of installed) await handle.runBootNotifications();
    },
    async cleanup() {
      if (cleaned) return;
      cleaned = true;
      await cleanupInstalled();
    },
  });
}

/** Registers a canonical V1 manifest or captured app definition through the
 * same bundle and AppRegistry path used by production bundles. */
export function registerTestSynWare(
  runtime: SynCloudOSRuntime,
  definition: SynWareDefinition | Readonly<SynWareManifestV1>,
) {
  const isDefinition = "manifest" in definition;
  const manifest = isDefinition
    ? (definition as SynWareDefinition).manifest
    : definition as Readonly<SynWareManifestV1>;
  const appId = manifest.id;
  const existing = runtime.apps.getApp(appId);
  if (existing) {
    
    
    
    return existing;
  }
  const appDefinition = isDefinition
    ? createSynWare(definition as SynWareDefinition)
    : createSynWare({ manifest, root: () => null });
  const app = runtime.apps.register(createSynWareBundle(appDefinition));
  if (!app) throw new Error(`Test application ${appId} could not be registered.`);
  
  
  
  return app;
}

/** Explicitly mints host-owned test provenance for a canonical V1 fixture.
 * Ordinary test registration deliberately cannot acquire these privileges. */
export function createTrustedTestSynWareBundle(
  manifest: Readonly<SynWareManifestV1>,
  privileges: readonly SynWareTrustedPrivilege[],
  appDefinition?: SynWareDefinition,
) {
  const definition = appDefinition ? createSynWare(appDefinition) : createSynWare({ manifest, root: () => null });
  if (definition.manifest.id !== manifest.id) throw new Error("Trusted test definition must belong to its declared manifest.");
  return trustSynWareBundleForTest(createSynWareBundle(definition), {
    sourceKey: `tests/runtime/${manifest.id}`,
    privileges,
  });
}

/** Explicitly registers a V1 fixture through the trusted host-test path. */
export function registerTrustedTestSynWare(
  runtime: SynCloudOSRuntime,
  manifest: Readonly<SynWareManifestV1>,
  privileges: readonly SynWareTrustedPrivilege[],
  appDefinition?: SynWareDefinition,
) {
  const existing = runtime.apps.getApp(manifest.id);
  if (existing) {
    const provenance = runtime.bundles.getTrustedBundleProvenance(manifest.id);
    if (!provenance || privileges.some((privilege) => !provenance.privileges.has(privilege))) {
      throw new Error(`Existing test application ${manifest.id} does not hold the requested trusted provenance.`);
    }
    return existing;
  }
  const candidate = manifest as unknown as Record<string, unknown>;
  const { devOnly: _devOnly, route: _route, ...canonicalManifest } = candidate;
  const bundle = createTrustedTestSynWareBundle(canonicalManifest as SynWareManifestV1, privileges, appDefinition);
  const app = runtime.apps.register(bundle);
  if (!app) throw new Error(`Trusted test application ${manifest.id} could not be registered.`);
  if (!runtime.bundles.getTrustedBundleProvenance(manifest.id)) {
    throw new Error(`Trusted test application ${manifest.id} lost its provenance during registration.`);
  }
  return app;
}

/**
 * Request fields that evaluate a policy request as `subject`. Request metadata
 * is never authority, so this issues a grant through the same host-only
 * PolicyKit API that host contributions and the plugin registry use.
 */
export function asPolicySubject(
  policyKit: { issueSubject(subject: SynCloudOSPolicySubject, options: { purpose: string }): SynCloudOSPolicySubjectGrant },
  subject: SynCloudOSPolicySubject,
) {
  return { subject, subjectGrant: policyKit.issueSubject(subject, { purpose: "test" }) };
}
