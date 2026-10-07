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

import { createContext } from "react";

/** Host-owned portal target for an application's custom window chrome.
 * The view renders the slot div declaratively and the host learns the node
 * through a ref callback, so the element is null until the custom titlebar
 * mounts — the bridge must not portal before it exists. The host still owns
 * the readiness handshake: the mounted bridge reports when a valid custom
 * renderer is live, and reports detachment or failure so the host can fall
 * back to the system titlebar that the active theme paints. This contract is a
 * WindowLayer implementation detail and is never exported through a public
 * barrel; applications never receive a DOM element or window id. */
export interface WindowChromeSlot {
  readonly slotElement: HTMLElement | null;
  /** The bridge calls this once a valid custom chrome renderer is mounted
   * and rendering into the slot. */
  readonly reportChromeReady: () => void;
  /** Renderer unmount or an unexpected teardown: the host returns to the
   * system fallback until a renderer reports ready again. */
  readonly reportChromeDetached: () => void;
  /** The chrome crashed: the host falls back to the system titlebar and
   * will not trust this renderer again until the chrome mode changes. */
  readonly reportChromeFailure: () => void;
}

export const WindowChromeSlotContext = createContext<WindowChromeSlot | null>(null);
