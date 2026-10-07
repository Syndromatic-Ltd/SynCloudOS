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

import React, { useState, type HTMLAttributes } from "react";
import type { WindowRecord } from "../../SynCloudOS/SynCloudOS";
import type { NSEWindowViewProps } from "./windowViewTypes";
import type { NSEWindowAppearanceRecipeId } from "./windowAppearanceContract";

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
      <span className="nse-window__control-paint" aria-hidden="true" />
    </button>
  );
}

export function NSEWindowTitleBar({
  record,
  dirty,
  dispatchCommand,
  moveHandleProps,
  controls = ["close", "minimise", "zoom"],
  appearanceRecipe,
  variant = "standard",
}: NSEWindowTitleBarProps) {
  const { className: moveClassName, ...handleProps } = moveHandleProps ?? {};
  return (
    <header
      {...handleProps}
      className={["nse-window__titlebar", `nse-window__titlebar--${variant}`, moveClassName].filter(Boolean).join(" ")}
      data-window-titlebar=""
      data-window-panel-titlebar={variant === "panel" ? "" : undefined}
      data-window-active={record.isKey ? "true" : "false"}
      data-window-appearance-recipe={appearanceRecipe ?? (record.isKey ? "window.standard.head.active" : "window.standard.head.inactive")}
    >
      {/* Window controls stay in the tab order but are never a window's
          first responder, as in AppKit. */}
      <div className="nse-window__controls" data-syncloudos-focus-chrome="">
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
      <h2 id={`${record.id}-title`} data-window-title="" className="nse-window__title">
        {record.title}
      </h2>
    </header>
  );
}
