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
import { describe, expect, it } from "vitest";
import * as animation from "../../../src/FX/AnimationFX/public";
import { BrowserAnimationLayerSurface } from "../../../src/SynCloudOS/PlatformAdapters/BrowserAnimationAdapter";
import { GFXColour } from "../../../src/FX/GraphicsFX/GFXColour";
import { GFXImage } from "../../../src/FX/GraphicsFX/GFXImage";
import type { AFXFrameScheduler, AFXLayerSurface } from "../../../src/FX/AnimationFX/AFXLayer";
import { AFXCompositionSnapshot } from "../../../src/FX/AnimationFX/AFXCompositionSnapshot";
import { createAFXLayer } from "../../../src/FX/AnimationFX/host";

const scheduler: AFXFrameScheduler = {
  now: () => 2.5,
  reducedMotion: false,
  suspended: false,
  requestFrame: () => () => {},
};

function layer(width: number, height: number) {
  const element = document.createElement("div");
  const value = createAFXLayer(animation.AFXLayer, new BrowserAnimationLayerSurface(element), scheduler);
  value.frame = { x: 0, y: 0, width, height };
  return { element, value };
}

function sublayer(width: number, height: number) {
  const value = new animation.AFXLayer();
  value.frame = { x: 0, y: 0, width, height };
  return value;
}

function portableSurface(): AFXLayerSurface {
  return {
    supportedProperties: ["frame", "opacity", "transform", "backgroundColour", "boxShadow"],
    supportedContentKinds: ["image", "shape", "gradient", "text", "emitter", "tiled"],
    supportsReplication: true,
    apply() {}, attach() {}, detach() {}, setMask() {}, dispose() {},
    createSublayerSurface: portableSurface,
  };
}

function portableLayer(width: number, height: number) {
  const value = createAFXLayer(animation.AFXLayer, portableSurface(), scheduler);
  value.frame = { x: 0, y: 0, width, height };
  return value;
}

