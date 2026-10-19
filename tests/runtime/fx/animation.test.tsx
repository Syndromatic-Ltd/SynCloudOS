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
import {
  AFXAnimation,
  AFXBasicAnimation,
  AFXKeyframeAnimation,
  AFXSpringAnimation,
  AFXTimingFunction,
  AFXTransform3D,
  AFXSingularTransformError,
  AFXLayer,
  AFXTransaction,
  AFXAnimationGroup,
  type AFXFrameScheduler,
  type AFXAnimationHandle,
} from "../../../src/FX/AnimationFX/public";
import {
  BrowserAnimationLayerSurface,
  BrowserAnimationAdapterFactory,
  type BrowserNativeAnimation,
} from "../../../src/SynCloudOS/PlatformAdapters/BrowserAnimationAdapter";

import { GFXColour } from "../../../src/FX/GraphicsFX/GFXColour";

function clock() {
  let now = 0,
    reduced = false,
    hidden = false;
  const pending = new Set<(timestamp: number) => void>(),
    states = new Set<() => void>();
  const scheduler: AFXFrameScheduler = {
    now: () => now,
    requestFrame: (callback) => {
      pending.add(callback);
      return () => {
        pending.delete(callback);
      };
    },
    get reducedMotion() {
      return reduced;
    },
    get suspended() {
      return hidden;
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
    pending,
    states,
    advance: (time: number) => {
      now = time;
      const callbacks = [...pending];
      pending.clear();
      for (const callback of callbacks) callback(time);
    },
    suspend: () => {
      hidden = true;
      for (const callback of states) callback();
    },
    reduce: () => {
      reduced = true;
      for (const callback of states) callback();
    },
  };
}
const basic = (from = 0, to = 1, duration = 1) =>
  new AFXBasicAnimation({
    targetId: "test",
    keyPath: "opacity",
    from,
    to,
    animation: new AFXAnimation({ duration, timing: "linear" }),
  });

function projectedElementTransform(element: HTMLElement): AFXTransform3D {
  const transforms: AFXTransform3D[] = [];
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    if (node.style.transform)
      transforms.push(AFXTransform3D.fromCSS(node.style.transform));
  }
  return transforms
    .reverse()
    .reduce(
      (world, transform) => world.multiply(transform),
      new AFXTransform3D(),
    );
}

function expectTransformClose(
  actual: AFXTransform3D,
  expected: AFXTransform3D,
): void {
  actual.values.forEach((value, index) => {
    expect(value).toBeCloseTo(expected.values[index], 9);
  });
}

