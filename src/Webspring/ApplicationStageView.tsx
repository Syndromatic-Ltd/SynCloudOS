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

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type Ref, type ReactNode } from "react";
import { useWebspringLaunchZoom } from "./WebspringLaunchZoomContext";
import { useNSEAnimationEnvironment, useNSEPresenceExiting, useNSEPresentation, type NSEPresentationSpec } from "../NSE/Animation";
import { useApplicationStageMotion } from "./ApplicationStage.transitions";
import { WEBSPRING_MULTI_SWITCH_ROLES, WEBSPRING_PRESENTATION_ROLES, type WebspringMultiSwitchRole } from "../SynCloudOS/SynCloudOS";
import {
  NSEFocusPortProvider,
  NSEControlRuntimeProvider,
  NSEApplicationMenu,
  NSEApplicationNavigationChromeController,
  NSEApplicationNavigationChromeProvider,
  NSEMenuController,
  NSEOverlayProvider,
  NSEWindowSurfaceBridgeProvider,
  useNSEDeferredDisposal,
} from "../NSE/NSE";
import { nseDeferredDisposalMicrotaskScheduler } from "../NSE/hostComposition";
import {
  NSEToolButton,
  NSETopBar,
} from "@syndromatic/syncloudos/nse/controls";
import { SourceListFrameProvider, type SourceListFrameContextValue } from "../NSE/hostComposition";
import { activateResponderHierarchy, ApplicationMenuTriggerProvider, clearOwnedResponderAnchor, QuickSwitchTriggerProvider, ResponderScope, useResolvedMode, useRuntimeNSEControlPort, useRuntimeNSEFocusPort, useRuntimeNSEMenuPort, useRuntimeNSEOverlayPort, useRuntimeSelector, useKernelSynCloudOS } from "../SynCloudOSReact";
import type { SynCloudOSAppInfo } from "../SynCloudOS/SynCloudOS";
import { AppViewChrome, type AppViewPresentation } from "./AppViewChrome";
import { AppViewContent } from "./AppViewContent";
import { SynWareEntryRenderer } from "./SynWareEntryRenderer";
import { createWebspringAppMenuModel } from "./webspringAppMenu";
import { useWebspringLocale } from "./webspringLocale";
import type { ApplicationStagePresentation } from "./stage";
import { createTransientWindowSurfaceBridge, type WindowContentRendererRegistry } from "./WindowLayer";

