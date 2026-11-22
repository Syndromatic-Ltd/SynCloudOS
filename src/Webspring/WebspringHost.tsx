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

import { normalizeBundleIdentifier } from "../SynCloudOS/Identity/bundleIdentifier.mjs";
import { Component, createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ErrorInfo, type ReactNode } from "react";
import { FocusPortProvider, useNSEDeferredDisposal } from "../NSE/NSE";
import { useNSEAnimationEnvironment } from "../NSE/Animation";
import { nseDisposeFor, useNSEFeedback } from "../NSE/hostComposition";
import { MaterialProvider } from "../NSE/Material";
import { HostLoginGate } from "./HostLoginGate";
import type { RuntimeSnapshot } from "../SynCloudOS/SynCloudOS";
import type { AuthenticationInput, Presentation } from "./webspringTypes";
import { constructWSApplication, resolveLauncher, type WSApplication, type WSDefinition } from "./WSApplication";
import { WSLauncherRootView, wsSetLauncherHostState, type WSLauncherHostState, type WSLauncherViewController } from "./WSLauncherViewController";
import { WSBoardViewController } from "./Contents/Views/WSBoardViewController/WSBoardViewController";
import { SystemStartupLayer } from "./SystemStartupLayer";
import { SystemUILayer } from "./SystemUILayer";
import { nextState } from "../Foundation/internal/StateMachine";
import { systemStartupPhaseMachine, type SystemStartupPhase } from "../SynCloudOS/RootRuntime";
import { WSStageLayer } from "./WSStageLayer";
import { syncApplicationWindowContentRenderers, WindowContentRendererRegistry, WindowLayer, type ApplicationWindowRendererRegistrations } from "./WindowLayer";
import { HostSiteBrandingProvider, useKernelSynCloudOS, useRuntimeNSEFocusPort, useRuntimeSelector } from "../SynCloudOSReact";
import { presentationForSizeClass, WebspringController, type SynCloudOSShellResources } from "./WebspringController";
import { WindowPresentationContent } from "./WindowPresentationContent";
import { WebspringQuickSwitchView } from "./WebspringQuickSwitchView";
import { WSIconEffectProvider } from "./WSIconEffect";
import { WebspringFolderAppearanceProvider } from "./WebspringFolderAppearance";
import { SystemPanelsLayer } from "./SystemPanelsLayer";
import { NotificationCentrePresenter } from "./NotificationCentrePresenter";
import { WebspringStatusLayer } from "./WebspringStatusLayer";
import { useWebspringResponder } from "./useWebspringResponder";
import { useWebspringReturnCompletion } from "./useWebspringReturnCompletion";
import { WebspringLaunchZoomContext } from "./WebspringLaunchZoomContext";
import { useWebspringEntrance } from "./useWebspringEntrance";
import { scheduleWebspringIdlePrefetch } from "./webspringPrefetch";
import { EMPTY_WEBSPRING_FOLDER_CONFIGURATION, WEBSPRING_PRESENTATION_ROLES, getOrderedVisibleWebspringApps } from "../SynCloudOS/SynCloudOS";
import "./WebspringHost.css";

interface WebspringHostPresentationContextValue {
  readonly quickSwitchOpen: boolean;
  readonly requestNotificationCentre: (notificationId?: string) => void;
}

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

function selectRuntimePresentationReady(snapshot: RuntimeSnapshot) {
  return snapshot.booted || snapshot.statechart.currentState !== "booting";
}

interface ViewBoundaryProps {
  readonly fallbackAvailable: boolean;
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
      {this.props.fallbackAvailable ? <button type="button" onClick={this.props.onFallback}>Use fallback view</button> : null}
    </section>;
  }
}

/** Gives the launcher this render's state, then renders it inside its root view. */
function HostedLauncher({ launcher, state }: {
  readonly launcher: WSLauncherViewController;
  readonly state: WSLauncherHostState;
}) {
  launcher[wsSetLauncherHostState](state);
  return <WSLauncherRootView controller={launcher} />;
}

