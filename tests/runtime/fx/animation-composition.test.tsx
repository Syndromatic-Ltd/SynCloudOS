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
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import {
  AFXAnimation,
  AFXBasicAnimation,
  AFXGradientLayer,
  AFXLayer,
  AFXSpringAnimation,
  AFXTransaction,
  type AFXFrameScheduler,
} from "../../../src/FX/AnimationFX/public";
import { BrowserAnimationLayerSurface } from "../../../src/SynCloudOS/PlatformAdapters/BrowserAnimationAdapter";
import { createAFXLayer } from "../../../src/FX/AnimationFX/host";
import { layerContentSVG } from "../../../src/SynCloudOS/PlatformAdapters/BrowserAnimationLayerContent";
import { GFXColour } from "../../../src/FX/GraphicsFX/GFXColour";
import { GFXGradient } from "../../../src/FX/GraphicsFX/GFXGradient";
import { GFXImage } from "../../../src/FX/GraphicsFX/GFXImage";

function clock() {
  let now = 0;
  const pending = new Set<(timestamp: number) => void>();
  const scheduler: AFXFrameScheduler = {
    now: () => now,
    reducedMotion: false,
    suspended: false,
    requestFrame(callback) {
      pending.add(callback);
      return () => pending.delete(callback);
    },
  };
  return {
    scheduler,
    advance(seconds: number) {
      now = seconds;
      const callbacks = [...pending];
      pending.clear();
      for (const callback of callbacks) callback(seconds);
    },
  };
}

function boundLayer<T extends AFXLayer>(
  Type: new () => T,
  scheduler: AFXFrameScheduler,
  width: number,
  height: number,
) {
  const element = document.createElement("div");
  const value = createAFXLayer(Type, new BrowserAnimationLayerSurface(element), scheduler);
  value.frame = { x: 0, y: 0, width, height };
  return { element, value };
}

async function renderedContentPixels(element: HTMLElement, width: number, height: number) {
  const content = element.querySelector("svg[data-afx-content]");
  if (!content) throw new Error("Expected projected layer content.");
  const viewBox = content.getAttribute("viewBox") ?? `0 0 ${width} ${height}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">${content.innerHTML}</svg>`;
  const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return (x: number, y: number) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)];
}

const image = (width: number, pixels: readonly number[]) =>
  new GFXImage({
    width,
    height: 1,
    alpha: "straight",
    colourSpace: "srgb",
    data: Uint8Array.from(pixels),
  });

