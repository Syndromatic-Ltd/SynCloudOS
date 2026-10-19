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

import { getCanonicalExternalHref } from "../Routing/routeNormalization";
import { WEBSPRING_PRESENTATION_ROLES } from "../WebspringState/webspringPresentation";
import { createBrowserRoutePlatform } from "../PlatformAdapters/BrowserRoutePlatform";
import { choreographyTimings } from "../../FX/AnimationFX/choreographyTimings";
import type { CapturedSynCloudOSError } from "../ErrorManager/errorTypes";
import type {
  SynCloudOSAppManagerController,
  SynCloudOSAppRegistry,
  SynCloudOSErrorManager,
  SynCloudOSLoginService,
  SynCloudOSRuntime,
  SynCloudOSServiceRegistry,
  SynCloudOSWebspringStateController
} from "../Runtime/runtimeInstanceTypes";
import type { WindowManager } from "../Windows/WindowManager";
import type { AppManager } from "../AppManager/AppManager";
import type { SynCloudOSAppLifecycleState } from "../AppManager/appManagerTypes";
import type { SynCloudOSMultiSwitchState } from "../ApplicationState/applicationStateTypes";
import type { SynCloudOSAppInfo } from "../AppInfo/appInfoTypes";
import type {
  SynCloudOSExternalAppExplanation,
  SynCloudOSLaunchExplanation,
  SynCloudOSLaunchHistoryAction,
  SynCloudOSLaunchHistoryOptions,
  SynCloudOSLaunchHistoryRecord,
  SynCloudOSLaunchQueueItem,
  SynCloudOSLaunchQueueSnapshot,
  SynCloudOSLaunchRequestDetails,
  SynCloudOSLaunchSource,
  SynCloudOSOpenAppOptions,
  SynCloudOSPolicyAuthorisationExplanation,
  SynCloudOSPolicyAuthorisationResult,
  SynCloudOSPolicyKit as LaunchPolicyKit
} from "./launchTypes";

type LaunchAppRegistryPort = Pick<SynCloudOSAppRegistry, "getApp" | "getAppForRoute">;
type LaunchAppManagerPort = Pick<SynCloudOSAppManagerController, "getManagerForApp" | "createManagerForApp">;
type LaunchApplicationDescriptor = {
  readonly id: string;
  readonly packageName: string;
  readonly displayName: string;
};
type LaunchErrorManagerPort = Pick<
  SynCloudOSErrorManager,
  "capture" | "createAppNotFoundError" | "createAppLaunchFailedError"
> & {
  createLoginSessionMismatchError: (
    app: LaunchApplicationDescriptor | null,
    context?: Record<string, unknown>
  ) => CapturedSynCloudOSError;
};
type LaunchApplicationStatePort = {
  setRoutePath(routePath: string): void;
  setPendingApp(appId: string | null): void;
  beginMultiSwitch(options: Pick<SynCloudOSMultiSwitchState, "fromAppId" | "toAppId" | "fromRoute" | "toRoute" | "source"> & { id?: string }): string;
  finishMultiSwitch(id?: string | null): void;
  clearMultiSwitch(id?: string | null): void;
  markFailed(appId: string): void;
};
type LaunchWebspringStatePort = Pick<
  SynCloudOSWebspringStateController,
  "hoverApp" | "selectApp"
> & {
  setLoadingApp: (appId: string | null, launchTransitionId?: string | null) => void;
  setLaunching: (appId: string | null, launchTransitionId?: string | null) => void;
  coverForApp: (appId: string | null, launchTransitionId?: string | null) => void;
};
type LaunchWindowManagerPort = Pick<
  WindowManager,
  | "captureApplicationMutation"
  | "validateApplicationMutation"
  | "beginApplicationClose"
  | "validateApplicationCloseAuthority"
  | "endApplicationClose"
  | "openApplicationWindow"
  | "requestCloseApplication"
  | "requestClose"
  | "list"
>;
type LaunchServiceRegistryPort = Pick<SynCloudOSServiceRegistry, "getServiceReport">;
type LaunchLoginServicesPort = Pick<SynCloudOSLoginService, "getSnapshot">;

export interface LaunchServicesDependencies {
  readonly appRegistry: LaunchAppRegistryPort;
  readonly appManagerController: LaunchAppManagerPort;
  readonly errorManager: LaunchErrorManagerPort;
  readonly applicationState: LaunchApplicationStatePort;
  readonly webspringState: LaunchWebspringStatePort;
  readonly windowManager: LaunchWindowManagerPort;
  readonly serviceRegistry: LaunchServiceRegistryPort;
  readonly loginServices: LaunchLoginServicesPort;
  readonly policyKit: LaunchPolicyKit;
}

