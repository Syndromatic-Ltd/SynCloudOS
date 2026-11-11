import { expect, it } from "vitest";
import { AFXAnimation, AFXBasicAnimation } from "../../../src/FX/AnimationFX/public";
import { createAFXLayer, type AFXLayerSurface } from "../../../src/FX/AnimationFX/host";

function fixture(reduced = true) {
  let time = 0;
  const frames = new Set<(time: number) => void>();
  const listeners = new Set<() => void>();
  const surface: AFXLayerSurface = { supportedProperties: ["opacity", "transform"], apply() {}, attach() {}, detach() {}, setMask() {}, dispose() {} };
  const layer = createAFXLayer(surface, { now: () => time, get reducedMotion() { return reduced; }, suspended: false,
    requestFrame(callback) { frames.add(callback); return () => { frames.delete(callback); }; },
    subscribeState(callback) { listeners.add(callback); return () => { listeners.delete(callback); }; },
  });
  return { layer, tick(seconds: number) { time = seconds; for (const callback of [...frames]) { frames.delete(callback); callback(time); } },
    reduce() { reduced = true; for (const callback of listeners) callback(); } };
}

it("preserves a single system opacity crossfade under reduced motion", () => {
  const f = fixture();
  const handle = f.layer.addAnimation(new AFXBasicAnimation({ targetId: "fade", keyPath: "opacity", from: 0, to: 1,
    animation: new AFXAnimation({ duration: 0.24, timing: "linear", reducedMotion: "system" }) }));
  expect(handle.state).toBe("running");
  f.tick(0.12); expect(f.layer.presentation.opacity).toBeCloseTo(0.5);
  f.tick(0.24); expect(handle.state).toBe("completed");
  f.layer.dispose();
});

it("preserves opacity on a runtime preference change and still honours explicit pause", () => {
  const f = fixture(false);
  const handle = f.layer.addAnimation(new AFXBasicAnimation({ targetId: "fade", keyPath: "opacity", from: 0, to: 1,
    animation: new AFXAnimation({ duration: 1, timing: "linear" }) }));
  f.tick(0.2); handle.pause(); f.reduce();
  expect(handle.state).toBe("paused");
  expect(f.layer.presentation.opacity).toBeCloseTo(0.2);
  handle.resume(); f.tick(0.4); expect(f.layer.presentation.opacity).toBeCloseTo(0.4);
  f.layer.dispose();
});

it("settles system repeats and always effects, while never opts out of spatial reduction", () => {
  for (const iterations of [0.5, 2, Infinity]) {
    const f = fixture();
    const handle = f.layer.addAnimation(new AFXBasicAnimation({ targetId: "repeat", keyPath: "opacity", from: 0, to: 1,
      animation: new AFXAnimation({ duration: 1, iterations }) }));
    expect(handle.state).toBe("completed"); f.layer.dispose();
  }
  for (const [policy, reduced, expected] of [["always", false, "completed"], ["system", true, "completed"], ["never", true, "running"]] as const) {
    const f = fixture(reduced);
    const handle = f.layer.addAnimation(new AFXBasicAnimation({ targetId: "move", keyPath: "transform", from: "translateX(10px)", to: "translateX(0px)",
      animation: new AFXAnimation({ duration: 1, reducedMotion: policy }) }));
    expect(handle.state).toBe(expected); f.layer.dispose();
  }
});
