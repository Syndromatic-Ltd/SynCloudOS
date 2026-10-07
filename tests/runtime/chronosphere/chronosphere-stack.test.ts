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
  computeChronosphereStack,
  sortChronosphereEntriesNewestFirst
} from "../../../src/NSE/Chronosphere/chronosphereStackLayout";

import type { ChronosphereVersion } from "../../../src/NSE/Chronosphere/chronosphereTypes";

function makeEntry(
  version: string,
  status: "current" | "saved",
  overrides: Partial<ChronosphereVersion> = {}
): ChronosphereVersion {
  return {
    id: `v${version}`,
    displayLabel: version,
    sequence: 0,
    title: `Version ${version}`,
    dateLabel: version,
    summary: "summary",
    isCurrent: status === "current",
    tint: [0.3, 0.6, 0.9],
    ...overrides
  };
}

const chronosphereArchive = [makeEntry("1.0", "saved", { sequence: 1 }), makeEntry("2.0", "saved", { sequence: 2 }), makeEntry("3.0", "saved", { sequence: 3 }), makeEntry("4.0", "current", { sequence: 4 })];

describe("sortChronosphereEntriesNewestFirst", () => {
  it("orders 1.10 after 1.9 by the source sequence, not a decimal display label", () => {
    const entries = [
      { ...makeEntry("1.9", "saved"), sequence: 9 },
      { ...makeEntry("1.10", "saved"), sequence: 10 },
    ];
    expect(sortChronosphereEntriesNewestFirst(entries).map(entry => entry.id)).toEqual(["v1.10", "v1.9"]);
  });

  it("orders unrelated display labels by explicit chronology", () => {
    const entries = [
      { ...makeEntry("Final", "saved"), sequence: 1 },
      { ...makeEntry("First draft", "saved"), sequence: 3 },
      { ...makeEntry("Review", "saved"), sequence: 2 },
    ];
    expect(sortChronosphereEntriesNewestFirst(entries).map(entry => entry.id)).toEqual(["vFirst draft", "vReview", "vFinal"]);
  });

  it("uses saved timestamps to order versions with equal sequence", () => {
    const entries = [
      { ...makeEntry("Later label", "saved"), sequence: 1, savedAt: 1000 },
      { ...makeEntry("Earlier label", "saved"), sequence: 1, savedAt: 2000 },
    ];
    expect(sortChronosphereEntriesNewestFirst(entries).map(entry => entry.id)).toEqual(["vEarlier label", "vLater label"]);
  });

  it("accepts a time-ordered source using epoch milliseconds as its sequence", () => {
    const entries = [
      { ...makeEntry("Latest label", "saved"), sequence: 1700000000000 },
      { ...makeEntry("Earlier label", "saved"), sequence: 1800000000000 },
    ];
    expect(sortChronosphereEntriesNewestFirst(entries).map(entry => entry.id)).toEqual(["vEarlier label", "vLatest label"]);
  });

  it("preserves stable identity and input order for complete chronology ties", () => {
    const first = { id: "a", sequence: 10, savedAt: 2000, title: "Draft", dateLabel: "Today", detail: { author: "Editor" } };
    const second = { ...first, id: "b", detail: { author: "Writer" } };
    const entries = Object.freeze([Object.freeze(first), Object.freeze(second)]);
    const sorted = sortChronosphereEntriesNewestFirst(entries);
    expect(sorted.map(entry => entry.id)).toEqual(["a", "b"]);
    expect(sorted[0]).toBe(first);
    expect(sorted[1].detail.author).toBe("Writer");
  });

  it("keeps the current version first even when a saved version has a larger sequence", () => {
    const entries = [
      { ...makeEntry("Saved", "saved"), sequence: 100 },
      { ...makeEntry("Live", "current"), sequence: 0 },
    ];
    expect(sortChronosphereEntriesNewestFirst(entries).map(entry => entry.id)).toEqual(["vLive", "vSaved"]);
  });

  it("orders integer document sequences 10 and 9 correctly", () => {
    const entries = [
      { ...makeEntry("9", "saved"), sequence: 9 },
      { ...makeEntry("10", "saved"), sequence: 10 },
    ];
    expect(sortChronosphereEntriesNewestFirst(entries).map(entry => entry.id)).toEqual(["v10", "v9"]);
  });

  it("puts the current version at index 0, then newest → oldest by source sequence", () => {
    const sorted = sortChronosphereEntriesNewestFirst(chronosphereArchive);
    expect(sorted[0].isCurrent).toBe(true);
    expect(sorted.map((entry) => entry.displayLabel)).toEqual(["4.0", "3.0", "2.0", "1.0"]);
  });

  it("does not mutate the input array", () => {
    const input = [makeEntry("1.0", "saved", { sequence: 1 }), makeEntry("2.0", "current", { sequence: 2 })];
    const snapshot = [...input];
    sortChronosphereEntriesNewestFirst(input);
    expect(input).toEqual(snapshot);
  });

  it("orders by source sequence even when no entry is current", () => {
    const sorted = sortChronosphereEntriesNewestFirst([
      makeEntry("2.0", "saved", { sequence: 2 }),
      makeEntry("3.0", "saved", { sequence: 3 }),
      makeEntry("1.0", "saved", { sequence: 1 })
    ]);
    expect(sorted.map((entry) => entry.displayLabel)).toEqual(["3.0", "2.0", "1.0"]);
  });
});

