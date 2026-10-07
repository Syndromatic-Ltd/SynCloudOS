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

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "playwright/test";

test("mounted VideoFX applies worklet PCM seek/rate/automatic loops and fences a slow renderer", async ({ page, browserName }, testInfo) => {
  await page.goto("/tests/e2e/fixtures/fx-video-frames-browser.html");
  await page.mouse.click(8, 8);
  const result = await page.evaluate(async () => {
    if (typeof AudioContext !== "function" || typeof AudioWorkletNode !== "function")
      return { supported: false as const, reason: "audio-worklet-unavailable" };
    const [audio, media, video, outputModule, hostModule, mountedModule, captureModule, serviceModule, clockModule, probe] = await Promise.all([
      import("/src/FX/AudioFX/public.ts"), import("/src/FX/MediaFX/public.ts"), import("/src/FX/VideoFX/public.ts"),
      import("/src/SynCloudOS/PlatformAdapters/BrowserAudioGraphOutput.ts"),
      import("/src/SynCloudOS/AudioFX/AudioGraphHostService.ts"),
      import("/src/SynCloudOS/AppSDK/mountedVideoClient.ts"),
      import("/src/SynCloudOS/PlatformAdapters/BrowserVideoCaptureAdapter.ts"),
      import("/src/SynCloudOS/VideoFX/VideoCaptureService.ts"),
      import("/src/FX/MediaFX/MEFXClock.ts"), import("/tests/e2e/fixtures/fx-media-timeline-probe.ts"),
    ]);
    const context = new AudioContext({ sampleRate: 48_000 }); await context.resume();
    if (!context.audioWorklet || context.state !== "running") {
      const reason = "audio-context-" + context.state; await context.close(); return { supported: false as const, reason };
    }
    const owner = new AbortController(), capability = Object.freeze({});
    const output = new outputModule.BrowserAudioGraphOutput(async () => context, owner.signal, () => {}, capability);
    const receipts: { version: number; contextFrame: number; position: number }[] = [];
    const apply = output.applyTimelinePlan.bind(output);
    output.applyTimelinePlan = async (plan, signal) => {
      const receipt = await apply(plan, signal);
      receipts.push({ version: receipt.version, contextFrame: receipt.contextFrame, position: receipt.players[0]!.position });
      return receipt;
    };
    const host = hostModule.createAudioGraphHostService({ createGraphOutput: () => output } as any, owner.signal);
    const engine = host.createEngine(new audio.AUFXAudioFormat(context.sampleRate, 1), undefined, "timeline-test", capability);
    const source = new clockModule.MEFXMonotonicClock("test:performance", 0.001, () => performance.now() / 1000), timebase = new media.MEFXTimebase(source);
    const service = new serviceModule.VideoCaptureService(new captureModule.BrowserVideoCaptureAdapter({ mediaDevices: null }));
    const mounted = mountedModule.createMountedVideoClient(service, owner.signal, () => [], () => true, "timeline-test", Object.freeze({}), host, capability);
    const canvas = document.createElement("canvas"); canvas.width = 16; canvas.height = 16; document.body.append(canvas);
    const drawing = canvas.getContext("2d")!;
    try {
      const playback = await probe.runTimelineTransportProbe({
        audio, media, engine, timebase, createCoordinator: mounted.createPresentationCoordinator,
        makeFrame(position) {
          const format = new video.VFXVideoFormat({ codedWidth: 16, codedHeight: 16, pixelFormat: "rgba8", colourSpace: "srgb" });
          const bytes = new Uint8Array(format.byteLength);
          for (let offset = 0; offset < bytes.length; offset += 4) bytes.set([28, 52, 92, 255], offset);
          const pixels = new video.VFXPixelBuffer(format, bytes);
          try { return new video.VFXFrame({ pixels, timing: new media.MEFXSampleTimingInfo({ presentationTime: position }) }); }
          finally { pixels.close(); }
        },
        draw(frame) {
          const pixels = frame.toGFXImage();
          drawing.putImageData(new ImageData(new Uint8ClampedArray(pixels.copyData()), pixels.width, pixels.height), 0, 0);
        },
      });
      return { supported: true as const, ...playback, receipts, drawnPixel: Array.from(drawing.getImageData(0, 0, 1, 1).data), browserUserAgent: navigator.userAgent };
    } finally {
      engine.dispose(); host.dispose(); service.dispose(); timebase.dispose(); source.dispose(); owner.abort(); canvas.remove(); await context.close();
    }
  });
  const evidence = { schemaVersion: 1, evidenceKind: "source-browser-worklet-pcm-transport-and-canvas", browserName, project: testInfo.project.name, server: testInfo.project.use.baseURL, ...result };
  const directory = resolve(process.cwd(), ".artifacts", "expanded-fx", "vfx06");
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, `${testInfo.project.name}-transport.json`), JSON.stringify(evidence, null, 2) + "\n");
  await testInfo.attach("worklet-transport-receipts", { body: JSON.stringify(evidence, null, 2), contentType: "application/json" });
  if (!result.supported) { test.skip(true, result.reason); return; }
  expect(result.drawnPixel).toEqual([28, 52, 92, 255]);
  expect(result.pcm.doubleRate.inferredRate).toBeCloseTo(2, 2);
  expect(result.pcm.loops).toHaveLength(2);
  expect(result.slowRenderer.maximumActive).toBe(1);
  expect(result.slowRenderer.cancelledDraws).toBe(1);
  expect(result.receipts).toHaveLength(8);
  expect(result.receipts[0]!.position).toBe(2);
  expect(result.receipts.slice(-2).map(receipt => receipt.position)).toEqual([1, 1]);
  expect(result.receipts.every(receipt => Number.isSafeInteger(receipt.contextFrame) && receipt.contextFrame >= 0)).toBe(true);
  for (let index = 1; index < result.receipts.length; index++) {
    expect(result.receipts[index]!.version).toBeGreaterThan(result.receipts[index - 1]!.version);
    expect(result.receipts[index]!.contextFrame).toBeGreaterThanOrEqual(result.receipts[index - 1]!.contextFrame);
  }
});

