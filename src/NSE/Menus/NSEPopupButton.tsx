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

import { useId, useRef, useState } from "react";
import { useOptionalNSEOverlayProvider } from "../Overlays";
import { NSEPushButton, type NSEButtonTone } from "../Controls/Buttons/NSEButtons";
import { NSEMenu } from "./NSEMenu";
import type { NSEMenuController } from "./NSEMenuController";
import { NSEMenuOverlay } from "./NSEMenuOverlay";
import type { NSEMenuModel, NSEMenuOverlayOptions } from "./menuTypes";

export interface NSEPopupButtonProps {
  readonly label: string;
  readonly model: NSEMenuModel;
  readonly controller: NSEMenuController;
  /** Stable overlay provenance for this presentation boundary. */
  readonly overlay: NSEMenuOverlayOptions;
  readonly direction?: "ltr" | "rtl";
  /** The trigger's push-button tone. */
  readonly tone?: NSEButtonTone;
}

export function NSEPopupButton({ label, model, controller, overlay, direction = "ltr", tone = "medium" }: NSEPopupButtonProps) {
  const [open, setOpen] = useState(false);
  const [initialFocus, setInitialFocus] = useState<"first" | "last">("first");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const instanceId = useId();
  const triggerId = `nse-popup-button-${model.id}-${instanceId}`;
  const provider = useOptionalNSEOverlayProvider();
  if (!provider) throw new Error("NSEPopupButton requires an NSEOverlayProvider.");
  const menu = <NSEMenu model={model} controller={controller} open={open} labelledBy={triggerId} onOpenChange={setOpen} direction={direction} initialFocus={initialFocus} />;
  return (
    <span className="nse-popup-button">
      {/* A stock push button, lit (its selected art) while its menu shows. */}
      <NSEPushButton
        id={triggerId}
        ref={triggerRef}
        tone={tone}
        pressed={open}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setInitialFocus("first");
          setOpen((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.getModifierState("AltGraph")) return;
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setInitialFocus("first");
            setOpen(true);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setInitialFocus("last");
            setOpen(true);
          }
        }}
      >
        {label}
      </NSEPushButton>
      <NSEMenuOverlay
        overlay={overlay}
        controller={controller}
        open={open}
        anchor={triggerRef.current}
        labelledBy={triggerId}
        onOpenChange={(nextOpen) => setOpen(nextOpen)}
      >
        {menu}
      </NSEMenuOverlay>
    </span>
  );
}
