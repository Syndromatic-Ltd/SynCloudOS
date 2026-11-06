import { describe, expect, it } from "vitest";
import { coverFlowLayoutAttributes } from "../../../src/NSE/DataViews/Collection";

describe("coverFlowLayoutAttributes", () => {
  it("puts the selected item frontal and turns neighbours inward", () => {
    const items = coverFlowLayoutAttributes(["a", "b", "c", "d"], 1, 200);
    expect(items[1]).toMatchObject({ id: "b", offset: 0, x: 0, z: 0, yawRadians: 0, scale: 1 });
    expect(items[0]!.x).toBeLessThan(0);
    expect(items[0]!.yawRadians).toBeGreaterThan(0);
    expect(items[2]!.yawRadians).toBeLessThan(0);
    expect(items[3]!.z).toBeGreaterThan(items[2]!.z);
    expect(items[3]!.scale).toBeLessThan(items[2]!.scale);
  });

  it("rejects an out-of-range selection and duplicate ids", () => {
    expect(() => coverFlowLayoutAttributes(["a"], 1, 100)).toThrow(RangeError);
    expect(() => coverFlowLayoutAttributes(["a", "a"], 0, 100)).toThrow(TypeError);
    expect(() => coverFlowLayoutAttributes(["a"], 0, 0)).toThrow(RangeError);
  });
});
