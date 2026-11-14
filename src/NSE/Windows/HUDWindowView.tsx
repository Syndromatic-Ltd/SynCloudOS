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
import { WindowTitleBar } from "./WindowTitleBar";
import { WindowView } from "./WindowView";
import { assertNSEWindowViewRole, windowEscapeCloseHandler } from "./windowRoleViewHelpers";
import type { WindowViewProps } from "./windowViewTypes";

export function HUDWindowView(props: WindowViewProps) {
  assertNSEWindowViewRole("NSEHUDWindowView", props.record, "hud");
  if (props.record.level === "normal") throw new TypeError("NSEHUDWindowView requires a floating HUD level.");
  const titleBar = props.presentation.titleBarVisible && props.record.style.includes("titled") ? (
    <WindowTitleBar
      variant="hud" controls={["close"]}
      dirty={props.dirty}
      record={props.record}
      dispatchCommand={props.dispatchCommand}
      moveHandleProps={props.presentation.movable ? props.moveHandleProps : undefined}
    />
  ) : null;
  return (
    <WindowView
      {...props}
      className="nse-window-view--hud"

      titleBar={titleBar}
      onKeyDown={windowEscapeCloseHandler(props, props.record.style.includes("closable"))}
    />
  );
}
