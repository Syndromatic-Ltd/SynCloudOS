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

import type {
  CSSProperties,
  HTMLAttributes,
  PointerEvent as ReactPointerEvent,
  ReactNode
} from "react";

export type NSEPagePresetName =
  | "nseSheet"
  | "paperTurn"
  | "bookTurn"
  | "bookCurl"
  | "settingsPeel"
  | "insideReveal"
  | "tearAway"
  | "cardFlip";

export type NSEPageMode = "turn" | "peel" | "curl" | "flip" | "tear";
export type NSEPageEdge = "left" | "right" | "top" | "bottom";
export type NSEPageCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type NSEPageAxis = "x" | "y";
export type NSEPageDirection = "forward" | "backward";
export type NSEPagePhase = "idle" | "dragging" | "turning" | "settling" | "canceling" | "torn" | "reduced";
export type NSEPageCompletionReason = "programmatic" | "gesture" | "controlled" | "tear" | "cancel" | "superseded" | "reset";
export type NSEPageElement = "div" | "section" | "article" | "main" | "aside";
export type NSEPageHinge = "edge" | "opposite-edge";
export type NSEPageProjection = "contained" | "spread";
export type NSEPageBookEdge = Extract<NSEPageEdge, "left" | "right">;

export type NSEPageStyle = CSSProperties & Record<`--${string}`, string | number | undefined>;

export interface NSEPagePoint {
  x: number;
  y: number;
}

export interface NSEPageSize {
  width: number;
  height: number;
}

export interface NSEPageFoldLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface NSEPageMotionPreset {
  durationMs: number;
  reducedDurationMs: number;
  easing: string;
  maxAngle: number;
  perspective: number;
  liftPx: number;
  curlStrength: number;
  shadowStrength: number;
  revealThreshold: number;
  /** How a curl travels: peeling from a corner, or turning a book leaf. */
  curlPath?: "peel" | "book";
  /** Roll radius of the curl cylinder at rest / fully curled, in px. */
  curlRadiusMinPx?: number;
  curlRadiusMaxPx?: number;
  /** Resting curl progress: the real fold that acts as the dog-ear affordance. */
  restProgress?: number;
  /** How much the resting fold lifts while hovered. */
  peekDelta?: number;
  /** Which side owns the rigid hinge relative to the gesture activation edge. */
  hinge?: NSEPageHinge;
  /** Whether a turning surface may project outside the page's layout box. */
  projection?: NSEPageProjection;
  /** Width of the traveling book curl as a fraction of leaf width (0.08–0.6). */
  rollWidth?: number;
}

export interface NSEPageMaterialPreset {
  background: string;
  backBackground: string;
  insideBackground: string;
  colour: string;
  radius: string;
  thicknessPx: number;
  shadowColour: string;
  highlightColour: string;
  edgeColour: string;
  grainOpacity: number;
}

export interface NSEPageInteractionPreset {
  snapThreshold: number;
  openProgress?: number;
  velocityThreshold: number;
  edgeActivationSize: number;
  preventScroll: boolean;
  haptics: boolean;
  /** Render the built-in folded-corner trigger (curl mode only). */
  dogEar?: boolean;
  dogEarSizePx?: number;
}

export interface NSEPagePreset {
  name: NSEPagePresetName;
  mode: NSEPageMode;
  edge: NSEPageEdge;
  corner?: NSEPageCorner;
  direction: NSEPageDirection;
  className: string;
  motion: NSEPageMotionPreset;
  material: NSEPageMaterialPreset;
  interaction: NSEPageInteractionPreset;
}

export interface NSEPagePresetOverrides {
  mode?: NSEPageMode;
  edge?: NSEPageEdge;
  corner?: NSEPageCorner;
  direction?: NSEPageDirection;
  className?: string;
  motion?: Partial<NSEPageMotionPreset>;
  material?: Partial<NSEPageMaterialPreset>;
  interaction?: Partial<NSEPageInteractionPreset>;
}

