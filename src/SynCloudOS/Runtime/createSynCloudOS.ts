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

import { normalizeBundleIdentifier } from "../Identity/bundleIdentifier.mjs";
import { createAudioGraphHostService } from "../AudioFX/AudioGraphHostService";
import { MotionService } from "../MotionFX/MotionService";
import { LocationService } from "../LocationFX/LocationService";
import { MIDIService } from "../MIDIFX/MIDIService";
import { VideoCaptureService } from "../VideoFX/VideoCaptureService";
import { LuminaIndexService } from "../LuminaFX/LuminaIndexService";
import { LuminaEligibilityRegistry } from "../LuminaFX/LuminaEligibility";
import { LUFXHostService } from "../LuminaFX/LUFXHostService";
import { createRuntimeHapticsHostService } from "../HapticsFX/HapticsHostService";
import { AUFXSystemFeedbackBus } from "../AudioFX/AUFXSystemFeedbackBus";
import { createBundleLoader } from "../BundleLoader/BundleLoader";
import { createEventBus as createFactoryEventBus } from "../EventBus/EventBus";
import { createPersistence } from "../Persistence/Persistence";
import { createSystemUIService } from "../SystemUI/systemUIService";
import { createAppRegistry } from "../AppRegistry/AppRegistry";
import { createApplicationState } from "../ApplicationState/ApplicationState";
import { createAppManagerController } from "../AppManager/AppManagerController";
import { createBootManager } from "../BootManager/BootManager";
import { createWebspringChoreography } from "../Choreography/WebspringChoreography";
import { createSynCloudOSGlobalWatchdog } from "../ErrorManager/SynCloudOSGlobalWatchdog";
import { createErrorManager } from "../ErrorManager/ErrorManager";
import { createSynCloudOSAlertCenter } from "../SystemUI/alertCenter";
import { createInspector } from "../Inspector/Inspector";
import { createLaunchServices } from "../LaunchServices/LaunchServices";
import { createLifecycle } from "../Lifecycle/Lifecycle";
import { createNotificationCenter } from "../NotificationCenter/NotificationCenter";
import { createPluginRegistry } from "../PluginRegistry/PluginRegistry";
import {
  createContentBoundPresentationTraitsService,
  createResponsiveModeManager,
} from "../ResponsiveModeManager/ResponsiveModeManager";
import { createServiceRegistry } from "../ServiceRegistry/ServiceRegistry";
import { createRouteManager } from "../RouteManager/RouteManager";
import { createStatechart } from "../Statechart/Statechart";
import { createIdentity } from "../Identity/Identity";
import { isAbortError } from "../BundleLoader/definitionLifecycle";
import { createWebspringState } from "../WebspringState/WebspringState";
import { createPreferencePaneRegistry } from "../Preferences";
import { createSettingsService } from "../Settings/settingsService";
import { createAppearanceService } from "../Appearance/appearanceService";
import { createOperationCoordinator } from "../Operations/OperationCoordinator";
import { createPresentationSettlementCoordinator } from "../Operations/PresentationSettlementCoordinator";
import { createRuntimeCacheRegistry } from "../Cache/RuntimeCacheRegistry";
import { createCommandSystem } from "../Commands/CommandSystem";
import { registerStandardCommands } from "../Commands/standardCommands";
import { createResponderGraph } from "../Responders/ResponderGraph";
import { createFocusManager } from "../Focus/FocusManager";
import { createKeyBindingManager } from "../KeyBindings/KeyBindingManager";
import { createUndoManagerRegistry } from "../Undo";
import { createPersistenceDocumentStore } from "../DocumentStore";
import type { SynCloudOSDocumentStoreLock } from "../DocumentStore";
import { DocumentController, InMemoryDocumentRecoveryStore, createDocumentResourceService } from "../Documents";
import { createDocumentAssetRuntimeIntegration } from "./DocumentAssetRuntimeIntegration";
import {
  ScreenService,
  WindowContentRegistry,
  WindowManager,
  createWindowInstallationIdentityPort,
  InvalidWindowRestorationSnapshotError,
  resolveWindowPersistenceNamespace,
  type CreateWindowRequest,
  type WindowIdPort,
  type WindowSerializableValue,
} from "../Windows";
import type { SynWareOwnedDocumentRematerialiseContext } from "../AppSDK/runtimeContracts";
import { createPolicyKit } from "../PolicyKit/PolicyKit";
import { createRuntimePerformancePolicy } from "../Performance/RuntimePerformancePolicy";
import { defaultPolicyProfile } from "../PolicyKit/defaultPolicyProfile";
import type { SynCloudOSAccessMode } from "../PolicyKit/policyTypes";
import { createRuntimeUserNotificationCenter } from "../NotificationCenter/runtimeNotificationCenter";
import { createPersistenceBackedUserNotificationPersistence } from "../NotificationCenter/NotificationPersistence";
import {
  createAnonymousIdentitySessionAdapter,
  createIdentitySessionService,
} from "../Identity/IdentitySessionService";
import { createInstanceLoginService } from "../LoginServices/InstanceLoginService";
import { createRuntimeLocaleServices } from "../LocaleServices/LocaleServices";
import { createColourPanelService } from "../ColourPanel";
import { createPasteboardRegistry } from "../Pasteboard";
import { createDragSessionManager } from "../Drag";
import { createRuntimeTransferAuthority, type RuntimeTransferAuthorityControl } from "../Transfer";
import { createTrackingRegionManager } from "../Pointer";
import { createTextFXLayoutService } from "../TextFX";
import { createRuntimeImageService } from "../Images";
import { createRuntimeAnimationService } from "../AnimationFX";
import { createRuntimeAudioService } from "../AudioFX";
import { createRuntimeWebContentSessionManager } from "../WebContent";
import { MediaClockService } from "../MediaFX/MediaClockService";
import { alwaysReady, createRuntimeDisposalCoordinator, type RuntimeDisposalCoordinator } from "./DisposalCoordinator";
import { createRuntimeController } from "./RuntimeController";
import { createRuntimeStore } from "./RuntimeStore";
import { subscribeLifecycleTransitions } from "./lifecycleTransitions";
import { createRuntimeDiagnostics } from "../Diagnostics/runtimeDiagnostics";
import { createHeavyJobAdmission, defaultHeavyJobConcurrency } from "../Operations/HeavyJobAdmission";
import { createRuntimeResourceLedger } from "../Resources/RuntimeResourceLedger";
import { createRuntimeOwnerToken } from "./runtimeOwner";
import type {
  RuntimeOperationHandle,
  SynCloudOSAppRegistry,
  SynCloudOSBootOptions,
  SynCloudOSBootResult,
  SynCloudOSBundleLoader,
  SynCloudOSIdentityService,
  SynCloudOSRuntime,
  SynCloudOSRuntimeConfig,
  SynCloudOSRuntimeId,
  SynCloudOSRuntimeStore,
  SynCloudOSServiceRegistry,
  SynCloudOSRuntimeController,
} from "./runtimeInstanceTypes";
import type {
  RuntimeDisposalParticipant,
  RuntimeDisposalRequest,
  RuntimeDisposalState,
} from "./disposalTypes";

function asRuntimeId(value: string): SynCloudOSRuntimeId {
  return value as SynCloudOSRuntimeId;
}

function accessModeForAuthenticationPolicy(
  policy: SynCloudOSRuntimeConfig["authenticationPolicy"],
): SynCloudOSAccessMode | undefined {
  if (policy === "required") return "fullyLocked";
  if (policy === "disabled" || policy === "optional") return "mixed";
  return undefined;
}






