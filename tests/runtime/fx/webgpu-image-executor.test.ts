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
import { createBrowserWebGPUImageExecutor } from "../../../src/SynCloudOS/PlatformAdapters/BrowserWebGPUImageProcessingBackend";

/** Records resource creation; readback maps return `result`, if set. */
class FakeDevice {
  readonly lost = new Promise<Readonly<{ reason?: string; message?: string }>>(() => undefined);
  shaders: string[] = [];
  pipelines = 0;
  buffers: FakeBuffer[] = [];
  writes: Array<{ buffer: FakeBuffer; data: Uint8Array }> = [];
  submissions = 0;
  destroyed = false;
  result: Uint8Array | null = null;
  readonly queue = {
    writeBuffer: (buffer: FakeBuffer, _offset: number, data: ArrayBufferView) => {
      this.writes.push({ buffer, data: new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)) });
    },
    submit: () => { this.submissions += 1; },
  };
  createBuffer(descriptor: Readonly<{ size: number; usage: number }>) {
    const buffer = new FakeBuffer(descriptor.size, descriptor.usage, this);
    this.buffers.push(buffer);
    return buffer;
  }
  createShaderModule(descriptor: Readonly<{ code: string }>) { this.shaders.push(descriptor.code); return {}; }
  createComputePipeline() { this.pipelines += 1; return { getBindGroupLayout: () => ({}) }; }
  createBindGroup() { return {}; }
  createCommandEncoder() {
    return {
      beginComputePass: () => ({ setPipeline() {}, setBindGroup() {}, dispatchWorkgroups() {}, end() {} }),
      copyBufferToBuffer() {},
      finish: () => ({}),
    };
  }
  pushErrorScope() {}
  async popErrorScope() { return null; }
  destroy() { this.destroyed = true; }
}

class FakeBuffer {
  destroyed = false;
  mapped = false;
  constructor(readonly size: number, readonly usage: number, private readonly device: FakeDevice) {}
  async mapAsync() { this.mapped = true; }
  getMappedRange() {
    const bytes = new Uint8Array(this.size);
    if (this.device.result) bytes.set(this.device.result.subarray(0, this.size));
    return bytes.buffer;
  }
  unmap() { this.mapped = false; }
  destroy() { this.destroyed = true; }
}

const MAP_READ = 0x0001;
const UNIFORM = 0x0040;

function request(width: number, height: number, operation: { name: "invert" } | { name: "exposure"; ev: number }) {
  const pixels = new Uint8Array(width * height * 4);
  for (let index = 0; index < pixels.length; index++) pixels[index] = (index * 37) & 0xff;
  return { width, height, pixels, operation };
}

describe("WebGPU image executor resources", () => {
  it("compiles one pipeline per operation kind, not per job, size or parameter", async () => {
    const device = new FakeDevice();
    const executor = createBrowserWebGPUImageExecutor(device as never);
    await executor.execute(request(2, 2, { name: "invert" }));
    await executor.execute(request(4, 4, { name: "invert" }));
    await executor.execute(request(2, 2, { name: "exposure", ev: 1 }));
    await executor.execute(request(3, 3, { name: "exposure", ev: -2.5 }));
    expect(device.pipelines).toBe(2);
    expect(device.shaders).toHaveLength(2);
    // Four jobs of different sizes and parameters compiled one shader per
    // operation: sizes and parameters travel as uniforms.
    for (const code of device.shaders) expect(code).toContain("unpack4x8unorm");
    executor.dispose();
  });

  it("uploads the RGBA bytes as packed words and returns the read-back bytes unconverted", async () => {
    const device = new FakeDevice();
    const executor = createBrowserWebGPUImageExecutor(device as never);
    const job = request(2, 1, { name: "exposure", ev: 1 });
    device.result = new Uint8Array([1, 2, 3, 4, 250, 251, 252, 253]);
    const output = await executor.execute(job);
    expect([...output]).toEqual([1, 2, 3, 4, 250, 251, 252, 253]);
    const pixelWrite = device.writes.find((write) => write.data.byteLength === job.pixels.byteLength && !(write.buffer.usage & UNIFORM));
    expect(pixelWrite && [...pixelWrite.data]).toEqual([...job.pixels]);
    const parameters = device.writes.find((write) => write.buffer.usage & UNIFORM)!;
    const view = new DataView(parameters.data.buffer);
    expect(view.getUint32(0, true)).toBe(2);
    expect(view.getFloat32(4, true)).toBe(Math.fround(2));
    executor.dispose();
  });

  it("reuses one buffer set for repeated jobs of a size and gives concurrent jobs their own", async () => {
    const device = new FakeDevice();
    const executor = createBrowserWebGPUImageExecutor(device as never);
    await executor.execute(request(8, 8, { name: "invert" }));
    const afterFirst = device.buffers.length;
    await executor.execute(request(8, 8, { name: "invert" }));
    await executor.execute(request(8, 8, { name: "exposure", ev: 0.5 }));
    expect(device.buffers.length).toBe(afterFirst);
    await Promise.all([executor.execute(request(8, 8, { name: "invert" })), executor.execute(request(8, 8, { name: "invert" }))]);
    expect(device.buffers.length).toBe(afterFirst * 2);
    expect(device.buffers.filter((buffer) => buffer.usage & MAP_READ).every((buffer) => !buffer.mapped)).toBe(true);
    executor.dispose();
    expect(device.buffers.every((buffer) => buffer.destroyed)).toBe(true);
    expect(device.destroyed).toBe(true);
  });

  it("bounds the pooled bytes, destroying sets beyond the budget", async () => {
    const device = new FakeDevice();
    const executor = createBrowserWebGPUImageExecutor(device as never, { maximumPooledBytes: 3 * 64 * 64 * 4 + 16 });
    await executor.execute(request(64, 64, { name: "invert" }));
    await executor.execute(request(32, 32, { name: "invert" }));
    const pixelBuffers = device.buffers.filter((buffer) => !(buffer.usage & UNIFORM));
    // The 64x64 set (3 x 16 KiB) was evicted to admit the 32x32 set.
    expect(pixelBuffers.filter((buffer) => buffer.size === 64 * 64 * 4).every((buffer) => buffer.destroyed)).toBe(true);
    expect(pixelBuffers.filter((buffer) => buffer.size === 32 * 32 * 4).some((buffer) => buffer.destroyed)).toBe(false);
    executor.dispose();
  });

  it("does not return a set to the pool after an aborted job leaves it mapped", async () => {
    const device = new FakeDevice();
    const executor = createBrowserWebGPUImageExecutor(device as never);
    const controller = new AbortController();
    const pending = executor.execute(request(4, 4, { name: "invert" }), controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow();
    await executor.execute(request(4, 4, { name: "invert" }));
    expect(device.buffers.filter((buffer) => buffer.usage & MAP_READ).every((buffer) => !buffer.mapped)).toBe(true);
    executor.dispose();
  });
});
