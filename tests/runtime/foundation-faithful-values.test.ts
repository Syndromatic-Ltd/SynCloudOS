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
