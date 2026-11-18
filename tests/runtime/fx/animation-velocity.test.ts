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
import {
  AFXAnimation,
  AFXBasicAnimation,
  AFXLayer,
  AFXSpringAnimation,
  type AFXFrameScheduler,
} from "../../../src/FX/AnimationFX/public";
import { sampleSpring, sampleSpringVelocity } from "../../../src/FX/AnimationFX/AFXTimingFunction";
import { afxProgressVelocity, afxSampledVelocity } from "../../../src/FX/AnimationFX/animationVelocity";
import { createAFXLayer } from "../../../src/FX/AnimationFX/host";
import { BrowserAnimationLayerSurface } from "../../../src/SynCloudOS/PlatformAdapters/BrowserAnimationAdapter";

const regimes = [
  { name: "under", damping: 10 },
  { name: "critical", damping: 20 },
  { name: "over", damping: 40 },
] as const;

function layer() {
  let now = 0;
  const scheduler: AFXFrameScheduler = {
    now: () => now,
    reducedMotion: false,
    suspended: false,
    requestFrame: () => () => undefined,
  };
  const value = createAFXLayer(AFXLayer, new BrowserAnimationLayerSurface(document.createElement("div")), scheduler);
  value.frame = { x: 0, y: 0, width: 10, height: 10 };
  return value;
}

const spring = (input: Partial<ConstructorParameters<typeof AFXSpringAnimation>[0]> = {}) => new AFXSpringAnimation({
  targetId: "layer",
  keyPath: "opacity",
  from: 0,
  to: 1,
  stiffness: 100,
  damping: 10,
  ...input,
});

describe("spring velocity", () => {
  it("is the derivative of the step response", () => {
    for (const { damping } of regimes) for (const initialVelocity of [0, 5]) for (const t of [0.01, 0.1, 0.5, 1]) {
      const h = 1e-5;
      const numeric = (sampleSpring(t + h, 1, 100, damping, initialVelocity) - sampleSpring(t - h, 1, 100, damping, initialVelocity)) / (2 * h);
      expect(sampleSpringVelocity(t, 1, 100, damping, initialVelocity)).toBeCloseTo(numeric, 4);
    }
    expect(sampleSpringVelocity(0, 1, 100, 10, 7)).toBe(7);
  });

  it("settles every regime within 1e-4 of rest by settlingDuration", () => {
    const cases = [...regimes.map(({ damping }) => ({ damping, initialVelocity: 0 })),
      { damping: 10, initialVelocity: -50 }, { damping: 20, initialVelocity: 50 }, { damping: 40, initialVelocity: 50 }, { damping: 1, initialVelocity: 0 }];
    for (const { damping, initialVelocity } of cases) {
      const settle = spring({ damping, initialVelocity }).settlingDuration;
      for (let t = settle; t < settle + 2; t += 0.001) {
        expect(Math.abs(1 - sampleSpring(t, 1, 100, damping, initialVelocity)), `damping ${damping}, v ${initialVelocity}, t ${t}`).toBeLessThan(1e-4);
        expect(Math.abs(sampleSpringVelocity(t, 1, 100, damping, initialVelocity))).toBeLessThan(1e-2);
      }
    }
  });
});

describe("running animation velocity", () => {
  const linear = (from: unknown, to: unknown, keyPath = "opacity") => new AFXBasicAnimation({
    targetId: "layer",
    keyPath: keyPath as never,
    from: from as never,
    to: to as never,
    animation: new AFXAnimation({ duration: 1, timing: "linear" }),
  });

  it("samples numbers and numeric records, and nothing else", () => {
    for (const t of [0, 0.5, 1]) expect(afxSampledVelocity(linear(0, 100), t)).toBeCloseTo(100, 6);
    expect(afxSampledVelocity(linear({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 20, width: 10, height: 30 }, "frame"), 0.5))
      .toEqual({ x: expect.closeTo(10, 6), y: expect.closeTo(20, 6), width: expect.closeTo(0, 6), height: expect.closeTo(20, 6) });
    expect(afxSampledVelocity(linear("translateX(0px)", "translateX(10px)", "transform"), 0.5)).toBeNull();
  });

  it("projects velocity onto the new direction", () => {
    expect(afxProgressVelocity(0, 100, 50)).toBe(0.5);
    expect(afxProgressVelocity(0, 100, -50)).toBe(-0.5);
    expect(afxProgressVelocity(5, 5, 50)).toBe(0);
    expect(afxProgressVelocity(0, 1, null)).toBe(0);
    expect(afxProgressVelocity({ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 4 })).toBeCloseTo(1, 12);
    expect(afxProgressVelocity("a", "b", 3)).toBe(0);
  });

  it("matches the analytic spring velocity", () => {
    const animation = spring({ to: 100 });
    for (const t of [0.05, 0.2, 0.6]) {
      const analytic = animation.velocity(t) as number, sampled = afxSampledVelocity(animation, t) as number;
      expect(Math.abs(analytic - sampled)).toBeLessThan(0.01 * Math.max(1, Math.abs(analytic)));
    }
    expect(animation.velocity(animation.animation.totalDuration + 1)).toBe(0);
    expect(new AFXSpringAnimation({ targetId: "layer", keyPath: "transform", from: "scale(1)", to: "scale(2)" }).velocity(0.1)).toBeNull();
  });
});

