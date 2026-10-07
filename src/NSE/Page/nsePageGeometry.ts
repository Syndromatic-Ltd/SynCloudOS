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

import type { CSSProperties } from "react";
import type {
  NSEPageAxis,
  NSEPageBookStripGeometry,
  NSEPageBookStripGeometryInput,
  NSEPageCompletionReason,
  NSEPageControllerSnapshot,
  NSEPageCorner,
  NSEPageCurlCylinder,
  NSEPageDirection,
  NSEPageEdge,
  NSEPageFoldLine,
  NSEPageGeometry,
  NSEPageGeometryInput,
  NSEPageHinge,
  NSEPageMode,
  NSEPageMotionPreset,
  NSEPagePhase,
  NSEPagePoint,
  NSEPageSize,
  NSEPageStyle,
  NSEPageTearPose
} from "./nsePageTypes";

const DEFAULT_TURN_ID = 0;

export function clampNSEPageProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function lerpNSEPageValue(from: number, to: number, progress: number) {
  return from + (to - from) * clampNSEPageProgress(progress);
}

export function smoothNSEPageProgress(progress: number) {
  const t = clampNSEPageProgress(progress);
  return t * t * (3 - 2 * t);
}

export function easeInOutNSEPageProgress(progress: number) {
  const t = clampNSEPageProgress(progress);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeOutNSEPageProgress(progress: number) {
  const t = clampNSEPageProgress(progress);
  return 1 - Math.pow(1 - t, 3);
}

export function getNSEPageAxis(edge: NSEPageEdge): NSEPageAxis {
  return edge === "left" || edge === "right" ? "y" : "x";
}

export function getNSEPageTransformOrigin(edge: NSEPageEdge) {
  if (edge === "left") return "0% 50%";
  if (edge === "right") return "100% 50%";
  if (edge === "top") return "50% 0%";
  return "50% 100%";
}

export function getNSEPageOppositeEdge(edge: NSEPageEdge): NSEPageEdge {
  if (edge === "left") return "right";
  if (edge === "right") return "left";
  if (edge === "top") return "bottom";
  return "top";
}

export function getNSEPageHingeEdge(edge: NSEPageEdge, hinge: NSEPageHinge = "edge") {
  return hinge === "opposite-edge" ? getNSEPageOppositeEdge(edge) : edge;
}

export function getNSEPageSignedDirection(edge: NSEPageEdge, direction: NSEPageDirection) {
  const edgeSign = edge === "right" || edge === "top" ? -1 : 1;
  const directionSign = direction === "backward" ? -1 : 1;
  return edgeSign * directionSign;
}

/**
 * Book leaves use their activation edge to select a side of the spine. The
 * semantic direction says whether the reader is advancing or returning, but
 * must not invert the rotation a second time: right leaves rotate -Y and left
 * leaves +Y.
 */
export function getNSEPageBookSignedDirection(edge: NSEPageEdge) {
  if (edge === "right") return -1;
  if (edge === "left") return 1;
  return edge === "top" ? -1 : 1;
}

const BOOK_DEFAULT_STRIPS = 32;
const BOOK_MAX_STRIPS = 64;
const BOOK_STRIP_OVERLAP_PX = 0.5;

function bookNumber(value: number) {
  if (Math.abs(value) < 1e-10) return 0;
  const rounded = Math.round(value);
  return Math.abs(value - rounded) < 1e-10 ? rounded : value;
}

/**
 * Resolves a continuous, length-preserving book leaf into vertical strips.
 * `hinge` and `outer` are in the page's X/Z plane. Geometry is returned from
 * the spine outward so neighbouring endpoints can be checked and chained.
 */
export function resolveNSEPageBookStripGeometry(
  input: NSEPageBookStripGeometryInput
): NSEPageBookStripGeometry[] {
  const progress = clampNSEPageProgress(input.progress);
  const stripCount = Math.min(BOOK_MAX_STRIPS, Math.max(1, Math.round(input.stripCount ?? BOOK_DEFAULT_STRIPS)));
  const width = input.size.width / stripCount;
  const sign = getNSEPageBookSignedDirection(input.edge);
  const rollWidth = Math.min(0.6, Math.max(0.08, Number.isFinite(input.rollWidth) ? input.rollWidth ?? 0.28 : 0.28));
  const endpoint = progress === 0 || progress === 1;
  // The free edge lifts first. A cylindrical fold travels inward, leaving
  // paper beside the binding flat until the fold reaches it.
  const foldStart = 1 - progress * (1 + rollWidth);
  const hingeOnLeft = input.edge === "right";
  let hingeX = hingeOnLeft ? 0 : input.size.width;
  let hingeZ = 0;

  // Direction is deliberately semantic for book turns; the activation edge
  // alone selects rotation sign, preventing the left/backward double invert.
  void input.direction;

  return Array.from({ length: stripCount }, (_, chainIndex) => {
    const sample = (chainIndex + 0.5) / stripCount;
    const angleRad = sign * Math.PI * clampNSEPageProgress((sample - foldStart) / rollWidth);
    const angleDeg = bookNumber(endpoint
      ? sign * progress * 180
      : angleRad * (180 / Math.PI));
    const visualIndex = hingeOnLeft ? chainIndex : stripCount - 1 - chainIndex;
    const hinge = { x: bookNumber(hingeX), z: bookNumber(hingeZ) };
    const outerX = hingeX + (hingeOnLeft ? 1 : -1) * width * Math.cos(angleRad);
    const outerZ = hingeZ + (hingeOnLeft ? -1 : 1) * width * Math.sin(angleRad);
    const outer = { x: bookNumber(outerX), z: bookNumber(outerZ) };
    const translateX = hingeOnLeft ? hinge.x : hinge.x - width;
    const transformOrigin = hingeOnLeft ? "0% 50%" : "100% 50%";
    const geometry: NSEPageBookStripGeometry = {
      chainIndex,
      visualIndex,
      width,
      renderWidth: width + BOOK_STRIP_OVERLAP_PX,
      angleDeg,
      hinge,
      outer,
      transformOrigin,
      transform: `translate3d(${translateX.toFixed(3)}px, 0, ${hinge.z.toFixed(3)}px) rotateY(${angleDeg.toFixed(3)}deg)`,
      frontFaceTransform: "rotateY(0deg)",
      backFaceTransform: "rotateY(180deg)",
      frontBackgroundOffsetX: -visualIndex * width,
      backBackgroundOffsetX: -(stripCount - 1 - visualIndex) * width
    };
    hingeX = outerX;
    hingeZ = outerZ;
    return geometry;
  });
}

export function isNSEPageBookSurfaceActive(
  geometry: Pick<NSEPageGeometry, "bookTurn" | "phase" | "progress" | "reduced">
) {
  if (!geometry.bookTurn || geometry.reduced) return false;
  if (geometry.progress > 0 && geometry.progress < 1) return true;
  return geometry.phase === "dragging" || geometry.phase === "turning" || geometry.phase === "settling";
}

export function getNSEPageBackFaceTransform(axis: NSEPageAxis) {
  return axis === "y" ? "rotateY(180deg)" : "rotateX(180deg)";
}

export function getNSEPageDefaultCorner(edge: NSEPageEdge): NSEPageCorner {
  if (edge === "bottom") return "bottom-right";
  if (edge === "top") return "top-right";
  if (edge === "left") return "bottom-left";
  return "bottom-right";
}

export function getNSEPageProgressFromPoint(edge: NSEPageEdge, point: NSEPagePoint, bounds: DOMRect) {
  if (edge === "right") return clampNSEPageProgress((bounds.right - point.x) / bounds.width);
  if (edge === "left") return clampNSEPageProgress((point.x - bounds.left) / bounds.width);
  if (edge === "bottom") return clampNSEPageProgress((bounds.bottom - point.y) / bounds.height);
  return clampNSEPageProgress((point.y - bounds.top) / bounds.height);
}

export function getNSEPageNearestEdge(point: NSEPagePoint, bounds: DOMRect, allowedEdges: NSEPageEdge[] = ["right"]) {
  const distances: Record<NSEPageEdge, number> = {
    left: Math.abs(point.x - bounds.left),
    right: Math.abs(bounds.right - point.x),
    top: Math.abs(point.y - bounds.top),
    bottom: Math.abs(bounds.bottom - point.y)
  };

  return allowedEdges.reduce((nearest, edge) => distances[edge] < distances[nearest] ? edge : nearest, allowedEdges[0] ?? "right");
}

export function isNSEPagePointNearEdge(
  point: NSEPagePoint,
  bounds: DOMRect,
  edge: NSEPageEdge,
  edgeActivationSize: number
) {
  if (edge === "left") return point.x - bounds.left <= edgeActivationSize;
  if (edge === "right") return bounds.right - point.x <= edgeActivationSize;
  if (edge === "top") return point.y - bounds.top <= edgeActivationSize;
  return bounds.bottom - point.y <= edgeActivationSize;
}

function getModeAngle(mode: NSEPageMode, motion: NSEPageMotionPreset) {
  if (mode === "curl") return Math.min(motion.maxAngle, 74);
  if (mode === "peel") return Math.min(motion.maxAngle, 112);
  if (mode === "tear") return Math.min(motion.maxAngle, 148);
  return motion.maxAngle;
}

function getModeVisualProgress(mode: NSEPageMode, progress: number) {
  if (mode === "curl") return smoothNSEPageProgress(progress);
  if (mode === "peel") return easeOutNSEPageProgress(progress);
  if (mode === "tear") return smoothNSEPageProgress(progress);
  return progress;
}

function getShadowTransform(edge: NSEPageEdge, progress: number) {
  const drift = Math.round(14 * Math.sin(progress * Math.PI));
  if (edge === "left" || edge === "right") {
    return `translate3d(${edge === "right" ? -drift : drift}px, 8px, 0) scale(${1 + progress * 0.04})`;
  }
  return `translate3d(8px, ${edge === "bottom" ? -drift : drift}px, 0) scale(${1 + progress * 0.04})`;
}

function getCurlInset(edge: NSEPageEdge, progress: number) {
  const inset = `${Math.round((1 - progress) * 72)}%`;
  if (edge === "left") return `0 ${inset} 0 0`;
  if (edge === "right") return `0 0 0 ${inset}`;
  if (edge === "top") return `0 0 ${inset} 0`;
  return `${inset} 0 0 0`;
}

function pct(value: number) {
  return `${Number(value.toFixed(3))}%`;
}

/*
 * Curl fold model.
 *
 * The curl is modelled as a physical paper fold. At progress p the page
 * corner has travelled along a peel direction that rotates as the page comes
 * over, so the corner sweeps an arc rather than a straight line. The fold
 * line is the perpendicular bisector between the resting corner and the
 * curled corner. The flap is the page region beyond the fold line, mirrored
 * across it; its crease edge is bulged outward so the silhouette reads as a
 * cylindrical roll, and fold-aligned gradients supply the rim light, crease
 * shadow, roll highlight, and the cast shadow on the layer underneath.
 */

const CURL_DEFAULT_SIZE: NSEPageSize = { width: 480, height: 640 };
const CURL_TRAVEL_OVERDRIVE = 1.55;
const CURL_MAX_FOLD_RATIO = 0.6;
const CURL_DIRECTION_DRIFT = 0.65;
const CURL_DOG_EAR_RETIRE_START = 0.18;
const CURL_DOG_EAR_RETIRE_SPAN = 0.2;
const CURL_MIN_PROGRESS = 0.002;
const CURL_FRONT_OVERLAP_PX = 0.75;
const CURL_BACKSTOP_OVERLAP_PX = 14;
const CURL_RADIUS_MIN_PX = 26;
const CURL_RADIUS_MAX_PX = 78;
/** The tight roll over the curl's crest turns the paper this far before it opens out. */
const CURL_CREST_ANGLE = Math.PI * 0.55;
/** How much wider the open turn past the crest is than the crest itself. */
const CURL_OPEN_RATIO = 3;
/**
 * How fast the open turn loosens: its radius grows by this many px per px of
 * paper, so the leaf keeps curving all the way to its tip, as a held page
 * does, rather than straightening into a flat flap.
 */
const CURL_OPEN_GROWTH = 1;
/** How far short of face down a book leaf stands mid-turn, as a share of π. */
const CURL_BOOK_STAND = 0.18;
/**
 * How much of a dragged corner's rise a book leaf sheds by the time it lies
 * over the facing page: it squares up to the spine as it comes over.
 */
const CURL_BOOK_SQUARE = 0.85;
/** A book leaf's roll, as a share of its width, at the height of a turn. */
const CURL_BOOK_ROLL = 0.14;
/**
 * The tightest a lifted roll may become, in px: tighter, and its crease would
 * fall between the points the page is drawn with and turn jagged.
 */
const CURL_ROLL_MIN_PX = 14;
/** How far a bound leaf's bend line keeps from its spine. */
const CURL_SPINE_CLEARANCE_PX = 1;
const CURL_BULGE_SAMPLES = 12;
/* How much the canonical diagonal peel direction tempers a dragged pointer's
   raw direction, keeping the iOS up-and-over character under any drag. */
const CURL_DRAG_DIRECTION_BLEND = 0.5;
const CURL_MIN_INTERIOR_X = 0.08;
const CURL_MIN_INTERIOR_Y = 0.3;

interface CurlGeometryFields {
  frontClipPath: string;
  backstopClipPath: string;
  curlClipPath: string;
  curlFlapTransform: string;
  curlShadeBackground: string;
  curlShadowBackground: string;
  curlFlapShadowFilter: string;
  curlFlapDragShadowFilter: string;
  foldLine: NSEPageFoldLine;
  foldAngleDeg: number;
  curledCorner: NSEPagePoint;
  shadowOpacity: number;
  curlCylinder: NSEPageCurlCylinder | null;
}

function vecNormalize(v: NSEPagePoint): NSEPagePoint {
  const length = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / length, y: v.y / length };
}

