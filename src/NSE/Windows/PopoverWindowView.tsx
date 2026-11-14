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

export function PopoverWindowView(props: WindowViewProps) {
  assertNSEWindowViewRole("NSEPopoverWindowView", props.record, "popover");
  const { anchor } = props.record;
  if (!anchor) throw new TypeError("NSEPopoverWindowView requires window anchor provenance.");
  const titled = props.presentation.titleBarVisible && props.record.style.includes("titled");
  const titleBar = titled ? (
    <WindowTitleBar
      record={props.record}
      dirty={props.dirty}
      dispatchCommand={props.dispatchCommand}
      controls={["close"]}

    />
  ) : null;
  const outsideDismiss = !props.record.pinned;
  return (
    <WindowView
      {...props}
      className="nse-window-view--popover"

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
