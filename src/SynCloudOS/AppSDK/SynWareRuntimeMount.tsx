/*
 * SynWare SDK
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useInsertionEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { SynCloudOSAppInfo, SynCloudOSRuntime } from "../SynCloudOS";
import { SynWareRuntimeContext, SynCloudOSRuntimeContext, useRuntimeNSEControlPort, useRuntimeNSEFocusPort, useRuntimeNSEOverlayPort } from "../../SynCloudOSReact";
import { NSEControlRuntimeProvider, NSEFocusPortProvider, NSEOverlayProvider, NSEConformanceEvidenceProvider, type NSEConformanceEvidencePort } from "../../NSE/NSE";
import type { MountedSynWareRuntime } from "./appRuntimeFacade";
import { createMountedSynWareRuntime } from "./appRuntimeFacade";
import type { SynWareRuntime } from "./appRuntimeTypes";
import { createSynWareContextValue } from "./createSynWareContextValue";
import { SynWareProvider } from "./SynWareContext";
import { useSCOS } from "./scos/useSCOS";
import { createFontCatalogueResourceLoader, useFontCatalogue } from "./fontAccess";
import { createSynWareNSEAnimations } from "./SynWareNSEMediaAdapters";
import { NSEAnimationEnvironmentProvider, NSEPresenceBoundary, type NSEAnimator } from "../../NSE/Animation";
import type { SynWareContextValue } from "./appContextTypes";
import { getMountedAppEnvironmentClients } from "./mountedEnvironmentClientRegistry";
import { hasTrustedBundlePrivilege } from "../BundleLoader/trustedBundleProvenance";
import { useHostSiteBranding } from "../../SynCloudOSReact";
import { SynWareRouteSessionProvider } from "./RouteOutlet";
import { createAppRouteSession, createRouteServiceScope, createMountedRouteParticipant } from "../Routing/appSdkRoutePort";
import { getRuntimeSettlement, trackRuntimeSettlement } from "../Testing/appSdkSettlementPort";
import { DevInspectorRegion } from "../../SynCloudOSReact/DevInspectorRegion";
import type { InspectorRouteInspectionPort } from "../Inspector/inspectorOwnerSources";
import type { AFXFrameScheduler } from "../../FX/AnimationFX/AFXLayer";
import { createRuntimeAnimationState, createScopedAnimationFrames } from "../AnimationFX/scopedAnimationFrames";

// Host-only bridge entrypoint. This is deliberately not exported from the
// public AppSDK package barrel: applications receive only the chrome hook.
export { AppWindowChromePropsProvider as HostAppWindowChromePropsProvider } from "./windowChromeContexts";

interface MountedState {
  readonly key: string;
  readonly registrationAuthority: object;
  readonly mount: MountedSynWareRuntime;
  readonly contextBase: SynWareContextValue;
  readonly hostFontResourceLoader: ReturnType<typeof createFontCatalogueResourceLoader>;
}

interface MountedLease {
  readonly state: MountedState;
  locallyDisposed: boolean;
}

export interface SynWareRuntimeMountProps {
  readonly runtime: SynCloudOSRuntime;
  readonly app: SynCloudOSAppInfo;
  readonly responderId: string;
  readonly windowControllerId?: string;
  readonly children: ReactNode;
}

function MountedAppPresentationBoundary({
  runtime,
  kernelRuntime,
  children,
}: {
  readonly runtime: SynWareRuntime;
  readonly kernelRuntime: SynCloudOSRuntime;
  readonly children: ReactNode;
}) {
  const focusPort = useRuntimeNSEFocusPort(`application:${runtime.app.id}`);
  const overlayPort = useRuntimeNSEOverlayPort(`application:${runtime.app.id}`);
  const controlPort = useRuntimeNSEControlPort();
  const trusted = getMountedAppEnvironmentClients(runtime).trusted;
  const conformance = trusted.conformance;
  const conformanceEvidencePort = useMemo<NSEConformanceEvidencePort | null>(() => {
    if (!conformance || !hasTrustedBundlePrivilege(kernelRuntime, runtime.app.id, "conformance", "diagnostics.view")) return null;
    return Object.freeze({
      registerAppearanceFact: (fact: Parameters<NSEConformanceEvidencePort["registerAppearanceFact"]>[0]) => {
        const handle = conformance.registerAppearanceFact(fact);
        return () => { void handle.dispose(); };
      },
      registerAccessibilityFinding: (finding: Parameters<NSEConformanceEvidencePort["registerAccessibilityFinding"]>[0]) => {
        const handle = conformance.registerAccessibilityFinding(finding);
        return () => { void handle.dispose(); };
      },
    });
  }, [conformance, kernelRuntime, runtime.app.id]);
  // NSE presentations inside the app animate as the app, through its own
  // AnimationFX client, never with the shell's authority, and never hold the
  // shell's own presence exits (a closing window's settlement).
  const appClient = useSCOS();
  const appAnimations = appClient.animations;
  const animationState = useMemo(() => createRuntimeAnimationState(kernelRuntime, runtime.signal, () => {
    const state = kernelRuntime.lifecycle.getState(runtime.app.id);
    return state === "suspended" || state === "closed";
  }), [kernelRuntime, runtime]);
  const reducedMotion = useSyncExternalStore(animationState.subscribe, animationState.getReducedMotion, animationState.getReducedMotion);
  const appFrames = useMemo<AFXFrameScheduler>(() => createScopedAnimationFrames(runtime.signal, animationState, {
    now: () => appClient.scheduler.now(),
    requestFrame(callback: (time: number) => void) {
      const handle = appClient.scheduler.requestAnimationFrame(callback);
      return () => { void handle.dispose(); };
    },
  }), [appClient.scheduler, animationState, runtime]);
  const animator = useMemo<NSEAnimator>(() => Object.freeze({
    animations: createSynWareNSEAnimations(appAnimations),
    ownerAppId: runtime.app.id,
  }), [appAnimations, runtime.app.id]);
  return (
    <NSEPresenceBoundary>
    <NSEAnimationEnvironmentProvider reducedMotion={reducedMotion} animator={animator} layers={appAnimations} frames={appFrames}>
    <NSEConformanceEvidenceProvider port={conformanceEvidencePort}>
      <NSEOverlayProvider runtimePort={overlayPort} defaultParentResponderId={`application:${runtime.app.id}`}>
        <NSEControlRuntimeProvider port={controlPort}>
          <NSEFocusPortProvider port={focusPort}>{children}</NSEFocusPortProvider>
        </NSEControlRuntimeProvider>
      </NSEOverlayProvider>
    </NSEConformanceEvidenceProvider>
    </NSEAnimationEnvironmentProvider>
    </NSEPresenceBoundary>
  );
}

/**
 * Owns one transfer generation for the mounted React identity. Layout effects
 * may disconnect and reconnect without an unmount (StrictMode probes,
 * Activity/Offscreen presentation and AnimatePresence re-entry), so their
 * cleanup must not revoke application authority. The insertion lifetime is
 * the authoritative React ownership boundary and disposes synchronously on a
 * real unmount or identity replacement.
 */