function vecDot(a: NSEPagePoint, b: NSEPagePoint) {
  return a.x * b.x + a.y * b.y;
}

function getCurlCornerPoint(corner: NSEPageCorner, size: NSEPageSize): NSEPagePoint {
  return {
    x: corner.endsWith("left") ? 0 : size.width,
    y: corner.startsWith("top") ? 0 : size.height
  };
}

/**
 * How far (CSS px) the front face extends past the fold, under the flap, so no
 * hairline rasterisation seam opens along the crease. Expressed to hold a
 * constant ~2 device pixels of overlap at any density — on HiDPI a fixed CSS
 * overlap rasterises thinner, which is where the seam started to show. The
 * overlap is always hidden beneath the opaque flap, so this is invisible.
 */
function getCurlFrontOverlapPx(): number {
  const dpr = typeof window !== "undefined" && window.devicePixelRatio ? window.devicePixelRatio : 1;
  return Math.max(CURL_FRONT_OVERLAP_PX, 2 / dpr);
}

/**
 * Peel direction at progress p: starts on the page diagonal, drifting toward
 * vertical as the page comes over. At full curl the fold line crosses the
 * side and top edges, so the whole bottom edge lifts toward the far corner
 * (the iOS Maps pose).
 */
function getCurlPeelDirection(corner: NSEPageCorner, size: NSEPageSize, progress: number): NSEPagePoint {
  const sx = corner.endsWith("left") ? 1 : -1;
  const sy = corner.startsWith("top") ? 1 : -1;
  const diagonal = vecNormalize({ x: sx * size.width, y: sy * size.height });
  const drift = CURL_DIRECTION_DRIFT * smoothNSEPageProgress(progress);
  return vecNormalize({
    x: diagonal.x * (1 - drift),
    y: diagonal.y + (sy - diagonal.y) * drift
  });
}

/** Maps a dragged pointer (page-local px) to the equivalent curl progress. */
export function getNSEPageCurlDragProgress(
  pointer: NSEPagePoint,
  corner: NSEPageCorner,
  size: NSEPageSize
) {
  const cornerPoint = getCurlCornerPoint(corner, size);
  const diagonal = Math.hypot(size.width, size.height) || 1;
  const distance = Math.hypot(pointer.x - cornerPoint.x, pointer.y - cornerPoint.y);
  return clampNSEPageProgress(distance / (CURL_TRAVEL_OVERDRIVE * diagonal));
}

/** Sutherland-Hodgman clip of a polygon against the half-plane dot(q - planePoint, normal) >= 0. */
function clipPolygonHalfPlane(points: NSEPagePoint[], planePoint: NSEPagePoint, normal: NSEPagePoint): NSEPagePoint[] {
  const result: NSEPagePoint[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const currentSide = vecDot({ x: current.x - planePoint.x, y: current.y - planePoint.y }, normal);
    const nextSide = vecDot({ x: next.x - planePoint.x, y: next.y - planePoint.y }, normal);
    if (currentSide >= 0) result.push(current);
    if ((currentSide >= 0) !== (nextSide >= 0)) {
      const t = currentSide / (currentSide - nextSide);
      result.push({ x: current.x + (next.x - current.x) * t, y: current.y + (next.y - current.y) * t });
    }
  }
  return result;
}

/** Drops consecutive (and wrap-around) vertices closer than ~1/100 px — boundary clips emit duplicates. */
function dedupePolygon(points: NSEPagePoint[]): NSEPagePoint[] {
  const result: NSEPagePoint[] = [];
  for (const point of points) {
    const previous = result[result.length - 1];
    if (previous && Math.abs(previous.x - point.x) < 0.01 && Math.abs(previous.y - point.y) < 0.01) continue;
    result.push(point);
  }
  if (result.length > 1) {
    const first = result[0];
    const last = result[result.length - 1];
    if (Math.abs(first.x - last.x) < 0.01 && Math.abs(first.y - last.y) < 0.01) result.pop();
  }
  return result;
}

/**
 * Replaces the crease edge of the flap polygon with a quadratic arc. The arc
 * extends the polygon past the crease toward the page interior in local
 * (pre-mirror) space; the mirror maps that to an overhang beyond the fold
 * line on the revealed side — the roll silhouette covering the crease.
 *
 * The bulge is a single symmetric arc across the whole crease, so the lifted
 * sheet reads as one soft continuous curl rather than a stiff capped cone.
 * Both crease endpoints stay pinned on the page-boundary edges they are
 * shared with, so the flap's lifted edge never shears away from the front
 * clip.
 */
function bulgeCreaseEdge(
  points: NSEPagePoint[],
  foldFoot: NSEPagePoint,
  normal: NSEPagePoint,
  bulgePx: number
): NSEPagePoint[] {
  if (bulgePx <= 0.5 || points.length < 3) return points;
  const onCrease = points.map((point) =>
    Math.abs(vecDot({ x: point.x - foldFoot.x, y: point.y - foldFoot.y }, normal)) < 0.5
  );
  for (let index = 0; index < points.length; index += 1) {
    const nextIndex = (index + 1) % points.length;
    if (!onCrease[index] || !onCrease[nextIndex]) continue;
    const start = points[index];
    const end = points[nextIndex];
    if (Math.hypot(end.x - start.x, end.y - start.y) < 1) continue;
    const control = {
      x: (start.x + end.x) / 2 + normal.x * 2 * bulgePx,
      y: (start.y + end.y) / 2 + normal.y * 2 * bulgePx
    };
    const arc: NSEPagePoint[] = [];
    for (let sample = 1; sample <= CURL_BULGE_SAMPLES; sample += 1) {
      const t = sample / (CURL_BULGE_SAMPLES + 1);
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const c = t * t;
      arc.push({
        x: a * start.x + b * control.x + c * end.x,
        y: a * start.y + b * control.y + c * end.y
      });
    }
    const tail = nextIndex === 0 ? [] : points.slice(nextIndex);
    return [...points.slice(0, index + 1), ...arc, ...tail];
  }
  return points;
}

