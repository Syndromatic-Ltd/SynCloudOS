import { afterEach, describe, expect, it, vi } from "vitest";
import * as D from "../public";
import { nanoseconds } from "../internal/time";

afterEach(() => vi.restoreAllMocks());

describe("Dispatch value types", () => {
  it("measures a future uptime deadline as a negative nanosecond distance", () => {
    vi.spyOn(performance, "now").mockReturnValue(100);
    const later = D.DFXTime.now().advanced(D.DFXTimeInterval.milliseconds(5));
    expect(later.uptimeNanoseconds).toBe(105_000_000);
    expect(nanoseconds(later.distance(D.DFXTime.now()))).toBe(-5_000_000);
  });
  it("keeps distantFuture later than every finite safe uptime", () => {
    expect(D.DFXTime.distantFuture.uptimeNanoseconds).toBe(Number.MAX_SAFE_INTEGER);
    expect(nanoseconds(new D.DFXTime(Number.MAX_SAFE_INTEGER - 1).distance(D.DFXTime.distantFuture))).toBe(1);
    expect(new D.DFXTime(Number.MAX_SAFE_INTEGER - 1).advanced(D.DFXTimeInterval.seconds(1))).toBe(D.DFXTime.distantFuture);
    expect(D.DFXTime.now().advanced(D.DFXTimeInterval.never)).toBe(D.DFXTime.distantFuture);
    expect(D.DFXTime.distantFuture.advanced(D.DFXTimeInterval.seconds(-1))).toBe(D.DFXTime.distantFuture);
  });
  it("rejects invalid uptime inputs with libdispatch client errors", () => {
    for (const n of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
      expect(() => new D.DFXTime(n)).toThrow(/^BUG IN CLIENT OF LIBDISPATCH:/);
    expect(new D.DFXTime(1).advanced(D.DFXTimeInterval.nanoseconds(-2)).uptimeNanoseconds).toBe(0);
  });
  it("keeps interval units and signed distances private", () => {
    expect(nanoseconds(D.DFXTimeInterval.seconds(2))).toBe(2e9);
    expect(nanoseconds(D.DFXTimeInterval.milliseconds(-2))).toBe(-2e6);
    expect(nanoseconds(D.DFXTimeInterval.microseconds(2))).toBe(2000);
    expect(nanoseconds(D.DFXTimeInterval.nanoseconds(-2))).toBe(-2);
    expect(nanoseconds(D.DFXTimeInterval.never)).toBe(Infinity);
    expect(Object.keys(D.DFXTimeInterval.seconds(1))).toEqual([]);
    for (const n of [NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])
      expect(() => D.DFXTimeInterval.nanoseconds(n)).toThrow(/^BUG IN CLIENT OF LIBDISPATCH:/);
    expect(() => D.DFXTimeInterval.seconds(Number.MAX_SAFE_INTEGER)).toThrow(/^BUG IN CLIENT OF LIBDISPATCH:/);
  });
  it("uses Apple's unsigned negative epoch encoding for wall rawValue", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    const now = D.DFXWallTime.now();
    expect(now.rawValue).toBe((1n << 64n) - 1_800_000_000_000_000_000n);
    expect("uptimeNanoseconds" in now).toBe(false);
    const later = now.advanced(D.DFXTimeInterval.nanoseconds(1));
    expect(later.rawValue).toBe(now.rawValue - 1n);
    expect(nanoseconds(now.distance(later))).toBe(1);
    expect(nanoseconds(later.distance(now))).toBe(-1);
    expect(D.DFXWallTime.distantFuture.rawValue).toBe((1n << 64n) - 1n);
    expect(now.advanced(D.DFXTimeInterval.never)).toBe(D.DFXWallTime.distantFuture);
    expect(nanoseconds(now.distance(D.DFXWallTime.distantFuture))).toBe(Infinity);
    expect(nanoseconds(D.DFXWallTime.distantFuture.distance(now))).toBe(-Number.MAX_SAFE_INTEGER);
    expect(nanoseconds(D.DFXWallTime.distantFuture.distance(D.DFXWallTime.distantFuture))).toBe(0);
  });
  it("keeps wall future absorbing and large finite distances safely saturated", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    const now = D.DFXWallTime.now();
    expect(D.DFXWallTime.distantFuture.advanced(D.DFXTimeInterval.seconds(-1))).toBe(D.DFXWallTime.distantFuture);
    const later = now.advanced(D.DFXTimeInterval.nanoseconds(Number.MAX_SAFE_INTEGER)).advanced(D.DFXTimeInterval.seconds(1));
    expect(nanoseconds(now.distance(later))).toBe(Number.MAX_SAFE_INTEGER);
    expect(nanoseconds(later.distance(now))).toBe(-Number.MAX_SAFE_INTEGER);
  });
  it("reserves wall sentinels at clock range boundaries", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(8_640_000_000_000_000);
    expect(D.DFXWallTime.now()).toBe(D.DFXWallTime.distantFuture);
    clock.mockReturnValue(0);
    const start = D.DFXWallTime.now();
    expect(start.rawValue).toBe((1n << 64n) - 2n);
    expect(start.advanced(D.DFXTimeInterval.seconds(-1)).rawValue).toBe(start.rawValue);
  });
  it("returns future when host wall time exceeds Apple's 62-bit clock value range", () => {
    vi.spyOn(Date, "now").mockReturnValue(5_000_000_000_000);
    expect(D.DFXWallTime.now()).toBe(D.DFXWallTime.distantFuture);
  });
  it("keeps finite wall raw values tagged 11 through Apple's exact overflow boundary", () => {
    vi.spyOn(Date, "now").mockReturnValue(4_611_686_018_427);
    const now = D.DFXWallTime.now();
    expect(now.rawValue >> 62n).toBe(3n);
    const lastFinite = now.advanced(D.DFXTimeInterval.nanoseconds(387_902));
    expect(lastFinite).not.toBe(D.DFXWallTime.distantFuture);
    expect(lastFinite.rawValue >> 62n).toBe(3n);
    expect(nanoseconds(now.distance(lastFinite))).toBe(387_902);
    expect(now.advanced(D.DFXTimeInterval.nanoseconds(387_903))).toBe(D.DFXWallTime.distantFuture);
  });
  it("validates QoS priorities and exposes Apple's classes", () => {
    for (const n of [1, -16, -0.5, NaN, Infinity]) expect(() => new D.DFXQoS(D.DFXQoSClass.utility, n)).toThrow(/^BUG IN CLIENT OF LIBDISPATCH:/);
    expect(() => new D.DFXQoS("invented" as D.DFXQoSClass, 0)).toThrow(/^BUG IN CLIENT OF LIBDISPATCH:/);
    const qos = new D.DFXQoS(D.DFXQoSClass.utility, -15);
    expect(qos.qosClass).toBe("utility"); expect(qos.relativePriority).toBe(-15);
    for (const name of Object.values(D.DFXQoSClass)) {
      expect(D.DFXQoS[name].qosClass).toBe(name);
      expect(D.DFXQoS[name].relativePriority).toBe(0);
      expect(Object.isFrozen(D.DFXQoS[name])).toBe(true);
    }
  });
  it("exposes frozen Apple enums and option-set singletons without invented members", () => {
    expect(D.DFXTimeoutResult).toEqual({ success: "success", timedOut: "timedOut" });
    expect(D.DFXQueueAutoreleaseFrequency).toEqual({ inherit: "inherit", workItem: "workItem", never: "never" });
    for (const enumeration of [D.DFXQoSClass, D.DFXTimeoutResult, D.DFXQueueAutoreleaseFrequency]) expect(Object.isFrozen(enumeration)).toBe(true);
    for (const [type, names] of [
      [D.DFXQueueAttributes, ["concurrent", "initiallyInactive"]],
      [D.DFXWorkItemFlags, ["barrier", "detached", "assignCurrentContext", "noQoS", "inheritQoS", "enforceQoS"]],
      [D.DFXSourceTimerFlags, ["strict"]],
      [D.DFXSourceMemoryPressureEvent, ["normal", "warning", "critical", "all"]],
    ] as const) for (const name of names) {
      const member = (type as unknown as Record<string, unknown>)[name];
      expect(member).toBeInstanceOf(type); expect(Object.isFrozen(member)).toBe(true);
      expect(Object.keys(member as object)).toEqual([]);
    }
    expect(new D.DFXSpecificKey<string>()).not.toBe(new D.DFXSpecificKey<string>());
  });
});
