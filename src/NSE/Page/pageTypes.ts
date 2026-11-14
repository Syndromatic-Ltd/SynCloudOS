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
import type { NSEControllerOwnershipOptions } from "../Controllers/ownership";

export type PagePresetName =
  | "nseSheet"
  | "paperTurn"
  | "bookTurn"
  | "bookCurl"
  | "settingsPeel"
  | "insideReveal"
  | "tearAway"
  | "cardFlip";

export type PageMode = "turn" | "peel" | "curl" | "flip" | "tear";
export type PageEdge = "left" | "right" | "top" | "bottom";
export type PageCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type PageAxis = "x" | "y";
export type PageDirection = "forward" | "backward";
export type PagePhase = "idle" | "dragging" | "turning" | "settling" | "canceling" | "torn" | "reduced";
export type PageCompletionReason = "programmatic" | "gesture" | "controlled" | "tear" | "cancel" | "superseded" | "reset";
export type PageElement = "div" | "section" | "article" | "main" | "aside";
export type PageHinge = "edge" | "opposite-edge";
export type PageProjection = "contained" | "spread";
export type PageBookEdge = Extract<PageEdge, "left" | "right">;

export type PageStyle = CSSProperties & Record<`--${string}`, string | number | undefined>;

export interface PagePoint {
  x: number;
  y: number;
}

export interface PageSize {
  width: number;
  height: number;
}

export interface PageFoldLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PageMotionPreset {
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
  hinge?: PageHinge;
  /** Whether a turning surface may project outside the page's layout box. */
  projection?: PageProjection;
  /** Width of the traveling book curl as a fraction of leaf width (0.08–0.6). */
  rollWidth?: number;
}