function polygonToClipPath(points: NSEPagePoint[], size: NSEPageSize) {
  if (points.length < 3) return "none";
  return `polygon(${points
    .map((point) => `${pct((point.x / size.width) * 100)} ${pct((point.y / size.height) * 100)}`)
    .join(", ")})`;
}

interface CurlGradientStop {
  offsetPx: number;
  colour: string;
}

/**
 * Builds a linear-gradient aligned with the fold: the gradient runs along
 * `direction` and its stops are positioned in absolute px relative to the
 * crease, projected onto the CSS gradient line for this box.
 */
function foldAlignedGradient(
  size: NSEPageSize,
  foldFoot: NSEPagePoint,
  direction: NSEPagePoint,
  stops: CurlGradientStop[]
): string {
  const angleRad = Math.atan2(direction.x, -direction.y);
  const angleDeg = Number(((angleRad * 180) / Math.PI).toFixed(2));
  const lineLength =
    Math.abs(size.width * Math.sin(angleRad)) + Math.abs(size.height * Math.cos(angleRad)) || 1;
  const center = { x: size.width / 2, y: size.height / 2 };
  const creaseOffset =
    vecDot({ x: foldFoot.x - center.x, y: foldFoot.y - center.y }, direction) + lineLength / 2;
  const cssStops = stops
    .map(({ offsetPx, colour }) => {
      const stop = Math.min(100, Math.max(0, ((creaseOffset + offsetPx) / lineLength) * 100));
      return `${colour} ${pct(stop)}`;
    })
    .join(", ");
  return `linear-gradient(${angleDeg}deg, ${cssStops})`;
}

function getCurlIdleFields(corner: NSEPagePoint): CurlGeometryFields {
  return {
    frontClipPath: "none",
    backstopClipPath: "none",
    curlClipPath: "none",
    curlFlapTransform: "none",
    curlShadeBackground: "none",
    curlShadowBackground: "none",
    curlFlapShadowFilter: "none",
    curlFlapDragShadowFilter: "none",
    foldLine: { x1: corner.x, y1: corner.y, x2: corner.x, y2: corner.y },
    foldAngleDeg: 0,
    curledCorner: { ...corner },
    shadowOpacity: 0,
    curlCylinder: null
  };
}

function resolveCurlFold(
  progress: number,
  corner: NSEPageCorner,
  motion: NSEPageMotionPreset,
  size: NSEPageSize,
  pointer?: NSEPagePoint
): CurlGeometryFields {
  const cornerPoint = getCurlCornerPoint(corner, size);
  if (progress < CURL_MIN_PROGRESS) return getCurlIdleFields(cornerPoint);

  const diagonal = Math.hypot(size.width, size.height);
  let peel = getCurlPeelDirection(corner, size, progress);
  let travel = progress * CURL_TRAVEL_OVERDRIVE * diagonal;
  let drive = progress;

  // While dragging, the fold chases the pointer in distance, and its
  // direction is the pointer direction blended with the canonical diagonal
  // peel — pure sideways or downward drags still read as a corner curl.
  if (pointer) {
    const dx = pointer.x - cornerPoint.x;
    const dy = pointer.y - cornerPoint.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 1) {
      travel = Math.min(distance, CURL_TRAVEL_OVERDRIVE * diagonal);
      drive = clampNSEPageProgress(travel / (CURL_TRAVEL_OVERDRIVE * diagonal));
      const sx = corner.endsWith("left") ? 1 : -1;
      const sy = corner.startsWith("top") ? 1 : -1;
      const canonical = getCurlPeelDirection(corner, size, drive);
      let ux = (dx / distance) * (1 - CURL_DRAG_DIRECTION_BLEND) + canonical.x * CURL_DRAG_DIRECTION_BLEND;
      let uy = (dy / distance) * (1 - CURL_DRAG_DIRECTION_BLEND) + canonical.y * CURL_DRAG_DIRECTION_BLEND;
      if (ux * sx < CURL_MIN_INTERIOR_X) ux = CURL_MIN_INTERIOR_X * sx;
      if (uy * sy < CURL_MIN_INTERIOR_Y) uy = CURL_MIN_INTERIOR_Y * sy;
      peel = vecNormalize({ x: ux, y: uy });
    }
  }

  const book = motion.curlPath === "book";
  if (book) {
    const sx = corner.endsWith("left") ? 1 : -1;
    const sy = corner.startsWith("top") ? 1 : -1;
    let dx: number, dy: number;
    if (pointer) {
      // The corner follows the finger anywhere the paper can reach while it
      // stays bound at the spine: no further from the spine's near end than the
      // page is wide, nor from its far end than the page's diagonal. A page
      // lifted straight up folds short and fat, as an iBooks page does.
      const spineX = corner.endsWith("left") ? size.width : 0;
      let target = { x: pointer.x, y: (pointer.y - cornerPoint.y) * sy < 0 ? cornerPoint.y : pointer.y };
      target = clampToCircle(target, { x: spineX, y: cornerPoint.y }, size.width - 2 * CURL_SPINE_CLEARANCE_PX);
      target = clampToCircle(target, { x: spineX, y: size.height - cornerPoint.y }, diagonal - 2 * CURL_SPINE_CLEARANCE_PX);
      dx = target.x - cornerPoint.x;
      dy = target.y - cornerPoint.y;
      if (dx * sx < 0) dx = 0;
      // A leaf brought over the spine squares up to its binding, as a turned
      // page does, rather than lying across the facing page folded askew.
      const across = Math.abs(dx) / (2 * size.width);
      dy *= 1 - CURL_BOOK_SQUARE * smoothNSEPageProgress(clampNSEPageProgress((across - 0.3) / 0.5));
    } else {
      const p = progress;
      const liftLimit = Math.min(size.height * .1, size.width * .2) * Math.sin(Math.PI * p);
      dx = sx * 2 * size.width * p;
      dy = sy * liftLimit;
    }
    travel = Math.hypot(dx, dy);
    drive = pointer ? clampNSEPageProgress(travel / (2 * size.width)) : progress;
    peel = travel > .001 ? { x: dx / travel, y: dy / travel } : { x: sx, y: 0 };
  }
  const foldDistance = book ? travel / 2 : Math.min(travel / 2, CURL_MAX_FOLD_RATIO * diagonal);
  return getCurlFoldFields(corner, peel, foldDistance, drive, motion, size, book);
}

/**
 * The flat fold that carries `corner` `foldDistance` px along `peel` and
 * back again: the front clipped at the fold line, the flap mirrored over it,
 * their shading and shadows, and the roll a 3D curl wraps the same fold round.
 */
