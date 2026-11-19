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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type FocusEventHandler, type Ref, type ReactNode } from "react";
import { nseUnowned } from "../NSE/sdkPackageEntry";
import { useWebspringLaunchZoom } from "./WebspringLaunchZoomContext";
import { useNSEAnimationEnvironment, useNSEPresenceExiting, useNSEPresentation, type PresentationSpec } from "../NSE/Animation";
import { useApplicationStageMotion, type ApplicationStagePartMotion } from "./ApplicationStage.transitions";
import {
  AppPresentationErrorFallback,
  SynCloudOSWatchdog,
  WEBSPRING_MULTI_SWITCH_ROLES,
  WEBSPRING_PRESENTATION_ROLES,
  type SynCloudOSAppInfo,
  type SynCloudOSAppLifecycleState,
  type SynCloudOSPresentationTraits,
  type WebspringMultiSwitchRole,
  type WindowSmoothSurfaceConfiguration,
} from "../SynCloudOS/SynCloudOS";
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
import { activateResponderHierarchy, clearOwnedResponderAnchor, QuickSwitchTriggerProvider, ResponderScope, useHostSiteBranding, useRuntimeNSEControlPort, useRuntimeNSEFocusPort, useRuntimeNSEOverlayPort, useRuntimeSelector, useKernelSynCloudOS } from "../SynCloudOSReact";
import {
  TitlebarGlyphButton, ViewAppearanceBoundary, WindowTitlebarView, nseTopBarGlyphs, type WindowTitlebarSlots,
  WindowLayoutContext, WindowLayoutModel, useNSEContentLayoutProperties, useInPlaceAppearanceProjection, isWithinNSEFocusOrigin, useNSEViewSafeArea,
  WindowTitlebarHostContext, type WindowTitlebarDocument, type WindowTitlebarHost,
} from "../NSE/hostComposition";
import {
  SmoothSurface,
  nseAppCornerRadius,
  nseSmoothSurfaceDefaultPhysicality,
  type SmoothSurfaceRequest
} from "../NSE/SmoothSurface";
import { WindowPresentationSlot, useWindowPresentationContent } from "./WindowPresentationContent";
import { SynWareEntryRenderer } from "./SynWareEntryRenderer";
import { useWebspringLocale } from "./webspringLocale";
import type { ApplicationStagePresentation } from "./webspringTypes";
import { createTransientWindowSurfaceBridge, type WindowContentRendererRegistry } from "./WindowLayer";

/** A stage element's AnimationFX presentation, and who hears it finish. */
interface StagePresentation {
  readonly motion: ApplicationStagePartMotion;
  readonly onPresented?: (state: string) => void;
}

function useStagePresentation(element: { current: HTMLElement | null }, presentation: StagePresentation | undefined) {
  useNSEPresentation(element, {
    state: presentation?.motion.state,
    enter: presentation?.motion.enter ?? null,
    exit: presentation?.motion.exit ?? null,
    onPresented: presentation?.onPresented,
  });
}

type WSStageWindowFrameProps = {
  safeAreaInsets?: SynCloudOSPresentationTraits["safeAreaInsets"];
  zIndex: number;
  multiSwitchRole?: "incoming" | "outgoing" | null;
  staged?: boolean;
  /** The focused application stage: once presented it becomes the key window. */
  keyWindow?: boolean;
  hasAppearanceOverride?: boolean;
  rootRef?: Ref<HTMLDivElement>;
  children: ReactNode;
  presentation?: StagePresentation;
  className?: string;
  style?: CSSProperties;
  onFocusCapture?: FocusEventHandler<HTMLDivElement>;
  "data-syncloudos-runtime-owner"?: string;
  "data-syncloudos-responder-id"?: string;
  "data-syncloudos-focus-scope"?: string;
};