type HostRuntime = ReturnType<typeof useKernelSynCloudOS>;

/** Runs a shell lifecycle hook, reporting a thrown or rejected failure without stopping the shell. */
function runShellHook(runtime: HostRuntime, name: string, hook: () => void | Promise<void>) {
  const report = (error: unknown) => {
    runtime.errors.capture({
      code: "LIFECYCLE_HOOK_FAILED",
      title: "The Webspring shell could not finish a lifecycle step.",
      message: "The site keeps running, but part of its start-up or shutdown did not complete.",
      error,
      technicalMessage: `WSApplication.${name} failed.`,
    });
  };
  try {
    void Promise.resolve(hook()).catch(report);
  } catch (error) {
    report(error);
  }
}

/** The shell's `WSApplication`, constructed for the host's life and told when it launches and terminates. */
function useWSApplication(runtime: HostRuntime, shell: WSDefinition): WSApplication | null {
  const [application, setApplication] = useState<WSApplication | null>(null);
  useLayoutEffect(() => {
    const created = constructWSApplication(shell.application);
    runShellHook(runtime, "applicationWillFinishLaunching", () => created.applicationWillFinishLaunching());
    setApplication(created);
    return () => {
      runShellHook(runtime, "applicationWillTerminate", () => created.applicationWillTerminate());
      created[nseDisposeFor]("owner-unmounted");
      setApplication((current) => current === created ? null : current);
    };
  }, [runtime, shell]);
  useEffect(() => {
    if (application) runShellHook(runtime, "applicationDidFinishLaunching", () => application.applicationDidFinishLaunching());
  }, [application, runtime]);
  return application;
}

