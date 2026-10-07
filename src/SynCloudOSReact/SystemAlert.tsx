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

import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { NSEPresence, useNSEAnimationEnvironment, useNSEPresentation } from "../NSE/Animation";
import { resolveSystemAlertDetailsMotion } from "./SystemAlert.transitions";
import { NSEPushButton, type NSEButtonTone } from "../NSE/public/controls";
import { NSEAlert } from "../NSE/hostComposition";
import cautionIcon from "./Resources/AlertCautionIcon.png?url&no-inline";
import { synCloudOSLogoUrl as synCloudOSLogo } from "../SynCloudOS/Resources/frameworkAssets";
import type { ResolvedSiteBranding } from "../SynCloudOS/SynCloudOS";
import { useHostSiteBranding } from "./siteBrandingContext";
import "./system-alert.css";

/** The disclosed technical report. Its scroll box wraps the text in a single
 * child element so the global NSERubberBandProvider can translate it for the
 * iOS overscroll bounce (a bare <pre> has no element child for it to move).
 * The native scrollbar is hidden in CSS. */
function SystemAlertDetails({ details }: { details: string }) {
  const { reducedMotion } = useNSEAnimationEnvironment();
  const detailsRef = useRef<HTMLDivElement>(null);
  useNSEPresentation(detailsRef, resolveSystemAlertDetailsMotion(reducedMotion));
  return (
    <div ref={detailsRef} className="nse-alert-details">
      <pre className="nse-alert-details-text">{details}</pre>
    </div>
  );
}

const appScopedErrorCodes = new Set([
  "APP_NOT_FOUND",
  "APP_LAUNCH_FAILED",
  "APP_CONTENT_FAILED",
  "APP_NOT_RESPONDING",
  "APP_DISABLED"
]);
const siteScopedErrorCodes = new Set(["ROUTE_NOT_FOUND", "UNRECOVERABLE_LOGIN_SESSION_MISMATCH", "SITE_NOT_RESPONDING"]);

const systemAlertIconSources = [cautionIcon, synCloudOSLogo] as const;

function ActionButton({ children, onClick, tone }: {
  children: ReactNode;
  onClick: () => void;
  tone: NSEButtonTone;
}) {
  return <NSEPushButton className="nse-system-alert-action-button" tone={tone} onClick={onClick}>{children}</NSEPushButton>;
}

export function SystemAlertAssetCache() {
  return (
    <div hidden aria-hidden="true" data-system-alert-asset-cache>
      {systemAlertIconSources.map((src) => (
        <img key={src} src={src} alt="" decoding="async" fetchPriority="low" />
      ))}
    </div>
  );
}

/**
 * A view-shaped error payload deliberately does not import ErrorManager.
 * Runtime hosts own capture, redaction and richer technical reports; this
 * private recovery composition consumes their serialisable error outcome.
 */
interface SystemAlertError {
  readonly code: string;
  readonly title: string;
  readonly message: string;
  readonly appId?: string;
  readonly packageName?: string;
  readonly technicalMessage?: string;
  readonly technicalDetails?: string;
  readonly suggestedActions?: readonly string[];
  readonly retry?: () => void;
  readonly scope?: string;
  readonly category?: string;
  readonly source?: string;
  readonly context?: Readonly<Record<string, unknown>>;
}

function formatTechnicalDetails(error: SystemAlertError) {
  return error.technicalDetails ?? error.technicalMessage ?? [
    `Exception: ${error.code}`,
    `Message: ${error.message}`,
  ].join("\n");
}

function capturedRecoveryScope(error: SystemAlertError): "app" | "site" | "syncloudos" | null {
  for (const scope of [error.scope, error.context?.scope]) {
    if (typeof scope !== "string") continue;
    switch (scope.toLowerCase()) {
      case "root": case "runtime": case "system": case "kernel": return "syncloudos";
      case "site": case "webspring": return "site";
      case "app": case "application": return "app";
    }
  }
  const source = error.source ?? error.context?.source;
  if (source === "SynCloudOS.RootWatchdog" || source === "SynCloudOS.GlobalWatchdog"
    || error.context?.watchdog === "root" || error.context?.watchdog === "SynCloudOS root") return "syncloudos";
  // The runtime enforces the session guard, but its recovery concerns the site.
  if (siteScopedErrorCodes.has(error.code)) return "site";
  if (source === "SynCloudOS.AppWatchdog" || error.context?.watchdog === "appPresentation"
    || error.category === "app") return "app";
  if (error.category === "resource") {
    const appId = error.appId ?? error.context?.appId;
    return typeof appId === "string" && appId.length > 0 ? "app" : "syncloudos";
  }
  if (error.category === "runtime" || error.category === "event" || error.category === "watchdog") return "syncloudos";
  return null;
}

