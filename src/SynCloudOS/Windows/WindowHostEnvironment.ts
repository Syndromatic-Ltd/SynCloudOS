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

import type { WindowBounds, WindowFullScreenState } from "./windowTypes";

export interface WindowHostCapabilities {
  readonly nativeWindowControls: null | { readonly side: "leading" | "trailing" };
  readonly menuBar: "drawn" | "native";
  readonly fullScreen: "stage" | "native";
  readonly separateSurfaces: boolean;
}

export type WindowHostEvent =
  | { readonly kind: "activated" | "deactivated" | "closeRequested"; readonly windowId: string; readonly generation?: number }
  | { readonly kind: "surfaceLost"; readonly windowId: string; readonly generation: number }
  | { readonly kind: "boundsChanged"; readonly windowId: string; readonly generation: number; readonly bounds: WindowBounds }
  | { readonly kind: "fullScreenChanged"; readonly windowId: string; readonly state: WindowFullScreenState | "refused" }
  | { readonly kind: "titlebarAreaChanged"; readonly windowId: string; readonly rect: DOMRectReadOnly | null };

export interface WindowSurfaceRequest {
  readonly generation: number;
  readonly title: string;
  readonly bounds: WindowBounds;
}

export interface WindowSurfaceBinding {
  readonly windowId: string;
  readonly generation: number;
  readonly element: HTMLElement;
  /** True when the host surface already supplies native OS window chrome (titlebar + window buttons). */
  readonly nativeChrome?: boolean;
  /** Reads the host surface's current bounds in opener-viewport coordinates, if available. */
  readonly readBounds?: () => WindowBounds | null;
}

export interface WindowHostEnvironment {
  readonly capabilities: WindowHostCapabilities;
  /** These operations are supplied together by hosts that support separate surfaces. */
  bind?(windowId: string, surface: WindowSurfaceRequest): Promise<WindowSurfaceBinding | null>;
  unbind?(windowId: string, generation: number): Promise<void>;
  requestFullScreen(windowId: string, enter: boolean): void;
  subscribe(listener: (event: WindowHostEvent) => void): () => void;
}

export function createStageWindowHost(): WindowHostEnvironment {
  const listeners = new Set<(event: WindowHostEvent) => void>();
  return {
    capabilities: { nativeWindowControls: null, menuBar: "drawn", fullScreen: "stage", separateSurfaces: false },
    requestFullScreen(windowId, enter) {
      for (const listener of listeners) {
        listener({ kind: "fullScreenChanged", windowId, state: enter ? "on" : "off" });
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
