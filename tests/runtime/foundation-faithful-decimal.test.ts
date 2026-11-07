import { expect, it } from "vitest";
import { NSEDecimalNumber, NSEDecimalNumberHandler } from "../../src/Foundation/NSEDecimalNumber";
it("uses decimal arithmetic and rounds with handlers", () => {
  const n = NSEDecimalNumber.fromString;
  expect(n("0.1").adding(n("0.2")).toString()).toBe("0.3");
  const h = new NSEDecimalNumberHandler({scale: 2, roundingMode: "bankers"});
  expect(n("1").dividing(n("8"), h).toString()).toBe("0.12");
  expect(n("3").dividing(n("8"), h).toString()).toBe("0.38");
  expect(n("100").dividing(n("3")).toString()).toBe("33.333333333333333333333333333333333333");
  expect(n("1e-100").dividing(n("1")).toString()).toBe("0." + "0".repeat(99) + "1");
  expect(() => n("1").dividing(n("0"))).toThrow(/zero/i);
});
it("enforces exponent and precision boundaries", () => {
  const n = NSEDecimalNumber.fromString;
  expect(() => n("1e166")).toThrow(/overflow/i);
  expect(() => n("1e-129")).toThrow(/underflow/i);
  expect(() => n("1").dividing(n("3"), new NSEDecimalNumberHandler({raiseOnExactness:true}))).toThrow(/precision/i);
  expect(n("1").dividing(n("0"), new NSEDecimalNumberHandler({raiseOnDivideByZero:false})).toString()).toBe("NaN");
});
it("rounds signed values and reports unrepresentable underflow", () => {
  const n=NSEDecimalNumber.fromString;
  expect(n("-2.51").dividing(n("1"),new NSEDecimalNumberHandler({scale:0,roundingMode:"down"})).toString()).toBe("-3");
  expect(n("-2.51").dividing(n("1"),new NSEDecimalNumberHandler({scale:0,roundingMode:"up"})).toString()).toBe("-2");
  expect(() => n("1e-128").dividing(n("10"))).toThrow(/underflow/i);
});
it("rounds small operands into representable values", () => {
  const n=NSEDecimalNumber.fromString;
  const tiny = n("1e-128");
  expect(() => tiny.multiplying(n("0.1"))).toThrow(/underflow/i);
  expect(tiny.adding(n("1e-127")).toString()).toBe("0." + "0".repeat(126) + "11");
});
it("rounds products back into the exponent range and supports rounding behaviors", () => {
  const n=NSEDecimalNumber.fromString;
  expect(n("1.0000000000000000000000000000000000001e-100").multiplying(n("1e-28")).toString()).toBe(n("1e-128").toString());
  expect(n("12.345").rounding(new NSEDecimalNumberHandler({scale:2,roundingMode:"bankers"})).toString()).toBe("12.34");
  expect(NSEDecimalNumber.zero.toString()).toBe("0");
  expect(NSEDecimalNumber.one.toString()).toBe("1");
});
it("uses replaceable default behavior and custom exception handling", () => {
  const original=NSEDecimalNumber.defaultBehavior;
  try {
    NSEDecimalNumber.defaultBehavior=new NSEDecimalNumberHandler({scale:2});
    expect(NSEDecimalNumber.fromString("1").dividing(NSEDecimalNumber.fromString("3")).toString()).toBe("0.33");
    const custom={...new NSEDecimalNumberHandler(), exceptionDuringOperation: () => NSEDecimalNumber.one};
    expect(NSEDecimalNumber.one.dividing(NSEDecimalNumber.zero,custom)).toBe(NSEDecimalNumber.one);
  } finally { NSEDecimalNumber.defaultBehavior=original; }
});
it("rejects extreme exponents without exponent-sized allocations", () => {
  expect(() => NSEDecimalNumber.fromString("1e-9999999999")).toThrow(/underflow/i);
  expect(() => NSEDecimalNumber.fromString("1e9999999999")).toThrow(/overflow/i);
});
