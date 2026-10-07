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

import type { RuntimeBrowserPort, SynCloudOSErrorManager, SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";
import type { CapturedSynCloudOSError, SynCloudOSErrorPayload } from "./errorTypes";
import type { SynCloudOSRuntimeEventListenerFailure } from "../EventBus/EventBus";

export function createErrorManager(runtime: SynCloudOSRuntime, dependencies: { loginServices: any }) {
const RuntimeStore = runtime.store;
const EventBus = runtime.events;
const LoginServices = dependencies.loginServices;

const ERROR_HISTORY_LIMIT = 24;
const DEFAULT_DEDUPE_WINDOW_MS = 4000;
const recentErrorFingerprints = new Map<string, { id: string; at: number }>();

interface NormalizedUnknownError {
  causeMessage?: string;
  causeStack?: string;
  message: string;
  name: string;
  stack?: string;
}

function packageList(appIds: string[]) {
  const apps = RuntimeStore.getSnapshot().appInfo;
  return appIds.map((appId) => apps[appId]?.packageName ?? appId);
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function normalizeUnknownError(error: unknown, messageHint?: unknown): NormalizedUnknownError {
  if (error instanceof Error) {
    const cause = "cause" in error ? (error as Error & { cause?: unknown }).cause : undefined;
    return {
      causeMessage: cause === undefined ? undefined : errorMessage(cause),
      causeStack: cause instanceof Error ? cause.stack : undefined,
      message: error.message || errorMessage(messageHint ?? error),
      name: error.name || "Error",
      stack: error.stack
    };
  }

  if (typeof messageHint === "string" && messageHint.trim()) {
    return {
      message: messageHint,
      name: typeof error
    };
  }

  return {
    message: errorMessage(error),
    name: typeof error
  };
}

function formatSourceLocation(context: Record<string, unknown> = {}) {
  const filename = typeof context.filename === "string" ? context.filename : "";
  const lineno = typeof context.lineno === "number" ? context.lineno : null;
  const colno = typeof context.colno === "number" ? context.colno : null;
  if (!filename && lineno === null && colno === null) return "";
  return `${filename || "unknown source"}:${lineno ?? "?"}:${colno ?? "?"}`;
}

function errorDetails(error: unknown, context: Record<string, unknown> = {}) {
  const normalized = normalizeUnknownError(error, context.message);
  const stack = normalized.stack ?? normalized.message;
  const componentStack = typeof context.componentStack === "string" ? context.componentStack.trim() : "";
  const sourceLocation = formatSourceLocation(context);
  return [
    stack,
    normalized.causeStack ? `Cause:\n${normalized.causeStack}` : normalized.causeMessage ? `Cause: ${normalized.causeMessage}` : null,
    componentStack ? `React component stack:\n${componentStack}` : null,
    sourceLocation ? `Source location: ${sourceLocation}` : null
  ].filter(Boolean).join("\n\n");
}

function browserContext() {
  const location = runtime.environment.browser.getLocation();
  const browserNavigator = runtime.environment.browser.getNavigator();
  return {
    browserUrl: location.href ?? null,
    userAgent: browserNavigator?.userAgent ?? null
  };
}

function compactPart(value: unknown) {
  if (value === null || value === undefined) return "none";
  return String(value).replace(/\s+/g, " ").slice(0, 220);
}

function createFingerprint(parts: unknown[]) {
  return parts.map(compactPart).join("|");
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
    const captured: CapturedSynCloudOSError = {
      runtimeId: runtime.runtimeId,
      category: "runtime",
      severity: "error",
      recoverable: true,
      suggestedActions: ["returnToWebspring", "dismiss"],
      source: "SynCloudOS.errorManager.capture",
      packageName: app?.packageName,
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
      },
      id: `error-${runtime.environment.now()}-${runtime.environment.randomUUID()}`,
      at: now,
      timestamp: new Date(now).toISOString()
    };

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
      technicalDetails: appId,
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
      technicalDetails: pathname,
      route: pathname,
      source: "SynCloudOS.RouteManager.openRoute",
      suggestedActions: ["returnToWebspring", "dismiss"],
      context: { pathname, ...context }
    });
  },

  createAppLaunchFailedError(app: { id: string; packageName: string; displayName: string } | null, error: unknown, context: Record<string, unknown> = {}) {
    const normalized = normalizeUnknownError(error);
    if (normalized.name === "TimeoutError" || normalized.name === "OperationTimeoutError"
      || normalized.name === "RouteDataTimeoutError") {
      return this.createNotRespondingError(app, { ...context, reason: "operation-timeout", technicalMessage: normalized.message });
    }
    return this.capture({
      code: "APP_LAUNCH_FAILED",
      title: `Webspring could not open ${app?.packageName ?? "that app"}.`,
      message: "SynCloudOS could not load the requested content.",
      appId: app?.id,
      packageName: app?.packageName,
      technicalMessage: normalized.message,
      technicalDetails: errorDetails(error, context),
      source: String(context.source ?? "SynCloudOS.LaunchServices.openApp"),
      suggestedActions: ["returnToWebspring", "dismiss"],
      category: "app",
      context
    });
  },

  createNotRespondingError(app: { id: string; packageName: string; displayName: string } | null, context: Record<string, unknown> = {}, retry?: () => void) {
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

  createConnectionError(app: { id: string; packageName: string; displayName: string } | null, error: unknown, context: Record<string, unknown> = {}, retry?: () => void) {
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
      technicalMessage: errorMessage(error),
      source: String(context.source ?? "SynCloudOS.ErrorManager.connection"),
      fingerprint: typeof context.fingerprint === "string" ? context.fingerprint : undefined,
      context: { ...context, scope: app ? "app" : "site" },
    });
  },

  createAppContentFailedError(app: { id: string; packageName: string; displayName: string } | null, error: unknown, context: Record<string, unknown> = {}) {
    return this.capture({
      code: "APP_CONTENT_FAILED",
      title: `${app?.packageName ?? "A SynWare"} stopped unexpectedly.`,
      message: "An unexpected error has prevented this application from working properly.",
      appId: app?.id,
      packageName: app?.packageName,
      technicalMessage: errorMessage(error),
      technicalDetails: errorDetails(error, context),
      source: String(context.source ?? "SynCloudOS.Watchdog"),
      severity: "fatal",
      recoverable: false,
      suggestedActions: ["returnToWebspring"],
      category: "app",
      context: {
        watchdog: context.watchdog ?? "appPresentation",
        componentStack: context.componentStack ?? null,
        ...context
      }
    });
  },

  createRuntimeRenderError(error: unknown, context: Record<string, unknown> = {}) {
    return this.capture({
      code: "UNKNOWN_RUNTIME_ERROR",
      title: "Webspring caught a runtime error.",
      message: "SynCloudOS caught an unexpected rendering error before it could blank the screen.",
      technicalMessage: errorMessage(error),
      technicalDetails: errorDetails(error, context),
      source: String(context.source ?? "SynCloudOS.RootWatchdog"),
      severity: "fatal",
      recoverable: false,
      suggestedActions: ["reload"],
      category: "watchdog",
      context: {
        watchdog: context.watchdog ?? "root",
        componentStack: context.componentStack ?? null,
        ...context
      }
    });
  },

  createGlobalScriptError(error: unknown, context: Record<string, unknown> = {}) {
    const normalized = normalizeUnknownError(error, context.message);
    const browser = browserContext();
    const sourceLocation = formatSourceLocation(context);
    const fingerprint = String(context.fingerprint ?? createFingerprint([
      "global-script",
      normalized.name,
      normalized.message,
      sourceLocation,
      browser.browserUrl
    ]));

    return this.capture({
      code: "GLOBAL_SCRIPT_ERROR",
      title: "SynCloudOS caught a global script error.",
      message: "A browser-level script error escaped the runtime watchdogs.",
      technicalMessage: normalized.message,
      technicalDetails: errorDetails(error, context),
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
        errorName: normalized.name,
        cause: normalized.causeMessage ?? null,
        ...context
      }
    });
  },

  createUnhandledPromiseRejectionError(reason: unknown, context: Record<string, unknown> = {}) {
    const normalized = normalizeUnknownError(reason, context.message);
    const browser = browserContext();
    const fingerprint = String(context.fingerprint ?? createFingerprint([
      "unhandled-rejection",
      normalized.name,
      normalized.message,
      browser.browserUrl
    ]));

    return this.capture({
      code: "UNHANDLED_PROMISE_REJECTION",
      title: "SynCloudOS caught an unhandled promise rejection.",
      message: "An asynchronous runtime operation failed without handling its rejection.",
      technicalMessage: normalized.message,
      technicalDetails: errorDetails(reason, context),
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
        errorName: normalized.name,
        cause: normalized.causeMessage ?? null,
        ...context
      }
    });
  },

  createRuntimeEventListenerFailedError(error: unknown, context: Record<string, unknown> = {}) {
    const normalized = normalizeUnknownError(error);
    const fingerprint = String(context.fingerprint ?? createFingerprint([
      "event-listener",
      context.eventType,
      context.listenerKind,
      context.listenerIndex,
      normalized.name,
      normalized.message
    ]));

    return this.capture({
      code: "RUNTIME_EVENT_LISTENER_FAILED",
      title: "SynCloudOS caught a runtime event listener failure.",
      message: "An EventBus subscriber failed while SynCloudOS was dispatching a runtime event.",
      technicalMessage: normalized.message,
      technicalDetails: errorDetails(error, context),
      source: String(context.source ?? "SynCloudOS.EventBus.notify"),
      severity: "error",
      recoverable: true,
      suggestedActions: ["dismiss"],
      fingerprint,
      category: "event",
      context: {
        watchdog: context.watchdog ?? "SynCloudOS EventBus",
        eventType: context.eventType ?? null,
        listenerKind: context.listenerKind ?? null,
        listenerIndex: context.listenerIndex ?? null,
        payloadSummary: context.payloadSummary ?? null,
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
      technicalMessage: `${resource.resourceTag}${resource.resourceUrl ? `: ${resource.resourceUrl}` : ""}`,
      technicalDetails: `Resource target: ${resource.resourceTag}\nResource URL: ${resource.resourceUrl ?? "unknown"}`,
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

  createLoginSessionMismatchError(app: { id: string; packageName: string; displayName: string } | null, context: Record<string, unknown> = {}) {
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
        `Reason: ${reason}`,
        `Requested app: ${app?.id ?? "unknown"} (${app?.packageName ?? "unknown package"})`,
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
    if (!error) return "No SynCloudOS error has been captured.";
    const snapshot = RuntimeStore.getSnapshot();
    const registeredApps = Object.values(snapshot.appInfo).map((app) => app.packageName).join(", ") || "none";
    const displayApps = Object.values(snapshot.appInfo).filter((app) => app.webspring.visible).map((app) => app.packageName).join(", ") || "none";
    return [
      `Exception: ${error.code}`,
      `Code: ${diagnosticCode(error.code)}`,
      `Category: ${error.category ?? "runtime"}`,
      `Severity: ${error.severity ?? "error"}`,
      `Recoverable: ${String(error.recoverable ?? true)}`,
      `Source: ${error.source ?? "SynCloudOS.ErrorManager"}`,
      `Fingerprint: ${error.fingerprint ?? "none"}`,
      `Watchdog: ${error.context?.watchdog ?? "none"}`,
      `Statechart: ${snapshot.statechart.previousState ?? "none"} -> ${snapshot.statechart.currentState}`,
      `Active app: ${snapshot.application.activeAppId ?? "none"}`,
      `Requested app: ${error.context?.requestedAppId ?? error.appId ?? "none"}`,
      `Package: ${error.packageName ?? "none"}`,
      `Route: ${error.route ?? error.context?.pathname ?? snapshot.application.routePath}`,
      `Browser URL: ${error.context?.browserUrl ?? "none"}`,
      `User agent: ${error.context?.userAgent ?? "none"}`,
      `Event type: ${error.context?.eventType ?? "none"}`,
      `Source location: ${formatSourceLocation(error.context ?? {}) || "none"}`,
      `Cause: ${error.context?.cause ?? "none"}`,
      `Registered apps: ${registeredApps}`,
      `Display apps: ${displayApps}`,
      `Open windows: ${runtime.windows.list().map(({ record }) => `${record.id}:${record.applicationId ?? "none"}`).join(", ") || "none"}`,
      `Timestamp: ${error.timestamp}`,
      "",
      "Message:",
      error.technicalMessage ?? error.technicalDetails ?? error.message,
      "",
      "Context:",
      JSON.stringify(error.context ?? {}, null, 2)
    ].join("\n");
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


type ErrorSink = Pick<SynCloudOSErrorManager, "capture" | "getHistory">;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function captureOnce(sink: ErrorSink, payload: Parameters<ErrorSink["capture"]>[0]) {
  const existing = payload.fingerprint
    ? sink.getHistory().find((item) => item.fingerprint === payload.fingerprint)
    : undefined;
  return existing ?? sink.capture(payload);
}

function browserContext(browser?: RuntimeBrowserPort) {
  const location = browser?.getLocation();
  const browserNavigator = browser?.getNavigator();
  return {
    browserUrl: location?.href ?? null,
    userAgent: browserNavigator?.userAgent ?? null,
  };
}

export function createGlobalScriptError(sink: ErrorSink, error: unknown, context: Record<string, unknown> = {}, browser?: RuntimeBrowserPort) {
  const message = errorMessage(error);
  const fingerprint = String(context.fingerprint ?? `global-script:${message}:${context.filename ?? ""}:${context.lineno ?? ""}:${context.colno ?? ""}`);
  return captureOnce(sink, {
    code: "GLOBAL_SCRIPT_ERROR", title: "SynCloudOS caught a global script error.", message: "A browser-level script error escaped the runtime watchdogs.",
    technicalMessage: message, technicalDetails: `${message}\n${String(context.componentStack ?? "")}`, source: String(context.source ?? "SynCloudOS.GlobalWatchdog.error"),
    severity: "fatal", recoverable: false, suggestedActions: ["reload"], fingerprint, category: "watchdog",
    context: { ...browserContext(browser), watchdog: context.watchdog ?? "SynCloudOS GlobalWatchdog", eventType: context.eventType ?? "error", ...context },
  });
}

export function createUnhandledPromiseRejectionError(sink: ErrorSink, reason: unknown, context: Record<string, unknown> = {}, browser?: RuntimeBrowserPort) {
  const message = errorMessage(reason);
  return captureOnce(sink, {
    code: "UNHANDLED_PROMISE_REJECTION", title: "SynCloudOS caught an unhandled promise rejection.", message: "An asynchronous runtime operation failed without handling its rejection.",
    technicalMessage: message, technicalDetails: message, source: String(context.source ?? "SynCloudOS.GlobalWatchdog.unhandledrejection"), severity: "fatal", recoverable: false,
    suggestedActions: ["reload"], fingerprint: String(context.fingerprint ?? `unhandled:${message}`), category: "watchdog",
    context: { ...browserContext(browser), watchdog: context.watchdog ?? "SynCloudOS GlobalWatchdog", eventType: context.eventType ?? "unhandledrejection", ...context },
  });
}

export function createAssetLoadFailedError(sink: ErrorSink, target: unknown, context: Record<string, unknown> = {}, browser?: RuntimeBrowserPort) {
  const candidate = target as { tagName?: string; currentSrc?: string; src?: string };
  const resourceTag = String(candidate?.tagName ?? "unknown").toLowerCase();
  const resourceUrl = candidate?.currentSrc || candidate?.src || null;
  return captureOnce(sink, {
    code: "ASSET_LOAD_FAILED", title: "SynCloudOS could not load a visual asset.", message: "A page resource failed to load.", technicalMessage: `${resourceTag}: ${resourceUrl ?? "unknown"}`,
    technicalDetails: `Resource target: ${resourceTag}\nResource URL: ${resourceUrl ?? "unknown"}`, source: String(context.source ?? "SynCloudOS.GlobalWatchdog.resource"), severity: "warning", recoverable: true,
    suggestedActions: ["dismiss"], fingerprint: `asset:${resourceTag}:${resourceUrl ?? ""}`, category: "resource",
    context: { ...browserContext(browser), watchdog: context.watchdog ?? "SynCloudOS GlobalWatchdog", eventType: context.eventType ?? "error", resourceTag, resourceUrl, ...context },
  });
}

export function createAppContentFailedError(sink: ErrorSink, app: { id: string; packageName: string; displayName: string } | null, error: unknown, context: Record<string, unknown> = {}) {
  const message = errorMessage(error);
  return sink.capture({ code: "APP_CONTENT_FAILED", title: `${app?.packageName ?? "A SynWare"} stopped unexpectedly.`, message: "An unexpected error has prevented this application from working properly.", appId: app?.id, packageName: app?.packageName,
    technicalMessage: message, technicalDetails: `${message}\n${String(context.componentStack ?? "")}`, source: String(context.source ?? "SynCloudOS.Watchdog"), severity: "fatal", recoverable: false,
    suggestedActions: ["returnToWebspring"], category: "app", context: { watchdog: context.watchdog ?? "appPresentation", ...context } });
}

export function createRuntimeRenderError(sink: ErrorSink, error: unknown, context: Record<string, unknown> = {}) {
  const message = errorMessage(error);
  return sink.capture({ code: "UNKNOWN_RUNTIME_ERROR", title: "Webspring caught a runtime error.", message: "SynCloudOS caught an unexpected rendering error before it could blank the screen.",
    technicalMessage: message, technicalDetails: `${message}\n${String(context.componentStack ?? "")}`, source: String(context.source ?? "SynCloudOS.RootWatchdog"), severity: "fatal", recoverable: false,
    suggestedActions: ["reload"], category: "watchdog", context: { watchdog: context.watchdog ?? "root", ...context } });
}

function formatSourceLocation(context: Record<string, unknown> = {}) {
  const filename = typeof context.filename === "string" ? context.filename : "";
  const line = typeof context.lineno === "number" ? context.lineno : null;
  const column = typeof context.colno === "number" ? context.colno : null;
  if (!filename && line === null && column === null) return "";
  return `${filename || "unknown source"}:${line ?? "?"}:${column ?? "?"}`;
}

function diagnosticCode(code: string) {
  if (code === "APP_NOT_RESPONDING" || code === "SITE_NOT_RESPONDING") return "SYN-RESPONSE-TIMEOUT";
  if (code === "CONNECTION_ERROR") return "SYN-CONNECTION-FAILED";
  if (code === "APP_NOT_FOUND") return "SYN-APP-404";
  if (code === "ROUTE_NOT_FOUND") return "SYN-ROUTE-404";
  if (code === "UNRECOVERABLE_LOGIN_SESSION_MISMATCH") return "SYN-LOGIN-SESSION-LOCK";
  if (code === "ASSET_LOAD_FAILED") return "SYN-ASSET-404";
  if (code === "GLOBAL_SCRIPT_ERROR" || code === "UNHANDLED_PROMISE_REJECTION") return "SYN-GLOBAL-WATCHDOG-500";
  if (code === "RUNTIME_EVENT_LISTENER_FAILED") return "SYN-EVENTBUS-500";
  if (code === "FEATURE_NOT_IMPLEMENTED") return "SYN-FEATURE-501";
  return "SYN-RUNTIME-500";
}

/** Pure formatter. Runtime error state belongs to runtime.errors. */
export function toTechnicalReport(error: CapturedSynCloudOSError | null) {
  if (!error) return "No SynCloudOS error has been captured.";
  return [
    `Exception: ${error.code}`,
    `Code: ${diagnosticCode(error.code)}`,
    `Category: ${error.category ?? "runtime"}`,
    `Severity: ${error.severity ?? "error"}`,
    `Recoverable: ${String(error.recoverable ?? true)}`,
    `Source: ${error.source ?? "SynCloudOS.runtime.errors"}`,
    `Fingerprint: ${error.fingerprint ?? "none"}`,
    `Watchdog: ${error.context?.watchdog ?? "none"}`,
    `Requested app: ${error.context?.requestedAppId ?? error.appId ?? "none"}`,
    `Package: ${error.packageName ?? "none"}`,
    `Route: ${error.route ?? error.context?.pathname ?? "none"}`,
    `Browser URL: ${error.context?.browserUrl ?? "none"}`,
    `User agent: ${error.context?.userAgent ?? "none"}`,
    `Event type: ${error.context?.eventType ?? "none"}`,
    `Source location: ${formatSourceLocation(error.context ?? {}) || "none"}`,
    `Cause: ${error.context?.cause ?? "none"}`,
    `Message: ${error.message}`,
    `Technical message: ${error.technicalMessage ?? "none"}`,
    `Technical details: ${error.technicalDetails ?? "none"}`,
  ].join("\n");
}
