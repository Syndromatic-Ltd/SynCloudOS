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

import { forwardRef, memo } from "react";
import { describe, expect, it } from "vitest";
import { createWebspringBoardView, defineWebspring, WebspringBoardView, type WebspringViewComponent, type WebspringViewProps } from "../../src/Webspring/public";

function defineView(component: WebspringViewComponent, id = "custom") {
  return defineWebspring({
    manifest: {
      schemaVersion: 1, id: "test.return-definition", version: "1.0.0", title: "Return definition",
      webspringShell: {
        views: [{ id, presentations: ["desktop", "tablet", "mobile"], mode: "launcher" }],
        defaults: { desktop: id, tablet: id, mobile: id }, homeRoute: "/",
        branding: { name: { key: "site.name", fallback: "Fixture" } },
      },
    },
    components: { [id]: component },
  });
}

describe("Webspring return requirement capture", () => {
  it("captures immutable requirements without changing or invoking the component", () => {
    let calls = 0;
    const tracks: ("material" | "icons")[] = ["material"];
    const View = Object.assign(() => { calls += 1; return null; }, { returnTracks: tracks });
    const shell = defineView(View);
    tracks.push("icons");
    expect(shell.components.custom).toBe(View);
    expect(shell.returnTracks.custom).toEqual(["material"]);
    expect(Object.isFrozen(shell.returnTracks)).toBe(true);
    expect(Object.isFrozen(shell.returnTracks.custom)).toBe(true);
    expect(calls).toBe(0);
  });

  it.each([WebspringBoardView, createWebspringBoardView({ pageSize: 4 })])("captures Board requirements under an alias", (View) => {
    expect(defineView(View, "launchpad").returnTracks.launchpad).toEqual(["material"]);
  });

  it.each([() => null, memo(() => null), forwardRef<HTMLElement, WebspringViewProps>(() => null)])("retains the two-track default for a component without a declaration", (View) => {
    expect(defineView(View, "board").returnTracks.board).toEqual(["material", "icons"]);
  });

  it.each([memo(() => null), forwardRef<HTMLElement, WebspringViewProps>(() => null)])("accepts requirements on a React wrapper", (wrapper) => {
    const View = Object.assign(wrapper, { returnTracks: ["icons"] as const });
    const shell = defineView(View);
    expect(shell.returnTracks.custom).toEqual(["icons"]);
    expect(shell.components.custom).toBe(wrapper);
  });

  it.each([[], ["unknown"], ["material", "material"], "material"].map((returnTracks) => ({ returnTracks })))("rejects invalid requirements $returnTracks", ({ returnTracks }) => {
    const View = Object.assign(() => null, { returnTracks });
    expect(() => defineView(View as WebspringViewComponent)).toThrow(/returnTracks/);
  });

  it("rejects requirement accessors without evaluating them", () => {
    let reads = 0;
    const View = Object.defineProperty(() => null, "returnTracks", {
      enumerable: true, get() { reads += 1; return ["material"]; },
    });
    expect(() => defineView(View)).toThrow(/returnTracks.*accessor/);
    expect(reads).toBe(0);
  });
});
