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

import { useCallback } from "react";
import { NSEAppMenuSurface } from "./NSEAppMenuSurface";
import type { NSEOverlayDismissReason } from "../Overlays";
import { NSEMenu } from "./NSEMenu";
import type { NSEMenuController } from "./NSEMenuController";
import { NSEMenuOverlay } from "./NSEMenuOverlay";
import type { NSEMenuModel, NSEMenuOverlayOptions } from "./menuTypes";

const applicationMenuFrameBleed = Object.freeze({ blockStart: 2, inlineEnd: 6 });

export interface NSEApplicationMenuProps {
  readonly model: NSEMenuModel;
  readonly controller: NSEMenuController;
  readonly overlay: NSEMenuOverlayOptions;
  readonly open: boolean;
  readonly anchor: HTMLElement | null;
  readonly title?: string;
  readonly labelledBy?: string;
  onOpenChange(open: boolean, reason?: NSEOverlayDismissReason): void;
}

/** Canonical command-backed application menu using the curated vector Atmo surface. */
export function NSEApplicationMenu({ model, controller, overlay, open, anchor, title, labelledBy, onOpenChange }: NSEApplicationMenuProps) {
  const handleMenuOpenChange = useCallback((nextOpen: boolean, reason?: NSEOverlayDismissReason) => {
    onOpenChange(nextOpen, reason);
    if (!nextOpen) {
      queueMicrotask(() => {
        globalThis.setTimeout(() => {
          if (!anchor?.isConnected) return;
          const active = document.activeElement;
          if (active && active !== document.body && active !== document.documentElement) return;
          anchor.focus({ preventScroll: true });
        }, 160);
      });
    }
  }, [anchor, onOpenChange]);

  return (
    <NSEMenuOverlay
      overlay={overlay}
      controller={controller}
      open={open}
      anchor={anchor}
      labelledBy={labelledBy}
      kind="menu"
      presentationMode="viewport-block-start-inline-end"
      viewportCornerBleed={applicationMenuFrameBleed}
      className="nse-overlay-popup--application-menu"
      exitDuration={160}
      restoreFocus={false}
      onOpenChange={onOpenChange}
    >
      <NSEAppMenuSurface className="nse-application-menu" title={title} data-nse-application-menu="true">
        <NSEMenu appearance="application-menu" model={model} controller={controller} open={open} onOpenChange={handleMenuOpenChange} />
      </NSEAppMenuSurface>
    </NSEMenuOverlay>
  );
}
