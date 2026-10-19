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

import type { RuntimeResourceLedger } from "../Resources/RuntimeResourceLedger";
import type { RuntimePerformancePolicy } from "../Performance/RuntimePerformancePolicy";
import { createAppLifecycleRules } from "../AppManager/AppLifecycle";
import { AppInfo } from "../AppInfo/AppInfo";
import type { AppLifecycleEvent, AppManagerRuntimeRecord, SynCloudOSAppLifecycleState } from "../AppManager/appManagerTypes";
import type { SynCloudOSBundleLifecycleHook, SynCloudOSBundleLifecycleHookName, TrustedSynWareBundle } from "../BundleLoader/bundleTypes";
import type { SynCloudOSRuntimeEventType } from "../EventBus/eventTypes";
import type { OperationContext } from "../Operations/operationTypes";
import type { WindowCloseResult, WindowManager } from "../Windows";
import type { SynCloudOSStateTransitionRecord } from "../Statechart/statechartTypes";
import type {
  RuntimeOperationHandle,
  SynCloudOSAppManagerController,
  SynCloudOSAppRegistry,
  SynCloudOSBundleLoader,
  SynCloudOSLifecycle,
  SynCloudOSErrorManager,
  SynCloudOSPolicyKit,
  SynCloudOSRuntime,
} from "../Runtime/runtimeInstanceTypes";
import type { RuntimeSnapshot } from "../Runtime/runtimeTypes";
import type {
  AppActivationResult,
  AppCloseResult,
  AppLaunchResult,
  AppSuspensionResult,
  LifecycleDispatchResult,
  LifecycleRequestOptions,
  LifecycleTransitionResult,
  RuntimeLifecycleOperationRecord,
  SynCloudOSLifecycleAccessResult,
  SynCloudOSLifecycleControl,
  SynCloudOSLifecycleEventName,
  SynCloudOSLifecycleHookContext,
  SynCloudOSLifecycleListener,
  SynCloudOSLifecycleNamespace,
  SynCloudOSLifecycleStage,
  SynCloudOSLifecycleSubscribeOptions,
  SynCloudOSLifecycleTransitionListener,
  SynCloudOSLifecycleTransitionOptions,
  SynCloudOSLifecycleTransitionResult,
} from "./lifecycleTypes";

type LifecycleErrorManager = Pick<SynCloudOSErrorManager, "capture" | "createAppNotFoundError">;
type LifecycleBundleLoader = Pick<SynCloudOSBundleLoader, "getBundle" | "getLoadedBundle" | "loadBundle">;
type LifecycleAppRegistry = Pick<SynCloudOSAppRegistry, "getApp">;
type LifecycleAppManagerController = Pick<SynCloudOSAppManagerController, "getManagerForApp">;
type LifecyclePolicyKit = Pick<SynCloudOSPolicyKit, "authorise">;
type LifecycleWindowManager = Pick<
  WindowManager,
  "beginApplicationClose" | "requestCloseApplication" | "endApplicationClose" | "validateCloseApplication" | "commitCloseApplication"
>;
type LifecycleOperationCoordinator = Pick<SynCloudOSRuntime["operations"], "run">;
type LifecycleCacheRegistry = Pick<SynCloudOSRuntime["caches"], "prune">;

export interface SynCloudOSLifecycleDependencies {
  readonly errorManager: LifecycleErrorManager;
  readonly bundles: LifecycleBundleLoader;
  readonly apps: LifecycleAppRegistry;
  readonly appManagerController: LifecycleAppManagerController;
  readonly policyKit: LifecyclePolicyKit;
  readonly windows: LifecycleWindowManager;
  readonly operations: LifecycleOperationCoordinator;
  readonly caches: LifecycleCacheRegistry;
  /** Aggregate resource relief for memory warnings. */
  readonly resources?: Pick<RuntimeResourceLedger, "relieve" | "enforceBudget">;
  /** Memory warnings are pressure evidence for the adaptive policy. */
  readonly performance?: Pick<RuntimePerformancePolicy, "reportMemoryPressure">;
  readonly isSessionLogoutPending: () => boolean;
  readonly lifecycleHookTimeoutMs?: number;
  readonly operationHistoryLimit?: number;
}

type LifecycleService = SynCloudOSLifecycle & SynCloudOSLifecycleControl;
type LifecycleOperationHook<T> = (context: OperationContext<unknown, T>) => void | Promise<void>;
type LifecycleOperationDidHook<T> = (context: OperationContext<unknown, T>, value: T) => void | Promise<void>;
type CancellableLifecycleOperation = {
  readonly result: Promise<unknown>;
  cancel(reason?: string): void;
};

type LifecycleTransitionStage = "activate" | "suspend" | "close";
type LifecycleCommitResult<T extends LifecycleTransitionResult = LifecycleTransitionResult> = {
  readonly transition: T;
  readonly event: AppLifecycleEvent;
  readonly previousActiveAppId: string | null;
};

const namedHookByStage: Partial<Record<SynCloudOSLifecycleStage, {
  readonly will: SynCloudOSBundleLifecycleHookName;
  readonly did: SynCloudOSBundleLifecycleHookName;
}>> = {
  register: { will: "applicationWillRegister", did: "applicationDidRegister" },
  launch: { will: "applicationWillLaunch", did: "applicationDidLaunch" },
  activate: { will: "applicationWillBecomeActive", did: "applicationDidBecomeActive" },
  suspend: { will: "applicationWillSuspend", did: "applicationDidSuspend" },
  close: { will: "applicationWillClose", did: "applicationDidClose" },
};

