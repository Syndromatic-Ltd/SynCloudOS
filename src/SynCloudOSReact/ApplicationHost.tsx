/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */

import { useLayoutEffect, useMemo, useRef } from "react";
import { NSEAlertBackdrop } from "../NSE/SystemUI";
import { NSEWindowSurfaceBridgeProvider, useNSEDeferredDisposal } from "../NSE/NSE";
import { nseDeferredDisposalMicrotaskScheduler } from "../NSE/hostComposition";
import { SynWareEntryRenderer } from "../Webspring/SynWareEntryRenderer";
import { SystemUILayer } from "../Webspring/SystemUILayer";
import { SystemPanelsLayer } from "../Webspring/SystemPanelsLayer";
import { createTransientWindowSurfaceBridge, WindowContentRendererRegistry, WindowLayer } from "../Webspring/WindowLayer";
import { SynCloudOSWatchdog } from "../SynCloudOS/ErrorManager/SynCloudOSWatchdog";
import { FocusScope } from "./FocusScope";
import { ResponderScope } from "./ResponderScope";
import { useKernelSynCloudOS } from "./runtimeContext";
import { useRuntimeSelector } from "./runtimeHooks";
import { useResolvedMode } from "./serviceHooks";
import { useRuntimeNSEOverlayPort } from "./nseFocusPort";
import { activateResponderHierarchy, clearOwnedResponderAnchor } from "./responderHierarchy";
import { SystemAlert } from "./SystemAlert";

/** Production presentation owner for an application-only browser mount.
 * Launch is owned by browser boot/routes, never a render effect: closing or
 * suspending the application must not silently launch another generation. */
export function ApplicationHost({ applicationId }: { readonly applicationId: string }) {
  const runtime = useKernelSynCloudOS();
  const snapshot = useRuntimeSelector(value => value);
  const appearance = useResolvedMode();
  const app = snapshot.appInfo[applicationId];
  const state = snapshot.lifecycle[applicationId];
  const presented = snapshot.application.activeAppId === applicationId && state === "active";
  const mounted = app && (state === "active" || state === "suspended");
  const responderId = `application:${applicationId}`;
  const renderers = useMemo(() => new WindowContentRendererRegistry(), []);
  useNSEDeferredDisposal(renderers, nseDeferredDisposalMicrotaskScheduler);
  const overlayPort = useRuntimeNSEOverlayPort(responderId);
  const bridge = useMemo(() => createTransientWindowSurfaceBridge({
    runtime, renderers, physicalHostId: `application-host:${applicationId}`,
    owner: { workspaceId: "workspace:default", applicationId, applicationSessionId: applicationId },
    restoreFocus: anchor => overlayPort.restoreFocus(responderId, anchor),
  }), [applicationId, overlayPort, renderers, responderId, runtime]);
  useNSEDeferredDisposal(bridge, nseDeferredDisposalMicrotaskScheduler);
  const root = useRef<HTMLElement>(null);
  const undoOwner = useMemo(() => ({ kind: "application" as const, id: applicationId }), [applicationId]);
  useLayoutEffect(() => {
    if (!presented) return;
    activateResponderHierarchy(runtime, { responderId, applicationResponderId: responderId });
    const element = root.current;
    const active = element?.ownerDocument.activeElement;
    if (element && (!active || active === element.ownerDocument.body)) element.focus({ preventScroll: true });
    return () => clearOwnedResponderAnchor(runtime, "application", responderId);
  }, [presented, responderId, runtime]);
  const latest = snapshot.errors.at(-1);
  const error = latest ? { ...latest, suggestedActions: [...new Set([
    ...(latest.suggestedActions ?? ["dismiss" as const]).filter(action => action !== "returnToWebspring"), "reload" as const,
  ])] } : null;
  const browserWindow = runtime.environment.browser.getWindow();
  return <>
    {mounted ? <ResponderScope asChild responderId={responderId} kind="application" parentResponderId="workspace"
      scopeId={responderId} undoOwner={undoOwner} diagnosticsLabel={app.displayName}>
      <section ref={root} data-syncloudos-application-host={applicationId} tabIndex={-1}
        hidden={!presented} inert={!presented ? true : undefined} aria-label={app.displayName}
        style={{ position: "fixed", inset: 0, overflow: "hidden", margin: 0 }}>
        <SynCloudOSWatchdog runtime={runtime} watchdogName={`${app.packageName} application`} scope="app" app={app}
          resetKey={applicationId} fallback={() => null}>
          <NSEWindowSurfaceBridgeProvider bridge={bridge}>
          <SynWareEntryRenderer runtime={runtime} app={app} responderId={responderId} isLoading={false}
            loadingClassName="syncloudos-application-loading" loadingLabel={`Loading ${app.displayName}`}
            loadingPackageLabel={`Loading ${app.packageName}`} missingComponentLabel={`Could not load ${app.displayName}.`} />
          </NSEWindowSurfaceBridgeProvider>
        </SynCloudOSWatchdog>
      </section>
    </ResponderScope> : null}
    <SystemPanelsLayer windowContentRegistry={renderers} />
    <WindowLayer contentRegistry={renderers} />
    <SystemUILayer siteName={app?.displayName ?? applicationId} onLogOut={async () => {
      const result = await runtime.commands.dispatch("session.logOut", undefined, { source: "system" });
      return result.status === "executed";
    }} />
    {error ? <FocusScope asChild key={error.id} scopeId={`application-host-error:${error.id}`} kind="modal" parentResponderId="runtime" trapFocus>
      <NSEAlertBackdrop onSafeDismiss={error.recoverable === false ? undefined : () => runtime.errors.dismiss(error.id)}>
        <SystemAlert error={error} appearance={appearance} applicationIcon={app?.icon.src ?? null}
          onDismiss={() => runtime.errors.dismiss(error.id)} onReload={() => browserWindow?.location.reload()}
          onReturn={() => browserWindow?.location.reload()}
          onOpenMailClient={destination => browserWindow?.location.assign(destination)} />
      </NSEAlertBackdrop>
    </FocusScope> : null}
  </>;
}
