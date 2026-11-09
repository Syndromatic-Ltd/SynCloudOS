import { describe, expect, it } from "vitest";
import { NSEEdgeInsetsMake, NSEEdgeInsetsZero } from "../../src/NSE/Layout/NSEEdgeInsets";
import { physicalSafeAreaInsets, resolveSafeAreaInsets } from "../../src/NSE/Layout/safeAreaModel";

const bounds = { x: 0, y: 0, width: 800, height: 600 };
const resolve = (input: Partial<Parameters<typeof resolveSafeAreaInsets>[0]> = {}) => resolveSafeAreaInsets({ screen: NSEEdgeInsetsZero, chrome: [], additional: NSEEdgeInsetsZero, bounds, ...input });

describe("AppKit edge insets", () => {
  it("has AppKit's field order and a frozen zero value", () => {
    expect(NSEEdgeInsetsZero).toEqual({ top: 0, left: 0, bottom: 0, right: 0 });
    expect(Object.isFrozen(NSEEdgeInsetsZero)).toBe(true);
    expect(Object.keys(NSEEdgeInsetsMake(1, 2, 3, 4))).toEqual(["top", "left", "bottom", "right"]);
    expect(NSEEdgeInsetsMake(1, 2, 3, 4)).toEqual({ top: 1, left: 2, bottom: 3, right: 4 });
  });
  it("preserves finite signed values in the geometry constructor", () => {
    expect(NSEEdgeInsetsMake(-1, 2, -3, 4)).toEqual({ top: -1, left: 2, bottom: -3, right: 4 });
  });
});

describe("safe-area resolution", () => {
  it("passes screen insets through with no chrome", () => {
    const screen = NSEEdgeInsetsMake(20, 8, 34, 6);
    expect(resolve({ screen })).toEqual(screen);
  });
  it("adds a title bar to the screen's top safe area", () => {
    expect(resolve({ screen: NSEEdgeInsetsMake(20, 0, 0, 0), chrome: [{ edge: "top", thickness: 44, translucent: false }] }).top).toBe(64);
  });
  it("adds a translucent bottom tab bar to the home-indicator inset", () => {
    expect(resolve({ screen: NSEEdgeInsetsMake(0, 0, 34, 0), chrome: [{ edge: "bottom", thickness: 72, translucent: true }] }).bottom).toBe(106);
  });
  it("adds additional insets on each physical edge", () => {
    expect(resolve({ screen: NSEEdgeInsetsMake(1, 2, 3, 4), additional: NSEEdgeInsetsMake(10, 20, 30, 40), chrome: [{ edge: "left", thickness: 100, translucent: false }] })).toEqual({ top: 11, left: 122, bottom: 33, right: 44 });
  });
  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid obstruction thickness %s", thickness => {
    expect(() => resolve({ chrome: [{ edge: "top", thickness, translucent: false }] })).toThrow(TypeError);
  });
  it("bounds each inset by the available view extent", () => {
    expect(resolve({ chrome: [{ edge: "bottom", thickness: 900, translucent: true }] }).bottom).toBe(600);
  });
  it("maps ScreenService's logical insets to physical LTR edges", () => {
    expect(physicalSafeAreaInsets({ blockStart: 20, inlineStart: 10, blockEnd: 34, inlineEnd: 5 }, "ltr")).toEqual({ top: 20, left: 10, bottom: 34, right: 5 });
  });
  it("maps logical inline-start to the physical right edge in RTL", () => {
    expect(physicalSafeAreaInsets({ blockStart: 20, inlineStart: 10, blockEnd: 34, inlineEnd: 5 }, "rtl")).toEqual({ top: 20, left: 5, bottom: 34, right: 10 });
  });
});
