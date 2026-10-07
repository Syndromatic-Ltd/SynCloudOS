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

import { describe, expect, it } from "vitest";
import {
  getNSEPageTearDragProgress,
  getNSEPageTearLine,
  getNSEPageTearMargin,
  isNSEPageTearGrab,
  NSE_PAGE_TEAR_FREE_AT,
  projectNSEPageCurlPoint,
  resolveNSEPageGeometry
} from "../../src/NSE/Page/nsePageGeometry";
import { getNSEPagePreset } from "../../src/NSE/Page/nsePagePresets";
import type { NSEPageCorner, NSEPageEdge, NSEPagePoint } from "../../src/NSE/Page/nsePageTypes";

const preset = getNSEPagePreset("tearAway");
const size = { width: 400, height: 600 };
const SEED = 7;

/** Every binding, torn from either far corner, and from either end of the binding itself. */
const cases: ReadonlyArray<{ binding: NSEPageEdge; corner: NSEPageCorner }> = [
  { binding: "top", corner: "bottom-right" },
  { binding: "top", corner: "bottom-left" },
  { binding: "bottom", corner: "top-right" },
  { binding: "bottom", corner: "top-left" },
  { binding: "left", corner: "bottom-right" },
  { binding: "left", corner: "top-right" },
  { binding: "right", corner: "bottom-left" },
  { binding: "right", corner: "top-left" },
  { binding: "top", corner: "top-right" },
  { binding: "top", corner: "top-left" },
  { binding: "bottom", corner: "bottom-right" },
  { binding: "bottom", corner: "bottom-left" },
  { binding: "left", corner: "top-left" },
  { binding: "left", corner: "bottom-left" },
  { binding: "right", corner: "top-right" },
  { binding: "right", corner: "bottom-right" }
];

function tear(binding: NSEPageEdge, corner: NSEPageCorner, progress: number, pointer?: NSEPagePoint) {
  return resolveNSEPageGeometry({
    progress,
    mode: "tear",
    edge: binding,
    corner,
    direction: "forward",
    phase: pointer ? "dragging" : "turning",
    motion: preset.motion,
    material: preset.material,
    size,
    pointer,
    tearSeed: SEED
  });
}

/** Page px along the binding from its start (left or top), and in from it. */
function local(binding: NSEPageEdge, point: NSEPagePoint) {
  if (binding === "top") return { s: point.x, n: point.y };
  if (binding === "bottom") return { s: point.x, n: size.height - point.y };
  if (binding === "left") return { s: point.y, n: point.x };
  return { s: point.y, n: size.width - point.x };
}

function page(binding: NSEPageEdge, s: number, n: number): NSEPagePoint {
  if (binding === "top") return { x: s, y: n };
  if (binding === "bottom") return { x: s, y: size.height - n };
  if (binding === "left") return { x: n, y: s };
  return { x: size.width - n, y: s };
}

const bindingLength = (binding: NSEPageEdge) => binding === "top" || binding === "bottom" ? size.width : size.height;

/** Fingers pulling from the torn corner along and across the page, and beyond it. */
function fingers(binding: NSEPageEdge, corner: NSEPageCorner) {
  const length = bindingLength(binding);
  const nearStart = local(binding, { x: corner.endsWith("left") ? 0 : size.width, y: corner.startsWith("top") ? 0 : size.height }).s < length / 2;
  const points: NSEPagePoint[] = [];
  for (let along = 0; along <= length * 1.6; along += 25) {
    for (let down = -60; down <= 500; down += 40) {
      points.push(page(binding, nearStart ? along : length - along, down));
    }
  }
  return points;
}

