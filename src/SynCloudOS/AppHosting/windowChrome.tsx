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

import { NSEWindowLayoutContext, useNSEWindowChromeElement } from "../../NSE/applicationHostInterop";
import { contentInlineSize } from "./contentInlineSize";
import { useNSEWindowChromeObstruction } from "../../NSE/NSE";

import { Fragment, createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { NSEAnyWindowController } from "../../NSE/applicationHostInterop";
import { useObserve, NSEActionResponderContext } from "../../NSE/applicationHostInterop";
import { nseAttachToolbar, nseEndToolbarCustomization, nseToolbarEngine, nseToolbarTabViews } from "../../NSE/applicationHostInterop";
import type { NSEToolbar } from "../../NSE/NSE";
import { ToolbarView } from "../../NSE/applicationHostInterop";
import { ToolbarConfigurationSheet } from "../../NSE/applicationHostInterop";
import type { NSETitlebarAccessoryViewController } from "../../NSE/NSE";
import { SynWareRuntimeContext } from "../../SynCloudOSReact";
import { useSynWareContext } from "../AppSDK/SynWareContext";
import { controllerServicesFor } from "../AppSDK/controllerServices";
import "./window-chrome.css";
import { NSEUserDefaults } from "../../Foundation/NSEUserDefaults";

const noSubscription = () => () => {};

export { WindowTitlebarHostContext } from "../../NSE/applicationHostInterop";
export type { WindowTitlebarDocument, WindowTitlebarHost } from "../../NSE/applicationHostInterop";
import { WindowTitlebarHostContext, type WindowTitlebarHost } from "../../NSE/applicationHostInterop";
import { nseWindowPresentedTitle } from "../../NSE/applicationHostInterop";

/** Publishes the window's title, subtitle and edited state to the stage's title bar. */
export function useNSEWindowTitlebarDocument(controller: NSEAnyWindowController, host: WindowTitlebarHost | null): void {
  useObserve(controller);
  const window = controller.isDisposed ? null : controller.window;
  const title = window ? nseWindowPresentedTitle(window) : "";
  const toolbarStyle = window?.toolbarStyle ?? "automatic";
  const subtitle = window?.subtitle ?? "";
  const documentEdited = window?.isDocumentEdited ?? false;
  const claims = Boolean(window && (title || subtitle || window.titlebarAccessoryViewControllers.length));
  useLayoutEffect(() => {
    if (!host || !claims) return undefined;
    host.setDocument(Object.freeze({ title, subtitle, documentEdited, toolbarStyle }));
    return undefined;
  }, [claims, documentEdited, host, subtitle, title, toolbarStyle]);
  useLayoutEffect(() => {
    if (!host || !claims) return undefined;
    return () => { host.setDocument(null); };
  }, [claims, host]);
}

interface AccessoryProps {
  readonly accessories: readonly NSETitlebarAccessoryViewController<unknown>[];
  readonly renderController: (controller: NSETitlebarAccessoryViewController<unknown>) => ReactNode;
}

function AccessoryObserver({ accessory, children }: { readonly accessory: NSETitlebarAccessoryViewController<unknown>; readonly children: (accessory: NSETitlebarAccessoryViewController<unknown>) => ReactNode }) {
  useObserve(accessory);
  return accessory.isHidden ? null : <>{children(accessory)}</>;
}

/**
 * Draws a window's titlebar accessories. On the stage, leading and trailing accessories go into the
 * stage title bar (Atmo draws them either side of the title); bottom accessories, and in a window of
 * its own every accessory, draw in the accessory row at the top of the window's content, under the toolbar.
 */
export function NSEWindowTitlebarAccessories({ accessories, renderController, host, placement }: AccessoryProps & {
  readonly host: WindowTitlebarHost | null;
  readonly placement: "titlebar" | "row";
}) {
  const shown = accessories.filter((accessory) => {
    const inTitlebar = Boolean(host) && accessory.layoutAttribute !== "bottom";
    return placement === "titlebar" ? inTitlebar : !inTitlebar;
  });
  if (!shown.length) return null;
  const views = (attribute: "leading" | "trailing" | "bottom" | null) => shown
    .filter((accessory) => attribute === null || accessory.layoutAttribute === attribute)
    .map((accessory) => (
      <AccessoryObserver key={accessories.indexOf(accessory)} accessory={accessory}>{renderController}</AccessoryObserver>
    ));
  if (placement === "titlebar") {
    return <>
      {host?.leadingAccessories ? createPortal(views("leading"), host.leadingAccessories) : null}
      {host?.trailingAccessories ? createPortal(views("trailing"), host.trailingAccessories) : null}
    </>;
  }
  return <AccessoryRow>{views(null)}</AccessoryRow>;
}

/** The row of bottom accessories, on the window's chrome under the toolbar. */
function AccessoryRow({ children }: { readonly children: ReactNode }) {
  const element = useRef<HTMLDivElement>(null);
  useNSEWindowChromeElement(element, "top", false);
  const mode = useWindowChromeMode();
  return <div ref={element} className="nse-window-titlebar-accessories" data-nse-part="titlebar-accessories" data-mode={mode} data-nse-colour-scheme-resolved={mode}>{children}</div>;
}

/** @internal Atmo draws a tall content border as its metal footer and a short one as its compact strip. */
export function nseContentBorderSize(thickness: number): "large" | "small" {
  return thickness >= 44 ? "large" : "small";
}

/**
 * The band a window paints along the bottom of its content (NSWindow.setContentBorderThickness(_:for: .minY)).
 * It lies behind the content, so the content's own controls sit over it; only its edge, which casts a
 * shadow up onto the content, is drawn above.
 */
export function NSEWindowContentBorder({ thickness }: { readonly thickness: number }) {
  useNSEWindowChromeObstruction("bottom", thickness, false);
  const mode = useWindowChromeMode();
  const style = { "--nse-window-content-border-thickness": `${thickness}px` } as CSSProperties;
  const size = nseContentBorderSize(thickness);
  return <>
    <div className="nse-window-content-border" data-nse-part="content-border" data-edge="minY" data-size={size} data-mode={mode} data-nse-colour-scheme-resolved={mode} style={style} aria-hidden="true">
      <span className="nse-window-content-border-grain" />
    </div>
    <div className="nse-window-content-border-edge" data-edge="minY" data-size={size} data-mode={mode} data-nse-colour-scheme-resolved={mode} style={style} aria-hidden="true" />
  </>;
}

/** Light or dark, as the application's appearance resolves, for the window's own chrome. */
function useWindowChromeMode(): "light" | "dark" {
  const appearance = useSynWareContext()?.appearance;
  return useSyncExternalStore(appearance?.subscribe ?? noSubscription, () => (appearance?.resolved() === "dark" ? "dark" : "light"), () => "light");
}

/**
 * Draws `window.toolbar`: its items validated and dispatched along the window's responder chain,
 * laid out to the width it is given, and the customisation sheet while it runs.
 */
export function NSEWindowToolbar({ controller, toolbar }: { readonly controller: NSEAnyWindowController; readonly toolbar: NSEToolbar }) {
  useObserve(toolbar);
  const tabViews = toolbar[nseToolbarTabViews];
  const tabItems = useRef<HTMLDivElement | null>(null);
  const [tabItemsWidth, setTabItemsWidth] = useState(0);
  const appRuntime = useContext(SynWareRuntimeContext);
  const context = useSynWareContext();
  // The window controller's responder when it has actions; otherwise the application's mount.
  const responderId = useContext(NSEActionResponderContext) ?? appRuntime?.responderId ?? null;
  const overlayId = `nse-window-toolbar:${useId()}`;
  const mode = useWindowChromeMode();
  const element = useRef<HTMLDivElement | null>(null);
  const layout = useContext(NSEWindowLayoutContext);
  useNSEWindowChromeElement(element, "top", false, toolbar.isVisible);
  const [width, setWidth] = useState(0);
  const [attached, setAttached] = useState(false);
  useLayoutEffect(() => {
    if (!appRuntime || !context) return undefined;
    const persistence = appRuntime.persistence;
    const detach = toolbar[nseAttachToolbar]({
      owner: controller,
      applicationId: appRuntime.app.bundleIdentifier,
      runtime: controllerServicesFor(context).menus.runtime,
      preferences: new NSEUserDefaults({
        get: (key) => persistence.getPreference<unknown>(key, null),
        set: (key, value) => { persistence.setPreference(key, value); },
        remove: (key) => persistence.removePreference(key),
      }),
    });
    setAttached(true);
    return () => {
      setAttached(false);
      detach();
    };
  }, [appRuntime, context, controller, toolbar]);
  useLayoutEffect(() => {
    const node = element.current;
    if (!node) return undefined;
    // Before layout reports a size (or where there is no layout), the toolbar spans the window.
    const view = node.ownerDocument.defaultView;
    // Items are laid out inside the bar's padding, so the width they share is its content box, not its frame.
    const measure = (width: number) => Math.floor(width || view?.innerWidth || 0);
    const measureFrame = (width: number) => width ? Math.floor(contentInlineSize(node, width)) : measure(width);
    setWidth(measureFrame(node.getBoundingClientRect().width));
    if (layout) return layout.observeElement(node, rect => setWidth(measureFrame(rect.width)));
    const Observer = view?.ResizeObserver;
    if (!view || !Observer) return undefined;
    let frame: number | null = null;
    const observer = new Observer(([entry]) => {
      if (!entry || frame !== null) return;
      frame = view.requestAnimationFrame(() => {
        frame = null;
        setWidth(measure(entry.contentRect.width));
      });
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (frame !== null) view.cancelAnimationFrame(frame);
    };
  }, [layout, toolbar.isVisible]);
  const engine = attached ? toolbar[nseToolbarEngine] : null;
  useLayoutEffect(() => {
    const node = tabItems.current;
    if (!node) { setTabItemsWidth(0); return undefined; }
    const measure = () => setTabItemsWidth(Math.ceil(node.getBoundingClientRect().width));
    measure();
    if (layout) return layout.observeElement(node, measure);
    const Observer = node.ownerDocument.defaultView?.ResizeObserver;
    const observer = Observer ? new Observer(measure) : null;
    observer?.observe(node);
    return () => observer?.disconnect();
  }, [layout, toolbar, tabViews.length]);
  useEffect(() => {
    if (!toolbar.customizationPaletteIsRunning || engine) return;
    toolbar[nseEndToolbarCustomization]();
  }, [engine, toolbar, toolbar.customizationPaletteIsRunning]);
  if (!toolbar.isVisible || !responderId) return null;
  return (
    <>
      <div ref={element} className="nse-window-toolbar" data-nse-part="toolbar" data-mode={mode} data-nse-colour-scheme-resolved={mode} data-toolbar-identifier={toolbar.identifier} data-has-tab-items={tabViews.length ? "true" : undefined}>
        {engine && width > 0 && (!tabViews.length || toolbar.items.length > 0) ? (
          <ToolbarView
            composition="configured"
            controller={engine}
            width={Math.max(0, width - tabItemsWidth)}
            interaction={{ overflowOverlayId: `${overlayId}:overflow`, parentResponderId: responderId }}
          />
        ) : null}
        {tabViews.length ? <div ref={tabItems} className="nse-window-toolbar-tab-items">
          {tabViews.map((view, index) => <Fragment key={index}>{view}</Fragment>)}
        </div> : null}
      </div>
      {engine && toolbar.customizationPaletteIsRunning ? (
        <ToolbarConfigurationSheet
          id={`${overlayId}:customize`}
          open
          anchor={element.current}
          parentResponderId={responderId}
          parentWindowControllerId={null}
          controller={engine}
          onOpenChange={(open) => { if (!open) toolbar[nseEndToolbarCustomization](); }}
        />
      ) : null}
    </>
  );
}

/**
 * @internal Where a window's sheets attach (NSWindow.beginSheet, attachedSheet): a layer at the top of
 * the window's content, under its title bar, toolbar and accessory row. A sheet renders into it through
 * a portal, so it keeps its presenter's React context and responder chain, and reports itself attached
 * while it is shown, which blocks the rest of the window.
 */
export interface NSEWindowSheetHost {
  readonly layer: HTMLElement | null;
  /** Marks a sheet attached; returns the function that detaches it. */
  attach(): () => void;
}

export const NSEWindowSheetHostContext = createContext<NSEWindowSheetHost | null>(null);

type InertElement = HTMLElement & { inert: boolean };

/**
 * @internal The window's sheet layer. While a sheet is attached, everything else the window draws
 * (its toolbar, accessory row and content) is inert, as a window with an attached sheet takes no input,
 * and `onAttachedChange` reports it so the window can refuse its close button.
 */
export function useNSEWindowSheetHost(onAttachedChange: (attached: boolean) => void): {
  readonly host: NSEWindowSheetHost;
  readonly layerRef: (element: HTMLDivElement | null) => void;
  readonly attached: boolean;
} {
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  const [count, setCount] = useState(0);
  const host = useMemo<NSEWindowSheetHost>(() => Object.freeze({
    layer,
    attach: () => {
      let attachedNow = true;
      setCount((value) => value + 1);
      return () => {
        if (!attachedNow) return;
        attachedNow = false;
        setCount((value) => value - 1);
      };
    },
  }), [layer]);
  const attached = count > 0;
  const report = useRef(onAttachedChange);
  report.current = onAttachedChange;
  useLayoutEffect(() => {
    if (!attached || !layer) return;
    // The layer's siblings, and the siblings of the content area it sits in: the window's other views.
    const blocked: InertElement[] = [];
    const block = (element: Element) => {
      for (const sibling of Array.from(element.parentElement?.children ?? [])) {
        if (sibling === element || !(sibling instanceof HTMLElement) || (sibling as InertElement).inert) continue;
        (sibling as InertElement).inert = true;
        blocked.push(sibling as InertElement);
      }
    };
    block(layer);
    const area = layer.parentElement;
    if (area?.classList.contains("nse-window-chrome-content")) block(area);
    report.current(true);
    return () => {
      for (const element of blocked) element.inert = false;
      report.current(false);
    };
  }, [attached, layer]);
  return { host, layerRef: setLayer, attached };
}

/** The length of a sheet's slide back under the toolbar, matching its exit presentation. */
const sheetExitSeconds = 0.3;

/** A static copy of a sheet as drawn, with the values typed into its fields. */
function copySheet(frame: HTMLElement): HTMLElement {
  const copy = frame.cloneNode(true) as HTMLElement;
  const sources = frame.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
  const targets = copy.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
  sources.forEach((source, index) => {
    const target = targets[index];
    if (!target) return;
    if (source instanceof HTMLInputElement && (source.type === "checkbox" || source.type === "radio")) (target as HTMLInputElement).checked = source.checked;
    else target.value = source.value;
  });
  return copy;
}

/**
 * @internal One sheet in the window's sheet layer. A sheet's controller is disposed as it is dismissed, so
 * its view is gone before the sheet leaves; the frame keeps a copy of what the sheet last drew (frozen once
 * `frozen` reports the content gone), and when the sheet detaches that inert copy slides back up under the
 * title bar and toolbar, the enter in reverse, and is removed. With reduced motion the copy fades instead.
 */
export function NSEWindowSheetFrame({ reducedMotion, frozen = false, holdsController = false, children }: {
  readonly reducedMotion: boolean;
  /** The sheet draws a view controller's view, which leaves when the controller is disposed. */
  readonly holdsController?: boolean;
  /** The sheet's content is gone (its controller was disposed): keep the last copy. */
  readonly frozen?: boolean;
  readonly children: ReactNode;
}) {
  const host = useContext(NSEWindowSheetHostContext);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const motion = useRef(reducedMotion);
  motion.current = reducedMotion;
  const frozenRef = useRef(frozen);
  frozenRef.current = frozen;
  const holdsRef = useRef(holdsController);
  holdsRef.current = holdsController;
  const snapshot = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    // A view controller's sheet is copied only while its view is drawn: once the controller is disposed its
    // frame leaves, possibly in a commit before the sheet's own.
    const capture = () => {
      if (frozenRef.current || (holdsRef.current && !frame.querySelector("[data-nse-view-controller]"))) return;
      snapshot.current = copySheet(frame);
    };
    capture();
    const Observer = frame.ownerDocument.defaultView?.MutationObserver;
    const observer = Observer ? new Observer(capture) : null;
    observer?.observe(frame, { subtree: true, childList: true, attributes: true, characterData: true });
    frame.addEventListener("input", capture, true);
    return () => {
      observer?.disconnect();
      frame.removeEventListener("input", capture, true);
    };
  }, []);
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const layer = host?.layer;
    return () => {
      if (!frame || !layer) return;
      const copy = frozenRef.current || holdsRef.current ? snapshot.current : copySheet(frame);
      // A remount (React's development double effects) keeps the same frame in the layer: nothing left.
      queueMicrotask(() => {
        if (!copy || frame.isConnected || !layer.isConnected) return;
        copy.setAttribute("inert", "");
        copy.setAttribute("aria-hidden", "true");
        copy.dataset.sheetExiting = "true";
        layer.appendChild(copy);
        const sheet = copy.querySelector<HTMLElement>(".nse-sheet") ?? copy;
        const remove = () => { copy.remove(); };
        if (typeof sheet.animate !== "function") { remove(); return; }
        const keyframes = motion.current
          ? [{ opacity: 1 }, { opacity: 0 }]
          : [{ transform: "translateY(0)" }, { transform: "translateY(-100%)" }];
        const animation = sheet.animate(keyframes, { duration: sheetExitSeconds * 1000, easing: "cubic-bezier(0.4, 0, 0.7, 0.2)", fill: "forwards" });
        animation.addEventListener("finish", remove, { once: true });
        animation.addEventListener("cancel", remove, { once: true });
      });
    };
  }, [host]);
  return <div ref={frameRef} data-nse-part="sheet" className="nse-window-sheet">{children}</div>;
}