export interface NSEPageGeometryInput {
  progress: number;
  mode: NSEPageMode;
  edge: NSEPageEdge;
  corner?: NSEPageCorner;
  direction: NSEPageDirection;
  phase?: NSEPagePhase;
  motion: NSEPageMotionPreset;
  material: NSEPageMaterialPreset;
  torn?: boolean;
  /** Measured page size in px; fold math needs real metrics to stay angle-true. */
  size?: NSEPageSize;
  /** Dragged pointer in page-local px; when present the fold tracks it. */
  pointer?: NSEPagePoint;
  /** When true, curl mode collapses into a plain crossfade. */
  reducedMotion?: boolean;
  /** Shapes a tear's ragged line; each tear of a page may use its own. */
  tearSeed?: number;
}

/**
 * The roll a curling page wraps around, in page px. Paper on the corner side of
 * the bend line follows the same cross-section all along the line (a crest of
 * `radius`, then an ever looser turn up to `sweep`), so the paper bends without
 * ever stretching, as real paper must. A zero radius is a flat fold.
 */
export interface NSEPageCurlCylinder {
  /** A point on the bend line, where the paper leaves the page. */
  bendX: number;
  bendY: number;
  /** Unit vector across the bend line, towards the lifting corner. */
  normalX: number;
  normalY: number;
  /** The roll's radius in line with the lifting corner; 0 is a flat fold. */
  radius: number;
  /**
   * How far the paper turns over, in radians: π lays the flap face down over
   * the page; less holds it up off the page, as a hand-lifted leaf stands.
   */
  sweep: number;
}

/**
 * Where a sheet torn from its binding has been carried once it is free: moved
 * across and up off the page, turned about the corner it was held by.
 */
export interface NSEPageTearFlight {
  x: number;
  y: number;
  z: number;
  /** Turn about the held corner, in radians. */
  spin: number;
  pivotX: number;
  pivotY: number;
  opacity: number;
}

/**
 * A sheet tearing away from the edge it is bound along. The paper gives along
 * a ragged line a little below the binding, leaving a stub of it bound in
 * place, and the sheet itself rolls up off the page as a curl does.
 */
export interface NSEPageTearPose {
  /** The bound edge. */
  binding: NSEPageEdge;
  /** The tear line's mean depth below the binding and how far it wanders, in px. */
  depth: number;
  roughness: number;
  seed: number;
  /** The stretch of the binding torn so far, in px along it from its start (left or top). */
  tornFrom: number;
  tornTo: number;
  flight: NSEPageTearFlight;
}

export interface NSEPageGeometry {
  progress: number;
  visualProgress: number;
  axis: NSEPageAxis;
  edge: NSEPageEdge;
  corner: NSEPageCorner;
  direction: NSEPageDirection;
  mode: NSEPageMode;
  phase: NSEPagePhase;
  reduced: boolean;
  bookTurn: boolean;
  hingeEdge: NSEPageEdge;
  projection: NSEPageProjection;
  size: NSEPageSize;
  signedAngle: number;
  unsignedAngle: number;
  curl: number;
  liftPx: number;
  shadowOpacity: number;
  creaseOpacity: number;
  frontOpacity: number;
  backOpacity: number;
  insideOpacity: number;
  insideInteractive: boolean;
  torn: boolean;
  transformOrigin: string;
  sheetTransform: string;
  backFaceTransform: string;
  shadowTransform: string;
  curlInset: string;
  frontClipPath: string;
  /** Opaque front-side safety layer that covers transient front/flap compositor gaps. */
  backstopClipPath: string;
  /** Flap clip polygon in the flap's local (pre-mirror) space. */
  curlClipPath: string;
  /** Mirror transform that folds the flap across the fold line. */
  curlFlapTransform: string;
  /** Fold-aligned shading (rim light, crease shadow, roll highlight) for the flap. */
  curlShadeBackground: string;
  /** Fold-aligned cast shadow painted on the layer the curl hovers over. */
  curlShadowBackground: string;
  /** Silhouette drop shadow applied to the flap element. */
  curlFlapShadowFilter: string;
  /** Cheaper drag-time silhouette shadow for Retina pointer tracking. */
  curlFlapDragShadowFilter: string;
  /** Crease segment endpoints in page space. */
  foldLine: NSEPageFoldLine;
  /** Fold line direction in degrees (atan2 of the crease vector). */
  foldAngleDeg: number;
  /** Where the page corner currently sits, in page space. */
  curledCorner: NSEPagePoint;
  /** 1 while the resting dog-ear trigger should show, fading to 0 as the curl takes over. */
  dogEarOpacity: number;
  /** The roll for a 3D-rendered curl; null when the page is not curling. */
  curlCylinder: NSEPageCurlCylinder | null;
  /** The rip, stub and flight of a page tearing from its binding; null otherwise. */
  tear: NSEPageTearPose | null;
  /** The 2D tear: the stub it leaves, and the sheet's flight. */
  tearStubClipPath: string;
  tearSheetTransform: string;
  tearSheetOpacity: number;
}

