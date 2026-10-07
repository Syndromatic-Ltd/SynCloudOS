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

import React from "react";
import { render } from "@testing-library/react";
import type { SynCloudOSRuntimeEnvironment } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";
import type { WindowManager } from "../../src/SynCloudOS/Windows";
import {
  useWindowMoveResize,
  type UseWindowMoveResizeOptions,
} from "../../src/Webspring/WindowLayer/useWindowMoveResize";
import { createTestRuntimeEnvironment } from "../runtime/helpers";

export function createControlledFrameEnvironment(options: {
  readonly width?: number;
  readonly height?: number;
  readonly devicePixelRatio?: number;
  readonly compact?: boolean;
} = {}) {
  const regularWidth = options.width ?? 800;
  let width = regularWidth;
  const height = options.height ?? 600;
  const callbacks = new Map<number, (timestamp: number) => void>();
  const compactListeners = new Set<(matches: boolean) => void>();
  const layoutListeners = new Set<() => void>();
  let compact = options.compact ?? false;
  let nextHandle = 0;
  const base = createTestRuntimeEnvironment();
  const environment: SynCloudOSRuntimeEnvironment = {
    ...base,
    layoutViewport: {
      getSnapshot: () => ({ width, height }),
      subscribe(listener) {
        layoutListeners.add(listener);
        return () => layoutListeners.delete(listener);
      },
    },
    screen: {
      getSnapshot: () => ({
        width,
        height,
        availableLeft: 0,
        availableTop: 0,
        availableWidth: width,
        availableHeight: height,
        colourDepth: 24,
        pixelDepth: 24,
        orientation: width >= height ? "landscape-primary" : "portrait-primary",
      }),
      subscribe: () => () => undefined,
    },
    workArea: {
      getSnapshot: () => ({
        x: 0,
        y: 0,
        width,
        height,
        devicePixelRatio: options.devicePixelRatio ?? 1,
        safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
      }),
      subscribe: () => () => undefined,
    },
    visualViewport: {
      getSnapshot: () => ({ width, height, offsetLeft: 0, offsetTop: 0, scale: 1 }),
      subscribe: () => () => undefined,
    },
    matchMedia: (query) => ({
      media: query,
      get matches() { return query === "(max-width: 767px)" ? compact : false; },
      subscribe(listener) {
        if (query !== "(max-width: 767px)") return () => undefined;
        compactListeners.add(listener);
        return () => compactListeners.delete(listener);
      },
      dispose: () => undefined,
    }),
    requestAnimationFrame(callback) {
      const handle = ++nextHandle;
      callbacks.set(handle, callback);
      return handle;
    },
    cancelAnimationFrame(handle) {
      callbacks.delete(handle as number);
    },
  };

  return {
    environment,
    pending: () => callbacks.size,
    setCompact(value: boolean) {
      compact = value;
      width = value ? Math.min(767, regularWidth) : regularWidth;
      for (const listener of layoutListeners) listener();
      for (const listener of compactListeners) listener(value);
    },
    flushNext(timestamp = 16) {
      const entry = callbacks.entries().next().value as [number, (value: number) => void] | undefined;
      if (!entry) throw new Error("No injected frame is pending.");
      callbacks.delete(entry[0]);
      entry[1](timestamp);
    },
    flushAll(timestamp = 16) {
      while (callbacks.size > 0) this.flushNext(timestamp);
    },
  };
}

export function installPointerCaptureShims() {
  const captured = new WeakMap<Element, Set<number>>();
  const prototype = HTMLElement.prototype as HTMLElement & {
    setPointerCapture?: (pointerId: number) => void;
    releasePointerCapture?: (pointerId: number) => void;
    hasPointerCapture?: (pointerId: number) => boolean;
  };
  const originals = {
    setPointerCapture: prototype.setPointerCapture,
    releasePointerCapture: prototype.releasePointerCapture,
    hasPointerCapture: prototype.hasPointerCapture,
  };
  prototype.setPointerCapture = function setPointerCapture(pointerId: number) {
    const ids = captured.get(this) ?? new Set<number>();
    ids.add(pointerId);
    captured.set(this, ids);
  };
  prototype.releasePointerCapture = function releasePointerCapture(pointerId: number) {
    captured.get(this)?.delete(pointerId);
  };
  prototype.hasPointerCapture = function hasPointerCapture(pointerId: number) {
    return captured.get(this)?.has(pointerId) ?? false;
  };
  return () => {
    if (originals.setPointerCapture) prototype.setPointerCapture = originals.setPointerCapture;
    else delete prototype.setPointerCapture;
    if (originals.releasePointerCapture) prototype.releasePointerCapture = originals.releasePointerCapture;
    else delete prototype.releasePointerCapture;
    if (originals.hasPointerCapture) prototype.hasPointerCapture = originals.hasPointerCapture;
    else delete prototype.hasPointerCapture;
  };
}

function GestureTarget(props: UseWindowMoveResizeOptions) {
  const interaction = useWindowMoveResize(props);
  return <div data-testid="gesture-target" {...interaction} />;
}

export function renderWindowMoveResize(
  manager: WindowManager,
  options: Omit<UseWindowMoveResizeOptions, "manager">,
) {
  return render(<GestureTarget manager={manager} {...options} />);
}

export function pointerEvent(
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  values: { readonly pointerId?: number; readonly clientX?: number; readonly clientY?: number; readonly button?: number } = {},
) {
  const event = new MouseEvent(type, { bubbles: true, button: values.button ?? 0 });
  Object.defineProperties(event, {
    pointerId: { value: values.pointerId ?? 1 },
    clientX: { value: values.clientX ?? 0 },
    clientY: { value: values.clientY ?? 0 },
    isPrimary: { value: true },
  });
  return event as unknown as PointerEvent;
}
