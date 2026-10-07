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

// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { useChronosphereTravel } from "../../../src/NSE/Chronosphere/useChronosphereTravel";
import type { ChronospherePlatformPort } from "../../../src/NSE/Chronosphere/ChronosphereStage";

let root: Root, container: HTMLDivElement, time: number;
let queue: Map<number, (time: number) => void>, serial: number;
let travel: ReturnType<typeof useChronosphereTravel>;
let positions: number[];
const environment: ChronospherePlatformPort = {
  requestAnimationFrame(callback) { const id = ++serial; queue.set(id, callback); return id; },
  cancelAnimationFrame(id) { queue.delete(id as number); },
  matchMedia: () => ({ matches: false, subscribe: () => () => {}, dispose() {} }),
  setTimeout() { return 0; }, clearTimeout() {},
};
function Camera({ enabled = true, count = 81 }) {
  travel = useChronosphereTravel(count, enabled, environment);
  positions.push(travel.position);
  return <output>{travel.position}</output>;
}
async function frame(delta = 16) {
  time += delta;
  const callbacks = [...queue.values()]; queue.clear();
  await act(async () => { for (const callback of callbacks) callback(time); });
}
beforeEach(async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  queue = new Map(); serial = 0; time = 0; positions = [];
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<Camera />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

it("visits every intervening version during a long trip, even after a dropped frame", async () => {
  await act(async () => travel.goTo(80));
  await frame(); await frame(30000);
  expect(travel.position).toBeLessThan(1);
  for (let i = 0; queue.size && i < 1000; i++) await frame(32);
  expect(travel.position).toBe(80); expect(travel.travelling).toBe(false);
  const visited = new Set(positions.map(Math.round));
  for (let i = 0; i <= 80; i++) expect(visited.has(i), `version ${i}`).toBe(true);
});
it("retargets from the in-flight camera position and disposes the superseded frame", async () => {
  await act(async () => travel.goTo(40));
  for (let i = 0; i < 25; i++) await frame();
  const before = travel.position;
  await act(async () => travel.goTo(0));
  expect(travel.position).toBe(before); expect(queue.size).toBe(1);
  for (let i = 0; queue.size && i < 300; i++) await frame();
  expect(travel.position).toBe(0);
});
it("settles immediately and cancels the frame when reduced motion or exit disables travel", async () => {
  await act(async () => travel.goTo(30)); await frame();
  await act(async () => root.render(<Camera enabled={false} />));
  expect(queue.size).toBe(0); expect(travel.position).toBe(30); expect(travel.travelling).toBe(false);
});
it("clamps after history changes and releases the scheduled frame on unmount", async () => {
  await act(async () => travel.goTo(80));
  await act(async () => root.render(<Camera count={3} />));
  expect(travel.target).toBe(2);
  await act(async () => root.unmount());
  expect(queue.size).toBe(0);
  root = createRoot(container);
});