/** The stage window's `background` part: layout, key-window focus and the frame's motion. */
export function WSStageWindowFrame({
  zIndex,
  safeAreaInsets,
  multiSwitchRole,
  staged = false,
  keyWindow = false,
  hasAppearanceOverride = false,
  rootRef,
  children,
  presentation,
  className,
  style,
  ...hostProps
}: WSStageWindowFrameProps) {
  const projection = useInPlaceAppearanceProjection();
  const appearanceProjection = hasAppearanceOverride ? projection : undefined;
  const frameRef = useRef<HTMLDivElement | null>(null);
  const layout = useMemo(() => new WindowLayoutModel(), []);
  useNSEDeferredDisposal(layout);
  useLayoutEffect(() => frameRef.current ? layout.connectRoot(frameRef.current) : undefined, [layout]);
  useLayoutEffect(() => { if (safeAreaInsets) layout.setLogicalScreenInsets(safeAreaInsets); }, [layout, safeAreaInsets]);
  const setFrame = useCallback((element: HTMLDivElement | null) => {
    frameRef.current = element;
    if (typeof rootRef === "function") rootRef(element);
    else if (rootRef) rootRef.current = element;
  }, [rootRef]);
  useStagePresentation(frameRef, presentation);
  const exiting = useNSEPresenceExiting();
  const inactive = staged || multiSwitchRole === "outgoing" || exiting;
  useEffect(() => {
    // Hand keyboard ownership from this runtime's launcher or previous stage
    // to the presented key stage, without taking focus from its own editor,
    // its portalled controls, or another runtime.
    if (inactive || !keyWindow) return;
    const frame = frameRef.current, document = frame?.ownerDocument, active = document?.activeElement;
    if (!frame) return;
    if (active && active !== document.body) {
      if (isWithinNSEFocusOrigin(frame, active)) return;
      const owner = frame.dataset.syncloudosRuntimeOwner;
      if (!owner || active.closest<HTMLElement>("[data-syncloudos-runtime-owner]")?.dataset.syncloudosRuntimeOwner !== owner) return;
    }
    // The window's content takes focus, not a view controller drawn in its title bar (an accessory).
    const inTitlebar = (element: Element) => element.closest(".nse-window-titlebar-accessory-slot, .nse-window-titlebar-accessories, .nse-document-titlebar");
    const firstOutsideTitlebar = (selector: string) => [...frame.querySelectorAll<HTMLElement>(selector)].find((element) => !inTitlebar(element));
    const target = firstOutsideTitlebar("[data-nse-initial-focus]")
      ?? firstOutsideTitlebar("[data-nse-view-controller]")
      ?? frame;
    target.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
  }, [inactive, keyWindow]);
  return (
    <WindowLayoutContext.Provider value={layout}>
    <div
      {...appearanceProjection}
      {...hostProps}
      ref={setFrame}
      tabIndex={-1}
      data-nse-control="window" data-nse-part="background" data-nse-presentation="stage" data-nse-role="standard"
      data-nse-key-window={keyWindow ? undefined : "false"}
      className={`webspring-app-view-frame ${multiSwitchRole ? `is-multiswitch-${multiSwitchRole}` : ""} ${className ?? ""}`}
      data-nse-transition={multiSwitchRole ?? undefined}
      // A staged frame is mounted and painted but not yet presented: it must not take pointer
      // input or join the accessibility tree until the launch zoom hands the screen over to it.
      data-launch-staged={staged ? "true" : undefined}
      aria-hidden={inactive ? true : undefined}
      inert={inactive ? true : undefined}
      style={{ ...appearanceProjection?.style, ...style, ...presentation?.motion.style, zIndex, ...(inactive ? { pointerEvents: "none" as const } : {}) }}
    >
      {children}
    </div>
    </WindowLayoutContext.Provider>
  );
}

