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
import type { ControlCommandBinding } from "./controlTypes";
import { nseActionReferenceName, type NSEActionReference } from "./actionReference";

/** The application an `action` prop or menu item belongs to. */
export interface ActionScope {
  readonly appId: string;
}

const ActionScopeContext = createContext<ActionScope | null>(null);

/** Internal responder ancestry for portal controls; it carries no runtime authority. */
export const ActionResponderContext = createContext<string | undefined>(undefined);

export interface ActionScopeProviderProps {
  readonly appId: string;
  readonly children: ReactNode;
}

/**
 * Tells controls below it which application their `action` names belong to.
 * The framework supplies it around every class-based application's views;
 * function-component apps that want `action` props can supply it themselves.
 */
export function ActionScopeProvider({ appId, children }: ActionScopeProviderProps) {
  const scope = useMemo<ActionScope>(() => ({ appId }), [appId]);
  return <ActionScopeContext.Provider value={scope}>{children}</ActionScopeContext.Provider>;
}

export function useOptionalNSEActionScope(): ActionScope | null {
  return useContext(ActionScopeContext);
}

/**
 * Turns a control's `action` prop into the command binding the control already
 * knows how to validate and send. Returns `undefined` when there is no action.
 * Dispatch walks the responder chain as it does for every command, so the
 * focused view's controller answers first, then its window controller, then
 * the application.
 */
export function useNSEActionBinding<P = undefined>(action: string | NSEActionReference | undefined, payload?: P): ControlCommandBinding<P | undefined> | undefined {
  const scope = useContext(ActionScopeContext);
  return useMemo(() => {
    if (action === undefined) return undefined;
    const name = typeof action === "string" ? action : nseActionReferenceName(action);
    if (name.includes(".")) return { id: name, payload };
    if (!scope) {
      throw new Error(`The action "${action}" has no application to belong to. Render the control inside a class-based application's view, or inside an NSEActionScopeProvider.`);
    }
    return { id: nseActionCommandId(scope.appId, name), payload };
  }, [action, payload, scope]);
}
