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

import { useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./components.css";
import "./nseSystemDialogs.css";
import { NSEFocusScope } from "../Focus";
import { NSEPushButton } from "../Controls/Buttons/NSEButtons";
import { NSEAlert } from "./NSEAlert";
import { NSEAlertBackdrop } from "./NSEAlertBackdrop";
import { useNSEVisualEnvironment } from "../Appearance";

/** A system dialog takes the host's light or dark appearance unless told otherwise. */
function useSystemDialogAppearance(appearance: "dark" | "light" | undefined): "dark" | "light" {
  const { resolvedAppearance } = useNSEVisualEnvironment();
  return appearance ?? (resolvedAppearance === "dark" ? "dark" : "light");
}

/**
 * The two dialogs every SynWare is expected to have: About, and a confirm.
 *
 * Both sit on the SAME surface the error alerts use (NSEAlert inside
 * NSEAlertBackdrop) rather than on a popup of their own. macOS does the same
 * thing — the About panel and a "are you sure?" sheet are the one alert widget
 * with different content — and it means focus trapping, the Escape key, the
 * sibling `inert` handling and the dim backdrop are inherited rather than
 * rewritten per dialog.
 */

export interface NSEAboutInfo {
  /** CFBundleName equivalent. */
  name: string;
  /** CFBundleIconFile equivalent. */
  iconSrc?: string;
  iconAlt?: string;
  /** One line saying what the app IS, the way Finder's About states itself. */
  tagline?: string;
  /** CFBundleShortVersionString. */
  version: string;
  /** CFBundleVersion, shown in parentheses after the version. */
  build?: string;
  /** NSHumanReadableCopyright. */
  copyright: string;
  trademark: string;
}

export interface NSEAboutDialogProps {
  open: boolean;
  info: NSEAboutInfo;
  /** Runtime hosts can provide a stable logical scope identity. */
  focusScopeId?: string;
  /** Defaults to "OK"; pass the localised string. */
  dismissLabel?: string;
  versionLabel?: (version: string, build?: string) => string;
  /** Defaults to the host's resolved light or dark appearance. */
  appearance?: "dark" | "light";
  onDismiss: () => void;
}

export function NSEAboutDialog({
  open,
  info,
  focusScopeId,
  dismissLabel = "OK",
  versionLabel,
  appearance: requestedAppearance,
  onDismiss
}: NSEAboutDialogProps) {
  const appearance = useSystemDialogAppearance(requestedAppearance);
  const titleId = useId();
  const describedId = useId();

  if (!open || typeof document === "undefined") return null;

  const version = versionLabel
    ? versionLabel(info.version, info.build)
    : `Version ${info.version}${info.build ? ` (${info.build})` : ""}`;

  return createPortal(
    <NSEFocusScope options={{ scopeId: focusScopeId ?? `nse-system-about:${titleId}`, kind: "modal", modal: true, trapFocus: true, asChild: true }}>
    <NSEAlertBackdrop onSafeDismiss={onDismiss}>
      <NSEAlert
        appearance={appearance}
        role="dialog"
        className="nse-about-dialog"
        labelledBy={titleId}
        describedBy={describedId}
        initialFocusSelector=".nse-about-dismiss"
      >
        <div className={`nse-about-content${info.iconSrc ? "" : " nse-about-content-textonly"}`}>
          {info.iconSrc ? (
            <img
              className="nse-about-icon"
              src={info.iconSrc}
              alt={info.iconAlt ?? ""}
              aria-hidden={info.iconAlt ? undefined : true}
            />
          ) : null}
          <div className="nse-about-copy">
            <h2 id={titleId} className="nse-about-name">{info.name}</h2>
            {info.tagline ? <p id={describedId} className="nse-about-tagline">{info.tagline}</p> : null}
            <p className="nse-about-version">{version}</p>
            <p className="nse-about-legal">{info.copyright}</p>
            <p className="nse-about-legal nse-about-trademark">{info.trademark}</p>
          </div>
        </div>
        <div className="nse-alert-actions">
          <NSEPushButton className="nse-system-alert-action-button nse-about-dismiss" tone={appearance === "dark" ? "medium" : "light"} onClick={onDismiss}>
            {dismissLabel}
          </NSEPushButton>
        </div>
      </NSEAlert>
    </NSEAlertBackdrop>
    </NSEFocusScope>,
    document.body
  );
}

export interface NSEConfirmDialogProps {
  open: boolean;
  /** Runtime hosts can provide a stable logical scope identity. */
  focusScopeId?: string;
  title: ReactNode;
  message?: ReactNode;
  iconSrc?: string;
  /** The destructive choice. Rendered as the negative (red) button. */
  confirmLabel: string;
  cancelLabel: string;
  /** Defaults to the host's resolved light or dark appearance. */
  appearance?: "dark" | "light";
  onConfirm: () => void;
  onCancel: () => void;
}

export function NSEConfirmDialog({
  open,
  focusScopeId,
  title,
  message,
  iconSrc,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  appearance: requestedAppearance
}: NSEConfirmDialogProps) {
  const appearance = useSystemDialogAppearance(requestedAppearance);
  const titleId = useId();
  const messageId = useId();

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    // Escape and a backdrop click both CANCEL, never confirm — the safe choice
    // is the one that happens by accident.
    <NSEFocusScope options={{ scopeId: focusScopeId ?? `nse-system-confirm:${titleId}`, kind: "modal", modal: true, trapFocus: true, asChild: true }}>
    <NSEAlertBackdrop onSafeDismiss={onCancel}>
      <NSEAlert
        appearance={appearance}
        labelledBy={titleId}
        describedBy={message ? messageId : undefined}
        initialFocusSelector=".nse-confirm-cancel"
      >
        {/* Without an icon the copy would otherwise land in the alert's fixed
            116px icon column and wrap to a ragged strip. */}
        <div className={`nse-system-alert-content${iconSrc ? "" : " nse-confirm-content-textonly"}`}>
          {iconSrc ? (
            <div className="nse-system-alert-icon-frame">
              <img className="nse-system-alert-icon" src={iconSrc} alt="" aria-hidden="true" />
            </div>
          ) : null}
          <div className="nse-system-alert-copy">
            <h2 id={titleId}>{title}</h2>
            {message ? <p id={messageId}>{message}</p> : null}
          </div>
        </div>
        <div className="nse-alert-actions">
          <NSEPushButton className="nse-system-alert-action-button" tone="negative" onClick={onConfirm}>
            {confirmLabel}
          </NSEPushButton>
          <NSEPushButton className="nse-system-alert-action-button nse-confirm-cancel" tone={appearance === "dark" ? "medium" : "light"} onClick={onCancel}>
            {cancelLabel}
          </NSEPushButton>
        </div>
      </NSEAlert>
    </NSEAlertBackdrop>
    </NSEFocusScope>,
    document.body
  );
}
