/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */

import { useId, type ReactNode } from "react";
import { useNSEAppearance } from "../Appearance";
import { AlertBackdrop } from "../Components/NSEAlertBackdrop";
import { AlertSurface } from "../Components/NSEAlertSurface";
import { NSEButton } from "../Controls/Buttons/NSEButton";
import { FocusScope } from "../Focus";
import type { WindowAlertRequest } from "../Application/NSEWindowController";
import type { WindowSurfaceRequest } from "../Overlays/NSEWindowSurfaceBridge";

/** @internal NSE owns sheet drawing; the application host owns presentation and dismissal. */
export function ControllerSheetSurface({ scopeId, attached, title, titleId, width, fullSizeContentView = false, onCancel, children }: {
  readonly scopeId: string;
  readonly attached: boolean;
  readonly title?: string;
  readonly titleId: string;
  readonly width?: number;
  /** The presented view owns the whole sheet: no system panel, margins or title heading. */
  readonly fullSizeContentView?: boolean;
  readonly onCancel: () => void;
  readonly children: ReactNode;
}) {
  const colourScheme = useNSEAppearance().resolvedColourScheme;
  return <FocusScope options={{ scopeId, kind: "modal", modal: true, trapFocus: true, asChild: true }}>
    <AlertBackdrop onSafeDismiss={onCancel} className={attached ? "nse-window-sheet-backdrop" : undefined} motion={attached ? "sheet" : "alert"}>
      <AlertSurface role="dialog" labelledBy={title && !fullSizeContentView ? titleId : undefined} aria-label={title && fullSizeContentView ? title : undefined}
        data-nse-full-size-content-view={fullSizeContentView ? "" : undefined} className="nse-sheet" motion={attached ? "sheet" : "alert"}
        appearance={attached ? colourScheme : "dark"}
        style={width === undefined ? undefined : { width: `min(${width}px, calc(100% - 32px))` }}>
        {title && !fullSizeContentView ? <h2 id={titleId} className="nse-sheet-title">{title}</h2> : null}
        {children}
      </AlertSurface>
    </AlertBackdrop>
  </FocusScope>;
}

/** @internal The panel host supplies geometry and dismissal; NSE draws the inherited appearance. */
export function OpenPanelSheetSurface({ request, compact, onClose, children }: {
  readonly request: WindowSurfaceRequest;
  readonly compact: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const appearance = useNSEAppearance();
  return <FocusScope options={{ scopeId: request.id, kind: "modal", modal: true, trapFocus: true, asChild: true }}>
    <div className="nse-open-sheet-backdrop nse-window-sheet-backdrop" data-compact={compact || undefined} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
      <section role="dialog" aria-modal="true" aria-label={request.title} data-nse-colour-scheme-resolved={appearance.resolvedColourScheme} className="nse-open-sheet nse-sheet" data-compact={compact || undefined}
        style={{ width: compact ? "100%" : `min(${request.bounds.width}px, calc(100% - 32px))`, height: `min(${request.bounds.height}px, 100%)` }}>{children}</section>
    </div>
  </FocusScope>;
}

/** @internal Alert drawing consumes a request and callbacks, never an application queue or SDK. */
export function WindowAlertContent({ request, scopeId, onChoose }: {
  readonly request: WindowAlertRequest;
  readonly scopeId: string;
  readonly onChoose: (buttonId?: string) => void;
}) {
  // The window's resolved colour scheme, as the system alert presenter uses the system's.
  const appearance = useNSEAppearance().resolvedColourScheme;
  const titleId = useId();
  const messageId = useId();
  const primary = request.buttons.find((button) => button.role === "default" || button.role === "destructive") ?? request.buttons[0];
  return <FocusScope options={{ scopeId: scopeId, kind: "modal", modal: true, trapFocus: true, asChild: true }}>
    <AlertBackdrop className="nse-window-sheet-backdrop" motion="sheet" onSafeDismiss={() => onChoose()}>
      <AlertSurface appearance={appearance} className="nse-sheet nse-alert-sheet" motion="sheet"
        labelledBy={titleId} describedBy={request.message ? messageId : undefined} initialFocusSelector="[data-nse-alert-primary]">
        <div className="nse-system-alert-content nse-confirm-content-textonly">
          <div className="nse-system-alert-copy">
            <h2 id={titleId}>{request.title}</h2>
            {request.message ? <p id={messageId}>{request.message}</p> : null}
          </div>
        </div>
        <div className="nse-alert-actions">
          {request.buttons.map((button) => <NSEButton
            key={button.id}
            title={button.label}
            hasDestructiveAction={button.role === "destructive"}
            keyEquivalent={button.role === "default" ? "\r" : undefined}
            appearance={button.role === "destructive" || button.role === "default" || appearance === "dark" ? undefined : "aqua"}
            className="nse-system-alert-action-button"
            data-nse-alert-primary={button === primary ? "" : undefined}
            onClick={() => onChoose(button.id)}
          />)}
        </div>
      </AlertSurface>
    </AlertBackdrop>
  </FocusScope>;
}
