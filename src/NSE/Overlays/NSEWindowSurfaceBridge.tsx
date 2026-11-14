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

import { createContext, useContext, type PropsWithChildren, type ReactNode } from "react";
import type { LogicalPlacement } from "./overlayTypes";
import type { PopupPresentation } from "./NSEPopup";

export type PopoverPreferredEdge = "minX" | "maxX" | "minY" | "maxY";
export type NSEPopoverBehavior = "transient" | "semitransient" | "applicationDefined";

export interface WindowSurfaceRequest {
  readonly id: string;
  readonly role: "sheet" | "panel" | "modal" | "popover";
  readonly title: string;
  readonly parentWindowControllerId: string | null;
  readonly parentResponderId?: string;
  readonly anchor: HTMLElement | null;
  readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /** "content": the size in `bounds` is the fitted content's, so the host
   *  resizes the window even when its style is not user-resizable. Popovers
   *  always size this way. */
  readonly sizing?: "content";
  readonly relativeTo?: Readonly<{ x: number; y: number; width: number; height: number }>;
  readonly preferredEdge?: PopoverPreferredEdge;
  readonly drawsBackground?: boolean;
  readonly behavior?: NSEPopoverBehavior;
  readonly presentation?: PopupPresentation;
  /** Internal logical placement preserves aligned NSEPopup presentations. */
  readonly placement?: LogicalPlacement;
  readonly collisionPadding?: number;
  readonly labelledBy?: string;
  readonly describedBy?: string;
  readonly onDidClose?: () => void;
}

export interface WindowSurfaceDismissResult {
  readonly outcome: "closed" | "cancelled" | "refused" | "missing";
}

export interface WindowSurfaceErrorContext {
  readonly requestId: string;
  readonly operation: "present" | "dismiss";
}

export interface WindowSurfaceBridge {
  present(request: WindowSurfaceRequest, content: ReactNode): Promise<string>;
  dismiss(requestId: string): Promise<WindowSurfaceDismissResult>;
  reportError?(error: unknown, context: WindowSurfaceErrorContext): void;
}

const Context = createContext<WindowSurfaceBridge | null>(null);

export function WindowSurfaceBridgeProvider({ bridge, children }: PropsWithChildren<{ readonly bridge: WindowSurfaceBridge }>) {
  return <Context.Provider value={bridge}>{children}</Context.Provider>;
}

export function useOptionalNSEWindowSurfaceBridge(): WindowSurfaceBridge | null {
  return useContext(Context);
}
