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

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { nseActionCommandId } from "./actionCommandId";
import type { NSEControlCommandBinding } from "./controlTypes";

/** The application an `action` prop or menu item belongs to. */
export interface NSEActionScope {
  readonly appId: string;
}

const NSEActionScopeContext = createContext<NSEActionScope | null>(null);

export interface NSEActionScopeProviderProps {
  readonly appId: string;
  readonly children: ReactNode;
}

/**
 * Tells controls below it which application their `action` names belong to.
 * The framework supplies it around every class-based application's views;
 * function-component apps that want `action` props can supply it themselves.
 */
export function NSEActionScopeProvider({ appId, children }: NSEActionScopeProviderProps) {
  const scope = useMemo<NSEActionScope>(() => ({ appId }), [appId]);
  return <NSEActionScopeContext.Provider value={scope}>{children}</NSEActionScopeContext.Provider>;
}

export function useOptionalNSEActionScope(): NSEActionScope | null {
  return useContext(NSEActionScopeContext);
}

/**
 * Turns a control's `action` prop into the command binding the control already
 * knows how to validate and send. Returns `undefined` when there is no action.
 * Dispatch walks the responder chain as it does for every command, so the
 * focused view's controller answers first, then its window controller, then
 * the application.
 */
export function useNSEActionBinding<P = undefined>(action: string | undefined, payload?: P): NSEControlCommandBinding<P | undefined> | undefined {
  const scope = useContext(NSEActionScopeContext);
  return useMemo(() => {
    if (action === undefined) return undefined;
    if (action.includes(".")) return { id: action, payload };
    if (!scope) {
      throw new Error(`The action "${action}" has no application to belong to. Render the control inside a class-based application's view, or inside an NSEActionScopeProvider.`);
    }
    return { id: nseActionCommandId(scope.appId, action), payload };
  }, [action, payload, scope]);
}
