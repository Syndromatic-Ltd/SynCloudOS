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

export interface NSEWindowSurfaceRequest {
  readonly id: string;
  readonly role: "sheet" | "panel" | "modal" | "popover";
  readonly title: string;
  readonly parentWindowControllerId: string | null;
  readonly anchor: HTMLElement | null;
  readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /** "content": the size in `bounds` is the fitted content's, so the host
   *  resizes the window even when its style is not user-resizable. Popovers
   *  always size this way. */
  readonly sizing?: "content";
  readonly onDidClose?: () => void;
}

export interface NSEWindowSurfaceDismissResult {
  readonly outcome: "closed" | "cancelled" | "refused" | "missing";
}

export interface NSEWindowSurfaceErrorContext {
  readonly requestId: string;
  readonly operation: "present" | "dismiss";
}

export interface NSEWindowSurfaceBridge {
  present(request: NSEWindowSurfaceRequest, content: ReactNode): Promise<string>;
  dismiss(requestId: string): Promise<NSEWindowSurfaceDismissResult>;
  reportError?(error: unknown, context: NSEWindowSurfaceErrorContext): void;
}

const Context = createContext<NSEWindowSurfaceBridge | null>(null);

export function NSEWindowSurfaceBridgeProvider({ bridge, children }: PropsWithChildren<{ readonly bridge: NSEWindowSurfaceBridge }>) {
  return <Context.Provider value={bridge}>{children}</Context.Provider>;
}

export function useOptionalNSEWindowSurfaceBridge(): NSEWindowSurfaceBridge | null {
  return useContext(Context);
}
