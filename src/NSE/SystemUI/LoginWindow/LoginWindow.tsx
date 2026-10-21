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

import { useEffect, useRef, useId, type KeyboardEvent } from "react";

import "./LoginWindow.css";
import { useNSEAnimationEnvironment, useNSEPresentation } from "../../Animation";
import { resolveLoginWindowTransitions } from "./LoginWindow.transitions";
import { NSEPushButton } from "../../Controls/Buttons/NSEButtons";
import { useNSEFeedback } from "../../Feedback";
import { useNSEVisualEnvironment } from "../../Appearance";

export interface LoginWindowProps {
  title?: string;
  branding?: Readonly<{ name: string; logoUrl: string | null; logoAlt: string; lightLogoUrl: string | null; darkLogoUrl: string | null; compactLogoUrl: string | null }>;
  methods?: readonly { readonly id: string; readonly label: string; readonly iconUrl?: string }[];
  authenticationStatus?: string;
  onMethodSignIn?: (methodId: string) => void | Promise<void>;
  onCancel?: () => void;
  cancelLabel?: string;
  variant?: "plain" | "ornamented";
  loading?: boolean;
  error?: string | null;
  configurationError?: string | null;
  className?: string;
}

function focusable(root: HTMLElement | null) {
  return root ? Array.from(root.querySelectorAll<HTMLElement>("button:not([disabled]), [tabindex]:not([tabindex='-1'])")) : [];
}

export function LoginWindow({ title = "Sign in", branding, methods = [], authenticationStatus, onMethodSignIn, onCancel, cancelLabel = "Cancel", variant: requestedVariant, loading = false, error = null, configurationError = null, className = "" }: LoginWindowProps) {
  const { theme } = useNSEVisualEnvironment();
  const variant = requestedVariant ?? theme.presentation.login;
  const titleId = useId();
  const errorId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const swingRef = useRef<HTMLDivElement>(null);
  const shakeRef = useRef<HTMLDivElement>(null);
  const { reducedMotion } = useNSEAnimationEnvironment();
  const feedback = useNSEFeedback();
  const lastFeedbackError = useRef<string | null>(null);
  const { window: windowMotion, enter: enterMotion, shake: shakeMotion } = resolveLoginWindowTransitions(reducedMotion, theme.presentation.motion?.login ?? { kind: "none", durationMs: 0, easing: "ease-out" });
  const activeError = configurationError ?? error;
  useNSEPresentation(rootRef, windowMotion);
  useNSEPresentation(swingRef, enterMotion);
  // Each newly visible error shakes the placard once.
  useNSEPresentation(shakeRef, { state: activeError ?? "", enter: () => activeError ? shakeMotion : null });
  const logoUrl = branding?.compactLogoUrl ?? branding?.logoUrl;
  const pending = loading || authenticationStatus === "checking" || authenticationStatus === "authenticating";
  useEffect(() => { focusable(rootRef.current)[0]?.focus({ preventScroll: true }); }, [methods]);
  useEffect(() => {
    if (!activeError) {
      lastFeedbackError.current = null;
      return;
    }
    if (!feedback || lastFeedbackError.current === activeError) return;
    lastFeedbackError.current = activeError;
    void feedback.trigger("error");
  }, [activeError, feedback]);
  function trapFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const elements = focusable(rootRef.current);
    if (!elements.length) return;
    const [first] = elements, last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus({ preventScroll: true }); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus({ preventScroll: true }); }
  }
  return (
    <div ref={rootRef} className={`nse-login-window nse-login-window--${variant} is-login-step-synId ${activeError ? "has-login-error" : ""} ${className}`} data-sheen="enter" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={activeError ? errorId : undefined} onKeyDown={trapFocus}>
      <span className="nse-login-window-top-tack" aria-hidden="true">{variant === "ornamented" ? <span data-login-decoration="tack-transparent" aria-hidden="true" /> : null}{variant === "ornamented" ? <span data-login-decoration="tack-white" aria-hidden="true" /> : null}</span>
      <div ref={swingRef} className="nse-login-window-swing-stage">
        <div className="nse-login-window-hang" aria-hidden="true"><div className="nse-login-window-hang-flipper">{variant === "ornamented" ? <span className="nse-login-window-rope-shadow" data-login-decoration="rope-shadow" aria-hidden="true" /> : null}{variant === "ornamented" ? <span className="nse-login-window-rope nse-login-window-rope-left" data-login-decoration="rope-left" aria-hidden="true" /> : null}{variant === "ornamented" ? <span className="nse-login-window-rope nse-login-window-rope-right" data-login-decoration="rope-right" aria-hidden="true" /> : null}</div></div>
        <div ref={shakeRef} className="nse-login-window-shake-stage"><div className="nse-login-window-card-stage"><div className="nse-login-window-card-flipper is-signin">
          {variant === "ornamented" ? <span className="nse-login-window-beta-ribbon" data-login-decoration="beta-ribbon" aria-hidden="true" /> : null}{variant === "ornamented" ? <span className="nse-login-window-ring nse-login-window-ring-left" data-login-decoration="ring-left" aria-hidden="true" /> : null}{variant === "ornamented" ? <span className="nse-login-window-ring nse-login-window-ring-right" data-login-decoration="ring-right" aria-hidden="true" /> : null}
          <section className="nse-login-window-card nse-login-window-face nse-login-window-face-front" data-login-face="signin"><span className="nse-login-window-texture" aria-hidden="true" /><span className="nse-login-window-texture-turn" aria-hidden="true" /><div className="nse-login-window-content">
            {logoUrl ? <img className="nse-login-window-logo" src={logoUrl} alt={branding?.logoAlt ?? ""} draggable={false} /> : variant === "ornamented" ? <span className="nse-login-window-logo" data-login-decoration="logo" aria-hidden="true" /> : null}<h1 id={titleId}>{title}</h1>
            <div className="nse-login-form" aria-live="polite"><p id={errorId} className="nse-login-error" role="alert">{activeError ?? (authenticationStatus === "checking" ? "Checking your session…" : "\u00a0")}</p><div className="nse-login-action">{methods.map((method) => <NSEPushButton key={method.id} type="button" tone="light" icon={method.iconUrl ? <img className="nse-login-provider-icon" src={method.iconUrl} alt="" aria-hidden={true} draggable={false} /> : undefined} loading={authenticationStatus === "authenticating"} disabled={pending || Boolean(configurationError)} onClick={() => { void Promise.resolve(onMethodSignIn?.(method.id)).catch(() => undefined); }}>{method.label}</NSEPushButton>)}{onCancel ? <NSEPushButton type="button" tone="light" disabled={pending} onClick={onCancel}>{cancelLabel}</NSEPushButton> : null}</div></div>
          </div></section>
        </div></div></div>
      </div>
    </div>
  );
}
