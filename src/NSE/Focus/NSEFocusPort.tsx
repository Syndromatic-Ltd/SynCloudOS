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
export type NSEFocusScopeKind = "menu" | "popover" | "modal";

export interface NSEFocusScopeOptions {
  readonly scopeId: string;
  readonly kind: NSEFocusScopeKind;
  readonly parentResponderId?: string;
  readonly parentScopeId?: string;
  readonly modal?: boolean;
  readonly trapFocus?: boolean;
  readonly restoreFocus?: boolean;
  /** Reuse an existing physical overlay host where one already owns the trap. */
  readonly asChild?: boolean;
}

export interface NSEFocusPort {
  readonly runtimeId: string;
  wrapFocusScope(options: NSEFocusScopeOptions, children: ReactNode): ReactNode;
}

const NSEFocusPortContext = createContext<NSEFocusPort | null>(null);

export function NSEFocusPortProvider({ port, children }: PropsWithChildren<{ port: NSEFocusPort | null }>) {
  return <NSEFocusPortContext.Provider value={port}>{children}</NSEFocusPortContext.Provider>;
}

export function useNSEFocusPort() {
  return useContext(NSEFocusPortContext);
}

export function NSEFocusScope({ options, children }: PropsWithChildren<{ options: NSEFocusScopeOptions }>) {
  const port = useNSEFocusPort();
  return <>{port ? port.wrapFocusScope(options, children) : children}</>;
}
