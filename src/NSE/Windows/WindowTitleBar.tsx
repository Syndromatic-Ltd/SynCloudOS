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
import { WindowTitlebarDocumentContext, WindowTitlebarHostContext } from "./windowTitlebarContext";
import { WindowTitlebarView } from "./WindowTitlebarView";
import type { WindowViewProps } from "./windowViewTypes";

import "./nse-windows.css";

export interface WindowTitleBarProps {
  readonly record: WindowRecord;
  readonly dirty: boolean;
  readonly dispatchCommand: WindowViewProps["dispatchCommand"];
  readonly moveHandleProps?: HTMLAttributes<HTMLElement>;
  readonly controls?: readonly WindowControlKind[];

  readonly variant?: "standard" | "panel" | "hud";
}

export type WindowControlKind = "close" | "minimise" | "zoom" | "fullScreen";

function WindowControl({
  kind,
  record,
  dirty,
  dispatchCommand,
  hud = false,
}: {
  readonly kind: WindowControlKind;
  readonly hud?: boolean;
  readonly record: WindowRecord;
  readonly dirty: boolean;
  readonly dispatchCommand: WindowViewProps["dispatchCommand"];
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
  const commandId = kind === "fullScreen" ? "window.toggleFullScreen" : `window.${kind}`;
  const label = `${kind === "minimise" ? "Minimise" : kind === "zoom" ? "Zoom" : kind === "fullScreen" ? (record.fullScreen === "on" ? "Exit Full Screen" : "Enter Full Screen") : "Close"} ${record.title}`;
  return (
    <button
      type="button"
      className={`nse-window__control nse-window__control--${hud && kind === "close" ? "hud-close" : kind === "fullScreen" ? "zoom" : kind}`}
      aria-label={label}
      data-nse-control="button" data-nse-part="cell" data-nse-highlighted={highlighted ? "" : undefined} data-nse-role={kind} data-nse-style={kind === "close" && dirty ? "edited" : undefined}
      data-window-control={kind}
      data-window-control-state={state}

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

export function WindowTitleBar({
  record,
  dirty,
  dispatchCommand,
  moveHandleProps,
  controls = ["close", "minimise", "zoom", "fullScreen"],
  variant = "standard",
}: WindowTitleBarProps) {
  const document = React.useContext(WindowTitlebarDocumentContext);
  const host = React.useContext(WindowTitlebarHostContext);
  return (
    <WindowTitlebarView document={document ?? { title: record.title, subtitle: "", documentEdited: dirty }}
      material={document?.texturedBackground ? "metal" : document?.titlebarPresentation === "floating" ? "cumulus" : "standard"} isKeyWindow={record.isKey} titleId={`${record.id}-title`} variant={variant} moveHandleProps={moveHandleProps}
      onSlotsChange={host?.setSlots}
      controls={<div data-nse-part="accessory" className="nse-window__controls" data-syncloudos-focus-chrome="">
        {controls.includes("close") && record.style.includes("closable") ? (
          <WindowControl hud={variant === "hud"} kind="close" record={record} dirty={dirty} dispatchCommand={dispatchCommand} />
        ) : null}
        {controls.includes("minimise") && record.style.includes("minimisable") ? (
          <WindowControl kind="minimise" record={record} dirty={dirty} dispatchCommand={dispatchCommand} />
        ) : null}
        {controls.includes("zoom") && record.collectionBehavior !== "fullScreenPrimary" && record.style.includes("zoomable") ? (
          <WindowControl kind="zoom" record={record} dirty={dirty} dispatchCommand={dispatchCommand} />
        ) : null}
        {controls.includes("fullScreen") && record.collectionBehavior === "fullScreenPrimary" ? <WindowControl kind="fullScreen" record={record} dirty={dirty} dispatchCommand={dispatchCommand} /> : null}
      </div>} />
  );
}