describe("AnimationFX deterministic core", () => {
  it("picks against the projected presentation plane of a rotated 3D layer", () => {
    const { scheduler } = clock();
    const surface = () => ({
      supportedProperties: ["frame", "opacity", "transform"],
      apply() {}, attach() {}, detach() {}, setMask() {}, dispose() {},
    });
    const parent = new AFXLayer(surface(), scheduler);
    const child = new AFXLayer(surface(), scheduler);
    parent.frame = { x: 0, y: 0, width: 200, height: 100 };
    child.frame = { x: 80, y: 10, width: 40, height: 40 };
    child.transform = AFXTransform3D.rotation(Math.PI / 3, 0, 1, 0);
    parent.addSublayer(child);
    expect(parent.presentationHitTest({ x: 75, y: 30 })).toBe(parent);
    expect(parent.presentationHitTest({ x: 95, y: 30 })).toBe(child);
    parent.dispose();
  });
  it("projects sampled spring keyframes, converts seconds once and seeks real native playback", async () => {
    const events = new Map<string, () => void>();
    const native: BrowserNativeAnimation = {
      currentTime: 0,
      playState: "running",
      play() {},
      pause() {},
      cancel() {},
      addEventListener: (event, callback) => {
        events.set(event, callback);
      },
      removeEventListener: (event) => {
        events.delete(event);
      },
    };
    const animate = vi.fn(() => native),
      factory = new BrowserAnimationAdapterFactory({ animate, now: () => 0 }),
      lease = factory.acquire("test", new AbortController().signal);
    const animation = new AFXSpringAnimation({
        targetId: "t",
        keyPath: "opacity",
        from: 0,
        to: 1,
        options: { duration: 0.4 },
      }),
      definition = animation.toRuntime();
    const handle = lease.adapter.animate({
      ...definition,
      target: {},
      delay: 0,
      iterations: 1,
      autoreverses: false,
      fill: "forwards",
      timing: "linear",
    });
    expect(animate.mock.calls[0][2]).toMatchObject({ duration: 400 });
    expect(animate.mock.calls[0][1].length).toBeGreaterThan(2);
    handle.seek(0.2);
    expect(native.currentTime).toBe(200);
    expect(() => handle.seek(1)).toThrow();
    events.get("finish")!();
    await expect(handle.finished).resolves.toBe("completed");
    lease.release();
    expect(factory.diagnostics().runtimeLeaseCount).toBe(0);
  });
  it("finishes native playback when hidden and releases its shared visibility listener", async () => {
    let hidden = false;
    const visibility = new Set<() => void>();
    const events = new Map<string, () => void>();
    const native: BrowserNativeAnimation = {
      currentTime: 0,
      playState: "running",
      play() {},
      pause: vi.fn(),
      cancel: vi.fn(),
      addEventListener: (name, callback) => {
        events.set(name, callback);
      },
      removeEventListener: (name) => {
        events.delete(name);
      },
    };
    const applyFinal = vi.fn();
    const factory = new BrowserAnimationAdapterFactory({
      animate: () => native,
      now: () => 0,
      isHidden: () => hidden,
      applyFinal,
      subscribeVisibility: (callback) => {
        visibility.add(callback);
        return () => {
          visibility.delete(callback);
        };
      },
    });
    const lease = factory.acquire("visibility", new AbortController().signal);
    const handle = lease.adapter.animate({
      ...basic().toRuntime(),
      target: {},
      delay: 0,
      iterations: 1,
      autoreverses: false,
      fill: "forwards",
      timing: "linear",
    });
    expect(visibility.size).toBe(1);
    hidden = true;
    for (const callback of [...visibility]) callback();
    await expect(handle.finished).resolves.toBe("completed");
    expect(applyFinal).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ opacity: 1 }),
    );
    expect(events.size).toBe(0);
    expect(visibility.size).toBe(0);
    expect(lease.adapter.diagnostics()).toMatchObject({
      activeCount: 0,
      listenerCount: 0,
      timerCount: 0,
    });
    lease.release();
  });
  it("coalesces display/layout invalidation, preserves model snapshots and cancels pending work on dispose", () => {
    const c = clock(),
      element = document.createElement("div"),
      layer = new AFXLayer(
        new BrowserAnimationLayerSurface(element),
        c.scheduler,
      );
    const layout = vi.fn(() => {
      layer.bounds = { x: 0, y: 0, width: 40, height: 30 };
    });
    const displayed = vi.fn();
    layer.delegate = { layoutSublayers: layout, didDisplay: displayed };
    layer.setNeedsLayout();
    layer.setNeedsLayout();
    layer.setNeedsDisplay();
    expect(c.pending.size).toBe(1);
    c.advance(0.1);
    expect(layout).toHaveBeenCalledTimes(1);
    expect(layer.needsLayout()).toBe(false);
    expect(layer.needsDisplay()).toBe(false);
    expect(element.style.width).toBe("40px");
    layer.addAnimation(basic());
    c.advance(0.5);
    expect(layer.model.opacity).toBe(1);
    expect(layer.presentation.opacity).toBeCloseTo(0.4);
    layer.setNeedsDisplay();
    layer.dispose();
    expect(c.pending.size).toBe(0);
  });
  it("falls back to owned frame sampling when a connected browser rejects native playback", () => {
    const c = clock();
    const element = document.createElement("div");
    document.body.append(element);
    Object.defineProperty(element, "animate", { value: vi.fn(() => { throw new DOMException("Unsupported timing", "NotSupportedError"); }) });
    const layer = new AFXLayer(new BrowserAnimationLayerSurface(element), c.scheduler);
    const handle = layer.addAnimation(basic());
    expect(element.animate).toHaveBeenCalledTimes(1);
    expect(c.pending.size).toBe(1);
    c.advance(0.5);
    expect(layer.presentation.opacity).toBeCloseTo(0.5);
    handle.cancel();
    layer.dispose();
    element.remove();
  });
  it("falls back to owned frame sampling if live transform keyframe reprojection is rejected", () => {
    const c = clock();
    const element = document.createElement("div");
    document.body.append(element);
    const cancel = vi.fn();
    Object.defineProperty(element, "animate", { value: vi.fn(() => ({
      currentTime: 250,
      effect: { setKeyframes: vi.fn(() => { throw new DOMException("Rejected keyframes", "NotSupportedError"); }) },
      cancel,
      pause() {}, play() {},
      addEventListener() {}, removeEventListener() {},
    })) });
    const layer = new AFXLayer(new BrowserAnimationLayerSurface(element), c.scheduler);
    const handle = layer.addAnimation(new AFXBasicAnimation({
      targetId: "reprojection", keyPath: "transform",
      from: "matrix(1,0,0,1,0,0)", to: "matrix(1,0,0,1,100,0)",
      animation: new AFXAnimation({ duration: 1, timing: "linear" }),
    }));
    expect(c.pending.size).toBe(0);
    expect(() => { layer.position = { x: 50, y: 0 }; }).not.toThrow();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(c.pending.size).toBe(1);
    c.advance(0.25);
    expect(handle.progress).toBeCloseTo(0.5);
    handle.cancel();
    layer.dispose();
    element.remove();
  });
  it("uses scaled cycle duration and fractional repeat duration without inventing a longer trajectory", () => {
    const timing = new AFXAnimation({
      duration: 1,
      speed: 2,
      repeatDuration: 1.5,
      timing: "linear",
    });
    expect(timing.definition().duration).toBe(0.5);
    expect(timing.totalDuration).toBe(0.75);
    expect(timing.progressAt(0.75)).toBe(0.5);
  });
  it("releases layer frame and state subscriptions when its owner aborts", async () => {
    const controller = new AbortController(),
      c = clock(),
      layer = new AFXLayer(
        new BrowserAnimationLayerSurface(document.createElement("div")),
        c.scheduler,
        { signal: controller.signal },
      );
    const handle = layer.addAnimation(basic());
    controller.abort();
    await expect(handle.finished).resolves.toMatchObject({
      state: "cancelled",
    });
    expect(c.pending.size).toBe(0);
    expect(c.states.size).toBe(0);
    expect(() => layer.addAnimation(basic())).toThrow(expect.objectContaining({ code: "AFX_LAYER_DISPOSED" }));
  });
  it("validates finite seconds and handles delay, repeats, autoreverse and fill", () => {
    expect(() => new AFXAnimation({ duration: NaN })).toThrow();
    expect(() => new AFXAnimation({ duration: -1 })).toThrow();
    const timing = new AFXAnimation({
      duration: 1,
      delay: 0.2,
      iterations: 2,
      autoreverses: true,
      fill: "both",
      timing: "linear",
    });
    expect(timing.totalDuration).toBe(4.2);
    expect(timing.progressAt(0)).toBe(0);
    expect(timing.progressAt(0.7)).toBeCloseTo(0.5);
    expect(timing.progressAt(1.7)).toBeCloseTo(0.5);
    expect(timing.progressAt(4.2)).toBe(0);
    expect(
      new AFXAnimation({ duration: 1, fill: "none" }).progressAt(2),
    ).toBeNull();
  });
  it("inverts cubic x and preserves uneven keyframe times", () => {
    expect(
      new AFXTimingFunction({
        kind: "cubic-bezier",
        x1: 0.42,
        y1: 0,
        x2: 1,
        y2: 1,
      }).sample(0.5),
    ).toBeCloseTo(0.3153568, 6);
    const animation = new AFXKeyframeAnimation({
      targetId: "t",
      keyPath: "opacity",
      values: [0, 0.8, 1],
      keyTimes: [0, 0.13, 1],
      animation: new AFXAnimation({ duration: 2, timing: "linear" }),
    });
    expect(animation.sample(0.26)).toBeCloseTo(0.8);
    expect(animation.sample(0.13)).toBeCloseTo(0.4);
    expect(
      animation
        .toRuntime()
        .animations[0].keyframes?.some((x) => x.offset === 0.13),
    ).toBe(true);
    expect(
      () =>
        new AFXKeyframeAnimation({
          targetId: "t",
          keyPath: "opacity",
          values: [0, 1, 0],
          keyTimes: [0, 0.8, 0.2],
          animation: new AFXAnimation({ duration: 1 }),
        }),
    ).toThrow();
  });
  it("samples real underdamped and critical spring trajectories with truthful settling time", () => {
    const critical = new AFXSpringAnimation({
      targetId: "t",
      keyPath: "opacity",
      from: 0,
      to: 1,
      mass: 1,
      stiffness: 100,
      damping: 20,
      options: { duration: 2 },
    });
    expect(critical.sample(0.1)).toBeCloseTo(1 - 2 / Math.E, 8);
    const under = new AFXSpringAnimation({
      targetId: "t",
      keyPath: "opacity",
      from: 0,
      to: 1,
      mass: 1,
      stiffness: 100,
      damping: 2,
      options: { duration: 4 },
    });
    expect(under.sample(0.3) as number).toBeGreaterThan(1);
    expect(under.toRuntime().animations[0].keyframes!.length).toBeGreaterThan(
      2,
    );
  });
  it("round trips affine, rotation and perspective and rejects singular transforms", () => {
    const affine = { a: 2, b: 0, c: 0.2, d: 3, tx: 7, ty: 9 };
    expect(AFXTransform3D.fromAffine(affine).toAffine()).toEqual(affine);
    const matrix = AFXTransform3D.perspective(500)
      .multiply(AFXTransform3D.translation(10, 20, 40))
      .multiply(AFXTransform3D.rotation(0.3, 1, 1, 0));
    const point = { x: 12, y: 7, z: 2 },
      roundtrip = matrix.inverse().transformPoint(matrix.transformPoint(point));
    expect(roundtrip.x).toBeCloseTo(point.x);
    expect(roundtrip.y).toBeCloseTo(point.y);
    expect(roundtrip.z).toBeCloseTo(point.z);
    expect(() => AFXTransform3D.scale(0).inverse()).toThrow(
      AFXSingularTransformError,
    );
  });
  it("projects layer geometry/tree/mask on real DOM elements and restores owned styles", () => {
    const c = clock(),
      parent = document.createElement("div"),
      child = document.createElement("div"),
      mask = document.createElement("div");
    parent.style.color = "red";
    const layer = new AFXLayer(
        new BrowserAnimationLayerSurface(parent),
        c.scheduler,
      ),
      sublayer = new AFXLayer(
        new BrowserAnimationLayerSurface(child),
        c.scheduler,
      ),
      maskLayer = new AFXLayer(
        new BrowserAnimationLayerSurface(mask),
        c.scheduler,
      );
    layer.bounds = { x: 0, y: 0, width: 100, height: 80 };
    layer.position = { x: 50, y: 40 };
    layer.clipsToBounds = true;
    layer.addSublayer(sublayer);
    expect(parent.contains(child)).toBe(true);
    expect(parent.style.width).toBe("100px");
    expect(parent.style.overflow).toBe("hidden");
    maskLayer.bounds = { x: 0, y: 0, width: 40, height: 30 };
    maskLayer.position = { x: 20, y: 15 };
    maskLayer.backgroundColour = GFXColour.parse("white");
    maskLayer.opacity = 0.5;
    layer.setMask(maskLayer);
    expect(decodeURIComponent(parent.style.maskImage)).toContain(
      'opacity="0.5"',
    );
    expect(parent.style.maskMode).toBe("alpha");
    maskLayer.opacity = 0.25;
    expect(decodeURIComponent(parent.style.maskImage)).toContain(
      'opacity="0.25"',
    );
    expect(() => sublayer.addSublayer(layer)).toThrow(/cycle/);
    layer.dispose();
    maskLayer.dispose();
    expect(parent.style.color).toBe("red");
    expect(parent.style.width).toBe("");
    expect(c.states.size).toBe(0);
  });
  it("picks an animated child at its displayed presentation position", () => {
    const c = clock();
    const parent = new AFXLayer(new BrowserAnimationLayerSurface(document.createElement("div")), c.scheduler);
    const child = new AFXLayer(new BrowserAnimationLayerSurface(document.createElement("div")), c.scheduler);
    parent.frame = { x: 0, y: 0, width: 200, height: 100 };
    child.frame = { x: 100, y: 0, width: 20, height: 20 };
    parent.addSublayer(child);
    child.addAnimation(new AFXBasicAnimation({
      targetId: "moving-result", keyPath: "transform",
      from: "translateX(-100px)", to: "translateX(0px)",
      animation: new AFXAnimation({ duration: 1, timing: "linear" }),
    }));
    c.advance(0.5);
    expect(parent.hitTest({ x: 55, y: 10 })).toBe(parent);
    expect(parent.presentationHitTest({ x: 55, y: 10 })).toBe(child);
    expect(parent.presentationHitTest({ x: 105, y: 10 })).toBe(parent);
    parent.dispose();
  });
  it("projects style, inherited transforms and model hit tests while rejecting malformed transforms", () => {
    const c = clock(),
      parent = document.createElement("div"),
      child = document.createElement("div");
    const layer = new AFXLayer(
        new BrowserAnimationLayerSurface(parent),
        c.scheduler,
      ),
      sublayer = new AFXLayer(
        new BrowserAnimationLayerSurface(child),
        c.scheduler,
      );
    layer.frame = { x: 0, y: 0, width: 100, height: 100 };
    layer.sublayerTransform = AFXTransform3D.translation(10, 0);
    sublayer.frame = { x: 0, y: 0, width: 20, height: 20 };
    layer.addSublayer(sublayer);
    expect(layer.hitTest({ x: 15, y: 5 })).toBe(sublayer);
    expect(layer.hitTest({ x: 5, y: 5 })).toBe(layer);
    expect(
      sublayer.convertRect({ x: 0, y: 0, width: 20, height: 20 }, layer),
    ).toEqual({ x: 10, y: 0, width: 20, height: 20 });
    expect(
      AFXTransform3D.fromCSS(child.style.transform).transformPoint({
        x: 0,
        y: 0,
        z: 0,
      }).x,
    ).toBe(10);
    sublayer.backgroundColour = GFXColour.parse("red");
    sublayer.borderWidth = 2;
    sublayer.borderColour = GFXColour.parse("blue");
    sublayer.cornerRadius = 4;
    sublayer.maskedCorners = ["top-left"];
    sublayer.shadowColour = GFXColour.parse("black");
    sublayer.shadowOpacity = 0.5;
    expect(child.style.borderWidth).toBe("2px");
    expect(child.style.borderTopLeftRadius).toBe("4px");
    expect(child.style.borderTopRightRadius).toBe("0px");
    expect(child.style.boxShadow).not.toBe("");
    expect(() => AFXTransform3D.fromCSS("scale(2px)")).toThrow();
    expect(() => AFXTransform3D.fromCSS("rotate(1rad,2rad)")).toThrow();
    layer.bounds = { x: 5, y: 7, width: 100, height: 100 };
    expect(
      AFXTransform3D.fromCSS(child.style.transform).transformPoint({
        x: 0,
        y: 0,
        z: 0,
      }),
    ).toEqual({ x: 5, y: -7, z: 0 });
    sublayer.bounds = { x: 2, y: 3, width: 20, height: 20 };
    sublayer.transform = AFXTransform3D.rotation(Math.PI / 2);
    const visibleOrigin = AFXTransform3D.fromCSS(
      child.style.transform,
    ).transformPoint({ x: 0, y: 0, z: 0 });
    const modelOrigin = sublayer.convertPoint({ x: 2, y: 3, z: 0 }, null);
    expect(visibleOrigin.x).toBeCloseTo(modelOrigin.x);
    expect(visibleOrigin.y).toBeCloseTo(modelOrigin.y);
    sublayer.transform = new AFXTransform3D();
    sublayer.bounds = { x: 0, y: 0, width: 20, height: 20 };
    sublayer.removeFromSuperlayer();
    expect(
      AFXTransform3D.fromCSS(child.style.transform).transformPoint({
        x: 0,
        y: 0,
        z: 0,
      }).x,
    ).toBe(0);
    sublayer.dispose();
    layer.dispose();
  });
  it("preserves displayed geometry when reparented across transformed superlayers", () => {
    const c = clock();
    const rootElement = document.createElement("div");
    const leftElement = document.createElement("div");
    const rightElement = document.createElement("div");
    const childElement = document.createElement("div");
    const root = new AFXLayer(
      new BrowserAnimationLayerSurface(rootElement),
      c.scheduler,
    );
    const left = new AFXLayer(
      new BrowserAnimationLayerSurface(leftElement),
      c.scheduler,
    );
    const right = new AFXLayer(
      new BrowserAnimationLayerSurface(rightElement),
      c.scheduler,
    );
    const child = new AFXLayer(
      new BrowserAnimationLayerSurface(childElement),
      c.scheduler,
    );

    root.frame = { x: 30, y: 20, width: 800, height: 500 };
    root.transform = AFXTransform3D.rotation(Math.PI / 18);
    left.frame = { x: 45, y: 60, width: 260, height: 180 };
    left.transform = AFXTransform3D.rotation(-Math.PI / 9);
    left.sublayerTransform = AFXTransform3D.translation(22, -11, 8)
      .multiply(AFXTransform3D.rotation(Math.PI / 14, 0, 1, 0));
    right.frame = { x: 390, y: 110, width: 300, height: 220 };
    right.transform = AFXTransform3D.rotation(Math.PI / 7);
    right.sublayerTransform = AFXTransform3D.translation(-18, 25, -5)
      .multiply(AFXTransform3D.rotation(-Math.PI / 12, 1, 0, 0));
    child.frame = { x: 35, y: 28, width: 96, height: 54 };
    child.transform = AFXTransform3D.rotation(Math.PI / 11, 0, 1, 0);

    root.addSublayer(left);
    root.addSublayer(right);
    left.addSublayer(child);
    const before = projectedElementTransform(childElement);

    right.insertSublayer(child, 0, { preservePresentation: true });

    expect(child.superlayer).toBe(right);
    expectTransformClose(projectedElementTransform(childElement), before);
    root.dispose();
  });
  it("rebases an active animation's exact displayed handoff while reparenting", async () => {
    const c = clock();
    const rootElement = document.createElement("div");
    const leftElement = document.createElement("div");
    const rightElement = document.createElement("div");
    const childElement = document.createElement("div");
    const root = new AFXLayer(
      new BrowserAnimationLayerSurface(rootElement),
      c.scheduler,
    );
    const left = new AFXLayer(
      new BrowserAnimationLayerSurface(leftElement),
      c.scheduler,
    );
    const right = new AFXLayer(
      new BrowserAnimationLayerSurface(rightElement),
      c.scheduler,
    );
    const child = new AFXLayer(
      new BrowserAnimationLayerSurface(childElement),
      c.scheduler,
    );
    root.frame = { x: 0, y: 0, width: 900, height: 600 };
    left.frame = { x: 60, y: 90, width: 320, height: 240 };
    left.sublayerTransform = AFXTransform3D.rotation(Math.PI / 16, 0, 1, 0);
    right.frame = { x: 470, y: 140, width: 280, height: 210 };
    right.transform = AFXTransform3D.rotation(-Math.PI / 10);
    right.sublayerTransform = AFXTransform3D.translation(14, -9, 12);
    child.frame = { x: 40, y: 35, width: 120, height: 68 };
    root.addSublayer(left);
    root.addSublayer(right);
    left.addSublayer(child);

    const animation = child.addAnimation(
      new AFXBasicAnimation({
        targetId: "moving-card",
        keyPath: "transform",
        from: "translateX(0px) rotateY(0deg)",
        to: "translateX(120px) rotateY(30deg)",
        animation: new AFXAnimation({ duration: 2, timing: "linear" }),
      }),
      "moving-card",
    );
    c.advance(0.8);
    const before = projectedElementTransform(childElement);

    right.insertSublayer(child, 0, { preservePresentation: true });

    expectTransformClose(projectedElementTransform(childElement), before);
    await expect(animation.finished).resolves.toMatchObject({
      state: "interrupted",
    });
    expect(child.animationKeys()).not.toContain("moving-card");
    root.dispose();
  });
  it("retargets visible presentation, pauses, seeks and settles interruption exactly once", async () => {
    const c = clock(),
      element = document.createElement("div"),
      layer = new AFXLayer(
        new BrowserAnimationLayerSurface(element),
        c.scheduler,
      );
    const first = layer.addAnimation(basic());
    c.advance(0.4);
    expect(Number(element.style.opacity)).toBeCloseTo(0.4);
    const second = layer.addAnimation(basic(0, 0.8));
    await expect(first.finished).resolves.toMatchObject({
      state: "interrupted",
    });
    expect(Number(element.style.opacity)).toBeCloseTo(0.4);
    c.advance(0.9);
    expect(Number(element.style.opacity)).toBeCloseTo(0.6);
    second.pause();
    expect(c.pending.size).toBe(0);
    second.seek(0.25);
    expect(Number(element.style.opacity)).toBeCloseTo(0.5);
    second.resume();
    c.advance(1.65);
    await expect(second.finished).resolves.toMatchObject({
      state: "completed",
    });
    expect(Number(element.style.opacity)).toBeCloseTo(0.8);
    layer.opacity = 0.3;
    expect(Number(element.style.opacity)).toBeCloseTo(0.3);
    layer.dispose();
  });
  it("retargets keyframe and spring replacements from the actual visible state", async () => {
    const c = clock(),
      element = document.createElement("div");
    const layer = new AFXLayer(
      new BrowserAnimationLayerSurface(element),
      c.scheduler,
    );
    const first = layer.addAnimation(basic());
    c.advance(0.4);
    const second = layer.addAnimation(
      new AFXKeyframeAnimation({
        targetId: "test",
        keyPath: "opacity",
        values: [0, 0.8, 0.2],
        keyTimes: [0, 0.5, 1],
        animation: new AFXAnimation({ duration: 1, timing: "linear" }),
      }),
    );
    expect(Number(element.style.opacity)).toBeCloseTo(0.4);
    await expect(first.finished).resolves.toMatchObject({
      state: "interrupted",
    });
    c.advance(0.65);
    expect(Number(element.style.opacity)).toBeCloseTo(0.6);
    const third = layer.addAnimation(
      new AFXSpringAnimation({
        targetId: "test",
        keyPath: "opacity",
        from: 0,
        to: 0.9,
        options: { duration: 1 },
      }),
    );
    expect(Number(element.style.opacity)).toBeCloseTo(0.6);
    await expect(second.finished).resolves.toMatchObject({
      state: "interrupted",
    });
    third.seek(0.2);
    expect(Number(element.style.opacity)).not.toBeCloseTo(0.6);
    layer.dispose();
    await expect(third.finished).resolves.toMatchObject({ state: "cancelled" });
  });
  it("settles reduced or hidden documents without pretending a fixed cadence", async () => {
    const c = clock(),
      layer = new AFXLayer(
        new BrowserAnimationLayerSurface(document.createElement("div")),
        c.scheduler,
      );
    const handle = layer.addAnimation(basic());
    c.suspend();
    await expect(handle.finished).resolves.toMatchObject({
      state: "completed",
      reduced: true,
    });
    expect(c.pending.size).toBe(0);
    layer.dispose();
  });
  it("unwinds transaction capture on exceptions and inherits nested timing", () => {
    const definitions: unknown[] = [];
    const finished: AFXAnimationHandle = {
      id: "test",
      state: "completed",
      progress: 1,
      finished: Promise.resolve({ state: "completed", reduced: false }),
      cancel() {},
      pause() {},
      resume() {},
      seek() {},
    };
    const transaction = new AFXTransaction((_target, definition) => {
        definitions.push(definition);
        return finished;
      }),
      target = {
        id: "t",
        target: {},
        opacity: 0,
        frame: { x: 0, y: 0, width: 1, height: 1 },
      };
    expect(() =>
      transaction.run({ duration: 0.4 }, () => {
        transaction.animator(target).opacity = 1;
        throw new Error("stop");
      }),
    ).toThrow("stop");
    expect(definitions).toEqual([]);
    transaction.run({ duration: 0.4 }, () =>
      transaction.run({ delay: 0.1 }, () => {
        transaction.animator(target).opacity = 1;
      }),
    );
    expect(definitions[0]).toMatchObject({ duration: 0.4, delay: 0.1 });
    transaction.dispose();
  });
  it("inherits disabled actions and observes terminal transaction completion", async () => {
    const c = clock(),
      layer = new AFXLayer(
        new BrowserAnimationLayerSurface(document.createElement("div")),
        c.scheduler,
      ),
      definitions: unknown[] = [];
    const transaction = new AFXTransaction((_target, definition) => {
      definitions.push(definition);
      return layer.addAnimation(
        new AFXBasicAnimation({
          targetId: "test",
          keyPath: "opacity",
          from: 0,
          to: 1,
          animation: new AFXAnimation({ duration: definition.duration }),
        }),
      );
    });
    const completion = vi.fn();
    transaction.run({ disableActions: true }, () => {
      transaction.run({ completion }, () => {
        transaction.animator({
          id: "test",
          target: {},
          opacity: 0,
          frame: { x: 0, y: 0, width: 1, height: 1 },
        }).opacity = 1;
      });
    });
    await Promise.resolve();
    expect(definitions[0]).toMatchObject({ duration: 0 });
    expect(completion).toHaveBeenCalledWith(
      expect.objectContaining({ state: "completed" }),
    );
    expect(c.pending.size).toBe(0);
    transaction.dispose();
    layer.dispose();
  });
  it("groups preserve sampled durations and cancellation settlement", async () => {
    const c = clock(),
      layer = new AFXLayer(
        new BrowserAnimationLayerSurface(document.createElement("div")),
        c.scheduler,
      ),
      group = new AFXAnimationGroup([basic(0, 1, 2)]);
    expect(group.duration).toBe(2);
    expect(group.sample(1)["test:opacity"]).toBe(0.5);
    const handle = group.play({}, () => layer.addAnimation(basic(0, 1, 2)));
    handle.cancel();
    await expect(handle.finished).resolves.toMatchObject({
      state: "cancelled",
    });
    layer.dispose();
  });
});
