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

import { expect, it } from "vitest";
import { MEFXSampleTimingInfo, MEFXTime } from "../../../src/FX/MediaFX/public";
import {
  VFXEncodedChunk,
  type VFXCodecCapabilityProbe,
  type VFXDecoderBackend,
  type VFXDecoderBackendCallbacks,
  type VFXDecoderConfig,
} from "../../../src/FX/VideoFX/public";
import { createMountedVideoClient } from "../../../src/SynCloudOS/AppSDK/mountedVideoClient";
import { BrowserVideoCaptureAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserVideoCaptureAdapter";
import { VideoCaptureService } from "../../../src/SynCloudOS/VideoFX/VideoCaptureService";
import { createMountedResourceScope } from "../../../src/SynCloudOS/HostServices/mountedResourceScope";

class FixtureDecoderBackend implements VFXDecoderBackend, VFXCodecCapabilityProbe {
  decodeQueueSize = 0;
  disposeCount = 0;
  callbacks: VFXDecoderBackendCallbacks | null = null;

  async queryDecoder(config: VFXDecoderConfig) {
    return config.codec === "fixture"
      ? { supported: true as const, config }
      : { supported: false as const, reason: "fixture-unsupported" };
  }

  configure(_config: VFXDecoderConfig, callbacks: VFXDecoderBackendCallbacks): void {
    this.callbacks = callbacks;
  }

  decode(_chunk: VFXEncodedChunk): void {}
  async flush(): Promise<void> {}
  reset(): void {}
  dispose(): void { this.disposeCount += 1; }
}

it("mounts the private decoder backend behind app.video and revokes it with component authority", async () => {
  const issued: FixtureDecoderBackend[] = [];
  const service = new VideoCaptureService(
    new BrowserVideoCaptureAdapter(null),
    { createBackend() { const backend = new FixtureDecoderBackend(); issued.push(backend); return backend; } },
  );
  const mount = new AbortController();
  const client = createMountedVideoClient(service, mount.signal, () => [], () => false, "app");

  await expect(client.queryDecoder({ codec: "fixture", codedWidth: 16, codedHeight: 16 })).resolves.toMatchObject({ supported: true });
  expect(issued).toHaveLength(1);
  expect(issued[0]?.disposeCount).toBe(1);

  const decoder = client.createDecoder({ output() {} });
  decoder.configure({ codec: "fixture", codedWidth: 16, codedHeight: 16 });
  decoder.decode(new VFXEncodedChunk({
    type: "key",
    data: new Uint8Array([1]),
    timing: new MEFXSampleTimingInfo({ presentationTime: MEFXTime.finite(0n, 30) }),
  }));
  expect(decoder.state).toBe("configured");
  expect(issued).toHaveLength(2);

  mount.abort(new DOMException("component unmounted", "AbortError"));
  expect(decoder.state).toBe("disposed");
  expect(issued[1]?.disposeCount).toBe(1);
  service.dispose();
});

it("admits small configured streams by pixel cost while bounding large decoders and releasing their charges", () => {
  const service = new VideoCaptureService(new BrowserVideoCaptureAdapter(null), {
    createBackend: () => new FixtureDecoderBackend(),
  });
  const mount = new AbortController();
  const client = createMountedVideoClient(service, mount.signal, () => [], () => false, "app");
  try {
    const previews = Array.from({ length: 24 }, () => {
      const decoder = client.createDecoder({ output() {} });
      decoder.configure({ codec: 'fixture', codedWidth: 256, codedHeight: 144 });
      return decoder;
    });
    for (const decoder of previews) decoder.dispose();
    const large = Array.from({ length: 7 }, () => client.createDecoder({ output() {} }));
    for (const decoder of large.slice(0, 6)) decoder.configure({ codec: 'fixture', codedWidth: 3840, codedHeight: 2160 });
    expect(() => large[6]!.configure({ codec: 'fixture', codedWidth: 3840, codedHeight: 2160 }))
      .toThrow(expect.objectContaining({ name: 'QuotaExceededError' }));
    expect(large[6]!.state).toBe('unconfigured');
    large[0]!.reset();
    large[6]!.configure({ codec: 'fixture', codedWidth: 3840, codedHeight: 2160 });
    expect(large[6]!.state).toBe('configured');
  } finally { mount.abort(); service.dispose(); }
});

it("resizes mounted reservations atomically and preserves accounting on quota failure", () => {
  const mount = new AbortController();
  const scope = createMountedResourceScope(mount.signal, { budgets: { bytes: 100 } });
  const first = scope.reserve({ bytes: 60 });
  const second = scope.reserve({ bytes: 20 });
  expect(() => first.resize({ bytes: 90 })).toThrow(expect.objectContaining({ name: 'QuotaExceededError' }));
  expect(scope.snapshot().usage.bytes).toBe(80);
  first.resize({ bytes: 40 });
  second.resize({ bytes: 60 });
  expect(scope.snapshot().usage.bytes).toBe(100);
  first.release(); second.release();
  expect(scope.snapshot().usage.bytes).toBe(0);
  expect(() => first.resize({ bytes: 10 })).toThrow(expect.objectContaining({ name: 'InvalidStateError' }));
});