export function createLaunchServices(runtime: SynCloudOSRuntime, dependencies: LaunchServicesDependencies) {
const AppRegistry = dependencies.appRegistry;
const AppManagerController = dependencies.appManagerController;
const ErrorManager = dependencies.errorManager;
const EventBus = runtime.events;
const ApplicationState = dependencies.applicationState;
const WebspringState = dependencies.webspringState;
const WindowManager = dependencies.windowManager;
const ServiceRegistry = dependencies.serviceRegistry;
const LoginServices = dependencies.loginServices;
const RuntimePolicyKit = dependencies.policyKit;
const RuntimeStore = runtime.store;
const browserRoutes = createBrowserRoutePlatform(runtime.environment);

type SynCloudOSLaunchServicesHotData = {
  activeLaunchRequest?: SynCloudOSLaunchRequestDetails | null;
  queuedLaunches?: SynCloudOSLaunchRequestDetails[];
  deferredLaunches?: SynCloudOSLaunchRequestDetails[];
  launchHistory?: SynCloudOSLaunchHistoryRecord[];
  launchAttempts?: Array<[string, number]>;
};

const launchServicesHotData = undefined as SynCloudOSLaunchServicesHotData | undefined;
const abandonedHotLaunchRequest = launchServicesHotData?.activeLaunchRequest ?? null;

let activeLaunchRequest: SynCloudOSLaunchRequestDetails | null = null;
const queuedLaunches: SynCloudOSLaunchRequestDetails[] = [...(launchServicesHotData?.queuedLaunches ?? [])];
const deferredLaunches: SynCloudOSLaunchRequestDetails[] = [...(launchServicesHotData?.deferredLaunches ?? [])];
const launchHistory: SynCloudOSLaunchHistoryRecord[] = [...(launchServicesHotData?.launchHistory ?? [])];
const launchHistoryLimit = 140;
const launchAttempts = new Map<string, number>(launchServicesHotData?.launchAttempts ?? []);
let deferredAuthorisationWatcherArmed = false;
let launchServicesDisposed = false;
type MultiSwitchFallback = {
  firstFrame: unknown | null;
  presentationFrame: unknown | null;
  settleTimer: unknown | null;
};
const multiSwitchFallbackTimers = new Map<string, MultiSwitchFallback>();
const launchStageFallbackTimers = new Map<string, unknown>();
const launchCoverFallbackTimers = new Map<string, unknown>();

function clearLaunchTimer(timers: Map<string, unknown>, launchTransitionId: string | null | undefined) {
  if (!launchTransitionId) return;
  const timer = timers.get(launchTransitionId);
  if (timer === undefined) return;
  runtime.environment.clearTimeout(timer);
  timers.delete(launchTransitionId);
}

function clearLaunchTimers(launchTransitionId: string | null | undefined) {
  clearLaunchTimer(launchStageFallbackTimers, launchTransitionId);
  clearLaunchTimer(launchCoverFallbackTimers, launchTransitionId);
}
function clearAllLaunchTimers() {
  for (const launchTransitionId of [...launchStageFallbackTimers.keys(), ...launchCoverFallbackTimers.keys()]) {
    clearLaunchTimers(launchTransitionId);
  }
}

function armLaunchCoverFallback(launchTransitionId: string, appId: string) {
  if (launchServicesDisposed) return;
  clearLaunchTimer(launchCoverFallbackTimers, launchTransitionId);
  const timer = runtime.environment.setTimeout(() => {
    launchCoverFallbackTimers.delete(launchTransitionId);
    completeLaunchCoverTransition(launchTransitionId, appId, "fallback");
  }, choreographyTimings.webspringLaunchCoverFallbackMs);
  launchCoverFallbackTimers.set(launchTransitionId, timer);
}

function beginLaunchStage(launchTransitionId: string, appId: string) {
  if (launchServicesDisposed) return;
  clearLaunchTimers(launchTransitionId);
  const timer = runtime.environment.setTimeout(() => {
    launchStageFallbackTimers.delete(launchTransitionId);
    completeLaunchStageTransition(launchTransitionId, appId, "fallback");
  }, choreographyTimings.webspringLaunchStageFallbackMs);
  launchStageFallbackTimers.set(launchTransitionId, timer);
}

function completeLaunchStageTransition(
  launchTransitionId: string,
  appId: string | null | undefined,
  completionSource: "frame" | "fallback" = "frame"
) {
  if (launchServicesDisposed) return false;
  const snapshot = RuntimeStore.getSnapshot();
  const targetAppId = appId ?? snapshot.application.activeAppId ?? snapshot.webspring.launchingAppId;
  if (
    !targetAppId ||
    snapshot.webspring.launchTransitionId !== launchTransitionId ||
    snapshot.webspring.launchPhase !== "staging" ||
    snapshot.application.activeAppId !== targetAppId
  ) return false;

  clearLaunchTimers(launchTransitionId);
  if (runtime.apps.getApp(targetAppId)?.frame.presentationMotion === "content") {
    WebspringState.coverForApp(targetAppId, launchTransitionId);
    const settlementId = RuntimeStore.getSnapshot().webspring.presentationSettlementId;
    if (settlementId) runtime.presentationSettlements.get(settlementId)?.completeRole(WEBSPRING_PRESENTATION_ROLES.shellReturn);
  } else {
    WebspringState.setLaunching(targetAppId, launchTransitionId);
    armLaunchCoverFallback(launchTransitionId, targetAppId);
  }
  EventBus.publish("app.launch.staged", {
    runtimeId: runtime.runtimeId,
    appId: targetAppId,
    launchTransitionId,
    completionSource
  }, targetAppId);
  return true;
}
const unsubscribeWebspringReturn = EventBus.subscribe("workspace.returnToWebspring", () => {
  clearAllLaunchTimers();
});

interface RouteAwareMultiSwitch {
  fromAppId: string;
  toAppId: string;
  fromRoute: string;
  toRoute: string;
  source: SynCloudOSLaunchSource;
}

function getCurrentMultiSwitchDetails(switchId: string): RouteAwareMultiSwitch | null {
  const snapshot = RuntimeStore.getSnapshot();
  const currentSwitch = snapshot.application.multiSwitch;
  if (currentSwitch.id !== switchId || currentSwitch.status !== "switching") return null;
  if (!currentSwitch.fromAppId || !currentSwitch.toAppId || !currentSwitch.fromRoute || !currentSwitch.toRoute) return null;
  return {
    fromAppId: currentSwitch.fromAppId,
    toAppId: currentSwitch.toAppId,
    fromRoute: currentSwitch.fromRoute,
    toRoute: currentSwitch.toRoute,
    source: coerceLaunchSource(currentSwitch.source)
  };
}

function settleMultiSwitch(
  switchId: string,
  switchDetails: RouteAwareMultiSwitch | null = getCurrentMultiSwitchDetails(switchId),
  completionSource: "animation" | "fallback" | "hmr" = "fallback"
) {
  const snapshot = RuntimeStore.getSnapshot();
  const currentSwitch = snapshot.application.multiSwitch;
  if (currentSwitch.id !== switchId || currentSwitch.status !== "switching" || !switchDetails) {
    clearMultiSwitchFallback(switchId);
    return false;
  }
  clearMultiSwitchFallback(switchId);

  const targetStillActive =
    snapshot.application.activeAppId === switchDetails.toAppId &&
    snapshot.application.routePath === switchDetails.toRoute;

  if (targetStillActive) {
    AppManagerController.getManagerForApp(switchDetails.fromAppId)?.suspend();
  }

  ApplicationState.finishMultiSwitch(switchId);
  EventBus.publish(
    "multiswitch.complete",
    {
      ...switchDetails,
      switchId,
      outgoingSuspended: targetStillActive,
      completionSource
    },
    switchDetails.toAppId
  );
  recordLaunchHistory("multiswitch.complete", {
    appId: switchDetails.toAppId,
    source: switchDetails.source,
    notes: [
      targetStillActive
        ? `Settled direct MultiSwitch and suspended ${switchDetails.fromAppId}.`
        : "Switch target changed before the settle timer completed; outgoing app was left untouched."
    ]
  });
  return true;
}

function clearMultiSwitchFallback(switchId: string) {
  const pending = multiSwitchFallbackTimers.get(switchId);
  if (!pending) return;
  if (pending.firstFrame !== null) runtime.environment.cancelAnimationFrame(pending.firstFrame);
  if (pending.presentationFrame !== null) runtime.environment.cancelAnimationFrame(pending.presentationFrame);
  if (pending.settleTimer !== null) runtime.environment.clearTimeout(pending.settleTimer);
  multiSwitchFallbackTimers.delete(switchId);
}

function finishMultiSwitchLater(switchId: string, switchDetails: RouteAwareMultiSwitch) {
  clearMultiSwitchFallback(switchId);
  const pending: MultiSwitchFallback = { firstFrame: null, presentationFrame: null, settleTimer: null };
  multiSwitchFallbackTimers.set(switchId, pending);
  const stillSwitching = () => {
    const current = RuntimeStore.getSnapshot().application.multiSwitch;
    return current.id === switchId && current.status === "switching";
  };
  const armSettleTimer = () => {
    if (multiSwitchFallbackTimers.get(switchId) !== pending || !stillSwitching()) {
      clearMultiSwitchFallback(switchId);
      return;
    }
    pending.settleTimer = runtime.environment.setTimeout(() => {
      if (multiSwitchFallbackTimers.get(switchId) !== pending) return;
      pending.settleTimer = null;
      settleMultiSwitch(switchId, switchDetails, "fallback");
    }, choreographyTimings.multiSwitchSettleFallbackMs);
  };
  // Direct public LaunchServices calls use the same visual contract as route
  // launches: first let the mounted stage reach a paint opportunity, then
  // begin the bounded liveness watchdog.
  pending.firstFrame = runtime.environment.requestAnimationFrame(() => {
    pending.firstFrame = null;
    if (multiSwitchFallbackTimers.get(switchId) !== pending || !stillSwitching()) {
      clearMultiSwitchFallback(switchId);
      return;
    }
    pending.presentationFrame = runtime.environment.requestAnimationFrame(() => {
      pending.presentationFrame = null;
      armSettleTimer();
    });
  });
}
function completeLaunchCoverTransition(
  launchTransitionId: string,
  appId: string | null | undefined,
  completionSource: "animation" | "fallback" = "animation"
) {
  if (launchServicesDisposed) return false;
  const snapshot = RuntimeStore.getSnapshot();
  const targetAppId = appId ?? snapshot.application.activeAppId ?? snapshot.webspring.launchingAppId;
  if (
    !targetAppId ||
    snapshot.webspring.launchTransitionId !== launchTransitionId ||
    snapshot.webspring.launchPhase !== "launching" ||
    snapshot.application.activeAppId !== targetAppId
  ) return false;

  clearLaunchTimers(launchTransitionId);
  WebspringState.coverForApp(targetAppId, launchTransitionId);
  EventBus.publish(
    "app.launch.covered",
    { runtimeId: runtime.runtimeId, appId: targetAppId, launchTransitionId, completionSource },
    targetAppId
  );
  const presentationSettlementId = RuntimeStore.getSnapshot().webspring.presentationSettlementId;
  if (presentationSettlementId) {
    runtime.presentationSettlements
      .get(presentationSettlementId)
      ?.completeRole(WEBSPRING_PRESENTATION_ROLES.shellReturn);
  }
  return true;
}

function createLaunchRequestId(appId: string) {
  return `launch-${appId}-${runtime.environment.now()}-${runtime.environment.randomUUID()}`;
}

function getNextLaunchAttempt(appId: string) {
  const nextAttempt = (launchAttempts.get(appId) ?? 0) + 1;
  launchAttempts.set(appId, nextAttempt);
  return nextAttempt;
}

function getLaunchSource(options: SynCloudOSOpenAppOptions): SynCloudOSLaunchSource {
  return options.source ?? "workspace";
}

function coerceLaunchSource(value: string | null | undefined): SynCloudOSLaunchSource {
  return value === "webspring" ||
    value === "route" ||
    value === "boot" ||
    value === "developer" ||
    value === "notification" ||
    value === "statechart" ||
    value === "workspace"
    ? value
    : "workspace";
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return Boolean(value && typeof (value as Promise<T>).then === "function");
}

function getLaunchOrigin(options: SynCloudOSOpenAppOptions) {
  return getLaunchSource(options) === "developer" ? "developerConsole" : "runtime";
}

function getPolicyKit() {
  const localPolicyKit = RuntimePolicyKit;
  return typeof localPolicyKit.authorise === "function" ? localPolicyKit : null;
}

function policyCapabilityForApp(app: SynCloudOSAppInfo) {
  return app.type === "system" ? "diagnostics.view" : "app.open.public";
}

function externalRequiredServices(app: SynCloudOSAppInfo) {
  return Array.from(new Set([...app.requiredServices, "externalLinking"]));
}

function createPolicyRequest(app: SynCloudOSAppInfo, options: SynCloudOSOpenAppOptions, requestId: string) {
  return {
    action: "app.launch" as const,
    app,
    route: app.route,
    source: "SynCloudOS.LaunchServices.openApp",
    origin: getLaunchOrigin(options),
    serviceReport: ServiceRegistry.getServiceReport(app.requiredServices),
    requiredCapabilities: [policyCapabilityForApp(app)],
    context: {
      launchSource: getLaunchSource(options),
      requestId,
      ...options.context
    }
  };
}

function normalizePolicyResult(
  result: boolean | SynCloudOSPolicyAuthorisationResult
): SynCloudOSPolicyAuthorisationExplanation {
  if (typeof result === "boolean") {
    return {
      available: true,
      checked: true,
      allowed: result,
      reason: result ? "PolicyKit authorised launch." : "PolicyKit denied launch.",
      result
    };
  }

  const allowed = result.allowed ?? result.authorised ?? result.ok ?? false;
  return {
    available: true,
    checked: true,
    allowed,
    reason: result.reason ?? result.message ?? (allowed ? "PolicyKit authorised launch." : "PolicyKit denied launch."),
    code: result.code,
    result
  };
}

async function authoriseWithPolicyKit(
  request: SynCloudOSLaunchRequestDetails
): Promise<SynCloudOSPolicyAuthorisationExplanation> {
  const policyKit = getPolicyKit();
  if (!policyKit?.authorise) {
    return {
      available: false,
      checked: false,
      allowed: true,
      reason: "PolicyKit.authorise is not registered."
    };
  }

  try {
    const result = await policyKit.authorise(createPolicyRequest(request.app, request.options, request.requestId));
    return normalizePolicyResult(result);
  } catch (error) {
    return {
      available: true,
      checked: true,
      allowed: false,
      reason: error instanceof Error ? error.message : String(error),
      code: "POLICYKIT_AUTHORISE_THROWN"
    };
  }
}

function explainWithPolicyKit(
  app: SynCloudOSAppInfo,
  options: SynCloudOSOpenAppOptions,
  requestId = `explain-${app.id}-${runtime.environment.now()}`
): SynCloudOSPolicyAuthorisationExplanation {
  const policyKit = getPolicyKit();
  if (!policyKit?.authorise) {
    return {
      available: false,
      checked: false,
      allowed: true,
      reason: "PolicyKit.authorise is not registered."
    };
  }

  try {
    const result = policyKit.authorise(createPolicyRequest(app, options, requestId));
    if (isPromiseLike(result)) {
      return {
        available: true,
        checked: false,
        allowed: true,
        reason: "PolicyKit.authorise is asynchronous; LaunchServices will check it when the launch request starts."
      };
    }
    return normalizePolicyResult(result);
  } catch (error) {
    return {
      available: true,
      checked: true,
      allowed: false,
      reason: error instanceof Error ? error.message : String(error),
      code: "POLICYKIT_AUTHORISE_THROWN"
    };
  }
}

function toQueueItem(request: SynCloudOSLaunchRequestDetails): SynCloudOSLaunchQueueItem {
  return {
    requestId: request.requestId,
    appId: request.appId,
    packageName: request.app.packageName,
    source: request.options.source,
    requestedAt: request.requestedAt,
    deferredReason: request.deferredReason,
    attempt: request.attempt
  };
}

function getLaunchQueueSnapshot(): SynCloudOSLaunchQueueSnapshot {
  return {
    active: activeLaunchRequest ? toQueueItem(activeLaunchRequest) : null,
    queued: queuedLaunches.map(toQueueItem),
    deferred: deferredLaunches.map(toQueueItem)
  };
}

function toHistoryOptions(options: SynCloudOSOpenAppOptions): SynCloudOSLaunchHistoryOptions {
  return {
    source: options.source,
    focus: options.focus,
    syncRoute: options.syncRoute,
    queue: options.queue,
    deferUntilAuthorised: options.deferUntilAuthorised,
    hold: options.hold,
    reason: options.reason,
    context: options.context ? { ...options.context } : undefined
  };
}

function recordLaunchHistory(
  action: SynCloudOSLaunchHistoryAction,
  details: {
    appId: string;
    packageName?: string;
    requestId?: string;
    source?: SynCloudOSLaunchSource;
    attempt?: number;
    reason?: string;
    code?: string;
    href?: string;
    options?: SynCloudOSOpenAppOptions;
    notes?: string[];
  }
) {
  const record: SynCloudOSLaunchHistoryRecord = {
    id: `launch-history-${runtime.environment.now()}-${runtime.environment.randomUUID()}`,
    action,
    at: runtime.environment.now(),
    appId: details.appId,
    packageName: details.packageName,
    requestId: details.requestId,
    source: details.source,
    attempt: details.attempt,
    reason: details.reason,
    code: details.code,
    href: details.href,
    options: details.options ? toHistoryOptions(details.options) : undefined,
    queue: getLaunchQueueSnapshot(),
    notes: details.notes ?? []
  };
  launchHistory.push(record);
  launchHistory.splice(0, Math.max(0, launchHistory.length - launchHistoryLimit));
  return record;
}

function recordRequestHistory(action: SynCloudOSLaunchHistoryAction, request: SynCloudOSLaunchRequestDetails, notes: string[] = [], code?: string) {
  return recordLaunchHistory(action, {
    appId: request.appId,
    packageName: request.app.packageName,
    requestId: request.requestId,
    source: request.options.source,
    attempt: request.attempt,
    reason: request.deferredReason ?? request.options.reason,
    code,
    options: request.options,
    notes
  });
}

function findPendingRequest(appId: string) {
  if (activeLaunchRequest?.appId === appId) {
    if (requestAuthorityIsCurrent(activeLaunchRequest)) return activeLaunchRequest;
    const stale = activeLaunchRequest;
    cancelStaleLaunch(stale, "A replacement registration invalidated the active launch request.");
    if (activeLaunchRequest === stale) activeLaunchRequest = null;
  }
  for (const queue of [queuedLaunches, deferredLaunches]) {
    const index = queue.findIndex((request) => request.appId === appId);
    if (index < 0) continue;
    const request = queue[index]!;
    if (requestAuthorityIsCurrent(request)) return request;
    queue.splice(index, 1);
    cancelStaleLaunch(request, "A replacement registration invalidated the pending launch request.");
  }
  return null;
}

function createLaunchRequest(
  app: SynCloudOSAppInfo,
  manager: AppManager,
  options: SynCloudOSOpenAppOptions,
  applicationMutation = WindowManager.captureApplicationMutation(app.id),
): SynCloudOSLaunchRequestDetails {
  return {
    requestId: createLaunchRequestId(app.id),
    appId: app.id,
    app,
    manager,
    options,
    requestedAt: runtime.environment.now(),
    attempt: getNextLaunchAttempt(app.id),
    applicationMutation,
  };
}

function createRouteAwareMultiSwitch(app: SynCloudOSAppInfo, options: SynCloudOSOpenAppOptions): RouteAwareMultiSwitch | null {
  const snapshot = RuntimeStore.getSnapshot();
  const fromAppId = snapshot.application.activeAppId;
  const fromRoute = snapshot.application.routePath;
  if (!fromAppId || fromAppId === app.id || fromRoute === "/" || app.presentation !== "appView") return null;

  const fromApp = AppRegistry.getApp(fromAppId);
  const routedFromApp = AppRegistry.getAppForRoute(fromRoute);
  if (!fromApp || fromApp.presentation !== "appView" || routedFromApp?.id !== fromAppId) return null;

  return {
    fromAppId,
    toAppId: app.id,
    fromRoute,
    toRoute: options.lifecycle?.routePath ?? app.route,
    source: getLaunchSource(options)
  };
}

function isInitialRouteLaunch(options: SynCloudOSOpenAppOptions) {
  return options.context?.initialRoute === true;
}

function captureDisabledLaunch(request: SynCloudOSLaunchRequestDetails, explanation: SynCloudOSLaunchExplanation) {
  return ErrorManager.capture({
    code: "APP_DISABLED",
    title: `${request.app.displayName} is disabled.`,
    message: "SynCloudOS could not start the app because a required service is unavailable.",
    appId: request.appId,
    source: "SynCloudOS.LaunchServices.openApp",
    context: {
      requiredServices: request.app.requiredServices,
      serviceReport: explanation.serviceReport,
      explanation
    }
  });
}

function captureLaunchInProgress(request: SynCloudOSLaunchRequestDetails, explanation: SynCloudOSLaunchExplanation) {
  return ErrorManager.capture({
    code: "APP_LAUNCH_FAILED",
    title: `${request.app.displayName} could not launch.`,
    message: explanation.reason,
    appId: request.appId,
    source: "SynCloudOS.LaunchServices.openApp",
    context: { explanation, queue: getLaunchQueueSnapshot() }
  });
}

function failBeforeStart(request: SynCloudOSLaunchRequestDetails, error: unknown, reason: string) {
  request.options.statechart?.onFailed?.(request, error);
  recordRequestHistory("failed", request, [reason], reason);
  EventBus.publish(
    "app.launch.failed",
    { appId: request.appId, requestId: request.requestId, reason },
    request.app.packageName
  );
}

function failRunningLaunch(
  request: SynCloudOSLaunchRequestDetails,
  managerError: unknown,
  eventReason: string,
  statechartError: unknown = managerError
) {
  if (request.manager.getState() !== "failed") request.manager.fail(managerError);
  ApplicationState.markFailed(request.appId);
  ApplicationState.setPendingApp(null);
  WebspringState.setLoadingApp(null);
  WebspringState.setLaunching(null);
  request.options.statechart?.onFailed?.(request, statechartError);
  recordRequestHistory("failed", request, [eventReason], eventReason);
  EventBus.publish(
    "app.launch.failed",
    {
      appId: request.appId,
      requestId: request.requestId,
      reason: eventReason,
      error: managerError instanceof Error ? managerError.message : String(managerError)
    },
    request.app.packageName
  );
}

function enqueueLaunch(request: SynCloudOSLaunchRequestDetails) {
  queuedLaunches.push(request);
  request.options.statechart?.onQueued?.(request);
  recordRequestHistory("queued", request, [
    activeLaunchRequest
      ? `Queued behind ${activeLaunchRequest.app.packageName}.`
      : request.options.hold
        ? "Queued and held until LaunchServices.openDeferredApp or queue processing is requested."
        : "Queued for immediate launch processing."
  ]);
  EventBus.publish("app.launch.queued", { request: toQueueItem(request), queue: getLaunchQueueSnapshot() }, request.app.packageName);
}

function deferLaunch(request: SynCloudOSLaunchRequestDetails, reason: string) {
  request.deferredReason = reason;
  deferredLaunches.push(request);
  request.options.statechart?.onDeferred?.(request);
  recordRequestHistory("deferred", request, [reason], "DEFERRED_LOGIN_SESSION");
  EventBus.publish("app.launch.deferred", { request: toQueueItem(request), queue: getLaunchQueueSnapshot() }, request.app.packageName);
  armDeferredAuthorisationWatcher();
}

function cancelStaleLaunch(request: SynCloudOSLaunchRequestDetails, reason = "Application membership changed before launch could commit.") {
  if (activeLaunchRequest?.requestId === request.requestId) {
    clearLaunchTimers(request.requestId);
    ApplicationState.setPendingApp(null);
    WebspringState.setLoadingApp(null);
    WebspringState.setLaunching(null);
  }
  request.options.statechart?.onCancelled?.(request);
  recordRequestHistory("cancelled", request, [reason], "APPLICATION_SESSION_STALE");
  EventBus.publish("app.launch.cancelled", {
    request: toQueueItem(request),
    reason: "APPLICATION_SESSION_STALE",
    queue: getLaunchQueueSnapshot(),
  }, request.app.packageName);
}

function launchAuthorityIsCurrent(request: SynCloudOSLaunchRequestDetails): boolean {
  if (!requestAuthorityIsCurrent(request)) {
    cancelStaleLaunch(request);
    return false;
  }
  return true;
}

function requestAuthorityIsCurrent(request: SynCloudOSLaunchRequestDetails): boolean {
  try {
    if (request.options.lifecycle?.signal?.aborted) return false;
    WindowManager.validateApplicationMutation(request.applicationMutation);
    // AppInfo lives in the immutable runtime store, so unrelated store writes
    // legitimately replace its object identity. The application epoch is the
    // registration-generation authority; the manager map supplies the exact
    // non-store identity check.
    return AppManagerController.getManagerForApp(request.appId) === request.manager;
  } catch {
    return false;
  }
}

function cancelPendingLaunchesForApplication(appId: string) {
  const removed = [
    ...queuedLaunches.filter((request) => request.appId === appId),
    ...deferredLaunches.filter((request) => request.appId === appId),
  ];
  const active = activeLaunchRequest?.appId === appId ? activeLaunchRequest : null;
  if (active) {
    cancelStaleLaunch(active, "Application close cancelled active launch work.");
    if (activeLaunchRequest === active) activeLaunchRequest = null;
  }
  for (let index = queuedLaunches.length - 1; index >= 0; index -= 1) {
    if (queuedLaunches[index]!.appId === appId) queuedLaunches.splice(index, 1);
  }
  for (let index = deferredLaunches.length - 1; index >= 0; index -= 1) {
    if (deferredLaunches[index]!.appId === appId) deferredLaunches.splice(index, 1);
  }
  for (const request of removed) cancelStaleLaunch(request, "Application close cancelled pending launch work.");
}

function processLaunchQueue() {
  if (activeLaunchRequest) return;
  while (queuedLaunches.length > 0) {
    const next = queuedLaunches.shift()!;
    if (!launchAuthorityIsCurrent(next)) continue;
    startLaunch(next);
    return;
  }
}

function canReleaseDeferredLaunches() {
  const stateName = RuntimeStore.getSnapshot().statechart.currentState;
  return LoginServices.getSnapshot().isAuthorised && (stateName === "active.webspring" || stateName.startsWith("active.application"));
}

function processDeferredLaunches() {
  if (!deferredLaunches.length) return;
  if (!canReleaseDeferredLaunches()) {
    armDeferredAuthorisationWatcher();
    return;
  }

  const ready = deferredLaunches.splice(0, deferredLaunches.length);
  for (const request of ready) {
    if (!launchAuthorityIsCurrent(request)) continue;
    request.deferredReason = undefined;
    enqueueLaunch(request);
  }
  processLaunchQueue();
}

function armDeferredAuthorisationWatcher() {
  if (deferredAuthorisationWatcherArmed) return;
  deferredAuthorisationWatcherArmed = true;
  const release = () => {
    deferredAuthorisationWatcherArmed = false;
    processDeferredLaunches();
  };
  EventBus.once("loginServices.betaAccess.authorised", release);
  EventBus.once("statechart.transition.complete", release);
  EventBus.once("runtime.boot.complete", release);
}

function shouldAbortDisposedLaunch(request: SynCloudOSLaunchRequestDetails) {
  if (!launchServicesDisposed) return false;
  EventBus.publish("app.launch.hmr.aborted", {
    appId: request.appId,
    requestId: request.requestId,
    reason: "LaunchServices hot-reloaded before this launch reached its next side-effect boundary."
  }, request.app.packageName);
  return true;
}

function reconcileAbandonedHotLaunch(request: SynCloudOSLaunchRequestDetails | null) {
  if (!request) return;

  RuntimeStore.mutate((draft) => {
    if (draft.application.pendingAppId === request.appId) draft.application.pendingAppId = null;
    if (draft.application.launchingAppId === request.appId) draft.application.launchingAppId = null;
    if (draft.webspring.launchingAppId === request.appId) {
      draft.webspring.launchingAppId = null;
      draft.webspring.launchPhase = "idle";
      draft.webspring.isAnimating = false;
    }
  });

  EventBus.publish("app.launch.hmr.reconciled", {
    appId: request.appId,
    requestId: request.requestId,
    reason: "LaunchServices hot-reloaded while a launch request was active; transient launch state was cleared."
  }, request.app.packageName);
}

function restoreHotMultiSwitchSettle() {
  const multiSwitch = RuntimeStore.getSnapshot().application.multiSwitch;
  if (
    multiSwitch.status !== "switching" ||
    !multiSwitch.id ||
    !multiSwitch.fromAppId ||
    !multiSwitch.toAppId ||
    !multiSwitch.fromRoute ||
    !multiSwitch.toRoute
  ) {
    return;
  }

  finishMultiSwitchLater(multiSwitch.id, {
    fromAppId: multiSwitch.fromAppId,
    toAppId: multiSwitch.toAppId,
    fromRoute: multiSwitch.fromRoute,
    toRoute: multiSwitch.toRoute,
    source: coerceLaunchSource(multiSwitch.source)
  });
  EventBus.publish("multiswitch.hmr.settleRearmed", {
    switchId: multiSwitch.id,
    fromAppId: multiSwitch.fromAppId,
    toAppId: multiSwitch.toAppId
  }, multiSwitch.toAppId);
}

async function runLaunch(request: SynCloudOSLaunchRequestDetails) {
  const app = request.app;
  const opensAppView = app.presentation === "appView";
  let multiSwitchId: string | null = null;
  let multiSwitch: RouteAwareMultiSwitch | null = null;

  if (!launchAuthorityIsCurrent(request)) return;
  const policy = await authoriseWithPolicyKit(request);
  if (!launchAuthorityIsCurrent(request)) return;
  if (shouldAbortDisposedLaunch(request)) return;
  if (!policy.allowed) {
    const captured = ErrorManager.capture({
      code: "APP_LAUNCH_FAILED",
      title: `${app.displayName} was not authorised.`,
      message: "SynCloudOS policy refused this launch request.",
      appId: request.appId,
      source: "SynCloudOS.LaunchServices.openApp",
      context: { policy, request: toQueueItem(request) }
    });
    failRunningLaunch(request, new Error(policy.reason ?? "PolicyKit denied app launch."), "POLICY_DENIED", captured);
    return;
  }

  EventBus.publish("app.launch.authorised", { appId: request.appId, requestId: request.requestId, policy }, app.packageName);
  recordRequestHistory("authorised", request, [policy.reason ?? "PolicyKit authorised launch."]);
  multiSwitch = createRouteAwareMultiSwitch(app, request.options);
  ApplicationState.setPendingApp(request.appId);
  if (opensAppView && !multiSwitch && !isInitialRouteLaunch(request.options)) {
    WebspringState.setLoadingApp(request.appId, request.requestId);
    if (RuntimeStore.getSnapshot().webspring.launchPhase === "staging") {
      beginLaunchStage(request.requestId, request.appId);
    }
  }
  recordRequestHistory("loading", request, ["App manager readiness requested."]);

  try {
    await request.manager.getReady(request.applicationMutation);
    if (!launchAuthorityIsCurrent(request)) return;
    if (shouldAbortDisposedLaunch(request)) return;
    request.options.statechart?.onReady?.(request);
    recordRequestHistory("ready", request, ["Trusted app bundle is ready."]);
    if (shouldAbortDisposedLaunch(request)) return;
    if (!launchAuthorityIsCurrent(request)) return;
    // Lifecycle validation and will hooks must finish before windows or routes
    // become observable. Its commit callback establishes the parent's authority.
    const requestedLifecycle = request.options.lifecycle;
    await request.manager.launch(request.applicationMutation, multiSwitch ? {
      ...requestedLifecycle,
      onCommit: () => {
        requestedLifecycle?.onCommit?.();
        multiSwitchId = ApplicationState.beginMultiSwitch(multiSwitch!);
      },
    } : requestedLifecycle);
    if (!launchAuthorityIsCurrent(request)) return;
    const hadWindowBeforeLaunch = WindowManager.list({ applicationId: request.appId }).length > 0;
    const openedWindow = await WindowManager.openApplicationWindow(
      request.appId,
      {},
      request.applicationMutation,
    );
    const openedWindowId = !hadWindowBeforeLaunch ? openedWindow?.id ?? null : null;
    if (!launchAuthorityIsCurrent(request)) {
      if (openedWindowId) await WindowManager.requestClose(openedWindowId, { reason: "application-quit" });
      return;
    }
    if (multiSwitch) {
      if (!multiSwitchId) throw new Error("Route-aware MultiSwitch did not establish presentation ownership at lifecycle commit.");
      WebspringState.setLaunching(null);
      WebspringState.coverForApp(request.appId, request.requestId);
      EventBus.publish("multiswitch.begin", { ...multiSwitch, switchId: multiSwitchId, requestId: request.requestId }, app.packageName);
      recordRequestHistory("multiswitch.begin", request, [`Route-aware MultiSwitch from ${multiSwitch.fromRoute} to ${multiSwitch.toRoute}.`]);
    }
    WebspringState.selectApp(request.appId);
    WebspringState.hoverApp(null);
    ApplicationState.setPendingApp(null);
    const routePath = request.options.lifecycle?.routePath ?? app.route;
    ApplicationState.setRoutePath(routePath);
    if (request.options.syncRoute !== false) browserRoutes.syncRoute(routePath);
    if (multiSwitchId && multiSwitch) {
      finishMultiSwitchLater(multiSwitchId, multiSwitch);
      EventBus.publish("multiswitch.settling", { switchId: multiSwitchId, toAppId: request.appId }, app.packageName);
    }
    request.options.statechart?.onActive?.(request);
    EventBus.publish(
      "app.launch.complete",
      {
        appId: request.appId,
        requestId: request.requestId,
        presentation: app.presentation,
        windowCount: WindowManager.list().length
      },
      app.packageName
    );
    recordRequestHistory("complete", request, [`${app.packageName} is active.`]);
  } catch (error) {
    clearLaunchTimers(request.requestId);
    if (multiSwitchId) ApplicationState.clearMultiSwitch(multiSwitchId);
    if (!launchAuthorityIsCurrent(request)) return;
    const captured = ErrorManager.createAppLaunchFailedError(app, error, {
      source: "SynCloudOS.LaunchServices.openApp",
      request: toQueueItem(request)
    });
    failRunningLaunch(request, error, "APP_LAUNCH_FAILED", captured);
  }
}

function startLaunch(request: SynCloudOSLaunchRequestDetails) {
  if (!launchAuthorityIsCurrent(request)) return;
  activeLaunchRequest = request;
  recordRequestHistory("started", request, ["Launch request became active."]);
  EventBus.publish("app.launch.started", { request: toQueueItem(request), queue: getLaunchQueueSnapshot() }, request.app.packageName);
  void runLaunch(request).finally(() => {
    if (activeLaunchRequest?.requestId === request.requestId) activeLaunchRequest = null;
    if (launchServicesDisposed) return;
    processDeferredLaunches();
    processLaunchQueue();
  });
}

function removePendingLaunch(requestIdOrAppId: string) {
  const queuedIndex = queuedLaunches.findIndex((request) => request.requestId === requestIdOrAppId || request.appId === requestIdOrAppId);
  if (queuedIndex >= 0) return queuedLaunches.splice(queuedIndex, 1)[0];

  const deferredIndex = deferredLaunches.findIndex((request) => request.requestId === requestIdOrAppId || request.appId === requestIdOrAppId);
  if (deferredIndex >= 0) return deferredLaunches.splice(deferredIndex, 1)[0];

  return null;
}

function explainExternalOpen(app: SynCloudOSAppInfo, options: SynCloudOSOpenAppOptions): SynCloudOSPolicyAuthorisationExplanation {
  const policyKit = getPolicyKit();
  if (!policyKit?.authorise) {
    return {
      available: false,
      checked: false,
      allowed: true,
      reason: "PolicyKit.authorise is not registered."
    };
  }

  try {
    const result = policyKit.authorise({
      action: "external.open",
      app,
      href: app.route,
      route: app.route,
      source: "SynCloudOS.LaunchServices.openExternalApp",
      origin: getLaunchOrigin(options),
      serviceReport: ServiceRegistry.getServiceReport(externalRequiredServices(app)),
      requiredCapabilities: ["app.open.public"],
      context: options.context
    });

    if (isPromiseLike(result)) {
      return {
        available: true,
        checked: false,
        allowed: false,
        reason: "External route policy must resolve synchronously before opening a new browser context."
      };
    }

    return normalizePolicyResult(result);
  } catch (error) {
    return {
      available: true,
      checked: true,
      allowed: false,
      reason: error instanceof Error ? error.message : String(error),
      code: "POLICYKIT_AUTHORISE_THROWN"
    };
  }
}

function explainExternalApp(appId: string, options: SynCloudOSOpenAppOptions = {}): SynCloudOSExternalAppExplanation {
  const app = AppRegistry.getApp(appId);
  const policyKit = getPolicyKit();
  const uncheckedPolicy: SynCloudOSPolicyAuthorisationExplanation = {
    available: Boolean(policyKit?.authorise),
    checked: false,
    allowed: true,
    reason: "PolicyKit is checked after an external app is resolved."
  };

  if (!app) {
    return {
      appId,
      canOpen: false,
      accepted: false,
      code: "APP_NOT_FOUND",
      reason: `No app is registered as "${appId}".`,
      blockers: [`No app is registered as "${appId}".`],
      app: null,
      href: null,
      canonicalHref: null,
      isSafeProtocol: false,
      serviceReport: null,
      policy: uncheckedPolicy
    };
  }

  const serviceReport = ServiceRegistry.getServiceReport(externalRequiredServices(app));
  const canonicalHref = getCanonicalExternalHref(app.route);
  const isSafeProtocol = Boolean(canonicalHref);
  const policy = explainExternalOpen(app, options);
  const blockers: string[] = [];
  let code: SynCloudOSExternalAppExplanation["code"] = "READY";

  if (app.type !== "external") {
    code = "NOT_EXTERNAL_APP";
    blockers.push("SynCloudOS can only open external routes for external apps.");
  } else if (!isSafeProtocol) {
    code = "UNSAFE_EXTERNAL_SCHEME";
    blockers.push("External routes must use http or https.");
  } else if (!serviceReport.ok) {
    code = "SERVICE_UNAVAILABLE";
    blockers.push(`Required services unavailable: ${serviceReport.missing.join(", ") || "unknown"}.`);
  } else if (!policy.allowed) {
    code = "POLICY_DENIED";
    blockers.push(policy.reason ?? "PolicyKit denied this external route.");
  }

  return {
    appId,
    canOpen: code === "READY",
    accepted: code === "READY",
    code,
    reason: blockers.length > 0 ? blockers.join(" ") : `${app.packageName} can open in an external browser context.`,
    blockers,
    app: {
      id: app.id,
      packageName: app.packageName,
      displayName: app.displayName,
      type: app.type,
      route: app.route
    },
    href: app.route,
    canonicalHref,
    isSafeProtocol,
    serviceReport,
    policy: {
      ...policy,
      available: Boolean(policyKit?.authorise) || policy.available
    }
  };
}

function explainLaunch(appId: string, options: SynCloudOSOpenAppOptions = {}): SynCloudOSLaunchExplanation {
  const app = AppRegistry.getApp(appId);
  const queue = getLaunchQueueSnapshot();
  const loginServices = LoginServices.getSnapshot();
  const policyKit = getPolicyKit();

  if (!app) {
    return {
      appId,
      canLaunch: false,
      canQueue: false,
      canDefer: false,
      accepted: false,
      code: "APP_NOT_FOUND",
      reason: `No app is registered as "${appId}".`,
      blockers: [`No app is registered as "${appId}".`],
      app: null,
      lifecycleState: null,
      serviceReport: null,
      loginServices: {
        isAuthorised: loginServices.isAuthorised,
        status: loginServices.status,
        lastFailureReason: loginServices.lastFailureReason
      },
      policy: {
        available: Boolean(policyKit?.authorise),
        checked: false,
        allowed: true,
        reason: "PolicyKit is checked after an app is resolved."
      },
      queue
    };
  }

  const snapshot = RuntimeStore.getSnapshot();
  const manager = AppManagerController.getManagerForApp(appId);
  const lifecycleState: SynCloudOSAppLifecycleState = manager?.getState() ?? snapshot.lifecycle[appId] ?? "registered";
  const managerExplanation = manager?.explainLaunch();
  const serviceReport = managerExplanation?.serviceReport ?? ServiceRegistry.getServiceReport(app.requiredServices);
  const policy = explainWithPolicyKit(app, options);
  const blockers: string[] = [];
  let code: SynCloudOSLaunchExplanation["code"] = "READY";
  const launchBusy = Boolean(activeLaunchRequest) || Boolean(snapshot.application.pendingAppId);

  if (!policy.allowed) {
    if (options.deferUntilAuthorised && policy.result && typeof policy.result !== "boolean" && policy.result.sessionAuthorised === false) {
      code = "DEFERRED_LOGIN_SESSION";
    } else {
      code = policy.result && typeof policy.result !== "boolean" && policy.result.reason?.toLowerCase().includes("authorised session")
        ? "LOGIN_SESSION_REQUIRED"
        : "POLICY_DENIED";
      blockers.push(policy.reason ?? "PolicyKit denied this launch request.");
    }
  } else if (app.isDisabled) {
    code = "APP_DISABLED";
    blockers.push(`${app.packageName} is disabled.`);
  } else if (!serviceReport.ok) {
    code = "SERVICE_UNAVAILABLE";
    blockers.push(`Required services unavailable: ${serviceReport.missing.join(", ") || "unknown"}.`);
  } else if (managerExplanation && !managerExplanation.canLaunch) {
    code = "LIFECYCLE_BLOCKED";
    blockers.push(...managerExplanation.blockers);
  } else if (launchBusy) {
    if (options.queue === false) {
      code = "LAUNCH_IN_PROGRESS";
      blockers.push("Another app launch is already in progress.");
    } else {
      code = "QUEUED";
    }
  }

  const canLaunch = code === "READY";
  const canQueue = code === "QUEUED";
  const canDefer = code === "DEFERRED_LOGIN_SESSION";
  const accepted = canLaunch || canQueue || canDefer;

  return {
    appId,
    canLaunch,
    canQueue,
    canDefer,
    accepted,
    code,
    reason:
      blockers.length > 0
        ? blockers.join(" ")
        : canQueue
          ? "Launch can be queued behind the active launch."
          : canDefer
            ? "Launch can be deferred until LoginServices authorises a session."
            : `${app.packageName} can launch.`,
    blockers,
    app: {
      id: app.id,
      packageName: app.packageName,
      displayName: app.displayName,
      type: app.type,
      presentation: app.presentation,
      route: app.route
    },
    lifecycleState,
    serviceReport,
    loginServices: {
      isAuthorised: loginServices.isAuthorised,
      status: loginServices.status,
      lastFailureReason: loginServices.lastFailureReason
    },
    policy: {
      ...policy,
      available: Boolean(policyKit?.authorise) || policy.available
    },
    queue
  };
}

const launchServices = {
  runtimeId: runtime.runtimeId,
  openApp(appId: string, options: SynCloudOSOpenAppOptions = {}) {
    const applicationMutation = WindowManager.captureApplicationMutation(appId);
    EventBus.publish("app.launch.requested", { appId, options }, appId);
    const app = AppRegistry.getApp(appId);
    if (!app) {
      recordLaunchHistory("requested", {
        appId,
        source: options.source,
        reason: `No app is registered as "${appId}".`,
        code: "APP_NOT_FOUND",
        options,
        notes: ["Launch request rejected before AppManager creation."]
      });
      ErrorManager.createAppNotFoundError(appId, {
        source: "SynCloudOS.LaunchServices.openApp",
        launchOptions: options,
        modulePath: "src/SynCloudOS/LaunchServices/LaunchServices.ts"
      });
      EventBus.publish("app.launch.failed", { appId, reason: "APP_NOT_FOUND" }, appId);
      return null;
    }

    const pendingRequest = findPendingRequest(appId);
    if (pendingRequest) {
      options.statechart?.onRequested?.(pendingRequest);
      recordRequestHistory("coalesced", pendingRequest, [
        `Coalesced duplicate ${app.packageName} launch request into ${pendingRequest.requestId}.`
      ], "QUEUED");
      EventBus.publish("app.launch.coalesced", { request: toQueueItem(pendingRequest), queue: getLaunchQueueSnapshot() }, app.packageName);
      return pendingRequest.manager;
    }
    const manager = AppManagerController.getManagerForApp(appId) ?? AppManagerController.createManagerForApp(app);

    const request = createLaunchRequest(app, manager, options, applicationMutation);
    options.statechart?.onRequested?.(request);
    recordRequestHistory("requested", request, [`Launch request accepted for evaluation from ${getLaunchSource(options)}.`]);
    const explanation = explainLaunch(appId, options);

    if (explanation.canDefer) {
      deferLaunch(request, explanation.reason);
      return manager;
    }

    if (!explanation.accepted) {
      if (explanation.code === "LOGIN_SESSION_REQUIRED") {
        const error = ErrorManager.createLoginSessionMismatchError(app, {
          source: "SynCloudOS.LaunchServices.openApp",
          requestedAppId: appId,
          siteName: typeof options.context?.siteName === "string" ? options.context.siteName : undefined,
          reason: explanation.reason
        });
        failBeforeStart(request, error, "UNRECOVERABLE_LOGIN_SESSION_MISMATCH");
        return null;
      }

      if (explanation.code === "APP_DISABLED" || explanation.code === "SERVICE_UNAVAILABLE" || explanation.code === "LIFECYCLE_BLOCKED") {
        if (explanation.code !== "LIFECYCLE_BLOCKED") manager.transition("disabled", "required services unavailable");
        const error = captureDisabledLaunch(request, explanation);
        failBeforeStart(request, error, explanation.code);
        return null;
      }

      const error = captureLaunchInProgress(request, explanation);
      failBeforeStart(request, error, explanation.code);
      return null;
    }

    if (explanation.canQueue) {
      enqueueLaunch(request);
      return manager;
    }

    startLaunch(request);
    return manager;
  },

  async preloadApp(appId: string, options: SynCloudOSOpenAppOptions = {}) {
    const applicationMutation = WindowManager.captureApplicationMutation(appId);
    const app = AppRegistry.getApp(appId);
    if (!app) {
      recordLaunchHistory("preload.failed", {
        appId,
        source: options.source,
        reason: `No app is registered as "${appId}".`,
        code: "APP_NOT_FOUND",
        options,
        notes: ["Preload request rejected before AppManager creation."]
      });
      ErrorManager.createAppNotFoundError(appId, {
        source: "SynCloudOS.LaunchServices.preloadApp",
        launchOptions: options
      });
      return null;
    }

    const manager = AppManagerController.getManagerForApp(appId) ?? AppManagerController.createManagerForApp(app);
    const explanation = explainLaunch(appId, {
      ...options,
      queue: false,
      deferUntilAuthorised: false
    });
    if (!explanation.accepted) {
      recordLaunchHistory("preload.failed", {
        appId,
        packageName: app.packageName,
        source: options.source,
        reason: explanation.reason,
        code: explanation.code,
        options,
        notes: ["Preload request rejected before app code import."]
      });
      EventBus.publish("app.preload.failed", { appId, reason: explanation.code, explanation }, app.packageName);
      return null;
    }

    recordLaunchHistory("preload.requested", {
      appId,
      packageName: app.packageName,
      source: options.source,
      options,
      notes: ["App manager readiness requested without opening a window."]
    });

    try {
      await manager.getReady(applicationMutation);
      WindowManager.validateApplicationMutation(applicationMutation);
      recordLaunchHistory("preload.complete", {
        appId,
        packageName: app.packageName,
        source: options.source,
        options,
        notes: [`${app.packageName} is ready.`]
      });
      EventBus.publish("app.preload.complete", { appId, readiness: manager.getRecord().readiness }, app.packageName);
      return manager;
    } catch (error) {
      const captured = ErrorManager.createAppLaunchFailedError(app, error, {
        source: "SynCloudOS.LaunchServices.preloadApp"
      });
      recordLaunchHistory("preload.failed", {
        appId,
        packageName: app.packageName,
        source: options.source,
        reason: error instanceof Error ? error.message : String(error),
        code: captured.code,
        options,
        notes: ["App manager readiness failed during preload."]
      });
      EventBus.publish("app.preload.failed", { appId, reason: captured.code, error: error instanceof Error ? error.message : String(error) }, app.packageName);
      return null;
    }
  },

  retryLaunch(requestIdOrAppId: string, options: SynCloudOSOpenAppOptions = {}) {
    const previous = [...launchHistory]
      .reverse()
      .find((record) => record.requestId === requestIdOrAppId || record.appId === requestIdOrAppId);
    const appId = AppRegistry.getApp(requestIdOrAppId)?.id ?? previous?.appId ?? requestIdOrAppId;
    const app = AppRegistry.getApp(appId);
    const previousOptions = previous?.options ?? {};
    const retryOptions: SynCloudOSOpenAppOptions = {
      ...previousOptions,
      ...options,
      context: {
        ...previousOptions.context,
        ...options.context,
        retryOf: previous?.requestId ?? requestIdOrAppId
      },
      reason: options.reason ?? `Retry of ${previous?.requestId ?? requestIdOrAppId}`
    };

    recordLaunchHistory("retry.requested", {
      appId,
      packageName: app?.packageName ?? previous?.packageName,
      requestId: previous?.requestId,
      source: retryOptions.source,
      reason: retryOptions.reason,
      options: retryOptions,
      notes: previous
        ? [`Retrying ${appId} from history action ${previous.action}.`]
        : [`Retrying ${appId} without a matching launch-history record.`]
    });

    return this.openApp(appId, retryOptions);
  },

  async closeApp(appId: string) {
    const authority = WindowManager.beginApplicationClose(appId);
    try {
      const manager = AppManagerController.getManagerForApp(appId);
      cancelPendingLaunchesForApplication(appId);
      if (manager) await manager.cancelApplicationWorkForClose("LaunchServices.closeApp");
      const closeResult = await WindowManager.requestCloseApplication(
        appId,
        { reason: "application-quit" },
        authority,
      );
      if (closeResult && closeResult.outcome !== "closed") return closeResult;
      WindowManager.validateApplicationCloseAuthority(authority);
      if (manager && AppManagerController.getManagerForApp(appId) !== manager) {
        throw new Error(`Application "${appId}" manager changed during close.`);
      }
      if (manager) await manager.suspendForApplicationClose("LaunchServices.closeApp");
      WindowManager.validateApplicationCloseAuthority(authority);
      if (manager && AppManagerController.getManagerForApp(appId) !== manager) {
        throw new Error(`Application "${appId}" manager changed during suspension.`);
      }
      return closeResult;
    } finally {
      WindowManager.endApplicationClose(authority);
    }
  },

  queueLaunch(appId: string, options: SynCloudOSOpenAppOptions = {}) {
    const applicationMutation = WindowManager.captureApplicationMutation(appId);
    const app = AppRegistry.getApp(appId);
    if (!app) {
      recordLaunchHistory("queued", {
        appId,
        source: options.source,
        reason: `No app is registered as "${appId}".`,
        code: "APP_NOT_FOUND",
        options,
        notes: ["Queue request rejected before AppManager creation."]
      });
      ErrorManager.createAppNotFoundError(appId, {
        source: "SynCloudOS.LaunchServices.queueLaunch",
        launchOptions: options
      });
      return null;
    }
    const pendingRequest = findPendingRequest(appId);
    if (pendingRequest) {
      recordRequestHistory("coalesced", pendingRequest, [
        `Coalesced duplicate queued ${app.packageName} request into ${pendingRequest.requestId}.`
      ], "QUEUED");
      EventBus.publish("app.launch.coalesced", { request: toQueueItem(pendingRequest), queue: getLaunchQueueSnapshot() }, app.packageName);
      return toQueueItem(pendingRequest);
    }
    const manager = AppManagerController.getManagerForApp(appId) ?? AppManagerController.createManagerForApp(app);
    const request = createLaunchRequest(app, manager, { ...options, queue: true }, applicationMutation);
    enqueueLaunch(request);
    if (!options.hold) processLaunchQueue();
    return toQueueItem(request);
  },

  cancelLaunch(requestIdOrAppId: string) {
    const removed = removePendingLaunch(requestIdOrAppId);
    if (!removed) return false;
    recordRequestHistory("cancelled", removed, ["Pending launch request removed from LaunchServices queue."]);
    EventBus.publish("app.launch.cancelled", { request: toQueueItem(removed), queue: getLaunchQueueSnapshot() }, removed.app.packageName);
    return true;
  },

  openDeferredApp() {
    processDeferredLaunches();
    return getLaunchQueueSnapshot();
  },

  openExternalApp(appId: string, options: SynCloudOSOpenAppOptions = {}) {
    const explanation = explainExternalApp(appId, options);
    const app = AppRegistry.getApp(appId);
    if (!app) {
      recordLaunchHistory("external.denied", {
        appId,
        source: options.source,
        reason: explanation.reason,
        code: explanation.code,
        options,
        notes: explanation.blockers
      });
      ErrorManager.createAppNotFoundError(appId, {
        source: "SynCloudOS.LaunchServices.openExternalApp",
        launchOptions: options
      });
      return false;
    }

    if (!explanation.canOpen) {
      recordLaunchHistory("external.denied", {
        appId,
        packageName: app.packageName,
        source: options.source,
        reason: explanation.reason,
        code: explanation.code,
        href: app.route,
        options,
        notes: explanation.blockers
      });
      ErrorManager.capture({
        code: "APP_LAUNCH_FAILED",
        title: `${app.displayName} was not authorised.`,
        message: explanation.reason,
        appId,
        source: "SynCloudOS.LaunchServices.openExternalApp",
        context: { explanation, policy: explanation.policy, serviceReport: explanation.serviceReport, href: app.route }
      });
      return false;
    }

    runtime.environment.browser.getWindow()?.open(app.route, "_blank", "noopener,noreferrer");
    recordLaunchHistory("external.opened", {
      appId,
      packageName: app.packageName,
      source: options.source,
      href: app.route,
      options,
      notes: [`Opened ${explanation.canonicalHref ?? app.route}.`]
    });
    EventBus.publish("app.launch.external", { appId, href: app.route, policy: explanation.policy, explanation }, app.packageName);
    return true;
  },

  canLaunch(appId: string, options: SynCloudOSOpenAppOptions = {}) {
    return explainLaunch(appId, options).canLaunch;
  },

  explainLaunch(appId: string, options: SynCloudOSOpenAppOptions = {}) {
    return explainLaunch(appId, options);
  },

  explainExternalApp(appId: string, options: SynCloudOSOpenAppOptions = {}) {
    return explainExternalApp(appId, options);
  },

  inspect() {
    return {
      ...getLaunchQueueSnapshot(),
      history: this.getHistory(launchHistoryLimit)
    };
  },

  getHistory(limit?: number) {
    return typeof limit === "number" ? launchHistory.slice(-limit) : [...launchHistory];
  },

  clearHistory() {
    launchHistory.splice(0, launchHistory.length);
    launchAttempts.clear();
  },

  // Canonical route operations are intentionally owned by Runtime rather
  // than a second route manager.  Preserve the public launch audit trail by
  // accepting their lifecycle milestones into this runtime-owned queue.
  recordRuntimeTransition(action: SynCloudOSLaunchHistoryAction, details: {
    appId: string;
    source?: SynCloudOSLaunchSource;
    requestId?: string;
    notes?: string[];
  }) {
    const app = AppRegistry.getApp(details.appId);
    return recordLaunchHistory(action, {
      appId: details.appId,
      packageName: app?.packageName,
      source: details.source,
      requestId: details.requestId,
      notes: details.notes,
    });
  },

  completeMultiSwitch(switchId: string) {
    clearMultiSwitchFallback(switchId);
    return settleMultiSwitch(switchId, getCurrentMultiSwitchDetails(switchId), "animation");
  },

  dispose() {
    launchServicesDisposed = true;
    for (const switchId of [...multiSwitchFallbackTimers.keys()]) clearMultiSwitchFallback(switchId);
    clearAllLaunchTimers();
    unsubscribeWebspringReturn();
    queuedLaunches.splice(0, queuedLaunches.length);
    deferredLaunches.splice(0, deferredLaunches.length);
    activeLaunchRequest = null;
  },

  completeLaunchStage(
    launchTransitionId: string,
    appId?: string | null,
    completionSource: "frame" | "fallback" = "frame"
  ) {
    return completeLaunchStageTransition(launchTransitionId, appId, completionSource);
  },

  completeLaunchCover(
    launchTransitionId: string,
    appId?: string | null,
    completionSource: "animation" | "fallback" = "animation"
  ) {
    return completeLaunchCoverTransition(launchTransitionId, appId, completionSource);
  }
};

reconcileAbandonedHotLaunch(abandonedHotLaunchRequest);
restoreHotMultiSwitchSettle();

return launchServices;
}