export function createSynCloudOS(config: SynCloudOSRuntimeConfig): SynCloudOSRuntime {
  const runtimeId = asRuntimeId(config.id ?? `runtime:${config.environment.randomUUID()}`);
  const ownerToken = createRuntimeOwnerToken();
  const policyProfile = config.policyProfile ?? defaultPolicyProfile;
  const controller = new AbortController();
  const store = createRuntimeStore(runtimeId);
  const diagnostics = createRuntimeDiagnostics({ eventHistoryLimit: config.operationHistoryLimit ?? 240 });
  const resources = createRuntimeResourceLedger({ softBudgetBytes: config.resourceSoftBudgetBytes ?? null });
  const events = createFactoryEventBus({
    runtimeId,
    now: config.environment.now,
    randomUUID: config.environment.randomUUID,
    history: diagnostics.events,
  });
  const operations = createOperationCoordinator({
    runtimeId,
    now: config.environment.now,
    randomUUID: config.environment.randomUUID,
    setTimeout: config.environment.setTimeout,
    clearTimeout: config.environment.clearTimeout,
    // The coordinator keeps its own bounded operation history
    // (`operations.getHistory()`); it is not mirrored into reactive state.
    historyLimit: config.operationHistoryLimit ?? 160,
  });
  const jobs = createHeavyJobAdmission({
    concurrency: defaultHeavyJobConcurrency(config.environment.logicalProcessorCount),
    now: config.environment.now,
    ...config.jobs,
  });
  const performancePolicy = createRuntimePerformancePolicy({
    adaptive: config.performancePolicy !== "fixed",
    signals: {
      logicalProcessorCount: config.environment.logicalProcessorCount,
      deviceMemoryGiB: config.environment.deviceMemoryGiB,
    },
    networkHints: config.environment.network?.getSnapshot(),
    standardConcurrency: jobs.snapshot().concurrency,
    standardSoftBudgetBytes: config.resourceSoftBudgetBytes ?? null,
    now: config.environment.now,
    setTimeout: (callback, delayMs) => config.environment.setTimeout(callback, delayMs),
    clearTimeout: (handle) => config.environment.clearTimeout(handle),
    jobs,
    resources,
  });
  const performanceSignalSubscriptions = [
    config.environment.network?.subscribe((hints) => performancePolicy.updateNetworkHints(hints)),
    config.environment.observeLongTasks?.((durationMs) => performancePolicy.reportLongTask(durationMs)),
  ];
  // Admitted heavy-job reservations and diagnostic histories are reported
  // as active (not reclaimable) residency.
  resources.register({
    id: "runtime.jobs",
    kind: "worker-jobs",
    owner: "runtime",
    *measure() {
      const bytes = jobs.snapshot().activeBytes;
      if (bytes > 0) yield { key: jobs, bytes, state: "active" as const };
    },
  });
  resources.register({
    id: "runtime.diagnostics",
    kind: "diagnostics",
    owner: "runtime",
    *measure() {
      yield { key: diagnostics.events, bytes: diagnostics.events.statistics().estimatedBytes, state: "active" as const };
      yield { key: diagnostics.transactions, bytes: diagnostics.transactions.statistics().estimatedBytes, state: "active" as const };
      yield { key: diagnostics.policyDecisions, bytes: diagnostics.policyDecisions.statistics().estimatedBytes, state: "active" as const };
    },
  });
  const presentationSettlements = createPresentationSettlementCoordinator({
    runtimeId,
    randomUUID: config.environment.randomUUID,
    setTimeout: config.environment.setTimeout,
    clearTimeout: config.environment.clearTimeout,
  });
  const caches = createRuntimeCacheRegistry({ runtimeId, now: config.environment.now, resources });
  const persistenceNamespace = config.persistenceNamespace ?? `SynCloudOS4:${runtimeId}`;
  const persistence = createPersistence({
    runtimeId,
    storage: config.environment.localStorage,
    namespace: persistenceNamespace,
  });
  let policy!: SynCloudOSRuntime["policy"];
  let runtime!: SynCloudOSRuntime;
  let runtimeController!: SynCloudOSRuntimeController;
  let bundles!: SynCloudOSBundleLoader;
  let apps!: SynCloudOSAppRegistry;
  let services!: SynCloudOSServiceRegistry;
  let permissions!: SynCloudOSRuntime["permissions"];
  let identity!: SynCloudOSIdentityService;
  let login!: SynCloudOSRuntime["login"];
  let errors!: SynCloudOSRuntime["errors"];
  let alerts!: SynCloudOSRuntime["alerts"];
  let appManager!: SynCloudOSRuntime["appManager"];
  let lifecycle!: SynCloudOSRuntime["lifecycle"];
  let statechart!: SynCloudOSRuntime["statechart"];
  let launchServices!: SynCloudOSRuntime["launchServices"];
  let routes!: SynCloudOSRuntime["routes"];
  let applicationState!: ReturnType<typeof createApplicationState>;
  let webspring!: SynCloudOSRuntime["webspring"];
  let inspector!: SynCloudOSRuntime["inspector"];
  let notifications!: SynCloudOSRuntime["notifications"];
  let bootManager!: SynCloudOSRuntime["bootManager"];
  let globalWatchdog!: SynCloudOSRuntime["globalWatchdog"];
  let pluginRegistry!: SynCloudOSRuntime["pluginRegistry"];
  let responsiveModeManager!: SynCloudOSRuntime["responsiveModeManager"];
  let webspringChoreography!: SynCloudOSRuntime["webspringChoreography"];
  let screen!: SynCloudOSRuntime["screen"];
  let presentationTraits!: SynCloudOSRuntime["presentationTraits"];
  let windowContent!: WindowContentRegistry;
  let windows!: SynCloudOSRuntime["windows"];
  let workspace!: SynCloudOSRuntime["workspace"];
  let systemUI!: SynCloudOSRuntime["systemUI"];
  let preferencePanes!: SynCloudOSRuntime["preferencePanes"];
  let settings!: SynCloudOSRuntime["settings"];
  let appearance!: SynCloudOSRuntime["appearance"];
  let locale!: SynCloudOSRuntime["locale"];
  let responders!: SynCloudOSRuntime["responders"];
  let focus!: SynCloudOSRuntime["focus"];
  let commands!: SynCloudOSRuntime["commands"];
  let keyBindings!: SynCloudOSRuntime["keyBindings"];
  let documents!: DocumentController;
  let documentStore!: SynCloudOSRuntime["documentStore"];
  let documentResources!: SynCloudOSRuntime["documentResources"];
  let documentAssetIntegration: ReturnType<typeof createDocumentAssetRuntimeIntegration> | undefined;
  let colourPanel!: SynCloudOSRuntime["colourPanel"];
  let pasteboards!: SynCloudOSRuntime["pasteboards"];
  let transfers!: RuntimeTransferAuthorityControl;
  let drag!: SynCloudOSRuntime["drag"];
  let tracking!: SynCloudOSRuntime["tracking"];
  let textLayout!: SynCloudOSRuntime["textLayout"];
  let images!: SynCloudOSRuntime["images"];
  let animations!: SynCloudOSRuntime["animations"];
  let motion!: SynCloudOSRuntime["motion"];
  let location!: SynCloudOSRuntime["location"];
  let midi!: SynCloudOSRuntime["midi"];
  let lumina!: SynCloudOSRuntime["lumina"];
  let luminaHost!: SynCloudOSRuntime["luminaHost"];
  let feedbackBus!: AUFXSystemFeedbackBus;
  let hapticHost!: SynCloudOSRuntime["hapticHost"];
  let haptics!: SynCloudOSRuntime["haptics"];
  let audioGraphs!: SynCloudOSRuntime["audioGraphs"];
  let audio!: SynCloudOSRuntime["audio"];
  let mediaClock!: SynCloudOSRuntime["mediaClock"];
  let video!: SynCloudOSRuntime["video"];
  let webContent!: SynCloudOSRuntime["webContent"];
  let disposal!: RuntimeDisposalCoordinator;
  let disposalState: RuntimeDisposalState = "running";
  let bootImplementation!: SynCloudOSRuntime["boot"];
  let logOut!: SynCloudOSRuntime["logOut"];
  let bootPromise: Promise<SynCloudOSBootResult> | null = null;
  let sessionLogoutPending = false;
  let sessionLogoutGeneration = 0;
  let bootController: AbortController | null = null;
  let disposeBootSignal: (() => void) | null = null;
  let undo!: ReturnType<typeof createUndoManagerRegistry>;
  runtime = {
    runtimeId,
    environment: config.environment,
    signal: controller.signal,
    get disposalState() { return disposalState; },
    store,
    diagnostics,
    persistence,
    events,
    operations,
    jobs,
    resources,
    performancePolicy,
    get runtimeController() { return runtimeController; },
    get commands() { return commands; },
    get responders() { return responders; },
    get focus() { return focus; },
    get keyBindings() { return keyBindings; },
    get undo() { return undo; },
    get colourPanel() { return colourPanel; },
    get pasteboards() { return pasteboards; },
    get drag() { return drag; },
    get transfers() { return transfers; },
    get tracking() { return tracking; },
    get textLayout() { return textLayout; },
    get images() { return images; },
    get animations() { return animations; },
    get audio() { return audio; },
    get mediaClock() { return mediaClock; },
    get video() { return video; },
    get motion() { return motion; },
    get location() { return location; },
    get midi() { return midi; },
    get lumina() { return lumina; },
    get luminaHost() { return luminaHost; },
    get haptics() { return haptics; },
    get hapticHost() { return hapticHost; },
    get audioGraphs() { return audioGraphs; },
    get webContent() { return webContent; },
    presentationSettlements,
    caches,
    get apps() { return apps; },
    get bundles() { return bundles; },
    get services() { return services; },
    get policy() { return policy; },
    get permissions() { return permissions; },
    get identity() { return identity; },
    get login() { return login; },
    get lifecycle() { return lifecycle; },
    get statechart() { return statechart; },
    get routes() { return routes; },
    get launchServices() { return launchServices; },
    get screen() { return screen; },
    get presentationTraits() { return presentationTraits; },
    get windows() { return windows; },
    get documents() { return documents; },
    get documentStore() { return documentStore; },
    get documentResources() { return documentResources; },
    get documentAssets() { return documentAssetIntegration?.cooperation; },
    get notifications() { return notifications; },
    get locale() { return locale; },
    get inspector() { return inspector; },
    get errors() { return errors; },
    get alerts() { return alerts; },
    get webspring() { return webspring; },
    get systemUI() { return systemUI; },
    get preferencePanes() { return preferencePanes; },
    get settings() { return settings; },
    get appearance() { return appearance; },
    get workspace() { return workspace; },
    get appManager() { return appManager; },
    get bootManager() { return bootManager; },
    get globalWatchdog() { return globalWatchdog; },
    get pluginRegistry() { return pluginRegistry; },
    get responsiveModeManager() { return responsiveModeManager; },
    get webspringChoreography() { return webspringChoreography; },
    run<I, T>(definition: import("../Operations/operationTypes").OperationDefinition<I, T>) {
      return operations.run(definition);
    },
    logOut(options: { readonly reason?: string; readonly signal?: AbortSignal } = {}) {
      return logOut(options);
    },
    boot(options: SynCloudOSBootOptions = {}) {
      return bootImplementation(options);
    },
    registerDisposalParticipant(participant: RuntimeDisposalParticipant) {
      return disposal.register(participant);
    },
    dispose(request: string | RuntimeDisposalRequest = "runtime disposal") {
      return disposal.dispose(request);
    },
  };

  mediaClock = new MediaClockService(runtimeId, config.environment.monotonicNowSeconds);

  const identitySession = createIdentitySessionService({
    runtimeId,
    adapter: config.identity?.sessionAdapter ?? createAnonymousIdentitySessionAdapter(),
  });
  const loginService = createInstanceLoginService({
    runtimeId,
    store,
    events,
    now: config.environment.now,
    endIdentitySession: (reason) => identitySession.end({ reason }),
  });
  login = loginService;
  const identityCore = createIdentity({ loginServices: loginService, runtimeId, profile: policyProfile });
  identity = {
    runtimeId,
    getCurrentUser: identityCore.getCurrentUser,
    isAuthenticated: identityCore.isAuthenticated,
    getRole: identityCore.getRole,
    getSubject: identityCore.getSubject,
    session: identitySession,
    dispose: () => identitySession.dispose(),
  };
  services = createServiceRegistry(runtime);
  bundles = createBundleLoader(runtime);
  runtimeController = createRuntimeController(runtime);
  policy = createPolicyKit(runtime, {
    bundleLoader: bundles,
    loginServices: loginService,
    identity,
    accessMode: accessModeForAuthenticationPolicy(config.authenticationPolicy),
    profile: policyProfile,
  });
  errors = createErrorManager(runtime, { loginServices: loginService });
  const appManagerBridge: SynCloudOSRuntime["appManager"] = {
    runtimeId,
    createManagerForApp: (appInfo, options) => {
      if (!appManager) throw new Error("AppManagerController is not ready.");
      return appManager.createManagerForApp(appInfo, options);
    },
    publishManagerReplacement: (appInfo, reason) => {
      if (!appManager) throw new Error("AppManagerController is not ready.");
      return appManager.publishManagerReplacement(appInfo, reason);
    },
    restoreManagerForApp: (appId, manager) => {
      if (!appManager) throw new Error("AppManagerController is not ready.");
      return appManager.restoreManagerForApp(appId, manager);
    },
    initializeAppManagers: () => {
      if (!appManager) throw new Error("AppManagerController is not ready.");
      return appManager.initializeAppManagers();
    },
    getManagerForApp: (appId) => appManager?.getManagerForApp(appId) ?? null,
    removeManagerForApp: (appId) => appManager?.removeManagerForApp(appId) ?? false,
    getAppManagers: () => appManager?.getAppManagers() ?? [],
    dispose: () => appManager?.dispose(),
  };
  apps = createAppRegistry(runtime, {
    appManagerController: appManagerBridge,
    bundleLoader: bundles,
    runtimeController,
    serviceRegistry: services,
  });
  const resolveApplicationWindow = (appId: string): CreateWindowRequest | null => {
    const app = apps.getApp(appId);
    if (!app || app.presentation === "appView" || app.presentation === "backgroundService") return null;
    const keyWindowControllerId = windows.snapshot().keyWindowControllerId;
    const parentWindowControllerId = app.presentation === "systemSheet" ? keyWindowControllerId : null;
    const role = app.presentation === "systemSheet"
      ? parentWindowControllerId ? "sheet" : "modal"
      : app.window.role;
    return {
      workspaceId: "workspace-main",
      applicationId: app.bundleIdentifier,
      applicationSessionId: app.bundleIdentifier,
      documentId: null,
      documentAssociationRole: null,
      representedDocument: null,
      toolbar: null,
      role,
      style: app.presentation === "systemSheet" ? ["titled", "closable"] : app.window.style,
      chromeMode: app.presentation === "systemSheet" ? "system" : app.window.chrome,
      smoothSurface: app.window.smoothSurface,
      title: app.window.title,
      content: { rendererId: "application", parameters: { appId: app.bundleIdentifier } },
      bounds: app.window.defaultBounds,
      minimumSize: app.window.minimumSize,
      maximumSize: null,
      level: app.presentation === "systemSheet" ? "modal" : role === "standard" ? "normal" : "floating",
      parentWindowControllerId,
      anchor: null,
      pinned: false,
      mobilePolicy: app.presentation === "systemSheet" ? "sheet" : app.window.mobilePolicy,
      restorationKey: app.window.restorationKey,
    };
  };
  let hasUnauthorisedWebspringPresentationOverride = false;
  const unsubscribeIdentitySession = identity.session.subscribe((identitySnapshot) => {
    if (identitySnapshot?.state === "active") {
      hasUnauthorisedWebspringPresentationOverride = false;
    }
    store.mutate((draft) => {
      const active = identitySnapshot?.state === "active";
      draft.loginServices.isAuthorised = active;
      draft.loginServices.status = active ? "unlocked" : "locked";
      draft.loginServices.sessionId = active ? identitySnapshot.id : null;
      draft.loginServices.synId = active ? (typeof identitySnapshot.claims.email === "string" ? identitySnapshot.claims.email : identitySnapshot.subjectId) : null;
      draft.loginServices.displayName = active ? (typeof identitySnapshot.claims.displayName === "string" ? identitySnapshot.claims.displayName : identitySnapshot.subjectId) : null;
      const roles = active && typeof identitySnapshot.claims.roles === "string" ? identitySnapshot.claims.roles.split(",") : [];
      draft.loginServices.accessClass = active ? policyProfile.sessionAccessClass?.(roles.map((role) => role.trim())) ?? "external" : null;
      draft.loginServices.expiresAt = active ? identitySnapshot.expiresAt ?? null : null;
      draft.loginServices.lastCheckedAt = config.environment.now();
      draft.loginServices.lastFailureReason = active ? null : "missingSession";
    });
    if (
      identitySnapshot?.state === "active" &&
      store.getSnapshot().booted &&
      store.getSnapshot().statechart.currentState === "locked.loginWindow"
    ) {
      statechart.gotoState("active.webspring", { source: "identity-session", closeWindows: false, syncRoute: false });
    }
    if (
      !identitySnapshot &&
      config.authenticationPolicy === "required" &&
      store.getSnapshot().booted &&
      !hasUnauthorisedWebspringPresentationOverride
    ) {
      routes?.cancelActiveOperations("identity-session-ended");
      lifecycle.cancelActiveOperations("identity-session-ended");
      const activeAppId = store.getSnapshot().application.activeAppId;
      if (activeAppId && lifecycle.getState(activeAppId) === "active") {
        const suspension = lifecycle.suspend(activeAppId, { reason: "identity-session-ended" });
        void suspension.result.then(
          () => statechart.gotoState("locked.loginWindow", { source: "identity-session", closeWindows: true, syncRoute: false }),
          () => statechart.gotoState("locked.loginWindow", { source: "identity-session", closeWindows: true, syncRoute: false }),
        );
      } else {
        statechart.gotoState("locked.loginWindow", { source: "identity-session", closeWindows: true, syncRoute: false });
      }
    }
  });
  permissions = {
    runtimeId,
    getRoleCapabilities: (role: string) => policy.getRoleCapabilities(role),
    dispose() {
    },
  };
  settings = createSettingsService({
    runtimeId,
    persistence,
    matchMedia: config.environment.matchMedia,
    getNavigator: config.environment.browser.getNavigator,
  });
  appearance = createAppearanceService({
    runtimeId,
    persistence,
    matchMedia: config.environment.matchMedia,
  });
  const initialBundlesRegistered = Boolean(config.initialBundles?.length);


  const browserLocks = config.documentStoreLock ? undefined : config.environment.browser.getNavigator()?.locks;
  const documentStoreLock: SynCloudOSDocumentStoreLock | undefined = config.documentStoreLock ?? (browserLocks
    ? {
        async request<T>(
          name: string,
          options: { readonly mode: "exclusive"; readonly signal?: AbortSignal },
          callback: () => T | Promise<T>,
        ): Promise<T> {
          return await browserLocks.request(
            name,
            { mode: options.mode, signal: options.signal },
            () => callback(),
          );
        },
      }
    : undefined);
  documentStore = createPersistenceDocumentStore({
    runtimeId,
    persistence,
    events,
    resolveUndo: () => undo,
    authorise: (request) => policy.authorise(request),
    conditionalWriteLock: documentStoreLock,
    clock: () => new Date(config.environment.now()),
  });
  // Schema registration is a host bootstrap concern.  Mounted AppSDK
  // projections deliberately do not receive registerKind, so migrations and
  // permissions are fixed before an application can access this store.
  for (const kind of config.trustedDocumentKinds ?? []) {
    documentStore.registerKind(kind, { emitEvent: false });
  }
  const userNotifications = createRuntimeUserNotificationCenter({
    runtimeId,
    now: config.environment.now,
    randomUUID: config.environment.randomUUID,
    persistence: config.userNotifications?.persistence ?? createPersistenceBackedUserNotificationPersistence(persistence, "user-notifications"),
    delivery: config.userNotifications?.delivery,
    operations,
    signal: controller.signal,
    maxRecords: config.userNotifications?.maxRecords,
    maxDeliveryAttempts: config.userNotifications?.maxDeliveryAttempts,
    decide(request) {
      if (request.appId && !settings.notificationsAllowed(request.appId)) {
        return { allowed: false, id: `${runtimeId}:settings:${config.environment.randomUUID()}`, reason: "notification-settings-muted" };
      }
      const decision = policy.evaluate({
        action: "notification.post",
        app: request.appId ? apps.getApp(request.appId) : null,
        context: { appId: request.appId },
      });
      return { allowed: decision.allowed, id: decision.id, reason: decision.reason };
    },
    onRecord(record) {
      if (record.state === "denied" || record.state === "suppressed") {
        store.mutate((draft) => {
          draft.notifications = draft.notifications.filter((item) => item.id !== record.id);
        });
        events.publish("notification.user.record", {
          runtimeId,
          notificationId: record.id,
          state: record.state,
        }, "[suppressed]");
        return;
      }
      const sensitive = record.request.sensitive === true;
      const status = record.state === "dismissed" ? "dismissed" : record.state === "failed" ? "archived" : record.state === "acknowledged" ? "archived" : "displayed";
      const snapshotRecord = {
        runtimeId,
        id: record.id,
        kind: "system",
        category: "system",
        title: sensitive ? "[redacted]" : record.request.title,
        message: sensitive ? "[redacted]" : record.request.body,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        status,
        priority: "standard",
        behaviours: ["persistent"],
        lifecycle: { status, queuedAt: record.createdAt, updatedAt: record.updatedAt },
        delivery: { channel: "centre", interruptible: true, queuedAt: record.createdAt },
        actions: (record.request.actions ?? []).map((action) => ({ id: action.id, kind: "viewDetails", label: action.title })),
        group: { key: record.id, kind: "system", dateKey: new Date(record.createdAt).toISOString().slice(0, 10) },
        groupKey: record.id,
      };
      store.mutate((draft) => {
        draft.notifications = [...draft.notifications.filter((item) => item.id !== record.id), snapshotRecord as never].slice(-120);
      });
      events.publish("notification.user.record", { runtimeId, notificationId: record.id, state: record.state }, sensitive ? "[redacted]" : record.request.title);
    },
  });
  notifications = createNotificationCenter(runtime, {
    policyKit: policy,
    userNotifications,
  });
  locale = createRuntimeLocaleServices({
    runtimeId,
    store,
    events,
    services,
    persistence,
    browser: config.environment.browser,
    now: config.environment.now,
  });
  applicationState = createApplicationState(runtime);
  responsiveModeManager = createResponsiveModeManager(runtime);
  inspector = createInspector(() => runtime);
  webspring = createWebspringState(runtime, {
    persistence,
    completeLaunchStage: (launchTransitionId, appId) => launchServices.completeLaunchStage(launchTransitionId, appId, "frame"),
    completeLaunchCover: (launchTransitionId, appId) => launchServices.completeLaunchCover(launchTransitionId, appId, "animation"),
    completeReturnRole: (returnTransitionId, role) => webspringChoreography.completeReturnRole(returnTransitionId, role),
  });
  webspringChoreography = createWebspringChoreography(runtime, { webspringState: webspring });
  workspace = {
    runtimeId,
    dispose() {
    },
  };
  let environmentBound = false;
  const bindRuntimeEnvironment = () => {
    if (environmentBound) return;
    environmentBound = true;
    responsiveModeManager.observe();
  };
  const disposeRuntimeEnvironment = () => {
    if (!environmentBound) return;
    environmentBound = false;
    responsiveModeManager.unobserve();
  };
  systemUI = createSystemUIService(runtimeId);
  alerts = createSynCloudOSAlertCenter({ createId: () => `alert-${runtimeId}-${config.environment.randomUUID()}` });
  preferencePanes = createPreferencePaneRegistry(runtimeId);
  const linkExternalSignal = <T,>(handle: RuntimeOperationHandle<T>, signal?: AbortSignal) => {
    if (!signal) return handle;
    const cancel = () => handle.cancel("external-abort");
    if (signal.aborted) cancel();
    else {
      signal.addEventListener("abort", cancel, { once: true });
      void handle.result.then(() => signal.removeEventListener("abort", cancel), () => signal.removeEventListener("abort", cancel));
    }
    return handle;
  };
  logOut = (options: { readonly reason?: string; readonly signal?: AbortSignal } = {}) => {
    const reason = options.reason ?? "manual-logout";
    const logoutGeneration = ++sessionLogoutGeneration;
    sessionLogoutPending = true;
    routes?.cancelActiveOperations("session-logout");
    lifecycle.cancelActiveOperations("session-logout");
    let activeAppId: string | null = null;
    let identityEnd: Promise<void> = Promise.resolve();
    const handle = operations.run<undefined, { runtimeId: SynCloudOSRuntimeId; reason: string }>({
      kind: "session.logout",
      input: undefined,
      supersedeKey: "session.logout",
      will: [async (context) => {
        activeAppId = store.getSnapshot().application.activeAppId;
        if (activeAppId && lifecycle.getState(activeAppId) === "active") {
          await lifecycle.suspend(activeAppId, { reason, signal: context.signal }).result;
        }
      }],
      commit: (context) => {
        const value = { runtimeId, reason };
        const lockSession = (draft: ReturnType<SynCloudOSRuntimeStore["getSnapshot"]>) => {
          draft.loginServices = {
            ...draft.loginServices,
            isAuthorised: false,
            status: "locked",
            synId: null,
            accessClass: null,
            displayName: null,
            sessionId: null,
            storage: null,
            authorisedAt: null,
            expiresAt: null,
            lastCheckedAt: config.environment.now(),
            lastFailureReason: "missingSession",
          };
          draft.application.routePath = "/";
          draft.application.activeAppId = null;
          draft.application.currentAppId = null;
          draft.application.pendingAppId = null;
          draft.application.launchingAppId = null;
          draft.webspring.selectedAppId = null;
          draft.webspring.focusedAppId = null;
          draft.webspring.isAppContainerOpen = false;
          };
        context.markCommitted(value);
        store.mutate((draft) => { lockSession(draft); });
        statechart.gotoState("locked.loginWindow", { source: "session.logout", closeWindows: true, syncRoute: false });
        identityEnd = identity.session.end({ reason });
        void identityEnd.catch(() => undefined);
        events.publish("loginServices.session.locked", { reason }, "LoginServices");
        return value;
      },
      effects: [{ onError: "stop", run: async () => { await identityEnd; } }],
    });
    void handle.result.then(
      () => { if (logoutGeneration === sessionLogoutGeneration) sessionLogoutPending = false; },
      () => { if (logoutGeneration === sessionLogoutGeneration) sessionLogoutPending = false; },
    );
    return linkExternalSignal(handle, options.signal);
  };
  responders = createResponderGraph({
    runtimeId,
    getFocusedResponderId: () => focus?.getFocusedResponderId() ?? null,
    getActiveAnchors: () => focus?.getActiveAnchors() ?? { runtimeResponderId: "runtime" },
    getActiveModalScope: () => {
      const modal = focus?.inspect().scopes.filter((scope) => scope.modal).at(-1);
      return modal ? { scopeId: modal.id, parentResponderId: modal.parentResponderId, isScopeWithin: (scopeId: string) => focus.isScopeWithin(scopeId, modal.id) } : null;
    },
    onRemoved: (ids) => focus?.handleRespondersRemoved(ids),
  });
  focus = createFocusManager({ runtimeId, responders });
  responders.register({ id: "runtime", kind: "runtime", scopeId: "root", diagnosticsLabel: "SynCloudOS runtime" });
  responders.register({ id: "webspring", kind: "webspring", parentId: "runtime", scopeId: "root", diagnosticsLabel: "Webspring" });
  responders.register({ id: "workspace", kind: "workspace", parentId: "webspring", scopeId: "root", diagnosticsLabel: "Active workspace" });
  focus.setActiveAnchors({ workspaceResponderId: "workspace", webspringResponderId: "webspring", runtimeResponderId: "runtime" });
  commands = createCommandSystem({
    getRuntime: () => runtime,
    responderResolver: {
      resolveResponderChain: (startId) => responders.resolveChain(startId),
      getGeneration: () => responders.getGeneration() + focus.getGeneration(),
      getRegistrationToken: (responderId) => responders.getRegistrationToken(responderId),
    },
    historyLimit: config.commandHistoryLimit,
  });
  keyBindings = createKeyBindingManager({ getRuntime: () => runtime });
  undo = createUndoManagerRegistry({
    runtimeId,
    responders,
    maxEntries: config.undoMaxEntries,
    maxEstimatedBytes: config.undoMaxEstimatedBytes,
    randomUUID: config.environment.randomUUID,
    observeListenerError: (error) => {
      errors.capture({
        code: "RUNTIME_TRANSACTION_FAILED",
        title: "Undo ran into a problem.",
        message: "Your changes were kept, but Undo may not work for this action.",
        error,
        technicalMessage: "An undo-history observer failed; the history transaction remained active.",
        source: "UndoManager.notify",
        category: "runtime",
        suggestedActions: ["dismiss"],
      });
    },
  });
  const documentAssetBacking = config.applicationDocuments?.assetBacking;
  const observeDocumentAssetError = (error: unknown) => events.publish("document.error", {
    runtimeId, context: "document-assets", message: error instanceof Error ? `Document asset cooperation failed (${error.name || "Error"}).` : "Document asset cooperation failed.",
  }, "SynCloudOS Documents");
  if (documentAssetBacking) documentAssetIntegration = createDocumentAssetRuntimeIntegration({ backing: documentAssetBacking,
    signal: controller.signal, randomUUID: config.environment.randomUUID, observeError: observeDocumentAssetError });
  const configuredRecovery = config.applicationDocuments?.recoveryStore ?? new InMemoryDocumentRecoveryStore();
  documents = new DocumentController({
    runtimeId,
    operations,
    commands,
    undo,
    recovery: documentAssetIntegration?.wrapRecovery(configuredRecovery) ?? configuredRecovery,
    persistenceNamespace,
    environment: config.environment,
    ...(documentAssetIntegration?.resourceLifecycle ? { resourceLifecycle: documentAssetIntegration.resourceLifecycle } : {}),
    ...(documentAssetIntegration ? { transformAdapter: documentAssetIntegration.wrapAdapter } : {}),
    observeError: (error, context) => {
      // Structural cleanup diagnostics deliberately exclude provider text:
      // error messages may contain document content, URLs, or credentials.
      events.publish("document.error", {
        runtimeId,
        context,
        message: error instanceof Error
          ? `Document cleanup failed (${error.name || "Error"}).`
          : "Document cleanup failed.",
      }, "SynCloudOS Documents");
    },
  });
  const initialAdapters = config.applicationDocuments?.initialAdapters ?? [];
  for (const adapter of initialAdapters) documents.registerAdapter(adapter);
  const initialTypes = config.applicationDocuments?.initialTypes ?? [];
  for (const type of initialTypes) documents.registerType(type);
  documentAssetIntegration?.attach(documents);
  screen = new ScreenService(config.environment);
  const hostContentBounds = {
    getSnapshot() {
      const layout = config.environment.layoutViewport.getSnapshot();
      return { x: 0, y: 0, width: layout.width, height: layout.height };
    },
    subscribe(listener: (snapshot: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }) => void) {
      return config.environment.layoutViewport.subscribe(() => listener(hostContentBounds.getSnapshot()));
    },
  };
  presentationTraits = createContentBoundPresentationTraitsService({
    contentBounds: hostContentBounds,
    screen,
    matchMedia: config.environment.matchMedia,
    requestAnimationFrame: config.environment.requestAnimationFrame,
    cancelAnimationFrame: config.environment.cancelAnimationFrame,
  });
  windowContent = new WindowContentRegistry();
  windowContent.register({
    typeId: "application",
    create: ({ descriptor, windowControllerId }) => {
      const parameters = descriptor.parameters;
      const parameterRecord = parameters && typeof parameters === "object" && !Array.isArray(parameters)
        ? parameters as Readonly<Record<string, WindowSerializableValue>>
        : null;
      const appId = typeof parameterRecord?.appId === "string"
        ? parameterRecord.appId
        : "unknown";
      return {
        mountKey: `application:${normalizeBundleIdentifier(appId)}`,
        responderId: `window-content:${windowControllerId}`,
        async load({ signal }) { signal.throwIfAborted(); },
        async prepareClose() {
          return {
            status: "ready" as const,
            token: null,
            commit: () => undefined,
            rollback: () => undefined,
          };
        },
        unload: () => undefined,
        dispose: () => undefined,
      };
    },
  });
  const windowIds: WindowIdPort = {
    next: (kind) => `${kind}:${config.environment.randomUUID()}`,
  };
  const windowNamespace = resolveWindowPersistenceNamespace(config.windowPersistenceNamespace);
  const windowStoragePrefix = `${windowNamespace}:`;
  const windowPersistence = {
    read(key: "windows.installation-id" | "windows.workspace-v1") {
      const raw = config.environment.localStorage?.getItem(`${windowStoragePrefix}${key}`);
      if (raw === null || raw === undefined) return null;
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed === null) {
          throw new InvalidWindowRestorationSnapshotError(`Persisted window restoration value "${key}" cannot be null.`);
        }
        return parsed;
      } catch (error) {
        if (error instanceof InvalidWindowRestorationSnapshotError) throw error;
        throw new InvalidWindowRestorationSnapshotError(`Persisted window restoration value "${key}" is not valid JSON.`);
      }
    },
    write(key: "windows.installation-id" | "windows.workspace-v1", value: WindowSerializableValue) {
      config.environment.localStorage?.setItem(`${windowStoragePrefix}${key}`, JSON.stringify(value));
    },
  };
  windows = new WindowManager({
    runtimeId,
    operations,
    commands,
    responders,
    focus,
    keyBindings,
    undo,
    documents,
    screen,
    content: windowContent,
    ids: windowIds,
    restoration: {
      namespace: windowNamespace,
      persistence: windowPersistence,
      installationIdentity: createWindowInstallationIdentityPort(),
      clock: { now: config.environment.now },
      ids: windowIds,
    },
    resolveApplicationWindow,
    rematerialiseOwnedDocument: async ({ applicationId, documentId, restorationKey, signal }) => {
      const lifetime = new AbortController();
      const restorationSignal = AbortSignal.any([signal, lifetime.signal, runtime.signal]);
      try {
        const revision = identity.session.getRevision();
        const loaded = await bundles.loadBundle(applicationId, { signal: restorationSignal });
        const hook = loaded.definition.rematerialiseOwnedDocument;
        if (typeof hook !== "function") return null;
        const bundle = bundles.getBundle(applicationId);
        const assertLive = () => {
          restorationSignal.throwIfAborted();
          if (identity.session.getRevision() !== revision || bundles.getBundle(applicationId) !== bundle) {
            throw new DOMException("Restoration owner changed.", "AbortError");
          }
        };
        const { createRouteServiceScope } = await import("../Routing/RouteServiceScope");
        assertLive();
        const context: SynWareOwnedDocumentRematerialiseContext = Object.freeze({
          applicationId,
          documentId,
          restorationKey,
          signal: restorationSignal,
          services: createRouteServiceScope(runtime, applicationId, restorationSignal, "mounted"),
          createProjection: async <TModel,>(request: { readonly typeId: string; readonly initialModel: TModel; readonly activate?: boolean }) => {
            assertLive();
            const document = await documents.newProjectionDocument<TModel>({
              documentId,
              applicationId,
              typeId: request.typeId,
              initialModel: request.initialModel,
              activate: request.activate,
              signal: restorationSignal,
            });
            assertLive();
            return Object.freeze({ documentId: document.id, documentKind: "projection" as const, documentTypeId: document.type.id });
          },
        });
        const result = await hook(context);
        assertLive();
        return result;
      } catch (error) {
        if (!isAbortError(error)) {
          events.publish("window.error", {
            runtimeId,
            context: `window.restore.rematerialise:${applicationId}`,
            message: error instanceof Error ? error.message : String(error),
          }, "SynCloudOS Windows");
        }
        return null;
      } finally {
        lifetime.abort();
      }
    },
    requestFrame: config.environment.requestAnimationFrame,
    cancelFrame: config.environment.cancelAnimationFrame,
    observeError: (error, context) => {
      events.publish("window.error", {
        runtimeId,
        context,
        message: error instanceof Error ? error.message : String(error),
      }, "SynCloudOS Windows");
    },
  });
  lifecycle = createLifecycle(runtime, {
    errorManager: errors,
    bundles,
    apps,
    appManagerController: appManagerBridge,
    policyKit: policy,
    windows,
    revokeApplicationMounts: (appId) => transfers.revokeApplicationMounts(appId),
    operations,
    caches,
    resources,
    performance: performancePolicy,
    isSessionLogoutPending: () => sessionLogoutPending,
    lifecycleHookTimeoutMs: config.lifecycleHookTimeoutMs,
    operationHistoryLimit: config.operationHistoryLimit,
  });
  appManager = createAppManagerController(runtime, {
    appRegistry: apps,
    bundleLoader: bundles,
    lifecycle,
    store,
    serviceRegistry: services,
  });
  launchServices = createLaunchServices(runtime, {
    appRegistry: apps,
    appManagerController: appManager,
    errorManager: errors,
    applicationState,
    webspringState: webspring,
    windowManager: windows,
    serviceRegistry: services,
    loginServices: login,
    policyKit: policy,
  });
  statechart = createStatechart(runtime, {
    appRegistry: apps,
    appManagerController: appManager,
    applicationState,
    webspringChoreography,
    errorManager: errors,
    launchServices,
    webspringState: webspring,
    onTransition(from, to, options) {
      const explicitUnauthorisedWebspringEntry =
        to === "active.webspring" &&
        from === "locked.loginWindow" &&
        options.source === undefined &&
        !store.getSnapshot().loginServices.isAuthorised;
      if (explicitUnauthorisedWebspringEntry) {
        hasUnauthorisedWebspringPresentationOverride = true;
      } else if (to === "locked.loginWindow" || store.getSnapshot().loginServices.isAuthorised) {
        hasUnauthorisedWebspringPresentationOverride = false;
      }
    },
  });
  const baseOrigin = config.environment.browser.getLocation().origin;
  routes = createRouteManager(runtime, {
    appRegistry: apps,
    bundleLoader: bundles,
    lifecycle,
    launchServices,
    policyKit: policy,
    errorManager: errors,
    serviceRegistry: services,
    statechart,
    baseOrigin,
    lifecycleHookTimeoutMs: config.lifecycleHookTimeoutMs,
    presentationTimeoutMs: config.presentationTimeoutMs,
    presentationRolesForRoute: config.presentationRolesForRoute,
  });
  pluginRegistry = createPluginRegistry(runtime, { policyKit: policy, lifecycle });
  bootManager = createBootManager(runtime, {
    appRegistry: apps,
    policyKit: policy,
    responsiveModeManager,
    routeManager: routes,
    runtimeController,
    serviceRegistry: services,
    statechart,
    loginServices: login,
    localeServices: locale,
  });
  globalWatchdog = createSynCloudOSGlobalWatchdog(runtime, { errorManager: errors });
  if (initialBundlesRegistered) apps.registerMany([...config.initialBundles!]);

  colourPanel = createColourPanelService({ runtimeId, ownerToken });
  documentResources = createDocumentResourceService({ runtimeId, ownerToken, signal: controller.signal, randomUUID: config.environment.randomUUID,
    ...(documentAssetIntegration ? { assetBacking: documentAssetIntegration.resourceBacking } : {}) });
  let resourceDocumentIds = new Set(documents.openDocuments.map(({ id }) => id));
  const unsubscribeDocumentResources = documents.subscribe(() => {
    const nextIds = new Set(documents.openDocuments.map(({ id }) => id));
    for (const documentId of resourceDocumentIds) {
      if (!nextIds.has(documentId)) documentResources.releaseDocument(documentId);
    }
    resourceDocumentIds = nextIds;
  });
  const policyApp = (appId: string) => apps.getApp(appId);
  const clipboardAdapter = config.adapters?.clipboard !== undefined
    ? config.adapters.clipboard
    : config.environment.clipboard;
  pasteboards = createPasteboardRegistry({
    runtimeId,
    signal: controller.signal,
    adapter: clipboardAdapter,
    authorise: (request, signal) => {
      signal.throwIfAborted();
      const caller = request.context;
      return policy.authorise({
        action: request.operation === "write" || request.operation === "clear" ? "pasteboard.write" : "pasteboard.read",
        origin: "pasteboard",
        source: "SynCloudOS.Pasteboard",
        app: caller ? policyApp(caller.appId) : null,
        requiredCapabilities: [request.capability],
        context: {
          appId: caller?.appId ?? null,
          callerBound: caller !== undefined,
          windowControllerId: caller?.windowControllerId ?? null,
          responderId: caller?.responderId ?? null,
          pasteboard: request.name,
          operation: request.operation,
          types: request.types,
          capability: request.capability,
        },
      });
    },
  });
  transfers = createRuntimeTransferAuthority({
    runtimeId,
    signal: controller.signal,
    apps,
    getRegistrationAuthority: (appId) => appManagerBridge.getManagerForApp(appId),
    lifecycle,
    responders,
    windows,
    pasteboards,
    events,
  });
  drag = createDragSessionManager({
    runtimeId,
    ownerToken,
    signal: controller.signal,
    pasteboard: pasteboards.drag,
    randomUUID: config.environment.randomUUID,
    resolveEndpoint: transfers.resolveDragEndpoint,
    authorise: (request, signal) => {
      signal.throwIfAborted();
      const crossApplication = normalizeBundleIdentifier(request.source.appId) !== normalizeBundleIdentifier(request.destination.appId);
      const supported = request.representationTypes.length > 0 && request.representationTypes.every((type) =>
        type === "text/plain" || type === "text/html" || type === "text/uri-list" ||
        type === "text/rtf" || type === "application/x-syncloudos-colour" ||
        type === "application/x-syncloudos-document" || type.startsWith("application/x-syncloudos-"));
      if (!supported || request.origin !== "drag" ||
        request.capability !== (crossApplication ? "transfer.cross-application" : "transfer.same-application")) return false;
      const action = request.phase === "negotiate" ? "transfer.negotiate" : "transfer.commit";
      const authoriseEndpoint = (endpoint: typeof request.source, policyEndpoint: "source" | "destination") => policy.authorise({
        action,
        origin: "drag",
        source: "SynCloudOS.Drag",
        app: policyApp(endpoint.appId),
        requiredCapabilities: [request.capability],
        context: {
          appId: endpoint.appId,
          policyEndpoint,
          sessionId: request.sessionId,
          generation: request.generation,
          leaseId: request.leaseId,
          source: request.source,
          destination: request.destination,
          operation: request.operation,
          representationTypes: request.representationTypes,
          capability: request.capability,
          phase: request.phase,
        },
      });
      const sourceDecision = authoriseEndpoint(request.source, "source");
      if (!sourceDecision.allowed) return false;
      const destinationDecision = authoriseEndpoint(request.destination, "destination");
      if (!destinationDecision.allowed) return false;
      if (crossApplication && !config.dragAuthorisation) return false;
      return config.dragAuthorisation?.authorise(request, signal) ?? true;
    },
  });
  tracking = createTrackingRegionManager({
    runtimeId,
    signal: controller.signal,
    randomUUID: config.environment.randomUUID,
    adapter: config.environment.pointer,
  });
  textLayout = createTextFXLayoutService({
    runtimeId,
    signal: controller.signal,
    caches,
    adapterLease: config.environment.textLayout?.acquire(runtimeId, controller.signal),
  });
  images = createRuntimeImageService({
    runtimeId,
    signal: controller.signal,
    adapterLease: config.environment.images?.acquire(runtimeId, controller.signal),
    caches,
    resources,
    documents: documentResources,
    randomUUID: config.environment.randomUUID,
    origin: baseOrigin,
    authorise: (request, signal) => {
      signal.throwIfAborted();
      if (request.source.kind === "url") return config.imageAuthorisation?.authorise(request, signal) ?? false;
      if (request.source.kind === "document-resource") return request.subject.documentId === request.source.documentId;
      return true;
    },
  });
  animations = createRuntimeAnimationService({
    runtimeId,
    signal: controller.signal,
    adapterLease: config.environment.animation?.acquire(runtimeId, controller.signal),
    randomUUID: config.environment.randomUUID,
    prefersReducedMotion: () => settings.get().motion === "reduced" ||
      (settings.get().motion === "system" && store.getSnapshot().responsive.prefersReducedMotion),
  });
  const reducedSensoryPreference = () => settings.get().motion === "reduced" ||
    (settings.get().motion === "system" && store.getSnapshot().responsive.prefersReducedMotion);
  motion = new MotionService(config.environment.motion);
  video = new VideoCaptureService(
    config.environment.videoCapture,
    config.environment.videoDecoder,
    config.environment.videoEncoder,
    config.environment.videoProcessing,
  );
  location = new LocationService(config.environment.location);
  midi = new MIDIService(config.environment.midi);
  lumina = new LuminaIndexService(config.environment.luminaIndex);
  const luminaEligibility = new LuminaEligibilityRegistry(config.environment.now);
  luminaHost = new LUFXHostService({
    runtimeId,
    indexes: lumina,
    eligibility: luminaEligibility,
    policy: {
      getCurrentSubject: () => policy.getCurrentSubject(),
      authorise(request) {
        return policy.authorise({
          action: request.action,
          origin: "runtime",
          source: "SynCloudOS.LuminaFX",
          subject: request.subject,
          app: request.destinationAppId ? apps.getApp(request.destinationAppId) : null,
          requiredCapabilities: [...request.requiredCapabilities],
          context: {
            ...(request.ownerAppId ? { ownerAppId: request.ownerAppId } : {}),
            ...(request.destinationAppId ? { destinationAppId: request.destinationAppId } : {}),
          },
        });
      },
    },
    // The policy subject derives from store state (login) and from PolicyKit
    // state (role capabilities, policies, access mode); observe both sources.
    subscribeState: (listener) => {
      const unsubscribeStore = store.subscribe(listener);
      const unsubscribePolicy = policy.subscribe(listener);
      return () => { unsubscribeStore(); unsubscribePolicy(); };
    },
    apps: { getApp: (appId) => apps.getApp(appId) },
    routes: {
      getAppForRoute: (pathname) => routes.getAppForRoute(pathname),
      openRoute: (pathname, options) => routes.openRoute(pathname, options),
    },
    presentationSettlements,
    randomUUID: config.environment.randomUUID,
  });
  feedbackBus = new AUFXSystemFeedbackBus(config.environment.systemFeedbackAudioContext ?? (() => null));
  hapticHost = createRuntimeHapticsHostService(feedbackBus, config.environment.hapticFeedback ?? { navigator: null, document: null, requestAnimationFrame: null, cancelAnimationFrame: null });
  haptics = hapticHost.system;
  const synchronizeFeedback = () => {
    feedbackBus.setMasterVolume(settings.get().masterVolume);
    hapticHost.setButtonSoundEnabled(settings.get().soundEnabled);
    hapticHost.setVibrationEnabled(settings.get().vibrationEnabled);
  };
  synchronizeFeedback();
  const unsubscribeFeedbackSettings = settings.subscribe(synchronizeFeedback);
  audio = createRuntimeAudioService({
    runtimeId,
    signal: controller.signal,
    adapterLease: config.environment.audio?.acquire(runtimeId, controller.signal),
    randomUUID: config.environment.randomUUID,
    soundEnabled: settings.get().soundEnabled,
    masterVolume: settings.get().masterVolume,
    appVolumes: settings.get().appVolumes,
    persistMixer: (masterVolume, appVolumes) => {
      settings.set("masterVolume", masterVolume);
      settings.set("appVolumes", appVolumes);
    },
    reducedSensory: reducedSensoryPreference(),
    caches,
  });
  audioGraphs = createAudioGraphHostService(feedbackBus, controller.signal, audio);
  webContent = createRuntimeWebContentSessionManager({
    runtimeId,
    signal: controller.signal,
    baseURL: config.environment.browser.getLocation().href,
    randomUUID: config.environment.randomUUID,
    adapterLease: config.environment.webContent?.acquire(runtimeId, controller.signal),
    validateOwnerLease: transfers.validateWebContentLease,
    authorisation: {
      authorise: (request, signal) => {
        signal.throwIfAborted();
        const action = request.action === "load" ? "web-content.load"
          : request.action === "navigate" ? "web-content.navigate"
          : request.action === "open-external" ? "web-content.open-external"
          : request.action === "message-send" ? "web-content.message-send"
          : "web-content.message-receive";
        const decision = policy.authorise({
          action,
          origin: "web-content",
          source: "SynCloudOS.WebContent",
          app: policyApp(request.appId),
          href: request.targetOrigin,
           requiredCapabilities: [request.capability],
          context: {
            appId: request.appId,
            sessionId: request.sessionId,
            action: request.action,
            capability: request.capability,
            sourceKind: request.sourceKind,
            sourceOrigin: request.sourceOrigin,
            targetOrigin: request.targetOrigin,
            navigationEpoch: request.navigationEpoch,
          },
        });
         if (!decision.allowed) return false;
         return config.webContentAuthorisation?.authorise(request, signal) ?? false;
      },
    },
  });
  transfers.bindDrag(drag);
  transfers.bindWebContent(webContent);
  for (const [appId, state] of Object.entries(store.getSnapshot().lifecycle)) {
    if (state === "suspended") webContent.suspendOwner(appId);
    else if (state === "closed") webContent.closeOwner(appId, "application closed");
  }
  for (const [appId, state] of Object.entries(store.getSnapshot().lifecycle)) {
    if (state === "suspended") audio.suspendOwner(appId);
    else if (state === "closed") audio.closeOwner(appId, "application closed");
  }
  for (const [appId, state] of Object.entries(store.getSnapshot().lifecycle)) {
    if (state === "suspended") video.suspendOwner(appId);
    else if (state === "closed") video.closeOwner(appId);
  }
  for (const [appId, state] of Object.entries(store.getSnapshot().lifecycle)) {
    if (state === "suspended") location.suspendOwner(appId);
    else if (state === "closed") location.closeOwner(appId);
  }
  const unsubscribeSoundSettings = settings.subscribe(() => {
    audio.setMixerLevels(settings.get().masterVolume, settings.get().appVolumes);
    audio.setEnabled(settings.get().soundEnabled);
    audio.setReducedSensory(reducedSensoryPreference());
  });
  // Each owner service observes lifecycle transitions through its own
  // subscription (preserving per-service ordering under re-entrant
  // publication). Publications that leave the lifecycle map untouched return
  // without scanning registered applications.
  const unsubscribeAnimationLifecycle = subscribeLifecycleTransitions(store, (appId, state, previous) => {
    if (state === "suspended") animations.suspendOwner(appId);
    else if (state === "active") animations.resumeOwner(appId);
    else if (state === "closed") animations.closeOwner(appId, "application closed");
    else if (state === undefined && previous !== undefined) animations.closeOwner(appId, "application uninstalled");
  });
  const unsubscribeSoundLifecycle = subscribeLifecycleTransitions(store, (appId, state, previous) => {
    if (state === "suspended") audio.suspendOwner(appId);
    else if (state === "active") audio.resumeOwner(appId);
    else if (state === "closed") audio.closeOwner(appId, "application closed");
    else if (state === undefined && previous !== undefined) audio.closeOwner(appId, "application uninstalled");
  });
  const unsubscribeVideoLifecycle = subscribeLifecycleTransitions(store, (appId, state, previous) => {
    if (state === "suspended") video.suspendOwner(appId);
    else if (state === "active") void video.resumeOwner(appId);
    else if (state === "closed") video.closeOwner(appId);
    else if (state === undefined && previous !== undefined) video.closeOwner(appId);
  });
  // Location resume reauthorizes through PolicyKit, which can synchronously
  // publish back into the runtime store; the transition helper commits the
  // observed lifecycle before invoking this handler, so a re-entrant
  // publication never replays suspended -> active.
  const unsubscribeLocationLifecycle = subscribeLifecycleTransitions(store, (appId, state, previous) => {
    if (state === "suspended") location.suspendOwner(appId);
    else if (state === "active") void location.resumeOwner(appId);
    else if (state === "closed") location.closeOwner(appId);
    else if (state === undefined && previous !== undefined) location.closeOwner(appId);
  });
  const unsubscribeLuminaLifecycle = subscribeLifecycleTransitions(store, (appId, state, previous) => {
    if (state !== undefined || previous === undefined) return;
    void luminaHost.eraseOwner(appId).catch(() => undefined);
  });
  const unsubscribeWebContentLifecycle = subscribeLifecycleTransitions(store, (appId, state, previous) => {
    if (state === "suspended") webContent.suspendOwner(appId);
    else if (state === "active") webContent.resumeOwner(appId);
    else if (state === "closed") webContent.closeOwner(appId, "application closed");
    else if (state === undefined && previous !== undefined) webContent.closeOwner(appId, "application uninstalled");
  });
  let trackingWindowIds = new Set(windows.snapshot().windowControllerIds);
  const unsubscribeTrackingWindows = windows.subscribe(() => {
    const nextWindowIds = new Set(windows.snapshot().windowControllerIds);
    for (const windowId of trackingWindowIds) {
      if (!nextWindowIds.has(windowId)) {
        tracking.disposeWindowController(windowId, "window closed");
        animations.closeWindowController(windowId, "window closed");
      }
    }
    trackingWindowIds = nextWindowIds;
  });
  let soundWindowIds = new Set(windows.snapshot().windowControllerIds);
  const unsubscribeSoundWindows = windows.subscribe(() => {
    const nextWindowIds = new Set(windows.snapshot().windowControllerIds);
    for (const windowId of soundWindowIds) if (!nextWindowIds.has(windowId)) {
      audio.closeWindowController(windowId, "window closed");
    }
    soundWindowIds = nextWindowIds;
  });
  let webContentWindowIds = new Set(windows.snapshot().windowControllerIds);
  const unsubscribeWebContentWindows = windows.subscribe(() => {
    const nextWindowIds = new Set(windows.snapshot().windowControllerIds);
    for (const windowId of webContentWindowIds) if (!nextWindowIds.has(windowId)) {
      webContent.closeWindowController(windowId, "window closed");
    }
    webContentWindowIds = nextWindowIds;
  });

  const coreParticipants: RuntimeDisposalParticipant[] = [
    alwaysReady("runtime:store", () => store.dispose()),
    alwaysReady("runtime:diagnostics", () => diagnostics.dispose()),
    alwaysReady("runtime:jobs", () => jobs.dispose(new DOMException("Runtime disposed.", "AbortError"))),
    alwaysReady("runtime:resources", () => resources.dispose()),
    alwaysReady("runtime:performance-policy", () => {
      for (const unsubscribe of performanceSignalSubscriptions) unsubscribe?.();
      performancePolicy.dispose();
    }),
    alwaysReady("runtime:environment", () => disposeRuntimeEnvironment()),
    alwaysReady("runtime:responsive-mode", () => responsiveModeManager.dispose()),
    alwaysReady("runtime:persistence", () => persistence.dispose()),
    alwaysReady("runtime:workspace", () => workspace.dispose()),
    alwaysReady("runtime:system-ui", () => systemUI.dispose()),
    alwaysReady("runtime:preference-panes", () => preferencePanes.dispose()),
    alwaysReady("runtime:settings", () => settings.dispose()),
    alwaysReady("runtime:appearance", () => appearance.dispose()),
    alwaysReady("runtime:webspring", () => webspring.dispose()),
    alwaysReady("runtime:webspring-choreography", () => webspringChoreography.dispose()),
    alwaysReady("runtime:errors", () => errors.dispose()),
    alwaysReady("runtime:alerts", () => alerts.dispose()),
    alwaysReady("runtime:inspector", () => inspector.dispose()),
    alwaysReady("runtime:locale", () => locale.dispose()),
    alwaysReady("runtime:notifications", () => notifications.dispose()),
    alwaysReady("runtime:document-store", () => documentStore.dispose()),
    alwaysReady("runtime:motion", () => motion.dispose()),
    alwaysReady("runtime:video", () => { unsubscribeVideoLifecycle(); video.dispose(); }),
    alwaysReady("runtime:location", () => { unsubscribeLocationLifecycle(); location.dispose(); }),
    alwaysReady("runtime:midi", () => midi.dispose()),
    alwaysReady("runtime:lumina-host", () => { unsubscribeLuminaLifecycle(); luminaHost.dispose(); }),
    alwaysReady("runtime:lumina", () => lumina.dispose()),
    alwaysReady("runtime:haptics", () => { unsubscribeFeedbackSettings(); hapticHost.dispose(); audioGraphs.dispose(); feedbackBus.dispose(); }),
    alwaysReady("runtime:images", () => images.dispose()),
    alwaysReady("runtime:animations", () => { unsubscribeAnimationLifecycle(); animations.dispose(); }),
    alwaysReady("runtime:audio", () => {
      unsubscribeSoundSettings(); unsubscribeSoundLifecycle(); unsubscribeSoundWindows(); audio.dispose();
    }),
    alwaysReady("runtime:media-clock", () => mediaClock.dispose()),
    alwaysReady("runtime:web-content", () => {
      unsubscribeWebContentLifecycle(); unsubscribeWebContentWindows(); webContent.dispose();
    }),
    alwaysReady("runtime:document-resources", () => { unsubscribeDocumentResources(); documentResources.dispose(); }),
    alwaysReady("runtime:document-assets", () => documentAssetIntegration?.dispose()),
    alwaysReady("runtime:launch-services", () => launchServices.dispose()),
    alwaysReady("runtime:routes", () => routes.dispose()),
    alwaysReady("runtime:statechart", () => statechart.dispose()),
    alwaysReady("runtime:lifecycle", () => lifecycle.dispose()),
    alwaysReady("runtime:login", () => login.dispose()),
    alwaysReady("runtime:application-state", () => applicationState.dispose()),
    alwaysReady("runtime:app-manager", () => appManager.dispose()),
    alwaysReady("runtime:identity", () => { unsubscribeIdentitySession(); return identity.dispose(); }),
    alwaysReady("runtime:permissions", () => permissions.dispose()),
    alwaysReady("runtime:policy", () => policy.dispose()),
    alwaysReady("runtime:services", () => services.dispose()),
    alwaysReady("runtime:apps", () => apps.dispose()),
    alwaysReady("runtime:bundles", () => bundles.dispose()),
    alwaysReady("runtime:caches", () => caches.dispose()),
    alwaysReady("runtime:plugin-registry", () => pluginRegistry.dispose()),
    alwaysReady("runtime:boot-manager", () => bootManager.dispose()),
    alwaysReady("runtime:global-watchdog", () => globalWatchdog.dispose()),
    alwaysReady("runtime:presentation-settlements", () => presentationSettlements.dispose()),
    alwaysReady("runtime:operations", () => operations.dispose()),
    alwaysReady("runtime:events", () => events.dispose()),
    alwaysReady("runtime:commands", () => commands.dispose()),
    alwaysReady("runtime:focus", () => focus.dispose()),
    alwaysReady("runtime:responders", () => responders.dispose()),
    alwaysReady("runtime:key-bindings", () => keyBindings.dispose()),
    alwaysReady("runtime:undo", () => undo.dispose()),
    alwaysReady("runtime:colour-panel", () => colourPanel.dispose()),
    alwaysReady("runtime:transfers", () => transfers.dispose()),
    alwaysReady("runtime:pasteboards", () => pasteboards.dispose()),
    alwaysReady("runtime:drag", () => drag.dispose()),
    alwaysReady("runtime:tracking", () => { unsubscribeTrackingWindows(); tracking.dispose(); }),
    alwaysReady("runtime:text-layout", () => textLayout.dispose()),
    alwaysReady("runtime:boot", async () => {
      if (bootController && !bootController.signal.aborted) bootController.abort(new Error("Runtime disposed during boot."));
      try {
        await bootPromise;
      } catch {
        // Boot cancellation is the expected teardown path.
      }
    }),
  ];
  disposal = createRuntimeDisposalCoordinator({
    runtimeId,
    runtimeController: controller,
    operations,
    now: config.environment.now,
    setTimeout: config.environment.setTimeout,
    clearTimeout: config.environment.clearTimeout,
    coreParticipants,
    onStateChange(state) { disposalState = state; },
  });

  bootImplementation = (options: SynCloudOSBootOptions = {}) => {
    const requestedPathname = options.initialPathname ?? config.initialPathname ?? "/";
    if (store.getSnapshot().booted) {
      return Promise.resolve({ runtimeId, status: "reused" as const, initialPathname: requestedPathname });
    }
    if (bootPromise) return bootPromise;
    if (disposalState !== "running") return Promise.reject(new Error(`Runtime ${runtimeId} is not available for boot.`));
    const initialPathname = requestedPathname;
    bootController = new AbortController();
    const abortBoot = (reason: unknown) => {
      if (!bootController?.signal.aborted) bootController?.abort(reason);
    };
    const onRuntimeAbort = () => abortBoot(controller.signal.reason ?? new Error("Runtime disposed during boot."));
    const onCallerAbort = () => abortBoot(options.signal?.reason ?? new Error("Boot cancelled."));
    controller.signal.addEventListener("abort", onRuntimeAbort, { once: true });
    options.signal?.addEventListener("abort", onCallerAbort, { once: true });
    if (controller.signal.aborted) onRuntimeAbort();
    else if (options.signal?.aborted) onCallerAbort();
    let timeoutHandle: unknown = null;
    if (typeof options.timeoutMs === "number") {
      timeoutHandle = config.environment.setTimeout(
        () => abortBoot(new Error(`Boot timed out after ${Math.max(0, options.timeoutMs!)}ms.`)),
        Math.max(0, options.timeoutMs),
      );
    }
    disposeBootSignal = () => {
      controller.signal.removeEventListener("abort", onRuntimeAbort);
      options.signal?.removeEventListener("abort", onCallerAbort);
      if (timeoutHandle !== null) config.environment.clearTimeout(timeoutHandle);
    };
    const signal = bootController.signal;
    const throwIfBootCancelled = () => {
      if (disposalState === "running" && !signal.aborted) return;
      throw signal.reason instanceof Error ? signal.reason : new Error("Boot cancelled.");
    };
    bootPromise = Promise.resolve().then(async () => {
      try {
        throwIfBootCancelled();
        if (config.initialBundles && !initialBundlesRegistered) apps.registerMany([...config.initialBundles]);
        throwIfBootCancelled();
        locale.hydrate();
        const localeLoaderAppIds: string[] = [];
        for (const bundle of bundles.getBundles()) {
          if (bundle.localeResources) locale.registerBundleLocaleResources(bundle.manifest.bundleIdentifier, bundle.localeResources);
          if (bundle.localeResourceLoader) {
            locale.registerBundleLocaleResourceLoader(bundle.manifest.bundleIdentifier, bundle.localeResourceLoader);
            localeLoaderAppIds.push(bundle.manifest.bundleIdentifier);
          }
        }
        if (localeLoaderAppIds.length > 0) await locale.loadBundleLocaleResources(localeLoaderAppIds);
        throwIfBootCancelled();
        await identity.session.refresh({ signal });
        throwIfBootCancelled();
        await notifications.restore?.(signal);
        throwIfBootCancelled();
        const authenticationRequired = config.authenticationPolicy === "required";
        const initialRouteHandle = initialPathname === "/" || (authenticationRequired && !store.getSnapshot().loginServices.isAuthorised)
          ? null
          : routes.openRoute(initialPathname, { source: "boot", syncRoute: false, signal });
        let routeHandle = initialRouteHandle;
        let routeResult = routeHandle ? await routeHandle.result : null;
        const joinedRedirectOperations = new Set<string>();
        while (routeHandle && routeResult?.status === "failed" && routeResult.error.code === "route-redirect") {
          const cause = routeResult.error.cause;
          const successorId = cause && typeof cause === "object" && "successorId" in cause
            && typeof (cause as { successorId?: unknown }).successorId === "string"
            ? (cause as { successorId: string }).successorId
            : null;
          if (!successorId || joinedRedirectOperations.has(successorId)) {
            throw new Error(`Initial route ${initialPathname} produced an invalid redirect successor.`, { cause: routeResult });
          }
          const successor = routes.getRedirectSuccessor(routeHandle.operationId, successorId);
          if (!successor) {
            throw new Error(`Initial route ${initialPathname} redirect successor ${successorId} is unavailable.`, { cause: routeResult });
          }
          joinedRedirectOperations.add(successorId);
          routeHandle = successor;
          routeResult = await successor.result;
          throwIfBootCancelled();
        }
        throwIfBootCancelled();
        const initialRouteGuardBlocked = routeResult?.status === "failed" && routeResult.error.code === "route-guard-blocked";
        if (routeResult && !initialRouteGuardBlocked && (routeResult.status !== "completed" || !routeResult.committed)) {
          const detail = routeResult.status === "cancelled" ? routeResult.reason : routeResult.error.message;
          throw new Error(`Initial route ${initialPathname} did not complete: ${detail}`, { cause: routeResult });
        }
        bindRuntimeEnvironment();
        throwIfBootCancelled();
        if ((!authenticationRequired || store.getSnapshot().loginServices.isAuthorised) && initialPathname === "/") {
          statechart.gotoState("active.webspring", { pathname: initialPathname, source: "boot", syncRoute: false });
        } else if (authenticationRequired && !store.getSnapshot().loginServices.isAuthorised) {
          statechart.gotoState("locked.loginWindow", { pathname: initialPathname, source: "boot" });
        } else if (initialRouteGuardBlocked) {
          statechart.gotoState("active.webspring", { pathname: initialPathname, source: "boot", syncRoute: false });
        }
        store.mutate((draft) => {
          draft.booted = true;
          draft.webspring.isBooted = true;
          if (initialPathname === "/") draft.application.routePath = "/";
        });
        events.publish("runtime.boot.complete", { runtimeId, initialPathname }, "SynCloudOS Boot");
        return { runtimeId, status: "completed" as const, initialPathname };
      } finally {
        disposeBootSignal?.();
        disposeBootSignal = null;
        bootController = null;
      }
    }).catch((error) => {
      bootPromise = null;
      throw error;
    });
    return bootPromise;
  };
  registerStandardCommands(runtime);
  runtime.registerDisposalParticipant({
    id: "documents",
    prepare: (context) => runtime.documents.prepareRuntimeDisposal(context),
  });
  runtime.registerDisposalParticipant({
    id: "windows",
    prepare: (context) => runtime.windows.prepareRuntimeDisposal(context),
  });
  // This registration follows the window participant so reverse-order commit
  // cancels trait observers before WindowManager releases ScreenService.
  runtime.registerDisposalParticipant({
    id: "presentation-traits",
    prepare() {
      return { status: "ready", commit: () => presentationTraits.dispose() };
    },
  });
  return runtime;
}