export interface NSEPageTurnSurface {
  /** Static snapshot data URL for the semantic front tree. */
  front: string;
  /** Static snapshot data URL for the semantic back tree. */
  back: string;
  /** Vertical strip count used by the flexible leaf. Defaults to 32. */
  strips?: number;
}

export interface NSEPageBookStripPoint {
  x: number;
  z: number;
}

export interface NSEPageBookStripGeometryInput {
  progress: number;
  edge: NSEPageBookEdge;
  direction: NSEPageDirection;
  size: NSEPageSize;
  stripCount?: number;
  rollWidth?: number;
}

export interface NSEPageBookStripGeometry {
  chainIndex: number;
  visualIndex: number;
  width: number;
  renderWidth: number;
  angleDeg: number;
  hinge: NSEPageBookStripPoint;
  outer: NSEPageBookStripPoint;
  transformOrigin: string;
  transform: string;
  frontFaceTransform: string;
  backFaceTransform: string;
  frontBackgroundOffsetX: number;
  backBackgroundOffsetX: number;
}

export interface NSEPageControllerSnapshot {
  progress: number;
  targetProgress: number;
  phase: NSEPagePhase;
  mode: NSEPageMode;
  edge: NSEPageEdge;
  direction: NSEPageDirection;
  torn: boolean;
  turnId: string | number;
  reason: NSEPageCompletionReason;
  updatedAt: number;
}

export interface NSEPageControllerOptions {
  progress?: number;
  mode?: NSEPageMode;
  edge?: NSEPageEdge;
  direction?: NSEPageDirection;
  phase?: NSEPagePhase;
  torn?: boolean;
}

export interface NSEPageTurnOptions {
  progress?: number;
  targetProgress?: number;
  durationMs?: number;
  mode?: NSEPageMode;
  edge?: NSEPageEdge;
  direction?: NSEPageDirection;
  reason?: NSEPageCompletionReason;
  turnId?: string | number;
}

export interface NSEPageGestureOptions {
  enabled?: boolean;
  edges?: NSEPageEdge[] | "all";
  snapThreshold?: number;
  openProgress?: number;
  edgeActivationSize?: number;
  preventScroll?: boolean;
  haptics?: boolean;
}

export interface NSEPageEvent {
  snapshot: NSEPageControllerSnapshot;
  reason: NSEPageCompletionReason;
}

export interface NSEPageHandle {
  getSnapshot: () => NSEPageControllerSnapshot;
  setProgress: (progress: number, reason?: NSEPageCompletionReason) => NSEPageControllerSnapshot;
  turnTo: (progress: number, options?: NSEPageTurnOptions) => void;
  turnForward: (options?: NSEPageTurnOptions) => void;
  turnBackward: (options?: NSEPageTurnOptions) => void;
  open: (options?: NSEPageTurnOptions) => void;
  close: (options?: NSEPageTurnOptions) => void;
  tear: (options?: NSEPageTurnOptions) => void;
  cancel: () => void;
  reset: () => void;
}

export interface UseNSEPageOptions {
  preset?: NSEPagePresetName | NSEPagePreset;
  presetOverrides?: NSEPagePresetOverrides;
  progress?: number;
  defaultProgress?: number;
  open?: boolean;
  defaultOpen?: boolean;
  mode?: NSEPageMode;
  edge?: NSEPageEdge;
  corner?: NSEPageCorner;
  direction?: NSEPageDirection;
  torn?: boolean;
  disabled?: boolean;
  interactive?: boolean | NSEPageGestureOptions;
  durationMs?: number;
  reducedMotion?: boolean;
  onProgressChange?: (progress: number, event: NSEPageEvent) => void;
  onPhaseChange?: (phase: NSEPagePhase, event: NSEPageEvent) => void;
  onOpenChange?: (open: boolean, event: NSEPageEvent) => void;
  onTurnStart?: (event: NSEPageEvent) => void;
  onTurnEnd?: (event: NSEPageEvent) => void;
  onTear?: (event: NSEPageEvent) => void;
  /**
   * Null when the page's rendering surface can show a turn now; otherwise a
   * promise that settles once it can. Turns and drag lifts wait for it, so a
   * curl never starts in one renderer and finishes in another.
   */
  awaitSurface?: () => Promise<void> | null;
  /**
   * True while the page's rendering surface is still being prepared, without
   * starting to wait for it. Cosmetic motion, such as a corner peek on hover,
   * is skipped meanwhile rather than run in a stand-in renderer.
   */
  surfacePending?: () => boolean;
}

