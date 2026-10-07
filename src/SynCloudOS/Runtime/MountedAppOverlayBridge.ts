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

import type { SynCloudOSPresentationTraits } from "../ResponsiveModeManager/presentationTypes";

export interface MountedAppOverlayAuthority {
  /** Stable host runtime label used only for DOM/provider ownership markers. */
  readonly runtimeId: string;
  readonly environment: {
    readonly browser: {
      getDocument(): Document | null;
      getWindow(): Window | null;
    };
    readonly workArea: {
      getSnapshot(): {
        readonly width: number;
        readonly height: number;
        readonly safeArea: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
      };
      subscribe(listener: () => void): () => void;
    };
    readonly visualViewport: {
      getSnapshot(): { readonly width: number; readonly height: number; readonly offsetLeft: number; readonly offsetTop: number; readonly scale?: number } | null;
      subscribe(listener: () => void): () => void;
    };
    /** The same mounted, content-bound traits app code receives. */
    readonly presentation: {
      getSnapshot(): SynCloudOSPresentationTraits;
      subscribe(listener: () => void): () => void;
    };
    setTimeout(callback: () => void, delayMs: number): unknown;
    clearTimeout(handle: unknown): void;
  };
  observeFiniteWork(
    receipt: Promise<void>,
    input: Readonly<{ kind: "focus-restore"; label: string }>,
  ): void;
}

const authorities = new WeakMap<object, MountedAppOverlayAuthority>();

export function getMountedAppOverlayAuthority(runtime: object): MountedAppOverlayAuthority {
  const authority = authorities.get(runtime);
  if (!authority) throw new DOMException("The mounted application overlay authority is no longer live.", "SecurityError");
  return authority;
}

export function setMountedAppOverlayAuthority(runtime: object, authority: MountedAppOverlayAuthority): void {
  authorities.set(runtime, authority);
}

export function clearMountedAppOverlayAuthority(runtime: object): void {
  authorities.delete(runtime);
}
