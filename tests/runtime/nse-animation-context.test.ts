import { expect, it, vi } from "vitest";
import { NSEAnimationContext } from "../../src/NSE/Animation/NSEAnimationContext";
import { NSEAnimationDefaults } from "../../src/NSE/Appearance/NSEAnimationDefaults";

it("carries the duration and timing function system animations use (NSAnimationContext.current)", () => {
  const context = NSEAnimationContext.current;
  expect(NSEAnimationContext.current).toBe(context);
  expect(context.duration).toBe(NSEAnimationDefaults.durationSeconds.standard);
  expect(context.timingFunction).toBe(NSEAnimationDefaults.easing.standard);
  expect(context.allowsImplicitAnimation).toBe(false);
  expect(Object.isFrozen(NSEAnimationDefaults)).toBe(true);
});

it("scopes mutable animation groups and restores the enclosing context after errors", () => {
  const outer = NSEAnimationContext.current;
  NSEAnimationContext.runAnimationGroup(context => {
    context.duration = 0.42;
    context.timingFunction = NSEAnimationDefaults.easing.emphasized;
    context.allowsImplicitAnimation = true;
    expect(NSEAnimationContext.current).toBe(context);
    expect(() => NSEAnimationContext.runAnimationGroup(nested => {
      expect(nested.duration).toBe(0.42);
      nested.duration = 0.1;
      throw new Error("leave nested group");
    })).toThrow("leave nested group");
    expect(NSEAnimationContext.current).toBe(context);
    expect(context.duration).toBe(0.42);
  });
  expect(NSEAnimationContext.current).toBe(outer);
});

it("completes an empty group once after returning to its caller", async () => {
  const completion = vi.fn();
  NSEAnimationContext.runAnimationGroup(context => { context.duration = 0; }, completion);
  expect(completion).not.toHaveBeenCalled();
  await Promise.resolve();
  await Promise.resolve();
  expect(completion).toHaveBeenCalledTimes(1);
});

it("rejects invalid timing and asynchronous groups without leaking the active context", () => {
  const current = NSEAnimationContext.current;
  expect(() => NSEAnimationContext.runAnimationGroup(context => { context.duration = -1; })).toThrow();
  expect(() => NSEAnimationContext.runAnimationGroup(context => { context.duration = NaN; })).toThrow();
  expect(() => NSEAnimationContext.runAnimationGroup((async () => {}) as never)).toThrow(/synchronous/);
  expect(NSEAnimationContext.current).toBe(current);
});
