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

import { describe, expect, it, vi } from "vitest";
import { GFXImage } from "../../../src/FX/GraphicsFX/GFXImage";
import { IFXFilterRegistry, IFXImage, IFXRenderDestination } from "../../../src/FX/ImageFX/public";
import {
  BrowserWebGPUImageProcessingBackend,
  createBrowserWebGPUImageExecutor,
  type BrowserWebGPUImageExecutor,
} from "../../../src/SynCloudOS/PlatformAdapters/BrowserWebGPUImageProcessingBackend";
import type { RuntimeResourceParticipant } from "../../../src/SynCloudOS/Resources/RuntimeResourceLedger";

type LossInfo = { reason?: string; message?: string };

/** A minimal device whose readback returns zeros. */
function fakeDevice() {
  let loseDevice!: (info: LossInfo) => void;
  const buffers: Array<{ size: number; destroyed: boolean }> = [];
  const device = {
    lost: new Promise<LossInfo>((resolve) => { loseDevice = resolve; }),
    queue: { writeBuffer() {}, submit() {} },
    createBuffer(descriptor: { size: number }) {
      const buffer = {
        size: descriptor.size,
        destroyed: false,
        async mapAsync() {},
        getMappedRange: () => new ArrayBuffer(descriptor.size),
        unmap() {},
        destroy() { buffer.destroyed = true; },
      };
      buffers.push(buffer);
      return buffer;
    },
    createShaderModule: () => ({}),
    createComputePipeline: () => ({ getBindGroupLayout: () => ({}) }),
    createBindGroup: () => ({}),
    createCommandEncoder: () => ({
      beginComputePass: () => ({ setPipeline() {}, setBindGroup() {}, dispatchWorkgroups() {}, end() {} }),
      copyBufferToBuffer() {},
      finish: () => ({}),
    }),
    destroy() {},
  };
  return { device, buffers, lose: (info: LossInfo = { reason: "unknown" }) => loseDevice(info) };
}

const job = (size: number) => ({ width: size, height: size, pixels: new Uint8Array(size * size * 4), operation: { name: "invert" as const } });
const setBytes = (size: number) => size * size * 4 * 3 + 16;

function invertGraph(size = 4) {
  const source = new GFXImage({ width: size, height: size, alpha: "straight", colourSpace: "linear-srgb", data: new Uint8Array(size * size * 4) });
  return new IFXFilterRegistry().create("invert", {}).apply(IFXImage.fromPixels(source));
}
const graph4 = invertGraph(4);
const destination = () => new IFXRenderDestination(graph4.extent, "linear-srgb", "straight");

describe("WebGPU image executor residency", () => {
  it("reports buffer sets in use as active and pooled sets as idle, and releases idle sets oldest first", async () => {
    const { device, buffers } = fakeDevice();
    const executor = createBrowserWebGPUImageExecutor(device as never);
    const pending = executor.execute(job(8));
    expect([...executor.measureResidency!()].map((backing) => [backing.bytes, backing.state])).toEqual([[setBytes(8), "active"]]);
    await pending;
    await executor.execute(job(4));
    expect([...executor.measureResidency!()].map((backing) => [backing.bytes, backing.state]))
      .toEqual([[setBytes(8), "idle"], [setBytes(4), "idle"]]);
    // Releases whole sets, least recently used first, until the target is met.
    expect(executor.releaseIdle!(1)).toBe(setBytes(8));
    expect(buffers.filter((buffer) => buffer.destroyed)).toHaveLength(4);
    expect([...executor.measureResidency!()].map((backing) => backing.bytes)).toEqual([setBytes(4)]);
    expect(executor.releaseIdle!(Number.POSITIVE_INFINITY)).toBe(setBytes(4));
    expect([...executor.measureResidency!()]).toEqual([]);
    executor.dispose();
  });
});

