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

import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { NSEAnyWindowController } from "../../NSE/applicationHostInterop";
import { useObserve, NSEActionResponderContext } from "../../NSE/applicationHostInterop";
import { nseAttachToolbar, nseEndToolbarCustomization, nseToolbarEngine, type NSEToolbar } from "../../NSE/Toolbars/NSEToolbar";
import { NSEToolbarView } from "../../NSE/Toolbars/NSEToolbarView";
import { NSEToolbarConfigurationSheet } from "../../NSE/Toolbars/NSEToolbarConfigurationSheet";
import type { NSETitlebarAccessoryViewController } from "../../NSE/Application/NSETitlebarAccessoryViewController";
import { SynWareRuntimeContext } from "../../SynCloudOSReact";
import { useSynWareContext } from "../AppSDK/SynWareContext";
import { controllerServicesFor } from "../AppSDK/controllerServices";
import "./window-chrome.css";

const noSubscription = () => () => {};

/** What a window on the stage shows in the stage's title bar. */
export interface NSEWindowTitlebarDocument {
  readonly title: string;
  readonly subtitle: string;
  readonly documentEdited: boolean;
}

/**
 * @internal The stage's title bar, as the window shown on it sees it. A window claims it while it
 * is mounted, and its leading and trailing accessories render into the bar through portals so they
 * keep the application's React context and responder chain.
 */
export interface NSEWindowTitlebarHost {
  setDocument(document: NSEWindowTitlebarDocument | null): void;
  readonly leadingAccessories: HTMLElement | null;
  readonly trailingAccessories: HTMLElement | null;
}

export const NSEWindowTitlebarHostContext = createContext<NSEWindowTitlebarHost | null>(null);

/** Publishes the window's title, subtitle and edited state to the stage's title bar. */
export function useNSEWindowTitlebarDocument(controller: NSEAnyWindowController, host: NSEWindowTitlebarHost | null): void {
  useObserve(controller);
  const window = controller.isDisposed ? null : controller.window;
  const title = window?.title ?? "";
  const subtitle = window?.subtitle ?? "";
  const documentEdited = window?.isDocumentEdited ?? false;
  const claims = Boolean(window && (title || subtitle || window.titlebarAccessoryViewControllers.length));
  useLayoutEffect(() => {
    if (!host || !claims) return undefined;
    host.setDocument(Object.freeze({ title, subtitle, documentEdited }));
    return undefined;
  }, [claims, documentEdited, host, subtitle, title]);
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
  readonly host: NSEWindowTitlebarHost | null;
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
  const mode = useWindowChromeMode();
  return <div className="nse-window-titlebar-accessories" data-nse-part="titlebar-accessories" data-mode={mode}>{children}</div>;
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
  const mode = useWindowChromeMode();
  const style = { "--nse-window-content-border-thickness": `${thickness}px` } as CSSProperties;
  const size = nseContentBorderSize(thickness);
  return <>
    <div className="nse-window-content-border" data-nse-part="content-border" data-edge="minY" data-size={size} data-mode={mode} style={style} aria-hidden="true">
      <span className="nse-window-content-border-grain" />
    </div>
    <div className="nse-window-content-border-edge" data-edge="minY" data-size={size} data-mode={mode} style={style} aria-hidden="true" />
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
  const appRuntime = useContext(SynWareRuntimeContext);
  const context = useSynWareContext();
  // The window controller's responder when it has actions; otherwise the application's mount.
  const responderId = useContext(NSEActionResponderContext) ?? appRuntime?.responderId ?? null;
  const overlayId = `nse-window-toolbar:${useId()}`;
  const mode = useWindowChromeMode();
  const element = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [attached, setAttached] = useState(false);
  useLayoutEffect(() => {
    if (!appRuntime || !context) return undefined;
    const persistence = appRuntime.persistence;
    const detach = toolbar[nseAttachToolbar]({
      owner: controller,
      applicationId: appRuntime.app.bundleIdentifier,
      runtime: controllerServicesFor(context).menus.runtime,
      preferences: {
        read: (key) => persistence.getPreference<unknown>(key, null),
        write: (key, value) => { persistence.setPreference(key, value); },
        remove: (key) => persistence.removePreference(key),
      },
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
    const measure = (width: number) => Math.floor(width || view?.innerWidth || 0);
    setWidth(measure(node.getBoundingClientRect().width));
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
  }, [toolbar.isVisible]);
  const engine = attached ? toolbar[nseToolbarEngine] : null;
  useEffect(() => {
    if (!toolbar.customizationPaletteIsRunning || engine) return;
    toolbar[nseEndToolbarCustomization]();
  }, [engine, toolbar, toolbar.customizationPaletteIsRunning]);
  if (!toolbar.isVisible || !responderId) return null;
  return (
    <>
      <div ref={element} className="nse-window-toolbar" data-nse-part="toolbar" data-mode={mode} data-toolbar-identifier={toolbar.identifier}>
        {engine && width > 0 ? (
          <NSEToolbarView
            composition="configured"
            controller={engine}
            width={width}
            interaction={{ overflowOverlayId: `${overlayId}:overflow`, parentResponderId: responderId }}
          />
        ) : null}
      </div>
      {engine && toolbar.customizationPaletteIsRunning ? (
        <NSEToolbarConfigurationSheet
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
