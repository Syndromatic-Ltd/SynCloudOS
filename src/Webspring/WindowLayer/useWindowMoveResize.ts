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

import { useCallback, useEffect, useMemo, type PointerEventHandler } from "react";
import {
  createWindowPointerGesture,
  deriveWindowGestureBounds,
  type WindowGesturePointerDownEvent,
  type WindowMoveResizeGesture,
  type WindowResizeEdge,
} from "../../SynCloudOS/SynCloudOS";
import type { WindowManager } from "../../SynCloudOS/SynCloudOS";

export { deriveWindowGestureBounds };
export type {
  DeriveWindowGestureBoundsRequest,
  WindowMoveResizeGesture,
  WindowResizeEdge,
} from "../../SynCloudOS/SynCloudOS";

export interface UseWindowMoveResizeOptions {
  readonly manager: WindowManager;
  readonly windowControllerId: string;
  readonly gesture: WindowMoveResizeGesture;
  readonly disabled?: boolean;
}

export function useWindowMoveResize(options: UseWindowMoveResizeOptions): {
  readonly onPointerDown: PointerEventHandler<HTMLElement>;
} {
  // The kernel gesture instance is recreated only when its primitive
  // configuration changes; identity-stable fields keep an active drag alive
  // across host re-renders (bounds publications re-render every frame).
  const gestureKind = options.gesture.kind;
  const gestureEdge = options.gesture.kind === "resize" ? options.gesture.edge : null;
  const gestureInstance = useMemo(
    () => createWindowPointerGesture({
      manager: options.manager,
      windowControllerId: options.windowControllerId,
      gesture: gestureKind === "resize" && gestureEdge ? { kind: "resize", edge: gestureEdge } : { kind: "move" },
      disabled: options.disabled,
    }),
    [options.manager, options.windowControllerId, gestureKind, gestureEdge, options.disabled],
  );
  useEffect(() => () => gestureInstance.dispose(), [gestureInstance]);

  // React's synthetic pointer event is projected onto the structural event
  // shape owned by the kernel gesture module.
  const onPointerDown: PointerEventHandler<HTMLElement> = useCallback((event) => {
    const structural: WindowGesturePointerDownEvent = {
      button: event.button,
      isPrimary: event.isPrimary,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      // React guarantees an Element target for pointer events bound to DOM elements.
      target: event.target as Element,
      currentTarget: event.currentTarget,
    };
    gestureInstance.onPointerDown(structural);
  }, [gestureInstance]);

  return { onPointerDown };
}
