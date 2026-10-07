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

import React from "react";
import { NSEWindowTitleBar } from "./NSEWindowTitleBar";
import { NSEWindowView } from "./NSEWindowView";
import type { NSEWindowViewProps, WindowResizeEdge } from "./windowViewTypes";
import { assertNSEWindowViewRole } from "./windowRoleViewHelpers";

const resizeEdges: readonly WindowResizeEdge[] = Object.freeze([
  "block-start",
  "block-end",
  "inline-start",
  "inline-end",
  "block-start-inline-start",
  "block-start-inline-end",
  "block-end-inline-start",
  "block-end-inline-end",
]);

export function NSEStandardWindowView(props: NSEWindowViewProps) {
  assertNSEWindowViewRole("NSEStandardWindowView", props.record, "standard");
  const { record, presentation, dirty, dispatchCommand, moveHandleProps, resizeHandleProps } = props;
  // Explicit chrome decision: custom chrome suppresses the system bar only
  // once the host handshake reports it active. chromeMode alone must never
  // blank the bar — a missing customChromeActive prop therefore paints the
  // system fallback, matching a pending or failed renderer.
  const customChromeActive = props.customChromeActive === true;
  const frameless = record.chromeMode === "frameless";
  const paintsSystemChrome = !customChromeActive && !frameless;
  const showsTitleBar = paintsSystemChrome && presentation.titleBarVisible && record.style.includes("titled");
  const showsResizeHandles = presentation.kind === "desktop-window" &&
    presentation.resizable && record.style.includes("resizable");
  const titleBar = showsTitleBar ? (
    <NSEWindowTitleBar
      record={record}
      dirty={dirty}
      dispatchCommand={dispatchCommand}
      moveHandleProps={presentation.movable ? moveHandleProps : undefined}
    />
  ) : null;
  const resizeHandles = showsResizeHandles ? resizeEdges.map((edge) => (
    <div
      {...resizeHandleProps?.[edge]}
      key={edge}
      className={`nse-window__resize-handle nse-window__resize-handle--${edge}`}
      data-window-resize-edge={edge}
      data-window-appearance-recipe="window.standard.resize"
      aria-hidden="true"
    />
  )) : null;
  return (
    <NSEWindowView
      {...props}
      className="nse-window-view--standard"
      appearanceRecipe="window.standard.frame"
      shadowRecipe={paintsSystemChrome ? "window.standard.shadow" : undefined}
      titleBar={titleBar}
      resizeHandles={resizeHandles}
    />
  );
}
