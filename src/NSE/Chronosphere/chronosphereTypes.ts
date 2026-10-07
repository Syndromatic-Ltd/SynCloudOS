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

/** A source-owned version. Display text never determines chronological order. */
export interface ChronosphereVersion<TDetail = unknown> {
  readonly id: string;
  /** Finite source sequence, increasing from oldest to newest. May be an epoch timestamp
   * for a time-ordered source. Use the same unit throughout a subject's history. */
  readonly sequence: number;
  /** Optional save time in milliseconds since Unix epoch; breaks equal-sequence ties. */
  readonly savedAt?: number;
  readonly title: string;
  /** Caller-formatted date; no date parsing or locale assumptions. */
  readonly dateLabel: string;
  /** Optional display label, e.g. "1.10". Never parsed for ordering. */
  readonly displayLabel?: string;
  readonly summary?: string;
  /** The live version sorts first and cannot be restored. */
  readonly isCurrent?: boolean;
  /** Application-owned data, interpreted by its face, detail or custom view renderer. */
  readonly detail?: TDetail;
  readonly screenshotSrc?: string;
  /** Optional presentation tint [r,g,b] in 0..1. Omit for the neutral default. */
  readonly tint?: readonly [number, number, number];
  /** Size of this version's change relative to the preceding saved document, 0..1.
   * Small changes accumulate for Vortex's significant-change arrows. Omit for
   * archives where each entry is already a meaningful change. */
  readonly changeMagnitude?: number;
}

/** Computed placement of one entry within the receding 3D stack. */
export interface ChronosphereDepthSlot<TDetail = unknown> {
  entry: ChronosphereVersion<TDetail>;
  index: number;
  /** index - activeIndex (0 = the active/front card; >0 = older, receding up). */
  relativeIndex: number;
  translateY: number;
  translateZ: number;
  scale: number;
  opacity: number;
  blur: number;
  zIndex: number;
  isActive: boolean;
  /** Older cards beyond the detail threshold render as peeking placeholders. */
  isPlaceholder: boolean;
}

export interface ChronosphereStackOptions {
  /** Vertical gap between successive receding cards (px). */
  stepY?: number;
  /** Depth pushed back per receding card (px). */
  stepZ?: number;
  /** Scale removed per receding step. */
  scaleStep?: number;
  /** Opacity removed per receding step. */
  opacityStep?: number;
  /** How many cards behind the active one render full content before placeholders. */
  detailDepth?: number;
}
