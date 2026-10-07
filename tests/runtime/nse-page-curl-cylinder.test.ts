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
import { getNSEPageCurlProfile, projectNSEPageCurlPoint, resolveNSEPageGeometry } from "../../src/NSE/Page/nsePageGeometry";
import { getNSEPagePreset } from "../../src/NSE/Page/nsePagePresets";
import type { NSEPageCurlCylinder } from "../../src/NSE/Page/nsePageTypes";

function curlGeometry(preset: "settingsPeel" | "bookCurl", progress: number, pointer?: { x: number; y: number }) {
  const resolved = getNSEPagePreset(preset);
  return resolveNSEPageGeometry({
    progress,
    mode: "curl",
    edge: resolved.edge,
    corner: "bottom-right",
    direction: resolved.direction,
    motion: resolved.motion,
    material: resolved.material,
    size: { width: 400, height: 600 },
    pointer,
  });
}

describe("NSEPage curl cylinder", () => {
  const roll = (radius: number, sweep = Math.PI): NSEPageCurlCylinder => ({
    bendX: 300, bendY: 0, normalX: 1, normalY: 0, radius, sweep,
  });

  it("leaves paper behind the bend line flat", () => {
    const cylinder = roll(30);
    expect(projectNSEPageCurlPoint({ x: 120, y: 80 }, cylinder)).toEqual({ x: 120, y: 80, z: 0, angle: 0 });
  });

  it("rolls paper over a tight crest, opens out, then runs straight on", () => {
    const crest = getNSEPageCurlProfile(30 * Math.PI * 0.5, 30, Math.PI);
    expect(crest.x).toBeCloseTo(30);
    expect(crest.z).toBeCloseTo(30);
    // Continuous where the crest hands over to the open turn and the straight run.
    for (const sweep of [Math.PI, Math.PI * 0.75]) {
      for (const at of [30 * Math.PI * 0.55, 30 * Math.PI * 0.55 + 90 * (sweep - Math.PI * 0.55)]) {
        const before = getNSEPageCurlProfile(at - 0.01, 30, sweep);
        const after = getNSEPageCurlProfile(at + 0.01, 30, sweep);
        expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(0.03);
      }
    }
    const flat = projectNSEPageCurlPoint({ x: 300 + 2000, y: 50 }, roll(30));
    expect(flat.angle).toBe(Math.PI);
    const standing = getNSEPageCurlProfile(400, 30, Math.PI * 0.7);
    expect(standing.angle).toBeCloseTo(Math.PI * 0.7);
    expect(standing.z).toBeGreaterThan(200);
  });

  // Every pose a finger can pull a book leaf into, from each corner it turns by.
  const bookPoses = () => {
    const resolved = getNSEPagePreset("bookCurl");
    const size = { width: 400, height: 600 };
    const poses: Array<{ label: string; progress: number; cylinder: NSEPageCurlCylinder }> = [];
    const cases = [
      { corner: "bottom-right", edge: "right", direction: "forward" },
      { corner: "top-right", edge: "right", direction: "forward" },
      { corner: "bottom-left", edge: "left", direction: "backward" },
      { corner: "top-left", edge: "left", direction: "backward" },
    ] as const;
    for (const { corner, edge, direction } of cases) {
      for (let x = -400; x <= 800; x += 50) {
        for (let y = -100; y <= 700; y += 50) {
          const progress = Math.min(1, Math.max(0, (edge === "right" ? 400 - x : x) / 800));
          const geometry = resolveNSEPageGeometry({
            progress, mode: "curl", edge, corner, direction,
            motion: resolved.motion, material: resolved.material, size, pointer: { x, y },
          });
          if (geometry.curlCylinder) poses.push({ label: `${corner} finger ${x},${y}`, progress, cylinder: geometry.curlCylinder });
        }
      }
      for (let progress = 0.05; progress < 1; progress += 0.05) {
        const geometry = resolveNSEPageGeometry({
          progress, mode: "curl", edge, corner, direction, motion: resolved.motion, material: resolved.material, size,
        });
        if (geometry.curlCylinder) poses.push({ label: `${corner} turn ${progress.toFixed(2)}`, progress, cylinder: geometry.curlCylinder });
      }
    }
    return poses;
  };

  it("bends the paper without ever stretching it, in every pose", () => {
    let worst = { stretch: 1, where: "" };
    for (const { label, cylinder } of bookPoses()) {
      for (let x = 0; x <= 400; x += 25) {
        for (let y = 0; y <= 600; y += 25) {
          const here = projectNSEPageCurlPoint({ x, y }, cylinder);
          for (const [dx, dy] of [[2, 0], [0, 2]]) {
            const next = projectNSEPageCurlPoint({ x: x + dx, y: y + dy }, cylinder);
            const stretch = Math.hypot(next.x - here.x, next.y - here.y, next.z - here.z) / 2;
            if (Math.abs(stretch - 1) > Math.abs(worst.stretch - 1)) worst = { stretch, where: `${label} at ${x},${y}` };
          }
        }
      }
    }
    expect(Math.abs(worst.stretch - 1), worst.where).toBeLessThan(0.03);
  }, 60_000);

  it("never folds a lifted book leaf flat, however far the finger pulls", () => {
    for (const { label, progress, cylinder } of bookPoses()) {
      if (progress >= 0.1 && progress <= 0.9) expect(cylinder.radius, label).toBeGreaterThanOrEqual(14);
    }
  });

  it("lands the curled corner where the flat fold puts it, so the curl follows the drag", () => {
    for (const progress of [0.08, 0.3, 0.55]) {
      const geometry = curlGeometry("settingsPeel", progress);
      const cylinder = geometry.curlCylinder!;
      expect(cylinder.radius).toBeGreaterThan(0);
      const corner = projectNSEPageCurlPoint({ x: 400, y: 600 }, cylinder);
      expect(corner.x).toBeCloseTo(geometry.curledCorner.x, 0);
      expect(corner.y).toBeCloseTo(geometry.curledCorner.y, 0);
      expect(corner.angle).toBeGreaterThan(Math.PI / 2);
    }
  });

  it("stands a book leaf up off the page mid-turn, still under the finger", () => {
    const pointer = { x: 120, y: 520 };
    const geometry = curlGeometry("bookCurl", 0.4, pointer);
    const cylinder = geometry.curlCylinder!;
    expect(cylinder.sweep).toBeLessThan(Math.PI);
    const corner = projectNSEPageCurlPoint({ x: 400, y: 600 }, cylinder);
    expect(corner.x).toBeCloseTo(geometry.curledCorner.x, 0);
    expect(corner.y).toBeCloseTo(geometry.curledCorner.y, 0);
    expect(corner.z).toBeGreaterThan(20);
  });

  it("keeps a book leaf's spine attached and lays it flat once turned", () => {
    const halfway = curlGeometry("bookCurl", 0.5).curlCylinder!;
    expect(projectNSEPageCurlPoint({ x: 0, y: 300 }, halfway).z).toBe(0);
    const turned = curlGeometry("bookCurl", 1).curlCylinder!;
    expect(turned.radius).toBeCloseTo(0);
  });

  it("never lifts a book leaf at its spine, wherever the finger goes", () => {
    const resolved = getNSEPagePreset("bookCurl");
    const size = { width: 400, height: 600 };
    const cases = [
      { corner: "bottom-right", edge: "right", direction: "forward", spineX: 0 },
      { corner: "top-right", edge: "right", direction: "forward", spineX: 0 },
      { corner: "bottom-left", edge: "left", direction: "backward", spineX: 400 },
    ] as const;
    for (const { corner, edge, direction, spineX } of cases) {
      for (let x = -400; x <= 800; x += 50) {
        for (let y = -100; y <= 700; y += 50) {
          const geometry = resolveNSEPageGeometry({
            progress: 0.5, mode: "curl", edge, corner, direction,
            motion: resolved.motion, material: resolved.material, size, pointer: { x, y },
          });
          const cylinder = geometry.curlCylinder;
          if (!cylinder) continue;
          for (let spineY = 0; spineY <= 600; spineY += 50) {
            expect(projectNSEPageCurlPoint({ x: spineX, y: spineY }, cylinder).z, `${corner} finger ${x},${y} spine ${spineY}`).toBe(0);
          }
        }
      }
    }
  });

  it("has no cylinder at rest outside curl mode", () => {
    const resolved = getNSEPagePreset("paperTurn");
    const geometry = resolveNSEPageGeometry({
      progress: 0.5, mode: "turn", edge: resolved.edge, direction: resolved.direction,
      motion: resolved.motion, material: resolved.material, size: { width: 400, height: 600 },
    });
    expect(geometry.curlCylinder).toBeNull();
  });
});
