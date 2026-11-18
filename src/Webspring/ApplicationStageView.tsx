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
import { nseUnowned } from "../NSE/sdkPackageEntry";
import { useWebspringLaunchZoom } from "./WebspringLaunchZoomContext";
import { useNSEAnimationEnvironment, useNSEPresenceExiting, useNSEPresentation, type PresentationSpec } from "../NSE/Animation";
import { useApplicationStageMotion } from "./ApplicationStage.transitions";
import { WEBSPRING_MULTI_SWITCH_ROLES, WEBSPRING_PRESENTATION_ROLES, type WebspringMultiSwitchRole } from "../SynCloudOS/SynCloudOS";
import {
  FocusPortProvider,
  ControlRuntimeProvider,
  ApplicationNavigationChromeController,
  ApplicationNavigationChromeProvider,
  OverlayProvider,
  TooltipProvider,
  WindowSurfaceBridgeProvider,
  useNSEDeferredDisposal,
} from "../NSE/NSE";
import { ApplicationNavigationBackButton } from "./ApplicationNavigationBackButton";
import { activateResponderHierarchy, clearOwnedResponderAnchor, QuickSwitchTriggerProvider, ResponderScope, useHostSiteBranding, useResolvedMode, useRuntimeNSEControlPort, useRuntimeNSEFocusPort, useRuntimeNSEOverlayPort, useRuntimeSelector, useKernelSynCloudOS } from "../SynCloudOSReact";
import type { SynCloudOSAppInfo } from "../SynCloudOS/SynCloudOS";
import { AppViewChrome, type AppViewPresentation } from "./AppViewChrome";
import { AppViewContent } from "./AppViewContent";
import { WindowTitlebarView } from "../NSE/Windows/WindowTitlebarView";
import { TitlebarGlyphButton } from "../NSE/Windows/TitlebarGlyphButton";
import { nseAppCornerRadius } from "../NSE/SmoothSurface";
import type { WindowTitlebarSlots } from "../NSE/Windows/windowTitlebarContext";
import { nseTopBarGlyphs } from "../NSE/Windows/Chrome/topBarAssets";
import { WindowPresentationSlot, useWindowPresentationContent } from "./WindowPresentationContent";
import { SynWareEntryRenderer } from "./SynWareEntryRenderer";
import { WindowTitlebarHostContext, type WindowTitlebarDocument, type WindowTitlebarHost } from "../NSE/hostComposition";
import { useWebspringLocale } from "./webspringLocale";
import type { ApplicationStagePresentation } from "./stage";
import { createTransientWindowSurfaceBridge, type WindowContentRendererRegistry } from "./WindowLayer";

