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

import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";
import type { CapturedSynCloudOSError, SynCloudOSErrorPayload } from "./errorTypes";
import type { SynCloudOSRuntimeEventListenerFailure } from "../EventBus/EventBus";
import { createCapturedError, toTechnicalReport } from "./errorReport";

type ErrorApp = { readonly id: string; readonly packageName: string; readonly displayName: string };

export function createErrorManager(runtime: SynCloudOSRuntime, dependencies: { loginServices: any }) {
const RuntimeStore = runtime.store;
const EventBus = runtime.events;
const LoginServices = dependencies.loginServices;

const ERROR_HISTORY_LIMIT = 24;
const DEFAULT_DEDUPE_WINDOW_MS = 4000;
const recentErrorFingerprints = new Map<string, { id: string; at: number }>();

function packageList(appIds: string[]) {
  const apps = RuntimeStore.getSnapshot().appInfo;
  return appIds.map((appId) => apps[appId]?.packageName ?? appId);
}

/** Name and message for fingerprints and timeout classification only; the
 * captured identity comes from createCapturedError. */
function thrownSignature(error: unknown, messageHint?: unknown) {
  if (error instanceof Error) return { name: error.name || "Error", message: error.message };
  return { name: typeof error, message: typeof messageHint === "string" && messageHint.trim() ? messageHint : String(error) };
}

function browserContext() {
  const location = runtime.environment.browser.getLocation();
  const browserNavigator = runtime.environment.browser.getNavigator();
  return {
    browserUrl: location.href ?? null,
    userAgent: browserNavigator?.userAgent ?? null
  };
}

function createFingerprint(parts: unknown[]) {
  return parts.map((value) => value === null || value === undefined ? "" : String(value).replace(/\s+/g, " ").slice(0, 220)).join("|");
}

function summarizePayload(payload: unknown) {
  if (payload === undefined) return "undefined";
  try {
    return JSON.stringify(payload, (_key, value) => {
      if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
      if (value instanceof Error) return { name: value.name, message: value.message };
      return value;
    }).slice(0, 600);
  } catch {
    return String(payload).slice(0, 600);
  }
}

function describeResourceTarget(target: unknown) {
  if (!target || typeof target !== "object") {
    return {
      resourceTag: "unknown",
      resourceUrl: null
    };
  }

  const record = target as Record<string, unknown>;
  const tagName = typeof record.tagName === "string" ? record.tagName.toLowerCase() : target.constructor?.name ?? "unknown";
  const resourceUrl = typeof record.currentSrc === "string" && record.currentSrc
    ? record.currentSrc
    : typeof record.src === "string" && record.src
      ? record.src
      : typeof record.href === "string" && record.href
        ? record.href
        : null;

  return {
    resourceTag: tagName,
    resourceUrl
  };
}

function findRecentDuplicate(fingerprint: string | undefined, now: number) {
  if (!fingerprint) return null;
  const previous = recentErrorFingerprints.get(fingerprint);
  if (!previous || now - previous.at > DEFAULT_DEDUPE_WINDOW_MS) return null;
  return RuntimeStore.getSnapshot().errors.find((error) => error.id === previous.id) ?? null;
}

function rememberFingerprint(error: CapturedSynCloudOSError) {
  if (!error.fingerprint) return;
  recentErrorFingerprints.set(error.fingerprint, { id: error.id, at: error.at });

  const cutoff = error.at - DEFAULT_DEDUPE_WINDOW_MS;
  for (const [fingerprint, record] of recentErrorFingerprints.entries()) {
    if (record.at < cutoff) recentErrorFingerprints.delete(fingerprint);
  }
}

const errorManager = {
  runtimeId: runtime.runtimeId,
  capture(payload: SynCloudOSErrorPayload): CapturedSynCloudOSError {
    const now = runtime.environment.now();
    const duplicate = findRecentDuplicate(payload.fingerprint, now);
    if (duplicate) return duplicate;

    const snapshot = RuntimeStore.getSnapshot();
    const app = payload.appId ? snapshot.appInfo[payload.appId] : null;
    const captured = createCapturedError({
      ...payload,
      context: {
        currentStatechartState: snapshot.statechart.currentState,
        previousStatechartState: snapshot.statechart.previousState,
        registeredApps: Object.values(snapshot.appInfo).map((item) => item.packageName),
        displayApps: Object.values(snapshot.appInfo).filter((item) => item.webspring.visible).map((item) => item.packageName),
        activeAppId: snapshot.application.activeAppId,
        openApps: packageList(snapshot.application.openAppIds),
        routePath: snapshot.application.routePath,
        ...payload.context
      }
    }, {
      id: `error-${now}-${runtime.environment.randomUUID()}`,
      at: now,
      timestamp: new Date(now).toISOString(),
      runtimeId: runtime.runtimeId,
      appDisplayName: app?.displayName,
      defaults: {
        category: "runtime",
        severity: "error",
        recoverable: true,
        suggestedActions: ["returnToWebspring", "dismiss"],
        source: "SynCloudOS.errorManager.capture",
        ...(app ? { packageName: app.packageName } : {}),
      },
    });

    RuntimeStore.mutate((draft) => {
      draft.errors.push(captured);
      draft.errors = draft.errors.slice(-ERROR_HISTORY_LIMIT);
      draft.webspring.lowerShelfMode = "error";
    });
    rememberFingerprint(captured);
    EventBus.publish("error.capture", { errorId: captured.id, code: captured.code, appId: captured.appId }, captured.code);

    return captured;
  },

  getLatest() {
    const errors = RuntimeStore.getSnapshot().errors;
    return errors[errors.length - 1] ?? null;
  },

  getHistory() {
    return RuntimeStore.getSnapshot().errors;
  },

  createAppNotFoundError(appId: string, context: Record<string, unknown> = {}) {
    const snapshot = RuntimeStore.getSnapshot();
    return this.capture({
      code: "APP_NOT_FOUND",
      title: "Webspring could not open that app.",
      message: `SynCloudOS could not find an app registered as "${appId}".`,
      technicalMessage: `SynCloudOS.LaunchServices.openApp("${appId}") failed because AppRegistry.getApp returned null.`,
      source: String(context.source ?? "SynCloudOS.LaunchServices.openApp"),
      severity: "error",
      recoverable: true,
      suggestedActions: ["returnToWebspring", "dismiss"],
      statechartFrom: snapshot.statechart.previousState ?? undefined,
      statechartTo: snapshot.statechart.currentState,
      context: {
        requestedAppId: appId,
        stackHint: [
          "SynCloudOS.WorkspaceController.openApp",
          "SynCloudOS.Statechart.gotoState",
          "SynCloudOS.LaunchServices.openApp",
          "SynCloudOS.AppRegistry.getApp"
        ],
        ...context
      }
    });
  },

  createRouteNotFoundError(pathname: string, context: Record<string, unknown> = {}) {
    return this.capture({
      code: "ROUTE_NOT_FOUND",
      title: "Webspring could not find that route.",
      message: "SynCloudOS could not match the requested address to a registered SynWare.",
      technicalMessage: `SynCloudOS.RouteManager.resolveRoute("${pathname}") returned route.notFound.`,
      route: pathname,
      source: "SynCloudOS.RouteManager.openRoute",
      suggestedActions: ["returnToWebspring", "dismiss"],
      context: { pathname, ...context }
    });
  },

  createAppLaunchFailedError(app: ErrorApp | null, error: unknown, context: Record<string, unknown> = {}) {
    const signature = thrownSignature(error);
    if (signature.name === "TimeoutError" || signature.name === "OperationTimeoutError"
      || signature.name === "RouteDataTimeoutError") {
      return this.createNotRespondingError(app, { ...context, reason: "operation-timeout", technicalMessage: signature.message });
    }
    return this.capture({
      code: "APP_LAUNCH_FAILED",
      title: `Webspring could not open ${app?.packageName ?? "that app"}.`,
      error,
      appId: app?.id,
      packageName: app?.packageName,
      source: String(context.source ?? "SynCloudOS.LaunchServices.openApp"),
      suggestedActions: ["returnToWebspring", "dismiss"],
      category: "app",
      context
    });
  },

  createNotRespondingError(app: ErrorApp | null, context: Record<string, unknown> = {}, retry?: () => void) {
    const siteName = typeof context.siteName === "string" && context.siteName.trim() ? context.siteName.trim() : "Webspring";
    const reason = context.reason ?? "request-timeout";
    const message = reason === "main-thread-stall"
      ? "The interface stopped answering its responsiveness checks. It is responding again; you can continue or reload."
      : reason === "operation-timeout"
        ? "The application did not finish its operation within the allowed time. You can return to Webspring and try again."
        : "The server did not reply within the allowed time. You can try again or check your connection.";
    return this.capture({
      code: app ? "APP_NOT_RESPONDING" : "SITE_NOT_RESPONDING",
      title: `${app?.displayName ?? siteName} has stopped responding.`,
      message,
      appId: app?.id,
      packageName: app?.packageName,
      category: app ? "app" : "watchdog",
      severity: "warning",
      recoverable: true,
      suggestedActions: retry ? ["retry", "dismiss"] : app ? ["returnToWebspring", "dismiss"] : ["reload", "dismiss"],
      retry,
      source: String(context.source ?? "SynCloudOS.ErrorManager.responsiveness"),
      technicalMessage: String(context.technicalMessage ?? reason),
      fingerprint: typeof context.fingerprint === "string" ? context.fingerprint : undefined,
      context: { ...context, reason, scope: app ? "app" : "site" },
    });
  },

  createConnectionError(app: ErrorApp | null, error: unknown, context: Record<string, unknown> = {}, retry?: () => void) {
    return this.capture({
      code: "CONNECTION_ERROR",
      title: "Connection Error",
      message: context.reason === "offline"
        ? "Your browser reports that it is offline. Check your connection and try again."
        : "Could not connect to the server. Check your connection and try again.",
      appId: app?.id,
      packageName: app?.packageName,
      category: app ? "app" : "resource",
      severity: "warning",
      recoverable: true,
      suggestedActions: retry ? ["retry", "dismiss"] : ["dismiss"],
      retry,
      technicalMessage: thrownSignature(error).message,
      source: String(context.source ?? "SynCloudOS.ErrorManager.connection"),
      fingerprint: typeof context.fingerprint === "string" ? context.fingerprint : undefined,
      context: { ...context, scope: app ? "app" : "site" },
    });
  },

  /** An app's rendering boundary caught `error`. */
  createAppContentFailedError(app: ErrorApp | null, error: unknown, context: Record<string, unknown> = {}) {
    return this.capture({
      code: "APP_CONTENT_FAILED",
      title: `${app?.displayName ?? "A SynWare"} stopped unexpectedly.`,
      error,
      appId: app?.id,
      packageName: app?.packageName,
      source: String(context.source ?? "SynCloudOS.AppWatchdog"),
      severity: "fatal",
      recoverable: false,
      suggestedActions: ["returnToWebspring"],
      category: "app",
      context: {
        watchdog: context.watchdog ?? "appPresentation",
        ...context
      }
    });
  },

  /** The root rendering boundary caught `error`. */
  createRuntimeRenderError(error: unknown, context: Record<string, unknown> = {}) {
    return this.capture({
      code: "UNKNOWN_RUNTIME_ERROR",
      title: "Webspring stopped because of an error.",
      error,
      source: String(context.source ?? "SynCloudOS.RootWatchdog"),
      severity: "fatal",
      recoverable: false,
      suggestedActions: ["reload"],
      category: "watchdog",
      context: {
        watchdog: context.watchdog ?? "root",
        ...context
      }
    });
  },

  /** `error` is the ErrorEvent's error object; browsers omit it for some
   * script errors, leaving only `context.message`. */
  createGlobalScriptError(error: unknown, context: Record<string, unknown> = {}) {
    const signature = thrownSignature(error, context.message);
    const browser = browserContext();
    const thrown = error !== undefined && error !== null;
    const fingerprint = String(context.fingerprint ?? createFingerprint([
      "global-script",
      signature.name,
      signature.message,
      context.filename,
      context.lineno,
      context.colno,
      browser.browserUrl
    ]));

    return this.capture({
      code: "GLOBAL_SCRIPT_ERROR",
      title: "SynCloudOS caught a global script error.",
      ...(thrown ? { error } : {
        message: "A browser-level script error escaped the runtime watchdogs.",
        technicalMessage: typeof context.message === "string" && context.message ? context.message : "The browser reported a script error without an error object.",
      }),
      source: String(context.source ?? "SynCloudOS.GlobalWatchdog.error"),
      severity: "fatal",
      recoverable: false,
      suggestedActions: ["reload"],
      fingerprint,
      category: "watchdog",
      context: {
        ...browser,
        watchdog: context.watchdog ?? "SynCloudOS GlobalWatchdog",
        eventType: context.eventType ?? "error",
        ...context
      }
    });
  },

  createUnhandledPromiseRejectionError(reason: unknown, context: Record<string, unknown> = {}) {
    const signature = thrownSignature(reason, context.message);
    const browser = browserContext();
    const fingerprint = String(context.fingerprint ?? createFingerprint([
      "unhandled-rejection",
      signature.name,
      signature.message,
      browser.browserUrl
    ]));

    return this.capture({
      code: "UNHANDLED_PROMISE_REJECTION",
      title: "SynCloudOS caught an unhandled promise rejection.",
      ...(reason === undefined ? {
        message: "An asynchronous runtime operation failed without handling its rejection.",
        technicalMessage: "The promise rejected without a reason.",
      } : { error: reason }),
      source: String(context.source ?? "SynCloudOS.GlobalWatchdog.unhandledrejection"),
      severity: "fatal",
      recoverable: false,
      suggestedActions: ["reload"],
      fingerprint,
      category: "watchdog",
      context: {
        ...browser,
        watchdog: context.watchdog ?? "SynCloudOS GlobalWatchdog",
        eventType: context.eventType ?? "unhandledrejection",
        ...context
      }
    });
  },

  createRuntimeEventListenerFailedError(error: unknown, context: Record<string, unknown> = {}) {
    const signature = thrownSignature(error);
    const fingerprint = String(context.fingerprint ?? createFingerprint([
      "event-listener",
      context.eventType,
      context.listenerKind,
      context.listenerIndex,
      signature.name,
      signature.message
    ]));

    return this.capture({
      code: "RUNTIME_EVENT_LISTENER_FAILED",
      title: "SynCloudOS caught a runtime event listener failure.",
      error,
      technicalDetails: [
        typeof context.eventType === "string" ? `Event: ${context.eventType}` : null,
        typeof context.listenerKind === "string" ? `Listener: ${context.listenerKind}${typeof context.listenerIndex === "number" ? ` #${context.listenerIndex}` : ""}` : null,
        typeof context.payloadSummary === "string" ? `Payload: ${context.payloadSummary}` : null,
      ].filter(Boolean).join("\n"),
      source: String(context.source ?? "SynCloudOS.EventBus.notify"),
      severity: "error",
      recoverable: true,
      suggestedActions: ["dismiss"],
      fingerprint,
      category: "event",
      context: {
        watchdog: context.watchdog ?? "SynCloudOS EventBus",
        ...context
      }
    });
  },

  createAssetLoadFailedError(target: unknown, context: Record<string, unknown> = {}) {
    const resource = describeResourceTarget(target);
    const browser = browserContext();
    const fingerprint = String(context.fingerprint ?? createFingerprint([
      "asset-load",
      resource.resourceTag,
      resource.resourceUrl,
      browser.browserUrl
    ]));

    return this.capture({
      code: "ASSET_LOAD_FAILED",
      title: "SynCloudOS could not load a visual asset.",
      message: "A page resource failed to load. SynCloudOS can keep running, but part of the interface may be incomplete.",
      technicalMessage: `${resource.resourceTag}${resource.resourceUrl ? ` ${resource.resourceUrl}` : ""}`,
      source: String(context.source ?? "SynCloudOS.GlobalWatchdog.resource"),
      severity: "warning",
      recoverable: true,
      suggestedActions: ["dismiss"],
      fingerprint,
      category: "resource",
      context: {
        ...browser,
        watchdog: context.watchdog ?? "SynCloudOS GlobalWatchdog",
        eventType: context.eventType ?? "error",
        ...resource,
        ...context
      }
    });
  },

  createFeatureNotImplementedError(featureId: string, context: Record<string, unknown> = {}) {
    return this.capture({
      code: "FEATURE_NOT_IMPLEMENTED",
      title: "That feature is not available yet.",
      message: "SynCloudOS received the system action, but the requested feature has not been implemented yet.",
      technicalMessage: `SynCloudOS attempted to present "${featureId}", but no implementation is registered.`,
      source: String(context.source ?? "SynCloudOS.errorManager.createFeatureNotImplementedError"),
      severity: "warning",
      recoverable: true,
      suggestedActions: ["returnToWebspring", "dismiss"],
      category: "runtime",
      context: {
        featureId,
        implementationStatus: "notImplemented",
        ...context
      }
    });
  },

  createLoginSessionMismatchError(app: ErrorApp | null, context: Record<string, unknown> = {}) {
    const snapshot = RuntimeStore.getSnapshot();
    const loginSession = LoginServices.getSnapshot();
    const siteName = typeof context.siteName === "string" && context.siteName.trim()
      ? context.siteName.trim()
      : "Webspring";
    const reason = typeof context.reason === "string" && context.reason.trim()
      ? context.reason.trim()
      : "The protected application launch was rejected because no authorised session is available.";
    return this.capture({
      code: "UNRECOVERABLE_LOGIN_SESSION_MISMATCH",
      title: `${siteName} has unexpectedly stopped.`,
      message: "An unexpected error has prevented this application from working properly.",
      appId: app?.id,
      packageName: app?.packageName,
      technicalMessage: reason,
      technicalDetails: [
        `Statechart: ${snapshot.statechart.currentState}`,
        `Session authority: ${loginSession.isAuthorised ? "authorised" : "not authorised"}`
      ].join("\n"),
      source: String(context.source ?? "SynCloudOS.LaunchServices.openApp"),
      severity: "fatal",
      recoverable: false,
      suggestedActions: ["reload", "dismiss"],
      category: "runtime",
      context: {
        requestedAppId: app?.id ?? context.requestedAppId ?? "unknown",
        requestedPackage: app?.packageName ?? null,
        currentStatechartState: snapshot.statechart.currentState,
        reason
      }
    });
  },

  toTechnicalReport(error: CapturedSynCloudOSError | null) {
    return toTechnicalReport(error);
  },

  dismiss(errorId: string) {
    const before = RuntimeStore.getSnapshot().errors.length;
    RuntimeStore.mutate((draft) => {
      draft.errors = draft.errors.filter((error) => error.id !== errorId);
      if (!draft.errors.length) draft.webspring.lowerShelfMode = draft.webspring.previewAppId ? "preview" : "news";
    });
    return RuntimeStore.getSnapshot().errors.length !== before;
  },

  clear() {
    RuntimeStore.mutate((draft) => {
      draft.errors = [];
      draft.webspring.lowerShelfMode = draft.webspring.previewAppId ? "preview" : "news";
    });
  },

  dispose() {
    recentErrorFingerprints.clear();
  }
};

(EventBus as typeof EventBus & { setFailureReporter(listener: (failure: SynCloudOSRuntimeEventListenerFailure) => void): void }).setFailureReporter((failure) => {
  errorManager.createRuntimeEventListenerFailedError(failure.error, {
    source: "SynCloudOS.EventBus.notify",
    eventId: failure.event.id,
    eventType: failure.event.type,
    eventLabel: failure.event.label,
    listenerIndex: failure.listenerIndex,
    listenerKind: failure.listenerKind,
    payloadSummary: summarizePayload(failure.event.payload)
  });
});

return errorManager;
}