export function SynWareRuntimeMount({ runtime, app, responderId, windowControllerId, children }: SynWareRuntimeMountProps) {
  const branding = useHostSiteBranding();
  const fontCatalogue = useFontCatalogue();
  const hostFontResourceLoader = useMemo(() => createFontCatalogueResourceLoader(fontCatalogue), [fontCatalogue]);
  const key = `${runtime.runtimeId}\u0000${app.id}\u0000${responderId}\u0000${windowControllerId ?? ""}`;
  const [mounted, setMounted] = useState<MountedState | null>(null);
  const mountedLeaseRef = useRef<MountedLease | null>(null);
  // Transfer mounts can be retired out from under a live tree — notably when
  // a route commit re-registers window responders and the transfer authority
  // retires the previous generation. A mount that kept rendering with that
  // dead facade would throw ("overlay authority is no longer live") on its
  // next render; instead the mount re-mints a fresh transfer generation.
  const [transferGeneration, setTransferGeneration] = useState(0);
  const canonical = runtime.apps.getApp(app.id);
  const registrationAuthority = runtime.appManager.getManagerForApp(app.id);
  useInsertionEffect(() => () => {
    const lease = mountedLeaseRef.current;
    if (!lease || lease.state.key !== key || lease.state.registrationAuthority !== registrationAuthority) return;
    mountedLeaseRef.current = null;
    lease.locallyDisposed = true;
    lease.state.mount.dispose(new DOMException("Application mount lifecycle ended.", "AbortError"));
  }, [key, registrationAuthority]);
  useLayoutEffect(() => {
    // Exit presentations may retain this React tree after the close commit,
    // and a newly composed host can still contain the old app descriptor.
    // Closed lifecycle authority is terminal: never mint a transfer scope.
    if (runtime.lifecycle.getState(app.id) === "closed") {
      setMounted(null);
      return;
    }
    if (!canonical) {
      // Ordered teardown deletes the registry entry (AppRegistry.unregister
      // removes appInfo and the lifecycle record together) while window hosts
      // are still unmounting. An app that is still believed to be running
      // (active/ready/launching) losing its registration is real corruption
      // and must surface. A completed unregister is identifiable because the
      // app manager record was removed atomically with AppInfo; lifecycle
      // state alone is insufficient because suspended/idle/failed Keep
      // Windows mounts are all legitimate live mounts.
      const lifecycleState = runtime.lifecycle.getState(app.id);
      const tearingDown = runtime.disposalState !== "running"
        || lifecycleState === "closed"
        || runtime.store.getSnapshot().managers[app.id] === undefined;
      if (tearingDown) {
        setMounted(null);
        return;
      }
      throw new DOMException(`Application ${app.id} is no longer registered.`, "SecurityError");
    }
    if (!registrationAuthority) {
      if (runtime.disposalState !== "running") {
        setMounted(null);
        return;
      }
      throw new DOMException(`Application ${app.id} has no registration authority.`, "SecurityError");
    }
    let lease = mountedLeaseRef.current;
    if (lease && lease.state.hostFontResourceLoader !== hostFontResourceLoader) {
      lease.locallyDisposed = true;
      lease.state.mount.dispose(new DOMException("Host font catalogue changed.", "AbortError"));
    }
    if (
      lease?.state.key !== key ||
      lease?.state.registrationAuthority !== registrationAuthority ||
      lease?.state.mount.runtime.signal.aborted
    ) {
      lease = null;
      mountedLeaseRef.current = null;
    }
    if (!lease) {
      let mount: MountedSynWareRuntime;
      try {
        mount = createMountedSynWareRuntime({
          runtime,
          app: canonical,
          responderId,
          ...(hostFontResourceLoader ? { hostFontResourceLoader } : {}),
          ...(windowControllerId === undefined ? {} : { windowControllerId }),
        });
      } catch (error) {
        // Only an authoritative teardown may turn a failed re-mint into an
        // empty tree. A live registration/window with a retired transfer must
        // surface the error instead of hiding responder or registry corruption.
        const lifecycleState = runtime.lifecycle.getState(app.id);
        const windowGone = windowControllerId !== undefined && !runtime.windows.list().some(({ id }) => id === windowControllerId);
        const authoritativeTeardown = runtime.disposalState !== "running" || lifecycleState === "closed" || windowGone;
        if (transferGeneration > 0 && authoritativeTeardown) {
          setMounted(null);
          return;
        }
        throw error;
      }
      const state = Object.freeze({ key, registrationAuthority, mount, hostFontResourceLoader, contextBase: createSynWareContextValue(mount.runtime) });
      lease = { state, locallyDisposed: false };
      mountedLeaseRef.current = lease;
    }
    const activeLease = lease;
    const mount = activeLease.state.mount;
    const handleExternalAbort = () => {
      if (activeLease.locallyDisposed) return;
      const abortReason = mount.runtime.signal.reason;
      const supersededByMountedGeneration = abortReason instanceof DOMException
        && abortReason.name === "AbortError"
        && abortReason.message === "Application transfer mount superseded by a newer mounted generation.";
      // Responder authority is revoked synchronously, including from a React
      // insertion-effect cleanup. Publish the replacement mount after that
      // commit phase so an external abort cannot schedule React work from an
      // insertion effect; the microtask still runs before the next input turn.
      queueMicrotask(() => {
        if (activeLease.locallyDisposed) return;
        if (mountedLeaseRef.current === activeLease) mountedLeaseRef.current = null;
        setMounted((current) => current === activeLease.state ? null : current);
        if (!supersededByMountedGeneration) setTransferGeneration((value) => value + 1);
      });
    };
    mount.runtime.signal.addEventListener("abort", handleExternalAbort);
    setMounted(activeLease.state);
    return () => {
      mount.runtime.signal.removeEventListener("abort", handleExternalAbort);
    };
  }, [app.id, canonical, hostFontResourceLoader, key, registrationAuthority, responderId, runtime, transferGeneration, windowControllerId]);

  const context = useMemo(() => {
    if (!mounted || !branding) return null;
    return Object.freeze({ ...mounted.contextBase, branding });
  }, [branding, mounted]);

  const loadedDefinition = runtime.bundles.getLoadedBundle(app.id)?.definition
    ?? runtime.bundles.getBundle(app.id)?.synWareDefinition
    ?? null;
  const routeGraph = loadedDefinition?.routes ?? null;
  const trackRouteSessionCleanup = (session: ReturnType<typeof createAppRouteSession>) => {
    const receipt = session.getCleanupReceipt();
    if (!receipt) return;
    trackRuntimeSettlement(runtime, receipt, { owner: "route-session", kind: "cleanup", label: app.id });
  };
  const routeSession = useMemo(() => {
    if (!mounted || !context || !routeGraph) return null;
    let bundleIdentity = runtime.bundles.getBundle(app.id);
    let bundleGeneration = 0;
    let session: ReturnType<typeof createAppRouteSession> | null = null;
    const created = createAppRouteSession({
      graph: routeGraph,
      getBundleGeneration() {
        const next = runtime.bundles.getBundle(app.id);
        if (next !== bundleIdentity) {
          bundleIdentity = next;
          bundleGeneration += 1;
        }
        return bundleGeneration;
      },
      getAuthorizationGeneration: runtime.routes.routeGraph.getAuthorizationGeneration,
      getSessionId: () => context.sessionId,
      subscribeAuthorityChanges(listener) {
        const notify = () => {
          listener();
          if (session) trackRouteSessionCleanup(session);
        };
        const identity = runtime.identity.session.subscribe(notify);
        const updated = runtime.events.subscribe("bundle.update", notify);
        const removed = runtime.events.subscribe("bundle.unregister", notify);
        return () => {
          identity(); updated(); removed();
        };
      },
      createLoaderServices: ({ signal }) => createRouteServiceScope(runtime, app.id, signal, "mounted"),
      resolveRouteDefinition: (definition, signal) => runtime.routes.routeGraph.resolveDefinition(app.id, definition, signal),
      routeDataTimeoutMs: 15_000,
      setTimeout: runtime.environment.setTimeout,
      clearTimeout: runtime.environment.clearTimeout,
    });
    session = created;
    return created;
  }, [app.id, context, mounted, routeGraph, runtime]);
  const routeParticipant = useMemo(() => routeSession && context ? createMountedRouteParticipant({
    session: routeSession,
    signal: context.signal,
    setTimeout: runtime.environment.setTimeout,
    clearTimeout: runtime.environment.clearTimeout,
  }) : null, [routeSession, context, runtime]);
  // Session disposal follows actual ownership, not StrictMode layout probes.
  useInsertionEffect(() => () => {
    if (!routeSession) return;
    routeSession.dispose();
    trackRouteSessionCleanup(routeSession);
  }, [routeSession, runtime, app.id]);
  useLayoutEffect(() => {
    if (!routeParticipant || !context) return;
    const revoke = () => {
      if (!routeSession) return;
      routeSession.dispose();
      trackRouteSessionCleanup(routeSession);
    };
    context.signal.addEventListener("abort", revoke, { once: true });
    if (context.signal.aborted) revoke();
    const release = runtime.routes.mountedRoutes.attach(app.id, routeParticipant);
    const current = runtime.routes.mountedRoutes.current(app.id);
    // A headless route may have committed before its view attached. It still
    // carries the canonical operation id; reattachment is deduplicated.
    if (current && !current.signal.aborted) void routeParticipant.loadAndRender(current).catch(() => undefined);
    return () => { release(); context.signal.removeEventListener("abort", revoke); };
  }, [app.id, context, routeParticipant, routeSession, runtime]);
  const preloadRoute = useMemo(() => async (href: string, options: { readonly data?: boolean; readonly signal?: AbortSignal }) => {
    if (!routeGraph || !context) throw new DOMException("Route mount is unavailable.", "InvalidStateError");
    const signal = options.signal ? AbortSignal.any([context.signal, options.signal]) : context.signal;
    signal.throwIfAborted();
    const route = routeGraph.recognize(href);
    if (route.kind !== "match") throw new Error("route-not-found");
    return runtime.routes.routeGraph.preload(app.id, href, signal, { data: options.data === true });
  }, [app.id, routeGraph, context, runtime]);

  const routeAuthority = useMemo(() => () => Object.freeze({
    operationId: runtime.routes.getCurrentOperationId(),
    authorizationGeneration: runtime.routes.routeGraph.getAuthorizationGeneration(),
  }), [runtime]);
  const absoluteRouteUrl = useMemo(() => {
    const origin = runtime.environment.browser.getLocation().origin;
    return (href: string) => {
      const url = new URL(href, origin);
      if (url.origin !== origin) throw new DOMException("A named route URL must belong to this host.", "SecurityError");
      return url.href;
    };
  }, [runtime]);
  const retryRoute = useMemo(() => () => {
    if (!context || !routeSession) return;
    const route = routeSession.getSnapshot().route;
    if (!route) return;
    runtime.routes.routeGraph.invalidateModules(app.id);
    context.navigation.openRoute(`${route.pathname}${route.search}${route.hash}`, { historyMode: "replace", context: { routeRetry: true } });
  }, [app.id, context, routeSession, runtime]);

  const inspectorSettlement = useMemo(() => {
    if (!import.meta.env.DEV || app.id !== "diagnostics") return undefined;
    return getRuntimeSettlement(runtime);
  }, [app.id, runtime]);
  const inspectorRoutes = useMemo<InspectorRouteInspectionPort | undefined>(() => {
    if (!import.meta.env.DEV || app.id !== "diagnostics" || !routeGraph || !routeSession) return undefined;
    return Object.freeze({
      runtimeId: runtime.runtimeId,
      read() {
        const snapshot = routeSession.getSnapshot();
        const mountedRequest = runtime.routes.mountedRoutes.current(app.id);
        const operationId = mountedRequest?.operationId ?? runtime.routes.getCurrentOperationId();
        const graphs = runtime.apps.getAllApps().flatMap((candidate) => {
          const graph = runtime.bundles.getLoadedBundle(candidate.id)?.definition.routes;
          return graph ? [Object.freeze({ id: graph.id, appId: candidate.id, routes: graph.routes })] : [];
        });
        const modules = snapshot.route?.branch.flatMap((name) => {
          const declared = routeGraph.getRoute(name);
          if (!declared?.lazy) return [];
          const resolved = routeSession.getDefinition(name);
          const node = snapshot.nodes[name];
          const status = resolved !== declared
            ? "ready"
            : node?.state === "loading"
              ? "loading"
              : node?.state === "error"
                ? "error"
                : "idle";
          return [Object.freeze({
            id: `${app.id}:module:${name}`,
            appId: app.id,
            operationId,
            status,
            revision: node?.revision ?? snapshot.revision,
          })];
        }) ?? [];
        return Object.freeze({
          current: Object.freeze({
            route: runtime.routes.routeGraph.current(),
            latestOperationId: runtime.routes.getCurrentOperationId(),
          }),
          graphs: Object.freeze(graphs),
          sessions: Object.freeze([Object.freeze({ appId: app.id, operationId, snapshot })]),
          transitions: runtime.routes.inspectTransitions(),
          modules: Object.freeze(modules),
        });
      },
      subscribe(listener: () => void) {
        const notify = () => listener();
        const removers = [
          routeSession.subscribe(notify),
          runtime.operations.subscribe(notify),
          runtime.routes.subscribeTransitions(notify),
          runtime.events.subscribe("bundle.register", notify),
          runtime.events.subscribe("bundle.update", notify),
          runtime.events.subscribe("bundle.unregister", notify),
          runtime.events.subscribe("app.register", notify),
          runtime.events.subscribe("app.register.update", notify),
          runtime.events.subscribe("app.unregister", notify),
        ];
        return () => removers.forEach((remove) => remove());
      },
    });
  }, [app.id, routeGraph, routeSession, runtime]);

  if (!branding) throw new Error("A mounted SynWare requires resolved site branding.");

  // Never render a prior app/window generation under newly changed props.
  if (!canonical || !registrationAuthority || !mounted || !context || mounted.key !== key || mounted.registrationAuthority !== registrationAuthority || mounted.mount.runtime.signal.aborted) return null;
  const mountedChildren = routeGraph && routeSession
    ? (
        <SynWareRouteSessionProvider graph={routeGraph} session={routeSession} onRenderRevision={routeParticipant?.acknowledge} onRenderError={routeParticipant?.reportRenderError} preload={preloadRoute} authority={routeAuthority} retry={retryRoute} absoluteUrl={absoluteRouteUrl}>
          {children}
        </SynWareRouteSessionProvider>
      )
    : children;
  const presentedChildren = import.meta.env.DEV && app.id === "diagnostics"
    ? (
        <div data-syncloudos-dev-inspector-host style={{ display: "grid", blockSize: "100%", minBlockSize: 0, gridTemplateRows: "minmax(0, 1fr) minmax(14rem, 42%)", overflow: "hidden" }}>
          <div style={{ minBlockSize: 0, overflow: "auto" }}>{mountedChildren}</div>
          <div style={{ minBlockSize: 0, overflow: "auto" }}>
            <DevInspectorRegion
              runtime={runtime}
              appId={app.id}
              mountSignal={context.signal}
              enabled={true}
              settlement={inspectorSettlement}
              routes={inspectorRoutes}
            />
          </div>
        </div>
      )
    : mountedChildren;
  return (
    <SynCloudOSRuntimeContext.Provider value={null}>
      <SynWareRuntimeContext.Provider value={mounted.mount.runtime}>
        <SynWareProvider value={context}>
          <MountedAppPresentationBoundary runtime={mounted.mount.runtime} kernelRuntime={runtime}>
            {presentedChildren}
          </MountedAppPresentationBoundary>
        </SynWareProvider>
      </SynWareRuntimeContext.Provider>
    </SynCloudOSRuntimeContext.Provider>
  );
}