const lifecycleStates: SynCloudOSAppLifecycleState[] = [
  "registered",
  "idle",
  "loading",
  "ready",
  "launching",
  "active",
  "suspended",
  "failed",
  "closed",
  "disabled",
];

function isLifecycleState(value: unknown): value is SynCloudOSAppLifecycleState {
  return typeof value === "string" && lifecycleStates.some((state) => state === value);
}

function eventFromPayload(payload: unknown, fallbackAt: number): AppLifecycleEvent | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  if (!("appId" in payload) || typeof payload.appId !== "string") return null;
  if (!("from" in payload) || !isLifecycleState(payload.from)) return null;
  if (!("to" in payload) || !isLifecycleState(payload.to)) return null;
  return {
    appId: payload.appId,
    from: payload.from,
    to: payload.to,
    reason: "reason" in payload && typeof payload.reason === "string" ? payload.reason : undefined,
    at: "at" in payload && typeof payload.at === "number" ? payload.at : fallbackAt,
  };
}

function cancellationError(signal?: AbortSignal): Error {
  const reason = signal?.reason;
  if (reason instanceof Error) return reason;
  if (typeof reason === "string" && reason.length > 0) return new Error(reason);
  return new Error("operation cancelled");
}

function isNamedLifecycleHook(value: unknown): value is SynCloudOSBundleLifecycleHook {
  return typeof value === "function";
}

function isPolicyDenied(decision: unknown): boolean {
  if (decision === false) return true;
  if (typeof decision !== "object" || decision === null || Array.isArray(decision)) return false;
  return (
    ("allowed" in decision && decision.allowed === false) ||
    ("decision" in decision && decision.decision === "deny") ||
    ("launch" in decision && decision.launch === "deny")
  );
}

function legalLifecycleState(stage: "launch" | "activate" | "suspend" | "close", state: SynCloudOSAppLifecycleState): boolean {
  if (stage === "launch" || stage === "activate") {
    return state === "registered" || state === "idle" || state === "ready" || state === "suspended";
  }
  if (stage === "suspend") return state === "active";
  return state === "active" ||
    state === "suspended" ||
    state === "ready" ||
    state === "idle" ||
    state === "failed" ||
    state === "registered";
}

