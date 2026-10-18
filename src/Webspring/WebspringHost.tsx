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

import { Component, createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ErrorInfo, type PropsWithChildren, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { NSEFocusPortProvider, useNSEDeferredDisposal } from "../NSE/NSE";
import { NSEPresence, useNSEAnimationEnvironment, useNSEPresentation } from "../NSE/Animation";
import { useWebspringMotion } from "./Webspring.transitions";
import { nseDeferredDisposalMicrotaskScheduler, useNSEFeedback } from "../NSE/hostComposition";
import { MaterialProvider } from "../NSE/Material";
import { LoginWindow } from "../NSE/SystemUI";
import { LoginGatePresenter } from "../SynCloudOS/RootRuntime";
import type { RuntimeSnapshot } from "../SynCloudOS/SynCloudOS";
import type { AuthenticationInput, Presentation, WebspringDefinition, WebspringViewComponent } from "./webspringTypes";
import { SystemStartupLayer, type SystemStartupPhase } from "./SystemStartupLayer";
import { ApplicationStageLayer } from "./ApplicationStageLayer";
import { syncApplicationWindowContentRenderers, WindowContentRendererRegistry, WindowLayer, type ApplicationWindowRendererRegistrations } from "./WindowLayer";
import { FocusScope, HostSiteBrandingProvider, useKernelSynCloudOS, useRuntimeNSEFocusPort, useRuntimeSelector } from "../SynCloudOSReact";
import { presentationForSizeClass, WebspringController, type SynCloudOSShellResources } from "./WebspringController";
import { WebspringQuickSwitchView } from "./WebspringQuickSwitchView";
import { WebspringIconEffectProvider } from "./WebspringIconEffect";
import { WebspringFolderAppearanceProvider } from "./WebspringFolderAppearance";
import { SystemPanelsLayer } from "./SystemPanelsLayer";
import { NotificationCentrePresenter } from "./NotificationCentrePresenter";
import { WebspringStatusLayer } from "./WebspringStatusLayer";
import { useWebspringResponder } from "./useWebspringResponder";
import { useWebspringReturnCompletion } from "./useWebspringReturnCompletion";
import { defaultWebspringLaunchZoom, defaultWebspringReturnTracks } from "./Webspring";
import { WebspringLaunchZoomContext } from "./WebspringLaunchZoomContext";
import { useWebspringEntrance } from "./useWebspringEntrance";
import { scheduleWebspringIdlePrefetch } from "./webspringPrefetch";
import { WebspringContentController, type WebspringContentSources } from "./webspringContent";
import { EMPTY_WEBSPRING_FOLDER_CONFIGURATION, WEBSPRING_PRESENTATION_ROLES, getOrderedVisibleWebspringApps } from "../SynCloudOS/SynCloudOS";
import "./WebspringHost.css";

interface WebspringHostPresentationContextValue {
  readonly quickSwitchOpen: boolean;
  readonly requestNotificationCentre: (notificationId?: string) => void;
}

const emptyContentSources: WebspringContentSources = Object.freeze({});
const emptyAuthenticationSnapshot = Object.freeze({ status: "disabled" as const, methods: Object.freeze([]), profile: null, expiresAt: null, error: null });
const emptyAuthenticationGetter = () => emptyAuthenticationSnapshot;
const emptySubscribe = () => () => undefined;

const WebspringHostPresentationContext = createContext<WebspringHostPresentationContextValue>({
  quickSwitchOpen: false,
  requestNotificationCentre: () => undefined,
});

export function useWebspringHostPresentation() {
  return useContext(WebspringHostPresentationContext);
}

function LoginModalFocusScope({ children }: PropsWithChildren) {
  return <FocusScope scopeId="system-ui:login" kind="modal" parentResponderId="runtime" modal trapFocus>{children}</FocusScope>;
}

/** Dims the shell behind the login window, presented through AnimationFX. */
function LoginBackdrop() {
  const backdropRef = useRef<HTMLDivElement>(null);
  useNSEPresentation(backdropRef, useWebspringMotion().loginBackdropDim);
  return <div ref={backdropRef} className="syncloudos-login-backdrop" aria-hidden="true" />;
}

function equalHostSnapshot(left: RuntimeSnapshot, right: RuntimeSnapshot) {
  return left.appInfo === right.appInfo &&
    left.application === right.application &&
    left.errors === right.errors &&
    left.lifecycle === right.lifecycle &&
    left.loginServices === right.loginServices &&
    left.localeServices === right.localeServices &&
    left.notifications === right.notifications &&
    left.statechart === right.statechart &&
    left.webspring === right.webspring;
}

interface ViewBoundaryProps {
  readonly fallbackViewId: string | null;
  readonly onFallback: () => void;
  readonly children: ReactNode;
}

interface ViewBoundaryState { readonly error: Error | null; }

class WebspringViewBoundary extends Component<ViewBoundaryProps, ViewBoundaryState> {
  state: ViewBoundaryState = { error: null };
  static getDerivedStateFromError(error: Error): Partial<ViewBoundaryState> { return { error }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) {}
  render() {
    if (!this.state.error) return this.props.children;
    return <section role="alert" className="webspring-view-recovery">
      <h1>Webspring view unavailable</h1>
      <p>{this.state.error.message}</p>
      <button type="button" onClick={() => this.setState({ error: null })}>Retry view</button>
      {this.props.fallbackViewId ? <button type="button" onClick={this.props.onFallback}>Use fallback view</button> : null}
    </section>;
  }
}

function ApplicationOutletSlot({ container }: { readonly container: HTMLElement }) {
  const slot = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = slot.current;
    if (!element) return;
    element.appendChild(container);
  }, [container]);
  return <div ref={slot} className="webspring-application-outlet" />;
}

