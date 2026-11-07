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

import { createContext, useContext } from "react";

/** The session as the Account preference pane shows it, for hosts that offer sign-in. */
export interface SystemUIAccount {
  readonly signedIn: boolean;
  /** The signed-in person's display name, when the session carries one. */
  readonly name: string | null;
  /** Presents the login window. */
  readonly onSignIn: () => void;
}

/** Provided by the system UI layer around System Preferences when the host offers sign-in. */
export const SystemUIAccountContext = createContext<SystemUIAccount | null>(null);

export function useSystemUIAccount(): SystemUIAccount {
  const account = useContext(SystemUIAccountContext);
  if (!account) throw new Error("This host offers no sign-in.");
  return account;
}
