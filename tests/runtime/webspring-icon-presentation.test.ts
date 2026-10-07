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
import { compileNSEPresentation, type NSEPresentationEnter, type NSEPresentationSpec } from "../../src/NSE/Animation";
import {
  getWebspringRadialExitForIcon,
  resolveWebspringIconPresentation,
  resolveWebspringOrbPresentation,
  webspringIconSprings,
  type WebspringIconState,
} from "../../src/Webspring/Webspring.transitions";

const radialExit = getWebspringRadialExitForIcon(0, 3, 90);
const icon = (state: WebspringIconState, reducedMotion = false, index = 0) =>
  resolveWebspringIconPresentation({ reducedMotion, state, index, total: 3, radialExit });
const into = (enter: NSEPresentationEnter, previous: string | null) => typeof enter === "function" ? enter(previous) : enter;
const endpoints = (spec: NSEPresentationSpec | null) =>
  Object.fromEntries(compileNSEPresentation(spec!, "icon").animations.map(({ keyPath, from, to }) => [keyPath, [from, to]]));

describe("launcher icon presentation", () => {
  it("keeps Framer Motion's springs, settling within 1/10000 of rest", () => {
    expect(webspringIconSprings.boot).toMatchObject({ timing: { kind: "spring", stiffness: 145, damping: 18, mass: 0.9 } });
    expect(webspringIconSprings.boot.duration).toBeCloseTo(0.921, 3);
    expect(webspringIconSprings.hold.duration).toBeCloseTo(0.921, 3);
    expect(webspringIconSprings.reorder.duration).toBeCloseTo(0.737, 3);
  });

  it("models each choreography state as a pose on the icon", () => {
    expect(icon("waiting").style).toEqual({ opacity: 0, transform: "translate(0px, 28px) scale(1.72)" });
    expect(icon("holding").style).toEqual({ opacity: 1, transform: "translate(0px, 14px) scale(1.3)" });
    expect(icon("ready").style).toEqual({ opacity: 1, transform: "none" });
    expect(icon("launching").style).toEqual(icon("covered").style);
    expect(icon("launching").style).toMatchObject({ opacity: 0, transform: expect.stringContaining("scale(2.85) rotate(5deg)") });
  });

  it("springs home on reveal after a staggered delay, and appears held or waiting without moving", () => {
    expect(into(icon("waiting").enter, null)).toBeNull();
    expect(into(icon("holding").enter, null)).toBeNull();
    const reveal = into(icon("ready", false, 2).enter, "holding")!;
    expect(reveal).toMatchObject({ duration: webspringIconSprings.boot.duration, delay: 0.2, timing: { kind: "spring", stiffness: 145 } });
    expect(endpoints(reveal)).toEqual({ opacity: [1, 1], transform: ["translate(0px, 14px) scale(1.3)", "none"] });
    // A fresh icon starts from its waiting pose.
    expect(endpoints(into(icon("ready").enter, null))).toMatchObject({ transform: ["translate(0px, 28px) scale(1.72)", "none"] });
    expect(into(icon("holding", false, 1).enter, "waiting")).toMatchObject({ delay: 0.175, timing: { stiffness: 185 } });
  });

  it("flies out last-first on launch, carries on into the cover, and springs back on return", () => {
    expect(into(icon("launching", false, 0).enter, "ready")).toMatchObject({ duration: 0.85, delay: 0.09 });
    expect(into(icon("launching", false, 2).enter, "ready")).toMatchObject({ duration: 0.85 });
    expect(into(icon("launching", false, 2).enter, "ready")).not.toHaveProperty("delay");
    expect(into(icon("covered").enter, "launching")).toBeNull();
    expect(into(icon("covered").enter, "ready")).toMatchObject({ duration: 0 });
    expect(endpoints(into(icon("returning").enter, "covered"))).toMatchObject({ opacity: [0, 1], transform: [expect.stringContaining("scale(2.85)"), "none"] });
    expect(into(icon("ready").enter, "returning")).toBeNull();
  });

  it("keeps only fades under reduced motion, including the launch exit", () => {
    expect(icon("holding", true).style).toEqual({ opacity: 1 });
    expect(icon("launching", true).style).toEqual({ opacity: 0 });
    expect(endpoints(into(icon("launching", true).enter, "ready"))).toEqual({ opacity: [1, 0] });
    expect(into(icon("ready", true).enter, "waiting")).toMatchObject({ duration: 0.08, timing: "ease-in-out" });
  });

  it("swells the orb only while launching, and only between launch and rest", () => {
    const launching = resolveWebspringOrbPresentation(false, true);
    expect(launching.style).toEqual({ transform: "translate(0px, 0px) scale(1.06)" });
    expect(into(launching.enter, null)).toBeNull();
    expect(endpoints(into(launching.enter, "rest"))).toEqual({ transform: ["none", "translate(0px, 0px) scale(1.06)"] });
    expect(endpoints(into(resolveWebspringOrbPresentation(false, false).enter, "launching"))).toEqual({ transform: ["translate(0px, 0px) scale(1.06)", "none"] });
    expect(resolveWebspringOrbPresentation(true, true)).toMatchObject({ style: {} });
    expect(into(resolveWebspringOrbPresentation(true, true).enter, "rest")).toBeNull();
  });
});
