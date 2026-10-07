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

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

/** Presentation only. The native button remains the sole activation owner. */
export function useNSEButtonPress(disabled: boolean) {
  const [active, setActive] = useState(false);
  const release = useRef<(() => void) | null>(null);
  const suppressPointerClick = useRef(false);
  const key = useRef<string | null>(null);
  const finish = useCallback((cancelled = true) => {
    release.current?.();
    release.current = null;
    key.current = null;
    if (cancelled) suppressPointerClick.current = true;
    setActive(false);
  }, []);

  useEffect(() => {
    if (disabled) finish();
  }, [disabled, finish]);
  useEffect(() => () => { release.current?.(); }, []);

  function pointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (disabled || event.defaultPrevented || event.button !== 0 || !event.isPrimary || release.current) return;
    const button = event.currentTarget;
    const view = button.ownerDocument.defaultView;
    if (!view) return;
    const pointerId = event.pointerId;
    const inside = (sample: globalThis.PointerEvent) => {
      const bounds = button.getBoundingClientRect();
      return sample.clientX >= bounds.left && sample.clientX < bounds.right
        && sample.clientY >= bounds.top && sample.clientY < bounds.bottom;
    };
    const move = (sample: globalThis.PointerEvent) => {
      if (sample.pointerId !== pointerId) return;
      if ((sample.buttons & 1) === 0) { finish(); return; }
      setActive(inside(sample));
    };
    const up = (sample: globalThis.PointerEvent) => {
      if (sample.pointerId === pointerId) finish(!inside(sample));
    };
    const cancel = (sample: globalThis.PointerEvent) => {
      if (sample.pointerId === pointerId) finish();
    };
    const leaveWindow = (sample: globalThis.PointerEvent) => {
      if (sample.pointerId === pointerId && sample.relatedTarget === null) setActive(false);
    };
    const blur = () => finish();
    const hidden = () => { if (button.ownerDocument.hidden) finish(); };
    // Observe the hold outside the control without pointer capture, preserving
    // native release-outside/click targeting and touch scroll cancellation.
    view.addEventListener("pointermove", move, true);
    view.addEventListener("pointerup", up, true);
    view.addEventListener("pointercancel", cancel, true);
    view.addEventListener("pointerout", leaveWindow, true);
    view.addEventListener("blur", blur);
    button.ownerDocument.addEventListener("visibilitychange", hidden);
    release.current = () => {
      view.removeEventListener("pointermove", move, true);
      view.removeEventListener("pointerup", up, true);
      view.removeEventListener("pointercancel", cancel, true);
      view.removeEventListener("pointerout", leaveWindow, true);
      view.removeEventListener("blur", blur);
      button.ownerDocument.removeEventListener("visibilitychange", hidden);
    };
    suppressPointerClick.current = false;
    setActive(true);
  }

  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled || event.defaultPrevented || release.current || (event.key !== " " && event.key !== "Enter")) return;
    key.current = event.key;
    const view = event.currentTarget.ownerDocument.defaultView;
    const blur = () => finish();
    view?.addEventListener("blur", blur);
    release.current = () => view?.removeEventListener("blur", blur);
    setActive(true);
  }

  return {
    active: active && !disabled,
    pointerDown,
    keyDown,
    keyUp: (event: KeyboardEvent<HTMLButtonElement>) => { if (key.current === event.key) finish(false); },
    blur: () => { if (key.current !== null) finish(); },
    cancel: () => { if (release.current) finish(); },
    allowsClick: (detail: number) => !disabled && (detail === 0 || !suppressPointerClick.current),
  };
}