function getCurlFoldFields(
  corner: NSEPageCorner,
  peel: NSEPagePoint,
  foldDistance: number,
  drive: number,
  motion: NSEPageMotionPreset,
  size: NSEPageSize,
  book: boolean
): CurlGeometryFields {
  const cornerPoint = getCurlCornerPoint(corner, size);
  const foldFoot = {
    x: cornerPoint.x + peel.x * foldDistance,
    y: cornerPoint.y + peel.y * foldDistance
  };
  const curledCorner = {
    x: cornerPoint.x + peel.x * foldDistance * 2,
    y: cornerPoint.y + peel.y * foldDistance * 2
  };
  const foldDirection = { x: -peel.y, y: peel.x };
  const foldAngleDeg = (Math.atan2(foldDirection.y, foldDirection.x) * 180) / Math.PI;

  const rectPolygon: NSEPagePoint[] = [
    { x: 0, y: 0 },
    { x: size.width, y: 0 },
    { x: size.width, y: size.height },
    { x: 0, y: size.height }
  ];

  // Front keeps everything on the interior side of the fold, with a slight
  // overlap toward the corner so no hairline gap opens under the flap.
  const frontOverlap = getCurlFrontOverlapPx();
  const frontFoot = {
    x: foldFoot.x - peel.x * frontOverlap,
    y: foldFoot.y - peel.y * frontOverlap
  };
  const frontPolygon = dedupePolygon(clipPolygonHalfPlane(rectPolygon, frontFoot, peel));
  // A simple opaque layer under the live front face gets a wider crease-side
  // buffer. If the clipped front and mirrored flap commit a frame apart on
  // Retina, the exposed strip is surface colour instead of the app backing.
  const backstopFoot = {
    x: foldFoot.x - peel.x * (book ? 1 : CURL_BACKSTOP_OVERLAP_PX),
    y: foldFoot.y - peel.y * (book ? 1 : CURL_BACKSTOP_OVERLAP_PX)
  };
  const backstopPolygon = dedupePolygon(clipPolygonHalfPlane(rectPolygon, backstopFoot, peel));

  // Flap: the page region beyond the fold, kept in local (pre-mirror) space
  // for the clip-path; the CSS mirror transform folds it across the crease.
  // It is deliberately NOT bounded to the page rect afterwards — a lifted
  // corner may overhang the page edges, and clipping it there amputates the
  // sheet's lower edge mid-curl.
  const flapLocal = dedupePolygon(clipPolygonHalfPlane(rectPolygon, foldFoot, { x: -peel.x, y: -peel.y }));

  // Roll radius grows with the turn. A thin sheet curls tightly, so the
  // radius is kept modest relative to the page — a small crisp dog-ear at
  // rest fattening to a soft roll as the page comes over, never a giant tube.
  const radius =
    lerpNSEPageValue(
      motion.curlRadiusMinPx ?? CURL_RADIUS_MIN_PX,
      motion.curlRadiusMaxPx ?? CURL_RADIUS_MAX_PX,
      smoothNSEPageProgress(drive)
    );
  const lift = Math.sin(Math.PI * Math.min(1, drive));
  const bulge = Math.min(radius * (book ? lift : (0.45 + 0.55 * lift)), foldDistance * 0.8);
  const flapPolygon = bulgeCreaseEdge(flapLocal, foldFoot, peel, bulge);

  // Pure 2D mirror across the fold line. The roll's depth is carried by the
  // bulged silhouette and fold-aligned shading instead of a 3D lean: any
  // out-of-plane rotation inside a preserve-3d stage makes the flap plane
  // intersect the front face plane and the browser slices one through the
  // other — the "content cutting through the paper" artifact.
  const mirror = `translate(${foldFoot.x.toFixed(2)}px, ${foldFoot.y.toFixed(2)}px) rotate(${foldAngleDeg.toFixed(3)}deg) scaleY(-1) rotate(${(-foldAngleDeg).toFixed(3)}deg) translate(${(-foldFoot.x).toFixed(2)}px, ${(-foldFoot.y).toFixed(2)}px)`;

  // Underside shading, painted in flap-local space along the wrapped paper:
  // a soft rim light on the roll band beyond the crease, a gentle crease
  // shadow at the fold, then the flat underside falling away.
  const intoFlap = { x: -peel.x, y: -peel.y };
  const shade = foldAlignedGradient(size, foldFoot, intoFlap, [
    { offsetPx: -(bulge + 2), colour: "rgba(255, 255, 255, 0)" },
    { offsetPx: -bulge * 0.45, colour: "rgba(255, 255, 255, 0.85)" },
    { offsetPx: 0, colour: "rgba(26, 34, 44, 0.30)" },
    { offsetPx: radius * 0.55, colour: "rgba(255, 255, 255, 0.45)" },
    { offsetPx: radius * 1.8, colour: "rgba(30, 38, 50, 0.10)" },
    { offsetPx: radius * 3.2, colour: "rgba(255, 255, 255, 0.04)" }
  ]);

  // Cast shadow straddling the crease — a firm dark contact core right at the
  // fold grounding the dog-ear on both the page surface and the revealed
  // layer beneath, spread into a broad soft penumbra on either side. The
  // reach has a wide floor so that even the small resting fold (where the
  // crease sits in the page corner) throws a shadow big enough to read,
  // rather than a thin sliver jammed against the page edge.
  // The reach keeps a wide floor for the small resting fold but barely grows
  // with the turn, so the opened pose does not sprawl a giant band across the
  // page beyond where the dog-ear actually is.
  const reach = 90 + radius * 0.4;
  const castShadow = foldAlignedGradient(size, foldFoot, peel, [
    { offsetPx: -(bulge + reach), colour: "rgba(6, 10, 18, 0)" },
    { offsetPx: -(bulge + reach * 0.42), colour: "rgba(6, 10, 18, 0.32)" },
    { offsetPx: -(bulge * 0.25), colour: "rgba(6, 10, 18, 0.72)" },
    { offsetPx: reach * 0.05, colour: "rgba(6, 10, 18, 0.72)" },
    { offsetPx: reach * 0.4, colour: "rgba(6, 10, 18, 0.3)" },
    { offsetPx: reach * 0.72, colour: "rgba(6, 10, 18, 0)" }
  ]);

  // Silhouette drop shadows. Offsets are pre-mirror: the flap's mirror flips
  // them back toward the revealed side of the crease. At rest the flap paper
  // covers the entire revealed region, hiding the fold-aligned cast shadow
  // beneath it — these shape-aware shadows are the only thing that can
  // ground the resting dog-ear, so the contact layer is strongest there: a
  // tight dark contact shadow hugging the silhouette plus a wider, softer
  // ambient layer that grows as the sheet lifts away from the surface.
  // The contact layer is projected clear of the dog-ear silhouette (a larger
  // offset than the paper-thickness lift would imply) so the shadow actually
  // reads from under the flap instead of hiding beneath it, and is kept dark
  // — at rest this is the whole grounding cue for the folded corner. The
  // ambient layer spreads wider and softer as the sheet lifts away.
  const contactDistance = 6 + 5 * lift;
  const contactBlur = 6 + 8 * lift;
  const contactAlpha = Number((Math.min(0.92, (1.5 - 0.45 * lift) * motion.shadowStrength)).toFixed(3));
  const ambientDistance = 11 + 18 * lift;
  const ambientBlur = 18 + 24 * lift;
  const ambientAlpha = Number((Math.min(0.7, (0.95 + 0.25 * lift) * motion.shadowStrength)).toFixed(3));
  const flapFilter =
    `drop-shadow(${(peel.x * contactDistance).toFixed(2)}px ${(peel.y * contactDistance).toFixed(2)}px ${contactBlur.toFixed(1)}px rgba(6, 10, 18, ${contactAlpha})) ` +
    `drop-shadow(${(peel.x * ambientDistance).toFixed(2)}px ${(peel.y * ambientDistance).toFixed(2)}px ${ambientBlur.toFixed(1)}px rgba(6, 10, 18, ${ambientAlpha}))`;
  // During pointer drags the flap's transform and clip change every frame. A
  // single, quantised drop-shadow preserves the contact cue while avoiding the
  // two large Retina filter rasters that were lagging the front face.
  const dragDistance = Math.round((contactDistance + lift * 3) * 2) / 2;
  const dragBlur = Math.round(Math.min(18, contactBlur + 4) * 2) / 2;
  const dragAlpha = Number(Math.min(0.86, contactAlpha + 0.08).toFixed(2));
  const flapDragFilter = `drop-shadow(${Math.round(peel.x * dragDistance)}px ${Math.round(peel.y * dragDistance)}px ${dragBlur.toFixed(1)}px rgba(6, 10, 18, ${dragAlpha}))`;

  // Shadow ramps in immediately — the resting dog-ear must already ground
  // itself with a firm cast shadow on both the page and the layer beneath —
  // then deepens through the turn and holds while open. This opacity gates
  // ONLY the curl cast-shadow gradient (the silhouette drop shadow carries
  // its own alpha, and the flap's mirror throws it off-page at the resting
  // corner anyway), so it is driven well above the preset shadowStrength: at
  // the small resting fold the cast gradient is the only grounding cue that
  // actually lands on visible surface, and it must read clearly.
  const shadowRamp = Math.min(1, drive / 0.025);
  const shadowDepth = Math.sin((Math.PI / 2) * Math.min(1, drive / 0.82));
  // The cast gradient is boosted hardest at the resting fold — where the
  // flap's own silhouette-hugging drop shadow is thrown off-page and this is
  // the only grounding cue on visible surface — then eased back toward the
  // preset strength as the page opens, so the opened pose is grounded by the
  // shape-aware flap shadow that follows the curl, not a broad straight band.
  const castBoost = lerpNSEPageValue(1.55, 0.9, smoothNSEPageProgress(Math.min(1, drive / 0.4)));
  const shadowOpacity = Number(Math.min(1, motion.shadowStrength * castBoost * shadowRamp * (0.92 + 0.08 * shadowDepth)).toFixed(4));
  // Offsets are in the reflected flap's local coordinates: counter the
  // reflection so the shadow falls toward the receiving page, in either turn.
  const bookShadowAlpha = Number((Math.min(.44, motion.shadowStrength * 1.8) * shadowRamp * Math.min(1, (1 - drive) / .12)).toFixed(3));
  const shadowDistance = 5 + lift * 13;
  const shadowWorld = { x: (corner.endsWith("left") ? 1 : -1) * shadowDistance, y: shadowDistance * .7 };
  const shadowDot = shadowWorld.x * peel.x + shadowWorld.y * peel.y;
  const bookShadow = `drop-shadow(${(shadowWorld.x - 2 * shadowDot * peel.x).toFixed(1)}px ${(shadowWorld.y - 2 * shadowDot * peel.y).toFixed(1)}px ${(4 + lift * 9).toFixed(1)}px rgba(38, 28, 15, ${bookShadowAlpha}))`;

  return {
    frontClipPath: book && drive >= .9999 ? "polygon(0 0, 0 0, 0 0)" : polygonToClipPath(frontPolygon, size),
    backstopClipPath: book && drive >= .9999 ? "polygon(0 0, 0 0, 0 0)" : polygonToClipPath(backstopPolygon, size),
    curlClipPath: polygonToClipPath(flapPolygon, size),
    curlFlapTransform: mirror,
    curlShadeBackground: shade,
    curlShadowBackground: castShadow,
    curlFlapShadowFilter: book ? bookShadow : flapFilter,
    curlFlapDragShadowFilter: book ? bookShadow : flapDragFilter,
    foldLine: getFoldLineEndpoints(foldFoot, foldDirection, size),
    foldAngleDeg: Number(foldAngleDeg.toFixed(3)),
    curledCorner: { x: Number(curledCorner.x.toFixed(2)), y: Number(curledCorner.y.toFixed(2)) },
    shadowOpacity: book ? shadowOpacity * Math.sin(Math.PI * drive) : shadowOpacity,
    // A book leaf stands up off the page in a broad, cone-shaped roll, as an
    // iBooks page does, nearly a fifth of its width across, and lies down
    // again as it lands.
    curlCylinder: getCurlCylinder(foldFoot, peel, foldDistance, book
      ? {
          radius: Math.max(motion.curlRadiusMaxPx ?? CURL_RADIUS_MAX_PX, size.width * CURL_BOOK_ROLL) * Math.sqrt(lift),
          sweep: Math.PI * (1 - CURL_BOOK_STAND * lift)
        }
      : { radius, sweep: Math.PI }, book ? getCurlSpine(corner, size) : null)
  };
}

/**
 * The cylinder that reproduces this fold. The flat model mirrors the corner
 * across the fold line onto the pointer; wrapping the same paper round a roll
 * of radius r lands it there too when the bend line sits πr/2 inside the fold
 * line, so the 3D curl tracks the drag exactly as the flat one does.
 */
function clampToCircle(point: NSEPagePoint, centre: NSEPagePoint, radius: number): NSEPagePoint {
  const dx = point.x - centre.x, dy = point.y - centre.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= radius || distance < 1e-6) return point;
  return { x: centre.x + (dx / distance) * radius, y: centre.y + (dy / distance) * radius };
}