export interface NSEPageDogEarHandlers {
  onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onClick: () => void;
}

export interface UseNSEPageResult {
  snapshot: NSEPageControllerSnapshot;
  geometry: NSEPageGeometry;
  preset: NSEPagePreset;
  rootRef: (node: HTMLElement | null) => void;
  interactive: boolean;
  getStyle: (style?: CSSProperties) => NSEPageStyle;
  handle: NSEPageHandle;
  dogEarHandlers: NSEPageDogEarHandlers;
  /** Calls `listener` with each drag frame's geometry, which bypasses React renders. */
  subscribeFrame: (listener: (geometry: NSEPageGeometry) => void) => () => void;
  pointerHandlers: Pick<
    HTMLAttributes<HTMLElement>,
    "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel" | "onLostPointerCapture"
  >;
}

export interface NSEPageProps extends Omit<HTMLAttributes<HTMLElement>, "children" | "style"> {
  children?: ReactNode;
  front?: ReactNode;
  back?: ReactNode;
  /** Content revealed behind the page as it turns, curls or tears away. */
  inside?: ReactNode;
  /** Force the folded-corner trigger on or off (defaults to the preset/mode). */
  dogEar?: boolean;
  dogEarLabel?: string;
  /**
   * A faint mirrored ghost on the curl flap's underside, read through the
   * paper. Off by default. `true` mirrors the front content (mounting it a
   * second time); a ReactNode supplies a lightweight stand-in instead.
   */
  backGhost?: boolean | ReactNode;
  /**
   * What a 3D curl shows on the paper's underside. `"print-through"` (the
   * default) shows the page's own print back to front through blank paper, as
   * a single iBooks page does; `"back"` shows the `back` content, for the
   * reverse page of a two-page spread.
   */
  curlUnderside?: "print-through" | "back";
  /**
   * Leave each torn sheet's ragged stub at the binding, over the sheets
   * beneath, as a pad does (tear mode). On by default.
   */
  tearStubs?: boolean;
  /** Static front/back snapshots used for a flexible book leaf during the turn. */
  turnSurface?: NSEPageTurnSurface;
  as?: NSEPageElement;
  preset?: NSEPagePresetName | NSEPagePreset;
  presetOverrides?: NSEPagePresetOverrides;
  progress?: number;
  defaultProgress?: number;
  open?: boolean;
  defaultOpen?: boolean;
  mode?: NSEPageMode;
  edge?: NSEPageEdge;
  corner?: NSEPageCorner;
  direction?: NSEPageDirection;
  torn?: boolean;
  disabled?: boolean;
  interactive?: boolean | NSEPageGestureOptions;
  durationMs?: number;
  reducedMotion?: boolean;
  className?: string;
  sheetClassName?: string;
  frontClassName?: string;
  backClassName?: string;
  insideClassName?: string;
  shadowClassName?: string;
  style?: CSSProperties;
  sheetStyle?: CSSProperties;
  frontStyle?: CSSProperties;
  backStyle?: CSSProperties;
  insideStyle?: CSSProperties;
  onProgressChange?: (progress: number, event: NSEPageEvent) => void;
  onPhaseChange?: (phase: NSEPagePhase, event: NSEPageEvent) => void;
  onOpenChange?: (open: boolean, event: NSEPageEvent) => void;
  onTurnStart?: (event: NSEPageEvent) => void;
  onTurnEnd?: (event: NSEPageEvent) => void;
  onTear?: (event: NSEPageEvent) => void;
}

export type NSEPagePointerHandler = (event: ReactPointerEvent<HTMLElement>) => void;