describe("computeChronosphereStack", () => {
  const entries = sortChronosphereEntriesNewestFirst(chronosphereArchive);

  it("places the active card front-and-centre (relativeIndex 0, full scale/opacity, no offset)", () => {
    const slots = computeChronosphereStack(entries, 0);
    const active = slots[0];
    expect(active.isActive).toBe(true);
    expect(active.relativeIndex).toBe(0);
    expect(active.scale).toBe(1);
    expect(active.opacity).toBe(1);
    expect(active.translateY).toBe(0);
    expect(active.translateZ).toBe(0);
    expect(active.blur).toBe(0);
  });

  it("recedes older cards up and back with falling opacity", () => {
    const slots = computeChronosphereStack(entries, 0);
    const older = slots.slice(1);
    for (const slot of older) {
      expect(slot.relativeIndex).toBeGreaterThan(0);
      expect(slot.translateY).toBeLessThan(0);
      expect(slot.translateZ).toBeLessThan(0);
      expect(slot.opacity).toBeLessThan(1);
      expect(slot.scale).toBeLessThan(1);
    }
    // Monotonically further/dimmer the deeper we go.
    for (let i = 2; i < slots.length; i += 1) {
      expect(slots[i].translateZ).toBeLessThan(slots[i - 1].translateZ);
      expect(slots[i].opacity).toBeLessThanOrEqual(slots[i - 1].opacity);
    }
  });

  it("only blurs cards beyond the detail depth", () => {
    const slots = computeChronosphereStack(entries, 0, { detailDepth: 1 });
    expect(slots[1].blur).toBe(0);
    expect(slots[2].blur).toBeGreaterThan(0);
    expect(slots[3].blur).toBeGreaterThan(slots[2].blur);
  });

  it("keeps the active card on top via z-index ordering", () => {
    const slots = computeChronosphereStack(entries, 1);
    const active = slots[1];
    for (const slot of slots) {
      if (slot === active) continue;
      expect(slot.zIndex).toBeLessThan(active.zIndex);
    }
  });

  it("clamps an out-of-range active index", () => {
    const high = computeChronosphereStack(entries, 99);
    expect(high.find((slot) => slot.isActive)?.index).toBe(entries.length - 1);
    const low = computeChronosphereStack(entries, -5);
    expect(low.find((slot) => slot.isActive)?.index).toBe(0);
  });

  it("handles a single-entry archive without NaN", () => {
    const slots = computeChronosphereStack([makeEntry("1.0", "current", { sequence: 1 })], 0);
    expect(slots).toHaveLength(1);
    expect(slots[0].isActive).toBe(true);
    expect(Number.isFinite(slots[0].translateY)).toBe(true);
    expect(Number.isFinite(slots[0].scale)).toBe(true);
  });

  it("returns an empty layout for an empty archive", () => {
    expect(computeChronosphereStack([], 0)).toEqual([]);
  });
});
