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
import { act, fireEvent, render, renderHook } from "@testing-library/react";
import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NSE } from "../../src/NSE/NSE";
import { NSEPage } from "../../src/NSE/Page/NSEPage";
import { NSEPageController } from "../../src/NSE/Page/NSEPageController";
import { useNSEPage } from "../../src/NSE/Page/useNSEPage";
import {
  getNSEPageAxis,
  getNSEPageNearestEdge,
  getNSEPageProgressFromPoint,
  isNSEPageBookSurfaceActive,
  isNSEPagePointNearEdge,
  resolveNSEPageBookStripGeometry,
  resolveNSEPageGeometry
} from "../../src/NSE/Page/nsePageGeometry";
import { getNSEPagePreset } from "../../src/NSE/Page/nsePagePresets";
import type { NSEPageHandle } from "../../src/NSE/Page/nsePageTypes";

const CURL_SIZE = { width: 400, height: 600 };

function rect(bounds: Partial<DOMRect> = {}) {
  return {
    left: 0,
    top: 0,
    right: 320,
    bottom: 480,
    width: 320,
    height: 480,
    x: 0,
    y: 0,
    toJSON: () => ({}),
    ...bounds
  } as DOMRect;
}

function resolveCurl(
  progress: number,
  overrides: { reducedMotion?: boolean; pointer?: { x: number; y: number } } = {}
) {
  const preset = getNSEPagePreset("settingsPeel");
  return resolveNSEPageGeometry({
    progress,
    mode: preset.mode,
    edge: preset.edge,
    corner: preset.corner,
    direction: preset.direction,
    motion: preset.motion,
    material: preset.material,
    size: CURL_SIZE,
    pointer: overrides.pointer,
    reducedMotion: overrides.reducedMotion
  });
}

