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

import {
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { NSEOpenPanelWindowHost } from "./openPanelHosting";
import { createPortal } from "react-dom";
import { useEnclosingFocusScopeId } from "../../SynCloudOSReact/focusScopeContext";
import { useNSEAppearance } from "../../NSE/Appearance/NSEAppearanceProvider";
import type { NSEAnyWindowController, NSEWindowMount } from "../../NSE/applicationHostInterop";
import { nseSetKeyWindowModalPresenter, nseWindowInternals } from "../../NSE/applicationHostInterop";
import { nseAttachView, nsePopoverPositioning, nsePresentationStyle, nseUpdateTraits, nseUpdateViewActivity, validateNSEViewControllerClass, type NSEViewController, type NSEViewControllerClass } from "../../NSE/applicationHostInterop";
import { useObserve } from "../../NSE/applicationHostInterop";
import { observableVersion, type NSEObservable } from "../../NSE/applicationHostInterop";
import { nseDisposeFor } from "../../NSE/applicationHostInterop";
import { NSEActionResponderContext, NSEActionScopeProvider } from "../../NSE/applicationHostInterop";
import { ResponderScope } from "../../SynCloudOSReact";
import { useResponderHierarchy } from "../../SynCloudOSReact";
import { SynCloudOSRuntimeContext, SynWareRuntimeContext } from "../../SynCloudOSReact";
import type { SynWareRuntime } from "../../SynCloudOSReact";
import { useSynWareContext } from "../AppSDK/SynWareContext";
import { NSEAlertBackdrop, NSEAlertSurface, NSEFocusScope, NSEPopover, NSEPopup } from "../../NSE/hostComposition";
import type { SynWareContextValue } from "../AppSDK/appContextTypes";
import { bindActionResponder, hasActions } from "../AppSDK/actions";
import { trackLiveApplicationObject } from "./applicationHotReload";
import { NSEWindowContentBorder, NSEWindowSheetFrame, NSEWindowSheetHostContext, NSEWindowTitlebarAccessories, nseContentBorderSize, NSEWindowTitlebarHostContext, useNSEWindowSheetHost, NSEWindowToolbar, useNSEWindowTitlebarDocument } from "./windowChrome";
import { applicationSessionFor } from "./applicationSession";
import { createNSEWindowAlertQueue, NSEWindowAlertSheet, type NSEWindowAlertQueue } from "./windowAlertSheet";
import { useNSEAnimationEnvironment, useNSEViewActivitySource } from "../../NSE/applicationHostInterop";
import { useNSEOverlayFocusScope } from "../../NSE/applicationHostInterop";
import { NSEViewControllerRendererProvider } from "../../NSE/applicationHostInterop";
import { nseAnimatePresentation, nseIsDismissing } from "../../NSE/applicationHostInterop";
import { registerNSEStandaloneViewControllerRenderer } from "../../NSE/Application/viewControllerRenderer";

registerNSEStandaloneViewControllerRenderer(NSEViewControllerView);

const FRAME_STYLE: CSSProperties = Object.freeze({ display: "block", width: "100%", height: "100%", minWidth: 0, minHeight: 0 });
const CONTENTS_STYLE: CSSProperties = Object.freeze({ display: "contents" });
const noTraitSubscription = () => () => {};
const noPresentation = () => null;

const identities = new WeakMap<object, string>();
let identitySequence = 0;

function identityOf(target: object): string {
  let identity = identities.get(target);
  if (!identity) {
    identity = String(++identitySequence);
    identities.set(target, identity);
  }
  return identity;
}

function viewComponentOf(controller: object): ComponentType<{ readonly controller: unknown }> | undefined {
  return (controller.constructor as { readonly view?: ComponentType<{ readonly controller: unknown }> }).view;
}

function InlineControllerView({ controller }: { readonly controller: NSEViewController<unknown> }): ReactNode {
  return controller.renderView!();
}

/** One hook/store regardless of dependency count; subscriptions happen only at commit. */
function createViewObservation(controller: NSEViewController<unknown>) {
  type Entry = { readonly source: NSEObservable; readonly version: number; readonly snapshot: unknown; readonly disposed: boolean };
  let cached: readonly Entry[] | undefined;
  const sources = () => [...new Set<NSEObservable>([controller, ...(
    (controller.constructor as NSEViewControllerClass).viewDependencies?.(controller) ?? []
  ).filter((source): source is NSEObservable => source != null)])];
  const getSnapshot = () => {
    const next = sources().map(source => ({ source, version: observableVersion(source), snapshot: source.getSnapshot(), disposed: source === controller && controller.isDisposed }));
    if (cached && cached.length === next.length && next.every((entry, index) => {
      const old = cached![index];
      return old.source === entry.source && old.version === entry.version && old.disposed === entry.disposed && Object.is(old.snapshot, entry.snapshot);
    })) return cached;
    cached = next;
    return cached;
  };
  const subscribe = (listener: () => void) => {
    const subscriptions = new Map<NSEObservable, () => void>();
    const rebind = () => {
      const current = new Set(sources());
      for (const [source, stop] of subscriptions) if (!current.has(source)) { subscriptions.delete(source); stop(); }
      for (const source of current) if (!subscriptions.has(source)) {
        const stop = source.subscribe(changed);
        subscriptions.set(source, typeof stop === "function" ? stop as () => void : () => {});
      }
    };
    const changed = () => { rebind(); listener(); };
    rebind();
    const stopDispose = controller.onDispose(changed);
    return () => { stopDispose(); for (const stop of subscriptions.values()) stop(); subscriptions.clear(); };
  };
  return { getSnapshot, subscribe };
}

interface ControllerResponderProps {
  readonly appRuntime: SynWareRuntime;
  readonly target: object;
  readonly kind: "controller" | "view";
  /** `"element"`: `children` is one element that becomes the responder's host. */
  readonly host: "contents" | "element";
  readonly children: ReactElement | ReactNode;
}

function ControllerResponder({ appRuntime, target, kind, host, children }: ControllerResponderProps) {
  const hierarchy = useResponderHierarchy();
  const bindingId = useId();
  const kernel = useContext(SynCloudOSRuntimeContext);
  const parentId = hierarchy.responderId ?? appRuntime.responderId;
  const overlayScopeId = useNSEOverlayFocusScope();
  // The innermost focus scope it renders in (a sheet's, a popover's), else its parent responder's.
  const enclosingScopeId = useEnclosingFocusScopeId();
  const scopeId = enclosingScopeId ?? overlayScopeId ?? kernel?.responders.get(parentId)?.scopeId ?? parentId;
  const appId = appRuntime.app.bundleIdentifier;
  const responderId = `${kind}:${appId}:${identityOf(target)}:${bindingId}`;
  useLayoutEffect(() => {
    const binding = bindActionResponder(target, { appId, commands: appRuntime.commands }, responderId);
    return () => { binding.dispose(); };
  }, [appId, appRuntime.commands, responderId, target]);
  return (
    <NSEActionResponderContext.Provider value={responderId}>
      <ResponderScope responderId={responderId} kind={kind} parentResponderId={parentId} scopeId={scopeId} asChild>
        {host === "element" ? (children as ReactElement) : <div style={CONTENTS_STYLE}>{children}</div>}
      </ResponderScope>
    </NSEActionResponderContext.Provider>
  );
}

/**
 * Registers `target` as a responder between its children and the mounted
 * application when it declares `@action` methods; otherwise renders
 * `children` untouched, with no extra DOM.
 */
export function NSEControllerResponder({ target, kind, host = "contents", children }: Omit<ControllerResponderProps, "appRuntime" | "host"> & { readonly host?: ControllerResponderProps["host"] }) {
  const appRuntime = useContext(SynWareRuntimeContext);
  // A presented view controller (a sheet's, a popover's) roots its own responder chain, as a sheet's
  // window does, so its controls sit in its modal focus scope even when it declares no actions.
  const presented = kind === "view" && ((target as Partial<NSEViewController<unknown>>).presentingViewController ?? null) !== null;
  if (!appRuntime || (!hasActions(target) && !presented)) return <>{children}</>;
  return <ControllerResponder appRuntime={appRuntime} target={target} kind={kind} host={host}>{children}</ControllerResponder>;
}

export interface NSEViewControllerViewProps {
  readonly controller: NSEViewController<unknown>;
  /** Parent-owned layout styling on this controller's existing managed outlet. */
  readonly className?: string;
}

/**
 * Renders a view controller's `static view` inside the frame the controller
 * manages: its `view.layer` draws into this frame, and it loads, appears and
 * disappears as the frame mounts and unmounts. Render child view controllers
 * with it from a parent's view.
 */
export function NSEViewControllerView({ controller, className }: NSEViewControllerViewProps) {
  validateNSEViewControllerClass(controller.constructor as NSEViewControllerClass);
  const observation = useMemo(() => createViewObservation(controller), [controller]);
  useSyncExternalStore(observation.subscribe, observation.getSnapshot, observation.getSnapshot);
  const appRuntime = useContext(SynWareRuntimeContext);
  const kernel = useContext(SynCloudOSRuntimeContext);
  const context = useSynWareContext();
  const { reducedMotion, frames, layers } = useNSEAnimationEnvironment();
  const viewActivity = useNSEViewActivitySource();
  const presentation = useSyncExternalStore(context?.presentation.subscribe ?? noTraitSubscription, context?.presentation.getSnapshot ?? noPresentation, noPresentation);
  const traits = useMemo(() => Object.freeze({ reducedMotion, presentation }), [reducedMotion, presentation]);
  const animations = context?.animations;
  const motion = context?.motion;
  const location = context?.location;
  const haptics = context?.haptics;
  const midi = context?.midi;
  const media = context?.media;
  const video = context?.video;
  const lumina = context?.lumina;
  const fx = useMemo(
    () => (motion && location && haptics && midi && media && video && lumina
      ? { motion, location, haptics, midi, media, video, lumina, ...(animations ? { animation: { client: animations, frames } } : {}) }
      : layers ? { animation: { client: layers, frames } } : undefined),
    [motion, location, haptics, midi, media, video, lumina, animations, frames, layers],
  );
  const frameRef = useRef<HTMLDivElement | null>(null);
  const effectiveActivity = () => {
    const document = kernel?.environment.browser.getDocument() ?? frameRef.current?.ownerDocument;
    const state = appRuntime && kernel ? kernel.lifecycle.getState(appRuntime.app.bundleIdentifier) : "active";
    const windows = appRuntime?.windows.getSnapshot();
    const presented = windows?.surface !== "window" || windows.current?.state !== "minimised";
    return presented && state === "active" && !viewActivity?.getSuspended() && !document?.hidden && !frames?.suspended && !kernel?.environment.animationFrames?.suspended;
  };
  useLayoutEffect(() => {
    const element = frameRef.current;
    if (!element || controller.isDisposed) return;
    const session = appRuntime ? applicationSessionFor({ runtimeId: appRuntime.id, appId: appRuntime.app.bundleIdentifier }) : undefined;
    const untrack = session ? trackLiveApplicationObject(controller, session.live) : undefined;
    const detach = controller[nseAttachView]({
      element,
      traits,
      active: effectiveActivity(),
      ...(animations ? { bindLayer: (target: object, signal?: AbortSignal) => animations.bindLayer(target, signal, { layout: "css" }) }
        : layers?.bindLayer ? { bindLayer: (target: object, signal?: AbortSignal) => layers.bindLayer!(target, signal, { layout: "css" }) } : {}),
      ...(fx ? { fx } : {}),
    });
    // Content can arrive after the key stage has focused its empty frame.
    // Transfer only that existing handoff, never an editor or portalled focus.
    const active = element.ownerDocument.activeElement;
    if (active instanceof HTMLElement && active.dataset.syncloudosResponderId?.startsWith("application:")
      && active.contains(element) && firstContentFrame(active) === element
      && !element.closest("[inert]")) {
      const target = active.querySelector<HTMLElement>("[data-nse-initial-focus]") ?? element;
      target.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
    }
    return () => {
      detach();
      untrack?.();
    };
  }, [animations, appRuntime, controller, fx, kernel, frames, layers, viewActivity]);
  useLayoutEffect(() => {
    if (controller.isDisposed) return;
    const document = kernel?.environment.browser.getDocument() ?? frameRef.current?.ownerDocument;
    const update = () => { if (!controller.isDisposed) controller[nseUpdateViewActivity](effectiveActivity()); };
    const stopTransition = kernel && appRuntime ? kernel.store.subscribe(update) : undefined;
    const stopWindows = appRuntime?.windows.subscribe(update);
    const stopFrames = frames?.subscribeState?.(update);
    const stopActivity = viewActivity?.subscribe(update);
    const runtimeFrames = kernel?.environment.animationFrames;
    const stopRuntimeFrames = runtimeFrames !== frames ? runtimeFrames?.subscribeState?.(update) : undefined;
    document?.addEventListener("visibilitychange", update);
    update();
    return () => {
      stopTransition?.(); stopWindows?.(); stopFrames?.(); stopActivity?.(); stopRuntimeFrames?.();
      document?.removeEventListener("visibilitychange", update);
    };
  }, [appRuntime, controller, frames, kernel, viewActivity]);
  useLayoutEffect(() => { controller[nseUpdateTraits](traits); }, [controller, traits]);
  useLayoutEffect(() => {
    if (controller.isDisposed || !frameRef.current) return;
    controller.viewWillLayout();
    controller.viewDidLayout();
  });
  useLayoutEffect(() => {
    const element = frameRef.current;
    const Observer = element?.ownerDocument.defaultView?.ResizeObserver;
    if (!element || !Observer) return;
    const observer = new Observer(() => {
      if (controller.isDisposed || frameRef.current !== element) return;
      controller.viewWillLayout();
      controller.viewDidLayout();
    });
    observer.observe(element);
    return () => { observer.disconnect(); };
  }, [controller]);
  if (controller.isDisposed) return null;
  const View = controller.renderView ? InlineControllerView : viewComponentOf(controller);
  if (!View) throw new TypeError(`${controller.constructor.name} has no static view or renderView; declare one rendering form.`);
  const frame = (
    <div ref={frameRef} tabIndex={-1} className={className} data-nse-view-controller="" style={{ ...(controller.parent ? {} : FRAME_STYLE), ...(controller.presentedViewControllers.some(presented => presented[nsePresentationStyle] === "custom") ? { position: "relative" as const } : {}) }}>
      <NSEViewControllerRendererProvider value={NSEViewControllerView}>
        <View controller={controller} />
      </NSEViewControllerRendererProvider>
      {controller.presentedViewControllers.map(presented => {
        const style = presented[nsePresentationStyle];
        if (style === "custom") return <NSECustomPresentation key={sheetKey(presented)} controller={presented} />;
        if (style === "popover") return <NSEPresentedPopover key={sheetKey(presented)} controller={presented} />;
        if (style === "modalWindow") return <NSEPresentedModalWindow key={sheetKey(presented)} controller={presented} />;
        return <NSEPresentedSheet key={sheetKey(presented)} controller={presented} />;
      })}
    </div>
  );
  return <NSEControllerResponder target={controller} kind="view" host="element">{frame}</NSEControllerResponder>;
}

/** Custom presentations stay in the presenter's coordinate space; their
 * animator owns movement, while the host owns mounting and lifetime. */
function NSECustomPresentation({ controller }: { readonly controller: NSEViewController<unknown> }) {
  useObserve(controller);
  const dismissing = controller[nseIsDismissing];
  useLayoutEffect(() => { controller[nseAnimatePresentation](); }, [controller, dismissing]);
  return <div data-nse-custom-presentation="" inert={dismissing || undefined} style={{ position: "absolute", inset: 0, zIndex: 1 }}>
    <NSEViewControllerView controller={controller} />
  </div>;
}

/** The first view controller frame in the application's content, past any in the window's title bar. */
function firstContentFrame(root: HTMLElement): Element | null {
  for (const frame of root.querySelectorAll("[data-nse-view-controller]")) {
    if (!frame.closest(".nse-window-titlebar-accessory-slot, .nse-window-titlebar-accessories")) return frame;
  }
  return null;
}

/**
 * A view controller presented in a popover (presentAsPopover): anchored to its positioning element and
 * closed, by its behaviour, on Escape or a click elsewhere, which dismisses it.
 */
function NSEPresentedPopover({ controller }: { readonly controller: NSEViewController<unknown> }) {
  useObserve(controller);
  const positioning = controller[nsePopoverPositioning]!;
  const size = controller.preferredContentSize;
  return <NSEPopover id={`nse-popover:${sheetKey(controller)}`} open anchor={positioning.of} parentWindowControllerId={null}
    drawsBackground={positioning.drawsBackground}
    relativeTo={positioning.relativeTo}
    preferredEdge={positioning.preferredEdge}
    behavior={positioning.behavior}
    {...(controller.title ? { title: controller.title } : {})} {...(size ? { contentSize: size } : {})}
    onOpenChange={(open, reason) => {
      if (open) return;
      const behavior = positioning.behavior ?? "transient";
      const closes = reason === "anchor-removed" || reason === "parent-dismissed" || reason === "programmatic"
        || (behavior !== "applicationDefined" && reason === "escape")
        || (behavior === "transient");
      if (closes) controller.dismiss();
    }}>
    <NSEViewControllerView controller={controller} />
  </NSEPopover>;
}

/**
 * A view controller presented as a modal window (presentAsModalWindow): centred over the application on
 * Atmo's modal plate, with its title above it. Escape sends it `cancelOperation()` when it has one;
 * otherwise it is dismissed.
 */
function NSEPresentedModalWindow({ controller }: { readonly controller: NSEViewController<unknown> }) {
  useObserve(controller);
  const size = controller.preferredContentSize;
  const cancel = () => {
    const operation = (controller as { cancelOperation?: () => unknown }).cancelOperation;
    if (typeof operation === "function") void operation.call(controller);
    else controller.dismiss();
  };
  return <NSEPopup id={`nse-modal-window:${sheetKey(controller)}`} open modal className="nse-modal-window"
    {...(controller.title ? { title: controller.title } : {})}
    style={size ? { width: `min(${size.width}px, calc(100vw - 24px))`, maxHeight: "calc(100vh - 40px)" } : undefined}
    onOpenChange={(open) => { if (!open) cancel(); }}>
    <NSEViewControllerView controller={controller} />
  </NSEPopup>;
}

const sheetKeys = new WeakMap<object, string>();
let sheetSequence = 0;
function sheetKey(controller: object): string {
  let key = sheetKeys.get(controller);
  if (!key) sheetKeys.set(controller, key = `sheet-${++sheetSequence}`);
  return key;
}

/**
 * A view controller presented as a sheet (presentAsSheet): modal to the window, drawn on the alert panel
 * surface over its presenter's view, which stays the next responder. Escape and the backdrop send the
 * sheet `cancelOperation()` when it has one; otherwise they dismiss it.
 */
function NSEPresentedSheet({ controller }: { readonly controller: NSEViewController<unknown> }) {
  useObserve(controller);
  const titleId = useId();
  const sheetHost = useContext(NSEWindowSheetHostContext);
  const { reducedMotion } = useNSEAnimationEnvironment();
  // A window's sheet is drawn in the window's colour scheme, so its controls' ink matches its plate.
  const colourScheme = useNSEAppearance().resolvedColourScheme;
  useLayoutEffect(() => sheetHost?.attach(), [sheetHost]);
  const size = controller.preferredContentSize;
  const cancel = () => {
    const operation = (controller as { cancelOperation?: () => unknown }).cancelOperation;
    if (typeof operation === "function") void operation.call(controller);
    else controller.dismiss();
  };
  const sheet = <NSEFocusScope options={{ scopeId: `nse-sheet:${sheetKey(controller)}`, kind: "modal", modal: true, trapFocus: true, asChild: true }}>
    <NSEAlertBackdrop onSafeDismiss={cancel} className={sheetHost ? "nse-window-sheet-backdrop" : undefined} motion={sheetHost ? "sheet" : "alert"}>
      <NSEAlertSurface role="dialog" labelledBy={controller.title ? titleId : undefined} className="nse-sheet" motion={sheetHost ? "sheet" : "alert"}
        appearance={sheetHost ? colourScheme : "dark"}
        style={size ? { width: `min(${size.width}px, calc(100% - 32px))` } : undefined}>
        {controller.title ? <h2 id={titleId} className="nse-sheet-title">{controller.title}</h2> : null}
        <NSEViewControllerView controller={controller} />
      </NSEAlertSurface>
    </NSEAlertBackdrop>
  </NSEFocusScope>;
  // A window attaches the sheet under its title bar and toolbar; outside a window it covers the page.
  if (!sheetHost) return sheet;
  return sheetHost.layer ? createPortal(<NSEWindowSheetFrame reducedMotion={reducedMotion} frozen={controller.isDisposed} holdsController>{sheet}</NSEWindowSheetFrame>, sheetHost.layer) : null;
}

function createWindowMount(appRuntime: SynWareRuntime, alerts: NSEWindowAlertQueue, appAlerts: SynWareContextValue["alerts"] | null): NSEWindowMount {
  const windows = appRuntime.windows;
  const current = () => {
    const snapshot = windows.getSnapshot();
    return snapshot.surface === "window" ? snapshot.current : null;
  };
  const requireId = (action: string): string => {
    const id = current()?.id;
    if (!id) throw new Error(`Cannot ${action}: this application is shown on the stage, not in a window.`);
    return id;
  };
  return {
    get windowId() { return current()?.id ?? null; },
    getSnapshot: current,
    subscribe: (listener) => windows.subscribe(listener),
    focus: () => { windows.focus(requireId("focus the window")); },
    minimise: () => { windows.minimise(requireId("minimise the window")); },
    zoom: () => { windows.zoom(requireId("zoom the window")); },
    setTitle: (title) => {
      const id = current()?.id;
      // An untitled window is named after its application in the window record.
      if (id) windows.setTitle(id, title.trim() || appRuntime.app.displayName);
    },
    close: async () => (await windows.close(requireId("close the window"))).outcome,
    registerCloseGuard: (guard) => {
      const id = current()?.id;
      return id ? windows.registerCloseGuard(id, guard) : () => {};
    },
    // NSAlert.beginSheetModal(for:): the alert attaches to this window as a sheet.
    presentAlert: (request, signal) => alerts.present(request, signal),
    // NSAlert.runModal(): the application's centred alert, from the system alert presenter.
    presentModalAlert: (request, signal) => {
      if (!appAlerts) return Promise.reject(new Error("Cannot present an alert: this window has no application context."));
      return appAlerts.present({ title: request.title, ...(request.message ? { message: request.message } : {}), buttons: request.buttons }, signal);
    },
  };
}

export interface NSEWindowControllerViewProps {
  readonly controller: NSEAnyWindowController;
}

/**
 * Renders a window controller's content (its `contentViewController`, else
 * its `static view`) and binds the controller to the mounted window: the
 * window loads before any view does, and key-window changes reach it.
 */
export function NSEWindowControllerView({ controller }: NSEWindowControllerViewProps) {
  useObserve(controller);
  const appRuntime = useContext(SynWareRuntimeContext);
  const alerts = useMemo(() => createNSEWindowAlertQueue(), []);
  const appAlerts = useSynWareContext()?.alerts ?? null;
  const mount = useMemo(() => (appRuntime ? createWindowMount(appRuntime, alerts, appAlerts) : null), [appRuntime, alerts, appAlerts]);
  const [loaded, setLoaded] = useState(false);
  const titlebarHost = useContext(NSEWindowTitlebarHostContext);
  // A window of its own draws its title in the window record; only the stage's title bar takes the document.
  const stageTitlebar = mount && mount.windowId === null ? titlebarHost : null;
  useNSEWindowTitlebarDocument(controller, loaded ? stageTitlebar : null);
  // While a sheet is attached, the window's close button and Close command are refused (performClose(_:)).
  const sheetCloseGuard = useRef<(() => void) | null>(null);
  const sheets = useNSEWindowSheetHost((attached) => {
    sheetCloseGuard.current?.();
    sheetCloseGuard.current = attached && mount
      ? mount.registerCloseGuard({ shouldClose: (reason) => reason !== "control" && reason !== "command", willClose: () => {} })
      : null;
  });
  useEffect(() => () => { sheetCloseGuard.current?.(); sheetCloseGuard.current = null; }, []);
  useLayoutEffect(() => {
    if (!mount || controller.isDisposed) return;
    const internals = controller[nseWindowInternals];
    const detach = internals.attach(mount);
    const reportKey = () => {
      const isKey = mount.getSnapshot()?.isKey ?? mount.windowId === null;
      internals.setKey(isKey);
      if (isKey) nseSetKeyWindowModalPresenter(mount, mount.presentModalAlert);
    };
    reportKey();
    const unsubscribe = mount.subscribe(reportKey);
    // A window that closes on its own (not because the application quits) disposes its controller once the view leaves.
    // The window's own mount is revoked with the window, so nothing else would report this close.
    let closedOnItsOwn = false;
    const removeGuard = mount.registerCloseGuard({
      // Quitting the application is `applicationShouldTerminate`'s decision, not each window's.
      shouldClose: (reason) => (reason === "application-quit" || reason === "runtime-dispose" ? true : internals.shouldClose()),
      willClose: (reason) => {
        closedOnItsOwn = reason !== "application-quit" && reason !== "runtime-dispose";
        internals.willClose();
      },
    });
    setLoaded(true);
    return () => {
      nseSetKeyWindowModalPresenter(mount, null);
      removeGuard();
      unsubscribe();
      detach();
      setLoaded(false);
      if (closedOnItsOwn) controller[nseDisposeFor]("window-closed");
    };
  }, [controller, mount]);
  if (!appRuntime) throw new Error("NSEWindowControllerView must render inside a mounted application.");
  if (controller.isDisposed || !loaded) return null;
  const root = controller.contentViewController;
  const View = viewComponentOf(controller);
  const content = <NSEWindowSheetHostContext.Provider value={sheets.host}><NSEOpenPanelWindowHost window={controller.window}>{root
    ? <NSEViewControllerView controller={root} />
    : View ? <View controller={controller} /> : null}<NSEWindowAlertSheet queue={alerts} /></NSEOpenPanelWindowHost></NSEWindowSheetHostContext.Provider>;
  const sheetLayer = <div ref={sheets.layerRef} className="nse-window-sheet-layer" data-sheet-attached={sheets.attached ? "true" : undefined} />;
  const { toolbar, bottomBarAccessory, titlebarAccessoryViewControllers: accessories } = controller.window;
  const renderAccessory = (accessory: NSEViewController<unknown>) => <NSEViewControllerView controller={accessory} className="nse-window-titlebar-accessory" />;
  const bottomBorder = controller.window.contentBorderThickness("minY");
  // Keep the content host permanent: showing chrome must not remount an editor or its draft.
  const hasBottomAccessory = bottomBorder > 0 && bottomBarAccessory != null;
  return (
    <NSEActionScopeProvider appId={appRuntime.app.bundleIdentifier}>
      <NSEControllerResponder target={controller} kind="controller">
        {accessories.length ? <NSEWindowTitlebarAccessories accessories={accessories} renderController={renderAccessory} host={stageTitlebar} placement="titlebar" /> : null}
          <div className="nse-window-chrome-frame">
            {toolbar ? <NSEWindowToolbar controller={controller} toolbar={toolbar} /> : null}
            <NSEWindowTitlebarAccessories accessories={accessories} renderController={renderAccessory} host={stageTitlebar} placement="row" />
            <div className="nse-window-chrome-content" data-content-border={bottomBorder > 0 ? nseContentBorderSize(bottomBorder) : undefined}>
              <div className="nse-window-content-above-bottom-bar" style={{ bottom: hasBottomAccessory ? bottomBorder : 0 }}>{content}</div>
              {hasBottomAccessory ? <div className="nse-window-bottom-bar-accessory" data-nse-part="bottom-bar-accessory" style={{ height: bottomBorder }}>{bottomBarAccessory}</div> : null}
              {bottomBorder > 0 ? <NSEWindowContentBorder thickness={bottomBorder} /> : null}
              {sheetLayer}
            </div>
          </div>
      </NSEControllerResponder>
    </NSEActionScopeProvider>
  );
}