/** Navigation chrome that slides in with the navigation it belongs to. */
function NavigationChromeSlot({ className, enter, children }: {
  readonly className: string;
  readonly enter: PresentationSpec | null;
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
  standalone = false,
  onMultiSwitchAnimationComplete,
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
  standalone?: boolean;
  presentationSettlementId?: string | null;
  onQuickSwitchRequest?: () => void;
  onMultiSwitchAnimationComplete?: (switchId: string, role: WebspringMultiSwitchRole) => void;
}) {
  const runtime = useKernelSynCloudOS();
  const sharedPresentation = useWindowPresentationContent();
  const presentationTraits = useSyncExternalStore(runtime.presentationTraits.subscribe, runtime.presentationTraits.getSnapshot, runtime.presentationTraits.getSnapshot);
  const runtimeLaunchPhase = useRuntimeSelector((snapshot) => snapshot.webspring.launchPhase);
  const launchZoom = useWebspringLaunchZoom();
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
  const [titlebarDocument, setTitlebarDocument] = useState<WindowTitlebarDocument | null>(null);
  // An untitled window draws all of its own chrome, as a borderless NSWindow does.
  const usesStandardTopBar = titlebarDocument?.titled !== false
    && (standalone || frame.presentationMotion !== "content" || Boolean(titlebarDocument?.hasToolbar));
  const siteBranding = useHostSiteBranding();
  const navigationChromeController = useMemo(() => new ApplicationNavigationChromeController({ owner: nseUnowned }), [stage.id]);
  const navigationChromeSnapshot = useSyncExternalStore(
    navigationChromeController.subscribe,
    navigationChromeController.getSnapshot,
    navigationChromeController.getSnapshot,
  );
  const activeNavigationChrome = usesStandardTopBar ? navigationChromeSnapshot.active : null;
  const showsTitlebar = usesStandardTopBar;
  useNSEDeferredDisposal(navigationChromeController);

  const [slots, setSlots] = useState<WindowTitlebarSlots | null>(null);
  const titlebarHost = useMemo<WindowTitlebarHost>(() => Object.freeze({
    setDocument: setTitlebarDocument,
    leadingAccessories: null,
    trailingAccessories: null,
    ...slots,
    setSlots,
  }), [slots]);
  const applicationResponderId = `application:${app.bundleIdentifier}`;
  const quickSwitchAction = onQuickSwitchRequest
    ? { label: quickSwitchLabel, selected: quickSwitchOpen, onClick: () => { void runtime.commands.dispatch("webspring.quickSwitch.toggle", undefined, { source: "toolbar" }); } }
    : null;
  const standardBarTitle = appWindowTitle;
  const menuPresentationReady = !staged && !multiSwitchRole;
  const quickSwitchTrigger = useMemo(() => (
    stage.isFocused && menuPresentationReady && onQuickSwitchRequest
      ? Object.freeze({
          label: quickSwitchLabel,
          open: quickSwitchOpen,
          toggle: onQuickSwitchRequest,
        })
      : null
  ), [menuPresentationReady, onQuickSwitchRequest, quickSwitchLabel, quickSwitchOpen, stage.isFocused]);
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
  const navigationBack = activeNavigationChrome?.back ?? null;
  const material = titlebarDocument?.texturedBackground ? "metal" : "cumulus";
  const currentTitle = titlebarDocument?.title || activeNavigationChrome?.title || standardBarTitle;
  const returnControl = standalone ? null : <TitlebarGlyphButton label={returnToWebspringLabel}
    glyph={siteBranding?.homeIconUrl ?? nseTopBarGlyphs.webspring}
    onClick={() => { void runtime.commands.dispatch("workspace.returnToWebspring", undefined, { source: "toolbar" }); }} />;
  const quickSwitchTitle = (label: ReactNode) => quickSwitchAction ? <button className="nse-app-topbar-title-button" data-nse-part="button" data-nse-style="titlebar"
    type="button" aria-label={quickSwitchAction.label} aria-expanded={quickSwitchAction.selected} data-nse-selected={quickSwitchAction.selected ? "" : undefined} onClick={quickSwitchAction.onClick}>
    <span className="nse-app-topbar-title-text">{label}</span>
    <span data-nse-part="arrow" className="nse-app-topbar-title-arrow" aria-hidden="true">
      <span className="nse-app-topbar-title-arrow-glyph nse-app-topbar-title-arrow-right" data-nse-part="image" data-nse-orientation="horizontal" />
      <span className="nse-app-topbar-title-arrow-glyph nse-app-topbar-title-arrow-down" data-nse-part="image" data-nse-orientation="vertical" />
    </span>
  </button> : label;
  // A Metal window's sidebar gets the rail: the app's name and QuickSwitch over the sidebar, the page title beside it.
  const sidebarRail = material === "metal" && titlebarDocument?.sidebarWidth !== undefined && !navigationBack
    ? { width: titlebarDocument.sidebarWidth, content: quickSwitchTitle(appName) } : undefined;
  const standardTopBar = showsTitlebar ? <WindowTitlebarView
    document={{ ...(titlebarDocument ?? { subtitle: "", documentEdited: false }), title: currentTitle }}
    isKeyWindow={stage.isFocused} material={material} mode={resolvedMode}
    onSlotsChange={setSlots}
    controls={returnControl}
    sidebar={sidebarRail}
    leading={navigationBack ? <NavigationChromeSlot className="webspring-application-navigation-back-slot" enter={stageMotion.navigationBack}>
      <ApplicationNavigationBackButton label={navigationBack.label} onActivate={navigationBack.onActivate} />
    </NavigationChromeSlot> : undefined}
    titleAction={quickSwitchAction && !navigationBack && !sidebarRail ? quickSwitchTitle(currentTitle) : undefined}
  /> : null;
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
  // settles the application enter once the launch presentation lands.
  const rootPresentation = useMemo<AppViewPresentation>(() => ({
    motion: stageMotion.root,
    onPresented: (state) => {
      if (!multiSwitchId || (state !== WEBSPRING_MULTI_SWITCH_ROLES[0] && state !== WEBSPRING_MULTI_SWITCH_ROLES[1])) return;
      if (state === WEBSPRING_MULTI_SWITCH_ROLES[0]) completePresentation();
      onMultiSwitchAnimationComplete?.(multiSwitchId, state);
    },
  }), [completePresentation, multiSwitchId, onMultiSwitchAnimationComplete, stageMotion.root]);
  const settlesOnPresented = useCallback((state: string) => {
    if (state === "presented" && !reducedMotion) completePresentation();
  }, [completePresentation, reducedMotion]);
  const surfacePresentation = useMemo<AppViewPresentation>(
    () => ({ motion: stageMotion.surface, onPresented: settlesOnPresented }),
    [settlesOnPresented, stageMotion.surface],
  );

  const applicationUndoOwner = useMemo(() => ({ kind: "application" as const, id: app.bundleIdentifier }), [app.bundleIdentifier]);
  const nseFocusPort = useRuntimeNSEFocusPort(applicationResponderId);
  const nseOverlayPort = useRuntimeNSEOverlayPort(applicationResponderId);
  const nseControlPort = useRuntimeNSEControlPort();
  const windowSurfaceBridge = useMemo(() => createTransientWindowSurfaceBridge({
    runtime,
    renderers: windowContentRegistry,
    physicalHostId: `application-stage:${stage.id}`,
    owner: { workspaceId: stage.windowId ? "workspace-main" : "workspace:default", applicationId: app.bundleIdentifier, applicationSessionId: app.bundleIdentifier },
    restoreFocus: (anchor) => nseOverlayPort.restoreFocus(applicationResponderId, anchor),
  }), [app.bundleIdentifier, applicationResponderId, nseOverlayPort, runtime, stage.id, stage.windowId, windowContentRegistry]);
  useNSEDeferredDisposal(windowSurfaceBridge);
  const stageWindowSurfaceBridge = useMemo(() => ({
    present: (request: Parameters<typeof windowSurfaceBridge.present>[0], content: Parameters<typeof windowSurfaceBridge.present>[1]) => (
      windowSurfaceBridge.present({ ...request, parentWindowControllerId: stage.windowId ?? null }, content)
    ),
    dismiss: windowSurfaceBridge.dismiss,
  }), [stage.windowId, windowSurfaceBridge]);
  useEffect(() => {
    if (!stage.isFocused || stage.windowId) return;
    activateResponderHierarchy(runtime, { responderId: applicationResponderId, applicationResponderId });
    return () => {
      clearOwnedResponderAnchor(runtime, "application", applicationResponderId);
    };
  }, [applicationResponderId, runtime, stage.isFocused, stage.windowId]);
  const stageRoot = (
    <AppViewChrome.Root
      safeAreaInsets={presentationTraits.safeAreaInsets}
      zIndex={stage.zIndex + 70}
      multiSwitchRole={multiSwitchRole}
      staged={staged}
      keyWindow={stage.isFocused}
      rootRef={presentationRootRef}
      presentation={rootPresentation}
    >
      <AppViewChrome.Surface
        material={material} hasTitlebar={showsTitlebar}
        multiSwitchRole={multiSwitchRole}
        presentation={surfacePresentation}
      >
        <FocusPortProvider port={nseFocusPort}>
          <QuickSwitchTriggerProvider port={quickSwitchTrigger}>
          <AppViewContent.Surface
            smoothSurface={titlebarDocument?.cornerRadius ?? nseAppCornerRadius}
            background={titlebarDocument?.isOpaque === false ? "none" : "system"}
            backgroundColor={titlebarDocument?.backgroundColor}
            fullSizeContentView={titlebarDocument?.fullSizeContentView}
            containsHeader={Boolean(standardTopBar)}
            header={standardTopBar}
          >
            <div
              className="webspring-app-view-fullbleed-content"
              aria-label={appName}
            >
              <WindowTitlebarHostContext.Provider value={titlebarHost}>
              {sharedPresentation && stage.windowId
                ? <WindowPresentationSlot windowId={stage.windowId} priority={exiting ? 0 : 2}
                    overlay={overlayDestination} bridge={stageWindowSurfaceBridge}
                    navigation={navigationChromeController} standardChrome={usesStandardTopBar} />
                : !sharedPresentation || isLoading ? <SynWareEntryRenderer
                runtime={runtime}
                app={app}
                responderId={applicationResponderId}
                isLoading={isLoading}
                loadingClassName="webspring-app-view-loading"
                loadingLabel={loadingLabel}
                loadingPackageLabel={loadingPackageLabel}
                missingComponentLabel={missingComponentLabel}
              /> : null}
              </WindowTitlebarHostContext.Provider>
            </div>
          </AppViewContent.Surface>
          </QuickSwitchTriggerProvider>
        </FocusPortProvider>
      </AppViewChrome.Surface>
    </AppViewChrome.Root>
  );
  return (
    <OverlayProvider runtimePort={nseOverlayPort} defaultParentResponderId={applicationResponderId} portalContainer={overlayDestination}>
    <TooltipProvider>
    <WindowSurfaceBridgeProvider bridge={stageWindowSurfaceBridge}>
    <ControlRuntimeProvider port={nseControlPort}>
    <ApplicationNavigationChromeProvider controller={navigationChromeController} standardChromeAvailable={usesStandardTopBar}>
    {stage.windowId ? stageRoot : (
    <ResponderScope asChild responderId={applicationResponderId} kind="application" parentResponderId="workspace" scopeId={applicationResponderId} undoOwner={applicationUndoOwner} diagnosticsLabel={appName}>
      {stageRoot}
    </ResponderScope>)}
    </ApplicationNavigationChromeProvider>
    </ControlRuntimeProvider>
    </WindowSurfaceBridgeProvider>
    <div ref={overlayRootRef} className="webspring-app-overlay-destination" data-multiswitch-role={multiSwitchRole ?? undefined}
      inert={overlayInactive ? true : undefined} aria-hidden={overlayInactive ? true : undefined}
      style={{ ...stageMotion.root.style, zIndex: stage.zIndex + 70, ...(staged ? { visibility: "hidden" as const } : {}) }}>
      <div ref={attachOverlayDestination} className="webspring-app-overlay-plane" data-multiswitch-role={multiSwitchRole ?? undefined} style={stageMotion.surface.style} />
    </div>
    </TooltipProvider>
    </OverlayProvider>
  );
}
