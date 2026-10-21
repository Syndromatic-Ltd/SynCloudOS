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

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import "./components.css";
import { useNSEAnimationEnvironment, useNSEPresentation } from "../Animation";
import { resolveNSEAlertBackdropMotion } from "./NSEAlert.transitions";
import { useNSEThemeProjection } from "../Appearance";
import { resolveNSEFocusReturnTarget } from "../Focus";

type InertHTMLElement = HTMLElement & { inert?: boolean };

interface NSEAlertBackdropProps {
  readonly children: ReactNode;
  readonly onSafeDismiss?: () => void;
  readonly onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  readonly onKeyDownCapture?: (event: KeyboardEvent<HTMLDivElement>) => void;
  readonly className?: string;
  readonly "data-syncloudos-runtime-owner"?: string;
  readonly "data-syncloudos-focus-scope"?: string;
}

export function NSEAlertBackdrop({
  children,
  onSafeDismiss,
  onKeyDown,
  onKeyDownCapture,
  className,
  "data-syncloudos-runtime-owner": runtimeOwner,
  "data-syncloudos-focus-scope": focusScope,
}: NSEAlertBackdropProps) {
  const themeProjection = useNSEThemeProjection();
  const { reducedMotion } = useNSEAnimationEnvironment();
  const backdropRef = useRef<HTMLDivElement>(null);
  useNSEPresentation(backdropRef, resolveNSEAlertBackdropMotion(reducedMotion));

  useEffect(() => {
    const previousFocus = resolveNSEFocusReturnTarget(document.activeElement);
    backdropRef.current?.focus({ preventScroll: true });
    return () => previousFocus?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const backdrop = backdropRef.current;
    const parent = backdrop?.parentElement;
    if (!backdrop || !parent) return;

    const siblingState = Array.from(parent.children)
      .filter((element): element is InertHTMLElement => element instanceof HTMLElement && element !== backdrop)
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
    };
  }, []);

  return (
    <div
      ref={backdropRef}
      className={["nse-control-alert-backdrop", className].filter(Boolean).join(" ")}
      tabIndex={-1}
      {...themeProjection}
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
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        } else if (!event.shiftKey && document.activeElement === last) {
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