/** The bound edge of a book leaf: the side opposite the turning corner. */
function getCurlSpine(corner: NSEPageCorner, size: NSEPageSize): readonly NSEPagePoint[] {
  const x = corner.endsWith("left") ? size.width : 0;
  return [{ x, y: 0 }, { x, y: size.height }];
}

/**
 * How far inside the fold line the bend line sits so the corner lands on the
 * point the flat fold mirrors it to: b + X(d - b) = -d, with b the bend's
 * offset and d the corner's, both measured from the fold line towards the
 * corner. The left side only grows as b does, so a bisection finds it.
 */
function getCurlBendInset(foldDistance: number, radius: number, sweep: number): number {
  const landing = (bend: number) => bend + getNSEPageCurlProfile(foldDistance - bend, radius, sweep).x + foldDistance;
  let low = -foldDistance - radius * 4 - 1;
  for (let step = 0; step < 32 && landing(low) > 0; step += 1) low *= 2;
  let high = 0;
  for (let step = 0; step < 40; step += 1) {
    const middle = (low + high) / 2;
    if (landing(middle) > 0) high = middle;
    else low = middle;
  }
  return -(low + high) / 2;
}

function getCurlCylinder(
  foldFoot: NSEPagePoint,
  peel: NSEPagePoint,
  foldDistance: number,
  roll: { radius: number; sweep: number },
  spine: readonly NSEPagePoint[] | null
): NSEPageCurlCylinder {
  let { radius } = roll;
  const { sweep } = roll;
  let inset = getCurlBendInset(foldDistance, radius, sweep);
  if (spine) {
    // A bound leaf never lifts at its spine. The fold line already keeps clear
    // of it; the roll's bend line sits further in, so where it would reach the
    // spine the roll tightens, though never into a crease, and past that the
    // bend holds at the spine and the corner falls just short of the finger.
    // The leaf stays a rolled sheet of paper rather than folding flat.
    const allowed = Math.max(0, Math.min(...spine.map((point) => vecDot({ x: point.x - foldFoot.x, y: point.y - foldFoot.y }, peel))) - CURL_SPINE_CLEARANCE_PX);
    if (inset > allowed) {
      const tightest = Math.min(radius, Math.max(CURL_ROLL_MIN_PX, radius * 0.5));
      let low = tightest, high = radius;
      for (let step = 0; step < 24; step += 1) {
        const middle = (low + high) / 2;
        if (getCurlBendInset(foldDistance, middle, sweep) <= allowed) low = middle;
        else high = middle;
      }
      radius = low;
      inset = Math.min(getCurlBendInset(foldDistance, radius, sweep), allowed);
    }
  }
  return {
    bendX: foldFoot.x + peel.x * inset,
    bendY: foldFoot.y + peel.y * inset,
    normalX: -peel.x,
    normalY: -peel.y,
    radius,
    sweep
  };
}

/**
 * The cross-section of a curl: paper `length` px past the bend line, rolled
 * tightly over its crest, then opening into an ever looser turn (a spiral
 * whose radius grows steadily with the paper) until it reaches `sweep`, and
 * running straight on from there. Returns the distance back along the page (`x`, towards the corner
 * while positive), the height above the page and the paper's turn angle. The
 * curl's vertex shader computes the same profile.
 */
export function getNSEPageCurlProfile(length: number, radius: number, sweep: number) {
  if (radius <= 0.5) {
    return { x: length * Math.cos(sweep), z: Math.max(length * Math.sin(sweep), 0.5), angle: sweep };
  }
  const crest = Math.min(sweep, CURL_CREST_ANGLE);
  if (length < radius * crest) {
    const angle = length / radius;
    return { x: radius * Math.sin(angle), z: radius * (1 - Math.cos(angle)), angle };
  }
  const crestX = radius * Math.sin(crest);
  const crestZ = radius * (1 - Math.cos(crest));
  const open = radius * CURL_OPEN_RATIO;
  const rest = length - radius * crest;
  // Radius open + g·s turns the paper by ln(1 + g·s/open)/g; its position has
  // a closed form in u = 1 + g·s/open.
  const g = CURL_OPEN_GROWTH;
  const k = 1 / g;
  const scale = open / g / (1 + k * k);
  const spiral = (u: number) => {
    const angle = crest + k * Math.log(u);
    const c = Math.cos(angle), s = Math.sin(angle);
    return {
      x: crestX + scale * (u * (c + k * s) - (Math.cos(crest) + k * Math.sin(crest))),
      z: crestZ + scale * (u * (s - k * c) - (Math.sin(crest) - k * Math.cos(crest))),
      angle,
    };
  };
  const end = Math.exp((sweep - crest) * g);
  const openLength = open * (end - 1) / g;
  if (rest < openLength) return spiral(1 + (g * rest) / open);
  const last = spiral(end);
  const straight = rest - openLength;
  return { x: last.x + straight * Math.cos(sweep), z: Math.max(last.z + straight * Math.sin(sweep), 0.5), angle: sweep };
}

/**
 * Where a page point sits once the page curls round `cylinder`: the paper
 * stays flat up to the bend line, then follows the curl's profile, its roll
 * widening away from the corner. Returns page px plus height above the page,
 * and the paper's turn angle (0 flat, π face down). The curl's vertex shader
 * computes the same mapping.
 */
export function projectNSEPageCurlPoint(point: NSEPagePoint, cylinder: NSEPageCurlCylinder) {
  const normal = { x: cylinder.normalX, y: cylinder.normalY };
  const along = vecDot({ x: point.x - cylinder.bendX, y: point.y - cylinder.bendY }, normal);
  if (along <= 0) return { x: point.x, y: point.y, z: 0, angle: 0 };
  const base = { x: point.x - normal.x * along, y: point.y - normal.y * along };
  const profile = getNSEPageCurlProfile(along, cylinder.radius, cylinder.sweep);
  return { x: base.x + normal.x * profile.x, y: base.y + normal.y * profile.x, z: profile.z, angle: profile.angle };
}

/** Intersects the infinite fold line with the page bounds. */
function getFoldLineEndpoints(
  foldFoot: NSEPagePoint,
  foldDirection: NSEPagePoint,
  size: NSEPageSize
): NSEPageFoldLine {
  const candidates: number[] = [];
  if (Math.abs(foldDirection.x) > 1e-6) {
    candidates.push((0 - foldFoot.x) / foldDirection.x, (size.width - foldFoot.x) / foldDirection.x);
  }
  if (Math.abs(foldDirection.y) > 1e-6) {
    candidates.push((0 - foldFoot.y) / foldDirection.y, (size.height - foldFoot.y) / foldDirection.y);
  }
  const onPage = candidates
    .map((s) => ({ s, x: foldFoot.x + foldDirection.x * s, y: foldFoot.y + foldDirection.y * s }))
    .filter((point) => point.x >= -0.01 && point.x <= size.width + 0.01 && point.y >= -0.01 && point.y <= size.height + 0.01)
    .sort((a, b) => a.s - b.s);
  if (onPage.length < 2) {
    return { x1: foldFoot.x, y1: foldFoot.y, x2: foldFoot.x, y2: foldFoot.y };
  }
  const first = onPage[0];
  const last = onPage[onPage.length - 1];
  return {
    x1: Number(first.x.toFixed(2)),
    y1: Number(first.y.toFixed(2)),
    x2: Number(last.x.toFixed(2)),
    y2: Number(last.y.toFixed(2))
  };
}