/** The stage window's `content` part, which carries its material and top-bar state. */
export function WSStageWindowSurface({
  material, hasTitlebar,
  multiSwitchRole,
  children,
  presentation
}: {
  material: "cumulus" | "metal";
  hasTitlebar: boolean;
  multiSwitchRole?: "incoming" | "outgoing" | null;
  children: ReactNode;
  presentation?: StagePresentation;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const contentLayoutProperties = useNSEContentLayoutProperties();
  // A role change starts its presentation during layout, so the outgoing
  // plane shows its first 3D pose in the same frame its role changes.
  useStagePresentation(surfaceRef, presentation);
  const surfaceClass = hasTitlebar ? "webspring-app-view-surface-generic" : "webspring-app-view-surface-custom";
  const topBarHeight = hasTitlebar ? `var(--nse-topbar-height, var(--nse-topbar-height-${material}))` : "0px";

  return (
    <div
      ref={surfaceRef}
      data-nse-part="content" className={`webspring-app-view-surface ${surfaceClass}`}
      data-frame-material={material === "metal" ? "metal" : "standard"}
      data-frame-top-bar={hasTitlebar ? "standard" : "none"}
      data-nse-material={material === "metal" ? "metal" : undefined}
      data-nse-transition={multiSwitchRole ?? undefined}
      data-nse-titlebar={hasTitlebar ? undefined : "hidden"}
      style={{ ...contentLayoutProperties, ...presentation?.motion.style, "--webspring-app-top-bar-height": topBarHeight } as CSSProperties}
    >
      {children}
    </div>
  );
}

function appFrameSmoothSurfaceToNSE(
  smoothSurface: WindowSmoothSurfaceConfiguration
): SmoothSurfaceRequest {
  if (smoothSurface === "off" || smoothSurface === false) return false;

  const base = {
    radius: nseAppCornerRadius,
    curve: "squircle" as const,
    smoothing: 0.6,
    overflow: "hidden" as const,
    physicality: nseSmoothSurfaceDefaultPhysicality,
    performance: "paint" as const,
    autoEffects: false
  };

  if (typeof smoothSurface === "number") {
    return { ...base, radius: smoothSurface };
  }

  return {
    ...base,
    ...smoothSurface,
    physicality: smoothSurface.physicality === "off"
      ? "off"
      : smoothSurface.physicality && smoothSurface.physicality !== "default"
        ? smoothSurface.physicality
        : nseSmoothSurfaceDefaultPhysicality
  };
}

/** The stage window's `content-view`, drawn as a SmoothSurface unless the app turns it off. */
export function WSStageContentView({
  smoothSurface,
  background,
  header,
  containsHeader = false,
  backgroundColour,
  fullSizeContentView = false,
  children
}: {
  smoothSurface: WindowSmoothSurfaceConfiguration;
  /** What fills the body behind the content: the system light or dark background, nothing, or a surface. */
  background: "system" | "none";
  /** The rounded surface clips the titlebar and its content together. */
  header?: ReactNode;
  containsHeader?: boolean;
  backgroundColour?: string | null;
  fullSizeContentView?: boolean;
  children: ReactNode;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const safeArea = useNSEViewSafeArea(surface);
  const request = appFrameSmoothSurfaceToNSE(smoothSurface);
  const className = containsHeader
    ? "webspring-app-view-body-surface webspring-app-view-body-surface-sourcelist"
    : "webspring-app-view-body-surface";
  const paint = {
    "data-nse-part": "content-view" as const,
    "data-nse-background-style": background,
    "data-full-size-content": fullSizeContentView ? "" : undefined,
    style: {
      ...safeArea.properties,
      ...(backgroundColour ? { backgroundColor: backgroundColour } : {}),
      "--nse-content-inset-top": fullSizeContentView
        ? "var(--nse-content-layout-inset-top, 0px)"
        : containsHeader ? "0px" : "var(--nse-safe-area-inset-top, 0px)",
    } as CSSProperties,
  };

  if (!request) {
    return (
      <div ref={surface} className={`${className} webspring-app-view-body-surface-off`} {...paint}>
        {header}
        {children}
      </div>
    );
  }

  return (
    <SmoothSurface
      ref={surface}
      className={className}
      smoothSurface={request}
      autoEffects={false}
      {...paint}
    >
      {header}
      {children}
    </SmoothSurface>
  );
}

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

/** A stage application's props, as WSStageLayer and the single-application host pass them. */
export interface WSStageWindowHostProps {
  readonly windowContentRegistry: WindowContentRendererRegistry;
  readonly stage: ApplicationStagePresentation;
  readonly app: SynCloudOSAppInfo;
  readonly lifecycle: SynCloudOSAppLifecycleState;
  readonly multiSwitchId?: string | null;
  readonly multiSwitchRole?: WebspringMultiSwitchRole | null;
  readonly staged?: boolean;
  readonly launchTransitionId?: string | null;
  readonly presentationSettlementId?: string | null;
  readonly quickSwitchOpen?: boolean;
  readonly standalone?: boolean;
  readonly onQuickSwitchRequest?: () => void;
  readonly onMultiSwitchAnimationComplete?: (switchId: string, role: WebspringMultiSwitchRole) => void;
}

async function decodeStagedArtwork(frame: Element) {
  const images = Array.from(frame.querySelectorAll("img")).filter(
    (image) => image.currentSrc || image.src
  );
  await Promise.all(images.map((image) => image.decode?.().catch(() => undefined)));
}

/** A full-screen application's window on the stage: its frame, top bar and content, under one watchdog. */
export function WSStageWindowHost(props: WSStageWindowHostProps) {
  const { stage, app, staged = false, launchTransitionId = null } = props;
  const runtime = useKernelSynCloudOS();
  const presentationRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!staged || !launchTransitionId) return;
    let cancelled = false;
    let outerFrame: unknown = null;
    let innerFrame: unknown = null;
    const report = () => {
      if (!cancelled) runtime.webspring.completeLaunchStage(launchTransitionId, app.bundleIdentifier);
    };
    outerFrame = runtime.environment.requestAnimationFrame(() => {
      innerFrame = runtime.environment.requestAnimationFrame(() => {
        if (cancelled) return;
        const frame = presentationRootRef.current;
        if (!frame) report();
        else void decodeStagedArtwork(frame).then(report);
      });
    });
    return () => {
      cancelled = true;
      if (outerFrame !== null) runtime.environment.cancelAnimationFrame(outerFrame);
      if (innerFrame !== null) runtime.environment.cancelAnimationFrame(innerFrame);
    };
  }, [app.bundleIdentifier, launchTransitionId, runtime, staged]);

  return (
    <SynCloudOSWatchdog
      runtime={runtime}
      watchdogName={`${app.packageName} presentation`}
      scope="app"
      app={app}
      presentation={{ id: stage.id, kind: "stage", zIndex: stage.zIndex }}
      resetKey={`${stage.id}:${app.bundleIdentifier}`}
      fallback={() => <AppPresentationErrorFallback app={app} presentation={{ id: stage.id, kind: "stage", zIndex: stage.zIndex }} />}
    >
      <StageWindow {...props} presentationRootRef={presentationRootRef} />
    </SynCloudOSWatchdog>
  );
}

