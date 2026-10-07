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

import type { ChronosphereVersion } from "./chronosphereTypes";

/*
 * A subject is whatever the archive is pointed at: any app's
 * version history. The caller supplies its live subject capture independently
 * of the complete foreground that recedes into the galaxy.
 */
export type ChronosphereSubjectKind = "desktop" | "app";

/**
 * How the archive is laid out.
 * - `stack`: one centred card in front, older ones receding up into the vortex. Fits any
 *   version history.
 * - `versions`: Lion's Versions. The present document stands on the left; the stack of earlier
 *   versions recedes on the right, the one in front ready to compare and restore. Below 760px
 *   wide there is not room for two pages, so it becomes the stack.
 */
export type ChronosphereLayout = "stack" | "versions";

/** The shape of a version card: the subject's own page, not a stock rectangle. */
export interface ChronosphereCardShape {
  /** Width over height: 16 / 10 for a desktop window, 1 / Math.SQRT2 for an A4 page. */
  readonly aspectRatio: number;
  /** Corner radius in CSS px at the card's displayed size. Paper has 0; a window 22. */
  readonly cornerRadius?: number;
  /** `window` keeps the glass rim lit from above; `paper` is a sheet with a soft drop shadow. */
  readonly material?: "window" | "paper";
  /**
   * The width, in CSS px, that faces from `renderFace` are laid out at before they are scaled to
   * the card, so a page keeps its real line breaks at any card size. Defaults to 800.
   */
  readonly faceWidth?: number;
}

export interface ChronosphereSubject<TDetail = unknown> {
  /** Stable id, e.g. "webspring" or an app id. */
  id: string;
  /** Human label shown in chrome, e.g. "Webspring". */
  label: string;
  /** What is being archived; presentation and captures are caller supplied. */
  kind: ChronosphereSubjectKind;
  /** Version history in any order; the view sorts by source chronology. */
  entries: readonly ChronosphereVersion<TDetail>[];
  /** Optional accessible description of the live "present" view. */
  presentLabel?: string;
  /**
   * Optional emblem composited onto the captured present card (e.g. the
   * Webspring dial). Keeps the subject's identity crisp even when the live
   * capture can't rasterise transformed/masked content.
   */
  presentOverlay?: string;
  /** Defaults to `stack`. */
  layout?: ChronosphereLayout;
  /**
   * Defaults to the window card: 16:10 on a landscape screen and a portrait phone card on a
   * phone, rounded 22px.
   */
  card?: ChronosphereCardShape;
}

/** Empty fallback; hosts supply their own subject and version history. */
export const defaultChronosphereSubject: ChronosphereSubject = {
  id: "history",
  label: "History",
  kind: "app",
  entries: [],
  presentLabel: "The present view"
};

/** Wrap any app's version history as a Chronosphere subject. */
export function createChronosphereAppSubject<TDetail>(
  id: string,
  label: string,
  entries: readonly ChronosphereVersion<TDetail>[],
  presentation: Pick<ChronosphereSubject<TDetail>, "layout" | "card"> = {}
): ChronosphereSubject<TDetail> {
  return { id, label, kind: "app", entries, presentLabel: `The live ${label}`, ...presentation };
}