test("VideoFX draws processed title-overlay frames while scheduled PCM reaches the browser audio output", async ({ page, browserName }, testInfo) => {
  await page.goto("/tests/e2e/fixtures/fx-video-frames-browser.html");
  // Use an inert framework fixture so Webspring/runtime navigation cannot tear
  // down the execution context while still providing a trusted audio gesture.
  await page.mouse.click(8, 8);
  const result = await page.evaluate(async () => {
    const AudioContextConstructor = globalThis.AudioContext;
    if (typeof AudioContextConstructor !== "function") return { supported: false as const, reason: "audio-context-unavailable" };
    if (typeof AudioWorkletNode !== "function") return { supported: false as const, reason: "audio-worklet-unavailable" };
    const [audio, graphics, image, media, text, video, outputModule, bridgeModule, coordinatorModule, clockModule] = await Promise.all([
      import("/src/FX/AudioFX/public.ts"),
      import("/src/FX/GraphicsFX/public.ts"),
      import("/src/FX/ImageFX/public.ts"),
      import("/src/FX/MediaFX/public.ts"),
      import("/src/FX/TextFX/public.ts"),
      import("/src/FX/VideoFX/public.ts"),
      import("/src/SynCloudOS/PlatformAdapters/BrowserAudioGraphOutput.ts"),
      import("/src/SynCloudOS/AudioFX/AudioMediaClockBridge.ts"),
      import("/src/SynCloudOS/VideoFX/AVPresentationCoordinator.ts"),
      import("/src/FX/MediaFX/MEFXClock.ts"),
    ]);
    const context = new AudioContextConstructor({ sampleRate: 48_000 });
    if (!context.audioWorklet) {
      await context.close();
      return { supported: false as const, reason: "audio-worklet-unavailable" };
    }
    await context.resume();
    if (context.state !== "running") {
      await context.close();
      return { supported: false as const, reason: `audio-context-${context.state}` };
    }
    const format = new audio.AUFXAudioFormat(context.sampleRate, 1);
    const output = new outputModule.BrowserAudioGraphOutput(async () => context, new AbortController().signal, () => undefined);
    const engine = new audio.AUFXAudioEngine(format, output);
    const player = new audio.AUFXAudioPlayerNode(format);
    engine.attach(player); engine.connect(player, engine.mainMixerNode);
    const pcm = new audio.AUFXAudioPCMBuffer(format, 4_800);
    pcm.frameLength = 4_800;
    for (let frame = 0; frame < pcm.frameLength; frame++)
      pcm.setSample(0, frame, Math.sin(2 * Math.PI * 440 * frame / format.sampleRate) * 0.125);
    player.scheduleBuffer(pcm, 0, true); player.play();
    let audioTapCount = 0, audioPeak = 0;
    const tap = engine.installTap(engine.mainMixerNode, buffer => {
      audioTapCount++;
      for (let frame = 0; frame < buffer.frameLength; frame++)
        audioPeak = Math.max(audioPeak, Math.abs(buffer.getSample(0, frame)));
    });
    const canvas = document.createElement("canvas");
    canvas.width = 96; canvas.height = 54;
    document.body.append(canvas);
    const drawing = canvas.getContext("2d");
    if (!drawing) throw new Error("Canvas presentation is unavailable.");
    const drawnPixels: number[][] = [];
    const monotonic = new clockModule.MEFXMonotonicClock("browser:performance", 0.001, () => performance.now() / 1_000);
    const timebase = new media.MEFXTimebase(monotonic);
    const bridge = new bridgeModule.AudioMediaClockBridge({ sampleRate: format.sampleRate, mediaClock: timebase, observeAudioClock: () => output.observeClock() });
    const presented: number[] = [];
    const coordinator = new coordinatorModule.AVPresentationCoordinator({
      timebase,
      audioBridge: bridge,
      toleranceSeconds: 0.02,
      maximumQueuedFrames: 3,
      present(frame, presentation) {
        presentation.signal.throwIfAborted();
        const pixels = frame.toGFXImage();
        drawing.putImageData(new ImageData(new Uint8ClampedArray(pixels.copyData()), pixels.width, pixels.height), 0, 0);
        drawnPixels.push(Array.from(drawing.getImageData(0, 0, 1, 1).data));
        presented.push(frame.timing.presentationTime.toSeconds());
      },
    });
    const processor = new video.VFXFrameProcessor({ maximumRetainedBytes: 4 * 1024 * 1024 });
    try {
      const fontResponse = await fetch("/tests/fixtures/fx/fonts/notosans-NotoSans%5Bwdth,wght%5D.ttf");
      if (!fontResponse.ok) throw new Error(`VFX-06 font fixture failed: ${fontResponse.status}`);
      const font = await text.TFXFont.create(new Uint8Array(await fontResponse.arrayBuffer()), new text.TFXFontDescriptor({ size: 12 }));
      const title = new text.TFXTypesetter(new text.TFXAttributedString("Timeline", [{ start: 0, end: 8, font }])).createLine(0, 8);
      const firstPTS = media.MEFXTime.finite(2n, 1);

      const makeFrame = (pts: InstanceType<typeof media.MEFXTime>) => {
        const frameFormat = new video.VFXVideoFormat({ codedWidth: 96, codedHeight: 54, pixelFormat: "rgba8", colourSpace: "srgb" });
        const bytes = new Uint8Array(frameFormat.byteLength);
        for (let offset = 0; offset < bytes.length; offset += 4) bytes.set([28, 52, 92, 255], offset);
        const pixels = new video.VFXPixelBuffer(frameFormat, bytes);
        try {
          return new video.VFXFrame({ pixels, timing: new media.MEFXSampleTimingInfo({ presentationTime: pts, duration: media.MEFXTime.finite(1n, 30) }) });
        } finally { pixels.close(); }
      };

      const sourceFrame = makeFrame(firstPTS);
      const graph = new video.VFXFrameProcessingGraph(input => new image.IFXFilterRegistry().create("invert", {}).apply(input));
      const filtered = await processor.process(sourceFrame, graph);
      sourceFrame.close();
      const decorated = processor.draw(filtered.frame, drawing => {
        drawing.fillPath(graphics.GFXPath.rect({ x: 0, y: 35, width: 96, height: 19 }), graphics.GFXColour.rgba(0, 0, 0, 0.55));
      });
      filtered.frame.close();
      const titled = processor.drawText(decorated.frame, title, { origin: { x: 6, y: 49 }, colour: graphics.GFXColour.rgba(1, 1, 1, 1) });
      decorated.frame.close();
      const titleTimingPreserved = titled.frame.timing.presentationTime.compare(firstPTS) === 0;
      const titlePixels = titled.frame.toGFXImage().copyData();
      let titleInkPixels = 0;
      for (let offset = 35 * 96 * 4; offset < titlePixels.length; offset += 4)
        if (titlePixels[offset]! > 230 && titlePixels[offset + 1]! > 230 && titlePixels[offset + 2]! > 230) titleInkPixels++;
      // Prepare the frame before starting its presentation clock. Correlate
      // actual output at this PTS so RAF polling cannot skip the first frame's
      // narrow window; the separate early/late probes below own those cases.
      await engine.start();
      await coordinator.seek(firstPTS);
      const correlationGeneration = coordinator.reanchorAudio();
      coordinator.enqueue(titled.frame);
      titled.frame.close();
      const firstAttempt = await coordinator.tick();
      let first = firstAttempt;
      for (let attempt = 0; attempt < 180 && first.action === "wait"; attempt += 1) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        first = await coordinator.tick();
      }

      // Keep the early-frame probe close enough to the presentation window that
      // a throttled browser does not spend dozens of animation frames polling
      // before it reaches the same strict A/V tolerance used by the coordinator.
      const earlyPTS = bridge.currentMediaTime(correlationGeneration).addDuration(media.MEFXTime.finite(80n, 1_000));
      const earlyFrame = makeFrame(earlyPTS);
      coordinator.enqueue(earlyFrame); earlyFrame.close();
      const early = await coordinator.tick();
      let afterWait = early;
      for (let attempt = 0; attempt < 120 && afterWait.action === "wait"; attempt += 1) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        afterWait = await coordinator.tick();
      }

      const lateFrame = makeFrame(bridge.currentMediaTime(correlationGeneration).addDuration(media.MEFXTime.finite(-100n, 1_000)));
      coordinator.enqueue(lateFrame); lateFrame.close();
      const late = await coordinator.tick();

      const routeProbe = makeFrame(bridge.currentMediaTime(correlationGeneration));
      coordinator.enqueue(routeProbe); routeProbe.close();
      await context.suspend();
      await new Promise(resolve => setTimeout(resolve, 20));
      const suspended = await coordinator.tick();
      await context.resume();
      const resumedGeneration = coordinator.reanchorAudio();
      coordinator.seek(bridge.currentMediaTime(resumedGeneration));
      const postSeek = await coordinator.tick();

      const diagnostics = coordinator.diagnostics;
      const outputClock = output.observeClock();
      font.dispose();
      return {
        supported: true as const,
        browserUserAgent: navigator.userAgent,
        sampleRate: format.sampleRate,
        // These are component/output-dispatch observations. The mounted
        // transport and physical acoustic/display onset gates remain separate.
        evidenceKind: "source-browser-pcm-and-canvas-dispatch",
        audioTapCount,
        audioPeak,
        drawnPixels,
        titleInkPixels,
        titleTimingPreserved,
        firstAttempt,
        first,
        early,
        afterWait,
        late,
        suspended,
        postSeek,
        presented,
        diagnostics,
        outputClock: outputClock ? { generation: outputClock.discontinuityGeneration, uncertaintySeconds: outputClock.uncertaintySeconds } : null,
      };
    } finally {
      processor.dispose();
      coordinator.dispose();
      bridge.dispose();
      timebase.dispose();
      monotonic.dispose();
      tap.dispose();
      engine.dispose();
      canvas.remove();
      await context.close();
    }
  });

  if (!result.supported) {
    testInfo.annotations.push({ type: "capability", description: result.reason });
    test.skip(true, result.reason);
    return;
  }
  expect(result.audioTapCount).toBeGreaterThan(0);
  expect(result.audioPeak).toBeGreaterThan(0.01);
  expect(result.titleInkPixels).toBeGreaterThan(0);
  expect(result.drawnPixels).toHaveLength(result.presented.length);
  expect(result.drawnPixels[0]).not.toEqual([28, 52, 92, 255]);
  expect(result.titleTimingPreserved).toBe(true);
  expect(result.first.action).toBe("present");
  expect(Math.abs(result.first.skewSeconds ?? Number.POSITIVE_INFINITY)).toBeLessThanOrEqual(0.02 + (result.outputClock?.uncertaintySeconds ?? 0));
  expect(result.early.action).toBe("wait");
  expect(result.afterWait.action).toBe("present");
  expect(result.late.action).toBe("drop");
  expect(result.suspended).toMatchObject({ action: "wait", reason: "audio-discontinuity" });
  expect(result.postSeek.action).toBe("idle");
  expect(result.diagnostics.droppedFrames).toBeGreaterThanOrEqual(1);
  expect(result.outputClock?.uncertaintySeconds).toBeGreaterThan(0);

  const directory = resolve(process.cwd(), ".artifacts", "expanded-fx", "vfx06");
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, `${testInfo.project.name}.json`), JSON.stringify({ browserName, project: testInfo.project.name, ...result }, null, 2));
});