export function WebspringHost({
  shell,
  shellResources,
  authentication = "disabled",
  startupPhase,
  contentSources = emptyContentSources,
}: {
  readonly shell: WebspringDefinition;
  readonly shellResources?: SynCloudOSShellResources;
  readonly authentication?: AuthenticationInput;
  readonly startupPhase?: SystemStartupPhase;
  readonly contentSources?: WebspringContentSources;
}) {
  const runtime = useKernelSynCloudOS();
  const snapshot = useRuntimeSelector((state) => state, equalHostSnapshot);
  const traits = useSyncExternalStore(runtime.presentationTraits.subscribe, runtime.presentationTraits.getSnapshot, runtime.presentationTraits.getSnapshot);
  const presentation = presentationForSizeClass(traits.horizontalSizeClass);
  const authenticationService = typeof authentication === "object" ? authentication.service : null;
  useSyncExternalStore(authenticationService?.subscribe ?? emptySubscribe, authenticationService?.getSnapshot ?? emptyAuthenticationGetter, authenticationService?.getSnapshot ?? emptyAuthenticationGetter);
  const [controllerRetry, setControllerRetry] = useState(0);
  const contentController = useMemo(() => new WebspringContentController(shell.content, contentSources), [contentSources, shell]);
  const contentSections = useSyncExternalStore(contentController.subscribe, contentController.getSnapshot, contentController.getSnapshot);
  useEffect(() => {
    contentController.start();
    const browserWindow = runtime.environment.browser.getWindow();
    const refresh = () => { void contentController.refresh(); };
    browserWindow?.addEventListener("focus", refresh);
    return () => {
      browserWindow?.removeEventListener("focus", refresh);
      contentController.dispose();
    };
  }, [contentController, runtime]);
  const controllerOutcome = useMemo(() => {
    try {
      return { controller: new WebspringController(runtime, shell, shellResources, authentication, contentController), error: null };
    } catch (error) {
      return { controller: null, error: error instanceof Error ? error : new Error("Webspring host configuration failed.") };
    }
  }, [authentication, contentController, controllerRetry, runtime, shell, shellResources]);
  const controller = controllerOutcome.controller;
  const [viewOverride, setViewOverride] = useState<{ presentation: Presentation; id: string } | null>(null);
  const viewId = viewOverride?.presentation === presentation ? viewOverride.id : controller?.viewId(presentation) ?? "configuration-error";
  const returnTracks = shell.returnTracks[viewId] ?? defaultWebspringReturnTracks;
  const { completeTrack } = useWebspringReturnCompletion(snapshot.webspring.returnTransitionId, returnTracks);
  const viewActions = useMemo(() => controller ? Object.freeze({ ...controller.actions, completeReturnTrack: completeTrack }) : null, [completeTrack, controller]);
  // Shell views' modal surfaces (an open folder) trap focus in the runtime's focus graph.
  const viewFocusPort = useRuntimeNSEFocusPort("webspring");
  const View = (shell.components[viewId] ?? function MissingWebspringView(): never {
    throw new TypeError(`Webspring view ${viewId} is not registered.`);
  }) as WebspringViewComponent;
  const fallbackViewId = controller?.fallbackViewId(presentation, viewId) ?? null;
  // One registry for the host's life: the system panels and apps' transient
  // surfaces keep their renderers in it while apps launch and quit, so only
  // the application renderers are synchronised with the app list.
  const [registry] = useState(() => new WindowContentRendererRegistry());
  const [applicationRenderers] = useState<ApplicationWindowRendererRegistrations>(() => new Map());
  useLayoutEffect(() => {
    syncApplicationWindowContentRenderers(registry, runtime, snapshot.appInfo, applicationRenderers);
  }, [applicationRenderers, registry, runtime, snapshot.appInfo]);
  useNSEDeferredDisposal(registry, nseDeferredDisposalMicrotaskScheduler);
  const [outletContainer] = useState(() => {
    const document = runtime.environment.browser.getDocument();
    if (!document) throw new TypeError("WebspringHost requires a browser document.");
    const element = document.createElement("div");
    element.className = "webspring-application-outlet-host";
    return element;
  });
  const stagingAppId = snapshot.webspring.launchPhase === "staging" ? snapshot.webspring.launchingAppId : null;
  const feedback = useNSEFeedback();
  const { reducedMotion } = useNSEAnimationEnvironment();
  const phase = startupPhase ?? "complete";
  const authenticationPolicy = typeof authentication === "object" ? authentication.policy : authentication;
  const gateRequested = authenticationPolicy !== "disabled" && snapshot.statechart.currentState === "locked.loginWindow";
  const loginContinuationKey = `webspring:${shell.manifest.id}:${shell.manifest.webspringShell.homeRoute}:login-continuation`;
  const [resumeLogin] = useState(() => {
    try { return authenticationPolicy !== "disabled" && runtime.environment.sessionStorage?.getItem(loginContinuationKey) === "pending"; }
    catch { return false; }
  });
  const setLoginContinuation = useCallback((pending: boolean) => {
    try {
      const storage = runtime.environment.sessionStorage;
      if (pending) storage?.setItem(loginContinuationKey, "pending");
      else storage?.removeItem(loginContinuationKey);
    } catch { /* Storage is optional; this marker controls presentation only. */ }
  }, [loginContinuationKey, runtime]);
  const { entrancePhase, loginReady, restoringLogin, onLoginExited } = useWebspringEntrance(runtime.environment, phase === "complete", gateRequested, reducedMotion, resumeLogin);
  const finishLoginExit = useCallback(() => {
    if (gateRequested) return;
    setLoginContinuation(false);
    onLoginExited();
  }, [gateRequested, onLoginExited, setLoginContinuation]);
  const model = controller?.model(runtime.store.getSnapshot(), presentation, contentSections, entrancePhase) ?? null;
  const [notificationCentreRequest, setNotificationCentreRequest] = useState<{ key: number; notificationId?: string | null } | null>(null);
  const [quickSwitchOpen, setQuickSwitchOpen] = useState(false);
  const applicationMenuToggleRef = useRef<{ appId: string; toggle: () => void } | null>(null);
  const layoutPreference = snapshot.webspring.layout.preference;
  const folderConfiguration = snapshot.webspring.layout.folderConfiguration;
  const orderedApps = useMemo(
    () => getOrderedVisibleWebspringApps(Object.values(snapshot.appInfo), layoutPreference, folderConfiguration),
    [snapshot.appInfo, layoutPreference, folderConfiguration],
  );
  const canUseQuickSwitch = !snapshot.webspring.layout.isEditing &&
    phase === "complete" && !gateRequested &&
    (authenticationPolicy !== "required" || snapshot.loginServices.isAuthorised) &&
    orderedApps.length > 0;
  const requestNotificationCentre = useCallback((notificationId?: string) => {
    setNotificationCentreRequest((current) => ({ key: (current?.key ?? 0) + 1, notificationId: notificationId ?? null }));
  }, []);
  const toggleQuickSwitch = useCallback(() => {
    if (!canUseQuickSwitch) return;
    setQuickSwitchOpen((current) => !current);
    feedback?.trigger("selection");
  }, [canUseQuickSwitch, feedback]);
  const registerApplicationMenuToggle = useCallback((appId: string, toggle: () => void, ready: boolean) => {
    if (ready && appId === runtime.store.getSnapshot().application.activeAppId) applicationMenuToggleRef.current = { appId, toggle };
    return () => {
      if (applicationMenuToggleRef.current?.toggle === toggle) applicationMenuToggleRef.current = null;
    };
  }, [runtime]);
  const requestApplicationMenuToggle = useCallback(() => {
    const entry = applicationMenuToggleRef.current;
    const current = runtime.store.getSnapshot();
    if (!entry || entry.appId !== current.application.activeAppId || current.application.multiSwitch.status === "switching") return;
    entry.toggle();
  }, [runtime]);
  useWebspringResponder({ onNotificationCentreRequest: requestNotificationCentre, onApplicationMenuToggle: requestApplicationMenuToggle });
  useEffect(() => {
    runtime.webspring.configureFolders(shell.manifest.webspringShell.folders ?? EMPTY_WEBSPRING_FOLDER_CONFIGURATION);
    runtime.webspring.hydrateLayoutPreference();
  }, [runtime, shell]);
  useEffect(() => {
    if (startupPhase === "complete" && snapshot.loginServices.isAuthorised) scheduleWebspringIdlePrefetch(runtime);
  }, [runtime, snapshot.loginServices.isAuthorised, startupPhase]);
  useEffect(() => runtime.events.subscribe("webspring.quickSwitch.toggle", toggleQuickSwitch), [runtime, toggleQuickSwitch]);
  useEffect(() => {
    if (quickSwitchOpen && !canUseQuickSwitch) setQuickSwitchOpen(false);
  }, [canUseQuickSwitch, quickSwitchOpen]);
  const applicationOutlet = <ApplicationOutletSlot container={outletContainer} />;
  const launchZoom = shell.launchZooms?.[viewId] ?? defaultWebspringLaunchZoom;
  const applicationStage = <WebspringLaunchZoomContext.Provider value={launchZoom}><ApplicationStageLayer
    windowContentRegistry={registry}
    apps={snapshot.appInfo}
    lifecycle={snapshot.lifecycle}
    multiSwitch={snapshot.application.multiSwitch}
    returnTransitionId={snapshot.webspring.returnTransitionId}
    activeAppId={snapshot.application.activeAppId}
    stagingAppId={stagingAppId}
    launchTransitionId={snapshot.webspring.launchTransitionId}
    presentationSettlementId={snapshot.webspring.presentationSettlementId}
    quickSwitchOpen={quickSwitchOpen}
    onQuickSwitchRequest={toggleQuickSwitch}
    onApplicationMenuToggleRegister={registerApplicationMenuToggle}
  /></WebspringLaunchZoomContext.Provider>;
  useEffect(() => {
    const id = snapshot.webspring.presentationSettlementId;
    if (!id) return;
    const role = snapshot.application.routePath === shell.manifest.webspringShell.homeRoute
      ? WEBSPRING_PRESENTATION_ROLES.shell
      : snapshot.webspring.launchPhase === "covered"
        ? WEBSPRING_PRESENTATION_ROLES.shellReturn
        : null;
    if (role) runtime.presentationSettlements.get(id)?.completeRole(role);
  }, [runtime, shell, snapshot.application.routePath, snapshot.webspring.launchPhase, snapshot.webspring.presentationSettlementId]);

  const presentationContext = useMemo(() => ({ quickSwitchOpen, requestNotificationCentre }), [quickSwitchOpen, requestNotificationCentre]);
  const lastBranding = useRef(model?.branding ?? null);
  if (model?.branding) lastBranding.current = model.branding;

  return <HostSiteBrandingProvider value={model?.branding ?? lastBranding.current}><MaterialProvider><WebspringIconEffectProvider component={shell.iconEffect}>
    <WebspringFolderAppearanceProvider value={shell.folderAppearance}>
    <WebspringHostPresentationContext.Provider value={presentationContext}>
    <div className="webspring-view-host">
    {/* Keep entrance-owned inertness separate from the modal focus scope's sibling restoration. */}
    <div className="webspring-entrance-surface" inert={entrancePhase !== "ready"} aria-hidden={entrancePhase !== "ready" ? true : undefined}>
    {controller && model && viewActions ? <WebspringViewBoundary
      key={`${presentation}:${viewId}`}
      fallbackViewId={fallbackViewId}
      onFallback={() => { if (fallbackViewId) setViewOverride({ presentation, id: fallbackViewId }); }}
    >
      <NSEFocusPortProvider port={viewFocusPort}>
        <View model={model} actions={viewActions} applicationOutlet={applicationOutlet} folderPresentation={shell.folderPresentation} />
      </NSEFocusPortProvider>
    </WebspringViewBoundary> : <section role="alert" className="webspring-view-recovery">
      <h1>Webspring host unavailable</h1>
      <p>{controllerOutcome.error?.message}</p>
      <button type="button" onClick={() => setControllerRetry((value) => value + 1)}>Retry host</button>
    </section>}
    </div>
    </div>
    </WebspringHostPresentationContext.Provider>
    {/* Before the app stage, so the system's Colours panel is the one drawn. */}
    <SystemPanelsLayer windowContentRegistry={registry} />
    {createPortal(applicationStage, outletContainer)}
    <WindowLayer contentRegistry={registry} />
    <WebspringQuickSwitchView
      open={quickSwitchOpen}
      apps={orderedApps}
      lifecycle={snapshot.lifecycle}
      openAppIds={snapshot.application.openAppIds}
      activeAppId={snapshot.application.activeAppId}
      selectedAppId={snapshot.webspring.selectedAppId}
      overflow={shell.quickSwitch?.overflow ?? "shrink"}
      onClose={() => setQuickSwitchOpen(false)}
    />
    <NotificationCentrePresenter
      snapshot={snapshot}
      reducedMotion={traits.reducedMotion}
      openRequest={notificationCentreRequest}
      presentationReady={phase === "complete" && snapshot.loginServices.isAuthorised}
    />
    <LoginGatePresenter
      runtime={runtime}
      snapshot={snapshot}
      LoginWindowComponent={typeof authentication === "object" && authentication.loginComponent ? authentication.loginComponent : LoginWindow}
      ModalFocusScopeComponent={LoginModalFocusScope}
      BackdropComponent={LoginBackdrop}
      PresenceComponent={NSEPresence}
      title={model ? `Sign in to ${model.branding.name}` : undefined}
      branding={model?.branding}
      cancelLabel={runtime.locale.t("authentication.cancel", "Cancel")}
      authentication={authentication}
      ready={loginReady}
      restoring={restoringLogin}
      onExitComplete={finishLoginExit}
      onSignInPendingChange={setLoginContinuation}
    />
    <WebspringStatusLayer errors={snapshot.errors} />
    <SystemStartupLayer phase={phase} />
    </WebspringFolderAppearanceProvider>
  </WebspringIconEffectProvider></MaterialProvider></HostSiteBrandingProvider>;
}
