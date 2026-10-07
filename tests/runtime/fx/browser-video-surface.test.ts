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

import { afterEach, expect, it, vi } from "vitest";
import { BrowserVideoDecoder } from "../../../src/SynCloudOS/PlatformAdapters/BrowserVideoDecoder";
import type { VFXDecoderConfig } from "../../../src/FX/VideoFX/public";
import type { VFXFrame } from "../../../src/FX/VideoFX/public";

afterEach(() => vi.unstubAllGlobals());

it("delivers a retained native surface without eager RGBA readback and closes the decoder handle", () => {
  let emit!: (frame: VideoFrame) => void;
  let closes = 0;
  let copies = 0;
  class FakeDecoder {
    state = "configured";
    decodeQueueSize = 0;
    constructor(init: VideoDecoderInit) { emit = init.output; }
    configure() {}
    reset() {}
    close() { this.state = "closed"; }
  }
  vi.stubGlobal("VideoDecoder", FakeDecoder);
  const backend = new BrowserVideoDecoder({ outputStorage: "video-surface" });
  const received: VFXFrame[] = [];
  backend.configure({ codec: "test", codedWidth: 16, codedHeight: 8, hardwareAcceleration: "no-preference", optimizeForLatency: false } as VFXDecoderConfig, {
    output(frame) { received.push(frame); },
    error(error) { throw error; },
  });
  const native = {
    timestamp: 1_400_000,
    duration: 33_333,
    codedWidth: 16,
    codedHeight: 8,
    clone() { return { ...this }; },
    close() { closes += 1; },
    copyTo() { copies += 1; throw new Error("eager RGBA copy"); },
  } as unknown as VideoFrame;
  emit(native);
  expect(received).toHaveLength(1);
  expect(received[0]?.storageKind).toBe("video-surface");
  expect(received[0]?.timing.presentationTime.toSeconds()).toBe(1.4);
  expect(copies).toBe(0);
  expect(closes).toBe(1);
  received[0]?.close();
  expect(closes).toBe(2);
  backend.reset();
  emit({ ...native } as VideoFrame);
  expect(received).toHaveLength(1);
  expect(closes).toBe(3);
  backend.dispose();
});
