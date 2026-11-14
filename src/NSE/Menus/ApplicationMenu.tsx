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
import { AppMenuSurface } from "./AppMenuSurface";
import type { OverlayDismissReason } from "../Overlays";
import { MenuView } from "./MenuView";
import type { NSEMenu } from "./NSEMenu";
import { MenuOverlay } from "./MenuOverlay";
import type { MenuModel, MenuOverlayOptions } from "./menuTypes";

const applicationMenuFrameBleed = Object.freeze({ blockStart: 2, inlineEnd: 6 });

export interface ApplicationMenuProps {
  readonly model: MenuModel;
  readonly controller: NSEMenu;
  readonly overlay: MenuOverlayOptions;
  readonly open: boolean;
  readonly anchor: HTMLElement | null;
  readonly title?: string;
  readonly labelledBy?: string;
  onOpenChange(open: boolean, reason?: OverlayDismissReason): void;
}

/** Canonical command-backed application menu using the curated vector Atmo surface. */
export function ApplicationMenu({ model, controller, overlay, open, anchor, title, labelledBy, onOpenChange }: ApplicationMenuProps) {
  const handleMenuOpenChange = useCallback((nextOpen: boolean, reason?: OverlayDismissReason) => {
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
    <MenuOverlay
      overlay={overlay}
      controller={controller}
      open={open}
      anchor={anchor}
      labelledBy={labelledBy}
      kind="menu"
      presentationMode="viewport-block-start-inline-end"
      viewportCornerBleed={applicationMenuFrameBleed}
      appearance="application-menu"
      className="nse-overlay-popup--application-menu"
      exitDuration={160}
      restoreFocus={false}
      onOpenChange={onOpenChange}
    >
      <AppMenuSurface className="nse-application-menu" title={title} data-nse-style="application-menu" data-nse-application-menu="true">
        <MenuView appearance="application-menu" model={model} controller={controller} open={open} onOpenChange={handleMenuOpenChange} />
      </AppMenuSurface>
    </MenuOverlay>
  );
}