export function resolveNSEPageGeometry(input: NSEPageGeometryInput): NSEPageGeometry {
  const progress = clampNSEPageProgress(input.torn ? 1 : input.progress);
  const visualProgress = getModeVisualProgress(input.mode, progress);
  const axis = getNSEPageAxis(input.edge);
  const isTear = input.mode === "tear";
  const corner = input.corner ?? (isTear ? getNSEPageTearDefaultCorner(input.edge) : getNSEPageDefaultCorner(input.edge));
  const size = input.size ?? CURL_DEFAULT_SIZE;
  const isCurl = input.mode === "curl";
  const reduced = input.reducedMotion === true;
  // A tear lies flat in the page's own layers; the sheet's rip and flight are
  // drawn over it.
  const tearSheet = isTear && !reduced && progress > CURL_MIN_PROGRESS
    ? resolveTearSheet(progress, corner, input.edge, input.motion, size, input.tearSeed ?? 1, input.pointer)
    : null;
  const hingeEdge = getNSEPageHingeEdge(input.edge, input.motion.hinge);
  const isBookTurn = input.motion.hinge === "opposite-edge";
  const signedDirection = isBookTurn
    ? getNSEPageBookSignedDirection(input.edge)
    : getNSEPageSignedDirection(input.edge, input.direction);
  const curl = progress === 0 || progress === 1 ? 0 : Math.sin(progress * Math.PI);
  const unsignedAngle = getModeAngle(input.mode, input.motion) * visualProgress;
  const signedAngle = unsignedAngle * signedDirection;
  const liftPx = curl * input.motion.liftPx;
  const rotate = axis === "y" ? `rotateY(${signedAngle.toFixed(3)}deg)` : `rotateX(${signedAngle.toFixed(3)}deg)`;
  const sheetTransform = isCurl || isTear
    ? "translate3d(0.000px, 0.000px, 0)"
    : isBookTurn
      ? `${rotate} translate3d(0.000px, 0.000px, ${liftPx.toFixed(3)}px)`
      : `perspective(${input.motion.perspective}px) ${rotate} translate3d(0.000px, 0.000px, ${liftPx.toFixed(3)}px)`;
  const creaseOpacity = Number((Math.sin(progress * Math.PI) * input.motion.curlStrength).toFixed(4));
  const phase = input.phase ?? "idle";

  const fold = tearSheet?.fold ?? (isCurl && !reduced
    ? resolveCurlFold(progress, corner, input.motion, size, input.pointer)
    : getCurlIdleFields(getCurlCornerPoint(corner, size)));

  const shadowOpacity = isCurl || isTear
    ? fold.shadowOpacity
    : Number((curl * input.motion.shadowStrength).toFixed(4));
  const crossfade = smoothNSEPageProgress(progress);
  const frontOpacity = isCurl || isTear
    ? reduced
      ? Number((1 - crossfade).toFixed(4))
      : 1
    : progress >= 0.92 && input.mode !== "peel" ? 0 : 1;
  // In curl mode the revealed layer is genuinely underneath the paper, so it
  // stays fully opaque — fading it in greys out the reveal mid-drag.
  const insideOpacity = isCurl || isTear || isBookTurn
    ? reduced
      ? Number(crossfade.toFixed(4))
      : 1
    : Number(lerpNSEPageValue(0.06, 1, smoothNSEPageProgress(progress)).toFixed(4));
  // The dog-ear is the resting fold itself; this signal only gates the
  // invisible corner hit-area, retiring it once the page is properly open.
  const dogEarOpacity = isCurl
    ? reduced ? 1 : Number(clampNSEPageProgress(1 - Math.max(0, progress - CURL_DOG_EAR_RETIRE_START) / CURL_DOG_EAR_RETIRE_SPAN).toFixed(4))
    : 0;

  const insideInteractive = isBookTurn
    ? phase === "idle" && progress >= input.motion.revealThreshold
    : progress >= input.motion.revealThreshold || input.torn === true;

  return {
    progress,
    visualProgress,
    axis,
    edge: input.edge,
    corner,
    direction: input.direction,
    mode: input.mode,
    phase,
    reduced,
    bookTurn: isBookTurn,
    hingeEdge,
    projection: input.motion.projection ?? "contained",
    size,
    signedAngle,
    unsignedAngle,
    curl,
    liftPx,
    shadowOpacity,
    creaseOpacity,
    frontOpacity,
    backOpacity: progress <= 0.02 ? 0 : 1,
    insideOpacity,
    insideInteractive,
    torn: input.torn === true || phase === "torn",
    transformOrigin: getNSEPageTransformOrigin(hingeEdge),
    sheetTransform,
    backFaceTransform: getNSEPageBackFaceTransform(axis),
    shadowTransform: isBookTurn ? "none" : getShadowTransform(input.edge, progress),
    curlInset: getCurlInset(input.edge, progress),
    frontClipPath: isCurl || tearSheet?.fold ? fold.frontClipPath : "inset(0)",
    backstopClipPath: fold.backstopClipPath,
    curlClipPath: fold.curlClipPath,
    curlFlapTransform: fold.curlFlapTransform,
    curlShadeBackground: fold.curlShadeBackground,
    curlShadowBackground: fold.curlShadowBackground,
    curlFlapShadowFilter: fold.curlFlapShadowFilter,
    curlFlapDragShadowFilter: fold.curlFlapDragShadowFilter,
    foldLine: fold.foldLine,
    foldAngleDeg: fold.foldAngleDeg,
    curledCorner: tearSheet?.curledCorner ?? fold.curledCorner,
    dogEarOpacity,
    curlCylinder: tearSheet ? tearSheet.curlCylinder : fold.curlCylinder,
    tear: tearSheet?.tear ?? null,
    tearStubClipPath: (tearSheet?.flat ?? NSE_PAGE_TEAR_FLAT_IDLE).stubClipPath,
    tearSheetTransform: (tearSheet?.flat ?? NSE_PAGE_TEAR_FLAT_IDLE).sheetTransform,
    tearSheetOpacity: (tearSheet?.flat ?? NSE_PAGE_TEAR_FLAT_IDLE).sheetOpacity
  };
}

export function createNSEPageSnapshot(options: {
  progress?: number;
  targetProgress?: number;
  phase?: NSEPagePhase;
  mode: NSEPageMode;
  edge: NSEPageEdge;
  direction: NSEPageDirection;
  torn?: boolean;
  reason?: NSEPageCompletionReason;
  turnId?: string | number;
}): NSEPageControllerSnapshot {
  const progress = clampNSEPageProgress(options.progress ?? 0);
  return {
    progress,
    targetProgress: clampNSEPageProgress(options.targetProgress ?? progress),
    phase: options.phase ?? "idle",
    mode: options.mode,
    edge: options.edge,
    direction: options.direction,
    torn: Boolean(options.torn),
    reason: options.reason ?? "programmatic",
    turnId: options.turnId ?? DEFAULT_TURN_ID,
    updatedAt: Date.now()
  };
}

export function getNSEPageGeometryStyle(
  geometry: NSEPageGeometry,
  input: Pick<NSEPageGeometryInput, "motion" | "material">,
  style?: CSSProperties
): NSEPageStyle {
  return {
    "--nse-page-progress": geometry.progress,
    "--nse-page-visual-progress": geometry.visualProgress,
    "--nse-page-angle": `${geometry.signedAngle.toFixed(3)}deg`,
    "--nse-page-perspective": `${input.motion.perspective}px`,
    "--nse-page-lift": `${geometry.liftPx.toFixed(3)}px`,
    "--nse-page-transform-origin": geometry.transformOrigin,
    "--nse-page-sheet-transform": geometry.sheetTransform,
    "--nse-page-face-back-transform": geometry.backFaceTransform,
    "--nse-page-shadow-transform": geometry.shadowTransform,
    "--nse-page-shadow-opacity": geometry.shadowOpacity,
    "--nse-page-crease-opacity": geometry.creaseOpacity,
    "--nse-page-tear-stub-clip-path": geometry.tearStubClipPath,
    "--nse-page-tear-sheet-transform": geometry.tearSheetTransform,
    "--nse-page-tear-sheet-opacity": geometry.tearSheetOpacity,
    "--nse-page-front-opacity": geometry.frontOpacity,
    "--nse-page-back-opacity": geometry.backOpacity,
    "--nse-page-inside-opacity": geometry.insideOpacity,
    "--nse-page-curl-inset": geometry.curlInset,
    "--nse-page-front-clip-path": geometry.frontClipPath,
    "--nse-page-backstop-clip-path": geometry.backstopClipPath,
    "--nse-page-curl-clip-path": geometry.curlClipPath,
    "--nse-page-curl-flap-transform": geometry.curlFlapTransform,
    "--nse-page-curl-shade": geometry.curlShadeBackground,
    "--nse-page-curl-shadow": geometry.curlShadowBackground,
    "--nse-page-curl-flap-filter": geometry.curlFlapShadowFilter,
    "--nse-page-curl-flap-drag-filter": geometry.curlFlapDragShadowFilter,
    "--nse-page-fold-angle": `${geometry.foldAngleDeg.toFixed(3)}deg`,
    "--nse-page-dogear-opacity": geometry.dogEarOpacity,
    "--nse-page-duration": `${input.motion.durationMs}ms`,
    "--nse-page-reduced-duration": `${input.motion.reducedDurationMs}ms`,
    "--nse-page-ease": input.motion.easing,
    "--nse-page-background": input.material.background,
    "--nse-page-back-background": input.material.backBackground,
    "--nse-page-inside-background": input.material.insideBackground,
    "--nse-page-colour": input.material.colour,
    "--nse-page-radius": input.material.radius,
    "--nse-page-thickness": `${input.material.thicknessPx}px`,
    "--nse-page-shadow-colour": input.material.shadowColour,
    "--nse-page-highlight-colour": input.material.highlightColour,
    "--nse-page-edge-colour": input.material.edgeColour,
    "--nse-page-grain-opacity": input.material.grainOpacity,
    ...style
  };
}
/*
 * Tear model.
 *
 * A sheet bound along one edge is torn from it as a page is torn from a pad.
 * It is taken by its free corner and curls up and over towards the opposite
 * corner, exactly as a curl does, until it has folded right over onto the far
 * half of the page. The binding never lifts: the corner can reach no further
 * from any bound point than the paper between them allows. Pulled on past
 * that, the paper gives along a ragged line a little below the binding,
 * starting at the end the fold reaches first; the rip runs on ahead of the
 * fold, as torn paper does, leaving a stub of paper bound in place. Once the
 * rip reaches the far end the sheet is free, and flies on along the pull,
 * opening out and turning as it goes.
 *
 * Positions along the binding (s) run from its start (its left or top end),
 * and depths (n) from the binding into the page.
 */

/** Where in a tear's progress the sheet has folded over onto the far half and the binding gives. */
export const NSE_PAGE_TEAR_RIP_AT = 0.46;
/** Where the rip reaches the far end of the binding and the sheet is free. */
export const NSE_PAGE_TEAR_FREE_AT = 0.66;
/** How far past the paper's reach a finger pulls before the binding gives, in px. */
const TEAR_RESIST_PX = 24;
/** How much faster the rip runs along the binding than the fold that opens it. */
const TEAR_RIP_LEAD = 2.6;
/** The tear line's mean depth, as a share of the page across the binding, within these px. */
const TEAR_DEPTH_SHARE = 0.018;
const TEAR_DEPTH_MIN_PX = 7;
const TEAR_DEPTH_MAX_PX = 13;
/** How far the tear line wanders either side of its mean depth, in px. */
const TEAR_ROUGHNESS_PX = 3.4;
/** How much the corner-to-corner pull tempers a finger's own. */
const TEAR_PULL_BLEND = 0.35;
/** The least a pull may run along the binding, so the rip always travels. */
const TEAR_MIN_ALONG = 0.3;
/** The least a far corner's pull may head towards the binding. */
const TEAR_MIN_TOWARDS = 0.3;
/** How far short of face down the folded sheet stands, as a share of π. */
const TEAR_STAND = 0.12;

interface TearFrame {
  /** The binding's length and the page's extent across it. */
  readonly length: number;
  readonly extent: number;
  readonly toPage: (s: number, n: number) => NSEPagePoint;
  readonly toLocal: (point: NSEPagePoint) => { s: number; n: number };
}