export function getSystemAlertIcon(error: SystemAlertError, branding: ResolvedSiteBranding | null = null, appearance: "dark" | "light" = "dark", applicationIcon: string | null = null) {
  // Captured ownership is stronger evidence than codes/actions in synthetic specimens.
  const kind = capturedRecoveryScope(error) ?? (
    appScopedErrorCodes.has(error.code) || (Boolean(error.appId) && error.suggestedActions?.includes("returnToWebspring"))
      ? "app" : "syncloudos"
  );
  const siteLogo = appearance === "light" ? branding?.lightLogoUrl : branding?.darkLogoUrl;
  const src = kind === "app" ? applicationIcon : kind === "site" ? siteLogo ?? branding?.logoUrl ?? null : synCloudOSLogo;
  return { kind, src };
}

export function SystemAlert({
  error,
  onDismiss,
  onReturn,
  onReload,
  onOpenMailClient,
  technicalReport,
  appearance = "dark",
  applicationIcon = null
}: {
  error: SystemAlertError;
  onDismiss: () => void;
  onReturn: () => void;
  onReload: () => void;
  /** Host-owned navigation capability; SystemAlert never takes browser-global authority. */
  onOpenMailClient?: (destination: string) => void;
  /** Canonical runtime diagnostics, supplied by the host after redaction. */
  technicalReport?: string;
  appearance?: "dark" | "light";
  /** Resolved AppIcon from the host's existing app registry, never a guessed resource URL. */
  applicationIcon?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const details = useMemo(() => technicalReport ?? formatTechnicalDetails(error), [error, technicalReport]);
  const actions = error.suggestedActions ?? ["returnToWebspring", "dismiss"];
  const isSessionMismatch = error.code === "UNRECOVERABLE_LOGIN_SESSION_MISMATCH";
  const isNotResponding = error.code === "APP_NOT_RESPONDING" || error.code === "SITE_NOT_RESPONDING";
  const mailtoFallback =
    typeof error.context?.mailtoFallback === "string"
      ? `mailto:${error.context.mailtoFallback}`
      : null;
  const actionTone: NSEButtonTone = appearance === "dark" ? "medium" : "light";
  const titleId = useId();
  const messageId = useId();
  const icon = getSystemAlertIcon(error, useHostSiteBranding(), appearance, applicationIcon);

  return (
    <NSEAlert className="syncloudos-system-alert" appearance={appearance} labelledBy={titleId} describedBy={messageId}>
      <div className="nse-system-alert-content">
        <div className={`syncloudos-alert-artwork${icon.src ? "" : " is-caution-only"}`} data-alert-icon={icon.kind} aria-hidden="true">
          {icon.src ? <img className="syncloudos-alert-logo" data-alert-logo={icon.src === synCloudOSLogo ? "syncloudos" : ""} src={icon.src} alt="" /> : null}
          <img className="syncloudos-alert-caution" data-alert-caution src={cautionIcon} alt="" />
        </div>
        <div className="nse-system-alert-copy">
          <h2 id={titleId}>{error.title}</h2>
          <p id={messageId}>{error.message}</p>
          <button
            type="button"
            className="nse-alert-disclosure"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
            Technical details
          </button>
          <NSEPresence initial={false}>
            {expanded ? <SystemAlertDetails details={details} /> : null}
          </NSEPresence>
        </div>
      </div>
      <div className="nse-alert-actions">
        {isSessionMismatch && actions.includes("dismiss") ? <ActionButton tone="medium" onClick={onDismiss}>Cancel</ActionButton> : null}
        {actions.includes("reload") ? <ActionButton tone={isSessionMismatch ? "affirmative" : actionTone} onClick={onReload}>{isSessionMismatch ? "Reload Webspring" : "Reload"}</ActionButton> : null}
        {error.retry || actions.includes("retry") ? (
          <ActionButton tone={actionTone} onClick={error.retry ?? onReload}>Try Again</ActionButton>
        ) : null}
        {actions.includes("openMailClient") && mailtoFallback && onOpenMailClient ? (
          <ActionButton tone={actionTone} onClick={() => onOpenMailClient(mailtoFallback)}>Open Mail Client</ActionButton>
        ) : null}
        {actions.includes("returnToWebspring") ? (
          <ActionButton tone={actionTone} onClick={onReturn}>Return to Webspring</ActionButton>
        ) : null}
        {!isSessionMismatch && actions.includes("dismiss") ? <ActionButton tone={actionTone} onClick={onDismiss}>{isNotResponding ? "Continue" : "Close"}</ActionButton> : null}
      </div>
    </NSEAlert>
  );
}
