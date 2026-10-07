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
import { MEFXSampleTimingInfo, MEFXTime } from "../../../src/FX/MediaFX/public";
import {
  VFXEncodedChunk,
  VFXEncoder,
  VFXEncoderCapabilities,
  VFXFrame,
  VFXPixelBuffer,
  VFXVideoFormat,
  type VFXEncoderBackend,
  type VFXEncoderBackendCallbacks,
  type VFXEncoderConfig,
  type VFXEncoderFrameOptions,
} from "../../../src/FX/VideoFX/public";

function frame(timestamp = 0): VFXFrame {
  const format = new VFXVideoFormat({ codedWidth: 2, codedHeight: 2, pixelFormat: "rgba8", colourSpace: "srgb" });
  const pixels = new VFXPixelBuffer(format, new Uint8Array(16).fill(255));
  try {
    return new VFXFrame({
      pixels,
      timing: new MEFXSampleTimingInfo({
        presentationTime: MEFXTime.finite(BigInt(timestamp), 1_000_000),
        duration: MEFXTime.finite(33_333n, 1_000_000),
      }),
    });
  } finally {
    pixels.close();
  }
}

class FixtureEncoderBackend implements VFXEncoderBackend {
  encodeQueueSize = 0;
  callbacks: VFXEncoderBackendCallbacks | null = null;
  configs: VFXEncoderConfig[] = [];
  inputs: Array<{ keyFrame: boolean; closedDuringEncode: boolean }> = [];
  flushes = 0;
  resets = 0;
  disposed = 0;
  configure(config: VFXEncoderConfig, callbacks: VFXEncoderBackendCallbacks): void { this.configs.push(config); this.callbacks = callbacks; }
  encode(input: VFXFrame, options: VFXEncoderFrameOptions): void {
    this.inputs.push({ keyFrame: options.keyFrame === true, closedDuringEncode: input.closed });
    this.callbacks?.output(
      new VFXEncodedChunk({ type: options.keyFrame ? "key" : "delta", data: new Uint8Array([this.inputs.length]), timing: input.timing }),
      { decoderConfig: { codec: this.configs.at(-1)!.codec, codedWidth: 2, codedHeight: 2 }, colourSpace: "srgb" },
    );
  }
  async flush(): Promise<void> { this.flushes += 1; }
  reset(): void { this.resets += 1; }
  dispose(): void { this.disposed += 1; }
}

describe("VFXEncoder", () => {
  it.each([undefined, null, "L1T2"])("accepts capability results directly when scalability is %s", async (scalabilityMode) => {
    const capability = await VFXEncoderCapabilities.queryEncoder({
      codec: "vp8", codedWidth: 2, codedHeight: 2, bitrate: 250_000, framerate: 30, scalabilityMode,
    }, { async queryEncoder() { return { supported: true }; } });
    expect(capability.supported).toBe(true);
    const backend = new FixtureEncoderBackend();
    const encoder = new VFXEncoder({ backend, output() {} });
    try {
      await encoder.configure(capability.config);
      expect(backend.configs[0]).toEqual(capability.config);
      expect(backend.configs[0]?.scalabilityMode).toBe(scalabilityMode ?? null);
    } finally { encoder.dispose(); }
  });

  it("normalizes bounded rate controls, preserves keyframe requests and emits configuration metadata", async () => {
    const backend = new FixtureEncoderBackend();
    const outputs: Array<{ type: string; codec: string | undefined }> = [];
    const encoder = new VFXEncoder({ backend, output(chunk, metadata) { outputs.push({ type: chunk.type, codec: metadata.decoderConfig?.codec }); } });
    await encoder.configure({ codec: "vp8", codedWidth: 2, codedHeight: 2, bitrate: 250_000, framerate: 30 });
    const input = frame();
    encoder.encode(input, { keyFrame: true });
    input.close();
    await encoder.flush();
    expect(backend.configs[0]).toMatchObject({ codec: "vp8", codedWidth: 2, codedHeight: 2, bitrate: 250_000, framerate: 30, hardwareAcceleration: "no-preference", latencyMode: "quality", alpha: "discard" });
    expect(backend.inputs).toEqual([{ keyFrame: true, closedDuringEncode: false }]);
    expect(outputs).toEqual([{ type: "key", codec: "vp8" }]);
    encoder.dispose();
  });

  it("serializes reconfiguration after drain and fences stale output generations", async () => {
    const backend = new FixtureEncoderBackend();
    const outputs: number[] = [];
    const encoder = new VFXEncoder({ backend, output(chunk) { outputs.push(chunk.copyData()[0]!); } });
    await encoder.configure({ codec: "vp8", codedWidth: 2, codedHeight: 2, bitrate: 100_000, framerate: 24 });
    const firstCallbacks = backend.callbacks!;
    await encoder.configure({ codec: "vp8", codedWidth: 2, codedHeight: 2, bitrate: 200_000, framerate: 60 });
    expect(backend.flushes).toBe(1);
    expect(backend.resets).toBe(1);
    firstCallbacks.output(new VFXEncodedChunk({ type: "key", data: new Uint8Array([99]), timing: new MEFXSampleTimingInfo({ presentationTime: MEFXTime.finite(0n, 1_000_000) }) }), {});
    expect(outputs).toEqual([]);
    encoder.dispose();
  });

  it("bounds backend queue size and waits for asynchronous output acknowledgements during flush", async () => {
    const backend = new FixtureEncoderBackend();
    let release!: () => void;
    const acknowledgement = new Promise<void>(resolve => { release = resolve; });
    const encoder = new VFXEncoder({ backend, maximumEncodeQueueSize: 1, maximumPendingOutputs: 1, output: () => acknowledgement });
    await encoder.configure({ codec: "vp8", codedWidth: 2, codedHeight: 2, bitrate: 100_000, framerate: 30 });
    backend.encodeQueueSize = 1;
    const blocked = frame();
    expect(() => encoder.encode(blocked)).toThrow(/queue limit/i);
    blocked.close();
    backend.encodeQueueSize = 0;
    const accepted = frame();
    encoder.encode(accepted, { keyFrame: true });
    accepted.close();
    let settled = false;
    const draining = encoder.flush().then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    release();
    await draining;
    expect(settled).toBe(true);
    encoder.dispose();
  });
});
