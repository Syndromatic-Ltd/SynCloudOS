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

import { normalizeRoutePath } from "../Routing/routeNormalization";
import { createBrowserRoutePlatform } from "../PlatformAdapters/BrowserRoutePlatform";
import { createRuntimeRouteGraphOwner, RuntimeRouteRedirect } from "../Routing/RuntimeRouteGraphOwner";
import { createMountedRouteSettlement } from "../Routing/MountedRouteSettlement";
import type { SynCloudOSAppInfo } from "../AppInfo/appInfoTypes";
import type { OperationPhase, OperationResult, PresentationSettlementHandle } from "../Operations/operationTypes";
import type {
  RuntimeOperationHandle,
  SynCloudOSAppRegistry,
  SynCloudOSBundleLoader,
  SynCloudOSErrorManager,
  SynCloudOSLaunchServices,
  SynCloudOSLifecycle,
  SynCloudOSPolicyKit,
  SynCloudOSRuntime,
  SynCloudOSRuntimeId,
  SynCloudOSServiceRegistry,
  SynCloudOSStatechart,
} from "../Runtime/runtimeInstanceTypes";
import type {
  SynCloudOSOpenRouteOptions,
  SynCloudOSOpenRouteResult,
  SynCloudOSOpenRouteHandle,
  SynCloudOSRouteExplanation,
  SynCloudOSRouteHistoryAction,
  SynCloudOSRouteHistoryRecord,
  SynCloudOSRouteNormalization,
  SynCloudOSRouteResolution,
  SynCloudOSRouteTransitionInspectionOutcome,
  SynCloudOSRouteTransitionInspectionRecord,
} from "./routeTypes";

export interface SynCloudOSCanonicalRouteManager extends RuntimeOwnedRouteManager {
  readonly mountedRoutes: ReturnType<typeof createMountedRouteSettlement>;
  readonly routeGraph: ReturnType<typeof createRuntimeRouteGraphOwner>;
  getCurrentOperationId(): string | null;
  getRedirectSuccessor(predecessorOperationId: string, successorOperationId: string): SynCloudOSOpenRouteHandle | null;
  inspectTransitions(limit?: number): readonly SynCloudOSRouteTransitionInspectionRecord[];
  subscribeTransitions(listener: () => void): () => void;
  normalizeRoutePath(value: unknown): SynCloudOSRouteNormalization;
  resolveRoute(pathname: string): SynCloudOSRouteResolution;
  explainRoute(pathname: string): SynCloudOSRouteExplanation;
  getAppForRoute(pathname: string): SynCloudOSAppInfo | null;
  getRouteForApp(appId: string): string | null;
  getRouteTable(): Array<{
    appId: string;
    packageName: string;
    route: string;
    normalizedRoute: string;
    canonicalHref: string | null;
    matchMode: "path" | "href";
    routeableInternally: boolean;
    externalRouteCandidate: boolean;
    diagnostics: SynCloudOSRouteNormalization["diagnostics"];
    visible: boolean;
    type: SynCloudOSAppInfo["type"];
  }>;
  getHistory(limit?: number): Array<SynCloudOSRouteHistoryRecord & { runtimeId: SynCloudOSRuntimeId }>;
  clearHistory(): void;
  cancelActiveOperations(reason: string): void;
}

type RuntimeOwnedRouteManager = {
  readonly runtimeId: SynCloudOSRuntimeId;
  openRoute(pathname: string, options?: SynCloudOSOpenRouteOptions): SynCloudOSOpenRouteHandle;
  dispose(): void;
};

type RouteManagerDependencies = {
  readonly appRegistry: Pick<SynCloudOSAppRegistry, "getApp" | "getAllApps" | "getAppForRoute">;
  readonly bundleLoader: Pick<SynCloudOSBundleLoader, "loadBundle">;
  readonly lifecycle: Pick<SynCloudOSLifecycle, "getState" | "validateAccess">;
  /** Statechart's canonical app branch invokes LaunchServices exactly once. */
  readonly launchServices: Pick<SynCloudOSLaunchServices, "openApp" | "completeMultiSwitch">;
  readonly policyKit: Pick<SynCloudOSPolicyKit, "authorise">;
  readonly errorManager: Pick<
    SynCloudOSErrorManager,
    "createAppLaunchFailedError" | "createLoginSessionMismatchError"
  >;
  readonly serviceRegistry: Pick<SynCloudOSServiceRegistry, "getServiceReport">;
  readonly statechart: Pick<SynCloudOSStatechart, "gotoState">;
  readonly baseOrigin?: string;
  readonly lifecycleHookTimeoutMs?: number;
  readonly presentationTimeoutMs?: number;
  readonly presentationRolesForRoute?: (input: { readonly hasApplication: boolean }) => readonly string[];
};

