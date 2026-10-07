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

import { createContext, useContext, type PropsWithChildren } from "react";

/**
 * A portaled menu needs one scheduler turn for its FocusScope to establish
 * the command responder generation before validation begins. A standalone semantic
 * menu has no such boundary and must remain immediately usable (including
 * hosts whose scheduler is reserved for typeahead only).
 */
const NSEMenuOverlayPresentationContext = createContext(false);

export function NSEMenuOverlayPresentationScope({ children }: PropsWithChildren) {
  return (
    <NSEMenuOverlayPresentationContext.Provider value>
      {children}
    </NSEMenuOverlayPresentationContext.Provider>
  );
}

export function useNSEMenuOverlayPresentationScope(): boolean {
  return useContext(NSEMenuOverlayPresentationContext);
}
