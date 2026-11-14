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

export interface VirtualIndexRange { readonly start: number; readonly length: number }

export type VirtualAxis = "block" | "inline";
export type VirtualSizeEstimate = number | ((index: number) => number);

export interface VirtualItem {
  readonly index: number;
  readonly key: string;
  readonly start: number;
  readonly size: number;
  readonly end: number;
}

export interface VirtualRange {
  readonly visible: VirtualIndexRange;
  readonly rendered: readonly VirtualIndexRange[];
  readonly totalSize: number;
}

export interface VirtualiserOptions {
  readonly count: number;
  readonly axis: VirtualAxis;
  readonly overscan: number;
  /** A scalar is a bounded uniform estimate. A function is evaluated for every index to preserve heterogeneous estimates. */
  readonly estimateSize: VirtualSizeEstimate;
  readonly getKey: (index: number) => string;
  readonly retainedIndices?: ReadonlySet<number>;
  /** Changes when the meaning of estimateSize changes without changing count. */
  readonly sizingGeneration?: string | number;
}

export interface VirtualiserSnapshot {
  readonly axis: VirtualAxis;
  readonly range: VirtualRange;
  readonly items: readonly VirtualItem[];
}

export interface Virtualiser {
  readonly snapshot: VirtualiserSnapshot;
  measure(index: number, size: number): void;
  scrollToIndex(index: number, alignment?: "start" | "centre" | "end" | "nearest"): void;
  attachViewport?(node: HTMLElement | null): void;
}

export interface VirtualRangeOptions {
  readonly count: number;
  readonly viewportStart: number;
  readonly viewportSize: number;
  readonly estimateSize: VirtualSizeEstimate;
  readonly overscan: number;
  readonly retainedIndices?: ReadonlySet<number>;
}
