import { afterEach, expect, it, vi } from "vitest";
import type { HFXHapticEngine } from "../../src/FX/HapticsFX/HFXHapticEngine";
import { NSEHapticFeedbackManager, registerNSEHapticFeedbackEngine } from "../../src/NSE/Feedback/NSEHapticFeedbackManager";

const releases: (() => void)[] = [];
afterEach(() => { for (const release of releases.splice(0)) release(); vi.unstubAllGlobals(); });

function engine() {
  const trigger = vi.fn(async () => undefined);
  return { engine: { trigger } as unknown as HFXHapticEngine, trigger };
}

it("performs AppKit's feedback patterns through the host's engine (NSHapticFeedbackManager)", () => {
  const performer = NSEHapticFeedbackManager.defaultPerformer;
  expect(NSEHapticFeedbackManager.defaultPerformer).toBe(performer);
  // Without a host nothing happens.
  expect(() => performer.perform("generic")).not.toThrow();

  const first = engine(), second = engine();
  releases.push(registerNSEHapticFeedbackEngine(first.engine));
  const releaseSecond = registerNSEHapticFeedbackEngine(second.engine);
  performer.perform("alignment", "now");
  expect(second.trigger).toHaveBeenCalledWith("selection");
  releaseSecond();
  performer.perform("generic");
  performer.perform("levelChange");
  expect(first.trigger.mock.calls).toEqual([["light"], ["rigid"]]);

  expect(() => performer.perform("thud" as never)).toThrow(TypeError);
  expect(() => performer.perform("generic", "later" as never)).toThrow(TypeError);
});

it("waits for the next frame when asked to perform once drawing completes", () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  const { engine: host, trigger } = engine();
  releases.push(registerNSEHapticFeedbackEngine(host));
  NSEHapticFeedbackManager.defaultPerformer.perform("alignment", "drawCompleted");
  expect(trigger).not.toHaveBeenCalled();
  frames[0]!(0);
  expect(trigger).toHaveBeenCalledWith("selection");
});
