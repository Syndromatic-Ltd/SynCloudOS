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

import { createElement, useCallback, useEffect, useId, useRef, useState, type FocusEvent, type PointerEvent } from "react";
import { NSETooltip } from "./NSETooltip";
import { useNSETooltipProvider } from "./NSETooltipProvider";
import type { NSETooltipBinding, NSETooltipOptions } from "./tooltipTypes";

function tooltipId(id: string): string {
  return `nse-tooltip-${id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

/**
 * Binds one labelled anchor to the provider-owned tooltip state machine. The
 * hook never adds ambient listeners or timers; all timer authority is the shared
 * injected runtime environment.
 */
export function useNSETooltip({
  content,
  placement,
  delayMs = 400,
  disabled = false,
  longPressOnCoarsePointer = true,
}: NSETooltipOptions): NSETooltipBinding {
  const provider = useNSETooltipProvider();
  const reactId = useId();
  const id = tooltipId(reactId);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLElement | null>(null);
  const hoveredRef = useRef(false);
  const focusedRef = useRef(false);

  const getAnchor = useCallback(() => anchorRef.current, []);
  useEffect(() => provider.register({ id, disabled, getAnchor, setOpen }), [disabled, getAnchor, id, provider]);
  useEffect(() => {
    if (!disabled) return;
    provider.dismiss(id);
    setOpen(false);
  }, [disabled, id, provider]);
  useEffect(() => () => provider.dismiss(id), [id, provider]);

  const show = useCallback((element: HTMLElement, activationDelayMs: number) => {
    if (disabled) return;
    anchorRef.current = element;
    setAnchor(element);
    provider.requestOpen(id, activationDelayMs);
  }, [disabled, id, provider]);
  const hideWhenInactive = useCallback((delay: number) => {
    if (hoveredRef.current || focusedRef.current) return;
    provider.requestClose(id, delay);
  }, [id, provider]);
  const onPointerEnter = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch") return;
    hoveredRef.current = true;
    show(event.currentTarget, delayMs);
  }, [delayMs, show]);
  const onPointerLeave = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch") return;
    hoveredRef.current = false;
    hideWhenInactive(provider.leaveDelayMs);
  }, [hideWhenInactive, provider.leaveDelayMs]);
  const onFocus = useCallback((event: FocusEvent<HTMLElement>) => {
    focusedRef.current = true;
    show(event.currentTarget, 0);
  }, [show]);
  const onBlur = useCallback(() => {
    focusedRef.current = false;
    hideWhenInactive(0);
  }, [hideWhenInactive]);
  const beginLongPress = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== "touch" || !longPressOnCoarsePointer) return;
    show(event.currentTarget, provider.longPressDelayMs);
  }, [longPressOnCoarsePointer, provider.longPressDelayMs, show]);
  const cancelLongPress = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== "touch") return;
    provider.cancelPendingOpen(id);
    provider.dismiss(id);
  }, [id, provider]);

  return {
    anchorProps: disabled ? {} : {
      "aria-describedby": open ? id : undefined,
      onPointerEnter,
      onPointerLeave,
      onPointerDown: beginLongPress,
      onPointerMove: cancelLongPress,
      onPointerUp: cancelLongPress,
      onPointerCancel: cancelLongPress,
      onFocus,
      onBlur,
    },
    tooltip: disabled ? null : createElement(NSETooltip, {
      id,
      content,
      open,
      anchor,
      placement,
      onOpenChange: (nextOpen: boolean) => {
        if (!nextOpen) provider.dismiss(id);
      },
    }),
  };
}
