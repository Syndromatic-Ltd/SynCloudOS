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

import { useContext, useEffect, useImperativeHandle, useRef, type CSSProperties, type KeyboardEvent, type ReactNode, type Ref } from "react";
import "./components.css";
import { useNSEAnimationEnvironment, useNSEPresentation } from "../Animation";
import { resolveNSEAlertBackdropMotion, resolveNSESheetBackdropMotion } from "./NSEAlert.transitions";
import { useNSEAppearanceProjection } from "../Appearance";
import { resolveNSEFocusReturnTarget } from "../Focus";
import { isNSEHTMLElement } from "../Focus/domRealm";

import { useOptionalOverlayProvider } from "../Overlays/OverlayProvider";
import { PresentingDocumentContext } from "../Overlays/presentingDocument";
import { useNSEOverlayRegion } from "../Overlays/useNSEOverlayRegion";
import { nseOverlayRegionInsets, type OverlayPresentationSource } from "../Overlays/overlayRegion";

interface AlertBackdropProps {
  readonly children: ReactNode;
  readonly ref?: Ref<HTMLDivElement>;
  readonly presentation?: OverlayPresentationSource;
  readonly onSafeDismiss?: () => void;
  readonly onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  readonly onKeyDownCapture?: (event: KeyboardEvent<HTMLDivElement>) => void;
  readonly className?: string;
  /** `sheet`: the backdrop of a window sheet, which neither dims nor fades, so the sheet only slides. */
  readonly motion?: "alert" | "sheet";
  readonly "data-syncloudos-runtime-owner"?: string;
  readonly "data-syncloudos-focus-scope"?: string;
}

export function AlertBackdrop({
  children,
  ref,
  presentation,
  onSafeDismiss,
  onKeyDown,
  onKeyDownCapture,
  className,
  motion = "alert",
  "data-syncloudos-runtime-owner": runtimeOwner,
  "data-syncloudos-focus-scope": focusScope,
}: AlertBackdropProps) {
  const appearanceProjection = useNSEAppearanceProjection();
  const provider = useOptionalOverlayProvider();
  const presentingDocument = useContext(PresentingDocumentContext) ?? (typeof document === "undefined" ? null : document);
  const { region, hostViewport } = useNSEOverlayRegion({ source: presentation ?? provider?.runtime.environment.presentation ?? null, open: true, purpose: "alert", document: presentingDocument });
  const regionInsets = region && hostViewport ? nseOverlayRegionInsets(region, hostViewport) : null;
  const regionStyle = regionInsets ? Object.fromEntries(Object.entries(regionInsets).map(([side, value]) => [`--nse-overlay-region-${side}`, `${value}px`])) as CSSProperties : undefined;
  const previousFocusRef = useRef(resolveNSEFocusReturnTarget(presentingDocument?.activeElement ?? null));
  const { reducedMotion } = useNSEAnimationEnvironment();
  const backdropRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => backdropRef.current!, []);
  useNSEPresentation(backdropRef, motion === "sheet" ? resolveNSESheetBackdropMotion(reducedMotion) : resolveNSEAlertBackdropMotion(reducedMotion));

  useEffect(() => {
    const previousFocus = previousFocusRef.current;
    const backdrop = backdropRef.current;
    backdrop?.focus({ preventScroll: true });
    const parent = backdrop?.parentElement;

    const siblingState = Array.from(parent?.children ?? [])
      .filter((element): element is HTMLElement => isNSEHTMLElement(element) && element !== backdrop)
      .map((element) => ({
        element,
        ariaHidden: element.getAttribute("aria-hidden"),
        inertAttribute: element.getAttribute("inert"),
        inert: element.inert
      }));

    siblingState.forEach(({ element }) => {
      element.setAttribute("aria-hidden", "true");
      element.setAttribute("inert", "");
      element.inert = true;
    });

    return () => {
      siblingState.forEach(({ element, ariaHidden, inertAttribute, inert }) => {
        if (ariaHidden === null) {
          element.removeAttribute("aria-hidden");
        } else {
          element.setAttribute("aria-hidden", ariaHidden);
        }
        if (inertAttribute === null) {
          element.removeAttribute("inert");
        } else {
          element.setAttribute("inert", inertAttribute);
        }
        element.inert = inert;
      });
      const restoreFocus = () => {
        if (!previousFocus?.isConnected || previousFocus.closest("[inert]")) return;
        const { ownerDocument } = previousFocus;
        const active = ownerDocument.activeElement;
        if (!active || active === ownerDocument.body || active === ownerDocument.documentElement || backdrop?.contains(active)) {
          previousFocus.focus({ preventScroll: true });
        }
      };
      // An attached sheet's host releases its content's inert state after
      // this effect. Let that commit finish before trying to restore focus.
      if (previousFocus?.closest("[inert]")) queueMicrotask(restoreFocus);
      else restoreFocus();
    };
  }, []);

  return (
    <div
      ref={backdropRef}
      data-nse-control="system-alert" data-nse-part="backdrop" className={["nse-control-alert-backdrop", className].filter(Boolean).join(" ")}
      // An alert begun as a sheet (beginSheetModal) is attached to its window,
      // and its theme draws it so: the backdrop is the theme's scope root, so
      // the presentation is stated here rather than read from the window.
      data-nse-presentation={motion === "sheet" ? "sheet" : undefined}
      data-nse-overlay-region={region ? "true" : undefined}
      tabIndex={-1}
      {...appearanceProjection}
      style={{ ...appearanceProjection.style, ...regionStyle }}
      data-syncloudos-runtime-owner={runtimeOwner}
      data-syncloudos-focus-scope={focusScope}
      onKeyDownCapture={onKeyDownCapture}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === "Escape") {
          event.preventDefault();
          onSafeDismiss?.();
          return;
        }
        if (event.key !== "Tab") return;
        const focusable = Array.from(backdropRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []);
        if (focusable.length === 0) {
          event.preventDefault();
          backdropRef.current?.focus({ preventScroll: true });
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const activeElement = event.currentTarget.ownerDocument.activeElement;
        if (event.shiftKey && activeElement === first) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        } else if (!event.shiftKey && activeElement === last) {
          event.preventDefault();
          first.focus({ preventScroll: true });
        }
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onSafeDismiss?.();
      }}
    >
      {children}
    </div>
  );
}
