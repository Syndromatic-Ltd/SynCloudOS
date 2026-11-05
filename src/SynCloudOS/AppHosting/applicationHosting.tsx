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
import type { NSEAnyWindowController, NSEWindowMount } from "../../NSE/applicationHostInterop";
import { nseWindowInternals } from "../../NSE/applicationHostInterop";
import { nseAttachView, nseUpdateTraits, nseUpdateViewActivity, validateNSEViewControllerClass, type NSEViewController, type NSEViewControllerClass } from "../../NSE/applicationHostInterop";
import { useObserve } from "../../NSE/applicationHostInterop";
import { observableVersion, type NSEObservable } from "../../NSE/applicationHostInterop";
import { nseDisposeFor } from "../../NSE/applicationHostInterop";
import { NSEActionResponderContext, NSEActionScopeProvider } from "../../NSE/applicationHostInterop";
import { ResponderScope } from "../../SynCloudOSReact";
import { useResponderHierarchy } from "../../SynCloudOSReact";
import { SynCloudOSRuntimeContext, SynWareRuntimeContext } from "../../SynCloudOSReact";
import type { SynWareRuntime } from "../../SynCloudOSReact";
import { useSynWareContext } from "../AppSDK/SynWareContext";
import { bindActionResponder, hasActions } from "../AppSDK/actions";
import { trackLiveApplicationObject } from "./applicationHotReload";
import { applicationSessionFor } from "./applicationSession";
import { useNSEAnimationEnvironment, useNSEViewActivitySource } from "../../NSE/applicationHostInterop";
import { useNSEOverlayFocusScope } from "../../NSE/applicationHostInterop";
import { NSEViewControllerRendererProvider } from "../../NSE/applicationHostInterop";

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
  const scopeId = overlayScopeId ?? kernel?.responders.get(parentId)?.scopeId ?? parentId;
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
  if (!appRuntime || !hasActions(target)) return <>{children}</>;
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
  const { reducedMotion, frames } = useNSEAnimationEnvironment();
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
      : undefined),
    [motion, location, haptics, midi, media, video, lumina, animations, frames],
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
      ...(animations ? { bindLayer: (target: object, signal?: AbortSignal) => animations.bindLayer(target, signal, { layout: "css" }) } : {}),
      ...(fx ? { fx } : {}),
    });
    // Content can arrive after the key stage has focused its empty frame.
    // Transfer only that existing handoff, never an editor or portalled focus.
    const active = element.ownerDocument.activeElement;
    if (active instanceof HTMLElement && active.dataset.syncloudosResponderId?.startsWith("application:")
      && active.contains(element) && active.querySelector("[data-nse-view-controller]") === element
      && !element.closest("[inert]")) {
      const target = active.querySelector<HTMLElement>("[data-nse-initial-focus]") ?? element;
      target.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
    }
    return () => {
      detach();
      untrack?.();
    };
  }, [animations, appRuntime, controller, fx, kernel, frames, viewActivity]);
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
    <div ref={frameRef} tabIndex={-1} className={className} data-nse-view-controller="" style={controller.parent ? undefined : FRAME_STYLE}>
      <NSEViewControllerRendererProvider value={NSEViewControllerView}>
        <View controller={controller} />
      </NSEViewControllerRendererProvider>
    </div>
  );
  return <NSEControllerResponder target={controller} kind="view" host="element">{frame}</NSEControllerResponder>;
}

function createWindowMount(appRuntime: SynWareRuntime): NSEWindowMount {
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
      if (id) windows.setTitle(id, title);
    },
    close: async () => (await windows.close(requireId("close the window"))).outcome,
    registerCloseGuard: (guard) => {
      const id = current()?.id;
      return id ? windows.registerCloseGuard(id, guard) : () => {};
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
  const mount = useMemo(() => (appRuntime ? createWindowMount(appRuntime) : null), [appRuntime]);
  const [loaded, setLoaded] = useState(false);
  useLayoutEffect(() => {
    if (!mount || controller.isDisposed) return;
    const internals = controller[nseWindowInternals];
    const detach = internals.attach(mount);
    const reportKey = () => { internals.setKey(mount.getSnapshot()?.isKey ?? mount.windowId === null); };
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
  const content = root
    ? <NSEViewControllerView controller={root} />
    : View ? <View controller={controller} /> : null;
  return (
    <NSEActionScopeProvider appId={appRuntime.app.bundleIdentifier}>
      <NSEControllerResponder target={controller} kind="controller">{content}</NSEControllerResponder>
    </NSEActionScopeProvider>
  );
}