describe("AnimationFX owned offscreen composition", () => {
  it("offers bounded offscreen rendering on AFXLayer without a public snapshot class", async () => {
    expect("AFXCompositionSnapshot" in animation).toBe(false);
    const value = portableLayer(2, 1);
    value.backgroundColour = GFXColour.rgba(1, 0, 0, 1);
    const image = await value.render({ x: 0, y: 0, width: 2, height: 1 }, 1);
    expect(image.pixel(0, 0).r).toBeGreaterThan(.9);
    expect(image.pixel(1, 0).r).toBeGreaterThan(.9);
    value.dispose();
  });

  it("captures an immutable owned subtree with explicit bounds, scale and time, and reports unmanaged DOM truthfully", () => {
    expect(AFXCompositionSnapshot).toBeTypeOf("function");

    const root = layer(8, 8);
    const child = sublayer(4, 4);
    child.position = { x: 3.25, y: 3.5 };
    child.backgroundColour = GFXColour.rgba(1, 0, 0, 1);
    root.value.addSublayer(child);
    const mask = sublayer(4, 4);
    mask.backgroundColour = GFXColour.rgba(1, 1, 1, 1);
    child.setMask(mask);

    const snapshot = AFXCompositionSnapshot.capture(root.value, {
      bounds: { x: 0, y: 0, width: 8, height: 8 },
      scale: 2,
      time: 2.5,
    });
    expect(snapshot.bounds).toEqual({ x: 0, y: 0, width: 8, height: 8 });
    expect(snapshot.scale).toBe(2);
    expect(snapshot.time).toBe(2.5);
    expect(snapshot.nodeCount).toBe(3);
    expect(snapshot.capability.state).toBe("portable-owned");
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.root)).toBe(true);

    const unmanaged = document.createElement("button");
    root.element.append(unmanaged);
    const unsupported = AFXCompositionSnapshot.capture(root.value, {
      bounds: { x: 0, y: 0, width: 8, height: 8 },
      scale: 1,
      time: 2.5,
    });
    expect(unsupported.capability.state).toBe("unsupported");
    expect(unsupported.capability.reason).toMatch(/unmanaged-dom/i);

    mask.dispose();
    root.value.dispose();
  });

  it("rasterizes nested clipped alpha masks including a projective mask and preserves group shadow/opacity ordering", async () => {
    expect(AFXCompositionSnapshot).toBeTypeOf("function");

    const root = portableLayer(12, 10);
    root.backgroundColour = GFXColour.rgba(0, 0, 0, 0);
    const shadowSource = sublayer(2, 2);
    shadowSource.position = { x: 1, y: 1 };
    shadowSource.backgroundColour = GFXColour.rgba(0, 0, 1, 1);
    shadowSource.shadowColour = GFXColour.rgba(0, 0, 0, 1);
    shadowSource.shadowOpacity = 0.5;
    shadowSource.shadowRadius = 0;
    shadowSource.shadowOffset = { x: 2, y: 0 };
    root.addSublayer(shadowSource);
    const card = sublayer(6, 6);
    card.position = { x: 6, y: 5 };
    card.backgroundColour = GFXColour.rgba(1, 0, 0, 1);
    card.opacity = 0.6;
    card.shadowColour = GFXColour.rgba(0, 0, 0, 1);
    card.shadowOpacity = 0.5;
    card.shadowRadius = 1;
    card.shadowOffset = { x: 1, y: 0 };
    card.clipsToBounds = true;
    root.addSublayer(card);

    const mask = sublayer(6, 6);
    mask.position = { x: 3, y: 3 };
    mask.backgroundColour = GFXColour.rgba(1, 1, 1, 1);
    mask.transform = animation.AFXTransform3D.perspective(80).multiply(
      animation.AFXTransform3D.rotation(Math.PI / 7, 0, 1, 0),
    );
    const innerMask = sublayer(3, 6);
    innerMask.position = { x: 1.5, y: 3 };
    innerMask.backgroundColour = GFXColour.rgba(1, 1, 1, 1);
    mask.setMask(innerMask);
    card.setMask(mask);

    const snapshot = AFXCompositionSnapshot.capture(root, {
      bounds: { x: 0, y: 0, width: 12, height: 10 },
      scale: 2,
      time: 2.5,
    });
    expect(snapshot.capability.state).toBe("portable-owned");
    const controller = new AbortController();
    const image = await snapshot.render({
      rect: snapshot.bounds,
      pixelWidth: 24,
      pixelHeight: 20,
      scale: 2,
    }, controller.signal);
    const alphas = Array.from({ length: image.width * image.height }, (_, index) =>
      image.pixel(index % image.width, Math.floor(index / image.width)).a,
    );
    expect(Math.max(...alphas)).toBeGreaterThan(0.45);
    expect(alphas.some((alpha) => alpha > 0 && alpha < 0.6)).toBe(true);
    expect(alphas.some((alpha) => alpha === 0)).toBe(true);
    expect(image.pixel(6, 2).a).toBeCloseTo(0.5, 1);

    innerMask.dispose();
    mask.dispose();
    shadowSource.dispose();
    root.dispose();
  });

  it("matches full and tiled rendering within one RGBA8 level", async () => {
    expect(AFXCompositionSnapshot).toBeTypeOf("function");

    const root = layer(8, 4);
    root.value.backgroundColour = GFXColour.rgba(0.1, 0.2, 0.3, 1);
    const child = sublayer(4, 4);
    child.position = { x: 4, y: 2 };
    child.contents = new GFXImage({
      width: 2,
      height: 2,
      alpha: "straight",
      colourSpace: "srgb",
      data: new Uint8Array([
        255, 0, 0, 255, 0, 255, 0, 255,
        0, 0, 255, 255, 255, 255, 255, 255,
      ]),
    });
    root.value.addSublayer(child);
    const snapshot = AFXCompositionSnapshot.capture(root.value, {
      bounds: { x: 0, y: 0, width: 8, height: 4 },
      scale: 2,
      time: 2.5,
    });
    const full = await snapshot.render({
      rect: snapshot.bounds,
      pixelWidth: 16,
      pixelHeight: 8,
      scale: 2,
    }, new AbortController().signal);
    const left = await snapshot.render({
      rect: { x: 0, y: 0, width: 4, height: 4 },
      pixelWidth: 8,
      pixelHeight: 8,
      scale: 2,
    }, new AbortController().signal);
    const right = await snapshot.render({
      rect: { x: 4, y: 0, width: 4, height: 4 },
      pixelWidth: 8,
      pixelHeight: 8,
      scale: 2,
    }, new AbortController().signal);
    for (let y = 0; y < full.height; y += 1) {
      for (let x = 0; x < full.width; x += 1) {
        const expected = full.pixel(x, y);
        const actual = (x < 8 ? left : right).pixel(x < 8 ? x : x - 8, y);
        for (const key of ["r", "g", "b", "a"] as const)
          expect(Math.abs(expected[key] - actual[key]) * 255).toBeLessThanOrEqual(1.01);
      }
    }
    root.value.dispose();
  });

});
