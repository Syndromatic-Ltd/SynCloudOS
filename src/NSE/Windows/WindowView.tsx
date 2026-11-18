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

import { useInPlaceAppearanceProjection, useNSEAppearance, ViewAppearanceBoundary } from "../Appearance/NSEAppearanceProvider";
import { useNSEContentLayoutProperties } from "../Layout/windowObstructions";

import React, { type KeyboardEventHandler, type ReactNode } from "react";
import { AppearanceNineSlice } from "../Appearance/NSEAppearanceNineSlice";
import { getOptionalSmoothSurfaceProps, useSmoothSurface } from "../SmoothSurface";
import { getSmoothSurfaceThemeHooks } from "../SmoothSurface/smoothSurface";

import type { SmoothSurfaceRequest } from "../SmoothSurface";
import type { WindowSmoothSurfaceConfiguration } from "../../SynCloudOS/SynCloudOS";
import type { WindowViewProps } from "./windowViewTypes";
import "./nse-windows.css";
import { WindowTitlebarHostContext, WindowTitlebarDocumentContext, type WindowTitlebarDocument, type WindowTitlebarSlots } from "./windowTitlebarContext";

export interface WindowFrameProps extends WindowViewProps {
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
}


const windowSmoothSurfaceRequest = (value: WindowSmoothSurfaceConfiguration | null): SmoothSurfaceRequest => {
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

export function WindowView(props: WindowFrameProps) {
  const [titlebarDocument, setTitlebarDocument] = React.useState<WindowTitlebarDocument | null>(null);
  const [slots, setSlots] = React.useState<WindowTitlebarSlots | null>(null);
  const titlebarHost = React.useMemo(() => ({ leadingAccessories: null, trailingAccessories: null,
    ...slots, setDocument: setTitlebarDocument, setSlots }), [slots]);

  return (
    <ViewAppearanceBoundary appearance={titlebarDocument?.appearance ?? null} projectBoundary={false}>
      <WindowTitlebarHostContext.Provider value={titlebarHost}>
        <WindowFrame {...props} titlebarDocument={titlebarDocument} />
      </WindowTitlebarHostContext.Provider>
    </ViewAppearanceBoundary>
  );
}

function WindowFrame({
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
  children,
  titlebarDocument,
}: WindowFrameProps & { readonly titlebarDocument: WindowTitlebarDocument | null }) {
  // Hooks precede the closed/hidden early return. The clip-path hook writes
  // real squircle geometry onto the surface element; the className/style
  // props carry the radius paint underneath. Shadow and resize handles are
  // siblings of the surface, so clipping never touches them; content scrolls
  // inside the clipped surface exactly like mounted app views.
  const appearance = useNSEAppearance();
  const projection = useInPlaceAppearanceProjection();
  const appearanceProjection = titlebarDocument?.appearance ? projection : undefined;
  const contentLayoutProperties = useNSEContentLayoutProperties();
  const [surfaceNode, setSurfaceNode] = React.useState<HTMLDivElement | null>(null);
  const smoothSurfaceRequest = windowSmoothSurfaceRequest(record.smoothSurface ?? null);
  useSmoothSurface(surfaceNode, smoothSurfaceRequest);
  if (record.state !== "open" || !presentation.visible) return null;
  const modal = record.role === "modal" || record.role === "sheet";
  const resolvedSemanticRole = semanticRole ?? (record.role === "borderless" ? "presentation" : "dialog");
  const labelledTitlePresent = Boolean(titleBar);
  const fallbackAccessibleName = resolvedSemanticRole === "dialog" && !accessibleName && !labelledTitlePresent
    ? record.title
    : accessibleName;

  const smoothSurfaceProps = getOptionalSmoothSurfaceProps(smoothSurfaceRequest);
  return (
    <section
      {...appearanceProjection}
      data-nse-control="window" data-nse-part="background" data-nse-role={record.role} data-nse-type={record.role === "borderless" ? "frameless" : "system"} data-nse-edge={arrowEdge} data-nse-alignment={arrowAlignment} data-nse-chrome={record.role === "hud" ? "hud" : appearance.chrome} data-nse-key-window={record.isKey ? undefined : "false"} data-nse-toolbar-style={titlebarDocument?.toolbarStyle ?? "automatic"}
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
      data-window-frame={record.role === "borderless" ? "frameless" : "system"}

      data-window-parent-id={record.parentWindowControllerId ?? undefined}
      data-window-anchor-id={record.anchor?.id}
      data-window-anchor-edge={record.anchor?.edge}
      data-window-anchor-alignment={record.anchor?.alignment}
      data-window-focus-scope={focusScope}
      data-window-outside-dismiss={outsideDismiss === undefined ? undefined : outsideDismiss ? "true" : "false"}

      data-window-arrow-edge={arrowEdge}
      data-window-arrow-alignment={arrowAlignment}
      style={{
        ...appearanceProjection?.style,
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
      }}
    >
      {hasShadow ? (
        <AppearanceNineSlice
          kind="window-shadow"
          className="nse-window__shadow-layer"
          data-window-shadow-layer="" data-nse-part="shadow"
        />
      ) : null}
      <div
        ref={setSurfaceNode}
        {...getSmoothSurfaceThemeHooks(smoothSurfaceRequest)}
        data-nse-part="bezel" className={["nse-window__surface", smoothSurfaceProps.className].filter(Boolean).join(" ")}
        data-full-size-content={titlebarDocument?.fullSizeContentView ? "" : undefined}
        style={{ ...smoothSurfaceProps.style,
          ...(titlebarDocument?.backgroundColour ? { backgroundColor: titlebarDocument.backgroundColour } : titlebarDocument?.isOpaque === false ? { backgroundColor: "transparent" } : {}),
          ...(titlebarDocument?.cornerRadius != null ? { borderRadius: titlebarDocument.cornerRadius } : {}) }}
        data-window-surface=""
      >
        <WindowTitlebarDocumentContext.Provider value={titlebarDocument}>{titleBar}</WindowTitlebarDocumentContext.Provider>
        <div data-nse-part="content" className="nse-window__content" data-window-content="" style={contentLayoutProperties}>{children}</div>
      </div>
      {resizeHandles}
    </section>
  );
}
