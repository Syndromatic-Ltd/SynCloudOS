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

import { useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { NSEPopup, useNSEOverlayProvider } from "../Overlays";
import type { NSEOverlayDismissReason } from "../Overlays";
import type { NSEMenuController } from "./NSEMenuController";
import type { NSEMenuOverlayOptions } from "./menuTypes";
import { NSEMenuOverlayPresentationScope } from "./menuPresentationContext";

export interface NSEMenuOverlayProps {
  readonly overlay: NSEMenuOverlayOptions;
  /** The branch controller must be closed before the popup unmounts its semantic surface. */
  readonly controller: Pick<NSEMenuController, "dismiss" | "snapshot"> & Partial<Pick<NSEMenuController, "subscribe">>;
  readonly open: boolean;
  readonly anchor: HTMLElement | null;
  readonly labelledBy?: string;
  readonly kind?: "menu" | "context-menu" | "submenu";
  readonly presentationMode?: "responsive" | "anchored" | "viewport-block-start-inline-end";
  /** Transparent frame bleed needed to align the recipe's painted edge to the work area. */
  readonly viewportCornerBleed?: Readonly<{ blockStart: number; inlineEnd: number }>;
  readonly className?: string;
  readonly exitDuration?: number;
  /** Application menus can launch another surface from a command selection. */
  readonly restoreFocus?: boolean;
  readonly children: ReactNode;
  onOpenChange(open: boolean, reason: NSEOverlayDismissReason): void;
}

/**
 * Responsive presentation shell for a semantic menu. Menus retain one
 * controller/model while their physical form changes from anchored overlay to
 * an action-sheet/drill-in boundary on a constrained runtime.
 */
export function NSEMenuOverlay({ overlay, controller, open, anchor, labelledBy, kind = "menu", presentationMode = "responsive", viewportCornerBleed, className, exitDuration, restoreFocus = true, children, onOpenChange }: NSEMenuOverlayProps) {
  const { runtime } = useNSEOverlayProvider();
  if (!overlay.id.trim()) throw new TypeError("NSE menu overlay IDs must not be empty.");
  if (!overlay.parentResponderId.trim()) throw new TypeError("NSE menu overlays require a parent responder ID.");
  const traits = useSyncExternalStore(
    (listener) => runtime.environment.presentation.subscribe(listener),
    () => runtime.environment.presentation.getSnapshot(),
    () => runtime.environment.presentation.getSnapshot(),
  );
  const presentation = useMemo(() => {
    const compact = presentationMode === "responsive" && (
      traits.horizontalSizeClass === "compact" ||
      traits.contentBounds.height - traits.virtualKeyboardInset < 480
    );
    return {
      mode: compact
        ? "sheet" as const
        : presentationMode === "viewport-block-start-inline-end"
          ? "viewport-block-start-inline-end" as const
          : "anchored" as const,
      placement: overlay.placement,
      viewportCornerBleed,
    };
  }, [overlay.placement, presentationMode, traits, viewportCornerBleed]);
  // A branch publishes its rows only once its commands validate. Until the
  // first rows arrive the popup is not painted, so it never shows as an empty
  // plate that then grows (and, near a viewport edge, flips). Later branches
  // (submenus) validate while the menu is already showing and stay painted.
  const subscribeController = useCallback(
    (listener: () => void) => controller.subscribe?.(listener) ?? (() => undefined),
    [controller],
  );
  const branch = useSyncExternalStore(subscribeController, () => controller.snapshot, () => controller.snapshot);
  const rowsReady = !controller.subscribe || (branch.open && !branch.validating);
  const [shown, setShown] = useState(false);
  if (open && rowsReady && !shown) setShown(true);
  if (!open && shown) setShown(false);
  const contentPending = open && !rowsReady && !shown;
  const wasOpen = useRef(open);
  // NSEPopup intentionally removes its portal children on close. Dismiss the
  // semantic controller one layout phase earlier so the next presentation is a
  // new validateMany generation rather than a stale retained branch.
  useLayoutEffect(() => {
    if (wasOpen.current && !open && controller.snapshot.open) controller.dismiss("programmatic");
    wasOpen.current = open;
  }, [controller, open]);
  const handleOpenChange = useCallback((nextOpen: boolean, reason: NSEOverlayDismissReason) => {
    onOpenChange(nextOpen, reason);
    if (!nextOpen && !restoreFocus) {
      // The application menu deliberately does not restore focus on command
      // selection: the command may open a modal in the same commit. Restore
      // only when the command did not establish another focus owner.
      queueMicrotask(() => {
        globalThis.setTimeout(() => {
          if (!anchor?.isConnected) return;
          const active = document.activeElement;
          if (active && active !== document.body && active !== document.documentElement) return;
          anchor.focus({ preventScroll: true });
        }, Math.max(0, exitDuration ?? 0));
      });
    }
  }, [anchor, exitDuration, onOpenChange, restoreFocus]);

  return (
    <NSEPopup
      id={overlay.id}
      open={open}
      anchor={anchor}
      parentResponderId={overlay.parentResponderId}
      parentId={overlay.parentId}
      parentScopeId={overlay.parentScopeId}
      presentation={presentation}
      overlayKind={presentation.mode === "sheet" ? "action-sheet" : kind}
      modal={presentation.mode === "sheet"}
      keepPortalMounted
      contentPending={contentPending}
      role="presentation"
      labelledBy={labelledBy}
      className={className}
      exitDuration={exitDuration}
      restoreFocus={restoreFocus}
      onOpenChange={handleOpenChange}
    >
      <NSEMenuOverlayPresentationScope>{children}</NSEMenuOverlayPresentationScope>
    </NSEPopup>
  );
}