describe("interruptions keep velocity", () => {
  const presentationVelocity = (value: AFXLayer, handle: { seek(seconds: number): void }) => {
    const h = 0.001;
    handle.seek(0);
    const start = value.presentation.opacity;
    handle.seek(h);
    return (value.presentation.opacity - start) / h;
  };

  it("continues at the interrupted spring's velocity", () => {
    const value = layer();
    value.opacity = 0;
    const firstSpring = spring({ options: { duration: 2 } });
    const first = value.addAnimation(firstSpring);
    first.seek(0.08);
    const before = firstSpring.velocity(0.08) as number;
    const second = value.addAnimation(spring({ to: 0.2, options: { duration: 2 } }));
    expect(before).toBeGreaterThan(1);
    expect(presentationVelocity(value, second)).toBeCloseTo(before, 1);
  });

  it("keeps an explicit launch velocity", () => {
    const value = layer();
    value.opacity = 0;
    const first = value.addAnimation(spring({ options: { duration: 2 } }));
    first.seek(0.08);
    const second = value.addAnimation(spring({ to: 0.2, initialVelocity: 0, options: { duration: 2 } }));
    expect(Math.abs(presentationVelocity(value, second))).toBeLessThan(0.05);
  });

  it("inherits velocity from a basic animation and survives a zero-distance retarget", () => {
    const value = layer();
    value.opacity = 0;
    const first = value.addAnimation(new AFXBasicAnimation({
      targetId: "layer", keyPath: "opacity", from: 0, to: 1, animation: new AFXAnimation({ duration: 1, timing: "linear" }),
    }));
    first.seek(0.5);
    const second = value.addAnimation(spring({ to: 0.5, options: { duration: 2 } }));
    second.seek(0);
    expect(value.presentation.opacity).toBeCloseTo(0.5, 6);
    second.seek(0.5);
    expect(Number.isFinite(value.presentation.opacity)).toBe(true);
  });
});

describe("perceptual springs", () => {
  const ratio = (animation: AFXSpringAnimation) => animation.damping / (2 * Math.sqrt(animation.stiffness * animation.mass));
  const perceptual = (perceptualDuration: number, bounce: number) =>
    new AFXSpringAnimation({ targetId: "layer", keyPath: "opacity", from: 0, to: 1, perceptualDuration, bounce });

  it("maps duration and bounce to Core Animation's physical parameters", () => {
    expect(ratio(perceptual(0.5, 0))).toBeCloseTo(1, 9);
    expect(ratio(perceptual(0.5, 0.3))).toBeCloseTo(0.7, 9);
    expect(ratio(perceptual(0.5, -0.5))).toBeCloseTo(2, 9);
    expect(perceptual(0.5, 0).stiffness).toBeCloseTo((2 * Math.PI / 0.5) ** 2, 9);
  });

  it("round-trips physical parameters", () => {
    for (const damping of [5, 20, 60]) {
      const physical = spring({ mass: 2, stiffness: 300, damping });
      const again = perceptual(physical.perceptualDuration, physical.bounce);
      expect(again.stiffness / again.mass).toBeCloseTo(physical.stiffness / physical.mass, 6);
      expect(ratio(again)).toBeCloseTo(ratio(physical), 9);
    }
  });

  it("rejects mixed parameter styles", () => {
    expect(() => new AFXSpringAnimation({ targetId: "layer", keyPath: "opacity", from: 0, to: 1, perceptualDuration: 0.5, stiffness: 100 })).toThrow(TypeError);
    expect(() => perceptual(0.5, 1)).toThrow(RangeError);
  });
});