export function createLifecycle(
  runtime: SynCloudOSRuntime,
  dependencies: SynCloudOSLifecycleDependencies,
): LifecycleService {
  const AppLifecycle = createAppLifecycleRules();
  const EventBus = runtime.events;
  const RuntimeStore = runtime.store;
  const ErrorManager = dependencies.errorManager;
  const BundleLoader = dependencies.bundles;
  const AppRegistry = dependencies.apps;
  const AppManagerController = dependencies.appManagerController;
  const PolicyKit = dependencies.policyKit;
  const WindowManager = dependencies.windows;
  const Operations = dependencies.operations;
  const Caches = dependencies.caches;
  const lifecycleHistoryLimit = Math.max(1, dependencies.operationHistoryLimit ?? 160);
  const activeOperations = new Set<CancellableLifecycleOperation>();
  let disposed = false;

  const aliases: Readonly<Record<string, SynCloudOSRuntimeEventType | string>> = {
    boot: "runtime.boot.begin",
    ready: "runtime.boot.complete",
    "app.register": "app.register",
    "app.launch": "app.launch.requested",
    "route.open": "route.open",
    "statechart.transition": "statechart.transition.complete",
    "policy.decision": "policy.decision",
    "error.capture": "error.capture",
  };

  function resolve(name: SynCloudOSLifecycleEventName) {
    return aliases[name] ?? name;
  }

  function createRecord(appId: string, state: SynCloudOSAppLifecycleState): AppManagerRuntimeRecord | null {
    const appInfo = RuntimeStore.getSnapshot().appInfo[appId];
    if (!appInfo) return null;
    return {
      appId,
      lifecycleState: state,
      readiness:
        state === "failed"
          ? "failed"
          : state === "loading"
            ? "loading"
            : state === "ready" || state === "launching" || state === "active" || state === "suspended"
              ? "ready"
              : "cold",
      requiredServices: { ...appInfo.serviceStatus },
      disabled: appInfo.isDisabled || state === "disabled",
      activeAt: null,
      suspendedAt: null,
      failedAt: null,
      closedAt: null,
      launchCount: 0,
      lastLaunchAt: null,
      lastError: appInfo.isDisabled || state === "disabled" ? "Required services unavailable." : null,
    };
  }

  function updateManagerRecord(
    previousRecord: AppManagerRuntimeRecord,
    appId: string,
    from: SynCloudOSAppLifecycleState,
    to: SynCloudOSAppLifecycleState,
    reason: string | undefined,
    now: number,
  ): AppManagerRuntimeRecord {
    return {
      ...previousRecord,
      appId,
      lifecycleState: to,
      readiness:
        to === "failed"
          ? "failed"
          : to === "loading"
            ? "loading"
            : to === "ready" || to === "launching" || to === "active" || to === "suspended"
              ? "ready"
              : previousRecord.readiness,
      disabled: to === "disabled",
      activeAt: to === "active" ? now : previousRecord.activeAt,
      suspendedAt: to === "suspended" ? now : previousRecord.suspendedAt,
      failedAt: to === "failed" ? now : previousRecord.failedAt,
      closedAt: to === "closed" ? now : previousRecord.closedAt,
      launchCount:
        to === "launching" && from !== "launching"
          ? previousRecord.launchCount + 1
          : to === "active" && from !== "active"
            ? previousRecord.launchCount + 1
            : previousRecord.launchCount,
      lastLaunchAt: to === "launching" || to === "active" ? now : previousRecord.lastLaunchAt,
      lastError: to === "failed" ? reason ?? "Lifecycle failed." : null,
    };
  }

  function recordLifecycleOperation(record: RuntimeLifecycleOperationRecord) {
    RuntimeStore.mutate((draft) => {
      draft.lifecycleOperations = [...draft.lifecycleOperations, record].slice(-lifecycleHistoryLimit);
    });
  }

  function awaitLifecycleHook<T>(value: T | Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) return Promise.reject(cancellationError(signal));
    return new Promise<T>((resolvePromise, rejectPromise) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        callback();
      };
      const onAbort = () => finish(() => rejectPromise(cancellationError(signal)));
      signal.addEventListener("abort", onAbort, { once: true });
      Promise.resolve(value).then(
        (result) => finish(() => resolvePromise(result)),
        (error) => finish(() => rejectPromise(error)),
      );
    });
  }

  function resolveLifecycleHook<TPayload>(
    bundle: TrustedSynWareBundle,
    stage: SynCloudOSLifecycleStage,
    phase: "will" | "did",
  ): {
    readonly invoke: (context: SynCloudOSLifecycleHookContext<TPayload>) => void | Promise<void>;
    readonly hookName?: SynCloudOSBundleLifecycleHookName;
  } | null {
    const stageHooks = bundle.lifecycleHooks?.[stage];
    if (typeof stageHooks === "object" && stageHooks !== null && !Array.isArray(stageHooks)) {
      const stageHook = phase in stageHooks ? stageHooks[phase] : undefined;
      if (typeof stageHook === "function") {
        return {
          invoke: (context) => stageHook(context),
        };
      }
    }

    const hookName = namedHookByStage[stage]?.[phase];
    const namedHook = hookName && bundle.lifecycleHooks ? bundle.lifecycleHooks[hookName] : undefined;
    if (!hookName || !isNamedLifecycleHook(namedHook)) return null;
    return {
      hookName,
      invoke: (context) => namedHook({
        appId: context.appId,
        packageName: context.packageName,
        reason: context.reason,
      }),
    };
  }

  async function invokeLifecycleHook<TPayload, TOperation>(
    stage: SynCloudOSLifecycleStage,
    phase: "will" | "did",
    appId: string,
    operation: OperationContext<unknown, TOperation>,
    payload: TPayload,
    reason: string,
  ): Promise<void> {
    const bundle = BundleLoader.getBundle(appId);
    if (!bundle) return;
    const candidate = resolveLifecycleHook<TPayload>(bundle, stage, phase);
    if (!candidate) return;
    const startedAt = runtime.environment.now();
    const context: SynCloudOSLifecycleHookContext<TPayload> = {
      runtimeId: runtime.runtimeId,
      appId,
      packageName: bundle.manifest.packageName,
      operationId: operation.operationId,
      correlationId: operation.correlationId,
      signal: operation.signal,
      stage,
      phase,
      reason,
      payload,
    };
    try {
      await awaitLifecycleHook(candidate.invoke(context), operation.signal);
      operation.throwIfCancelled();
      const endedAt = runtime.environment.now();
      recordLifecycleOperation({
        runtimeId: runtime.runtimeId,
        appId,
        packageName: bundle.manifest.packageName,
        operationId: operation.operationId,
        correlationId: operation.correlationId,
        stage,
        phase,
        startedAt,
        endedAt,
        durationMs: Math.max(0, endedAt - startedAt),
        outcome: "completed",
        reason,
      });
    } catch (error) {
      const endedAt = runtime.environment.now();
      const cancelled = operation.signal.aborted;
      recordLifecycleOperation({
        runtimeId: runtime.runtimeId,
        appId,
        packageName: bundle.manifest.packageName,
        operationId: operation.operationId,
        correlationId: operation.correlationId,
        stage,
        phase,
        startedAt,
        endedAt,
        durationMs: Math.max(0, endedAt - startedAt),
        outcome: cancelled ? "cancelled" : "failed",
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
      EventBus.publish("bundle.lifecycle.failed", {
        runtimeId: runtime.runtimeId,
        appId,
        packageName: bundle.manifest.packageName,
        stage,
        phase,
        hookName: candidate.hookName,
        error: error instanceof Error ? error.message : String(error),
      }, bundle.manifest.packageName);
      throw error;
    }
  }

  async function ensureRuntimeBundleLoaded(
    appId: string,
    signal?: AbortSignal,
    source = "SynCloudOS.LaunchServices.openApp",
  ) {
    if (signal?.aborted) throw cancellationError(signal);
    const existing = BundleLoader.getLoadedBundle(appId);
    if (existing) return existing;
    try {
      const loaded = await BundleLoader.loadBundle(appId, { signal });
      if (signal?.aborted || runtime.signal.aborted || disposed) {
        throw cancellationError(signal ?? runtime.signal);
      }
      return loaded;
    } catch (error) {
      const app = AppRegistry.getApp(appId);
      const expectedCancellation = signal?.aborted || runtime.signal.aborted || disposed;
      if (app && !expectedCancellation) {
        ErrorManager.capture({
          code: "APP_LAUNCH_FAILED",
          title: `Webspring could not open ${app.packageName}.`,
          error,
          appId: app.id,
          packageName: app.packageName,
          source,
          suggestedActions: ["returnToWebspring", "dismiss"],
          category: "app",
          context: {
            requestedAppId: app.id,
            requestedPackage: app.packageName,
          },
        });
      }
      throw error;
    }
  }

  function validateLifecycleAccess(appId: string, stage: "launch" | "activate"): SynCloudOSLifecycleAccessResult {
    if (dependencies.isSessionLogoutPending()) {
      return {
        ok: false,
        code: "session-logout-pending",
        reason: `Cannot ${stage} ${appId} while logout is completing.`,
      };
    }
    const app = AppRegistry.getApp(appId);
    const policyDecision = PolicyKit.authorise({
      action: "app.launch",
      app,
      route: app?.route,
      source: `SynCloudOS.Lifecycle.${stage}`,
      origin: "runtime",
      requiredCapabilities: [app?.type === "system" ? "diagnostics.view" : "app.open.public"],
      context: { lifecycleStage: stage },
    });
    if (isPolicyDenied(policyDecision)) {
      const sessionRequired = !policyDecision.sessionAuthorised && /authorised session/i.test(policyDecision.reason);
      return {
        ok: false,
        code: sessionRequired ? "lifecycle-unauthorised" : "lifecycle-denied",
        reason: policyDecision.reason,
      };
    }
    if (app?.isDisabled || getState(appId) === "disabled") {
      return {
        ok: false,
        code: "lifecycle-disabled",
        reason: app ? AppInfo.explain(app).reason : `Application ${appId} is disabled.`,
      };
    }
    return { ok: true };
  }

  function lifecycleAccessFailure(
    appId: string,
    to: SynCloudOSAppLifecycleState,
    options: SynCloudOSLifecycleTransitionOptions,
  ): string | null {
    const stage = to === "launching" ? "launch" : "activate";
    const result = validateLifecycleAccess(appId, stage);
    if (result.ok) return null;
    const error = result.reason;
    EventBus.publish("lifecycle.transition.failed", { appId, to, error, options, code: result.code }, appId);
    ErrorManager.capture({
      code: "APP_LAUNCH_FAILED",
      title: "SynCloudOS denied a lifecycle transition.",
      message: error,
      appId,
      source: options.source ?? "SynCloudOS.Lifecycle.transition",
      technicalMessage: `Policy result: ${result.code}`,
      context: { appId, to, stage, options, code: result.code },
    });
    return error;
  }

  function commitLifecycleState<T extends LifecycleTransitionResult>(
    appId: string,
    to: T["to"],
    stage: T["stage"],
    reason: string,
    establishCommit?: (transition: T) => void,
    routePath?: string,
  ): LifecycleCommitResult<T> {
    const before = RuntimeStore.getSnapshot();
    const from = before.lifecycle[appId] ?? "registered";
    const at = runtime.environment.now();
    const event: AppLifecycleEvent = { appId, from, to, reason, at };
    const previousActiveAppId = to === "active" && before.application.activeAppId !== appId
      ? before.application.activeAppId
      : null;
    const previousFrom = previousActiveAppId ? before.lifecycle[previousActiveAppId] ?? "registered" : null;
    const previousEvent: AppLifecycleEvent | null = previousActiveAppId && previousFrom === "active"
      ? { appId: previousActiveAppId, from: previousFrom, to: "suspended", reason, at }
      : null;
    const app = AppRegistry.getApp(appId);
    const reconcilePresentation = to === "active" || (
      (to === "suspended" || to === "closed") &&
      (before.application.activeAppId === appId || before.application.currentAppId === appId)
    );
    const transition = { runtimeId: runtime.runtimeId, appId, from, to, stage, reason } as T;
    establishCommit?.(transition);
    // An enclosing statechart transition may claim presentation in its commit
    // callback. Read that ownership after the callback, not from the old snapshot.
    const statechartRecord: SynCloudOSStateTransitionRecord | null = !RuntimeStore.getSnapshot().statechart.isTransitioning && reconcilePresentation
      ? {
          id: `${runtime.runtimeId}:transition:${runtime.environment.randomUUID()}`,
          from: before.statechart.currentState,
          to: to === "active" ? "active.application.active" : "active.webspring",
          at,
          appId: to === "active" ? appId : undefined,
          pathname: to === "active" ? routePath ?? app?.route ?? before.application.routePath : "/",
          source: `lifecycle.${stage}`,
          ok: true,
        }
      : null;
    RuntimeStore.mutate((draft: RuntimeSnapshot) => {
      if (previousEvent) {
        draft.lifecycle[previousEvent.appId] = "suspended";
        draft.lifecycleEvents = [...draft.lifecycleEvents, previousEvent].slice(-lifecycleHistoryLimit);
        const previousManager = draft.managers[previousEvent.appId];
        if (previousManager) {
          previousManager.lifecycleState = "suspended";
          previousManager.suspendedAt = at;
          previousManager.lastError = null;
        }
        draft.application.suspendedAppIds = Array.from(new Set([...draft.application.suspendedAppIds, previousEvent.appId]));
      }
      draft.lifecycle[appId] = to;
      draft.lifecycleEvents = [...draft.lifecycleEvents, event].slice(-lifecycleHistoryLimit);
      const previousRecord = draft.managers[appId] ?? createRecord(appId, from);
      if (previousRecord) draft.managers[appId] = updateManagerRecord(previousRecord, appId, from, to, reason, at);
      draft.application.lastLifecycleEvent = `${appId}:${from}->${to}`;
      if (to === "active") {
        draft.application.activeAppId = appId;
        draft.application.currentAppId = appId;
        draft.application.previousAppId = previousActiveAppId;
        draft.application.lastActiveAppId = appId;
        draft.application.routePath = routePath ?? app?.route ?? draft.application.routePath;
        draft.application.openAppIds = Array.from(new Set([...draft.application.openAppIds, appId]));
        draft.application.suspendedAppIds = draft.application.suspendedAppIds.filter((id) => id !== appId);
        draft.application.launchingAppId = null;
        draft.application.pendingAppId = null;
        draft.webspring.selectedAppId = appId;
        draft.webspring.focusedAppId = appId;
        draft.webspring.isAppContainerOpen = true;
      } else if (to === "suspended") {
        draft.application.suspendedAppIds = Array.from(new Set([...draft.application.suspendedAppIds, appId]));
      } else if (to === "failed") {
        draft.application.failedAppIds = Array.from(new Set([...draft.application.failedAppIds, appId]));
      } else if (to === "closed") {
        draft.application.openAppIds = draft.application.openAppIds.filter((id) => id !== appId);
        draft.application.suspendedAppIds = draft.application.suspendedAppIds.filter((id) => id !== appId);
        if (draft.application.activeAppId === appId) draft.application.activeAppId = null;
      }
      if (reconcilePresentation && to !== "active") {
        draft.application.activeAppId = null;
        draft.application.currentAppId = null;
        draft.application.routePath = "/";
        draft.application.pendingAppId = null;
        draft.application.launchingAppId = null;
        draft.application.multiSwitch = {
          id: null,
          status: "idle",
          fromAppId: null,
          toAppId: null,
          fromRoute: null,
          toRoute: null,
          source: null,
          startedAt: null,
          completedAt: null,
        };
        draft.webspring.selectedAppId = null;
        draft.webspring.focusedAppId = null;
        draft.webspring.isAppContainerOpen = false;
      }
      if (statechartRecord) {
        draft.statechart.previousState = statechartRecord.from;
        draft.statechart.currentState = statechartRecord.to;
        draft.statechart.lastTransitionAt = statechartRecord.at;
        draft.statechart.isTransitioning = false;
        draft.statechart.history = [...draft.statechart.history, statechartRecord].slice(-80);
      }
      const appInfo = draft.appInfo[appId];
      if (appInfo) {
        draft.appInfo[appId] = {
          ...appInfo,
          isReady: to === "ready" || to === "launching" || to === "active" || to === "suspended",
          isFailed: to === "failed",
        };
      }
    });
    // A direct close or suspend of the presented app (SDK closeSelf, quit) owns
    // no enclosing statechart return, so the shell motion that Webspring
    // would have been given by Statechart.returnToWebspring is driven here.
    // Launch phases cannot outlive the app that produced them. Deep-linked
    // apps never ran a launch (phase idle) and need no return motion.
    if (statechartRecord && to !== "active") {
      const phase = RuntimeStore.getSnapshot().webspring.launchPhase;
      if (phase === "staging" || phase === "launching" || phase === "covered") {
        if (app?.presentation === "appView" && app.frame.presentationMotion !== "content") runtime.webspringChoreography.beginReturn(appId);
        else runtime.webspring.coverForApp(null);
      }
    }
    if (previousEvent) EventBus.publish("app.lifecycle", { runtimeId: runtime.runtimeId, ...previousEvent, stage: "suspend" }, previousEvent.appId);
    EventBus.publish("app.lifecycle", { runtimeId: runtime.runtimeId, ...event, stage }, appId);
    if (statechartRecord) EventBus.publish("statechart.transition.complete", statechartRecord, `${statechartRecord.from} -> ${statechartRecord.to}`);
    return { transition, event, previousActiveAppId };
  }

  function linkExternalSignal<T>(handle: RuntimeOperationHandle<T>, signal?: AbortSignal): RuntimeOperationHandle<T> {
    if (!signal) return handle;
    const cancel = () => handle.cancel("external-abort");
    if (signal.aborted) {
      cancel();
    } else {
      signal.addEventListener("abort", cancel, { once: true });
      void handle.result.then(
        () => signal.removeEventListener("abort", cancel),
        () => signal.removeEventListener("abort", cancel),
      );
    }
    return handle;
  }

  function retainOperation<T>(handle: RuntimeOperationHandle<T>): RuntimeOperationHandle<T> {
    activeOperations.add(handle);
    void handle.result.then(
      () => activeOperations.delete(handle),
      () => activeOperations.delete(handle),
    );
    return handle;
  }

  function lifecycleOperationTimeout(options: LifecycleRequestOptions): number {
    const configured = options.timeoutMs ?? dependencies.lifecycleHookTimeoutMs ?? 5000;
    return Math.max(0, Math.min(configured, 120000));
  }

  async function closeApplicationWindows(
    appId: string,
    signal?: AbortSignal,
    transaction?: LifecycleRequestOptions["closeTransaction"],
  ): Promise<WindowCloseResult | null> {
    if (transaction) {
      if (transaction.authority.applicationId !== appId || transaction.preparation.applicationId !== appId) {
        throw new Error("Prepared application close belongs to another application.");
      }
      signal?.throwIfAborted();
      WindowManager.validateCloseApplication(transaction.preparation, transaction.authority);
      return null;
    }
    const lease = WindowManager.beginApplicationClose(appId);
    try {
      return await WindowManager.requestCloseApplication(appId, { reason: "application-quit", signal }, lease);
    } finally {
      WindowManager.endApplicationClose(lease);
    }
  }

  function createLifecycleTransitionOperation<T extends LifecycleTransitionResult>(
    stage: LifecycleTransitionStage,
    appId: string,
    options: LifecycleRequestOptions,
    commit: (context: OperationContext<unknown, T>, reason: string) => T,
  ): RuntimeOperationHandle<T> {
    const reason = options.reason ?? `runtime.${stage}`;
    const payload = options.payload;
    let previousActiveAppId: string | null = null;
    const will: LifecycleOperationHook<T>[] = [
      async (context) => {
        previousActiveAppId = stage === "activate" ? RuntimeStore.getSnapshot().application.activeAppId : null;
        if (previousActiveAppId && previousActiveAppId !== appId && getState(previousActiveAppId) === "active") {
          await invokeLifecycleHook("suspend", "will", previousActiveAppId, context, payload, reason);
        }
      },
      async (context) => invokeLifecycleHook(stage, "will", appId, context, payload, reason),
    ];
    if (stage === "close") {
      will.push(async (context) => {
        const closeResult = await closeApplicationWindows(appId, context.signal, options.closeTransaction);
        if (closeResult && closeResult.outcome !== "closed") {
          throw new Error(`Application "${appId}" quit was ${closeResult.outcome} while closing its windows.`);
        }
      });
    }
    const effects: Array<{
      readonly onError: "continue";
      readonly run: (context: OperationContext<unknown, T>, value: T) => void | Promise<void>;
    }> = [];
    if (stage === "suspend" || stage === "close") {
      effects.push({
        onError: "continue",
        run: () => {
          Caches.prune({ reason: "suspend" });
        },
      });
    }
    const did: Array<{
      readonly onError: "continue" | "stop";
      readonly run: LifecycleOperationDidHook<T>;
    }> = [];
    if (stage === "activate") {
      did.push({
        onError: "continue",
        run: async (context) => {
          if (previousActiveAppId && previousActiveAppId !== appId) {
            await invokeLifecycleHook("suspend", "did", previousActiveAppId, context, payload, reason);
          }
        },
      });
    }
    did.push({
      onError: "stop",
      run: async (context) => invokeLifecycleHook(stage, "did", appId, context, payload, reason),
    });
    return Operations.run<unknown, T>({
      kind: `lifecycle.${stage}`,
      input: payload,
      timeoutMs: lifecycleOperationTimeout(options),
      correlationId: options.correlationId,
      supersedeKey: "lifecycle.transition",
      validate: () => {
        const state = getState(appId);
        if (!AppRegistry.getApp(appId)) return { ok: false, code: "app-not-found", reason: `No app is registered for ${appId}.` };
        if (stage === "activate") {
          const access = validateLifecycleAccess(appId, stage);
          if (!access.ok) return access;
        }
        return legalLifecycleState(stage, state)
          ? { ok: true }
          : { ok: false, code: "illegal-lifecycle-state", reason: `Cannot ${stage} ${appId} from ${state}.` };
      },
      will,
      commit: async (context) => {
        options.commitGuard?.();
        context.throwIfCancelled();
        if (stage === "close" && options.closeTransaction) {
          await WindowManager.commitCloseApplication(options.closeTransaction.preparation, options.closeTransaction.authority);
        }
        const value = commit(context, reason);
        const bundle = BundleLoader.getBundle(appId);
        if (bundle) {
          const at = runtime.environment.now();
          recordLifecycleOperation({
            runtimeId: runtime.runtimeId,
            appId,
            packageName: bundle.manifest.packageName,
            operationId: context.operationId,
            correlationId: context.correlationId,
            stage,
            phase: "commit",
            startedAt: at,
            endedAt: at,
            durationMs: 0,
            outcome: "completed",
            reason,
          });
        }
        return value;
      },
      effects: effects.length > 0 ? effects : undefined,
      did,
    });
  }

  const getState = (appId: string): SynCloudOSAppLifecycleState => RuntimeStore.getSnapshot().lifecycle[appId] ?? "registered";

  function launch(appId: string, options: LifecycleRequestOptions = {}): RuntimeOperationHandle<AppLaunchResult> {
    const reason = options.reason ?? "runtime.launch";
    const payload = options.payload;
    let previousActiveAppId: string | null = null;
    const will: LifecycleOperationHook<AppLaunchResult>[] = [
      async (context) => {
        await ensureRuntimeBundleLoaded(appId, context.signal, `SynCloudOS.Lifecycle.launch:${reason}`);
      },
      async (context) => {
        previousActiveAppId = RuntimeStore.getSnapshot().application.activeAppId;
        if (previousActiveAppId && previousActiveAppId !== appId && getState(previousActiveAppId) === "active") {
          await invokeLifecycleHook("suspend", "will", previousActiveAppId, context, payload, reason);
        }
      },
      async (context) => invokeLifecycleHook("launch", "will", appId, context, payload, reason),
      async (context) => invokeLifecycleHook("activate", "will", appId, context, payload, reason),
    ];
    const did: Array<{
      readonly onError: "continue";
      readonly run: LifecycleOperationDidHook<AppLaunchResult>;
    }> = [
      {
        onError: "continue",
        run: async (context) => {
          if (previousActiveAppId && previousActiveAppId !== appId) {
            await invokeLifecycleHook("suspend", "did", previousActiveAppId, context, payload, reason);
          }
        },
      },
      {
        onError: "continue",
        run: async (context) => invokeLifecycleHook("launch", "did", appId, context, payload, reason),
      },
      {
        onError: "continue",
        run: async (context) => invokeLifecycleHook("activate", "did", appId, context, payload, reason),
      },
    ];
    const handle = Operations.run<unknown, AppLaunchResult>({
      kind: "lifecycle.launch",
      input: payload,
      timeoutMs: lifecycleOperationTimeout(options),
      correlationId: options.correlationId,
      supersedeKey: "lifecycle.transition",
      validate: () => {
        options.commitGuard?.();
        const state = getState(appId);
        if (!AppRegistry.getApp(appId)) return { ok: false, code: "app-not-found", reason: `No app is registered for ${appId}.` };
        const access = validateLifecycleAccess(appId, "launch");
        if (!access.ok) return access;
        return legalLifecycleState("launch", state)
          ? { ok: true }
          : { ok: false, code: "illegal-lifecycle-state", reason: `Cannot launch ${appId} from ${state}.` };
      },
      will,
      commit: async (context) => {
        options.commitGuard?.();
        context.throwIfCancelled();
        const result = commitLifecycleState<AppLaunchResult>(appId, "active", "launch", reason, (transition) => {
          options.onCommit?.();
          context.markCommitted(transition);
        }, options.routePath);
        const bundle = BundleLoader.getBundle(appId);
        if (bundle) {
          const at = runtime.environment.now();
          recordLifecycleOperation({
            runtimeId: runtime.runtimeId,
            appId,
            packageName: bundle.manifest.packageName,
            operationId: context.operationId,
            correlationId: context.correlationId,
            stage: "launch",
            phase: "commit",
            startedAt: at,
            endedAt: at,
            durationMs: 0,
            outcome: "completed",
            reason,
          });
        }
        return result.transition;
      },
      did,
    });
    return linkExternalSignal(retainOperation(handle), options.signal);
  }

  function activate(appId: string, options: LifecycleRequestOptions = {}): RuntimeOperationHandle<AppActivationResult> {
    const handle = createLifecycleTransitionOperation<AppActivationResult>(
      "activate",
      appId,
      options,
      (context, reason) => {
        const result = commitLifecycleState<AppActivationResult>(appId, "active", "activate", reason, (transition) => {
          options.onCommit?.();
          context.markCommitted(transition);
        }, options.routePath);
        return result.transition;
      },
    );
    return linkExternalSignal(retainOperation(handle), options.signal);
  }

  function suspend(appId: string, options: LifecycleRequestOptions = {}): RuntimeOperationHandle<AppSuspensionResult> {
    const handle = createLifecycleTransitionOperation<AppSuspensionResult>(
      "suspend",
      appId,
      options,
      (context, reason) => {
        const result = commitLifecycleState<AppSuspensionResult>(appId, "suspended", "suspend", reason, (transition) => {
          options.onCommit?.();
          context.markCommitted(transition);
        });
        return result.transition;
      },
    );
    return linkExternalSignal(retainOperation(handle), options.signal);
  }

  function close(appId: string, options: LifecycleRequestOptions = {}): RuntimeOperationHandle<AppCloseResult> {
    const handle = createLifecycleTransitionOperation<AppCloseResult>(
      "close",
      appId,
      options,
      (context, reason) => {
        const result = commitLifecycleState<AppCloseResult>(appId, "closed", "close", reason, (transition) => context.markCommitted(transition));
        return result.transition;
      },
    );
    return linkExternalSignal(handle, options.signal);
  }

  function dispatch<TPayload>(
    stage: SynCloudOSLifecycleStage,
    appId: string,
    payload: TPayload,
    options: LifecycleRequestOptions = {},
  ): RuntimeOperationHandle<LifecycleDispatchResult> {
    const reason = options.reason ?? `runtime.${stage}`;
    const handle = Operations.run<TPayload, LifecycleDispatchResult>({
      kind: `lifecycle.${stage}`,
      input: payload,
      timeoutMs: lifecycleOperationTimeout(options),
      correlationId: options.correlationId,
      validate: () => AppRegistry.getApp(appId)
        ? { ok: true }
        : { ok: false, code: "app-not-found", reason: `No app is registered for ${appId}.` },
      will: [async (context) => invokeLifecycleHook(stage, "will", appId, context, payload, reason)],
      commit: (context) => {
        const value = { runtimeId: runtime.runtimeId, appId, stage, payload, reason };
        context.markCommitted(value);
        return value;
      },
      effects: stage === "memoryWarning"
        ? [{
            onError: "continue",
            run: () => {
              Caches.prune({ reason: "memory-warning" });
              // The warned application's cache-only content goes first, then
              // anything above the runtime's soft budget. Active work stays.
              dependencies.resources?.relieve({ reason: "memory-warning", owner: appId });
              dependencies.resources?.enforceBudget("memory-warning");
              dependencies.performance?.reportMemoryPressure();
            },
          }]
        : undefined,
      did: [{
        onError: "stop",
        run: async (context) => invokeLifecycleHook(stage, "did", appId, context, payload, reason),
      }],
    });
    return linkExternalSignal(handle, options.signal);
  }

  const lifecycle: SynCloudOSLifecycleNamespace = {
    states: lifecycleStates,

    on(name: SynCloudOSLifecycleEventName, listener: SynCloudOSLifecycleListener) {
      return EventBus.subscribe(resolve(name), listener);
    },

    once(name: SynCloudOSLifecycleEventName, listener: SynCloudOSLifecycleListener) {
      return EventBus.once(resolve(name), listener);
    },

    off(name: SynCloudOSLifecycleEventName, listener: SynCloudOSLifecycleListener) {
      return EventBus.unsubscribe(resolve(name), listener);
    },

    emit(name: SynCloudOSLifecycleEventName, payload?: unknown, label?: string) {
      return EventBus.publish(resolve(name), payload, label);
    },

    onBoot(listener: SynCloudOSLifecycleListener) {
      return this.on("runtime.boot.begin", listener);
    },

    onReady(listener: SynCloudOSLifecycleListener) {
      return this.on("runtime.boot.complete", listener);
    },

    onAppRegister(listener: SynCloudOSLifecycleListener) {
      return this.on("app.register", listener);
    },

    onAppLaunch(listener: SynCloudOSLifecycleListener) {
      return this.on("app.launch.requested", listener);
    },

    onRouteOpen(listener: SynCloudOSLifecycleListener) {
      return this.on("route.open", listener);
    },

    onStateTransition(listener: SynCloudOSLifecycleListener) {
      return this.on("statechart.transition.complete", listener);
    },

    onPolicyDecision(listener: SynCloudOSLifecycleListener) {
      return this.on("policy.decision", listener);
    },

    onError(listener: SynCloudOSLifecycleListener) {
      return this.on("error.capture", listener);
    },

    canTransition(from, to) {
      return AppLifecycle.canTransition(from, to);
    },

    getState,

    getRecord(appId) {
      return RuntimeStore.getSnapshot().managers[appId] ?? null;
    },

    getEvents(appId, limit) {
      const events = appId
        ? RuntimeStore.getSnapshot().lifecycleEvents.filter((event) => event.appId === appId)
        : RuntimeStore.getSnapshot().lifecycleEvents;
      return typeof limit === "number" ? events.slice(-limit) : events;
    },

    transition(appId, to, options: SynCloudOSLifecycleTransitionOptions = {}): SynCloudOSLifecycleTransitionResult {
      const appInfo = RuntimeStore.getSnapshot().appInfo[appId];
      if (!appInfo) {
        const error = `No registered app found for ${appId}.`;
        EventBus.publish("lifecycle.transition.failed", { appId, to, error, options }, appId);
        ErrorManager.createAppNotFoundError(appId, {
          source: options.source ?? "SynCloudOS.Lifecycle.transition",
          lifecycleTarget: to,
        });
        return { ok: false, error };
      }

      const from = getState(appId);
      EventBus.publish("lifecycle.transition.requested", { appId, from, to, options }, appInfo.packageName);

      if (to === "launching" || to === "active") {
        const error = lifecycleAccessFailure(appId, to, options);
        if (error) return { ok: false, error };
      }

      if (!options.force && !AppLifecycle.canTransition(from, to)) {
        const error = `Lifecycle cannot transition from ${from} to ${to}.`;
        EventBus.publish("lifecycle.transition.failed", { appId, from, to, error, options }, appInfo.packageName);
        ErrorManager.capture({
          code: "APP_LAUNCH_FAILED",
          title: `${appInfo.packageName} refused a lifecycle transition.`,
          message: `SynCloudOS could not move ${appInfo.displayName} from ${from} to ${to}.`,
          appId,
          source: options.source ?? "SynCloudOS.Lifecycle.transition",
          technicalMessage: options.reason ?? error,
          context: { appId, from, to, options },
        });
        return { ok: false, error };
      }

      const reason = options.reason ?? `lifecycle.${to}`;
      const stage: SynCloudOSLifecycleStage = to === "active"
        ? "activate"
        : to === "suspended"
          ? "suspend"
          : to === "closed"
            ? "close"
            : to === "loading" || to === "ready"
              ? "preload"
              : "register";
      const result = commitLifecycleState(appId, to, stage, reason);
      EventBus.publish("app.lifecycle.transition", { ...result.event, source: options.source }, appInfo.packageName);
      return { ok: true, event: result.event };
    },

    onTransition(listener: SynCloudOSLifecycleTransitionListener, options: SynCloudOSLifecycleSubscribeOptions = {}) {
      if (options.replay) {
        this.getEvents(options.appId).forEach((event) => listener(event));
      }

      return EventBus.subscribe("app.lifecycle.transition", (runtimeEvent) => {
        const event = eventFromPayload(runtimeEvent.payload, runtimeEvent.at);
        if (!event) return;
        if (options.appId && event.appId !== options.appId) return;
        listener(event, runtimeEvent);
      });
    },
  };

  const ownedLifecycle: LifecycleService = {
    runtimeId: runtime.runtimeId,
    ...lifecycle,
    validateAccess: validateLifecycleAccess,
    launch,
    activate,
    suspend,
    close,
    dispatch,
    getManager(appId: string) {
      const manager = AppManagerController.getManagerForApp(appId);
      if (manager) return manager;
      return {
        runtimeId: runtime.runtimeId,
        appId,
        getState: () => getState(appId),
        dispose() {
        },
      };
    },
    cancelActiveOperations(reason: string) {
      for (const operation of activeOperations) operation.cancel(reason);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const operation of activeOperations) operation.cancel("runtime-disposed");
      activeOperations.clear();
    },
  };

  return ownedLifecycle;
}
