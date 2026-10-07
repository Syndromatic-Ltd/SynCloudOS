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

import type { SynCloudOSRuntimeEnvironment } from "../Runtime/runtimeInstanceTypes";
import { getSynCloudOSHorizontalSizeClass, type SynCloudOSHorizontalSizeClass } from "../ResponsiveModeManager/presentationTypes";
import type { WindowBounds } from "./windowTypes";

export type ScreenServiceEnvironment = Pick<
  SynCloudOSRuntimeEnvironment,
  "layoutViewport" | "visualViewport" | "screen" | "workArea" | "requestAnimationFrame" | "cancelAnimationFrame"
>;

export interface ScreenSnapshot {
  readonly layoutViewport: WindowBounds;
  readonly visualViewport: WindowBounds;
  readonly workArea: WindowBounds;
  readonly safeAreaInsets: {
    readonly blockStart: number;
    readonly inlineEnd: number;
    readonly blockEnd: number;
    readonly inlineStart: number;
  };
  readonly devicePixelRatio: number;
  /** Compatibility geometry projection. It uses the canonical trait
   * classifier rather than owning a competing media-query boundary. */
  readonly breakpoint: SynCloudOSHorizontalSizeClass;
  readonly orientation: "portrait" | "landscape";
  readonly virtualKeyboardInset: number;
}

function freezeBounds(bounds: WindowBounds): WindowBounds { return Object.freeze(bounds); }

export class ScreenService {
  readonly #listeners = new Set<() => void>();
  readonly #disposers: Array<() => void> = [];
  #snapshot: ScreenSnapshot;
  #frame: unknown = null;
  #disposed = false;

  constructor(private readonly environment: ScreenServiceEnvironment) {
    this.#snapshot = this.#project();
    const schedule = () => this.#schedule();
    this.#disposers.push(
      environment.visualViewport.subscribe(schedule),
      environment.layoutViewport.subscribe(schedule),
      environment.screen.subscribe(schedule),
      environment.workArea.subscribe(schedule),
    );
  }

  getSnapshot = (): ScreenSnapshot => this.#snapshot;

  /** Reads the injected sources without publishing, so a pending desktop
   * gesture cannot race a compact-presentation transition in the same frame. */
  getCurrentSnapshot = (): ScreenSnapshot => this.#project();

  subscribe = (listener: () => void): (() => void) => {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    let live = true;
    return () => {
      if (!live) return;
      live = false;
      this.#listeners.delete(listener);
    };
  };

  #project(): ScreenSnapshot {
    const screen = this.environment.screen.getSnapshot();
    const layout = this.environment.layoutViewport.getSnapshot();
    const work = this.environment.workArea.getSnapshot();
    const visual = this.environment.visualViewport.getSnapshot();
    const layoutViewport = freezeBounds({ x: 0, y: 0, width: layout.width, height: layout.height });
    const visualViewport = freezeBounds(visual
      ? { x: visual.offsetLeft, y: visual.offsetTop, width: visual.width, height: visual.height }
      : { ...layoutViewport });
    const workArea = freezeBounds({ x: work.x, y: work.y, width: work.width, height: work.height });
    const safeAreaInsets = Object.freeze({
      blockStart: work.safeArea.top,
      inlineEnd: work.safeArea.right,
      blockEnd: work.safeArea.bottom,
      inlineStart: work.safeArea.left,
    });
    return Object.freeze({
      layoutViewport,
      visualViewport,
      workArea,
      safeAreaInsets,
      devicePixelRatio: work.devicePixelRatio,
      breakpoint: getSynCloudOSHorizontalSizeClass(layoutViewport.width),
      orientation: screen.orientation.startsWith("portrait") || screen.height > screen.width ? "portrait" : "landscape",
      virtualKeyboardInset: Math.max(0, layoutViewport.height - (visualViewport.y + visualViewport.height)),
    });
  }

  #schedule(): void {
    if (this.#disposed || this.#frame !== null) return;
    this.#frame = this.environment.requestAnimationFrame(() => {
      this.#frame = null;
      if (this.#disposed) return;
      this.#snapshot = this.#project();
      for (const listener of this.#listeners) listener();
    });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#frame !== null) this.environment.cancelAnimationFrame(this.#frame);
    this.#frame = null;
    for (const dispose of this.#disposers.splice(0).reverse()) dispose();
    this.#listeners.clear();
  }
}
