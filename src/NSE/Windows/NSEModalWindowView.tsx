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
import { assertNSEWindowViewRole } from "./windowRoleViewHelpers";
import type { NSEWindowViewProps } from "./windowViewTypes";

export function NSEModalWindowView(props: NSEWindowViewProps) {
  assertNSEWindowViewRole("NSEModalWindowView", props.record, "modal");
  const titleBar = props.presentation.titleBarVisible && props.record.style.includes("titled") ? (
    <NSEWindowTitleBar
      record={props.record}
      dirty={props.dirty}
      dispatchCommand={props.dispatchCommand}
      moveHandleProps={props.presentation.movable ? props.moveHandleProps : undefined}
      controls={["close"]}
    />
  ) : null;
  return (
    <NSEWindowView
      {...props}
      className="nse-window-view--modal"
      appearanceRecipe="window.standard.frame"
      shadowRecipe="window.standard.shadow"
      titleBar={titleBar}
      focusScope="modal"
    />
  );
}
