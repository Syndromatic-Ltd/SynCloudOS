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

/**
 * NSE remains usable without SynCloudOS. Hosts that do have a logical focus
 * graph inject this port so portalled controls retain their command scope.
 */
export type FocusScopeKind = "menu" | "popover" | "modal";

export interface FocusScopeOptions {
  readonly scopeId: string;
  readonly kind: FocusScopeKind;
  readonly parentResponderId?: string;
  readonly parentScopeId?: string;
  readonly modal?: boolean;
  readonly trapFocus?: boolean;
  readonly restoreFocus?: boolean;
  /** Reuse an existing physical overlay host where one already owns the trap. */
  readonly asChild?: boolean;
}

export interface FocusPort {
  readonly runtimeId: string;
  wrapFocusScope(options: FocusScopeOptions, children: ReactNode): ReactNode;
}

const FocusPortContext = createContext<FocusPort | null>(null);

export function FocusPortProvider({ port, children }: PropsWithChildren<{ port: FocusPort | null }>) {
  return <FocusPortContext.Provider value={port}>{children}</FocusPortContext.Provider>;
}

export function useNSEFocusPort() {
  return useContext(FocusPortContext);
}

export function FocusScope({ options, children }: PropsWithChildren<{ options: FocusScopeOptions }>) {
  const port = useNSEFocusPort();
  return <>{port ? port.wrapFocusScope(options, children) : children}</>;
}
