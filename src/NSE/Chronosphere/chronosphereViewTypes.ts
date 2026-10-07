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

import type { ReactNode } from "react";
import type { ChronosphereImageClient } from "./chronosphereEnvironment";
import type { ChronosphereSubject } from "./chronosphereSubject";
import type { ChronosphereVersion } from "./chronosphereTypes";

/*
 * A Chronosphere view draws an archive. Chronosphere itself owns everything around it: capturing
 * the present, the wait while it prepares, the overlay, focus and the return to the app. A view is
 * handed what to show (the model) and what it may do (the actions), as a Webspring view is, so an
 * app can choose the Vortex, the plain grid or a view of its own without touching the rest.
 */

export interface ChronosphereRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ChronosphereFaceContext {
  /** The card in front of the stack, the present page beside it, or the chosen tile. */
  readonly active: boolean;
  /** False for cards too small to read: draw the bare page. */
  readonly detail: boolean;
  /** `present` for the live document, `past` for a version. */
  readonly pane: "present" | "past";
}

/**
 * Draws a version's own page on its card, as Versions shows the document itself rather than a
 * picture of it. The face is laid out at the subject card's `faceWidth` and scaled to the card; it
 * cannot be focused or clicked. Faces need a subject `card` shape. Return null to fall back to the
 * entry's screenshot.
 */
export type ChronosphereFaceRenderer<TDetail = unknown> = (entry: ChronosphereVersion<TDetail>, context: ChronosphereFaceContext) => ReactNode;

/** Accessible IDs for application-owned detail content. */
export interface ChronosphereDetailContext {
  readonly titleId: string;
  readonly bodyId: string;
}

/** Draws a version's detail content inside the built-in modal and focus scope. */
export type ChronosphereDetailRenderer<TDetail = unknown> = (
  entry: ChronosphereVersion<TDetail>, context: ChronosphereDetailContext,
) => ReactNode;

/** Chronosphere's words, for an app that localises them. */
export interface ChronosphereLabels {
  readonly exit: string;
  readonly done: string;
  readonly present: string;
  readonly jumpToPresent: string;
  readonly details: string;

  readonly restore: string;
  readonly now: string;
  readonly timeline: string;
  readonly controls: string;
  readonly close: string;
  readonly opening: string;
  readonly couldNotOpen: string;
  readonly cancel: string;
  readonly retry: string;
}

export const defaultChronosphereLabels: ChronosphereLabels = Object.freeze({
  exit: "Exit", done: "Done", present: "Present", jumpToPresent: "Jump to present version", details: "Details",
  restore: "Restore", now: "Now", timeline: "Timeline", controls: "Chronosphere controls", close: "Close",
  opening: "Opening Chronosphere…", couldNotOpen: "Chronosphere could not open", cancel: "Cancel", retry: "Retry",
});

export interface ChronosphereViewModel<TPrepared = unknown, TDetail = unknown> {
  readonly subject: ChronosphereSubject<TDetail>;
  /** The subject's history, newest first. */
  readonly entries: readonly ChronosphereVersion<TDetail>[];
  /** The live subject as it looked when the archive opened, or null when the app captures none. */
  readonly presentImage: string | null;
  /** The whole launching window, which a view may send away as the archive arrives. */
  readonly foregroundImage: string | null;
  /** Where the present page sat on screen, in viewport px; it can lift off from there. */
  readonly presentRect: ChronosphereRect | null;
  readonly labels: ChronosphereLabels;
  /** Whatever the view's `prepare` returned. */
  readonly prepared: TPrepared;
}

export interface ChronosphereViewActions<TDetail = unknown> {
  /** Ends the archive. Call it once the view's own leaving animation has finished. */
  exit(): void;
  /**
   * Restores a past version of a document subject. Absent when the subject is read-only;
   * then a view offers no Restore. Restoring does not exit; the view does.
   */
  readonly restore?: (entry: ChronosphereVersion<TDetail>) => void;
}

export interface ChronosphereViewProps<TPrepared = unknown, TDetail = unknown> {
  readonly model: ChronosphereViewModel<TPrepared, TDetail>;
  readonly actions: ChronosphereViewActions<TDetail>;
  readonly renderFace?: ChronosphereFaceRenderer<TDetail>;
  readonly renderDetail?: ChronosphereDetailRenderer<TDetail>;
}

export interface ChronospherePreparationContext {
  /** The presenting app's image client, for decoding a view's own artwork. */
  readonly images: ChronosphereImageClient;
  readonly signal: AbortSignal;
}

/**
 * A view component: a function component, or a memo or forwardRef wrapper. `prepare`, when declared
 * on it, runs while Chronosphere shows its wait, so the view appears complete rather than filling
 * in; its result arrives as `model.prepared`. Views are compared by what they draw, not by what
 * they prepare, so an app can hold any of them in one variable and choose at run time.
 */
export type ChronosphereViewComponent<TPrepared = unknown, TDetail = unknown> = {
  // A method's parameters are bivariant: a view of any prepared type fits where views are chosen.
  bivariantView(props: ChronosphereViewProps<TPrepared, TDetail>): ReactNode;
}["bivariantView"] & {
  prepare?(context: ChronospherePreparationContext): Promise<TPrepared>;
};