const ApplicationNavigationBackArrow = (
  <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false" data-nse-application-navigation-back-arrow="true">
    <path d="M15 4 L7 12 L15 20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Navigation chrome that slides in with the navigation it belongs to. */
function NavigationChromeSlot({ className, enter, children }: {
  readonly className: string;
  readonly enter: NSEPresentationSpec | null;
  readonly children: ReactNode;
}) {
  const slotRef = useRef<HTMLSpanElement>(null);
  useNSEPresentation(slotRef, { enter });
  return <span ref={slotRef} className={className}>{children}</span>;
}

export function ApplicationStageView({
  windowContentRegistry,
  stage,
  app,
  lifecycle,
  multiSwitchId = null,
  multiSwitchRole = null,
  staged = false,
  presentationRootRef,
  quickSwitchOpen = false,
  presentationSettlementId = null,
  onQuickSwitchRequest,
  onMultiSwitchAnimationComplete,
  onApplicationMenuToggleRegister,
}: {
  windowContentRegistry: WindowContentRendererRegistry;
  stage: ApplicationStagePresentation;
  app: SynCloudOSAppInfo;
  lifecycle: string;
  multiSwitchId?: string | null;
  multiSwitchRole?: WebspringMultiSwitchRole | null;
  staged?: boolean;
  presentationRootRef?: Ref<HTMLDivElement>;
  quickSwitchOpen?: boolean;
  presentationSettlementId?: string | null;
  onQuickSwitchRequest?: () => void;
  onMultiSwitchAnimationComplete?: (switchId: string, role: WebspringMultiSwitchRole) => void;
  onApplicationMenuToggleRegister?: (appId: string, toggle: () => void, ready: boolean) => () => void;
}) {
  const runtime = useKernelSynCloudOS();
  const presentationTraits = useSyncExternalStore(runtime.presentationTraits.subscribe, runtime.presentationTraits.getSnapshot, runtime.presentationTraits.getSnapshot);
  const runtimeLaunchPhase = useRuntimeSelector((snapshot) => snapshot.webspring.launchPhase);
  const launchZoom = useWebspringLaunchZoom();
  const sessionAuthorised = useRuntimeSelector((snapshot) => snapshot.loginServices.isAuthorised);
  const locale = useWebspringLocale();
  const appName = locale.appName(app);
  const appWindowTitle = locale.appName(app, "window");
  const returnToWebspringLabel = locale.t("webspring.return", "Return to Webspring");
  const quickSwitchLabel = locale.t(
    quickSwitchOpen ? "quickswitch.close" : "quickswitch.open",
    quickSwitchOpen ? "Close QuickSwitch" : "Open QuickSwitch"
  );
  const loadingLabel = locale.t("apps.loading", "Loading {app}", { app: appName });
  const loadingPackageLabel = locale.t("apps.loadingPackage", "Loading {packageName}", { packageName: app.packageName });
  const missingComponentLabel = locale.t(
    "apps.missingComponent",
    "SynCloudOS could not find a component for {packageName}.",
    { packageName: app.packageName }
  );
  const frame = app.frame;
  const [overlayDestination, setOverlayDestination] = useState<HTMLDivElement | null>(null);
  const overlayRootRef = useRef<HTMLDivElement>(null);
  const overlayPlaneRef = useRef<HTMLDivElement>(null);
  const attachOverlayDestination = useCallback((element: HTMLDivElement | null) => {
    overlayPlaneRef.current = element;
    setOverlayDestination(element);
  }, []);
  const resolvedMode = useResolvedMode();
  const usesStandardTopBar = frame.topBar === "standard";
  const usesContentCard = frame.layout === "simple";
  const navigationChromeController = useMemo(() => new NSEApplicationNavigationChromeController(), [stage.id]);
  const navigationChromeSnapshot = useSyncExternalStore(
    navigationChromeController.subscribe,
    navigationChromeController.getSnapshot,
    navigationChromeController.getSnapshot,
  );
  const activeNavigationChrome = usesStandardTopBar ? navigationChromeSnapshot.active : null;
  const showsApplicationStageTopBar = usesStandardTopBar;
  useNSEDeferredDisposal(navigationChromeController, nseDeferredDisposalMicrotaskScheduler);

  // Source-list rail: the system owns the resizable sidebar width so the bar seam and the sidebar
  // (drawn by the app via NSESourceListScene) can never disagree. Honoured only with the standard bar.
  const sourceList = usesStandardTopBar ? frame.sourceList : undefined;
  const railMin = sourceList?.minWidth ?? 208;
  const railMax = sourceList?.maxWidth ?? 460;
  const railDefault = sourceList?.defaultWidth ?? 264;
  const railLabel = sourceList?.railLabel ?? app.shortName;
  const [railWidth, setRailWidthState] = useState(railDefault);
  const [barTitle, setBarTitle] = useState<string | null>(null);
  const appMenuStore = useMemo(createApplicationMenuStore, [stage.id]);
  const setRailWidth = useCallback(
    (px: number | null) => {
      if (px === null) {
        setRailWidthState(railDefault);
        return;
      }
      setRailWidthState(Math.min(railMax, Math.max(railMin, Math.round(px))));
    },
    [railDefault, railMax, railMin]
  );
  const sourceListContext = useMemo<SourceListFrameContextValue | null>(
    () =>
      sourceList
        ? {
            railWidth,
            setRailWidth,
            minWidth: railMin,
            maxWidth: railMax,
            defaultWidth: railDefault,
            railLabel,
            scheme: resolvedMode,
            setBarTitle
          }
        : null,
    [sourceList, railWidth, setRailWidth, railMin, railMax, railDefault, railLabel, resolvedMode]
  );
  // Source-list bars surface QuickSwitch on the rail wordmark (app identity) and show a dynamic
  // app-provided centre title; plain standard bars keep QuickSwitch on the centre title.
  const quickSwitchAction = onQuickSwitchRequest
    ? { label: quickSwitchLabel, selected: quickSwitchOpen, onClick: () => { void runtime.commands.dispatch("webspring.quickSwitch.toggle", undefined, { source: "toolbar" }); } }
    : null;
  const standardBarTitle = sourceList ? (barTitle ?? appWindowTitle) : appWindowTitle;
  const appMenuAboutLabel = /^about\b/i.test(appName)
    ? locale.t("appMenu.aboutThisApp", "About This App")
    : locale.t("appMenu.aboutApp", "About {app}", { app: appName });
  const appMenuPreferencesLabel = locale.t("appMenu.preferences", "Preferences");
  const appMenuLogOutLabel = locale.t("appMenu.logOut", "Log Out");
  const appPreferences = app.applicationMenu?.preferences;
  const menuPresentationReady = !staged && !multiSwitchRole;
  const hasApplicationMenu = menuPresentationReady && (frame.rightSlot === "userInfo" || app.applicationMenu?.trigger === "content");
  const quickSwitchTrigger = useMemo(() => (
    stage.isFocused && menuPresentationReady && onQuickSwitchRequest
      ? Object.freeze({
          label: quickSwitchLabel,
          open: quickSwitchOpen,
          toggle: onQuickSwitchRequest,
        })
      : null
  ), [menuPresentationReady, onQuickSwitchRequest, quickSwitchLabel, quickSwitchOpen, stage.isFocused]);
  useEffect(() => {
    if (!onApplicationMenuToggleRegister) return undefined;
    const unregister = onApplicationMenuToggleRegister(app.id, appMenuStore.toggle, menuPresentationReady);
    return unregister;
  }, [app.id, appMenuStore, menuPresentationReady, onApplicationMenuToggleRegister]);
  const appMenuModel = useMemo(() => createWebspringAppMenuModel({
    appId: app.id,
    labels: {
      label: appName,
      // Avoid an "About About" menu item for About.app while preserving the
      // regular app-specific label for every other retained SynWare.
      about: appMenuAboutLabel,
      preferences: appMenuPreferencesLabel,
      logOut: appMenuLogOutLabel,
    },
    appPreferences: appPreferences ? {
      commandId: appPreferences.commandId,
      label: appPreferences.label ?? locale.t("appMenu.appPreferences", "{app} Preferences…", { app: appName }),
    } : undefined,
    includeLogOut: sessionAuthorised,
  }), [app.id, appMenuAboutLabel, appMenuLogOutLabel, appMenuPreferencesLabel, appName, appPreferences, locale, sessionAuthorised]);
  const appMenuRuntime = useRuntimeNSEMenuPort();
  const appMenuController = useMemo(
    () => new NSEMenuController({ model: appMenuModel, runtime: appMenuRuntime }),
    [appMenuModel, appMenuRuntime],
  );
  // `useRuntimeNSEMenuPort` remains the canonical command bridge; the controller
  // is shell-owned, so StrictMode-safe disposal follows the shell microtask lifetime.
  useNSEDeferredDisposal(appMenuController, nseDeferredDisposalMicrotaskScheduler);
  const { reducedMotion } = useNSEAnimationEnvironment();
  const stageMotion = useApplicationStageMotion({
    role: multiSwitchRole,
    staged,
    launching: runtimeLaunchPhase === "launching" && !multiSwitchRole,
    launchZoom,
    presentationMotion: frame.presentationMotion,
  });
  const exiting = useNSEPresenceExiting();
  const overlayInactive = staged || multiSwitchRole === "outgoing" || exiting;
  // Overlays escape the frame's clip, but remain on its presentation planes.
  // Only the original stage elements report roles and canonical settlement.
  useNSEPresentation(overlayRootRef, stageMotion.root);
  useNSEPresentation(overlayPlaneRef, stageMotion.surface);
  const standardTopBar = showsApplicationStageTopBar ? (
    <ApplicationStageTopBar
      menuStore={appMenuStore}
      showUserInfo={frame.rightSlot === "userInfo"}
      userInfoLabel={locale.t("userInfo.label", "User Info")}
      title={activeNavigationChrome?.title ?? standardBarTitle}
      variant={frame.material === "metal" ? "atmoMetal" : "atmoCumulus"}
      scheme={resolvedMode}
      rail={sourceList && presentationTraits.horizontalSizeClass !== "compact" ? { width: railWidth, content: railLabel, titleAction: quickSwitchAction } : undefined}
      titleAction={activeNavigationChrome ? null : sourceList && presentationTraits.horizontalSizeClass !== "compact" ? null : quickSwitchAction}
      leadingItems={[{
        kind: "webspring",
        label: returnToWebspringLabel,
        selected: false,
        onClick: () => { void runtime.commands.dispatch("workspace.returnToWebspring", undefined, { source: "toolbar" }); }
      }]}
      leading={activeNavigationChrome?.back ? (
        <NavigationChromeSlot className="webspring-application-navigation-back-slot" enter={stageMotion.navigationBack}>
          <NSEToolButton
            className="webspring-application-navigation-back"
            data-nse-application-navigation-back="true"
            icon={ApplicationNavigationBackArrow}
            label={activeNavigationChrome.back.label}
            onClick={activeNavigationChrome.back.onActivate}
          />
        </NavigationChromeSlot>
      ) : undefined}
      trailing={activeNavigationChrome?.back ? <span className="webspring-application-navigation-chrome-balance" aria-hidden="true" /> : undefined}
      center={activeNavigationChrome?.back ? (
        <NavigationChromeSlot className="webspring-application-navigation-title" enter={stageMotion.navigationTitle}>
          {activeNavigationChrome.title}
        </NavigationChromeSlot>
      ) : undefined}
    />
  ) : null;
  const isMultiSwitching = Boolean(multiSwitchRole);
  const completePresentation = useCallback(() => {
    if (!presentationSettlementId || staged) return;
    const settlement = runtime.presentationSettlements.get(presentationSettlementId);
    settlement?.completeRole(WEBSPRING_PRESENTATION_ROLES.applicationEnter);
    if (multiSwitchRole === WEBSPRING_MULTI_SWITCH_ROLES[0]) {
      settlement?.completeRole(WEBSPRING_PRESENTATION_ROLES.shellReturn);
    }
  }, [multiSwitchRole, presentationSettlementId, runtime, staged]);
  useEffect(() => {
    if (reducedMotion || frame.presentationMotion === "content") completePresentation();
  }, [completePresentation, reducedMotion, frame.presentationMotion]);
  const isLoading = !isMultiSwitching && (lifecycle === "loading" || lifecycle === "launching");
  // The frame reports each MultiSwitch role once its slide lands; the surface
  // (or, in the simple layout, the content card) settles the application
  // enter once the launch presentation lands.
  const rootPresentation = useMemo<AppViewPresentation>(() => ({
    motion: stageMotion.root,
    onPresented: (state) => {
      if (!multiSwitchId || (state !== WEBSPRING_MULTI_SWITCH_ROLES[0] && state !== WEBSPRING_MULTI_SWITCH_ROLES[1])) return;
      if (state === WEBSPRING_MULTI_SWITCH_ROLES[0]) completePresentation();
      onMultiSwitchAnimationComplete?.(multiSwitchId, state);
    },
  }), [completePresentation, multiSwitchId, onMultiSwitchAnimationComplete, stageMotion.root]);
  const settlesOnPresented = useCallback((owner: "surface" | "card") => (state: string) => {
    if (state === "presented" && !reducedMotion && (owner === "card") === usesContentCard) completePresentation();
  }, [completePresentation, reducedMotion, usesContentCard]);
  const surfacePresentation = useMemo<AppViewPresentation>(
    () => ({ motion: stageMotion.surface, onPresented: settlesOnPresented("surface") }),
    [settlesOnPresented, stageMotion.surface],
  );
  const cardPresentation = useMemo<AppViewPresentation>(
    () => ({ motion: stageMotion.card, onPresented: settlesOnPresented("card") }),
    [settlesOnPresented, stageMotion.card],
  );

  const applicationUndoOwner = useMemo(() => ({ kind: "application" as const, id: app.id }), [app.id]);
  const applicationResponderId = `application:${app.id}`;
  const nseFocusPort = useRuntimeNSEFocusPort(applicationResponderId);
  const nseOverlayPort = useRuntimeNSEOverlayPort(applicationResponderId);
  const nseControlPort = useRuntimeNSEControlPort();
  const windowSurfaceBridge = useMemo(() => createTransientWindowSurfaceBridge({
    runtime,
    renderers: windowContentRegistry,
    physicalHostId: `application-stage:${stage.id}`,
    owner: { workspaceId: "workspace:default", applicationId: app.id, applicationSessionId: app.id },
    restoreFocus: (anchor) => nseOverlayPort.restoreFocus(applicationResponderId, anchor),
  }), [app.id, applicationResponderId, nseOverlayPort, runtime, stage.id, windowContentRegistry]);
  useNSEDeferredDisposal(windowSurfaceBridge, nseDeferredDisposalMicrotaskScheduler);
  const stageWindowSurfaceBridge = useMemo(() => ({
    present: (request: Parameters<typeof windowSurfaceBridge.present>[0], content: Parameters<typeof windowSurfaceBridge.present>[1]) => (
      windowSurfaceBridge.present({ ...request, parentWindowControllerId: null }, content)
    ),
    dismiss: windowSurfaceBridge.dismiss,
  }), [windowSurfaceBridge]);
  useEffect(() => {
    if (!stage.isFocused) return;
    activateResponderHierarchy(runtime, { responderId: applicationResponderId, applicationResponderId });
    return () => {
      clearOwnedResponderAnchor(runtime, "application", applicationResponderId);
    };
  }, [applicationResponderId, runtime, stage.isFocused]);
  return (
    <NSEOverlayProvider runtimePort={nseOverlayPort} defaultParentResponderId={applicationResponderId} portalContainer={overlayDestination}>
    <NSEWindowSurfaceBridgeProvider bridge={stageWindowSurfaceBridge}>
    <NSEControlRuntimeProvider port={nseControlPort}>
    <NSEApplicationNavigationChromeProvider controller={navigationChromeController}>
    <ResponderScope asChild responderId={applicationResponderId} kind="application" parentResponderId="workspace" scopeId={applicationResponderId} undoOwner={applicationUndoOwner} diagnosticsLabel={appName}>
    <AppViewChrome.Root
      zIndex={stage.zIndex + 70}
      multiSwitchRole={multiSwitchRole}
      staged={staged}
      keyWindow={stage.isFocused}
      rootRef={presentationRootRef}
      presentation={rootPresentation}
    >
      {hasApplicationMenu ? (
        <ApplicationMenuOverlayHost
          menuStore={appMenuStore}
          model={appMenuModel}
          controller={appMenuController}
          overlay={{
            id: `webspring:app-menu-overlay:${stage.id}`,
            parentResponderId: applicationResponderId,
            placement: "block-end-inline-end",
          }}
          anchorTitle={appName}
        />
      ) : null}
      <AppViewChrome.Surface
        frame={frame}
        multiSwitchRole={multiSwitchRole}
        presentation={surfacePresentation}
      >
        {showsApplicationStageTopBar && !sourceList ? standardTopBar : null}
        <NSEFocusPortProvider port={nseFocusPort}>
        <SourceListFrameProvider value={sourceListContext}>
          <ApplicationMenuTriggerBridge
            menuStore={appMenuStore}
            label={locale.t("userInfo.label", "User Info")}
          >
          <QuickSwitchTriggerProvider port={quickSwitchTrigger}>
          <AppViewContent.Surface
            smoothSurface={frame.smoothSurface}
            sourceList={Boolean(sourceList)}
            header={sourceList ? standardTopBar : undefined}
          >
            {usesContentCard ? (
              <AppViewContent.Main label={appName}>
                <AppViewContent.Card presentation={cardPresentation}>
                  <SynWareEntryRenderer
                    runtime={runtime}
                    app={app}
                    responderId={applicationResponderId}
                    isLoading={isLoading}
                    loadingClassName="webspring-app-view-loading"
                    loadingLabel={loadingLabel}
                    loadingPackageLabel={loadingPackageLabel}
                    missingComponentLabel={missingComponentLabel}
                  />
                </AppViewContent.Card>
              </AppViewContent.Main>
            ) : (
              <div
                className="webspring-app-view-fullbleed-content webspring-app-view-layout-defacto"
                aria-label={appName}
              >
                <SynWareEntryRenderer
                  runtime={runtime}
                  app={app}
                  responderId={applicationResponderId}
                  isLoading={isLoading}
                  loadingClassName="webspring-app-view-loading"
                  loadingLabel={loadingLabel}
                  loadingPackageLabel={loadingPackageLabel}
                  missingComponentLabel={missingComponentLabel}
                />
              </div>
            )}
          </AppViewContent.Surface>
          </QuickSwitchTriggerProvider>
          </ApplicationMenuTriggerBridge>
        </SourceListFrameProvider>
        </NSEFocusPortProvider>
      </AppViewChrome.Surface>
    </AppViewChrome.Root>
    </ResponderScope>
    </NSEApplicationNavigationChromeProvider>
    </NSEControlRuntimeProvider>
    </NSEWindowSurfaceBridgeProvider>
    <div ref={overlayRootRef} className="webspring-app-overlay-destination" data-multiswitch-role={multiSwitchRole ?? undefined}
      inert={overlayInactive ? true : undefined} aria-hidden={overlayInactive ? true : undefined}
      style={{ ...stageMotion.root.style, zIndex: stage.zIndex + 70, ...(staged ? { visibility: "hidden" as const } : {}) }}>
      <div ref={attachOverlayDestination} className="webspring-app-overlay-plane" data-multiswitch-role={multiSwitchRole ?? undefined} style={stageMotion.surface.style} />
    </div>
    </NSEOverlayProvider>
  );
}

interface ApplicationMenuSnapshot {
  readonly open: boolean;
  readonly anchor: HTMLElement | null;
}

interface ApplicationMenuStore {
  readonly getSnapshot: () => ApplicationMenuSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  readonly setAnchor: (element: HTMLElement | null) => void;
  readonly setOpen: (open: boolean) => void;
  readonly toggle: () => void;
}

function createApplicationMenuStore(): ApplicationMenuStore {
  let snapshot: ApplicationMenuSnapshot = { open: false, anchor: null };
  const listeners = new Set<() => void>();
  const publish = (next: ApplicationMenuSnapshot) => {
    if (next.open === snapshot.open && next.anchor === snapshot.anchor) return;
    snapshot = next;
    for (const listener of [...listeners]) listener();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setAnchor(element) {
      publish({ ...snapshot, anchor: element });
    },
    setOpen(open) {
      publish({ ...snapshot, open });
    },
    toggle() {
      publish({ ...snapshot, open: !snapshot.open });
    },
  };
}

type TopBarProps = Parameters<typeof NSETopBar>[0];

function ApplicationStageTopBar({
  menuStore,
  showUserInfo,
  userInfoLabel,
  ...props
}: Pick<TopBarProps, "title" | "variant" | "scheme" | "rail" | "titleAction" | "leadingItems" | "leading" | "trailing" | "center"> & {
  readonly menuStore: ApplicationMenuStore;
  readonly showUserInfo: boolean;
  readonly userInfoLabel: string;
}) {
  const menu = useSyncExternalStore(menuStore.subscribe, menuStore.getSnapshot, menuStore.getSnapshot);
  return (
    <NSETopBar
      {...props}
      trailingItems={showUserInfo && props.trailing === undefined ? [{
          kind: "userInfo",
          label: userInfoLabel,
          selected: menu.open,
          opensMenu: true,
          onElementChange: menuStore.setAnchor,
          onClick: menuStore.toggle,
        }] : []}
    />
  );
}

function ApplicationMenuOverlayHost({
  menuStore,
  model,
  controller,
  overlay,
  anchorTitle,
}: {
  readonly menuStore: ApplicationMenuStore;
  readonly model: Parameters<typeof NSEApplicationMenu>[0]["model"];
  readonly controller: Parameters<typeof NSEApplicationMenu>[0]["controller"];
  readonly overlay: Parameters<typeof NSEApplicationMenu>[0]["overlay"];
  readonly anchorTitle: string;
}) {
  const menu = useSyncExternalStore(menuStore.subscribe, menuStore.getSnapshot, menuStore.getSnapshot);
  return (
    <NSEApplicationMenu
      model={model}
      controller={controller}
      overlay={overlay}
      open={menu.open}
      anchor={menu.anchor}
      title={anchorTitle}
      onOpenChange={(nextOpen) => menuStore.setOpen(nextOpen)}
    />
  );
}

function ApplicationMenuTriggerBridge({
  menuStore,
  label,
  children,
}: {
  readonly menuStore: ApplicationMenuStore;
  readonly label: string;
  readonly children: ReactNode;
}) {
  const menu = useSyncExternalStore(menuStore.subscribe, menuStore.getSnapshot, menuStore.getSnapshot);
  const port = useMemo(() => ({
    label,
    open: menu.open,
    setAnchor: menuStore.setAnchor,
    toggle: menuStore.toggle,
  }), [label, menu.open, menuStore]);
  return <ApplicationMenuTriggerProvider port={port}>{children}</ApplicationMenuTriggerProvider>;
}
