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

import { useMemo } from "react";
import { useNSEAnimationEnvironment, type NSELayoutTransitionTiming } from "../../../../NSE/Animation";
import { resolveWebspringLaunchDimMotion, type WebspringLaunchDimMotion } from "../../../WebspringLaunchDim";
import { webspringIconSprings, type WebspringRadialExit } from "../../../Webspring.transitions";

export interface WebspringBoardMotion {
  /** How a board slot moves to its new cell when the order changes; `null`
   * moves it at once. */
  readonly iconReorder: NSELayoutTransitionTiming | null;
  readonly launchBackdropDim: WebspringLaunchDimMotion;
}

export function resolveWebspringBoardMotion(reducedMotion: boolean): WebspringBoardMotion {
  return {
    iconReorder: reducedMotion ? null : webspringIconSprings.reorder,
    launchBackdropDim: resolveWebspringLaunchDimMotion(reducedMotion),
  };
}

export function useWebspringBoardMotion(): WebspringBoardMotion {
  const { reducedMotion } = useNSEAnimationEnvironment();
  return useMemo(() => resolveWebspringBoardMotion(reducedMotion), [reducedMotion]);
}

/** The Board's launch timing, after the iOS 6 home screen: the icons scatter
 * outward from the screen's centre while the app grows out of that centre. */
export const webspringBoardLaunchTiming = Object.freeze({
  /** Seconds the icons take to fly past the viewer. */
  iconExitDuration: 0.5,
  /** The app's zoom out of the screen centre. */
  appZoom: Object.freeze({ delay: 0.04, duration: 0.5, easing: "decelerate" as const }),
  /** How far the icon field grows as it flies past: each icon moves away from
   * the centre as though the whole page scaled by this factor about it. */
  iconExitScale: 2.4,
});

/** Each on-screen icon's exit while an app is open: out past the viewer, away
 * from the board's centre. The icons scatter along it as the app opens and
 * fly back in along it as the app closes. */
export type WebspringBoardLaunchExits = ReadonlyMap<string, WebspringRadialExit>;

/** Measures the icons on screen as an app opens. */
export function createWebspringBoardLaunchExits(board: HTMLElement): WebspringBoardLaunchExits {
  const bounds = board.getBoundingClientRect();
  const centre = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
  const growth = webspringBoardLaunchTiming.iconExitScale - 1;
  const exits = new Map<string, WebspringRadialExit>();
  for (const icon of board.querySelectorAll<HTMLElement>(".webspring-board-page [data-webspring-app-id]")) {
    const well = icon.querySelector<HTMLElement>(".webspring-board-icon-well") ?? icon;
    const rect = well.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    exits.set(icon.dataset.webspringAppId!, Object.freeze({
      x: Math.round((rect.left + rect.width / 2 - centre.x) * growth),
      y: Math.round((rect.top + rect.height / 2 - centre.y) * growth),
      scale: webspringBoardLaunchTiming.iconExitScale,
      opacity: 0,
      rotate: 0,
    }));
  }
  return exits;
}
