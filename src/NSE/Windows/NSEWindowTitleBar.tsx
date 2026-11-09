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

import { useNSEWindowChromeElement } from "../Layout/windowChromeObstructions";

import React, { useState, type HTMLAttributes } from "react";
import type { WindowRecord } from "../../SynCloudOS/SynCloudOS";
import { NSEWindowTitlebarDocumentContext } from "./windowTitlebarContext";
import type { NSEWindowViewProps } from "./windowViewTypes";
import type { NSEWindowAppearanceRecipeId } from "./windowAppearanceContract";
import "./nse-windows.css";

export interface NSEWindowTitleBarProps {
  readonly record: WindowRecord;
  readonly dirty: boolean;
  readonly dispatchCommand: NSEWindowViewProps["dispatchCommand"];
  readonly moveHandleProps?: HTMLAttributes<HTMLElement>;
  readonly controls?: readonly WindowControlKind[];
  readonly appearanceRecipe?: NSEWindowAppearanceRecipeId;
  readonly variant?: "standard" | "panel";
}

export type WindowControlKind = "close" | "minimise" | "zoom";

function NSEWindowControl({
  kind,
  record,
  dirty,
  dispatchCommand,
}: {
  readonly kind: WindowControlKind;
  readonly record: WindowRecord;
  readonly dirty: boolean;
  readonly dispatchCommand: NSEWindowViewProps["dispatchCommand"];
}) {
  const [highlighted, setHighlighted] = useState(false);
  const ordinaryState = kind === "close"
    ? record.isKey
      ? dirty ? "unsaved" : "normal"
      : dirty ? "unsaved-inactive" : "inactive"
    : "normal";
  const state = highlighted
    ? kind === "close" && dirty ? "unsaved-highlighted" : "highlighted"
    : ordinaryState;
  const commandId = `window.${kind}`;
  const label = `${kind === "minimise" ? "Minimise" : kind === "zoom" ? "Zoom" : "Close"} ${record.title}`;
  return (
    <button
      type="button"
      className={`nse-window__control nse-window__control--${kind}`}
      aria-label={label}
      data-nse-control="button" data-nse-part="cell" data-nse-highlighted={highlighted ? "" : undefined} data-nse-role={kind}
      data-window-control={kind}
      data-window-control-state={state}
      data-window-appearance-recipe={`window.standard.${kind}.${state}`}
      data-window-no-drag=""
      onPointerEnter={() => setHighlighted(true)}
      onPointerLeave={() => setHighlighted(false)}
      onPointerDown={() => setHighlighted(true)}
      onPointerUp={() => setHighlighted(false)}
      onClick={() => void dispatchCommand(commandId, { windowControllerId: record.id })}
    >
      <span data-nse-part="bezel" className="nse-window__control-paint" aria-hidden="true" />
    </button>
  );
}

export function NSEWindowTitleBar(props: NSEWindowTitleBarProps | { readonly title: string; readonly isKeyWindow: boolean }) {
  const header = React.useRef<HTMLElement>(null);
  useNSEWindowChromeElement(header, "top", false, "title" in props);
  if ("title" in props) return <header data-nse-part="header" data-nse-key-window={props.isKeyWindow ? undefined : "false"} ref={header} className="nse-window__titlebar nse-window__titlebar--standard" data-window-titlebar="" data-window-host-titlebar="" style={{ height: "100%", minHeight: "100%" }} data-window-active={props.isKeyWindow ? "true" : "false"} data-window-appearance-recipe={props.isKeyWindow ? "window.standard.head.active" : "window.standard.head.inactive"}>
    <h2 data-nse-part="title" className="nse-window__title">{props.title}</h2>
  </header>;
  return <NSEManagedWindowTitleBar {...props} />;
}
function NSEManagedWindowTitleBar({
  record,
  dirty,
  dispatchCommand,
  moveHandleProps,
  controls = ["close", "minimise", "zoom"],
  appearanceRecipe,
  variant = "standard",
}: NSEWindowTitleBarProps) {
  const header = React.useRef<HTMLElement>(null);
  useNSEWindowChromeElement(header, "top", false);
  const document = React.useContext(NSEWindowTitlebarDocumentContext);
  const { className: moveClassName, ...handleProps } = moveHandleProps ?? {};
  return (
    <header
      {...handleProps}
      ref={header}
      className={["nse-window__titlebar", `nse-window__titlebar--${variant}`, moveClassName].filter(Boolean).join(" ")}
      data-toolbar-style={document?.toolbarStyle ?? "automatic"}
      data-nse-part="header" data-nse-key-window={record.isKey ? undefined : "false"}
      data-window-titlebar=""
      data-window-panel-titlebar={variant === "panel" ? "" : undefined}
      data-window-active={record.isKey ? "true" : "false"}
      data-window-appearance-recipe={appearanceRecipe ?? (record.isKey ? "window.standard.head.active" : "window.standard.head.inactive")}
    >
      {/* Window controls stay in the tab order but are never a window's
          first responder, as in AppKit. */}
      <div data-nse-part="accessory" className="nse-window__controls" data-syncloudos-focus-chrome="">
        {controls.includes("close") && record.style.includes("closable") ? (
          <NSEWindowControl kind="close" record={record} dirty={dirty} dispatchCommand={dispatchCommand} />
        ) : null}
        {controls.includes("minimise") && record.style.includes("minimisable") ? (
          <NSEWindowControl kind="minimise" record={record} dirty={dirty} dispatchCommand={dispatchCommand} />
        ) : null}
        {controls.includes("zoom") && record.style.includes("zoomable") ? (
          <NSEWindowControl kind="zoom" record={record} dirty={dirty} dispatchCommand={dispatchCommand} />
        ) : null}
      </div>
      <h2 id={`${record.id}-title`} data-window-title="" data-nse-part="title" className="nse-window__title">
        {document?.title ?? record.title}
        {document?.subtitle ? <span data-nse-part="subtitle" className="nse-window-titlebar-subtitle">{document.subtitle}</span> : null}
      </h2>
    </header>
  );
}
