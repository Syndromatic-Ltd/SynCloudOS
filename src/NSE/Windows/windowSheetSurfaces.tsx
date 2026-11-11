/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */

import { useId, type ReactNode } from "react";
import { useNSEAppearance } from "../Appearance";
import { NSEAlertBackdrop } from "../Components/NSEAlertBackdrop";
import { NSEAlertSurface } from "../Components/NSEAlertSurface";
import { NSEButton } from "../Controls/Buttons/NSEButton";
import { NSEFocusScope } from "../Focus";
import type { NSEWindowAlertRequest } from "../Application/NSEWindowController";
import type { NSEWindowSurfaceRequest } from "../Overlays/NSEWindowSurfaceBridge";

/** @internal NSE owns sheet drawing; the application host owns presentation and dismissal. */
export function NSEControllerSheetSurface({ scopeId, attached, title, titleId, width, onCancel, children }: {
  readonly scopeId: string;
  readonly attached: boolean;
  readonly title?: string;
  readonly titleId: string;
  readonly width?: number;
  readonly onCancel: () => void;
  readonly children: ReactNode;
}) {
  const colourScheme = useNSEAppearance().resolvedColourScheme;
  return <NSEFocusScope options={{ scopeId, kind: "modal", modal: true, trapFocus: true, asChild: true }}>
    <NSEAlertBackdrop onSafeDismiss={onCancel} className={attached ? "nse-window-sheet-backdrop" : undefined} motion={attached ? "sheet" : "alert"}>
      <NSEAlertSurface role="dialog" labelledBy={title ? titleId : undefined} className="nse-sheet" motion={attached ? "sheet" : "alert"}
        appearance={attached ? colourScheme : "dark"}
        style={width === undefined ? undefined : { width: `min(${width}px, calc(100% - 32px))` }}>
        {title ? <h2 id={titleId} className="nse-sheet-title">{title}</h2> : null}
        {children}
      </NSEAlertSurface>
    </NSEAlertBackdrop>
  </NSEFocusScope>;
}

/** @internal The panel host supplies geometry and dismissal; NSE draws the inherited appearance. */
export function NSEOpenPanelSheetSurface({ request, compact, onClose, children }: {
  readonly request: NSEWindowSurfaceRequest;
  readonly compact: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const appearance = useNSEAppearance();
  return <NSEFocusScope options={{ scopeId: request.id, kind: "modal", modal: true, trapFocus: true, asChild: true }}>
    <div className="nse-open-sheet-backdrop nse-window-sheet-backdrop" data-compact={compact || undefined} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
      <section role="dialog" aria-modal="true" aria-label={request.title} data-nse-colour-scheme-resolved={appearance.resolvedColourScheme} className="nse-open-sheet nse-sheet" data-compact={compact || undefined}
        style={{ width: compact ? "100%" : `min(${request.bounds.width}px, calc(100% - 32px))`, height: `min(${request.bounds.height}px, 100%)` }}>{children}</section>
    </div>
  </NSEFocusScope>;
}

/** @internal Alert drawing consumes a request and callbacks, never an application queue or SDK. */
export function NSEWindowAlertContent({ request, scopeId, onChoose }: {
  readonly request: NSEWindowAlertRequest;
  readonly scopeId: string;
  readonly onChoose: (buttonId?: string) => void;
}) {
  // The window's resolved colour scheme, as the system alert presenter uses the system's.
  const appearance = useNSEAppearance().resolvedColourScheme;
  const titleId = useId();
  const messageId = useId();
  const primary = request.buttons.find((button) => button.role === "default" || button.role === "destructive") ?? request.buttons[0];
  return <NSEFocusScope options={{ scopeId: scopeId, kind: "modal", modal: true, trapFocus: true, asChild: true }}>
    <NSEAlertBackdrop className="nse-window-sheet-backdrop" motion="sheet" onSafeDismiss={() => onChoose()}>
      <NSEAlertSurface appearance={appearance} className="nse-sheet nse-alert-sheet" motion="sheet"
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
      </NSEAlertSurface>
    </NSEAlertBackdrop>
  </NSEFocusScope>;
}