export interface PageMaterialPreset {
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

export interface PageInteractionPreset {
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

export interface PagePreset {
  name: PagePresetName;
  mode: PageMode;
  edge: PageEdge;
  corner?: PageCorner;
  direction: PageDirection;
  className: string;
  motion: PageMotionPreset;
  material: PageMaterialPreset;
  interaction: PageInteractionPreset;
}

export interface PagePresetOverrides {
  mode?: PageMode;
  edge?: PageEdge;
  corner?: PageCorner;
  direction?: PageDirection;
  className?: string;
  motion?: Partial<PageMotionPreset>;
  material?: Partial<PageMaterialPreset>;
  interaction?: Partial<PageInteractionPreset>;
}

export interface PageGeometryInput {
  progress: number;
  mode: PageMode;
  edge: PageEdge;
  corner?: PageCorner;
  direction: PageDirection;
  phase?: PagePhase;
  motion: PageMotionPreset;
  material: PageMaterialPreset;
  torn?: boolean;
  /** Measured page size in px; fold math needs real metrics to stay angle-true. */
  size?: PageSize;
  /** Dragged pointer in page-local px; when present the fold tracks it. */
  pointer?: PagePoint;
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
export interface PageCurlCylinder {
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
export interface PageTearFlight {
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
export interface PageTearPose {
  /** The bound edge. */
  binding: PageEdge;
  /** The tear line's mean depth below the binding and how far it wanders, in px. */
  depth: number;
  roughness: number;
  seed: number;
  /** The stretch of the binding torn so far, in px along it from its start (left or top). */
  tornFrom: number;
  tornTo: number;
  flight: PageTearFlight;
}

export interface PageGeometry {
  progress: number;
  visualProgress: number;
  axis: PageAxis;
  edge: PageEdge;
  corner: PageCorner;
  direction: PageDirection;
  mode: PageMode;
  phase: PagePhase;
  reduced: boolean;
  bookTurn: boolean;
  hingeEdge: PageEdge;
  projection: PageProjection;
  size: PageSize;
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
  foldLine: PageFoldLine;
  /** Fold line direction in degrees (atan2 of the crease vector). */
  foldAngleDeg: number;
  /** Where the page corner currently sits, in page space. */
  curledCorner: PagePoint;
  /** 1 while the resting dog-ear trigger should show, fading to 0 as the curl takes over. */
  dogEarOpacity: number;
  /** The roll for a 3D-rendered curl; null when the page is not curling. */
  curlCylinder: PageCurlCylinder | null;
  /** The rip, stub and flight of a page tearing from its binding; null otherwise. */
  tear: PageTearPose | null;
  /** The 2D tear: the stub it leaves, and the sheet's flight. */
  tearStubClipPath: string;
  tearSheetTransform: string;
  tearSheetOpacity: number;
}

export interface PageTurnSurface {
  /** Static snapshot data URL for the semantic front tree. */
  front: string;
  /** Static snapshot data URL for the semantic back tree. */
  back: string;
  /** Vertical strip count used by the flexible leaf. Defaults to 32. */
  strips?: number;
}

export interface PageBookStripPoint {
  x: number;
  z: number;
}

export interface PageBookStripGeometryInput {
  progress: number;
  edge: PageBookEdge;
  direction: PageDirection;
  size: PageSize;
  stripCount?: number;
  rollWidth?: number;
}

export interface PageBookStripGeometry {
  chainIndex: number;
  visualIndex: number;
  width: number;
  renderWidth: number;
  angleDeg: number;
  hinge: PageBookStripPoint;
  outer: PageBookStripPoint;
  transformOrigin: string;
  transform: string;
  frontFaceTransform: string;
  backFaceTransform: string;
  frontBackgroundOffsetX: number;
  backBackgroundOffsetX: number;
}

export interface PageTurnSnapshot {
  progress: number;
  targetProgress: number;
  phase: PagePhase;
  mode: PageMode;
  edge: PageEdge;
  direction: PageDirection;
  torn: boolean;
  turnId: string | number;
  reason: PageCompletionReason;
  updatedAt: number;
}

export interface PageTurnControllerOptions extends NSEControllerOwnershipOptions {
  progress?: number;
  mode?: PageMode;
  edge?: PageEdge;
  direction?: PageDirection;
  phase?: PagePhase;
  torn?: boolean;
}

export interface PageTurnOptions {
  progress?: number;
  targetProgress?: number;
  durationMs?: number;
  mode?: PageMode;
  edge?: PageEdge;
  direction?: PageDirection;
  reason?: PageCompletionReason;
  turnId?: string | number;
}

export interface PageGestureOptions {
  enabled?: boolean;
  edges?: PageEdge[] | "all";
  snapThreshold?: number;
  openProgress?: number;
  edgeActivationSize?: number;
  preventScroll?: boolean;
  haptics?: boolean;
}

export interface PageEvent {
  snapshot: PageTurnSnapshot;
  reason: PageCompletionReason;
}

export interface PageHandle {
  getSnapshot: () => PageTurnSnapshot;
  setProgress: (progress: number, reason?: PageCompletionReason) => PageTurnSnapshot;
  turnTo: (progress: number, options?: PageTurnOptions) => void;
  turnForward: (options?: PageTurnOptions) => void;
  turnBackward: (options?: PageTurnOptions) => void;
  open: (options?: PageTurnOptions) => void;
  close: (options?: PageTurnOptions) => void;
  tear: (options?: PageTurnOptions) => void;
  cancel: () => void;
  reset: () => void;
}

export interface UsePageOptions {
  preset?: PagePresetName | PagePreset;
  presetOverrides?: PagePresetOverrides;
  progress?: number;
  defaultProgress?: number;
  open?: boolean;
  defaultOpen?: boolean;
  mode?: PageMode;
  edge?: PageEdge;
  corner?: PageCorner;
  direction?: PageDirection;
  torn?: boolean;
  disabled?: boolean;
  interactive?: boolean | PageGestureOptions;
  durationMs?: number;
  reducedMotion?: boolean;
  onProgressChange?: (progress: number, event: PageEvent) => void;
  onPhaseChange?: (phase: PagePhase, event: PageEvent) => void;
  onOpenChange?: (open: boolean, event: PageEvent) => void;
  onTurnStart?: (event: PageEvent) => void;
  onTurnEnd?: (event: PageEvent) => void;
  onTear?: (event: PageEvent) => void;
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

export interface PageDogEarHandlers {
  onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onClick: () => void;
}

export interface UsePageResult {
  snapshot: PageTurnSnapshot;
  geometry: PageGeometry;
  preset: PagePreset;
  rootRef: (node: HTMLElement | null) => void;
  interactive: boolean;
  getStyle: (style?: CSSProperties) => PageStyle;
  handle: PageHandle;
  dogEarHandlers: PageDogEarHandlers;
  /** Calls `listener` with each drag frame's geometry, which bypasses React renders. */
  subscribeFrame: (listener: (geometry: PageGeometry) => void) => () => void;
  pointerHandlers: Pick<
    HTMLAttributes<HTMLElement>,
    "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel" | "onLostPointerCapture"
  >;
}

export interface PageProps extends Omit<HTMLAttributes<HTMLElement>, "children" | "style"> {
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
  turnSurface?: PageTurnSurface;
  as?: PageElement;
  preset?: PagePresetName | PagePreset;
  presetOverrides?: PagePresetOverrides;
  progress?: number;
  defaultProgress?: number;
  open?: boolean;
  defaultOpen?: boolean;
  mode?: PageMode;
  edge?: PageEdge;
  corner?: PageCorner;
  direction?: PageDirection;
  torn?: boolean;
  disabled?: boolean;
  interactive?: boolean | PageGestureOptions;
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
  onProgressChange?: (progress: number, event: PageEvent) => void;
  onPhaseChange?: (phase: PagePhase, event: PageEvent) => void;
  onOpenChange?: (open: boolean, event: PageEvent) => void;
  onTurnStart?: (event: PageEvent) => void;
  onTurnEnd?: (event: PageEvent) => void;
  onTear?: (event: PageEvent) => void;
}

export type PagePointerHandler = (event: ReactPointerEvent<HTMLElement>) => void;
