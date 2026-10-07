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

import type { SynCloudOSRuntimeEnvironment, RuntimeSnapshotSource } from "../Runtime/runtimeInstanceTypes";
import type { ScreenService } from "../Windows/ScreenService";
import type { WindowBounds } from "../Windows/windowTypes";

/**
 * Presentation is deliberately classified from the mounted content's inline
 * geometry. `wide` is an enhancement tier; `regular` remains a desktop-capable
 * presentation.
 */
export type SynCloudOSHorizontalSizeClass = "compact" | "regular" | "wide";

export interface SynCloudOSPresentationTraits {
  readonly revision: number;
  readonly contentBounds: WindowBounds;
  readonly hostViewportBounds: WindowBounds;
  readonly horizontalSizeClass: SynCloudOSHorizontalSizeClass;
  readonly orientation: "portrait" | "landscape";
  readonly workArea: WindowBounds;
  readonly visualViewportBounds: WindowBounds;
  readonly safeAreaInsets: {
    readonly blockStart: number;
    readonly inlineEnd: number;
    readonly blockEnd: number;
    readonly inlineStart: number;
  };
  readonly virtualKeyboardInset: number;
  readonly devicePixelRatio: number;
  readonly primaryPointer: "fine" | "coarse" | "none";
  readonly hover: boolean;
  readonly touch: boolean;
  readonly reducedMotion: boolean;
  readonly reducedTransparency: boolean;
  readonly forcedColours: boolean;
}

export interface PresentationTraitsObserverSources {
  readonly contentBounds: Pick<RuntimeSnapshotSource<WindowBounds>, "getSnapshot" | "subscribe">;
  readonly screen: ScreenService;
  readonly matchMedia: SynCloudOSRuntimeEnvironment["matchMedia"];
  /** Runtime-owned scheduling is optional only for small deterministic fixtures.
   * Production services always inject both functions from their environment. */
  readonly requestAnimationFrame?: SynCloudOSRuntimeEnvironment["requestAnimationFrame"];
  readonly cancelAnimationFrame?: SynCloudOSRuntimeEnvironment["cancelAnimationFrame"];
}

export interface SynCloudOSPresentationTraitsService {
  getSnapshot(): SynCloudOSPresentationTraits;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

export function getSynCloudOSHorizontalSizeClass(inlineSize: number): SynCloudOSHorizontalSizeClass {
  if (inlineSize < 768) return "compact";
  if (inlineSize < 1280) return "regular";
  return "wide";
}