describe("NSEPage tear", () => {
  it("draws the same ragged line every time, within its roughness", () => {
    for (let s = 0; s < 600; s += 0.7) {
      const line = getNSEPageTearLine(s, 10, 3.4, SEED);
      expect(line).toBe(getNSEPageTearLine(s, 10, 3.4, SEED));
      expect(line).toBeGreaterThanOrEqual(10 - 3.4);
      expect(line).toBeLessThanOrEqual(10 + 3.4);
    }
    // Ragged, not a straight cut.
    const samples = Array.from({ length: 60 }, (_, index) => getNSEPageTearLine(index * 10, 10, 3.4, SEED));
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(2);
  });

  it("lies flat and whole at rest", () => {
    for (const { binding, corner } of cases) {
      const geometry = tear(binding, corner, 0);
      expect(geometry.curlCylinder).toBeNull();
      expect(geometry.tear).toBeNull();
      expect(geometry.frontClipPath).toBe("inset(0)");
    }
  });

  it("rips along the binding from the held corner's end, and only ever further", () => {
    for (const { binding, corner } of cases) {
      const length = bindingLength(binding);
      const nearStart = local(binding, { x: corner.endsWith("left") ? 0 : size.width, y: corner.startsWith("top") ? 0 : size.height }).s < length / 2;
      let torn = 0;
      for (let progress = 0.01; progress <= 1; progress += 0.01) {
        const pose = tear(binding, corner, progress).tear!;
        const span = pose.tornTo - pose.tornFrom;
        expect(span, `${binding} ${corner} ${progress}`).toBeGreaterThanOrEqual(torn - 1e-6);
        torn = span;
        // The rip opens at the held corner's end of the binding.
        if (nearStart) expect(pose.tornFrom).toBe(0);
        else expect(pose.tornTo).toBe(length);
        if (progress >= NSE_PAGE_TEAR_FREE_AT) expect(span).toBeCloseTo(length);
      }
    }
  });

  it("never lifts the paper still bound below the ragged line, in any pull", () => {
    for (const { binding, corner } of cases) {
      const poses = [
        ...Array.from({ length: 33 }, (_, index) => tear(binding, corner, (index + 1) * 0.02)),
        ...fingers(binding, corner).map((finger) => tear(binding, corner, 0.02, finger))
      ];
      for (const geometry of poses) {
        const { tear: pose, curlCylinder } = geometry;
        if (!pose || !curlCylinder) continue;
        const length = bindingLength(binding);
        // The sheet's paper along the ragged line, and below it, stays on the
        // pad wherever the rip has yet to pass. (The stub above the line is
        // drawn flat in its own right.)
        for (let s = 0; s <= length; s += 2) {
          if (s >= pose.tornFrom - 0.5 && s <= pose.tornTo + 0.5) continue;
          const line = getNSEPageTearLine(s, pose.depth, pose.roughness, pose.seed);
          for (const n of [line, line + 0.5, pose.depth + pose.roughness]) {
            const projected = projectNSEPageCurlPoint(page(binding, s, n), curlCylinder);
            expect(projected.z, `${binding} ${corner} s=${s} n=${n}`).toBe(0);
          }
        }
      }
    }
  }, 60_000);

  it("rolls the sheet without ever stretching the paper", () => {
    let worst = 0;
    for (const { binding, corner } of cases) {
      const poses = [
        ...Array.from({ length: 20 }, (_, index) => tear(binding, corner, (index + 1) * 0.05)),
        ...fingers(binding, corner).filter((_, index) => index % 3 === 0).map((finger) => tear(binding, corner, 0.02, finger))
      ];
      for (const { curlCylinder } of poses) {
        if (!curlCylinder) continue;
        const step = 10;
        for (let x = 0; x < size.width; x += step) {
          for (let y = 0; y < size.height; y += step) {
            const a = projectNSEPageCurlPoint({ x, y }, curlCylinder);
            for (const [dx, dy] of [[step, 0], [0, step]]) {
              const b = projectNSEPageCurlPoint({ x: x + dx, y: y + dy }, curlCylinder);
              const stretch = Math.abs(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) - step) / step;
              worst = Math.max(worst, stretch);
            }
          }
        }
      }
    }
    // A chord across the roll is a little shorter than the paper it spans; never longer.
    expect(worst).toBeLessThan(0.03);
  }, 60_000);

  it("carries the held corner under the finger as it curls over", () => {
    for (const { binding, corner } of cases) {
      const held = { x: corner.endsWith("left") ? 0 : size.width, y: corner.startsWith("top") ? 0 : size.height };
      const across = local(binding, held).n > (binding === "top" || binding === "bottom" ? size.height : size.width) / 2;
      if (!across) continue;
      // Along the page's other diagonal, towards the opposite corner.
      const opposite = { x: size.width - held.x, y: size.height - held.y };
      for (let share = 0.05; share <= 0.6; share += 0.05) {
        const finger = { x: held.x + (opposite.x - held.x) * share, y: held.y + (opposite.y - held.y) * share };
        const progress = getNSEPageTearDragProgress(finger, corner, size, binding, preset.motion);
        const geometry = tear(binding, corner, progress, finger);
        const offset = Math.hypot(geometry.curledCorner.x - finger.x, geometry.curledCorner.y - finger.y);
        expect(offset, `${binding} ${corner} ${share.toFixed(2)}`).toBeLessThan(0.15 * Math.hypot(size.width, size.height) * share + 1);
      }
    }
  });

  it("folds the sheet right over onto the far half before the binding gives", () => {
    for (const { binding, corner } of cases.slice(0, 8)) {
      const before = tear(binding, corner, 0.45).tear!;
      expect(before.tornTo - before.tornFrom, `${binding} ${corner}`).toBe(0);
      const geometry = tear(binding, corner, 0.46);
      const held = { x: corner.endsWith("left") ? 0 : size.width, y: corner.startsWith("top") ? 0 : size.height };
      // The corner has come over past the middle of the page.
      const centre = { x: size.width / 2, y: size.height / 2 };
      expect((geometry.curledCorner.x - centre.x) * (held.x - centre.x) + (geometry.curledCorner.y - centre.y) * (held.y - centre.y)).toBeLessThan(0);
    }
  });

  it("frees the sheet once a finger pulls far past where the paper can reach", () => {
    for (const { binding, corner } of cases) {
      const held = { x: corner.endsWith("left") ? 0 : size.width, y: corner.startsWith("top") ? 0 : size.height };
      const beyond = { x: size.width / 2 + (size.width / 2 - held.x) * 6, y: size.height / 2 + (size.height / 2 - held.y) * 6 };
      expect(getNSEPageTearDragProgress(beyond, corner, size, binding, preset.motion), `${binding} ${corner}`).toBeCloseTo(NSE_PAGE_TEAR_FREE_AT);
      expect(getNSEPageTearDragProgress(held, corner, size, binding, preset.motion)).toBeLessThan(0.02);
    }
  });

  it("takes hold only near the corner the sheet tears from", () => {
    const reach = preset.interaction.edgeActivationSize;
    expect(isNSEPageTearGrab({ x: 390, y: 590 }, "bottom-right", size, "top", reach)).toBe(true);
    expect(isNSEPageTearGrab({ x: 260, y: 585 }, "bottom-right", size, "top", reach)).toBe(true);
    expect(isNSEPageTearGrab({ x: 385, y: 400 }, "bottom-right", size, "top", reach)).toBe(true);
    expect(isNSEPageTearGrab({ x: 20, y: 590 }, "bottom-right", size, "top", reach)).toBe(false);
    expect(isNSEPageTearGrab({ x: 200, y: 300 }, "bottom-right", size, "top", reach)).toBe(false);
    expect(isNSEPageTearGrab({ x: 390, y: 20 }, "bottom-right", size, "top", reach)).toBe(false);
    expect(isNSEPageTearGrab({ x: 10, y: 590 }, "bottom-left", size, "top", reach)).toBe(true);
  });

  it("carries the free sheet off the page and out of sight inside its canvas", () => {
    const focal = Math.max(preset.motion.perspective, Math.max(size.width, size.height) * 2.6);
    for (const { binding, corner } of cases) {
      const margin = getNSEPageTearMargin(binding, corner, size);
      let seenFading = false;
      for (let progress = NSE_PAGE_TEAR_FREE_AT; progress <= 1.0001; progress += 0.01) {
        const geometry = tear(binding, corner, Math.min(1, progress));
        const { flight } = geometry.tear!;
        if (flight.opacity < 0.999) seenFading = true;
        if (flight.opacity <= 0.01) continue;
        const cos = Math.cos(flight.spin), sin = Math.sin(flight.spin);
        let overPage = 0, samples = 0;
        for (let x = 0; x <= size.width; x += 20) {
          for (let y = 0; y <= size.height; y += 20) {
            const curled = projectNSEPageCurlPoint({ x, y }, geometry.curlCylinder!);
            const rx = curled.x - flight.pivotX, ry = curled.y - flight.pivotY;
            const carried = {
              x: flight.pivotX + cos * rx - sin * ry + flight.x,
              y: flight.pivotY + sin * rx + cos * ry + flight.y,
              z: curled.z + flight.z
            };
            const scale = focal / Math.max(focal - carried.z, 1);
            const seen = {
              x: size.width / 2 + (carried.x - size.width / 2) * scale,
              y: size.height / 2 + (carried.y - size.height / 2) * scale
            };
            // Wherever the sheet can still be seen, it is inside the canvas.
            expect(seen.x, `${binding} ${corner} ${progress.toFixed(2)}`).toBeGreaterThan(-margin.left);
            expect(seen.x).toBeLessThan(size.width + margin.right);
            expect(seen.y).toBeGreaterThan(-margin.top);
            expect(seen.y).toBeLessThan(size.height + margin.bottom);
            samples += 1;
            if (seen.x > 0 && seen.x < size.width && seen.y > 0 && seen.y < size.height) overPage += 1;
          }
        }
        // It begins to fade only once it has mostly left the page.
        if (flight.opacity < 0.95) expect(overPage / samples, `${binding} ${corner} ${progress.toFixed(2)}`).toBeLessThan(0.35);
      }
      expect(seenFading).toBe(true);
      expect(tear(binding, corner, 1).tear!.flight.opacity).toBe(0);
    }
  }, 60_000);

  it("leaves only the stub once torn", () => {
    const geometry = resolveNSEPageGeometry({
      progress: 0.3, torn: true, mode: "tear", edge: "top", corner: "top-right", direction: "forward",
      phase: "torn", motion: preset.motion, material: preset.material, size, tearSeed: SEED
    });
    expect(geometry.torn).toBe(true);
    expect(geometry.tear!.flight.opacity).toBe(0);
    expect(geometry.tear!.tornTo - geometry.tear!.tornFrom).toBeCloseTo(size.width);
    expect(geometry.tearSheetOpacity).toBe(0);
    expect(geometry.insideInteractive).toBe(true);
  });

  it("draws the 2D tear as the curl's own fold, its stub, and the sheet sliding off", () => {
    const geometry = tear("top", "bottom-right", 0.56);
    // The page's own layers fold the corner over, as the 2D curl does.
    expect(geometry.frontClipPath.startsWith("polygon(")).toBe(true);
    expect(geometry.curlClipPath.startsWith("polygon(")).toBe(true);
    expect(geometry.curlFlapTransform).toMatch(/scaleY\(-1\)/);
    expect(geometry.tearStubClipPath.startsWith("polygon(")).toBe(true);
    // The stub reaches no lower than the ragged line's deepest point.
    const depths = [...geometry.tearStubClipPath.matchAll(/([\d.]+)% ([\d.]+)%/g)].map((match) => (Number(match[2]) / 100) * size.height);
    expect(Math.max(...depths)).toBeLessThanOrEqual(geometry.tear!.depth + geometry.tear!.roughness + 0.01);
    expect(geometry.tearSheetTransform).toBe("none");
    const flying = tear("top", "bottom-right", 0.85);
    expect(flying.tearSheetTransform).toMatch(/^translate\(.*rotate\(/);
    expect(flying.tearSheetOpacity).toBeGreaterThan(0);
  });

  it("crossfades instead when motion is reduced", () => {
    const geometry = resolveNSEPageGeometry({
      progress: 0.5, mode: "tear", edge: "top", direction: "forward", motion: preset.motion,
      material: preset.material, size, reducedMotion: true
    });
    expect(geometry.tear).toBeNull();
    expect(geometry.curlCylinder).toBeNull();
    expect(geometry.frontOpacity).toBeCloseTo(0.5);
    expect(geometry.insideOpacity).toBeCloseTo(0.5);
  });
});
