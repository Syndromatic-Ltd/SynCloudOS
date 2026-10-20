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
import { createBrowserRoutePlatform } from "../PlatformAdapters/BrowserRoutePlatform";
import type {
  SynCloudOSAppManagerController,
  SynCloudOSAppRegistry,
  SynCloudOSErrorManager,
  SynCloudOSLaunchServices,
  SynCloudOSRuntime,
  SynCloudOSStatechart,
  SynCloudOSWebspringChoreography,
  SynCloudOSWebspringStateController,
} from "../Runtime/runtimeInstanceTypes";
import type {
  SynCloudOSStateDefinition,
  SynCloudOSStateName,
  SynCloudOSStateTransitionExplanation,
  SynCloudOSStateTransitionOptions,
  SynCloudOSStateTransitionRecord
} from "./statechartTypes";

type StatechartApplicationState = {
  clearMultiSwitch(id?: string | null): void;
  setRoutePath(pathname: string): void;
  setPendingApp(appId: string | null): void;
  setActiveApp(appId: string | null): void;
};

type StatechartErrorManager = Pick<
  SynCloudOSErrorManager,
  "capture" | "getLatest" | "createAppNotFoundError" | "createAppLaunchFailedError"
>;

type StatechartTransitionObserver = (
  from: SynCloudOSStateName,
  to: SynCloudOSStateName,
  options: SynCloudOSStateTransitionOptions
) => void;

