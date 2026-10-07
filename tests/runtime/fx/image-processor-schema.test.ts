/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { describe, expect, it } from "vitest";
import { GFXImage } from "../../../src/FX/GraphicsFX/public";
import {
  IFXContext,
  IFXFilterGraph,
  IFXFilterRegistry,
  IFXGraphCodec,
  IFXImage,
  IFXKernel,
  IFXProcessorDefinition,
  IFXSampler,
} from "../../../src/FX/ImageFX/public";

const source = () => IFXImage.fromPixels(new GFXImage({
  width: 2,
  height: 1,
  alpha: "straight",
  colourSpace: "linear-srgb",
  data: new Uint8Array([64, 32, 16, 255, 128, 64, 32, 255]),
}));

function gainDefinition(onEvaluate?: () => void) {
  return new IFXProcessorDefinition({
    id: "custom:gain",
    version: 1,
    inputCount: 1,
    parameters: {
      gain: { type: "number", default: 1, minimum: 0, maximum: 4 },
      enabled: { type: "boolean", default: true },
      mode: { type: "enum", values: ["rgb", "rgba"], default: "rgb" },
    },
    output: { kind: "first-input" },
    roi: { kind: "identity" },
    evaluate: (point, access, parameters) => {
      onEvaluate?.();
      const sample = access.sample(0, point);
      if (!parameters.enabled) return sample;
      const gain = parameters.gain as number;
      return {
        r: sample.r * gain,
        g: sample.g * gain,
        b: sample.b * gain,
        a: parameters.mode === "rgba" ? Math.min(1, sample.a * gain) : sample.a,
      };
    },
  });
}

function portableGainDefinition() {
  return new IFXProcessorDefinition({
    id: "custom:portableGain",
    version: 1,
    inputCount: 1,
    parameters: {
      gain: { type: "number", default: 1, minimum: 0, maximum: 4 },
    },
    output: { kind: "first-input" },
    roi: { kind: "identity" },
    portableProgram: {
      kind: "kernel",
      version: 1,
      program: {
        inputCount: 1,
        instructions: [
          { op: "sample", input: 0 },
          { op: "constant", value: [1, 1, 1, 1] },
          { op: "multiply", left: 0, right: 1 },
        ],
        output: 2,
      },
      bindings: [
        { parameter: "gain", instruction: 1, components: [0, 1, 2] },
      ],
    },
    evaluate: (point, access, parameters) => {
      const sample = access.sample(0, point);
      const gain = parameters.gain as number;
      return { r: sample.r * gain, g: sample.g * gain, b: sample.b * gain, a: sample.a };
    },
  });
}