describe("NSEPage geometry", () => {
  it("carries a book corner across the whole spread and lands at the opposite outer edge", () => {
    const preset = getNSEPagePreset("settingsPeel", { motion: { curlPath: "book", projection: "spread" } });
    const resolve = (progress: number, corner: "bottom-right" | "bottom-left") => resolveNSEPageGeometry({
      progress, corner, mode: "curl", edge: corner === "bottom-right" ? "right" : "left",
      direction: corner === "bottom-right" ? "forward" : "backward", motion: preset.motion,
      material: preset.material, size: CURL_SIZE
    });
    const right = resolve(1, "bottom-right");
    expect(right.curledCorner).toEqual({ x: -400, y: 600 });
    expect(right.frontClipPath).toBe("polygon(0 0, 0 0, 0 0)");
    const left = resolve(1, "bottom-left");
    expect(left.curledCorner).toEqual({ x: 800, y: 600 });
    expect(resolve(.25, "bottom-right").foldAngleDeg).not.toBe(-90);
    expect(resolve(.5, "bottom-right").insideOpacity).toBe(1);
  });
  it("hinges a book leaf at the spine without double-applying direction", () => {
    const preset = getNSEPagePreset("bookTurn");
    const resolveBook = (edge: "left" | "right", direction: "forward" | "backward", progress = 0.5) =>
      resolveNSEPageGeometry({
        progress,
        mode: preset.mode,
        edge,
        direction,
        phase: progress === 1 ? "idle" : "turning",
        motion: preset.motion,
        material: preset.material
      });

    const forward = resolveBook("right", "forward");
    expect(forward.bookTurn).toBe(true);
    expect(forward.transformOrigin).toBe("0% 50%");
    expect(forward.signedAngle).toBe(-90);
    expect(forward.sheetTransform).toBe("rotateY(-90.000deg) translate3d(0.000px, 0.000px, 0.000px)");
    expect(forward.liftPx).toBe(0);
    expect(forward.projection).toBe("spread");
    expect(forward.insideInteractive).toBe(false);
    expect(forward.insideOpacity).toBe(1);

    const backward = resolveBook("left", "backward");
    expect(backward.transformOrigin).toBe("100% 50%");
    expect(backward.signedAngle).toBe(90);

    const endpoint = resolveBook("right", "forward", 1);
    expect(endpoint.signedAngle).toBe(-180);
    expect(endpoint.liftPx).toBe(0);
    expect(endpoint.insideInteractive).toBe(true);

    const edgeHinge = getNSEPagePreset("bookTurn", { motion: { hinge: "edge" } });
    const overridden = resolveNSEPageGeometry({
      progress: 0.5,
      mode: edgeHinge.mode,
      edge: edgeHinge.edge,
      direction: edgeHinge.direction,
      phase: "turning",
      motion: edgeHinge.motion,
      material: edgeHinge.material
    });
    expect(overridden.bookTurn).toBe(false);
    expect(overridden.transformOrigin).toBe("100% 50%");
    expect(isNSEPageBookSurfaceActive(overridden)).toBe(false);
  });

  it("keeps snapshot strips through a turning endpoint and retires them on completion", () => {
    const preset = getNSEPagePreset("bookTurn");
    const geometryAt = (progress: number, phase: "idle" | "turning") => resolveNSEPageGeometry({
      progress,
      mode: preset.mode,
      edge: preset.edge,
      direction: preset.direction,
      phase,
      motion: preset.motion,
      material: preset.material
    });

    expect(isNSEPageBookSurfaceActive(geometryAt(0, "idle"))).toBe(false);
    expect(isNSEPageBookSurfaceActive(geometryAt(0, "turning"))).toBe(true);
    expect(isNSEPageBookSurfaceActive(geometryAt(0.5, "idle"))).toBe(true);
    expect(isNSEPageBookSurfaceActive(geometryAt(1, "turning"))).toBe(true);
    expect(isNSEPageBookSurfaceActive(geometryAt(1, "idle"))).toBe(false);
  });

  it("preserves book-strip length, spine anchoring, and flat endpoints", () => {
    const mid = resolveNSEPageBookStripGeometry({
      progress: 0.5,
      edge: "right",
      direction: "forward",
      size: { width: 400, height: 600 },
      stripCount: 20,
      rollWidth: 0.28
    });

    expect(mid).toHaveLength(20);
    expect(mid[0]?.hinge).toEqual({ x: 0, z: 0 });
    for (const strip of mid) {
      expect(Math.hypot(strip.outer.x - strip.hinge.x, strip.outer.z - strip.hinge.z)).toBeCloseTo(20, 8);
      expect(strip.angleDeg).toBeGreaterThanOrEqual(-180);
      expect(strip.angleDeg).toBeLessThanOrEqual(0);
      expect(strip.renderWidth).toBe(20.5);
      expect(strip.frontFaceTransform).toBe("rotateY(0deg)");
      expect(strip.backFaceTransform).toBe("rotateY(180deg)");
      expect(strip.frontBackgroundOffsetX).toBe(-strip.visualIndex * 20);
      expect(strip.backBackgroundOffsetX).toBe(-(19 - strip.visualIndex) * 20);
    }
    for (let index = 1; index < mid.length; index += 1) {
      expect(mid[index]?.hinge.x).toBeCloseTo(mid[index - 1]?.outer.x ?? 0, 8);
      expect(mid[index]?.hinge.z).toBeCloseTo(mid[index - 1]?.outer.z ?? 0, 8);
    }

    const closed = resolveNSEPageBookStripGeometry({
      progress: 0,
      edge: "right",
      direction: "forward",
      size: { width: 400, height: 600 },
      stripCount: 20,
      rollWidth: 0.28
    });
    const open = resolveNSEPageBookStripGeometry({
      progress: 1,
      edge: "right",
      direction: "forward",
      size: { width: 400, height: 600 },
      stripCount: 20,
      rollWidth: 0.28
    });
    expect(closed.every((strip) => strip.hinge.z === 0 && strip.outer.z === 0 && strip.angleDeg === 0)).toBe(true);
    expect(open.every((strip) => strip.hinge.z === 0 && strip.outer.z === 0 && strip.angleDeg === -180)).toBe(true);
    expect(open.at(-1)?.outer.x).toBe(-400);

    const backward = resolveNSEPageBookStripGeometry({
      progress: 1,
      edge: "left",
      direction: "backward",
      size: { width: 400, height: 600 },
      stripCount: 20,
      rollWidth: 0.28
    });
    expect(backward[0]?.hinge).toEqual({ x: 400, z: 0 });
    expect(backward.every((strip) => strip.angleDeg === 180)).toBe(true);
    expect(backward.at(-1)?.outer.x).toBe(800);
  });

  it("lifts the fore edge first and carries the fold toward the binding", () => {
    const leaf = (progress: number) => resolveNSEPageBookStripGeometry({
      progress, edge: "right", direction: "forward", size: { width: 400, height: 600 }, stripCount: 32
    });
    const early = leaf(0.1);
    expect(early.slice(0, 16).every(strip => strip.angleDeg === 0)).toBe(true);
    expect(early.at(-1)!.angleDeg).toBeLessThan(-15);
    const halfway = leaf(0.5);
    expect(halfway[0]!.angleDeg).toBe(0);
    expect(halfway.at(-1)!.angleDeg).toBe(-180);
    expect(Math.max(...halfway.map(strip => strip.outer.z))).toBeLessThan(100);
    expect(leaf(0.75).filter(strip => strip.angleDeg === 0).length)
      .toBeLessThan(early.filter(strip => strip.angleDeg === 0).length);
  });

  it("resolves a right-edge paper turn into stable 3D transforms", () => {
    const preset = getNSEPagePreset("paperTurn");
    const geometry = resolveNSEPageGeometry({
      progress: 0.5,
      mode: preset.mode,
      edge: preset.edge,
      direction: preset.direction,
      motion: preset.motion,
      material: preset.material
    });

    expect(geometry.axis).toBe("y");
    expect(geometry.transformOrigin).toBe("100% 50%");
    expect(Math.round(geometry.signedAngle)).toBe(-89);
    expect(geometry.sheetTransform).toContain("perspective(1200px) rotateY(-89.000deg)");
    expect(geometry.backFaceTransform).toBe("rotateY(180deg)");
    expect(geometry.shadowOpacity).toBeGreaterThan(0.4);
    expect(geometry.insideInteractive).toBe(false);
  });

  it("models the curl as a fold line anchored at the bottom-right corner", () => {
    const geometry = resolveCurl(0.5);

    expect(geometry.mode).toBe("curl");
    expect(geometry.frontClipPath).toContain("polygon(");
    expect(geometry.curlClipPath).toContain("polygon(");
    // The flap is the page region beyond the fold line, mirrored across it.
    expect(geometry.curlFlapTransform).toContain("scaleY(-1)");
    expect(geometry.curlFlapTransform).toContain("rotate(");
    // For a bottom-right curl the crease runs from lower-left to upper-right.
    expect(geometry.foldAngleDeg).toBeGreaterThan(-90);
    expect(geometry.foldAngleDeg).toBeLessThan(0);
    // Both crease endpoints sit on the page bounds.
    for (const point of [
      { x: geometry.foldLine.x1, y: geometry.foldLine.y1 },
      { x: geometry.foldLine.x2, y: geometry.foldLine.y2 }
    ]) {
      expect(point.x).toBeGreaterThanOrEqual(-0.5);
      expect(point.x).toBeLessThanOrEqual(CURL_SIZE.width + 0.5);
      expect(point.y).toBeGreaterThanOrEqual(-0.5);
      expect(point.y).toBeLessThanOrEqual(CURL_SIZE.height + 0.5);
    }
    expect(geometry.insideInteractive).toBe(true);
  });

  it("advances the curled corner along an arc, not a straight line", () => {
    const corner = { x: CURL_SIZE.width, y: CURL_SIZE.height };
    const early = resolveCurl(0.2);
    const late = resolveCurl(0.8);

    const travel = (point: { x: number; y: number }) =>
      Math.hypot(point.x - corner.x, point.y - corner.y);
    const heading = (point: { x: number; y: number }) =>
      Math.atan2(point.y - corner.y, point.x - corner.x) * (180 / Math.PI);

    expect(travel(late.curledCorner)).toBeGreaterThan(travel(early.curledCorner));
    // The peel direction rotates as the page comes over: a curved corner path.
    expect(Math.abs(heading(late.curledCorner) - heading(early.curledCorner))).toBeGreaterThan(4);
  });

  it("keeps the corner hit-area active until the page is properly open", () => {
    expect(resolveCurl(0).dogEarOpacity).toBe(1);
    expect(resolveCurl(0.095).dogEarOpacity).toBe(1);
    expect(resolveCurl(0.25).dogEarOpacity).toBeGreaterThan(0);
    expect(resolveCurl(0.5).dogEarOpacity).toBe(0);
  });

  it("steers the fold toward a dragged pointer while keeping the diagonal curl character", () => {
    const pointer = { x: 200, y: 300 };
    const corner = { x: CURL_SIZE.width, y: CURL_SIZE.height };
    const geometry = resolveCurl(0.4, { pointer });

    // The curled corner chases the pointer...
    const remaining = Math.hypot(geometry.curledCorner.x - pointer.x, geometry.curledCorner.y - pointer.y);
    const full = Math.hypot(pointer.x - corner.x, pointer.y - corner.y);
    expect(remaining).toBeLessThan(full * 0.25);
    // ...but the blend with the canonical peel keeps the lift up-and-over,
    // never a pure sideways book turn.
    expect(geometry.curledCorner.y).toBeLessThan(corner.y - 1);

    // A hard sideways drag still produces a diagonal fold.
    const sideways = resolveCurl(0.4, { pointer: { x: 40, y: CURL_SIZE.height - 2 } });
    expect(sideways.curledCorner.y).toBeLessThan(corner.y - 40);
  });

  it("emits fold-aligned shading, rim, and a cast shadow for the curl", () => {
    const geometry = resolveCurl(0.55);

    expect(geometry.curlShadeBackground).toContain("linear-gradient(");
    expect(geometry.curlShadowBackground).toContain("linear-gradient(");
    expect(geometry.curlShadowBackground).toContain("rgba(");
    expect(geometry.curlFlapShadowFilter).toContain("drop-shadow(");
    expect(geometry.shadowOpacity).toBeGreaterThan(0.2);
  });

  it("collapses the curl into a crossfade when motion is reduced", () => {
    const geometry = resolveCurl(0.7, { reducedMotion: true });

    expect(geometry.reduced).toBe(true);
    expect(geometry.curlClipPath).toBe("none");
    expect(geometry.curlFlapTransform).toBe("none");
    expect(geometry.frontClipPath).toBe("none");
    expect(geometry.dogEarOpacity).toBe(1);
    expect(geometry.frontOpacity).toBeLessThan(0.3);
    expect(geometry.insideOpacity).toBeGreaterThan(0.7);
    expect(geometry.frontOpacity + geometry.insideOpacity).toBeCloseTo(1, 1);
  });

  it("keeps edge hit-testing helpers for touch surfaces", () => {
    const bounds = rect();
    expect(getNSEPageAxis("bottom")).toBe("x");
    expect(getNSEPageNearestEdge({ x: 300, y: 16 }, bounds, ["top", "right"])).toBe("top");
    expect(isNSEPagePointNearEdge({ x: 318, y: 240 }, bounds, "right", 24)).toBe(true);
    expect(getNSEPageProgressFromPoint("right", { x: 160, y: 240 }, bounds)).toBe(0.5);
  });
});

