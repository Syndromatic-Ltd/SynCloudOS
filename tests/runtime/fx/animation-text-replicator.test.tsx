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
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { AFXTextLayer } from "../../../src/FX/AnimationFX/AFXTextLayer";
import { AFXReplicatorLayer } from "../../../src/FX/AnimationFX/AFXReplicatorLayer";
import { AFXShapeLayer } from "../../../src/FX/AnimationFX/AFXShapeLayer";
import { AFXTransform3D } from "../../../src/FX/AnimationFX/AFXTransform3D";
import { AFXAnimation } from "../../../src/FX/AnimationFX/AFXAnimation";
import { AFXBasicAnimation } from "../../../src/FX/AnimationFX/AFXBasicAnimation";
import type { AFXFrameScheduler } from "../../../src/FX/AnimationFX/AFXLayer";
import {
  TFXFont,
  TFXFontDescriptor,
  TFXTypesetter,
  TFXAttributedString,
  TFXGlyphDrawing,
} from "../../../src/FX/TextFX/public";
import { GFXPath } from "../../../src/FX/GraphicsFX/GFXPath";
import { GFXColour } from "../../../src/FX/GraphicsFX/GFXColour";
import { BrowserAnimationLayerSurface } from "../../../src/SynCloudOS/PlatformAdapters/BrowserAnimationAdapter";
import { createAFXLayer } from "../../../src/FX/AnimationFX/host";
function clock() {
  let now = 0,
    hidden = false;
  const frames = new Set<(time: number) => void>(),
    states = new Set<() => void>();
  const scheduler: AFXFrameScheduler = {
    now: () => now,
    reducedMotion: false,
    get suspended() {
      return hidden;
    },
    requestFrame: (callback) => {
      frames.add(callback);
      return () => {
        frames.delete(callback);
      };
    },
    subscribeState: (callback) => {
      states.add(callback);
      return () => {
        states.delete(callback);
      };
    },
  };
  return {
    scheduler,
    frames,
    states,
    advance: (time: number) => {
      now = time;
      const callbacks = [...frames];
      frames.clear();
      for (const callback of callbacks) callback(time);
    },
    hide: () => {
      hidden = true;
      for (const callback of [...states]) callback();
    },
  };
}
function configureShape(layer: AFXShapeLayer) {
  layer.frame = { x: 0, y: 0, width: 10, height: 10 };
  layer.path = GFXPath.rect({ x: 0, y: 0, width: 10, height: 10 });
  layer.fillColour = GFXColour.parse("white");
  return layer;
}
function source(scheduler: AFXFrameScheduler) {
  const element = document.createElement("div");
  const layer = configureShape(createAFXLayer(AFXShapeLayer, new BrowserAnimationLayerSurface(element), scheduler));
  return { element, layer };
}
async function pixels(svg: SVGSVGElement, width: number, height: number) {
  const markup = svg.outerHTML
    .replace(
      "<svg",
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
        width +
        '" height="' +
        height +
        '"',
    )
    .replace(/ style="[^"]*"/, "");
  const { data, info } = await sharp(Buffer.from(markup))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    pixel: (x: number, y: number) => [
      ...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4),
    ],
    data,
  };
}
describe("AnimationFX text and replication", () => {
  it("renders the supplied ligature glyph outlines with baseline and rights metadata without reshaping", async () => {
    const font = await TFXFont.create(
      new Uint8Array(
        readFileSync(
          "tests/fixtures/fx/fonts/notosans-NotoSans[wdth,wght].ttf",
        ),
      ),
      new TFXFontDescriptor({ size: 20 }),
    );
    const line = new TFXTypesetter(
        new TFXAttributedString("office", [{ start: 0, end: 6, font }]),
      ).createLine(0, 6),
      c = clock(),
      element = document.createElement("div"),
      layer = createAFXLayer(
        AFXTextLayer,
        new BrowserAnimationLayerSurface(element),
        c.scheduler,
      );
    layer.frame = { x: 0, y: 0, width: 120, height: 45 };
    layer.baselineOrigin = { x: 10, y: 30 };
    layer.line = line;
    const expected = TFXGlyphDrawing.pathsForLine(line, { x: 10, y: 30 }),
      paths = [...element.querySelectorAll("svg path")];
    expect(paths.length).toBe(expected.length);
    expect(paths.length).toBeLessThan(6);
    expect(element.querySelector("text")).toBeNull();
    expect(
      paths.map((path) => Number(path.getAttribute("data-tfx-glyph"))),
    ).toEqual(expected.map((glyph) => glyph.glyphId));
    expect(paths[0].getAttribute("d")).toBe(expected[0].path.toSVGPathData());
    expect(paths[0].getAttribute("data-font-embedding")).toBe("allowed");
    const original = layer.glyphOutlines;
    font.dispose();
    layer.foregroundColour = GFXColour.parse("blue");
    expect(layer.glyphOutlines).toBe(original);
    const { data } = await pixels(element.querySelector("svg")!, 120, 45);
    expect(data.some((value, index) => index % 4 === 3 && value > 0)).toBe(
      true,
    );
    expect(() => {
      layer.baselineOrigin = { x: 20, y: 30 };
    }).toThrow(expect.objectContaining({ code: "TFX_FONT_DISPOSED" }));
    expect(layer.baselineOrigin.x).toBe(10);
    layer.dispose();
    expect(element.querySelector("svg")).toBeNull();
  });
  it("renders transformed tinted instances, nested replication and count-zero output with a bounded expansion", async () => {
    const c = clock(),
      element = document.createElement("div"),
      replica = createAFXLayer(
        AFXReplicatorLayer,
        new BrowserAnimationLayerSurface(element),
        c.scheduler,
      ),
      child = source(c.scheduler);
    replica.frame = { x: 0, y: 0, width: 36, height: 24 };
    child.layer.fillColour = GFXColour.rgba(0.5, 0.8, 1, 1);
    replica.instanceCount = 3;
    replica.instanceTransform = AFXTransform3D.translation(12, 0);
    replica.instanceGreenOffset = -0.2;
    replica.instanceAlphaOffset = -0.25;
    replica.addSublayer(child.layer);
    let image = await pixels(
      element.querySelector("svg[data-afx-replicas]")!,
      36,
      24,
    );
    expect(image.pixel(4, 4)[3]).toBe(255);
    expect(image.pixel(16, 4)[1]).toBeCloseTo(153, 0);
    expect(image.pixel(16, 4)[3]).toBeCloseTo(191, 0);
    expect(image.pixel(28, 4)[3]).toBeCloseTo(128, 0);
    expect(child.element.style.opacity).toBe("0");
    const outerElement = document.createElement("div"),
      outer = createAFXLayer(
        AFXReplicatorLayer,
        new BrowserAnimationLayerSurface(outerElement),
        c.scheduler,
      );
    outer.frame = { x: 0, y: 0, width: 36, height: 24 };
    outer.instanceCount = 2;
    outer.instanceTransform = AFXTransform3D.translation(0, 12);
    outer.addSublayer(replica);
    image = await pixels(
      outerElement.querySelector("svg[data-afx-replicas]")!,
      36,
      24,
    );
    expect(image.pixel(16, 16)[3]).toBeGreaterThan(180);
    replica.instanceCount = 32;
    expect(() => {
      outer.instanceCount = 64;
    }).toThrow(/1024/);
    expect(outer.instanceCount).toBe(2);
    outer.instanceCount = 0;
    image = await pixels(
      outerElement.querySelector("svg[data-afx-replicas]")!,
      36,
      24,
    );
    expect(
      image.data.every((value, index) => index % 4 !== 3 || value === 0),
    ).toBe(true);
    outer.dispose();
    expect(outerElement.querySelector("svg")).toBeNull();
  });
  it("uses measured instance delays with pause/seek and drains every frame/state listener at completion", async () => {
    const c = clock(),
      element = document.createElement("div"),
      replica = createAFXLayer(
        AFXReplicatorLayer,
        new BrowserAnimationLayerSurface(element),
        c.scheduler,
      );
    replica.frame = { x: 0, y: 0, width: 36, height: 10 };
    replica.instanceCount = 3;
    replica.instanceTransform = AFXTransform3D.translation(12, 0);
    replica.instanceDelay = 0.2;
    replica.addSublayer(configureShape(new AFXShapeLayer()));
    const animation = new AFXBasicAnimation({
      targetId: "replicas",
      keyPath: "opacity",
      from: 0,
      to: 1,
      animation: new AFXAnimation({
        duration: 1,
        timing: "linear",
        fill: "both",
      }),
    });
    const handle = replica.playInstances(animation);
    c.advance(0.5);
    const states = replica.presentation.replication!.instances;
    expect(states[0].opacity).toBeCloseTo(0.5);
    expect(states[1].opacity).toBeCloseTo(0.3);
    expect(states[2].opacity).toBeCloseTo(0.1);
    const image = await pixels(
      element.querySelector("svg[data-afx-replicas]")!,
      36,
      10,
    );
    expect(Math.abs(image.pixel(16, 4)[3] - 76.5)).toBeLessThanOrEqual(0.5);
    handle.pause();
    expect(c.frames.size).toBe(0);
    handle.seek(0.8);
    expect(replica.presentation.replication!.instances[2].opacity).toBeCloseTo(
      0.4,
    );
    handle.resume();
    c.advance(1.1);
    await expect(handle.finished).resolves.toMatchObject({
      state: "completed",
    });
    expect(c.frames.size).toBe(0);
    replica.dispose();
    expect(c.states.size).toBe(0);
  });
  it("settles hidden instance work, rejects unsupported depth and does not clone unmanaged controls", async () => {
    const c = clock(),
      element = document.createElement("div"),
      replica = createAFXLayer(
        AFXReplicatorLayer,
        new BrowserAnimationLayerSurface(element),
        c.scheduler,
      );
    replica.instanceCount = 2;
    replica.instanceDelay = 0.2;
    const child = configureShape(new AFXShapeLayer());
    replica.addSublayer(child);
    const handle = replica.playInstances(
      new AFXBasicAnimation({
        targetId: "test",
        keyPath: "opacity",
        from: 0,
        to: 1,
        animation: new AFXAnimation({ duration: 1 }),
      }),
    );
    c.hide();
    await expect(handle.finished).resolves.toMatchObject({
      state: "completed",
      reduced: true,
    });
    expect(c.frames.size).toBe(0);
    expect(() => {
      replica.instanceTransform = AFXTransform3D.rotation(0.5, 1, 0, 0);
    }).toThrow(/affine/);
    replica.dispose();
    const other = createAFXLayer(
        AFXReplicatorLayer,
        new BrowserAnimationLayerSurface(document.createElement("div")),
        c.scheduler,
      ),
      bad = source(c.scheduler);
    bad.element.append(document.createElement("button"));
    expect(() => other.addSublayer(bad.layer)).toThrow(/unmanaged/);
    expect(other.sublayers.length).toBe(0);
    other.dispose();
    bad.layer.dispose();
  });
  it("rolls back an attachment exceeding the expanded replica budget", () => {
    const c = clock();
    const element = document.createElement("div");
    const outer = createAFXLayer(
      AFXReplicatorLayer,
      new BrowserAnimationLayerSurface(element),
      c.scheduler,
    );
    const innerElement = document.createElement("div");
    const inner = createAFXLayer(
      AFXReplicatorLayer,
      new BrowserAnimationLayerSurface(innerElement),
      c.scheduler,
    );
    inner.addSublayer(configureShape(new AFXShapeLayer()));
    outer.instanceCount = 64;
    inner.instanceCount = 64;
    expect(() => outer.addSublayer(inner)).toThrow(/1024/);
    expect(outer.sublayers).toHaveLength(0);
    expect(innerElement.parentElement).toBeNull();
    outer.instanceCount = 1;
    outer.addSublayer(inner);
    expect(outer.sublayers).toEqual([inner]);
    outer.dispose();
  });
});