describe("ImageFX parameterized processor schema and durable graph codec", () => {
  it("normalizes owned parameters and changes pixels measurably", () => {
    const definition = gainDefinition();
    const parameters = definition.normaliseParameters({ gain: 2 });
    expect(parameters).toEqual({ gain: 2, enabled: true, mode: "rgb" });
    expect(Object.isFrozen(parameters)).toBe(true);
    expect(() => definition.normaliseParameters({ gain: 8 })).toThrow(/range/i);
    expect(() => definition.normaliseParameters({ gain: 1, surprise: 1 } as never)).toThrow(/unknown/i);
    const output = definition.apply({ gain: 2 }, source());
    const sample = new IFXSampler(output).sample({ x: 0.5, y: 0.5 });
    expect(sample.r).toBeCloseTo(128 / 255, 5);
    expect(sample.g).toBeCloseTo(64 / 255, 5);
  });

  it("round-trips a registered custom processor through v2 without serializing code", () => {
    const registry = new IFXFilterRegistry();
    const definition = gainDefinition();
    registry.registerProcessor(definition);
    const codec = new IFXGraphCodec(registry);
    const encoded = codec.encode(new IFXFilterGraph(definition.apply({ gain: 1.5, mode: "rgba" }, source())));
    expect(encoded.version).toBe(2);
    const operation = encoded.nodes.find(node => node.kind === "operation");
    expect(operation?.processor).toEqual({ kind: "custom", id: "custom:gain", version: 1 });
    expect(JSON.stringify(encoded)).not.toContain("evaluate");
    const restored = codec.decode(encoded);
    const originalSample = new IFXSampler(definition.apply({ gain: 1.5, mode: "rgba" }, source())).sample({ x: 0.5, y: 0.5 });
    expect(new IFXSampler(restored.output).sample({ x: 0.5, y: 0.5 })).toEqual(originalSample);
  });

  it("round-trips a parameterized portable custom processor through v2 without a callback registry", () => {
    const definition = portableGainDefinition();
    const encoded = new IFXGraphCodec().encode(new IFXFilterGraph(definition.apply({ gain: 1.5 }, source())));
    const operation = encoded.nodes.find(node => node.kind === "operation");
    expect(operation?.processor).toMatchObject({
      kind: "custom",
      id: "custom:portableGain",
      version: 1,
      program: { kind: "kernel", version: 1 },
    });
    expect(JSON.stringify(encoded)).not.toContain("evaluate");
    const restored = new IFXGraphCodec().decode(encoded);
    const sample = new IFXSampler(restored.output).sample({ x: 0.5, y: 0.5 });
    expect(sample.r).toBeCloseTo(96 / 255, 5);
    expect(sample.g).toBeCloseTo(48 / 255, 5);
    expect(sample.b).toBeCloseTo(24 / 255, 5);
    expect(sample.a).toBe(1);
  });

  it("decodes valid v1 graphs and migrates them to v2 while retaining colorSpace spelling", () => {
    const codec = new IFXGraphCodec(new IFXFilterRegistry());
    const v1 = new IFXFilterGraph(source()).serialize();
    const decoded = codec.decode(v1);
    expect(new IFXSampler(decoded.output).sample({ x: 1.5, y: 0.5 }).r).toBeCloseTo(128 / 255, 5);
    const migrated = codec.migrate(v1);
    expect(migrated.version).toBe(2);
    const pixels = migrated.nodes.find(node => node.kind === "pixels") as Record<string, unknown>;
    expect(pixels).toHaveProperty("colorSpace", "linear-srgb");
    expect(pixels).not.toHaveProperty("colourSpace");
  });

  it("rejects unknown versions, fields, accessors and forward references before trusted code executes", () => {
    let evaluations = 0;
    const registry = new IFXFilterRegistry();
    registry.registerProcessor(gainDefinition(() => evaluations++));
    const codec = new IFXGraphCodec(registry);
    const good = codec.encode(new IFXFilterGraph(gainDefinition().apply({ gain: 2 }, source())));
    expect(() => codec.decode({ ...good, version: 99 })).toThrow(/version/i);
    expect(() => codec.decode({ ...good, surprise: true } as never)).toThrow(/shape|field/i);
    const operationIndex = good.nodes.findIndex(node => node.kind === "operation");
    const badVersion = structuredClone(good) as any;
    badVersion.nodes[operationIndex].processor.version = 99;
    expect(() => codec.decode(badVersion)).toThrow(/processor|version/i);
    const forward = structuredClone(good) as any;
    forward.nodes[operationIndex].inputs = [good.nodes.length];
    expect(() => codec.decode(forward)).toThrow(/earlier|reference/i);
    let getterCalls = 0;
    const accessor = structuredClone(good) as any;
    Object.defineProperty(accessor.nodes[operationIndex].parameters, "gain", { enumerable: true, get() { getterCalls++; return 2; } });
    expect(() => codec.decode(accessor)).toThrow(/data|accessor|parameter/i);
    expect(getterCalls).toBe(0);
    expect(evaluations).toBe(0);
  });

  it("rejects registry collisions, invalid ROI declarations and excessive preparation before evaluation", async () => {
    const registry = new IFXFilterRegistry();
    const definition = gainDefinition();
    registry.registerProcessor(definition);
    expect(() => registry.registerProcessor(definition)).toThrow(/duplicate|collision/i);
    expect(() => new IFXProcessorDefinition({ ...definition.descriptor, roi: { kind: "support", radius: 2048 }, evaluate: () => ({ r: 0, g: 0, b: 0, a: 0 }) } as never)).toThrow(/roi|support|radius/i);
    let evaluated = 0;
    const global = new IFXProcessorDefinition({
      id: "custom:global",
      version: 1,
      inputCount: 1,
      parameters: {},
      output: { kind: "first-input" },
      roi: { kind: "global" },
      preparation: { scope: "global", scratchBytes: 8192, work: 1000 },
      evaluate: (point, access) => { evaluated++; return access.sample(0, point); },
    });
    const context = new IFXContext("linear-srgb", 10_000, { outputBytes: 1024, scratchBytes: 1024, cacheBytes: 1024, work: 10_000 });
    await expect(context.render(global.apply({}, source()))).rejects.toThrow(/scratch.*budget/i);
    expect(evaluated).toBe(0);
  });

  it("supports bounded compare/select/transcendental opcodes and still rejects unknown programs", () => {
    const kernel = new IFXKernel({
      inputCount: 1,
      instructions: [
        { op: "sample", input: 0 },
        { op: "constant", value: [0.2, 0.2, 0.2, 0.2] },
        { op: "compare", relation: "greater", left: 0, right: 1 },
        { op: "constant", value: [1, 0, 0, 1] },
        { op: "constant", value: [0, 0, 1, 1] },
        { op: "select", condition: 2, whenTrue: 3, whenFalse: 4 },
        { op: "transcendental", function: "sqrt", input: 5 },
      ],
      output: 6,
    });
    const pixel = new IFXSampler(kernel.apply(source())).sample({ x: 0.5, y: 0.5 });
    expect(pixel.r).toBe(1);
    expect(pixel.b).toBe(1);
    expect(() => new IFXKernel({ inputCount: 1, instructions: [{ op: "eval" } as never], output: 0 })).toThrow(/opcode/i);
  });
});