describe("NSEPageController", () => {
  it("publishes progress, gesture, tear, and reset snapshots", () => {
    const controller = new NSEPageController({ progress: 0.2, edge: "right" });
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    controller.startDrag({ progress: 0.1, edge: "left" });
    controller.setProgress(0.72, "gesture");
    controller.tear({ edge: "right" });

    expect(controller.getSnapshot()).toMatchObject({
      progress: 1,
      targetProgress: 1,
      phase: "torn",
      mode: "tear",
      edge: "right",
      torn: true,
      reason: "tear"
    });
    expect(listener).toHaveBeenCalledTimes(4);

    unsubscribe();
    controller.reset();
    expect(listener).toHaveBeenCalledTimes(4);
    expect(controller.getSnapshot()).toMatchObject({
      progress: 0,
      phase: "idle",
      torn: false,
      reason: "reset"
    });
  });
});

describe("NSEPage React surface", () => {
  it("renders snapshot-backed book strips while keeping one semantic front and back tree", () => {
    const markup = renderToStaticMarkup(createElement(NSEPage, {
      preset: "bookTurn",
      progress: 0.5,
      turnSurface: { front: "data:image/png;base64,FRONT", back: "data:image/png;base64,BACK", strips: 2 },
      front: createElement("article", null, "LiveFront"),
      back: createElement("article", null, "LiveBack")
    }));

    expect(markup).toContain("nse-page-preset-book-turn");
    expect(markup).toContain("data-projection=\"spread\"");
    expect(markup).toContain("data-controlled=\"true\"");
    expect(markup).toContain("data-book-surface=\"true\"");
    expect(markup.split("class=\"nse-page__book-strip\"").length - 1).toBe(2);
    expect(markup.split("LiveFront").length - 1).toBe(1);
    expect(markup.split("LiveBack").length - 1).toBe(1);
    expect(markup).toContain("background-image:url(&quot;data:image/png;base64,FRONT&quot;)");
    expect(markup).toContain("background-image:url(&quot;data:image/png;base64,BACK&quot;)");
    expect(markup).toContain("background-position:-240px 0px");
  });

  it("keeps a blank reverse on the rigid book fallback", () => {
    const markup = renderToStaticMarkup(createElement(NSEPage, {
      preset: "bookTurn",
      progress: 0.5,
      front: "OnlyLiveFront",
      inside: "Destination"
    }));

    expect(markup.split("OnlyLiveFront").length - 1).toBe(1);
    expect(markup.split("Destination").length - 1).toBe(1);
    expect(markup).not.toContain("data-book-surface=\"true\"");

    const ordinaryTurn = renderToStaticMarkup(createElement(NSEPage, {
      preset: "bookTurn",
      presetOverrides: { motion: { hinge: "edge" } },
      progress: 0.5,
      turnSurface: { front: "data:image/png;base64,FRONT", back: "data:image/png;base64,BACK" },
      front: "OverriddenFront"
    }));
    expect(ordinaryTurn).toContain("data-book-turn=\"false\"");
    expect(ordinaryTurn).toContain("data-book-surface=\"false\"");
  });

  it("renders front, inside, data attributes, and CSS variables without app wiring", () => {
    const markup = renderToStaticMarkup(createElement(NSEPage, {
      preset: "settingsPeel",
      open: true,
      interactive: true,
      "aria-label": "Peel app surface",
      front: createElement("div", { className: "front-screen" }, "Map"),
      inside: createElement("button", { type: "button" }, "Settings")
    }));

    expect(markup).toContain("data-nse-page=\"true\"");
    expect(markup).toContain("nse-page-preset-settings-peel");
    expect(markup).toContain("data-mode=\"curl\"");
    expect(markup).toContain("data-edge=\"bottom\"");
    expect(markup).toContain("data-revealed=\"true\"");
    expect(markup).toContain("--nse-page-progress:0.5");
    expect(markup).toContain("Map");
    expect(markup).toContain("Settings");
  });

  it("reveals inside content behind the page", () => {
    const markup = renderToStaticMarkup(createElement(
      NSEPage,
      { preset: "settingsPeel", inside: createElement("nav", null, "SettingsPanel") },
      createElement("p", null, "MainContent")
    ));

    expect(markup).toContain("SettingsPanel");
    expect(markup).toContain("MainContent");
    expect(markup).toContain("nse-page__inside");
  });

  it("rests on a real fold with an invisible corner hit-area in curl mode only", () => {
    const curlMarkup = renderToStaticMarkup(createElement(NSEPage, {
      preset: "settingsPeel",
      front: "Map"
    }));
    const turnMarkup = renderToStaticMarkup(createElement(NSEPage, {
      preset: "paperTurn",
      front: "Paper"
    }));

    // Closed pose is the preset's resting fold, not a flat page.
    expect(curlMarkup).toContain("data-progress=\"0.035\"");
    expect(curlMarkup).toContain("data-curling=\"false\"");
    expect(curlMarkup).toContain("nse-page__dogear");
    expect(curlMarkup).toContain("type=\"button\"");
    expect(turnMarkup).not.toContain("nse-page__dogear");
  });

  it("mounts the front once unless the flap ghost is requested", () => {
    const ghosted = renderToStaticMarkup(createElement(NSEPage, {
      preset: "settingsPeel",
      front: "UniqueFrontSurface",
      backGhost: true
    }));
    const plain = renderToStaticMarkup(createElement(NSEPage, {
      preset: "settingsPeel",
      front: "UniqueFrontSurface"
    }));

    expect(ghosted).toContain("nse-page__curl-ghost");
    expect(ghosted.split("UniqueFrontSurface").length - 1).toBe(2);
    expect(plain).not.toContain("nse-page__curl-ghost");
    expect(plain.split("UniqueFrontSurface").length - 1).toBe(1);
  });

  it("keeps the aria-hidden curl duplicate inert so consumer controls cannot intercept pointer input", () => {
    const markup = renderToStaticMarkup(createElement(NSEPage, {
      preset: "bookCurl",
      front: createElement("button", { type: "button" }, "Semantic control"),
      back: createElement("button", { type: "button" }, "Visual duplicate")
    }));

    expect(markup).toContain('class="nse-page__curl-carrier" aria-hidden="true" inert=""');
  });

  it("marks the page as curling so it can elevate above app chrome", () => {
    const markup = renderToStaticMarkup(createElement(NSEPage, {
      preset: "settingsPeel",
      open: true,
      front: "Map"
    }));

    expect(markup).toContain("data-curling=\"true\"");
  });

  it("keeps fractional controlled progress and pointer gestures opt-in", () => {
    const markup = renderToStaticMarkup(createElement(NSEPage, {
      progress: 0.42,
      front: "Paper"
    }));

    expect(markup).toContain("data-progress=\"0.420\"");
    expect(markup).toContain("data-interactive=\"false\"");
    expect(markup).toContain("--nse-page-progress:0.42");
  });

  it("exposes the component and control surface through NSE", () => {
    expect(NSE.NSEPage).toBe(NSE.Page.Root);
    expect(NSE.Page.Controller).toBe(NSEPageController);
    expect(NSE.Page.presets.paperTurn.name).toBe("paperTurn");
    expect(NSE.Page.getPreset("tearAway").mode).toBe("tear");
    expect("Surface" in NSE.Page).toBe(false);
  });
});

