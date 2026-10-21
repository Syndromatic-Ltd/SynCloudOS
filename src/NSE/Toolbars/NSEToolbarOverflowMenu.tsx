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

import { useCallback, useEffect, useMemo, useRef, useState, type RefCallback } from "react";
import { nseThemeSlot, useNSEThemeRecipe } from "../Appearance";
import {
  NSEChromeBevel,
  NSEChromeGloss,
  NSEChromeInnerShadow,
  NSEChromeSurface,
  type NSEChromeVisualState,
} from "../Appearance/NSEChromePrimitives";
import { NSEMenu, NSEMenuController, type NSEMenuEntry, type NSEMenuModel } from "../Menus";
import { NSEMenuOverlay } from "../Menus/NSEMenuOverlay";
import { useOptionalNSEOverlayProvider } from "../Overlays";
import type { NSEToolbarController } from "./NSEToolbarController";
import type { NSEToolbarLayoutEntry } from "./toolbarTypes";

export interface NSEToolbarOverflowMenuProps {
  readonly controller: NSEToolbarController;
  readonly entries: readonly NSEToolbarLayoutEntry[];
  /** Stable overlay-branch provenance supplied by the window/application host. */
  readonly overlayId: string;
  readonly parentResponderId: string;
  readonly parentScopeId?: string;
  readonly triggerRef?: RefCallback<HTMLButtonElement>;
  readonly tabIndex?: number;
  onFocus?(): void;
}

function modelFor(controller: NSEToolbarController, entries: readonly NSEToolbarLayoutEntry[]): NSEMenuModel {
  const menuEntries: NSEMenuEntry[] = [];
  for (const entry of entries) {
    const item = entry.item;
    if (item.kind === "command") {
      menuEntries.push({
        kind: "command",
        id: item.instanceId,
        commandId: item.commandId,
        payload: item.payload,
        labelOverride: item.label,
        iconOverride: item.icon,
      });
    } else if (item.kind === "custom") {
      menuEntries.push({
        kind: "custom",
        id: item.instanceId,
        label: item.label,
        render: item.render,
      });
    }
  }
  return Object.freeze({
    id: `${controller.configuration.identifier}:overflow`,
    label: "More toolbar items",
    entries: Object.freeze(menuEntries),
  });
}

/**
 * Overflow is an ordinary menu branch. It does not cache a separate
 * command presentation, and its dismissal/focus rules remain provider-owned.
 */
export function NSEToolbarOverflowMenu({
  controller,
  entries,
  overlayId,
  parentResponderId,
  parentScopeId,
  triggerRef,
  tabIndex,
  onFocus,
}: NSEToolbarOverflowMenuProps) {
  const provider = useOptionalNSEOverlayProvider();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const [menuController, setMenuController] = useState<NSEMenuController | null>(null);
  const localTriggerRef = useRef<HTMLButtonElement | null>(null);
  const model = useMemo(() => modelFor(controller, entries), [controller, entries]);
  const modelSignature = entries.map((entry) => entry.instanceId).join("|");
  const previousModelSignature = useRef(modelSignature);
  useEffect(() => () => menuController?.dispose(), [menuController]);
  useEffect(() => {
    if (previousModelSignature.current === modelSignature) return;
    previousModelSignature.current = modelSignature;
    if (!menuController) return;
    menuController.dispose();
    setMenuController(null);
    setOpen(false);
  }, [menuController, modelSignature]);
  if (!provider) throw new Error("NSEToolbarOverflowMenu requires an NSEOverlayProvider.");
  if (!overlayId.trim()) throw new TypeError("NSE toolbar overflow overlay IDs must not be empty.");
  if (!parentResponderId.trim()) throw new TypeError("NSE toolbar overflow menus require a parent responder ID.");
  const requestOpen = useCallback((nextOpen: boolean) => {
    if (nextOpen && !menuController) {
      setMenuController(new NSEMenuController({
        ownerSignal: controller.runtime.signal,
        model,
        runtime: {
          signal: controller.runtime.signal,
          commands: controller.runtime.commands,
          keyBindings: controller.runtime.keyBindings,
          scheduler: controller.runtime.scheduler,
        },
      }));
    }
    // Closing keeps the controller (and so the overlay) mounted: the overlay's
    // close is what hands focus back to this trigger, and unmounting it with
    // the menu would drop focus to the page. The controller is disposed when
    // the model changes or the trigger unmounts.
    setOpen(nextOpen);
  }, [controller.runtime, menuController, model]);
  const appearanceState: NSEChromeVisualState = pressed || open ? "pressed" : focused ? "focused" : hovered ? "hover" : "normal";
  const appearance = useNSEThemeRecipe(nseThemeSlot("toolbar", "item", appearanceState));

  return (
    <span className="nse-toolbar-overflow-menu">
      <button
        ref={(element) => {
          localTriggerRef.current = element;
          triggerRef?.(element);
        }}
        type="button"
        className="nse-toolbar-item nse-toolbar-overflow-trigger"
        aria-label="More toolbar items"
        aria-haspopup="menu"
        aria-expanded={open}
        tabIndex={tabIndex}
        data-nse-control="toolbar-item"
        data-nse-part="overflow"
        data-state={open ? "open" : "normal"}
        {...appearance.attributes}
        data-nse-toolbar-item-id="overflow"
        onFocus={() => {
          setFocused(true);
          onFocus?.();
        }}
        onBlur={() => setFocused(false)}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => {
          setHovered(false);
          setPressed(false);
        }}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerCancel={() => setPressed(false)}
        onClick={() => requestOpen(!open)}
      >
        <NSEChromeSurface slot={appearance} state={appearanceState} />
        <NSEChromeBevel slot={appearance} state={appearanceState} />
        <NSEChromeGloss slot={appearance} state={appearanceState} />
        <NSEChromeInnerShadow slot={appearance} state={appearanceState} />
        <span aria-hidden="true" data-nse-part="overflow-glyph" />
      </button>
      {menuController ? (
        <NSEMenuOverlay
          overlay={{ id: overlayId, parentResponderId, parentScopeId }}
          controller={menuController}
          open={open}
          anchor={localTriggerRef.current}
          labelledBy={undefined}
          onOpenChange={requestOpen}
        >
          <NSEMenu model={model} controller={menuController} open={open} onOpenChange={requestOpen} />
        </NSEMenuOverlay>
      ) : null}
    </span>
  );
}
