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

import { expect, test } from "playwright/test";

test("VideoFX decodes a real WebCodecs chunk and reports unsupported configurations honestly", async ({ page, browserName }, testInfo) => {
  await page.goto("/tests/e2e/fixtures/fx-video-frames-browser.html");
  const result = await page.evaluate(async () => {
    const globals = globalThis as typeof globalThis & {
      VideoEncoder?: typeof VideoEncoder;
      VideoDecoder?: typeof VideoDecoder;
      VideoFrame?: typeof VideoFrame;
    };
    if (!globals.VideoEncoder || !globals.VideoDecoder || !globals.VideoFrame) return { supported: false as const, reason: "webcodecs-video-unavailable" };

    const [{ BrowserVideoDecoder }, video, media] = await Promise.all([
      import("/src/SynCloudOS/PlatformAdapters/BrowserVideoDecoder.ts"),
      import("/src/FX/VideoFX/public.ts"),
      import("/src/FX/MediaFX/public.ts"),
    ]);
    const codec = "vp8";
    const backend = new BrowserVideoDecoder();
    const capability = await video.VFXCodecCapabilities.queryDecoder({ codec, codedWidth: 4, codedHeight: 4 }, backend);
    const unsupported = await video.VFXCodecCapabilities.queryDecoder({ codec: "definitely-not-a-codec", codedWidth: 4, codedHeight: 4 }, backend);
    if (!capability.supported) return { supported: false as const, reason: capability.reason, unsupported };

    const encoderProbe = await globals.VideoEncoder.isConfigSupported({ codec, width: 4, height: 4, bitrate: 100_000, framerate: 30 });
    if (!encoderProbe.supported) return { supported: false as const, reason: "vp8-encode-unavailable" };

    let encoded: EncodedVideoChunk | undefined;
    const encoder = new globals.VideoEncoder({
      output(chunk) { encoded = chunk; },
      error(error) { throw error; },
    });
    encoder.configure(encoderProbe.config);
    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 4;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("2D canvas unavailable");
    context.fillStyle = "rgb(220, 24, 12)";
    context.fillRect(0, 0, 4, 4);
    const nativeFrame = new globals.VideoFrame(canvas, { timestamp: 2_000_000, duration: 33_333 });
    encoder.encode(nativeFrame, { keyFrame: true });
    nativeFrame.close();
    await encoder.flush();
    encoder.close();
    if (!encoded) throw new Error("VideoEncoder produced no chunk");
    const data = new Uint8Array(encoded.byteLength);
    encoded.copyTo(data);

    const outputs: InstanceType<typeof video.VFXFrame>[] = [];
    const decoder = new video.VFXDecoder({ backend, output: (frame) => { outputs.push(frame); } });
    decoder.configure(capability.config);
    decoder.decode(new video.VFXEncodedChunk({
      type: encoded.type,
      data,
      timing: new media.MEFXSampleTimingInfo({
        presentationTime: media.MEFXTime.finite(BigInt(encoded.timestamp), 1_000_000),
        duration: encoded.duration === null ? null : media.MEFXTime.finite(BigInt(encoded.duration), 1_000_000),
      }),
    }));
    await decoder.flush();
    const output = outputs[0];
    if (!output) throw new Error("Video decoder produced no output frame");
    const image = output.toGFXImage();
    const pixel = image.pixel(1, 1);
    const timing = output.timing.presentationTime.value;
    const duration = output.timing.duration?.value;
    output.close();
    decoder.dispose();

    return {
      supported: true as const,
      capability,
      unsupported,
      pixel,
      presentationValue: timing.kind === "finite" ? timing.value.toString() : null,
      presentationScale: timing.kind === "finite" ? timing.timescale : null,
      durationValue: duration?.kind === "finite" ? duration.value.toString() : null,
      durationScale: duration?.kind === "finite" ? duration.timescale : null,
    };
  });

  if (!result.supported) {
    expect(browserName).toBe("webkit");
    testInfo.annotations.push({ type: "capability", description: result.reason });
    return;
  }
  expect(result.capability.supported).toBe(true);
  expect(result.unsupported.supported).toBe(false);
  expect(result.presentationValue).toBe("2000000");
  expect(result.presentationScale).toBe(1_000_000);
  expect(result.durationValue).toBe("33333");
  expect(result.durationScale).toBe(1_000_000);
  expect(result.pixel.r).toBeGreaterThan(result.pixel.g);
  expect(result.pixel.r).toBeGreaterThan(result.pixel.b);
});