describe("AnimationFX layer composition depth", () => {
  it("projects independent in-bounds image crops from one source without resampling each layer", () => {
    const atlas = image(4, [255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255]);
    const sample = vi.spyOn(GFXImage.prototype, "sample");
    try {
      const views = [0, 0.5].map((x) => layerContentSVG({ kind: "image", image: atlas },
        { x: 0, y: 0, width: 100, height: 50 }, `tile-${x}`,
        { contentsRect: { x, y: 0, width: 0.5, height: 1 }, contentsCenter: { x: 0, y: 0, width: 1, height: 1 }, contentsGravity: "resize" }));
      const images = views.map((markup) => [...markup.matchAll(/<image\s[^>]*href="([^"]+)"/g)]);
      expect(images.map((entries) => entries.length)).toEqual([1, 1]);
      expect(images[0]?.[0]?.[1]).toBe(images[1]?.[0]?.[1]);
      expect(sample).not.toHaveBeenCalled();
    } finally { sample.mockRestore(); }
  });
  it("projects image contentsRect with clamped edge extension and rejects an empty crop atomically", async () => {
    const c = clock();
    const { element, value } = boundLayer(AFXLayer, c.scheduler, 4, 1);
    value.contents = image(2, [255, 0, 0, 255, 0, 0, 255, 255]);
    value.contentsRect = { x: -0.5, y: 0, width: 2, height: 1 };

    const pixels = await renderedContentPixels(element, 4, 1);
    expect(pixels(0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixels(1, 0)).toEqual([255, 0, 0, 255]);
    expect(pixels(2, 0)).toEqual([0, 0, 255, 255]);
    expect(pixels(3, 0)).toEqual([0, 0, 255, 255]);

    const before = element.innerHTML;
    expect(() => {
      value.contentsRect = { x: 0, y: 0, width: 0, height: 1 };
    }).toThrow(/crop|contentsRect/i);
    expect(element.innerHTML).toBe(before);
    value.dispose();
  });

  it("keeps nine-slice image edges fixed while the contentsCenter stretches", async () => {
    const c = clock();
    const { element, value } = boundLayer(AFXLayer, c.scheduler, 7, 1);
    value.contents = image(3, [
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
    ]);
    value.contentsCenter = { x: 1 / 3, y: 0, width: 1 / 3, height: 1 };
    const pixels = await renderedContentPixels(element, 7, 1);
    expect(pixels(0, 0)).toEqual([255, 0, 0, 255]);
    for (let x = 1; x < 6; x += 1)
      expect(pixels(x, 0)).toEqual([0, 255, 0, 255]);
    expect(pixels(6, 0)).toEqual([0, 0, 255, 255]);
    value.dispose();
  });

  it("applies explicit autoresizing policy to child geometry without direction-sensitive behavior", () => {
    const c = clock();
    const parent = boundLayer(AFXLayer, c.scheduler, 100, 80).value;
    const child = new AFXLayer();
    child.frame = { x: 10, y: 15, width: 40, height: 20 };
    child.autoresizingMask = ["width", "max-y-margin"];
    parent.addSublayer(child);
    parent.bounds = { x: 0, y: 0, width: 130, height: 100 };
    expect(child.frame).toEqual({ x: 10, y: 15, width: 70, height: 20 });
    expect(child.autoresizingMask).toEqual(["width", "max-y-margin"]);
    parent.dispose();
  });

  it("resolves typed implicit actions in property/delegate/class order and transaction disableActions suppresses them", async () => {
    const c = clock();
    const delegateAction = vi.fn(() => ({ duration: 1, timing: "linear" as const }));
    class DefaultActionLayer extends AFXLayer {
      protected defaultActionForKey(key: string) {
        return key === "opacity" ? { duration: 2, timing: "linear" as const } : undefined;
      }
    }
    const { value } = boundLayer(DefaultActionLayer, c.scheduler, 10, 10);
    value.delegate = { actionForKey: delegateAction };
    value.actions = { opacity: { duration: 0.5, timing: "linear" } };
    expect(value.actionForKey("opacity")?.duration).toBe(0.5);
    value.opacity = 0.2;
    expect(value.model.opacity).toBe(0.2);
    expect(value.presentation.opacity).toBe(1);
    expect(value.animationForKey("opacity")?.state).toBe("running");
    c.advance(0.25);
    expect(value.presentation.opacity).toBeCloseTo(0.6, 6);
    value.animationForKey("opacity")?.cancel();

    value.actions = {};
    expect(value.actionForKey("opacity")?.duration).toBe(1);
    expect(delegateAction).toHaveBeenCalled();
    value.delegate = { actionForKey: () => undefined };
    expect(value.actionForKey("opacity")?.duration).toBe(2);
    value.actions = { opacity: null };
    expect(value.actionForKey("opacity")).toBeNull();

    value.actions = { opacity: { duration: 1, timing: "linear" } };
    const transaction = new AFXTransaction(() => {
      throw new Error("disabled implicit changes must not invoke the explicit executor");
    });
    const handle = transaction.run({ disableActions: true }, () => {
      value.opacity = 0.4;
    });
    await expect(handle.finished).resolves.toMatchObject({ state: "completed" });
    expect(value.presentation.opacity).toBe(0.4);
    expect(value.animationForKey("opacity")).toBeNull();
    transaction.dispose();
    value.dispose();
  });

  it("edits gradient colours, locations and endpoints by replacing the canonical GFXGradient", () => {
    const c = clock();
    const { value } = boundLayer(AFXGradientLayer, c.scheduler, 20, 20);
    const initial = new GFXGradient([
      { offset: 0, colour: GFXColour.rgba(1, 0, 0) },
      { offset: 1, colour: GFXColour.rgba(0, 0, 1) },
    ]);
    value.gradient = initial;
    value.colours = [GFXColour.rgba(0, 1, 0), GFXColour.rgba(1, 1, 0)];
    expect(value.gradient).not.toBe(initial);
    expect(value.gradient?.stops.map((stop) => stop.colour.components)).toEqual([
      { r: 0, g: 1, b: 0, a: 1 },
      { r: 1, g: 1, b: 0, a: 1 },
    ]);
    value.locations = [0.2, 0.8];
    value.startPoint = { x: 0.1, y: 0.2 };
    value.endPoint = { x: 0.9, y: 0.7 };
    expect(value.gradient?.stops.map((stop) => stop.offset)).toEqual([0.2, 0.8]);
    expect(value.gradient?.geometry).toEqual({
      kind: "linear",
      start: { x: 0.1, y: 0.2 },
      end: { x: 0.9, y: 0.7 },
    });
    value.dispose();
  });

  it("retargets a spring from the sampled presentation and preserves delayed autoreversal boundaries", async () => {
    const c = clock();
    const { value } = boundLayer(AFXLayer, c.scheduler, 10, 10);
    value.opacity = 0;
    const first = value.addAnimation(new AFXSpringAnimation({
      targetId: "layer",
      keyPath: "opacity",
      from: 0,
      to: 1,
      options: { duration: 1 },
    }));
    first.seek(0.4);
    const sampled = value.presentation.opacity;
    const second = value.addAnimation(new AFXSpringAnimation({
      targetId: "layer",
      keyPath: "opacity",
      from: 0,
      to: 0.25,
      options: { duration: 1 },
    }));
    expect(value.presentation.opacity).toBeCloseTo(sampled, 9);
    await expect(first.finished).resolves.toMatchObject({ state: "interrupted" });
    second.cancel();

    const delayed = value.addAnimation(new AFXBasicAnimation({
      targetId: "layer",
      keyPath: "opacity",
      from: 0.25,
      to: 0.75,
      animation: new AFXAnimation({
        duration: 1,
        delay: 0.5,
        autoreverses: true,
        timing: "linear",
      }),
    }));
    const beforeDelay = value.presentation.opacity;
    delayed.seek(0.25);
    expect(value.presentation.opacity).toBeCloseTo(beforeDelay, 9);
    delayed.seek(1);
    expect(value.presentation.opacity).toBeCloseTo(0.5, 9);
    delayed.seek(2.5);
    expect(value.presentation.opacity).toBeCloseTo(0.25, 9);
    delayed.cancel();
    value.dispose();
  });
});