export function WebspringHost({
  shell,
  shellResources,
  authentication = "disabled",
  startupPhase,
}: {
  readonly shell: WSDefinition;
  readonly shellResources?: SynCloudOSShellResources;
  readonly authentication?: AuthenticationInput;
  readonly startupPhase?: SystemStartupPhase;
}) {
  const runtime = useKernelSynCloudOS();
  const snapshot = useRuntimeSelector((state) => state, equalHostSnapshot);
  const traits = useSyncExternalStore(runtime.presentationTraits.subscribe, runtime.presentationTraits.getSnapshot, runtime.presentationTraits.getSnapshot);
  const presentation = presentationForSizeClass(traits.horizontalSizeClass);
  const authenticationService = typeof authentication === "object" ? authentication.service : null;
  useSyncExternalStore(authenticationService?.subscribe ?? emptySubscribe, authenticationService?.getSnapshot ?? emptyAuthenticationGetter, authenticationService?.getSnapshot ?? emptyAuthenticationGetter);
  const [controllerRetry, setControllerRetry] = useState(0);
  const controllerOutcome = useMemo(() => {
    try {
      return { controller: new WebspringController(runtime, shell, shellResources, authentication), error: null };
    } catch (error) {
      return { controller: null, error: error instanceof Error ? error : new Error("Webspring host configuration failed.") };
    }
  }, [authentication, controllerRetry, runtime, shell, shellResources]);
  const controller = controllerOutcome.controller;
  // A custom launcher that fails can hand its presentation to the stock Board until the shell changes.
  const [fallback, setFallback] = useState<{ readonly shell: WSDefinition; readonly presentation: Presentation } | null>(null);
  const usingFallback = fallback?.shell === shell && fallback.presentation === presentation;
  const LauncherClass = usingFallback ? WSBoardViewController : resolveLauncher(shell, presentation);
  const returnTracks = usingFallback ? WSBoardViewController.returnTracks : shell.returnTracks[presentation];
  const { completeTrack } = useWebspringReturnCompletion(snapshot.webspring.returnTransitionId, returnTracks);
  const viewActions = useMemo(() => controller ? Object.freeze({ ...controller.actions, completeReturnTrack: completeTrack }) : null, [completeTrack, controller]);
  // Launchers' modal surfaces (an open folder) trap focus in the runtime's focus graph.
  const viewFocusPort = useRuntimeNSEFocusPort("webspring");
  const application = useWSApplication(runtime, shell);
  const launcher = useMemo(
    () => application ? new (LauncherClass as unknown as new (options: { owner: WSApplication }) => WSLauncherViewController)({ owner: application }) : null,
    [LauncherClass, application],
  );
  useEffect(() => () => { if (launcher && !launcher.isDisposed) launcher.dispose(); }, [launcher]);
  // One registry for the host's life: the system panels and apps' transient
  // surfaces keep their renderers in it while apps launch and quit, so only
  // the application renderers are synchronised with the app list.
  const [registry] = useState(() => new WindowContentRendererRegistry());
  const [applicationRenderers] = useState<ApplicationWindowRendererRegistrations>(() => new Map());
  useLayoutEffect(() => {
    syncApplicationWindowContentRenderers(registry, runtime, snapshot.appInfo, applicationRenderers);
  }, [applicationRenderers, registry, runtime, snapshot.appInfo]);
  useNSEDeferredDisposal(registry);
  const stagingAppId = snapshot.webspring.launchPhase === "staging" ? snapshot.webspring.launchingAppId : null;
  const feedback = useNSEFeedback();
  const { reducedMotion } = useNSEAnimationEnvironment();
  const presentationReady = useRuntimeSelector(selectRuntimePresentationReady);
  const [derivedStartupPhase, setStartupPhase] = useState<SystemStartupPhase>("booting");
  useEffect(() => {
    if (startupPhase !== undefined) return;
    setStartupPhase((current) => nextState(systemStartupPhaseMachine.definition, current, presentationReady ? "presentationReady" : "presentationPending") ?? current);
  }, [presentationReady, startupPhase]);
  const phase = startupPhase ?? derivedStartupPhase;
  const authenticationPolicy = typeof authentication === "object" ? authentication.policy : authentication;
  const handleLogOut = useCallback(async () => {
    const result = await runtime.commands.dispatch("session.logOut", undefined, { source: "system" });
    if (result.status === "failed" || result.status === "cancelled") return false;
    return result.status === "executed";
  }, [runtime]);
  useEffect(() => {
    if (authenticationPolicy === "disabled" || !controller) return;
    const command = runtime.commands.register({
      id: "session.requestSignIn", responderId: "runtime",
      title: { key: "command.session.requestSignIn", fallback: "Sign In" },
      payload: { description: "No payload.", parse: value => value === undefined
        ? { ok: true, value: undefined } : { ok: false, issues: ["Sign In takes no payload."] } },
      scope: "runtime", defaultKeyBindings: [], undo: { kind: "none" },
      validate: () => ({ enabled: !runtime.store.getSnapshot().loginServices.isAuthorised }),
      execute: () => controller.actions.requestSignIn(),
    });
    return () => { command.dispose(); };
  }, [authenticationPolicy, controller, runtime]);
  const gateRequested = authenticationPolicy !== "disabled" && snapshot.statechart.currentState === "locked.loginWindow";
  const loginContinuationKey = `webspring:${normalizeBundleIdentifier(shell.info.bundleIdentifier)}:${shell.info.homeRoute}:login-continuation`;
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
  const model = controller?.model(runtime.store.getSnapshot(), presentation, entrancePhase) ?? null;
  const [notificationCentreRequest, setNotificationCentreRequest] = useState<{ key: number; notificationId?: string | null } | null>(null);
  const [quickSwitchOpen, setQuickSwitchOpen] = useState(false);
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
  useWebspringResponder({ onNotificationCentreRequest: requestNotificationCentre });
  useEffect(() => {
    runtime.webspring.configureFolders(shell.info.folders ?? EMPTY_WEBSPRING_FOLDER_CONFIGURATION);
    runtime.webspring.hydrateLayoutPreference();
  }, [runtime, shell]);
  useEffect(() => {
    if (phase === "complete" && snapshot.loginServices.isAuthorised) scheduleWebspringIdlePrefetch(runtime);
  }, [phase, runtime, snapshot.loginServices.isAuthorised]);
  useEffect(() => runtime.events.subscribe("webspring.quickSwitch.toggle", toggleQuickSwitch), [runtime, toggleQuickSwitch]);
  useEffect(() => {
    if (quickSwitchOpen && !canUseQuickSwitch) setQuickSwitchOpen(false);
  }, [canUseQuickSwitch, quickSwitchOpen]);
  const launchZoom = usingFallback ? WSBoardViewController.launchZoom : shell.launchZooms[presentation];
  const applicationStage = <WebspringLaunchZoomContext.Provider value={launchZoom}><WSStageLayer
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
  /></WebspringLaunchZoomContext.Provider>;
  useEffect(() => {
    const id = snapshot.webspring.presentationSettlementId;
    if (!id) return;
    const role = snapshot.application.routePath === shell.info.homeRoute
      ? WEBSPRING_PRESENTATION_ROLES.shell
      : snapshot.webspring.launchPhase === "covered"
        ? WEBSPRING_PRESENTATION_ROLES.shellReturn
        : null;
    if (role) runtime.presentationSettlements.get(id)?.completeRole(role);
  }, [runtime, shell, snapshot.application.routePath, snapshot.webspring.launchPhase, snapshot.webspring.presentationSettlementId]);

  const presentationContext = useMemo(() => ({ quickSwitchOpen, requestNotificationCentre }), [quickSwitchOpen, requestNotificationCentre]);
  const lastBranding = useRef(model?.branding ?? null);
  if (model?.branding) lastBranding.current = model.branding;

  return <HostSiteBrandingProvider value={model?.branding ?? lastBranding.current}><MaterialProvider><WSIconEffectProvider component={shell.iconEffect}>
    <WebspringFolderAppearanceProvider value={shell.folderAppearance}>
    <WebspringHostPresentationContext.Provider value={presentationContext}>
    <div className="webspring-view-host" data-syncloudos-runtime-owner={runtime.runtimeId}>
    {/* Keep entrance-owned inertness separate from the modal focus scope's sibling restoration. */}
    <div className="webspring-entrance-surface" inert={entrancePhase !== "ready"} aria-hidden={entrancePhase !== "ready" ? true : undefined}>
    {controller && model && viewActions ? <WebspringViewBoundary
      key={`${presentation}:${usingFallback ? "fallback" : "launcher"}`}
      fallbackAvailable={LauncherClass !== WSBoardViewController}
      onFallback={() => setFallback({ shell, presentation })}
    >
      <FocusPortProvider port={viewFocusPort}>
        {application && launcher ? <HostedLauncher
          launcher={launcher}
          state={{ application, model, actions: viewActions, folderPresentation: shell.folderPresentation }}
        /> : null}
      </FocusPortProvider>
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
    <WindowPresentationContent>
      {/* The launcher's next sibling in its stacking context. The entrance's inertness stays on an inner element, apart from a modal's sibling containment. */}
      <div className="webspring-stage-host">
        <div className="webspring-stage-entrance" inert={entrancePhase !== "ready"} aria-hidden={entrancePhase !== "ready" ? true : undefined}>
          {applicationStage}
        </div>
      </div>
      <WindowLayer contentRegistry={registry} />
    </WindowPresentationContent>
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
    <HostLoginGate
      runtime={runtime}
      snapshot={snapshot}
      title={model ? `Sign in to ${model.branding.name}` : undefined}
      branding={model?.branding}
      authentication={authentication}
      ready={loginReady}
      restoring={restoringLogin}
      onExitComplete={finishLoginExit}
      onSignInPendingChange={setLoginContinuation}
    />
    <WebspringStatusLayer errors={snapshot.errors} />
    <SystemStartupLayer phase={phase} />
    <SystemUILayer
      onLogOut={authenticationPolicy === "disabled" ? undefined : handleLogOut}
      preferences={shell.preferences}
      siteName={model?.branding.name ?? lastBranding.current?.name ?? shell.info.branding.name.fallback ?? shell.info.branding.name.key}
    />
    </WebspringFolderAppearanceProvider>
  </WSIconEffectProvider></MaterialProvider></HostSiteBrandingProvider>;
}
