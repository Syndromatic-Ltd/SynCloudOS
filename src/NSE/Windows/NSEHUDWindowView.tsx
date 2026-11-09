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

import React, { useState } from "react";
import { NSEWindowView } from "./NSEWindowView";
import { assertNSEWindowViewRole, windowEscapeCloseHandler } from "./windowRoleViewHelpers";
import type { NSEWindowViewProps } from "./windowViewTypes";

function HUDTitleBar({ record, dispatchCommand, moveHandleProps }: Pick<NSEWindowViewProps, "record" | "dispatchCommand" | "moveHandleProps">) {
  const header = React.useRef<HTMLElement>(null);
  useNSEWindowChromeElement(header, "top", true);
  const [highlighted, setHighlighted] = useState(false);
  const { className, ...handleProps } = moveHandleProps ?? {};
  return (
    <header
      {...handleProps}
      ref={header}
      className={["nse-window__hud-titlebar", className].filter(Boolean).join(" ")}
      data-nse-part="header" data-window-hud-titlebar=""
    >
      {record.style.includes("closable") ? (
        <button
          type="button"
          className="nse-window__control nse-window__control--hud-close"
          aria-label={`Close ${record.title}`}
          data-nse-control="button" data-nse-part="cell" data-nse-role="close" data-nse-highlighted={highlighted ? "" : undefined} data-window-control="close"
          data-window-control-state={highlighted ? "highlighted" : "normal"}
          data-window-appearance-recipe={highlighted ? "window.hud.close.highlighted" : "window.hud.close.normal"}
          data-window-no-drag=""
          data-syncloudos-focus-chrome=""
          onPointerEnter={() => setHighlighted(true)}
          onPointerLeave={() => setHighlighted(false)}
          onPointerDown={() => setHighlighted(true)}
          onPointerUp={() => setHighlighted(false)}
          onClick={() => void dispatchCommand("window.close", { windowControllerId: record.id })}
        >
          <span data-nse-part="bezel" className="nse-window__control-paint" aria-hidden="true" />
        </button>
      ) : null}
      <h2 id={`${record.id}-title`} data-window-title="" data-nse-part="title" className="nse-window__hud-title">{record.title}</h2>
    </header>
  );
}

export function NSEHUDWindowView(props: NSEWindowViewProps) {
  assertNSEWindowViewRole("NSEHUDWindowView", props.record, "hud");
  if (props.record.level === "normal") throw new TypeError("NSEHUDWindowView requires a floating HUD level.");
  const titleBar = props.presentation.titleBarVisible && props.record.style.includes("titled") ? (
    <HUDTitleBar
      record={props.record}
      dispatchCommand={props.dispatchCommand}
      moveHandleProps={props.presentation.movable ? props.moveHandleProps : undefined}
    />
  ) : null;
  return (
    <NSEWindowView
      {...props}
      className="nse-window-view--hud"
      appearanceRecipe="window.hud.frame"
      titleBar={titleBar}
      onKeyDown={windowEscapeCloseHandler(props, props.record.style.includes("closable"))}
    />
  );
}
