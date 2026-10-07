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
import sharp from "sharp";
import {
  AFXLayer,
  type AFXFrameScheduler,
} from "../../../src/FX/AnimationFX/AFXLayer";
import { AFXShapeLayer } from "../../../src/FX/AnimationFX/AFXShapeLayer";
import { AFXGradientLayer } from "../../../src/FX/AnimationFX/AFXGradientLayer";
import { GFXPath } from "../../../src/FX/GraphicsFX/GFXPath";
import { GFXColour } from "../../../src/FX/GraphicsFX/GFXColour";
import { GFXGradient } from "../../../src/FX/GraphicsFX/GFXGradient";
import { BrowserAnimationLayerSurface } from "../../../src/SynCloudOS/PlatformAdapters/BrowserAnimationAdapter";
import { AFXAnimation } from "../../../src/FX/AnimationFX/AFXAnimation";
import { AFXBasicAnimation } from "../../../src/FX/AnimationFX/AFXBasicAnimation";
import { AFXKeyframeAnimation } from "../../../src/FX/AnimationFX/AFXKeyframeAnimation";
import type { AFXSampledAnimation } from "../../../src/FX/AnimationFX/AFXAnimationGroup";
const scheduler: AFXFrameScheduler = {
  now: () => 0,
  reducedMotion: false,
  suspended: false,
  requestFrame: () => () => {},
};
function layer<T extends AFXLayer>(
  Type: new (
    surface: BrowserAnimationLayerSurface,
    scheduler: AFXFrameScheduler,
  ) => T,
  width = 40,
  height = 40,
) {
  const element = document.createElement("div"),
    value = new Type(new BrowserAnimationLayerSurface(element), scheduler);
  value.frame = { x: 0, y: 0, width, height };
  return { element, value };
}
async function pixels(svg: string, width = 40, height = 40) {
  const input = svg
    .replace(
      "<svg",
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
        width +
        '" height="' +
        height +
        '"',
    )
    .replace(/ style="[^"]*"/, "");
  const { data, info } = await sharp(Buffer.from(input))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return (x: number, y: number) => [
    ...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4),
  ];
}
const maskSVG = (element: HTMLElement) => {
  const text = decodeURIComponent(element.style.maskImage);
  return text
    .slice(text.indexOf("<svg"), text.lastIndexOf("</svg>") + 6)
    .replace(' xmlns="http://www.w3.org/2000/svg"', "")
    .replace(/ width="[^"]*" height="[^"]*"/, "");
};
describe("AnimationFX specialized layer projection", () => {
  it("samples compatible shape paths into presentation content and retargets from the visible path", async () => {
    const { value } = layer(AFXShapeLayer, 120, 120);
    const path = (offset: number) => new GFXPath([
      { kind: "move", point: { x: offset, y: 10 + offset } },
      {
        kind: "curve",
        control1: { x: 20 + offset, y: 30 + offset },
        control2: { x: 40 + offset, y: 50 + offset },
        point: { x: 60 + offset, y: 70 + offset },
      },
      { kind: "close" },
    ]);
    const from = path(0), to = path(20), retargetTo = path(50);
    value.path = from;
    const first = value.addAnimation(new AFXBasicAnimation({
      targetId: "shape",
      keyPath: "path",
      from,
      to,
      animation: new AFXAnimation({ duration: 2, timing: "linear" }),
    }));
    first.seek(1);
    const midpoint = value.presentation.content;
    expect(midpoint?.kind).toBe("shape");
    if (midpoint?.kind !== "shape") throw new Error("Expected shape presentation.");
    expect(midpoint.path?.commands).toEqual([
      { kind: "move", point: { x: 10, y: 20 } },
      {
        kind: "curve",
        control1: { x: 30, y: 40 },
        control2: { x: 50, y: 60 },
        point: { x: 70, y: 80 },
      },
      { kind: "close" },
    ]);
    const model = value.model.content;
    expect(model?.kind === "shape" ? model.path : null).toBe(to);
    expect(value.path).toBe(to);

    const second = value.addAnimation(new AFXBasicAnimation({
      targetId: "shape",
      keyPath: "path",
      from,
      to: retargetTo,
      animation: new AFXAnimation({ duration: 2, timing: "linear" }),
    }));
    expect((await first.finished).state).toBe("interrupted");
    second.seek(1);
    const retargeted = value.presentation.content;
    if (retargeted?.kind !== "shape") throw new Error("Expected shape presentation.");
    expect(retargeted.path?.commands[0]).toEqual({ kind: "move", point: { x: 30, y: 40 } });
    second.cancel();
    expect((await second.finished).state).toBe("cancelled");
    const cancelledModel = value.model.content;
    expect(cancelledModel?.kind === "shape" ? cancelledModel.path : null).toBe(retargeted.path);
    expect(value.path).toBe(retargeted.path);
    value.path = from;
    expect(value.path).toBe(from);
    expect(value.model.content?.kind === "shape" ? value.model.content.path : null).toBe(from);
    value.dispose();
  });

  it("rejects incompatible path topology before changing model or surface content", () => {
    const { element, value } = layer(AFXShapeLayer);
    const from = GFXPath.rect({ x: 0, y: 0, width: 10, height: 10 });
    value.path = from;
    const before = element.innerHTML;
    expect(() => new AFXBasicAnimation({
      targetId: "shape",
      keyPath: "path",
      from,
      to: new GFXPath([
        { kind: "move", point: { x: 0, y: 0 } },
        { kind: "curve", control1: { x: 2, y: 0 }, control2: { x: 8, y: 10 }, point: { x: 10, y: 10 } },
      ]),
      animation: new AFXAnimation({ duration: 1 }),
    })).toThrow(/topology/i);
    expect(value.path).toBe(from);
    expect(element.innerHTML).toBe(before);
    value.dispose();
  });

  it("interpolates ordered gradient stops in premultiplied sRGB with geometry and transform", () => {
    const { value } = layer(AFXGradientLayer, 100, 100);
    const from = new GFXGradient([
      { offset: 0, colour: GFXColour.rgba(1, 0, 0, 0) },
      { offset: 0.4, colour: GFXColour.rgba(0, 1, 0, 1) },
    ], { kind: "linear", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } });
    const to = new GFXGradient([
      { offset: 0.2, colour: GFXColour.rgba(0, 0, 1, 1) },
      { offset: 1, colour: GFXColour.rgba(1, 1, 1, 0) },
    ], { kind: "linear", start: { x: 0.2, y: 0.4 }, end: { x: 0.8, y: 1 } }, {
      transform: { a: 2, b: 0.2, c: 0.4, d: 3, tx: 10, ty: 20 },
    });
    value.gradient = from;
    const handle = value.addAnimation(new AFXBasicAnimation({
      targetId: "gradient",
      keyPath: "gradient",
      from,
      to,
      animation: new AFXAnimation({ duration: 2, timing: "linear" }),
    }));
    handle.seek(1);
    const content = value.presentation.content;
    if (content?.kind !== "gradient" || !content.gradient) throw new Error("Expected gradient presentation.");
    expect(content.gradient.stops.map((stop) => stop.offset)).toEqual([0.1, 0.7]);
    expect(content.gradient.stops[0]!.colour.components).toEqual({ r: 0, g: 0, b: 1, a: 0.5 });
    expect(content.gradient.stops[1]!.colour.components).toEqual({ r: 0, g: 1, b: 0, a: 0.5 });
    expect(content.gradient.geometry).toEqual({ kind: "linear", start: { x: 0.1, y: 0.2 }, end: { x: 0.9, y: 0.5 } });
    expect(content.gradient.transform).toEqual({ a: 1.5, b: 0.1, c: 0.2, d: 2, tx: 5, ty: 10 });
    expect(value.model.content?.kind === "gradient" ? value.model.content.gradient : null).toBe(to);
    expect(value.gradient).toBe(to);
    handle.cancel();
    expect(value.gradient).toBe(content.gradient);
    value.gradient = from;
    expect(value.gradient).toBe(from);
    value.dispose();
  });
  it("snapshots a changing structural content animation once without consulting mutable samples", () => {
    const { element, value } = layer(AFXShapeLayer);
    const from = GFXPath.rect({ x: 0, y: 0, width: 10, height: 10 });
    const to = GFXPath.rect({ x: 10, y: 10, width: 20, height: 20 });
    value.path = from;
    const customMidpoint = GFXPath.rect({ x: 50, y: 50, width: 15, height: 15 });
    let runtimeCalls = 0, sampleCalls = 0, descriptorReads = 0, keyReads = 0, targetReads = 0, retargetReads = 0;
    const mutable: AFXSampledAnimation = {
      get targetId() { targetReads++; return "shape"; },
      get keyPath() { return ++keyReads === 1 ? "path" : "gradient"; },
      get retarget() { retargetReads++; return undefined; },
      animation: { totalDuration: 1 },
      sample: (seconds) => {
        sampleCalls++;
        return seconds === 0 ? from : seconds === 1 ? to : customMidpoint;
      },
      get toRuntime() {
        descriptorReads++;
        value.removeAllAnimations();
        return () => ++runtimeCalls === 1
          ? { animations: [{ targetId: "shape", keyPath: "path", from, to }], duration: 1, timing: "linear" }
          : { animations: [{ targetId: "shape", keyPath: "path", from, to: 42 }], duration: 1, timing: "linear" };
      },
    };
    const handle = value.addAnimation(mutable);
    handle.seek(0.5);
    expect(value.presentation.content?.kind === "shape" ? value.presentation.content.path?.commands[0] : null)
      .toEqual({ kind: "move", point: { x: 50, y: 50 } });
    expect({ runtimeCalls, sampleCalls, descriptorReads, keyReads, targetReads, retargetReads }).toEqual({
      runtimeCalls: 1,
      sampleCalls: 3,
      descriptorReads: 1,
      keyReads: 1,
      targetReads: 1,
      retargetReads: 0,
    });
    expect(value.path).toBe(to);
    expect(element.querySelector("svg")).not.toBeNull();
    handle.cancel();
    value.dispose();
  });
  it("rejects an incompatible structural content snapshot without changing model or surface", () => {
    const { element, value } = layer(AFXShapeLayer);
    const from = GFXPath.rect({ x: 0, y: 0, width: 10, height: 10 });
    const to = GFXPath.rect({ x: 10, y: 10, width: 20, height: 20 });
    value.path = from;
    const before = element.innerHTML;
    let sampleCalls = 0;
    const invalid: AFXSampledAnimation = {
      targetId: "shape",
      keyPath: "path",
      animation: { totalDuration: 1 },
      sample: (seconds) => {
        sampleCalls++;
        return seconds === 1 ? to : 42;
      },
      toRuntime: () => ({
        animations: [{ targetId: "shape", keyPath: "path", from, to }],
        duration: 1,
      }),
    };
    expect(() => value.addAnimation(invalid)).toThrow(/sample requires canonical GFXPath/i);
    expect(sampleCalls).toBe(2);
    expect(value.path).toBe(from);
    expect(value.model.content?.kind === "shape" ? value.model.content.path : null).toBe(from);
    expect(element.innerHTML).toBe(before);
    value.dispose();
  });
  it("settles a structural animation failure without assigning an invalid later sample", async () => {
    const { element, value } = layer(AFXShapeLayer);
    const from = GFXPath.rect({ x: 0, y: 0, width: 10, height: 10 });
    const to = GFXPath.rect({ x: 20, y: 20, width: 10, height: 10 });
    value.path = from;
    const changing: AFXSampledAnimation = {
      targetId: "shape",
      keyPath: "path",
      animation: { totalDuration: 1 },
      sample: (seconds) => seconds === 0 ? from : seconds === 1 ? to : 42,
      toRuntime: () => ({
        animations: [{ targetId: "shape", keyPath: "path", from, to }],
        duration: 1,
      }),
    };
    const handle = value.addAnimation(changing);
    const before = element.innerHTML;
    expect(() => handle.seek(0.5)).toThrow(/sample requires canonical GFXPath/i);
    await expect(handle.finished).resolves.toMatchObject({ state: "failed" });
    expect(value.path).toBe(from);
    expect(value.model.values.path).toBe(from);
    expect(value.model.values.gradient).toBeUndefined();
    expect(element.innerHTML).toBe(before);
    value.dispose();
  });
  it("keeps transparent gradient interpolation finite and rejects incompatible endpoints before projection", () => {
    const { element, value } = layer(AFXGradientLayer);
    const transparent = (red: number, blue: number, units: "objectBoundingBox" | "userSpaceOnUse" = "objectBoundingBox") => new GFXGradient([
      { offset: 0, colour: GFXColour.rgba(red, 0, blue, 0) },
      { offset: 1, colour: GFXColour.rgba(0, red, blue, 0) },
    ], undefined, { units });
    const from = transparent(1, 0), to = transparent(0, 1);
    value.gradient = from;
    const handle = value.addAnimation(new AFXBasicAnimation({
      targetId: "gradient",
      keyPath: "gradient",
      from,
      to,
      animation: new AFXAnimation({ duration: 2, timing: "linear" }),
    }));
    handle.seek(1);
    const content = value.presentation.content;
    if (content?.kind !== "gradient" || !content.gradient) throw new Error("Expected gradient presentation.");
    expect(content.gradient.stops.map((stop) => stop.colour.components)).toEqual([
      { r: 0, g: 0, b: 0, a: 0 },
      { r: 0, g: 0, b: 0, a: 0 },
    ]);
    handle.cancel();
    const before = element.innerHTML;
    expect(() => new AFXBasicAnimation({
      targetId: "gradient",
      keyPath: "gradient",
      from,
      to: new GFXGradient([{ offset: 0, colour: GFXColour.parse("white") }]),
      animation: new AFXAnimation({ duration: 1 }),
    })).toThrow(/stop counts/i);
    expect(() => new AFXBasicAnimation({
      targetId: "gradient",
      keyPath: "gradient",
      from,
      to: transparent(0, 1, "userSpaceOnUse"),
      animation: new AFXAnimation({ duration: 1 }),
    })).toThrow(/coordinate units/i);
    expect(() => new AFXBasicAnimation({
      targetId: "gradient",
      keyPath: "gradient",
      from,
      to: new GFXGradient(to.stops, { kind: "radial", centre: { x: 0.5, y: 0.5 }, radius: 0.5 }),
      animation: new AFXAnimation({ duration: 1 }),
    })).toThrow(/geometry kinds/i);
    expect(element.innerHTML).toBe(before);
    value.dispose();
  });
  it("samples path keyframes and preserves model/presentation semantics for fill and reduced motion", async () => {
    const { value } = layer(AFXShapeLayer);
    const path = (x: number) => new GFXPath([
      { kind: "move", point: { x, y: 0 } },
      { kind: "line", point: { x: x + 10, y: 10 } },
    ]);
    const underlying = path(2), from = path(10), middle = path(30), to = path(70);
    value.path = underlying;
    const delayed = value.addAnimation(new AFXKeyframeAnimation({
      targetId: "shape",
      keyPath: "path",
      values: [from, middle, to],
      keyTimes: [0, 0.5, 1],
      animation: new AFXAnimation({ duration: 2, delay: 1, fill: "none", timing: "linear" }),
    }));
    expect(value.model.content?.kind === "shape" ? value.model.content.path : null).toBe(to);
    expect(value.presentation.content?.kind === "shape" ? value.presentation.content.path : null).toBe(underlying);
    delayed.seek(2.5);
    const sampled = value.presentation.content;
    if (sampled?.kind !== "shape") throw new Error("Expected shape presentation.");
    expect(sampled.path?.commands[0]).toEqual({ kind: "move", point: { x: 50, y: 0 } });
    delayed.cancel();
    await expect(delayed.finished).resolves.toMatchObject({ state: "cancelled", reduced: false });
    expect(value.model.content?.kind === "shape" ? value.model.content.path : null).toBe(sampled.path);
    value.dispose();

    const reducedElement = document.createElement("div");
    const reduced = new AFXShapeLayer(new BrowserAnimationLayerSurface(reducedElement), {
      ...scheduler,
      reducedMotion: true,
    });
    reduced.path = from;
    const completed = reduced.addAnimation(new AFXBasicAnimation({
      targetId: "shape",
      keyPath: "path",
      from,
      to,
      animation: new AFXAnimation({ duration: 10, timing: "linear" }),
    }));
    await expect(completed.finished).resolves.toMatchObject({ state: "completed", reduced: true });
    expect(reduced.presentation.content?.kind === "shape" ? reduced.presentation.content.path : null).toBe(to);
    expect(reduced.path).toBe(to);
    reduced.dispose();
  });
  it("renders canonical Bezier geometry with evenodd holes and restores existing DOM on disposal", async () => {
    const { element, value } = layer(AFXShapeLayer),
      existing = document.createElement("span");
    existing.textContent = "Owned app label";
    element.append(existing);
    value.path = GFXPath.rect({ x: 0, y: 0, width: 40, height: 40 }).append(
      GFXPath.rect({ x: 10, y: 10, width: 20, height: 20 }),
    );
    value.fillColour = GFXColour.parse("red");
    value.fillRule = "evenodd";
    const svg = element.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(element.firstElementChild).toBe(svg);
    const paintedPath = svg.firstElementChild;
    value.opacity = 0.5;
    expect(svg.firstElementChild).toBe(paintedPath);
    value.opacity = 1;
    const pixel = await pixels(svg.outerHTML);
    expect(pixel(5, 5)).toEqual([255, 0, 0, 255]);
    expect(pixel(20, 20)[3]).toBe(0);
    value.dispose();
    expect(element.querySelector("svg")).toBeNull();
    expect(element.contains(existing)).toBe(true);
  });
  it("renders finite line styles and trims only the stroke, preserving fill independently", async () => {
    const { element, value } = layer(AFXShapeLayer, 100, 20);
    value.path = new GFXPath([
      { kind: "move", point: { x: 0, y: 10 } },
      { kind: "line", point: { x: 100, y: 10 } },
    ]);
    value.fillColour = null;
    value.strokeColour = GFXColour.parse("white");
    value.lineWidth = 4;
    value.strokeStart = 0.25;
    value.strokeEnd = 0.75;
    const svg = element.querySelector("svg")!;
    expect(svg.querySelector("mask path")?.getAttribute("d")).toBe(
      "M 25 10 L 75 10",
    );
    const pixel = await pixels(svg.outerHTML, 100, 20);
    expect(pixel(10, 10)[3]).toBe(0);
    expect(pixel(50, 10)[3]).toBe(255);
    expect(pixel(90, 10)[3]).toBe(0);
    value.lineDashPattern = [5, 3];
    value.lineDashPhase = 2;
    expect(
      svg
        .querySelector('path[stroke="rgb(255 255 255)"]')
        ?.getAttribute("stroke-dasharray") ??
        svg.lastElementChild?.getAttribute("stroke-dasharray"),
    ).toBe("5 3");
    const before = svg.innerHTML;
    expect(() => {
      value.lineWidth = NaN;
    }).toThrow();
    expect(() => {
      value.lineDashPattern = [0, 0];
    }).toThrow();
    expect(svg.innerHTML).toBe(before);
    value.dispose();
  });
  it("projects linear and radial canonical gradients and preserves transparent-stop alpha", async () => {
    const { element, value } = layer(AFXGradientLayer);
    value.gradient = new GFXGradient([
      { offset: 0, colour: GFXColour.rgba(1, 0, 0, 0) },
      { offset: 1, colour: GFXColour.rgba(0, 0, 1, 1) },
    ]);
    let pixel = await pixels(element.querySelector("svg")!.outerHTML);
    expect(pixel(4, 20)[3]).toBeLessThan(40);
    expect(pixel(35, 20)[3]).toBeGreaterThan(210);
    value.gradient = new GFXGradient(
      [
        { offset: 0, colour: GFXColour.parse("red") },
        { offset: 1, colour: GFXColour.parse("blue") },
      ],
      { kind: "radial", centre: { x: 0.5, y: 0.5 }, radius: 0.5 },
    );
    expect(element.querySelector("radialGradient")).not.toBeNull();
    pixel = await pixels(element.querySelector("svg")!.outerHTML);
    expect(pixel(20, 20)[0]).toBeGreaterThan(230);
    expect(pixel(1, 20)[2]).toBeGreaterThan(230);
    value.dispose();
  });
  it("composes nested shape/gradient alpha masks, propagates edits and rejects cycles", async () => {
    const owner = layer(AFXLayer),
      gradient = layer(AFXGradientLayer),
      shape = layer(AFXShapeLayer);
    owner.value.backgroundColour = GFXColour.parse("white");
    gradient.value.gradient = new GFXGradient([
      { offset: 0, colour: GFXColour.rgba(1, 0, 0, 0) },
      { offset: 1, colour: GFXColour.rgba(1, 0, 0, 1) },
    ]);
    shape.value.path = GFXPath.ellipse({ x: 10, y: 10, width: 20, height: 20 });
    shape.value.fillColour = GFXColour.parse("white");
    gradient.value.setMask(shape.value);
    owner.value.setMask(gradient.value);
    let pixel = await pixels(maskSVG(owner.element));
    expect(pixel(20, 20)[3]).toBeGreaterThan(115);
    expect(pixel(20, 20)[3]).toBeLessThan(145);
    expect(pixel(5, 20)[3]).toBe(0);
    shape.value.opacity = 0.5;
    pixel = await pixels(maskSVG(owner.element));
    expect(pixel(20, 20)[3]).toBeGreaterThan(55);
    expect(pixel(20, 20)[3]).toBeLessThan(75);
    expect(() => shape.value.setMask(owner.value)).toThrow(/acyclic|cycle/);
    expect(() => owner.value.addSublayer(shape.value)).toThrow(/mask/i);
    shape.value.dispose();
    expect(gradient.element.style.maskImage).toBe("");
    gradient.value.dispose();
    expect(owner.element.style.maskImage).toBe("");
    owner.value.dispose();
  });
  it("clips mask sublayers to owner bounds and rejects unsupported content ports truthfully", async () => {
    const owner = layer(AFXLayer),
      mask = layer(AFXLayer),
      child = layer(AFXShapeLayer);
    mask.value.frame = { x: 0, y: 0, width: 20, height: 40 };
    mask.value.clipsToBounds = true;
    child.value.path = GFXPath.rect({ x: 0, y: 0, width: 40, height: 40 });
    child.value.fillColour = GFXColour.parse("white");
    mask.value.addSublayer(child.value);
    owner.value.setMask(mask.value);
    const pixel = await pixels(maskSVG(owner.element));
    expect(pixel(10, 20)[3]).toBe(255);
    expect(pixel(30, 20)[3]).toBe(0);
    owner.value.dispose();
    mask.value.dispose();
    const unsupported = new AFXShapeLayer(
      {
        supportedProperties: [],
        apply() {},
        attach() {},
        detach() {},
        setMask() {},
        dispose() {},
      },
      scheduler,
    );
    expect(() => {
      unsupported.path = GFXPath.rect({ x: 0, y: 0, width: 10, height: 10 });
    }).toThrow(/does not support/);
    unsupported.dispose();
  });
});