/** The stage window's tree, inside WSStageWindowHost's watchdog. */
function StageWindow({
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
}: WSStageWindowHostProps & { readonly presentationRootRef: Ref<HTMLDivElement> }) {
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
  const [titlebarDocument, setTitlebarDocument] = useState<WindowTitlebarDocument | null>(null);
  const appearance = titlebarDocument?.appearance ?? null;
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
    isKeyWindow={stage.isFocused} material={material}
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
  const rootPresentation = useMemo<StagePresentation>(() => ({
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
  const surfacePresentation = useMemo<StagePresentation>(
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
    <WSStageWindowFrame
      safeAreaInsets={presentationTraits.safeAreaInsets}
      zIndex={stage.zIndex + 70}
      multiSwitchRole={multiSwitchRole}
      staged={staged}
      keyWindow={stage.isFocused}
      hasAppearanceOverride={appearance !== null}
      rootRef={presentationRootRef}
      presentation={rootPresentation}
    >
      <WSStageWindowSurface
        material={material} hasTitlebar={showsTitlebar}
        multiSwitchRole={multiSwitchRole}
        presentation={surfacePresentation}
      >
        <FocusPortProvider port={nseFocusPort}>
          <QuickSwitchTriggerProvider port={quickSwitchTrigger}>
          <WSStageContentView
            smoothSurface={titlebarDocument?.cornerRadius ?? nseAppCornerRadius}
            background={titlebarDocument?.isOpaque === false ? "none" : "system"}
            backgroundColour={titlebarDocument?.backgroundColour}
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
          </WSStageContentView>
          </QuickSwitchTriggerProvider>
        </FocusPortProvider>
      </WSStageWindowSurface>
    </WSStageWindowFrame>
  );
  return <ViewAppearanceBoundary appearance={appearance} projectBoundary={false}>
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
  </ViewAppearanceBoundary>;
}
