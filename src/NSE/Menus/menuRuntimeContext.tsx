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

import { createContext, useContext, type ReactNode } from "react";
import type { NSEMenuRuntimePort } from "./menuTypes";

const NSEMenuRuntimeContext = createContext<NSEMenuRuntimePort | null>(null);

/**
 * The menu port of the mounted window. The application's main menu is defined
 * once, but, as in AppKit, its items validate and dispatch along the responder
 * chain of the window that draws the menu bar.
 *
 * @internal
 */
export function NSEMenuRuntimeProvider({ port, children }: { readonly port: NSEMenuRuntimePort; readonly children: ReactNode }) {
  return <NSEMenuRuntimeContext.Provider value={port}>{children}</NSEMenuRuntimeContext.Provider>;
}

/** @internal */
export function useOptionalNSEMenuRuntimePort(): NSEMenuRuntimePort | null {
  return useContext(NSEMenuRuntimeContext);
}
