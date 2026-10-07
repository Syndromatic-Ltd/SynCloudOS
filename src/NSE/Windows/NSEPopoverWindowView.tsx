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
import { assertNSEWindowViewRole, windowEscapeCloseHandler } from "./windowRoleViewHelpers";
import type { NSEWindowViewProps } from "./windowViewTypes";

export function NSEPopoverWindowView(props: NSEWindowViewProps) {
  assertNSEWindowViewRole("NSEPopoverWindowView", props.record, "popover");
  const { anchor } = props.record;
  if (!anchor) throw new TypeError("NSEPopoverWindowView requires window anchor provenance.");
  const titled = props.presentation.titleBarVisible && props.record.style.includes("titled");
  const titleBar = titled ? (
    <NSEWindowTitleBar
      record={props.record}
      dirty={props.dirty}
      dispatchCommand={props.dispatchCommand}
      controls={["close"]}
      appearanceRecipe="window.standard.head.solid"
    />
  ) : null;
  const outsideDismiss = !props.record.pinned;
  return (
    <NSEWindowView
      {...props}
      className="nse-window-view--popover"
      appearanceRecipe="window.popover.frame"
      accessibleName={titled ? undefined : props.record.title}
      titleBar={titleBar}
      outsideDismiss={outsideDismiss}
      arrowEdge={anchor.edge}
      arrowAlignment={anchor.alignment}
      onKeyDown={windowEscapeCloseHandler(
        props,
        outsideDismiss && props.record.style.includes("closable"),
      )}
    />
  );
}