export function createStatechart(
  runtime: SynCloudOSRuntime,
  dependencies: {
    appRegistry: Pick<SynCloudOSAppRegistry, "getApp">;
    appManagerController: Pick<SynCloudOSAppManagerController, "getManagerForApp">;
    applicationState: StatechartApplicationState;
    webspringChoreography: Pick<SynCloudOSWebspringChoreography, "beginReturn">;
    errorManager: StatechartErrorManager;
    launchServices: Pick<SynCloudOSLaunchServices, "openApp">;
    webspringState: Pick<SynCloudOSWebspringStateController, "selectApp" | "setLaunching" | "coverForApp" | "hoverApp" | "returnToWebspring">;
    onTransition?: StatechartTransitionObserver;
  },
): SynCloudOSStatechart {
const AppRegistry = dependencies.appRegistry;
const ApplicationState = dependencies.applicationState;
const WebspringChoreography = dependencies.webspringChoreography;
const ErrorManager = dependencies.errorManager;
const EventBus = runtime.events;
const LaunchServices = dependencies.launchServices;
const RuntimeStore = runtime.store;
const WebspringState = dependencies.webspringState;
const onTransition = dependencies.onTransition;
const browserRoutes = createBrowserRoutePlatform(runtime.environment);
let transitionGeneration = 0;

const definitions: Record<SynCloudOSStateName, SynCloudOSStateDefinition> = {
  booting: {
    name: "booting",
    description: "SynCloudOS is registering services, apps, managers, and responsive observers.",
    allowedFrom: ["offline"]
  },
  "active.webspring": {
    name: "active.webspring",
    parent: "booting",
    description: "Webspring is the active public workspace.",
    allowedFrom: [
      "booting",
      "locked",
      "locked.loginWindow",
      "active.application",
      "active.application.loading",
      "active.application.ready",
      "active.application.active",
      "active.application.failed",
      "active.error"
    ]
  },
  "active.application": {
    name: "active.application",
    parent: "active.webspring",
    description: "An application workspace is being targeted or shown.",
    allowedFrom: [
      "booting",
      "active.webspring",
      "active.application",
      "active.application.loading",
      "active.application.ready",
      "active.application.active",
      "active.application.failed"
    ]
  },
  "active.application.loading": {
    name: "active.application.loading",
    parent: "active.application",
    description: "A pending app is loading its trusted bundle.",
    allowedFrom: ["active.application"]
  },
  "active.application.ready": {
    name: "active.application.ready",
    parent: "active.application",
    description: "The app bundle is ready to present.",
    allowedFrom: ["active.application.loading"]
  },
  "active.application.active": {
    name: "active.application.active",
    parent: "active.application",
    description: "A SynWare is active in an Atmo app frame.",
    allowedFrom: ["active.application.ready", "active.application.loading"]
  },
  "active.application.failed": {
    name: "active.application.failed",
    parent: "active.application",
    description: "Application launch failed.",
    allowedFrom: [
      "active.application",
      "active.application.loading",
      "active.application.ready",
      "active.application.active"
    ]
  },
  "active.error": {
    name: "active.error",
    parent: "active.webspring",
    description: "A runtime exception is being presented.",
    allowedFrom: [
      "booting",
      "active.webspring",
      "active.application",
      "active.application.loading",
      "active.application.ready",
      "active.application.active",
      "active.application.failed",
      "locked",
      "locked.loginWindow",
      "offline"
    ]
  },
  locked: {
    name: "locked",
    description: "SynCloudOS is visually locked pending LoginServices beta access.",
    allowedFrom: ["booting", "active.webspring", "active.error"]
  },
  "locked.loginWindow": {
    name: "locked.loginWindow",
    parent: "locked",
    description: "The early-access LoginWindow is active.",
    allowedFrom: ["booting", "locked", "active.webspring", "active.error"]
  },
  offline: {
    name: "offline",
    description: "Required runtime services are offline.",
    allowedFrom: [
      "booting",
      "active.webspring",
      "active.application",
      "active.application.loading",
      "active.application.ready",
      "active.application.active",
      "active.application.failed",
      "active.error",
      "locked",
      "locked.loginWindow"
    ]
  }
};

const applicationStates = new Set<SynCloudOSStateName>([
  "active.application",
  "active.application.loading",
  "active.application.ready",
  "active.application.active",
  "active.application.failed"
]);

function isApplicationState(stateName: SynCloudOSStateName) {
  return applicationStates.has(stateName);
}

function explainTransitionFrom(
  from: SynCloudOSStateName,
  to: SynCloudOSStateName
): SynCloudOSStateTransitionExplanation {
  const fromDefinition = definitions[from] ?? null;
  const toDefinition = definitions[to] ?? null;
  const blockers: string[] = [];

  if (!fromDefinition) blockers.push(`Unknown source state "${from}".`);
  if (!toDefinition) blockers.push(`Unknown target state "${to}".`);

  if (fromDefinition && toDefinition && from !== to) {
    if (from === "offline" && to !== "booting" && to !== "active.error") {
      blockers.push("Offline state can only return through booting or surface an active error.");
    }

    if (toDefinition.allowedFrom && !toDefinition.allowedFrom.includes(from)) {
      blockers.push(`${to} is only allowed from ${toDefinition.allowedFrom.join(", ")}.`);
    }
  }

  return {
    from,
    to,
    allowed: blockers.length === 0,
    reason: blockers.length === 0 ? `${from} can transition to ${to}.` : blockers.join(" "),
    blockers,
    fromDefinition,
    toDefinition
  };
}

function recordTransition(to: SynCloudOSStateName, options: SynCloudOSStateTransitionOptions, ok: boolean) {
  const snapshot = RuntimeStore.getSnapshot();
  const from = snapshot.statechart.currentState;
  const record: SynCloudOSStateTransitionRecord = {
    id: `statechart-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    from,
    to,
    at: Date.now(),
    source: options.source,
    appId: options.appId,
    pathname: options.pathname,
    reason: options.reason,
    ok
  };
  RuntimeStore.mutate((draft) => {
    draft.statechart.previousState = from;
    draft.statechart.currentState = to;
    draft.statechart.lastTransitionAt = record.at;
    draft.statechart.isTransitioning = false;
    draft.statechart.history.push(record);
    draft.statechart.history = draft.statechart.history.slice(-80);
  });
  return record;
}

function beginTransition(to: SynCloudOSStateName, options: SynCloudOSStateTransitionOptions) {
  const from = RuntimeStore.getSnapshot().statechart.currentState;
  RuntimeStore.mutate((draft) => {
    draft.statechart.isTransitioning = true;
  });
  EventBus.publish("statechart.transition.begin", { from, to, options }, `${from} -> ${to}`);
}

function completeTransition(record: SynCloudOSStateTransitionRecord) {
  EventBus.publish("statechart.transition.complete", record, `${record.from} -> ${record.to}`);
}

function recordApplicationPhase(to: SynCloudOSStateName, options: SynCloudOSStateTransitionOptions, ok: boolean) {
  const from = RuntimeStore.getSnapshot().statechart.currentState;
  const explanation = explainTransitionFrom(from, to);
  if (!explanation.allowed) {
    EventBus.publish("statechart.transition.failed", { to, options, explanation }, `${from} -> ${to}`);
    return null;
  }

  const record = recordTransition(to, options, ok);
  completeTransition(record);
  return record;
}

function failTransition(to: SynCloudOSStateName, options: SynCloudOSStateTransitionOptions, error: unknown) {
  const from = RuntimeStore.getSnapshot().statechart.currentState;
  const failureState = isApplicationState(from) || isApplicationState(to) ? "active.application.failed" : "active.error";
  const record = recordTransition(failureState, options, false);
  EventBus.publish("statechart.transition.failed", { to, options, error, record }, `${record.from} -> ${to}`);
  return error;
}

function returnToWebspring(from: SynCloudOSStateName, options: SynCloudOSStateTransitionOptions, generation: number) {
  const snapshot = RuntimeStore.getSnapshot();
  const activeAppId = snapshot.application.activeAppId;
  const activeApp = activeAppId ? AppRegistry.getApp(activeAppId) : null;
  const multiSwitch = snapshot.application.multiSwitch;
  const switchingAppIds = multiSwitch.status === "switching" ? [multiSwitch.fromAppId, multiSwitch.toAppId] : [];
  const appIds = Array.from(new Set([activeAppId, ...switchingAppIds]))
    .filter((appId): appId is string => Boolean(appId) && runtime.lifecycle.getState(appId!) === "active");
  const isAppViewReturn = Boolean(activeAppId) && activeApp?.presentation === "appView" && snapshot.application.openAppIds.includes(activeAppId!);
  const signal = options.lifecycle?.signal ?? runtime.signal;
  let begun = false;
  const begin = () => {
    if (begun) return;
    signal.throwIfAborted();
    if (generation !== transitionGeneration) throw new DOMException("The return transition was superseded.", "AbortError");
    options.lifecycle?.commitGuard?.();
    options.lifecycle?.onCommit?.();
    begun = true;
    beginTransition("active.webspring", options);
    if (isAppViewReturn && activeApp?.frame.presentationMotion !== "content" && RuntimeStore.getSnapshot().webspring.launchPhase !== "returning") {
      WebspringChoreography.beginReturn(activeAppId);
    }
  };
  const finish = () => {
    begin();
    if (multiSwitch.status === "switching" || multiSwitch.id) ApplicationState.clearMultiSwitch(multiSwitch.id);
    ApplicationState.setRoutePath("/");
    ApplicationState.setActiveApp(null);
    ApplicationState.setPendingApp(null);
    if (!isAppViewReturn) WebspringState.setLaunching(null);
    if (isAppViewReturn && activeApp?.frame.presentationMotion === "content") WebspringState.coverForApp(null);
    WebspringState.hoverApp(null);
    WebspringState.selectApp(null);
    WebspringState.returnToWebspring();
    if (options.syncRoute !== false) browserRoutes.syncRoute("/");
    EventBus.publish("workspace.returnToWebspring", { from, activeAppId }, "Webspring");
    const record = recordTransition("active.webspring", options, true);
    completeTransition(record);
    return record;
  };
  if (appIds.length === 0) return finish();
  return (async () => {
    for (const appId of appIds) {
      const result = await runtime.lifecycle.suspend(appId, {
        ...options.lifecycle,
        reason: options.reason ?? "Statechart.returnToWebspring",
        signal,
        onCommit: begin,
      }).result;
      if (generation !== transitionGeneration) return null;
      if (result.status !== "completed") {
        signal.throwIfAborted();
        throw new Error(result.status === "cancelled" ? result.reason : result.error.message);
      }
    }
    return finish();
  })().catch((error: unknown) => {
    if (!signal.aborted && generation === transitionGeneration) failTransition("active.webspring", options, error);
    return null;
  });
}

const statechart = {
  gotoState(stateName: SynCloudOSStateName, options: SynCloudOSStateTransitionOptions = {}) {
    const from = this.getCurrentState();
    onTransition?.(from, stateName, options);
    const transition = explainTransitionFrom(from, stateName);
    if (!transition.allowed) {
      const error = ErrorManager.capture({
        code: "UNKNOWN_RUNTIME_ERROR",
        title: "SynCloudOS refused a state transition.",
        message: `Statechart cannot transition from ${from} to ${stateName}.`,
        technicalMessage: `SynCloudOS.Statechart.gotoState("${stateName}") failed canTransition(${from}, ${stateName}).`,
        source: "SynCloudOS.Statechart.gotoState",
        context: { from, to: stateName, options, transition }
      });
      failTransition(stateName, options, error);
      return null;
    }

    const generation = ++transitionGeneration;
    const previousStatechart = RuntimeStore.getSnapshot().statechart;

    try {
      if (stateName === "active.webspring") {
        return returnToWebspring(from, options, generation);
      }
      beginTransition(stateName, options);

      if (stateName === "active.application" || stateName === "active.application.loading" || stateName === "active.application.active") {
        if (!options.appId) {
          throw ErrorManager.createAppNotFoundError("unknown", { source: "SynCloudOS.Statechart.gotoState", reason: "missing appId" });
        }
        const app = AppRegistry.getApp(options.appId);
        if (!app) {
          throw ErrorManager.createAppNotFoundError(options.appId, { source: "SynCloudOS.Statechart.gotoState", statechartTarget: stateName });
        }
        WebspringState.selectApp(app.bundleIdentifier);
        const targetOptions = {
          ...options,
          appId: app.bundleIdentifier,
          pathname: options.pathname ?? app.route
        };
        const targetRecord = recordTransition("active.application", targetOptions, true);
        completeTransition(targetRecord);
        const launchSource = options.source === "webspring" || options.source === "route" || options.source === "boot" || options.source === "developer" || options.source === "notification" || options.source === "workspace"
          ? options.source
          : "statechart";
        let launchFailedSynchronously = false;
        const manager = LaunchServices.openApp(app.bundleIdentifier, {
          source: launchSource,
          focus: options.focus ?? true,
          syncRoute: options.syncRoute,
          context: options.context,
          lifecycle: options.lifecycle,
          statechart: {
            onRequested: (request) => options.onLaunchRequest?.(request.requestId),
            onCancelled: () => {
              if (generation !== transitionGeneration || runtime.signal.aborted) return;
              const current = RuntimeStore.getSnapshot();
              if (normalizeBundleIdentifier(current.application.activeAppId) === normalizeBundleIdentifier(app.bundleIdentifier)) return;
              RuntimeStore.mutate((draft) => { draft.statechart = { ...previousStatechart, history: [...previousStatechart.history] }; });
            },
            onLoading: () => {
              if (RuntimeStore.getSnapshot().statechart.currentState !== "active.application") {
                recordApplicationPhase("active.application", targetOptions, true);
              }
              recordApplicationPhase("active.application.loading", targetOptions, true);
            },
            onReady: () => {
              recordApplicationPhase("active.application.ready", targetOptions, true);
            },
            onActive: () => {
              recordApplicationPhase("active.application.active", targetOptions, true);
            },
            onFailed: (_request: unknown, error: unknown) => {
              launchFailedSynchronously = true;
              recordApplicationPhase("active.application.failed", {
                ...targetOptions,
                reason: error instanceof Error ? error.message : String(error)
              }, false);
            }
          }
        });
        if (!manager) {
          if (launchFailedSynchronously) return null;
          if (ErrorManager.getLatest()?.code === "UNRECOVERABLE_LOGIN_SESSION_MISMATCH") {
            const failedRecord = recordTransition("active.application.failed", options, false);
            completeTransition(failedRecord);
            return null;
          }
          throw ErrorManager.createAppLaunchFailedError(app, new Error("LaunchServices returned null."), { source: "SynCloudOS.Statechart.gotoState" });
        }
        return manager;
      }

      if (stateName === "active.error") {
        const error = options.error instanceof Error
          ? ErrorManager.capture({
              code: "UNKNOWN_RUNTIME_ERROR",
              title: "SynCloudOS ran into a problem.",
              message: "An unexpected error occurred. Some features may not work as expected.",
              error: options.error,
              source: options.source ?? "SynCloudOS.Statechart.gotoState",
              context: options.context
            })
          : options.error;
        const record = recordTransition(stateName, options, true);
        completeTransition(record);
        return error ?? ErrorManager.getLatest();
      }

      const record = recordTransition(stateName, options, true);
      completeTransition(record);
      return record;
    } catch (error) {
      failTransition(stateName, options, error);
      if (!RuntimeStore.getSnapshot().errors.length && !(error && typeof error === "object" && "code" in error)) {
        ErrorManager.capture({
          code: "UNKNOWN_RUNTIME_ERROR",
          title: "SynCloudOS could not finish that.",
          message: "Something went wrong while switching screens. Please try again.",
          error,
          technicalMessage: `Statechart failed while moving to ${stateName}.`,
          source: "SynCloudOS.Statechart.gotoState",
          context: { stateName, options }
        });
      }
      return null;
    }
  },

  getCurrentState() {
    return RuntimeStore.getSnapshot().statechart.currentState;
  },

  getPreviousState() {
    return RuntimeStore.getSnapshot().statechart.previousState;
  },

  getHistory() {
    return RuntimeStore.getSnapshot().statechart.history;
  },

  canTransition(from: SynCloudOSStateName, to: SynCloudOSStateName) {
    return explainTransitionFrom(from, to).allowed;
  },

  explainTransition(fromOrTo: SynCloudOSStateName, maybeTo?: SynCloudOSStateName) {
    const from = maybeTo ? fromOrTo : this.getCurrentState();
    const to = maybeTo ?? fromOrTo;
    return explainTransitionFrom(from, to);
  },

  inspect(stateName?: SynCloudOSStateName) {
    const inspectedState = stateName ?? RuntimeStore.getSnapshot().statechart.currentState;
    const snapshot = RuntimeStore.getSnapshot().statechart;
    const allowedTransitions = (Object.keys(definitions) as SynCloudOSStateName[])
      .map((to) => explainTransitionFrom(inspectedState, to))
      .filter((transition) => transition.allowed);

    return {
      ...snapshot,
      inspectedState,
      activeDefinition: definitions[inspectedState] ?? null,
      allowedTransitions,
      definitions
    };
  },

  getStateDefinition(stateName: SynCloudOSStateName) {
    return definitions[stateName] ?? null;
  },

  getStateDefinitions() {
    return definitions;
  }
};
return {
  runtimeId: runtime.runtimeId,
  ...statechart,
  dispose() {
  }
};
}
