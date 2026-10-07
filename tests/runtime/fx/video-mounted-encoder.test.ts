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
import {
  VFXEncodedChunk,
  type VFXEncoderBackend,
  type VFXEncoderBackendCallbacks,
  type VFXEncoderConfig,
  type VFXEncoderFrameOptions,
} from "../../../src/FX/VideoFX/public";
import { createMountedVideoClient } from "../../../src/SynCloudOS/AppSDK/mountedVideoClient";
import { BrowserVideoCaptureAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserVideoCaptureAdapter";
import { VideoCaptureService } from "../../../src/SynCloudOS/VideoFX/VideoCaptureService";

class FixtureEncoderBackend implements VFXEncoderBackend {
  encodeQueueSize = 0;
  disposeCount = 0;
  callbacks: VFXEncoderBackendCallbacks | null = null;

  async queryEncoder(config: VFXEncoderConfig) {
    return config.codec === "fixture"
      ? { supported: true as const, config }
      : { supported: false as const, reason: "fixture-unsupported" };
  }

  configure(_config: VFXEncoderConfig, callbacks: VFXEncoderBackendCallbacks): void {
    this.callbacks = callbacks;
  }
  encode(_frame: never, _options: VFXEncoderFrameOptions): void {}
  async flush(): Promise<void> {}
  reset(): void {}
  dispose(): void { this.disposeCount += 1; }
}

it("mounts the private encoder backend behind app.video and revokes it with component authority", async () => {
  const issued: FixtureEncoderBackend[] = [];
  const service = new VideoCaptureService(
    new BrowserVideoCaptureAdapter(null),
    undefined,
    { createBackend() { const backend = new FixtureEncoderBackend(); issued.push(backend); return backend; } },
  );
  const mount = new AbortController();
  const client = createMountedVideoClient(service, mount.signal, () => [], () => false, "app");

  await expect(client.queryEncoder({
    codec: "fixture",
    codedWidth: 16,
    codedHeight: 16,
    bitrate: 100_000,
    framerate: 30,
  })).resolves.toMatchObject({ supported: true });
  expect(issued).toHaveLength(1);
  expect(issued[0]?.disposeCount).toBe(1);

  const encoder = client.createEncoder({ output(_chunk: VFXEncodedChunk) {} });
  await encoder.configure({
    codec: "fixture",
    codedWidth: 16,
    codedHeight: 16,
    bitrate: 100_000,
    framerate: 30,
  });
  expect(encoder.state).toBe("configured");
  expect(issued).toHaveLength(2);

  mount.abort(new DOMException("component unmounted", "AbortError"));
  expect(encoder.state).toBe("disposed");
  expect(issued[1]?.disposeCount).toBe(1);
  service.dispose();
});