describe("useNSEPage lifecycle", () => {
  it("snaps from the final pending pointer sample released in the same frame", () => {
    const pageRef = createRef<NSEPageHandle>();
    const { container, unmount } = render(createElement(NSEPage, {
      ref: pageRef,
      preset: "bookTurn",
      interactive: { edges: ["right"] },
      durationMs: 0,
      reducedMotion: false,
      front: "Page"
    }));
    const root = container.querySelector<HTMLElement>("[data-nse-page]");
    expect(root).not.toBeNull();
    if (!root) return;
    Object.defineProperties(root, {
      getBoundingClientRect: { configurable: true, value: () => rect() },
      setPointerCapture: { configurable: true, value: vi.fn() },
      releasePointerCapture: { configurable: true, value: vi.fn() }
    });

    fireEvent.pointerDown(root, { pointerId: 7, button: 0, clientX: 318, clientY: 240 });
    fireEvent.pointerMove(root, { pointerId: 7, buttons: 1, clientX: 64, clientY: 240 });
    fireEvent.pointerUp(root, { pointerId: 7, button: 0, clientX: 64, clientY: 240 });

    expect(pageRef.current?.getSnapshot()).toMatchObject({ progress: 1, phase: "idle" });
    unmount();
  });

  it("balances start and end events when an active turn is superseded", () => {
    vi.useFakeTimers();
    const onTurnStart = vi.fn();
    const onTurnEnd = vi.fn();
    const onPhaseChange = vi.fn();
    const { result, unmount } = renderHook(() => useNSEPage({
      preset: "bookTurn",
      reducedMotion: false,
      onTurnStart,
      onTurnEnd,
      onPhaseChange
    }));

    act(() => result.current.handle.turnTo(1, { durationMs: 100 }));
    act(() => result.current.handle.turnTo(0, { durationMs: 100 }));
    act(() => vi.runAllTimers());

    expect(onTurnStart).toHaveBeenCalledTimes(2);
    expect(onTurnEnd).toHaveBeenCalledTimes(2);
    expect(onTurnEnd.mock.calls[0]?.[0].reason).toBe("superseded");
    expect(onTurnEnd.mock.calls[1]?.[0].reason).toBe("programmatic");
    expect(onPhaseChange.mock.calls.map(([phase]) => phase)).toContain("canceling");

    unmount();
    vi.useRealTimers();
  });

  it("cancels one active turn without starting a replacement turn", () => {
    vi.useFakeTimers();
    const onTurnStart = vi.fn();
    const onTurnEnd = vi.fn();
    const onPhaseChange = vi.fn();
    const { result, unmount } = renderHook(() => useNSEPage({
      preset: "bookTurn",
      reducedMotion: false,
      onTurnStart,
      onTurnEnd,
      onPhaseChange
    }));

    act(() => result.current.handle.turnTo(1, { durationMs: 100 }));
    act(() => result.current.handle.cancel());
    act(() => vi.runAllTimers());

    expect(onTurnStart).toHaveBeenCalledTimes(1);
    expect(onTurnEnd).toHaveBeenCalledTimes(1);
    expect(onTurnEnd.mock.calls[0]?.[0].reason).toBe("cancel");
    expect(onTurnEnd.mock.calls[0]?.[0].snapshot).toMatchObject({ progress: 0, phase: "idle", reason: "cancel" });
    expect(onPhaseChange.mock.calls.map(([phase]) => phase)).toContain("canceling");
    expect(result.current.handle.getSnapshot()).toMatchObject({ progress: 0, phase: "idle", reason: "cancel" });

    unmount();
    vi.useRealTimers();
  });
});
