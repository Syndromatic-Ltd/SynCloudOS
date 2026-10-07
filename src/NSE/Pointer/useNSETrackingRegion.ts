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

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { NSECursorDescriptor, NSETrackingEvent, NSETrackingOption } from "./cursorTypes";

/** A tracking region needs only registration and a releasable handle. This
 * remains deliberately narrower than a kernel tracking manager so portable
 * SynWare can supply their scoped tracking client directly. */
export interface NSETrackingRegionPort {
  register(input: Readonly<Record<string, unknown>>): Readonly<{
    dispose(reason?: string): void;
  }>;
}

export function useNSETrackingRegion(options: {
  readonly manager: NSETrackingRegionPort;
  readonly ownerId: string;
  readonly windowControllerId?: string;
  readonly root: RefObject<object | null>;
  readonly options: readonly NSETrackingOption[];
  readonly cursor?: NSECursorDescriptor;
  readonly onEvent?: (event: NSETrackingEvent) => void;
}) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const listener = useRef(options.onEvent);
  listener.current = options.onEvent;
  const ref = useCallback((node: HTMLElement | null) => setElement(node), []);

  useLayoutEffect(() => {
    const root = options.root.current;
    if (!root || !element) return undefined;
    const registration = options.manager.register({
      ownerId: options.ownerId,
      ...(options.windowControllerId ? { windowControllerId: options.windowControllerId } : {}),
      root,
      element,
      options: options.options,
      ...(options.cursor ? { cursor: options.cursor } : {}),
      onEvent: (event: unknown) => listener.current?.(event as NSETrackingEvent),
    });
    return () => registration.dispose("tracking view unmounted");
  }, [options.manager, options.ownerId, options.windowControllerId, options.root, options.options, options.cursor, element]);

  const focusProps = Object.freeze({
    tabIndex: 0 as const,
    onFocus: () => undefined,
    onBlur: () => undefined,
  });
  return Object.freeze({ ref, focusProps });
}