type RuntimeRouteHistoryRecord = SynCloudOSRouteHistoryRecord & {
  readonly runtimeId: SynCloudOSRuntimeId;
};

type RouteOperationInput = Record<string, unknown> | undefined;

const routeHistoryLimit = 80;
const developerOpenRoutePrefix = "/__syncloudos/open/";

export function createRouteManager(
  runtime: SynCloudOSRuntime,
  dependencies: RouteManagerDependencies,
): SynCloudOSCanonicalRouteManager {
  const AppRegistry = dependencies.appRegistry;
  const BundleLoader = dependencies.bundleLoader;
  const Lifecycle = dependencies.lifecycle;
  const ErrorManager = dependencies.errorManager;
  const PolicyKit = dependencies.policyKit;
  const ServiceRegistry = dependencies.serviceRegistry;
  const Statechart = dependencies.statechart;
  const RuntimeStore = runtime.store;
  const EventBus = runtime.events;
  const browserRoutes = createBrowserRoutePlatform(runtime.environment);
  const graphs = createRuntimeRouteGraphOwner(runtime, dependencies.lifecycleHookTimeoutMs ?? 5000);
  const mountedRoutes = createMountedRouteSettlement(runtime.environment);
  const baseOrigin = dependencies.baseOrigin ?? runtime.environment.browser.getLocation().origin;
  const routeHistory: RuntimeRouteHistoryRecord[] = [];
  const transitionHistory: SynCloudOSRouteTransitionInspectionRecord[] = [];
  const transitionListeners = new Set<() => void>();
  const activeRouteOperations = new Set<RuntimeOperationHandle<SynCloudOSOpenRouteResult>>();
  let disposed = false;
  let currentOperationId: string | null = null;
  const redirectSuccessors = new Map<string, SynCloudOSOpenRouteHandle>();

  const transitionOutcome = (
    result: OperationResult<SynCloudOSOpenRouteResult>,
    successorId: string | undefined,
  ): SynCloudOSRouteTransitionInspectionOutcome => {
    if (result.status === "cancelled") return result.reason === "superseded" ? "superseded" : "cancelled";
    if (result.status === "completed") {
      if (result.postCommit === "failed") return "route-error";
      if (result.postCommit === "cancelled") return "cancelled";
      return "settled";
    }
    const code = result.error.code;
    if (code === "route-guard-blocked") return "blocked";
    if (code === "route-invalid-query") return "invalid-query";
    if (code === "route-denied" || code === "route-unauthorised") return "denied";
    if (code === "route-not-found") return "not-found";
    if (code === "route-redirect" && successorId) return "redirected";
    return "failed";
  };

  const recordTransition = (
    handle: RuntimeOperationHandle<SynCloudOSOpenRouteResult>,
    resolution: SynCloudOSRouteResolution,
    result: OperationResult<SynCloudOSOpenRouteResult>,
  ) => {
    const cause = result.status === "failed" && result.error.code === "route-redirect" ? result.error.cause : undefined;
    const successorId = cause && typeof cause === "object" && typeof (cause as { successorId?: unknown }).successorId === "string"
      ? (cause as { successorId: string }).successorId
      : undefined;
    const operation = runtime.operations.inspectHistory(routeHistoryLimit).find(record => record.operationId === handle.operationId)
      ?? runtime.operations.inspectPending().find(record => record.operationId === handle.operationId);
    const fallbackPhase: OperationPhase = result.status === "completed"
      ? "completed"
      : result.status === "cancelled"
        ? "cancelled"
        : result.status === "rolledBack"
          ? "rolledBack"
          : result.phase;
    const record = Object.freeze({
      operationId: handle.operationId,
      correlationId: handle.correlationId,
      ...(operation?.parentCorrelationId ? { parentCorrelationId: operation.parentCorrelationId } : {}),
      ...(successorId ? { successorId } : {}),
      ...(resolution.kind === "app" ? { appId: resolution.app.id } : {}),
      outcome: transitionOutcome(result, successorId),
      phase: operation?.phase ?? fallbackPhase,
      committed: result.committed,
      ...(operation ? { startedAt: operation.startedAt, updatedAt: operation.updatedAt } : {}),
      ...(operation?.endedAt !== undefined ? { endedAt: operation.endedAt } : {}),
    } satisfies SynCloudOSRouteTransitionInspectionRecord);
    transitionHistory.push(record);
    while (transitionHistory.length > routeHistoryLimit) transitionHistory.shift();
    for (const listener of [...transitionListeners]) {
      try { listener(); } catch { /* Diagnostic observers are isolated. */ }
    }
  };

  const normalizeRuntimeRoute = (route: unknown) => normalizeRoutePath(route, { baseOrigin });

  function getDeveloperOpenApp(pathname: string): SynCloudOSAppInfo | null {
    if (!import.meta.env.DEV || !pathname.startsWith(developerOpenRoutePrefix)) return null;
    const encodedAppId = pathname.slice(developerOpenRoutePrefix.length);
    if (!encodedAppId) return null;
    try {
      return AppRegistry.getApp(decodeURIComponent(encodedAppId));
    } catch {
      return null;
    }
  }

  function getInternalAppForNormalizedRoute(pathname: string): SynCloudOSAppInfo | null {
    return AppRegistry.getAppForRoute(pathname);
  }

  function getExternalAppForCanonicalHref(canonicalHref: string | null): SynCloudOSAppInfo | null {
    if (!canonicalHref) return null;
    return AppRegistry.getAllApps().find((app) => {
      if (app.type !== "external") return false;
      return normalizeRuntimeRoute(app.route).canonicalHref === canonicalHref;
    }) ?? null;
  }

  function resolveRoute(pathname: string): SynCloudOSRouteResolution {
    const normalized = normalizeRuntimeRoute(pathname);
    const diagnostics = normalized.diagnostics;

    if (normalized.matchMode === "none") {
      return {
        kind: "notFound",
        requestedPath: normalized.requestedPath,
        pathname: normalized.pathname,
        normalized,
        diagnostics,
        matchMode: "none",
        matchKey: null,
      };
    }

    if (normalized.matchMode === "href") {
      const externalApp = getExternalAppForCanonicalHref(normalized.canonicalHref);
      if (!externalApp || !normalized.canonicalHref) {
        return {
          kind: "notFound",
          requestedPath: normalized.requestedPath,
          pathname: normalized.pathname,
          normalized,
          diagnostics,
          matchMode: "href",
          matchKey: normalized.canonicalHref,
        };
      }
      return {
        kind: "external",
        requestedPath: normalized.requestedPath,
        pathname: normalized.pathname,
        normalized,
        diagnostics,
        href: externalApp.route,
        canonicalHref: normalized.canonicalHref,
        app: externalApp,
        matchMode: "href",
        matchKey: normalized.canonicalHref,
      };
    }

    if (!normalized.routeableInternally) {
      return {
        kind: "notFound",
        requestedPath: normalized.requestedPath,
        pathname: normalized.pathname,
        normalized,
        diagnostics,
        matchMode: "none",
        matchKey: null,
      };
    }

    if (normalized.pathname === "/") {
      return {
        kind: "webspring",
        requestedPath: normalized.requestedPath,
        pathname: "/",
        normalized,
        diagnostics,
        matchMode: "path",
        matchKey: "/",
      };
    }

    const developerApp = getDeveloperOpenApp(normalized.pathname);
    if (developerApp) {
      return {
        kind: "app",
        requestedPath: normalized.requestedPath,
        pathname: normalizeRuntimeRoute(developerApp.route).pathname,
        normalized,
        diagnostics,
        app: developerApp,
        matchMode: "path",
        matchKey: normalized.pathname,
      };
    }

    const app = getInternalAppForNormalizedRoute(normalized.pathname);
    if (!app) {
      return {
        kind: "notFound",
        requestedPath: normalized.requestedPath,
        pathname: normalized.pathname,
        normalized,
        diagnostics,
        matchMode: "path",
        matchKey: normalized.pathname,
      };
    }

    return {
      kind: "app",
      requestedPath: normalized.requestedPath,
      pathname: normalized.pathname,
      normalized,
      diagnostics,
      app,
      matchMode: "path",
      matchKey: normalized.pathname,
    };
  }

  function createRouteExplanation(resolution: SynCloudOSRouteResolution): SynCloudOSRouteExplanation {
    const reasons: string[] = [];
    const warnings: string[] = [];

    if (resolution.normalized.changed) {
      reasons.push(`Normalised "${resolution.requestedPath}" to "${resolution.pathname}".`);
    } else {
      reasons.push(`Route "${resolution.pathname}" already matched the normalised route shape.`);
    }

    if (resolution.normalized.search || resolution.normalized.hash) {
      warnings.push("Search and hash fragments are preserved as metadata but are not used for app route matching.");
    }

    if (resolution.diagnostics.matchMode === "href") {
      reasons.push("Cross-origin URL matching is constrained to external app canonical hrefs.");
    }

    if (resolution.diagnostics.isUnsafeScheme) {
      warnings.push(`Unsafe URL scheme blocked. ${resolution.diagnostics.rejectionReason ?? "Unsafe URL schemes cannot be opened as internal SynCloudOS routes."}`);
    }

    if (resolution.kind === "webspring") {
      reasons.push("The normalised route points at the Webspring root.");
    }

    if (resolution.kind === "app") {
      reasons.push(`Matched ${resolution.app.packageName} through AppRegistry route "${resolution.app.route}".`);
    }

    if (resolution.kind === "external") {
      reasons.push(`Matched external app ${resolution.app.packageName} through canonical href "${resolution.canonicalHref}".`);
    }

    if (resolution.kind === "notFound") {
      warnings.push(
        resolution.matchMode === "href"
          ? "No registered external SynWare href matches the canonical cross-origin URL."
          : resolution.matchMode === "none"
            ? "The route input is not eligible for internal or external matching."
            : "No registered SynWare route matches the normalised path.",
      );
    }

    return {
      requestedPath: resolution.requestedPath,
      pathname: resolution.pathname,
      kind: resolution.kind,
      appId: resolution.kind === "app" || resolution.kind === "external" ? resolution.app.id : undefined,
      packageName: resolution.kind === "app" || resolution.kind === "external" ? resolution.app.packageName : undefined,
      href: resolution.kind === "external" ? resolution.href : undefined,
      canonicalHref: resolution.kind === "external" ? resolution.canonicalHref : resolution.normalized.canonicalHref ?? undefined,
      normalized: resolution.normalized,
      diagnostics: resolution.diagnostics,
      matchMode: resolution.matchMode,
      matchKey: resolution.matchKey,
      routeTableSize: AppRegistry.getAllApps().length,
      reasons,
      warnings,
      resolution,
      at: runtime.environment.now(),
    };
  }

  function recordRouteHistory(action: SynCloudOSRouteHistoryAction, explanation: SynCloudOSRouteExplanation): RuntimeRouteHistoryRecord {
    const record: RuntimeRouteHistoryRecord = {
      runtimeId: runtime.runtimeId,
      id: `${runtime.runtimeId}:route:${runtime.environment.randomUUID()}`,
      action,
      at: runtime.environment.now(),
      requestedPath: explanation.requestedPath,
      pathname: explanation.pathname,
      kind: explanation.kind,
      appId: explanation.appId,
      packageName: explanation.packageName,
      href: explanation.href,
      canonicalHref: explanation.canonicalHref,
      matchMode: explanation.matchMode,
      matchKey: explanation.matchKey,
      diagnostics: explanation.diagnostics,
      notes: [...explanation.reasons, ...explanation.warnings],
    };
    routeHistory.push(record);
    if (routeHistory.length > routeHistoryLimit) routeHistory.splice(0, routeHistory.length - routeHistoryLimit);
    return record;
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
  type LaunchTerminalDetails = {
    readonly appId: string;
    readonly requestId: string | null;
    readonly reason?: string;
  };

  function readLaunchTerminalDetails(payload: unknown): LaunchTerminalDetails | null {
    if (!payload || typeof payload !== "object") return null;
    const record = payload as Record<string, unknown>;
    const request = record.request && typeof record.request === "object"
      ? record.request as Record<string, unknown>
      : null;
    const appId = typeof record.appId === "string"
      ? record.appId
      : request && typeof request.appId === "string"
        ? request.appId
        : null;
    if (!appId) return null;
    const reason = typeof record.reason === "string"
      ? record.reason
      : typeof record.error === "string"
        ? record.error
        : undefined;
    const requestId = typeof record.requestId === "string" ? record.requestId
      : request && typeof request.requestId === "string" ? request.requestId : null;
    return { appId, requestId, ...(reason ? { reason } : {}) };
  }

  function createLaunchTerminalWait(appId: string, signal: AbortSignal): {
    readonly result: Promise<void>;
    bindRequest(requestId: string): void;
    dispose(): void;
  } {
    let settled = false;
    let expectedRequestId: string | null = null;
    let resolveResult: () => void = () => undefined;
    let rejectResult: (reason: Error) => void = () => undefined;
    let removeAbortListener: (() => void) | null = null;
    const unsubscribe: Array<() => void> = [];

    const cleanup = () => {
      for (const remove of unsubscribe.splice(0)) remove();
      removeAbortListener?.();
      removeAbortListener = null;
    };

    const result = new Promise<void>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = (reason: Error) => reject(reason);

      const complete = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolveResult();
      };
      const fail = (reason: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        rejectResult(reason);
      };
      const onLaunchEvent = (event: { readonly payload?: unknown }, eventType: "complete" | "failed" | "cancelled") => {
        const details = readLaunchTerminalDetails(event.payload);
        if (!details || details.appId !== appId || expectedRequestId === null || details.requestId !== expectedRequestId) return;
        if (eventType === "complete") {
          complete();
          return;
        }
        fail(new Error(details.reason ?? `Launch of ${appId} ended with ${eventType}.`));
      };

      unsubscribe.push(EventBus.subscribe("app.launch.complete", (event) => onLaunchEvent(event, "complete")));
      unsubscribe.push(EventBus.subscribe("app.launch.failed", (event) => onLaunchEvent(event, "failed")));
      unsubscribe.push(EventBus.subscribe("app.launch.cancelled", (event) => onLaunchEvent(event, "cancelled")));

      const onAbort = () => {
        fail(signal.reason instanceof Error ? signal.reason : new Error(`Launch of ${appId} was cancelled.`));
      };
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener("abort", onAbort, { once: true });
        removeAbortListener = () => signal.removeEventListener("abort", onAbort);
      }
    });

    return {
      result,
      bindRequest(requestId) { expectedRequestId = requestId; },
      dispose() {
        if (settled) return;
        settled = true;
        cleanup();
        resolveResult();
      },
    };
  }

  function retainRouteOperation(handle: RuntimeOperationHandle<SynCloudOSOpenRouteResult>): RuntimeOperationHandle<SynCloudOSOpenRouteResult> {
    currentOperationId = handle.operationId;
    activeRouteOperations.add(handle);
    void handle.result.then(
      () => activeRouteOperations.delete(handle),
      () => activeRouteOperations.delete(handle),
    );
    return handle;
  }
  function cancelActiveOperations(reason: string): void {
    for (const operation of activeRouteOperations) operation.cancel(reason);
  }

  function transitionOrThrow(transition: unknown, app: SynCloudOSAppInfo | null, target: string): void {
    if (transition !== null && transition !== undefined) return;
    if (app) {
      const captured = ErrorManager.createAppLaunchFailedError(
        app,
        new Error(`Statechart could not enter ${target} for ${app.id}.`),
        { source: "SynCloudOS.RouteManager.openRoute", route: app.route },
      );
      throw captured;
    }
    throw new Error(`Statechart could not enter ${target}.`);
  }

  function createRouteOperation(
    resolution: SynCloudOSRouteResolution,
    options: SynCloudOSOpenRouteOptions,
  ): RuntimeOperationHandle<SynCloudOSOpenRouteResult> {
    const source = options.source ?? "route";
    const statechartSource = source === "boot" ? "boot" : "route";
    const requestedPath = resolution.requestedPath;
    let presentation: PresentationSettlementHandle | null = null;
    let prepared: Awaited<ReturnType<typeof graphs.prepare>> | null = null;
    let requiresMountedRoute = false;

    const validateAppRouteAccess = () => {
      if (resolution.kind !== "app") return { ok: true as const };
      const policy = PolicyKit.authorise({
        action: "route.open",
        app: resolution.app,
        route: resolution.app.route,
        source: `SynCloudOS.RouteManager.openRoute:${source}`,
        origin: "runtime",
        serviceReport: ServiceRegistry.getServiceReport(resolution.app.requiredServices),
        requiredCapabilities: [resolution.app.type === "system" ? "diagnostics.view" : "app.open.public"],
        context: { routeSource: source },
      });
      if (!policy.allowed) {
        const sessionRequired = !policy.sessionAuthorised && /authorised session/i.test(policy.reason);
        if (
          sessionRequired &&
          source === "webspring-controller" &&
          RuntimeStore.getSnapshot().statechart.currentState === "active.webspring"
        ) {
          ErrorManager.createLoginSessionMismatchError(resolution.app, {
            source: "SynCloudOS.RouteManager.openRoute",
            requestedAppId: resolution.app.id,
            route: resolution.pathname,
            siteName: typeof options.context?.siteName === "string"
              ? options.context.siteName
              : undefined,
            reason: policy.reason,
          });
        }
        return {
          ok: false as const,
          code: sessionRequired ? "route-unauthorised" : "route-denied",
          reason: policy.reason,
        };
      }
      return Lifecycle.validateAccess(resolution.app.id, "launch");
    };

    const assertAppRouteAccess = () => {
      const validation = validateAppRouteAccess();
      if (validation.ok) return;
      const error = Object.assign(new Error(validation.reason ?? "Route access was denied before commit."), {
        code: validation.code ?? "route-denied",
      });
      throw error;
    };

    const isMountedRouteStateSelfNavigation = () => {
      if (resolution.kind !== "app") return false;
      if (source !== `app:${resolution.app.id}:route-state`) return false;
      const location = runtime.environment.browser.getLocation();
      return (
        location.pathname === resolution.pathname
        && AppRegistry.getAppForRoute(location.pathname)?.id === resolution.app.id
      );
    };

    const handle = runtime.operations.run<RouteOperationInput, SynCloudOSOpenRouteResult>({
      kind: "route.open",
      input: options.context,
      correlationId: options.correlationId,
      supersedeKey: "route.open",
      validate: () => {
        if (disposed || runtime.signal.aborted) {
          return { ok: false, code: "runtime-disposed", reason: "Cannot open a route after runtime disposal." };
        }
        if (resolution.kind === "external") {
          return {
            ok: false,
            code: "route-invalid-input",
            reason: "Cross-origin routes are resolved only for explicit external-app handling and cannot activate an internal runtime route.",
          };
        }
        if (resolution.kind === "notFound") {
          if (resolution.normalized.matchMode !== "path") {
            return {
              ok: false,
              code: "route-invalid-input",
              reason: "Only same-origin pathname inputs may activate an internal runtime route.",
            };
          }
          return { ok: false, code: "route-not-found", reason: `No runtime route is registered for ${requestedPath}.` };
        }
        return validateAppRouteAccess();
      },
      will: [
        async (context) => {
          if (resolution.kind === "app") {
            try {
              await BundleLoader.loadBundle(resolution.app.id, { signal: context.signal });
            } catch (error) {
              // Route opening owns this preload. A failure here happens before
              // Lifecycle.launch can run its equivalent recovery capture, so
              // surface the canonical app error at this boundary. Cancellation
              // remains silent because it is an ownership outcome, not a launch
              // failure the user can recover from.
              if (!context.signal.aborted && !runtime.signal.aborted) {
                ErrorManager.createAppLaunchFailedError(resolution.app, error, {
                  source: "SynCloudOS.RouteManager.openRoute",
                  route: resolution.pathname,
                  phase: "route-preload",
                });
              }
              throw error;
            }
          }
          const graphHref = resolution.kind === "app" && resolution.pathname !== resolution.normalized.pathname
            ? `${resolution.pathname}${resolution.normalized.search}${resolution.normalized.hash}`
            : resolution.normalized.href;
          try {
            prepared = await graphs.prepare(resolution.kind === "app" ? resolution.app.id : null,
              graphHref, context.signal, source.startsWith("app:"), options.context?.routeRetry === true);
          } catch (error) {
            if (!context.signal.aborted && !runtime.signal.aborted && error instanceof Error && error.name === "TimeoutError") {
              ErrorManager.createAppLaunchFailedError(resolution.kind === "app" ? resolution.app : null, error, {
                source: "SynCloudOS.RouteManager.openRoute", route: resolution.pathname,
                phase: "route-preparation", siteName: options.context?.siteName,
              });
            }
            throw error;
          }
        },
      ],
      commit: async (context) => {
        await options.hostBeforeCommit?.(Object.freeze({
          signal: context.signal,
          correlationId: context.correlationId,
        }));
        context.throwIfCancelled();
        assertAppRouteAccess();
        prepared?.assertCurrent();
        const before = RuntimeStore.getSnapshot();
        const mountedRouteStateOwnsBrowserPath = isMountedRouteStateSelfNavigation();
        const isSameActiveAppRoute = Boolean(
          resolution.kind === "app" &&
          (
            (
              before.application.activeAppId === resolution.app.id &&
              Lifecycle.getState(resolution.app.id) === "active"
            )
            || mountedRouteStateOwnsBrowserPath
          ),
        );

        if (!isSameActiveAppRoute && dependencies.presentationRolesForRoute) {
          const roles = dependencies.presentationRolesForRoute({ hasApplication: resolution.kind === "app" });
          requiresMountedRoute = resolution.kind === "app" && roles.length > 0;
          if (roles.length > 0) {
            presentation = runtime.presentationSettlements.begin({
              operationId: context.operationId,
              roles,
              timeoutMs: dependencies.presentationTimeoutMs ?? 5000,
            });
          }
        }

        const value: SynCloudOSOpenRouteResult = {
          runtimeId: runtime.runtimeId,
          requestedPath,
          pathname: resolution.pathname,
          kind: resolution.kind,
          appId: resolution.kind === "app" ? resolution.app.id : undefined,
          ...(presentation ? { presentationSettlementId: presentation.id } : {}),
        };
        const lifecycle = {
          signal: context.signal,
          correlationId: context.correlationId,
          routePath: resolution.pathname,
          onCommit: () => {
            context.throwIfCancelled();
            assertAppRouteAccess();
            prepared?.assertCurrent();
            if (options.syncRoute !== false) {
              browserRoutes.syncRoute(resolution.normalized.href, {
                replace: options.historyMode === "replace",
              });
            }
            context.markCommitted(value);
            graphs.commit(prepared?.destination ?? null);
          },
        };

        try {
          if (isSameActiveAppRoute && resolution.kind === "app") {
            context.throwIfCancelled();
            if (options.syncRoute !== false) {
              browserRoutes.syncRoute(resolution.normalized.href, {
                replace: options.historyMode === "replace",
              });
            }
            context.markCommitted(value);
            graphs.commit(prepared?.destination ?? null);
            RuntimeStore.mutate(draft => { draft.application.routePath = resolution.pathname; });
          } else if (resolution.kind === "app") {
            const launchWait = createLaunchTerminalWait(resolution.app.id, context.signal);
            try {
              transitionOrThrow(
                Statechart.gotoState("active.application", {
                  appId: resolution.app.id,
                  pathname: resolution.pathname,
                  source: statechartSource,
                  focus: true,
                  syncRoute: false,
                  context: options.context,
                  lifecycle,
                  onLaunchRequest: launchWait.bindRequest,
                }),
                resolution.app,
                "active.application",
              );
              await launchWait.result;
              context.throwIfCancelled();
            } finally {
              launchWait.dispose();
              await launchWait.result.catch(() => undefined);
            }
          } else {
            const transition = await Statechart.gotoState("active.webspring", {
              pathname: "/",
              source: statechartSource,
              syncRoute: false,
              context: options.context,
              lifecycle,
            });
            context.throwIfCancelled();
            transitionOrThrow(
              transition,
              null,
              "active.webspring",
            );
          }
        } catch (error) {
          presentation?.cancel(error instanceof Error ? error.message : "route-transition-failed");
          presentation = null;
          throw error;
        }

        if (presentation) {
          RuntimeStore.mutate((draft) => {
            draft.webspring.presentationSettlementId = presentation?.id ?? null;
          });
        } else if (resolution.kind === "webspring") {
          RuntimeStore.mutate((draft) => {
            draft.webspring.presentationSettlementId = null;
          });
        }

        EventBus.publish(
          "route.open",
          {
            runtimeId: runtime.runtimeId,
            requestedPath,
            pathname: resolution.pathname,
            kind: resolution.kind,
            appId: resolution.kind === "app" ? resolution.app.id : undefined,
            ...(presentation ? { presentationSettlementId: presentation.id } : {}),
            browserHref: resolution.normalized.href,
            syncRoute: options.syncRoute !== false,
            ...(options.historyMode ? { historyMode: options.historyMode } : {}),
          },
          source,
        );
        return value;
      },
      effects: [{ onError: "stop", run: async context => {
        if (resolution.kind === "app" && prepared?.destination) {
          await mountedRoutes.settle(resolution.app.id, { route: prepared.destination.route, operationId: context.operationId, signal: context.signal }, requiresMountedRoute);
        }
      } }],
    });

    return linkExternalSignal(handle, options.signal);
  }

  const startRoute = (pathname: string, options: SynCloudOSOpenRouteOptions, visited: ReadonlySet<string> = new Set()): SynCloudOSOpenRouteHandle => {
    const resolution = resolveRoute(pathname);
    recordRouteHistory("open", createRouteExplanation(resolution));
    const raw = retainRouteOperation(createRouteOperation(resolution, options));
    const result = raw.result.then(value => {
      if (value.status !== "failed" || !(value.error.cause instanceof RuntimeRouteRedirect)) return value;
      const redirect = value.error.cause;
      if (disposed || options.signal?.aborted || currentOperationId !== raw.operationId) return value;
      if (visited.size >= 8 || visited.has(redirect.href) || redirect.href === resolution.normalized.href) {
        return Object.freeze({ ...value, error: Object.freeze({ ...value.error, code: "route-redirect-cycle", message: "Route redirect cycle or hop limit reached." }) });
      }
      const successor = startRoute(redirect.href, { ...options, historyMode: "replace", correlationId: raw.correlationId }, new Set([...visited, resolution.normalized.href]));
      redirectSuccessors.set(raw.operationId, successor);
      while (redirectSuccessors.size > routeHistoryLimit) redirectSuccessors.delete(redirectSuccessors.keys().next().value!);
      return Object.freeze({ ...value, error: Object.freeze({ ...value.error, code: "route-redirect", cause: Object.freeze({ code: "route-redirect", href: redirect.href, successorId: successor.operationId }) }) });
    }).then(value => {
      recordTransition(raw, resolution, value);
      return value;
    });
    return Object.freeze({ ...raw, result, retry() {
      if (disposed || runtime.signal.aborted || options.signal?.aborted || currentOperationId !== raw.operationId) throw new DOMException("Route retry authority was revoked or superseded.", "InvalidStateError");
      return startRoute(pathname, { ...options, correlationId: raw.correlationId, context: { ...options.context, routeRetry: true } });
    } });
  };

  const routeManager: SynCloudOSCanonicalRouteManager = {
    runtimeId: runtime.runtimeId,
    mountedRoutes,
    routeGraph: graphs,
    getCurrentOperationId: () => currentOperationId,
    getRedirectSuccessor(predecessorOperationId, successorOperationId) {
      const successor = redirectSuccessors.get(predecessorOperationId);
      return !disposed && successor?.operationId === successorOperationId ? successor : null;
    },
    inspectTransitions(limit?: number) {
      const values = typeof limit === "number" ? transitionHistory.slice(-Math.max(0, limit)) : [...transitionHistory];
      return Object.freeze(values);
    },
    subscribeTransitions(listener) {
      if (disposed) return () => {};
      transitionListeners.add(listener);
      return () => { transitionListeners.delete(listener); };
    },
    normalizeRoutePath: normalizeRuntimeRoute,

    resolveRoute,

    explainRoute(pathname: string) {
      return createRouteExplanation(resolveRoute(pathname));
    },

    getAppForRoute(pathname: string) {
      const resolution = resolveRoute(pathname);
      return resolution.kind === "app" || resolution.kind === "external" ? resolution.app : null;
    },

    getRouteForApp(appId: string) {
      return AppRegistry.getApp(appId)?.route ?? null;
    },

    openRoute(pathname: string, options: SynCloudOSOpenRouteOptions = {}) {
      return startRoute(pathname, options);
    },

    getRouteTable() {
      return AppRegistry.getAllApps().map((app) => {
        const normalized = normalizeRuntimeRoute(app.route);
        return {
          appId: app.id,
          packageName: app.packageName,
          route: app.route,
          normalizedRoute: normalized.pathname,
          canonicalHref: app.type === "external" ? normalized.canonicalHref : null,
          matchMode: app.type === "external" ? "href" as const : "path" as const,
          routeableInternally: app.type !== "external",
          externalRouteCandidate: app.type === "external",
          diagnostics: normalized.diagnostics,
          visible: app.webspring.visible,
          type: app.type,
        };
      });
    },

    getHistory(limit?: number) {
      return typeof limit === "number" ? routeHistory.slice(-limit) : [...routeHistory];
    },

    clearHistory() {
      routeHistory.splice(0, routeHistory.length);
    },

    cancelActiveOperations,

    dispose() {
      if (disposed) return;
      disposed = true;
      cancelActiveOperations("runtime-disposed");
      activeRouteOperations.clear();
      graphs.dispose();
      redirectSuccessors.clear();
      transitionListeners.clear();
      transitionHistory.splice(0, transitionHistory.length);
      mountedRoutes.dispose();
      routeHistory.splice(0, routeHistory.length);
    },
  };

  return routeManager;
}