function getTearFrame(binding: NSEPageEdge, size: NSEPageSize): TearFrame {
  const { width, height } = size;
  if (binding === "top") return { length: width, extent: height, toPage: (s, n) => ({ x: s, y: n }), toLocal: (p) => ({ s: p.x, n: p.y }) };
  if (binding === "bottom") return { length: width, extent: height, toPage: (s, n) => ({ x: s, y: height - n }), toLocal: (p) => ({ s: p.x, n: height - p.y }) };
  if (binding === "left") return { length: height, extent: width, toPage: (s, n) => ({ x: n, y: s }), toLocal: (p) => ({ s: p.y, n: p.x }) };
  return { length: height, extent: width, toPage: (s, n) => ({ x: width - n, y: s }), toLocal: (p) => ({ s: p.y, n: width - p.x }) };
}

function tearHash(index: number, seed: number) {
  const value = Math.sin(index * 12.9898 + seed * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function tearNoise(x: number, seed: number) {
  const index = Math.floor(x);
  const fraction = x - index;
  const eased = fraction * fraction * (3 - 2 * fraction);
  const a = tearHash(index, seed), b = tearHash(index + 1, seed);
  return (a + (b - a) * eased) * 2 - 1;
}

/**
 * How deep the tear line runs below the binding at `s` px along it: a ragged
 * line wandering about `depth`, coarse and fine at once, as torn paper is.
 * The curl's fragment shader computes the same line.
 */
export function getNSEPageTearLine(s: number, depth: number, roughness: number, seed: number) {
  return depth + roughness * (
    0.6 * tearNoise(s / 41, seed) +
    0.28 * tearNoise(s / 12.5, seed + 1.7) +
    0.12 * tearNoise(s / 3.4, seed + 3.1)
  );
}

/** The corner a sheet bound along `binding` is torn from by default: the far one, on the right. */
export function getNSEPageTearDefaultCorner(binding: NSEPageEdge): NSEPageCorner {
  if (binding === "top") return "bottom-right";
  if (binding === "bottom") return "top-right";
  if (binding === "left") return "bottom-right";
  return "bottom-left";
}

interface TearPull {
  readonly frame: TearFrame;
  /** Whether the rip opens at the binding's start (s = 0) rather than its end. */
  readonly nearStart: boolean;
  readonly depth: number;
  /** The held corner, in (along the binding from its near end, depth), and whether it lies across the page from the binding. */
  readonly corner: { a: number; n: number };
  readonly farCorner: boolean;
  /** The pull, a unit vector along the binding from its near end and in depth. */
  readonly along: number;
  readonly towards: number;
  readonly resist: number;
  /** Travel along the pull at which the fold reaches the binding, and at which the sheet is free. */
  readonly reach: number;
  readonly free: number;
}

function resolveTearPull(binding: NSEPageEdge, corner: NSEPageCorner, size: NSEPageSize, resist: number, pointer?: NSEPagePoint): TearPull {
  const frame = getTearFrame(binding, size);
  const cornerLocal = frame.toLocal(getCurlCornerPoint(corner, size));
  const nearStart = cornerLocal.s < frame.length / 2;
  const toAlong = (s: number) => nearStart ? s : frame.length - s;
  const depth = Math.min(TEAR_DEPTH_MAX_PX, Math.max(TEAR_DEPTH_MIN_PX, frame.extent * TEAR_DEPTH_SHARE));
  // A corner on the binding is held just below its stub.
  const held = { a: 0, n: Math.max(cornerLocal.n, depth + TEAR_ROUGHNESS_PX) };
  const farCorner = held.n > frame.extent / 2;
  // From the corner held towards the opposite one: the fold reaches the
  // binding as it lies along the page's other diagonal, the sheet folded
  // over onto the far half.
  const canonical = vecNormalize(farCorner ? { x: frame.extent, y: -frame.length } : { x: 1, y: 0.5 });
  let direction = canonical;
  if (pointer) {
    const finger = frame.toLocal(pointer);
    // A corner on the binding is pulled from below its stub.
    const dx = toAlong(finger.s) - held.a, dy = (farCorner ? finger.n : Math.max(finger.n, held.n)) - held.n;
    const distance = Math.hypot(dx, dy);
    if (distance > 1) {
      direction = vecNormalize({
        x: (dx / distance) * (1 - TEAR_PULL_BLEND) + canonical.x * TEAR_PULL_BLEND,
        y: (dy / distance) * (1 - TEAR_PULL_BLEND) + canonical.y * TEAR_PULL_BLEND
      });
    }
  }
  const unit = vecNormalize({
    x: Math.max(direction.x, TEAR_MIN_ALONG),
    y: farCorner ? Math.min(direction.y, -TEAR_MIN_TOWARDS) : direction.y
  });
  // The fold, the perpendicular bisector of the corner and where it is
  // carried, crosses a bound point once the corner has travelled twice that
  // point's distance along the pull.
  const reach = Math.max(0, 2 * (depth - held.n) * unit.y);
  const free = resist + reach + (2 * unit.x * frame.length) / TEAR_RIP_LEAD;
  return { frame, nearStart, depth, corner: held, farCorner, along: unit.x, towards: unit.y, resist, reach, free };
}

/** Travel along the pull for a tear's progress, up to the moment the sheet is free. */
function getTearTravel(pull: TearPull, progress: number) {
  const rip = pull.reach + pull.resist;
  if (progress <= NSE_PAGE_TEAR_RIP_AT) return rip * (progress / NSE_PAGE_TEAR_RIP_AT);
  return rip + (pull.free - rip) * Math.min(1, (progress - NSE_PAGE_TEAR_RIP_AT) / (NSE_PAGE_TEAR_FREE_AT - NSE_PAGE_TEAR_RIP_AT));
}

function getTearProgress(pull: TearPull, travel: number) {
  const rip = pull.reach + pull.resist;
  if (travel <= rip) return NSE_PAGE_TEAR_RIP_AT * (travel / Math.max(rip, 1e-6));
  return NSE_PAGE_TEAR_RIP_AT + (NSE_PAGE_TEAR_FREE_AT - NSE_PAGE_TEAR_RIP_AT) * Math.min(1, (travel - rip) / Math.max(pull.free - rip, 1e-6));
}

/** How far a finger has carried the corner along the pull. */
function getFingerTravel(pull: TearPull, pointer: NSEPagePoint) {
  const finger = pull.frame.toLocal(pointer);
  const along = pull.nearStart ? finger.s : pull.frame.length - finger.s;
  const depth = pull.farCorner ? finger.n : Math.max(finger.n, pull.corner.n);
  return Math.max(0, (along - pull.corner.a) * pull.along + (depth - pull.corner.n) * pull.towards);
}

/** Maps a finger pulling a sheet's corner to the tear's progress. */
export function getNSEPageTearDragProgress(
  pointer: NSEPagePoint,
  corner: NSEPageCorner,
  size: NSEPageSize,
  binding: NSEPageEdge,
  _motion?: NSEPageMotionPreset
) {
  const pull = resolveTearPull(binding, corner, size, TEAR_RESIST_PX, pointer);
  return clampNSEPageProgress(getTearProgress(pull, getFingerTravel(pull, pointer)));
}

/**
 * Whether a finger at `point` takes hold of a sheet to tear it: near the
 * corner it tears from, along either edge that meets there, out to half the
 * page.
 */
export function isNSEPageTearGrab(point: NSEPagePoint, corner: NSEPageCorner, size: NSEPageSize, _binding: NSEPageEdge, reach: number) {
  const held = getCurlCornerPoint(corner, size);
  const across = Math.abs(point.x - held.x), down = Math.abs(point.y - held.y);
  if (point.x < -reach || point.y < -reach || point.x > size.width + reach || point.y > size.height + reach) return false;
  return (across <= reach && down <= size.height / 2) || (down <= reach && across <= size.width / 2);
}

/**
 * How far past the page a tear's canvas must reach on each side to hold the
 * sheet wherever it is seen: folded over and flying off, steered by any
 * finger, as the camera at `perspective` sees it.
 */
export function getNSEPageTearMargin(binding: NSEPageEdge, corner: NSEPageCorner, size: NSEPageSize, perspective = 1600) {
  const { width, height } = size;
  const focal = Math.max(perspective, Math.max(width, height) * 2.6);
  const held = getCurlCornerPoint(corner, size);
  const fingers: Array<NSEPagePoint | undefined> = [
    undefined,
    { x: width - held.x, y: height - held.y },
    { x: width - held.x, y: held.y },
    { x: held.x, y: height - held.y },
    { x: width / 2, y: height / 2 }
  ];
  const reach = { left: 0, top: 0, right: 0, bottom: 0 };
  for (const finger of fingers) {
    for (let step = 1; step <= 40; step += 1) {
      const sheet = resolveTearSheet(step / 40, corner, binding, { curlRadiusMaxPx: CURL_RADIUS_MAX_PX } as NSEPageMotionPreset, size, 1, finger);
      const { flight } = sheet.tear;
      if (!sheet.curlCylinder || flight.opacity <= 0.01) continue;
      const cos = Math.cos(flight.spin), sin = Math.sin(flight.spin);
      for (let u = 0; u <= 1.0001; u += 0.125) {
        for (const point of [{ x: u * width, y: 0 }, { x: u * width, y: height }, { x: 0, y: u * height }, { x: width, y: u * height }]) {
          const curled = projectNSEPageCurlPoint(point, sheet.curlCylinder);
          const rx = curled.x - flight.pivotX, ry = curled.y - flight.pivotY;
          const x = flight.pivotX + cos * rx - sin * ry + flight.x;
          const y = flight.pivotY + sin * rx + cos * ry + flight.y;
          const scale = focal / Math.max(focal - curled.z - flight.z, 1);
          const seenX = width / 2 + (x - width / 2) * scale;
          const seenY = height / 2 + (y - height / 2) * scale;
          reach.left = Math.max(reach.left, -seenX);
          reach.right = Math.max(reach.right, seenX - width);
          reach.top = Math.max(reach.top, -seenY);
          reach.bottom = Math.max(reach.bottom, seenY - height);
        }
      }
    }
  }
  // A little more for the paper's softened edge and the shadow's spread.
  const pad = Math.round(Math.max(width, height) * 0.06);
  return {
    left: Math.ceil(reach.left) + pad,
    top: Math.ceil(reach.top) + pad,
    right: Math.ceil(reach.right) + pad,
    bottom: Math.ceil(reach.bottom) + pad
  };
}

interface TearFields {
  readonly curlCylinder: NSEPageCurlCylinder | null;
  /** The 2D fold the page's own layers draw when the 3D sheet can't be. */
  readonly fold: CurlGeometryFields | null;
  readonly tear: NSEPageTearPose;
  readonly curledCorner: NSEPagePoint;
  readonly flat: TearFlatFields;
}

/** The 2D stand-in for a tear, drawn by the page's own layers. */
interface TearFlatFields {
  /** The stub left bound where the sheet has torn away. */
  readonly stubClipPath: string;
  readonly sheetTransform: string;
  readonly sheetOpacity: number;
}

const NSE_PAGE_TEAR_FLAT_IDLE: TearFlatFields = Object.freeze({
  stubClipPath: "polygon(0 0, 0 0, 0 0)",
  sheetTransform: "none",
  sheetOpacity: 1
});

/** The tear line sampled every few px along the binding, from `from` to `to`. */
function sampleTearLine(pose: NSEPageTearPose, from: number, to: number): Array<{ s: number; n: number }> {
  const points: Array<{ s: number; n: number }> = [];
  const steps = Math.max(1, Math.ceil(Math.abs(to - from) / 5));
  for (let step = 0; step <= steps; step += 1) {
    const s = from + ((to - from) * step) / steps;
    points.push({ s, n: getNSEPageTearLine(s, pose.depth, pose.roughness, pose.seed) });
  }
  return points;
}

/**
 * The stub a tear leaves bound, in page px: its outline, and the ragged edge
 * it tore along, from the binding's start to its end.
 */
export function getNSEPageTearStubOutline(pose: NSEPageTearPose, size: NSEPageSize) {
  const frame = getTearFrame(pose.binding, size);
  const line = sampleTearLine(pose, pose.tornFrom, pose.tornTo).map(({ s, n }) => frame.toPage(s, n));
  return {
    outline: [frame.toPage(pose.tornFrom, 0), frame.toPage(pose.tornTo, 0), ...[...line].reverse()],
    edge: line
  };
}

/**
 * The 2D tear's own parts: the ragged stub left bound where the sheet has
 * torn away, and the sheet carried off once it is free.
 */
function getTearFlatFields(pose: NSEPageTearPose, frame: TearFrame, size: NSEPageSize): TearFlatFields {
  const toPercent = (point: NSEPagePoint) => `${pct((point.x / size.width) * 100)} ${pct((point.y / size.height) * 100)}`;
  const torn = pose.tornTo - pose.tornFrom > 0.5;
  const stub = torn
    ? [frame.toPage(pose.tornFrom, 0), frame.toPage(pose.tornTo, 0), ...sampleTearLine(pose, pose.tornFrom, pose.tornTo).reverse().map(({ s, n }) => frame.toPage(s, n))]
    : [];
  const { flight } = pose;
  return {
    stubClipPath: stub.length ? `polygon(${stub.map(toPercent).join(", ")})` : NSE_PAGE_TEAR_FLAT_IDLE.stubClipPath,
    sheetTransform: flight.x || flight.y || flight.spin
      ? `translate(${(flight.pivotX + flight.x).toFixed(2)}px, ${(flight.pivotY + flight.y).toFixed(2)}px) rotate(${flight.spin.toFixed(4)}rad) translate(${(-flight.pivotX).toFixed(2)}px, ${(-flight.pivotY).toFixed(2)}px)`
      : "none",
    sheetOpacity: Number(flight.opacity.toFixed(4))
  };
}

/**
 * Poses a sheet being torn from its binding. `progress` carries the fold and
 * the rip, which a finger may drive further but which never closes again;
 * the finger also steers the pull and carries the corner.
 */
function resolveTearSheet(
  progress: number,
  corner: NSEPageCorner,
  binding: NSEPageEdge,
  motion: NSEPageMotionPreset,
  size: NSEPageSize,
  seed: number,
  pointer?: NSEPagePoint
): TearFields {
  const pull = resolveTearPull(binding, corner, size, pointer ? TEAR_RESIST_PX : 0, pointer);
  const { frame } = pull;
  const toPage = (a: number, n: number) => frame.toPage(pull.nearStart ? a : frame.length - a, n);
  const flying = progress > NSE_PAGE_TEAR_FREE_AT;
  let travel = getTearTravel(pull, Math.min(progress, NSE_PAGE_TEAR_FREE_AT));
  let carried = travel;
  if (pointer && !flying) {
    carried = getFingerTravel(pull, pointer);
    travel = Math.max(travel, carried);
  }
  if (flying) carried = travel;
  // The rip opens where the fold first crosses the binding and runs on ahead
  // of it; bound points it has passed have given.
  const crossing = (travel - pull.resist - pull.reach) / (2 * pull.along);
  const front = Math.min(frame.length, Math.max(0, crossing * TEAR_RIP_LEAD));
  const tear: NSEPageTearPose = {
    binding,
    depth: pull.depth,
    roughness: TEAR_ROUGHNESS_PX,
    seed,
    tornFrom: pull.nearStart ? 0 : frame.length - front,
    tornTo: pull.nearStart ? front : frame.length,
    flight: { x: 0, y: 0, z: 0, spin: 0, pivotX: 0, pivotY: 0, opacity: 1 }
  };
  // The corner goes where the finger carries it, so far as the paper still
  // bound beyond the rip lets it reach, all along the ragged band.
  const held = { x: pull.corner.a, y: pull.corner.n };
  const bound = front >= frame.length ? [] : [front, frame.length].flatMap((a) => [
    { x: a, y: pull.depth - TEAR_ROUGHNESS_PX },
    { x: a, y: pull.depth + TEAR_ROUGHNESS_PX }
  ]);
  let target = { x: held.x + pull.along * carried, y: held.y + pull.towards * carried };
  for (const point of bound) {
    target = clampToCircle(target, point, Math.max(0, Math.hypot(held.x - point.x, held.y - point.y) - CURL_SPINE_CLEARANCE_PX));
  }
  const cornerPage = toPage(held.x, held.y);
  const flat = (pose: NSEPageTearPose) => getTearFlatFields(pose, frame, size);
  const offset = { x: target.x - held.x, y: target.y - held.y };
  const distance = Math.hypot(offset.x, offset.y);
  if (distance < 0.5) return { curlCylinder: null, fold: null, tear, curledCorner: cornerPage, flat: flat(tear) };

  // The fold, in page space, rolled as a curl rolls: a short tight roll as
  // the corner lifts, fattening to a full one as the sheet comes over.
  const targetPage = toPage(target.x, target.y);
  const peel = vecNormalize({ x: targetPage.x - cornerPage.x, y: targetPage.y - cornerPage.y });
  const foldDistance = distance / 2;
  const foldFoot = { x: cornerPage.x + peel.x * foldDistance, y: cornerPage.y + peel.y * foldDistance };
  const lift = smoothNSEPageProgress(Math.min(1, travel / Math.max(pull.reach + pull.resist, 1)));
  const fullRoll = Math.max(motion.curlRadiusMaxPx ?? CURL_RADIUS_MAX_PX, Math.min(size.width, size.height) * CURL_BOOK_ROLL);
  const radius = Math.max(CURL_ROLL_MIN_PX, fullRoll * Math.sqrt(lift));
  const sweep = Math.PI * (1 - TEAR_STAND * lift);
  const spine = bound.length ? bound.map((point) => toPage(point.x, point.y)) : null;
  const cylinder = getCurlCylinder(foldFoot, peel, foldDistance, { radius, sweep }, spine);
  const fold = getCurlFoldFields(corner, peel, foldDistance, lift, motion, size, false);
  if (!flying) return { curlCylinder: cylinder, fold, tear, curledCorner: targetPage, flat: flat(tear) };

  // Free: the sheet flies on along the pull, rising, opening out and turning
  // about the corner it was held by, and has gone from sight before it
  // leaves the reach of the tear's canvas.
  const flight = Math.min(1, (progress - NSE_PAGE_TEAR_FREE_AT) / (1 - NSE_PAGE_TEAR_FREE_AT));
  const pullEnd = toPage(held.x + pull.along, held.y + pull.towards);
  const heading = vecNormalize({ x: pullEnd.x - cornerPage.x, y: pullEnd.y - cornerPage.y });
  const span = Math.max(size.width, size.height);
  const carry = span * (0.6 * flight + 0.75 * flight * flight);
  // It swings about the held corner the way the pull drags its far side.
  const centre = { x: size.width / 2 - targetPage.x, y: size.height / 2 - targetPage.y };
  const swing = Math.sign(heading.x * centre.y - heading.y * centre.x) || 1;
  const flown: NSEPageTearPose = {
    ...tear,
    flight: {
      x: heading.x * carry,
      y: heading.y * carry,
      z: Math.hypot(size.width, size.height) * 0.1 * flight,
      spin: -swing * 0.3 * smoothNSEPageProgress(flight),
      pivotX: targetPage.x,
      pivotY: targetPage.y,
      opacity: 1 - smoothNSEPageProgress((flight - 0.62) / 0.28)
    }
  };
  return {
    curlCylinder: {
      ...cylinder,
      radius: cylinder.radius * (1 + 0.8 * flight),
      sweep: cylinder.sweep - (cylinder.sweep - Math.PI * 0.55) * smoothNSEPageProgress(flight)
    },
    curledCorner: targetPage,
    fold,
    tear: flown,
    flat: flat(flown)
  };
}
