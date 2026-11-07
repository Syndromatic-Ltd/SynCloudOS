import { expect, it } from "vitest";
import { NSEValueTransformer } from "../../src/Foundation/NSEValueTransformer";

it("registers transformer instances by name and supports explicit reversal", () => {
  class Doubler extends NSEValueTransformer<number, number> {
    static override allowsReverseTransformation() { return true; }
    override transformedValue(value: number) { return value * 2; }
    override reverseTransformedValue(value: number) { return value / 2; }
  }
  const transformer = new Doubler();
  NSEValueTransformer.setValueTransformer(transformer, "test.doubler");
  expect(NSEValueTransformer.valueTransformerForName("test.doubler")).toBe(transformer);
  expect(transformer.reverseTransformedValue(transformer.transformedValue(3))).toBe(3);
  NSEValueTransformer.setValueTransformer(null, "test.doubler");
  expect(NSEValueTransformer.valueTransformerForName("test.doubler")).toBeNull();
});

it("rejects reversal on the base transformer", () => {
  expect(NSEValueTransformer.allowsReverseTransformation()).toBe(false);
  expect(() => new NSEValueTransformer().reverseTransformedValue(1)).toThrow();
});

it("uses the forward transform as the default reverse for reversible subclasses", () => {
  class Invert extends NSEValueTransformer<boolean, boolean> {
    static override allowsReverseTransformation() { return true; }
    override transformedValue(value: boolean) { return !value; }
  }
  expect(new Invert().reverseTransformedValue(true)).toBe(false);
});

it("provides Foundation boolean and nil transformers by their standard names", () => {
  const negate = NSEValueTransformer.valueTransformerForName("NSNegateBoolean")!;
  expect(negate.transformedValue(true)).toBe(false);
  expect(negate.reverseTransformedValue(false)).toBe(true);
  expect(NSEValueTransformer.valueTransformerForName("NSIsNil")!.transformedValue(null)).toBe(true);
  expect(NSEValueTransformer.valueTransformerForName("NSIsNotNil")!.transformedValue("x")).toBe(true);
});
