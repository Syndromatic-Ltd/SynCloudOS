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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import type { NSEAnyWindowController, NSEWindowMount } from "../../NSE/Application/NSEWindowController";
import { nseWindowInternals } from "../../NSE/Application/NSEWindowController";
import { nseAttachView, type NSEViewController } from "../../NSE/Application/NSEViewController";
import { useObserve } from "../../NSE/Objects";
import { nseDisposeFor } from "../../NSE/Controllers/ownership";
import { NSEActionScopeProvider } from "../../NSE/Controls/Core/useNSEControlAction";
import { ResponderScope } from "../../SynCloudOSReact/ResponderScope";
import { useResponderHierarchy } from "../../SynCloudOSReact/responderHierarchy";
import { SynCloudOSRuntimeContext, SynWareRuntimeContext } from "../../SynCloudOSReact/runtimeContext";
import type { SynWareRuntime } from "../../SynCloudOSReact/appRuntimeTypes";
import { useSynWareContext } from "./SynWareContext";
import { bindActionResponder, hasActions } from "./actions";
import { trackLiveApplicationObject } from "./applicationHotReload";
import { applicationSessionFor } from "./applicationSession";

const FRAME_STYLE: CSSProperties = Object.freeze({ display: "block", width: "100%", height: "100%", minWidth: 0, minHeight: 0 });
const CONTENTS_STYLE: CSSProperties = Object.freeze({ display: "contents" });

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
  const kernel = useContext(SynCloudOSRuntimeContext);
  const parentId = hierarchy.responderId ?? appRuntime.responderId;
  const scopeId = kernel?.responders.get(parentId)?.scopeId ?? parentId;
  const appId = appRuntime.app.bundleIdentifier;
  const responderId = `${kind}:${appId}:${identityOf(target)}`;
  useLayoutEffect(() => {
    const binding = bindActionResponder(target, { appId, commands: appRuntime.commands }, responderId);
    return () => { binding.dispose(); };
  }, [appId, appRuntime.commands, responderId, target]);
  return (
    <ResponderScope responderId={responderId} kind={kind} parentResponderId={parentId} scopeId={scopeId} asChild>
      {host === "element" ? (children as ReactElement) : <div style={CONTENTS_STYLE}>{children}</div>}
    </ResponderScope>
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
}

/**
 * Renders a view controller's `static view` inside the frame the controller
 * manages: its `view.layer` draws into this frame, and it loads, appears and
 * disappears as the frame mounts and unmounts. Render child view controllers
 * with it from a parent's view.
 */
export function NSEViewControllerView({ controller }: NSEViewControllerViewProps) {
  useObserve(controller);
  const appRuntime = useContext(SynWareRuntimeContext);
  const context = useSynWareContext();
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
      ? { motion, location, haptics, midi, media, video, lumina }
      : undefined),
    [motion, location, haptics, midi, media, video, lumina],
  );
  const frameRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const element = frameRef.current;
    if (!element || controller.isDisposed) return;
    const session = appRuntime ? applicationSessionFor({ runtimeId: appRuntime.id, appId: appRuntime.app.bundleIdentifier }) : undefined;
    const untrack = session ? trackLiveApplicationObject(controller, session.live) : undefined;
    const detach = controller[nseAttachView]({
      element,
      ...(animations ? { bindLayer: (target: object, signal?: AbortSignal) => animations.bindLayer(target, signal) } : {}),
      ...(fx ? { fx } : {}),
    });
    return () => {
      detach();
      untrack?.();
    };
  }, [animations, appRuntime, controller, fx]);
  if (controller.isDisposed) return null;
  const View = viewComponentOf(controller);
  if (!View) throw new TypeError(`${controller.constructor.name} has no static view; declare \`static view = SomeComponent\`.`);
  const frame = (
    <div ref={frameRef} data-nse-view-controller="" style={FRAME_STYLE}>
      <View controller={controller} />
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