describe("WebGPU image backend lifecycle", () => {
  it("accounts the executor's pool as a GPU participant, reclaiming only idle storage, until disposal", async () => {
    const { device } = fakeDevice();
    const participants: RuntimeResourceParticipant[] = [];
    const unregister = vi.fn();
    const backend = new BrowserWebGPUImageProcessingBackend(createBrowserWebGPUImageExecutor(device as never), {
      resources: { owner: "runtime", register(participant) { participants.push(participant); return unregister; } },
    });
    const [participant] = participants as [RuntimeResourceParticipant];
    expect(participant).toMatchObject({ kind: "gpu", owner: "runtime" });
    await backend.render(graph4, destination());
    expect([...participant.measure()].map((backing) => backing.state)).toEqual(["idle"]);
    expect(participant.reclaim!({ level: "cache", reason: "test" })).toBe(0);
    expect(participant.reclaim!({ level: "idle", reason: "test" })).toBe(setBytes(4));
    expect([...participant.measure()]).toEqual([]);
    backend.dispose();
    expect(unregister).toHaveBeenCalledTimes(1);
    expect([...participant.measure()]).toEqual([]);
  });

  it("re-acquires a device after loss: in-flight work fails, new work falls back meanwhile, then renders on the new device", async () => {
    const first = fakeDevice(), second = fakeDevice();
    let resolveReacquire!: (executor: BrowserWebGPUImageExecutor | null) => void;
    const reacquire = vi.fn(() => new Promise<BrowserWebGPUImageExecutor | null>((resolve) => { resolveReacquire = resolve; }));
    const backend = new BrowserWebGPUImageProcessingBackend(createBrowserWebGPUImageExecutor(first.device as never), { reacquire });
    const graph = graph4;
    expect(backend.canRender(graph, destination())).toBe(true);
    const inFlight = backend.render(graph, destination());
    first.lose({ reason: "unknown", message: "driver reset" });
    await expect(inFlight).rejects.toThrow(/device lost: driver reset/);
    expect(reacquire).toHaveBeenCalledTimes(1);
    // While a device is being re-acquired, the pipeline passes work on.
    expect(backend.canRender(graph, destination())).toBe(false);
    await expect(backend.render(graph, destination())).rejects.toThrow(/device lost/);
    resolveReacquire(createBrowserWebGPUImageExecutor(second.device as never));
    await vi.waitFor(() => expect(backend.canRender(graph, destination())).toBe(true));
    const result = await backend.render(graph, destination());
    expect(result.info.backend).toBe("accelerated");
    expect(second.buffers.length).toBeGreaterThan(0);
    backend.dispose();
  });

  it("stays closed after a deliberate destroy, a failed re-acquisition, or too many losses", async () => {
    const destroyed = fakeDevice();
    const reacquire = vi.fn(async () => null);
    const closedByDestroy = new BrowserWebGPUImageProcessingBackend(createBrowserWebGPUImageExecutor(destroyed.device as never), { reacquire });
    destroyed.lose({ reason: "destroyed" });
    await vi.waitFor(() => expect(closedByDestroy.canRender(graph4, destination())).toBe(false));
    expect(reacquire).not.toHaveBeenCalled();

    const failing = fakeDevice();
    const closedByFailure = new BrowserWebGPUImageProcessingBackend(createBrowserWebGPUImageExecutor(failing.device as never), { reacquire });
    failing.lose();
    await vi.waitFor(() => expect(reacquire).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(closedByFailure.canRender(graph4, destination())).toBe(false);

    const devices = [fakeDevice(), fakeDevice(), fakeDevice()];
    let next = 1;
    const storm = new BrowserWebGPUImageProcessingBackend(createBrowserWebGPUImageExecutor(devices[0]!.device as never), {
      maximumReacquisitions: 1,
      reacquire: async () => createBrowserWebGPUImageExecutor(devices[next++]!.device as never),
    });
    devices[0]!.lose();
    await vi.waitFor(() => expect(storm.canRender(graph4, destination())).toBe(true));
    devices[1]!.lose();
    await vi.waitFor(() => expect(storm.canRender(graph4, destination())).toBe(false));
    await Promise.resolve();
    expect(next).toBe(2);
  });
});
