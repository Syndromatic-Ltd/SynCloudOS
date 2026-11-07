/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { useObserve } from "../Objects/useObserve";
import { NSEToolbar, nseRegisterToolbarTabView } from "../Toolbars/NSEToolbar";
import { nseAppearanceSlot, projectNSEAppearanceSlot, useNSEAppearance } from "../Appearance";
import { NSEChromeBevel, NSEChromeCap, NSEChromeGloss, NSEChromeInnerShadow, NSEChromeSurface } from "../Appearance/NSEChromePrimitives";
import type { NSETabViewController } from "./NSETabViewController";
import "./tabToolbarView.css";

/** @internal Installs toolbar-style tabs into the actual window toolbar, retaining app-owned items. */
export function useNSETabToolbar(controller: NSETabViewController): void {
  const enabled = controller.tabStyle === "toolbar";
  const window = controller.view.window;
  useLayoutEffect(() => {
    if (!enabled || !window) return undefined;
    const existing = window.toolbar;
    const toolbar = existing ?? new NSEToolbar({ identifier: `${controller.constructor.name}:tabs`, items: [], defaultItemIdentifiers: [] });
    const release = toolbar[nseRegisterToolbarTabView](controller, <NSETabToolbarView controller={controller} toolbar={toolbar} />);
    if (!existing) window.toolbar = toolbar;
    return () => {
      release();
      // An application that replaced the toolbar while this view was mounted keeps its replacement.
      if (!existing && !controller.isDisposed && window.toolbar === toolbar) window.toolbar = null;
    };
  }, [controller, enabled, window]);
}

/** Selectable NSToolbar items in the preferences-window presentation of NSTabViewController. */
function NSETabToolbarView({ controller, toolbar }: { readonly controller: NSETabViewController; readonly toolbar: NSEToolbar }) {
  useObserve(controller);
  useObserve(toolbar);
  const appearance = useNSEAppearance();
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const items = controller.tabViewItems;
  const selected = controller.selectedTabViewItem;
  const surface = projectNSEAppearanceSlot(nseAppearanceSlot("toolbar", "surface", "normal"), appearance);
  const move = (event: KeyboardEvent<HTMLButtonElement>, identifier: string) => {
    const index = items.findIndex(item => item.identifier === identifier);
    const rtl = event.currentTarget.ownerDocument.defaultView?.getComputedStyle(event.currentTarget).direction === "rtl";
    let next: number;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key === "ArrowRight") next = (index + (rtl ? -1 : 1) + items.length) % items.length;
    else if (event.key === "ArrowLeft") next = (index + (rtl ? 1 : -1) + items.length) % items.length;
    else return;
    event.preventDefault();
    const item = items[next];
    if (!item) return;
    controller.selectTabViewItem(item.identifier);
    buttons.current.get(item.identifier)?.focus({ preventScroll: true });
    buttons.current.get(item.identifier)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  };
  return <div className="nse-toolbar nse-tab-toolbar-items" role="toolbar" aria-label={controller.title ?? "Tabs"}
    data-nse-control="toolbar" data-nse-toolbar-size-mode={toolbar.sizeMode} {...surface.attributes}>
    <NSEChromeSurface slot={surface} state="normal" />
    <NSEChromeBevel slot={surface} state="normal" />
    <NSEChromeGloss slot={surface} state="normal" />
    {items.map(item => {
      const active = item === selected;
      const slot = projectNSEAppearanceSlot(nseAppearanceSlot("toolbar", "item", active ? "selected" : "normal"), appearance);
      return <button key={item.identifier} type="button" className="nse-toolbar-item" aria-pressed={active}
        aria-label={item.toolTip ?? item.label} title={item.toolTip} tabIndex={active ? 0 : -1}
        ref={element => { if (element) buttons.current.set(item.identifier, element); else buttons.current.delete(item.identifier); }}
        data-nse-control="toolbar-item" data-nse-part="item" data-state={active ? "selected" : "normal"}
        {...slot.attributes} onClick={() => controller.selectTabViewItem(item.identifier)} onKeyDown={event => move(event, item.identifier)}>
        <NSEChromeSurface slot={slot} state={active ? "selected" : "normal"} />
        <NSEChromeBevel slot={slot} state={active ? "selected" : "normal"} />
        <NSEChromeCap slot={slot} state={active ? "selected" : "normal"} />
        <NSEChromeGloss slot={slot} state={active ? "selected" : "normal"} />
        <NSEChromeInnerShadow slot={slot} state={active ? "selected" : "normal"} />
        {item.image && toolbar.displayMode !== "labelOnly" ? <span className="nse-toolbar-item-icon" aria-hidden="true">
          {item.image.kind === "vector" ? <img src={item.image.path} alt="" /> : <span data-nse-template-image={item.image.name} />}
        </span> : null}
        {toolbar.displayMode !== "iconOnly" ? <span className="nse-toolbar-item-label">{item.label}</span> : null}
      </button>;
    })}
  </div>;
}
