import { expect, it } from "vitest";
import { NSEAnimationContext } from "../../src/NSE/Animation/NSEAnimationContext";
import { atmoMotion } from "../../src/NSE/Themes/Atmo/motion";

it("carries the duration and timing function system animations use (NSAnimationContext.current)", () => {
  const context = NSEAnimationContext.current;
  expect(NSEAnimationContext.current).toBe(context);
  expect(context.duration).toBe(atmoMotion.durations.standard);
  expect(context.timingFunction).toBe(atmoMotion.timingFunctions.standard);
  expect(context.allowsImplicitAnimation).toBe(false);
  expect(Object.isFrozen(context)).toBe(true);
  expect(Object.isFrozen(atmoMotion)).toBe(true);
});
