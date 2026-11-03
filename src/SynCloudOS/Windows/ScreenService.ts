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
import { unavailableViewportFeatures, validateViewportFeatures, type RuntimeViewportFeaturesSnapshot } from "./viewportFeatures";
import type { WindowBounds } from "./windowTypes";

export type ScreenServiceEnvironment = Pick<
  SynCloudOSRuntimeEnvironment,
  "layoutViewport" | "visualViewport" | "screen" | "workArea" | "viewportFeatures" | "requestAnimationFrame" | "cancelAnimationFrame"
>;

export type ScreenGeometryState = "current" | "retained" | "unavailable";
export type ScreenGeometrySource = "layoutViewport" | "visualViewport" | "workArea";

export interface ScreenSnapshot {
  /** Retained geometry is the last complete valid sample, not a new measurement. */
  readonly geometryState: ScreenGeometryState;
  readonly viewportFeatures: RuntimeViewportFeaturesSnapshot;
  readonly invalidGeometrySources: readonly ScreenGeometrySource[];
  readonly layoutViewport: WindowBounds;
  readonly visualViewport: WindowBounds;
  readonly workArea: WindowBounds;
  readonly safeAreaInsets: {
    readonly blockStart: number;
    readonly inlineEnd: number;
    readonly blockEnd: number;
    readonly inlineStart: number;
  };
  /** Unknown means an existing host adapter did not declare availability. */
  readonly safeAreaAvailability: "available" | "unavailable" | "unknown";
  readonly devicePixelRatio: number;
  /** Compatibility geometry projection. It uses the canonical trait
   * classifier rather than owning a competing media-query boundary. */
  readonly breakpoint: SynCloudOSHorizontalSizeClass;
  readonly orientation: "portrait" | "landscape";
  readonly virtualKeyboardInset: number;
}

function freezeBounds(bounds: WindowBounds): WindowBounds { return Object.freeze(bounds); }

function validBounds(bounds: WindowBounds): boolean {
  return [bounds.x, bounds.y, bounds.width, bounds.height, bounds.x + bounds.width, bounds.y + bounds.height].every(Number.isFinite)
    && bounds.width > 0 && bounds.height > 0;
}

export class ScreenService {
  readonly #listeners = new Set<() => void>();
  readonly #disposers: Array<() => void> = [];
  #snapshot: ScreenSnapshot;
  #lastValid: ScreenSnapshot | null = null;
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
    if (environment.viewportFeatures) this.#disposers.push(environment.viewportFeatures.subscribe(schedule));
  }

  getSnapshot = (): ScreenSnapshot => this.#snapshot;

  /** Reads the injected sources without publishing, so a pending desktop
   * gesture cannot race a compact-presentation transition in the same frame. */
  getCurrentSnapshot = (): ScreenSnapshot => this.#disposed ? this.#snapshot : this.#project();

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
    const invalidGeometrySources: ScreenGeometrySource[] = [];
    if (!validBounds(layoutViewport)) invalidGeometrySources.push("layoutViewport");
    if (!validBounds(visualViewport) || (visual !== null && (!Number.isFinite(visual.scale) || visual.scale <= 0))) invalidGeometrySources.push("visualViewport");
    if (!validBounds(workArea) || !Number.isFinite(work.devicePixelRatio) || work.devicePixelRatio <= 0) invalidGeometrySources.push("workArea");
    if (invalidGeometrySources.length === 0 && (
      Math.min(workArea.x + workArea.width, visualViewport.x + visualViewport.width) <= Math.max(workArea.x, visualViewport.x) ||
      Math.min(workArea.y + workArea.height, visualViewport.y + visualViewport.height) <= Math.max(workArea.y, visualViewport.y)
    )) invalidGeometrySources.push("workArea");
    if (invalidGeometrySources.length > 0) {
      // A folding/occlusion event can briefly invalidate one source while the
      // others have already changed. Retain one complete sample, not a mixture
      // of new layout and stale visible bounds. An initial placeholder is
      // explicitly unavailable and must never be used as a measured frame.
      const placeholder = freezeBounds({ x: 0, y: 0, width: 1, height: 1 });
      return Object.freeze({
        ...(this.#lastValid ?? {
          layoutViewport: placeholder, visualViewport: placeholder, workArea: placeholder,
          safeAreaInsets: Object.freeze({ blockStart: 0, inlineEnd: 0, blockEnd: 0, inlineStart: 0 }),
          safeAreaAvailability: work.safeAreaAvailability === "unavailable" ? "unavailable" as const : "unknown" as const,
          devicePixelRatio: 1, breakpoint: "compact" as const, orientation: "landscape" as const, virtualKeyboardInset: 0,
        }),
        viewportFeatures: unavailableViewportFeatures,
        geometryState: this.#lastValid ? "retained" as const : "unavailable" as const,
        invalidGeometrySources: Object.freeze(invalidGeometrySources),
      });
    }
    const validInsets = [work.safeArea?.top, work.safeArea?.right, work.safeArea?.bottom, work.safeArea?.left]
      .every(value => Number.isFinite(value) && value >= 0);
    const safeAreaAvailability = !validInsets || work.safeAreaAvailability === "unavailable" ? "unavailable" as const
      : work.safeAreaAvailability === "available" ? "available" as const : "unknown" as const;
    const safeAreaInsets = Object.freeze({
      blockStart: safeAreaAvailability === "unavailable" ? 0 : work.safeArea.top,
      inlineEnd: safeAreaAvailability === "unavailable" ? 0 : work.safeArea.right,
      blockEnd: safeAreaAvailability === "unavailable" ? 0 : work.safeArea.bottom,
      inlineStart: safeAreaAvailability === "unavailable" ? 0 : work.safeArea.left,
    });
    let viewportFeatures = unavailableViewportFeatures;
    try { viewportFeatures = validateViewportFeatures(this.environment.viewportFeatures?.getSnapshot(), layoutViewport); } catch { /* provider failed closed */ }
    const snapshot: ScreenSnapshot = Object.freeze({
      viewportFeatures,
      geometryState: "current",
      invalidGeometrySources: Object.freeze([]),
      layoutViewport,
      visualViewport,
      workArea,
      safeAreaInsets,
      safeAreaAvailability,
      devicePixelRatio: work.devicePixelRatio,
      breakpoint: getSynCloudOSHorizontalSizeClass(layoutViewport.width),
      orientation: screen.orientation.startsWith("portrait") || screen.height > screen.width ? "portrait" : "landscape",
      virtualKeyboardInset: Math.max(0, layoutViewport.height - (visualViewport.y + visualViewport.height)),
    });
    this.#lastValid = snapshot;
    return snapshot;
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
