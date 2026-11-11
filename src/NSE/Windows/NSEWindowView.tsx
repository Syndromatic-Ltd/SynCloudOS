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

import { useNSEAppearance } from "../Appearance/NSEAppearanceProvider";
import { useNSEContentLayoutProperties } from "../Layout/windowChromeObstructions";

import React, { type KeyboardEventHandler, type ReactNode } from "react";
import { NSEAppearanceNineSlice } from "../Appearance/NSEAppearanceNineSlice";
import { getOptionalNSESmoothSurfaceProps, useNSESmoothSurface } from "../SmoothSurface";

import type { NSESmoothSurfaceRequest } from "../SmoothSurface";
import type { SynCloudOSAppFrameSmoothSurfaceManifest } from "../../SynCloudOS/SynCloudOS";
import type { NSEWindowViewProps } from "./windowViewTypes";
import "./nse-windows.css";
import { NSEWindowTitlebarHostContext, NSEWindowTitlebarDocumentContext, type NSEWindowTitlebarDocument } from "./windowTitlebarContext";

export interface NSEWindowFrameProps extends NSEWindowViewProps {
  readonly hasShadow?: boolean;

  readonly className?: string;
  readonly titleBar?: ReactNode;
  readonly resizeHandles?: ReactNode;
  readonly semanticRole?: "dialog" | "presentation";
  readonly accessibleName?: string;
  readonly focusScope?: "modal";
  readonly outsideDismiss?: boolean;

  readonly arrowEdge?: string;
  readonly arrowAlignment?: string;
  readonly onKeyDown?: KeyboardEventHandler<HTMLElement>;
  /** Ref callback receiving the view-rendered custom-titlebar slot node. The host owns the node from this callback — no imperative DOM creation. */
  readonly customTitleBarSlotRef?: (node: HTMLDivElement | null) => void;
}


const windowSmoothSurfaceRequest = (value: SynCloudOSAppFrameSmoothSurfaceManifest | null): NSESmoothSurfaceRequest => {
  if (value === null) return "off";
  if (typeof value === "object") {
    const { physicality, ...rest } = value;
    // The manifest allows "default" physicality; the surface request
    // resolves its own default when the field is absent.
    if (physicality === "default") return rest;
    return { ...rest, physicality };
  }
  return value;
};

export function NSEWindowView({
  record,
  presentation,
  zoomed = false,
  blocked,
  dirty,
  hasShadow = false,
  className = "",
  titleBar,
  resizeHandles,
  semanticRole,
  accessibleName,
  focusScope,
  outsideDismiss,
  arrowEdge,
  arrowAlignment,
  onKeyDown,
  customChromeActive,
  customTitleBarSlotRef,
  children,
}: NSEWindowFrameProps) {
  // Hooks precede the closed/hidden early return. The clip-path hook writes
  // real squircle geometry onto the surface element; the className/style
  // props carry the radius paint underneath. Shadow and resize handles are
  // siblings of the surface, so clipping never touches them; content scrolls
  // inside the clipped surface exactly like mounted app views.
  const appearance = useNSEAppearance();
  const contentLayoutProperties = useNSEContentLayoutProperties();
  const [titlebarDocument, setTitlebarDocument] = React.useState<NSEWindowTitlebarDocument | null>(null);
  const titlebarHost = React.useMemo(() => ({ setDocument: setTitlebarDocument, leadingAccessories: null, trailingAccessories: null }), []);
  const [surfaceNode, setSurfaceNode] = React.useState<HTMLDivElement | null>(null);
  const smoothSurfaceRequest = windowSmoothSurfaceRequest(record.smoothSurface ?? null);
  useNSESmoothSurface(surfaceNode, smoothSurfaceRequest);
  if (record.state !== "open" || !presentation.visible) return null;
  const modal = record.role === "modal" || record.role === "sheet";
  const resolvedSemanticRole = semanticRole ?? (record.role === "borderless" ? "presentation" : "dialog");
  const labelledTitlePresent = Boolean(titleBar || (customChromeActive && customTitleBarSlotRef));
  const fallbackAccessibleName = resolvedSemanticRole === "dialog" && !accessibleName && !labelledTitlePresent
    ? record.title
    : accessibleName;

  const smoothSurfaceProps = getOptionalNSESmoothSurfaceProps(smoothSurfaceRequest);
  return (
    <NSEWindowTitlebarHostContext.Provider value={titlebarHost}>
    <section
      data-nse-control="window" data-nse-part="background" data-nse-role={record.role} data-nse-type={record.chromeMode} data-nse-style={customChromeActive ? "custom" : undefined} data-nse-edge={arrowEdge} data-nse-alignment={arrowAlignment} data-nse-chrome={record.role === "hud" ? "hud" : appearance.chrome} data-nse-key-window={record.isKey ? undefined : "false"} data-nse-toolbar-style={titlebarDocument?.toolbarStyle ?? "automatic"}
      className={["nse-window-view", className].filter(Boolean).join(" ")}
      role={resolvedSemanticRole}
      aria-label={fallbackAccessibleName}
      aria-labelledby={!fallbackAccessibleName && labelledTitlePresent ? `${record.id}-title` : undefined}
      aria-modal={modal ? true : undefined}
      inert={blocked ? true : undefined}
      onKeyDown={onKeyDown}
      data-toolbar-style={titlebarDocument?.toolbarStyle ?? "automatic"}
      data-window-id={record.id}
      data-window-role={record.role}
      data-window-state={record.state}
      data-window-key={record.isKey ? "true" : "false"}
      data-window-main={record.isMain ? "true" : "false"}
      data-window-dirty={dirty ? "true" : "false"}
      data-window-presentation={presentation.kind}
      data-window-zoomed={zoomed ? "true" : "false"}
      data-window-level={record.level}
      data-window-blocked={blocked ? "true" : "false"}
      data-nse-enabled={blocked ? "false" : undefined}
      data-window-chrome-mode={record.chromeMode}
      data-window-custom-chrome-active={customChromeActive ? "true" : "false"}

      data-window-parent-id={record.parentWindowControllerId ?? undefined}
      data-window-anchor-id={record.anchor?.id}
      data-window-anchor-edge={record.anchor?.edge}
      data-window-anchor-alignment={record.anchor?.alignment}
      data-window-focus-scope={focusScope}
      data-window-outside-dismiss={outsideDismiss === undefined ? undefined : outsideDismiss ? "true" : "false"}

      data-window-arrow-edge={arrowEdge}
      data-window-arrow-alignment={arrowAlignment}
      style={{
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
      }}
    >
      {hasShadow ? (
        <NSEAppearanceNineSlice
          kind="window-shadow"
          className="nse-window__shadow-layer"
          data-window-shadow-layer="" data-nse-part="shadow"
        />
      ) : null}
      <div
        ref={setSurfaceNode}
        data-nse-part="bezel" className={["nse-window__surface", smoothSurfaceProps.className].filter(Boolean).join(" ")}
        style={smoothSurfaceProps.style}
        data-window-surface=""
      >
        <NSEWindowTitlebarDocumentContext.Provider value={titlebarDocument}>{titleBar}</NSEWindowTitlebarDocumentContext.Provider>
        {customTitleBarSlotRef ? (
          <div
            ref={customTitleBarSlotRef}
            data-nse-part="header" className="nse-window__custom-titlebar"
            data-window-titlebar="custom"
            role="presentation"
          />
        ) : null}
        <div data-nse-part="content" className="nse-window__content" data-window-content="" style={contentLayoutProperties}>{children}</div>
      </div>
      {resizeHandles}
    </section>
    </NSEWindowTitlebarHostContext.Provider>
  );
}
