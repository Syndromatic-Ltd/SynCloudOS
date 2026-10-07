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
import sharp from "sharp";

test('antialiases only enabled layer edges and preserves opaque per-sample occlusion', async ({ page }) => {
  await page.goto('/tests/fixtures/afx-video-wall-browser.html');
  const result = await page.evaluate(async () => {
    const [{ BrowserAFXCanvasRenderer }, animation, graphics] = await Promise.all([
      import('/src/SynCloudOS/PlatformAdapters/BrowserAFXCanvasRenderer.ts'),
      import('/src/FX/AnimationFX/public.ts'), import('/src/FX/GraphicsFX/public.ts'),
    ]);
    const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 96;
    const target = new BrowserAFXCanvasRenderer(canvas);
    const renderer = new animation.AFXRenderer({ target, width: 96, height: 96,
      scheduler: { now: () => 0, requestFrame: () => () => {}, reducedMotion: false, suspended: false } });
    const solid = (colour: number[]) => new graphics.GFXImage({ width: 1, height: 1,
      alpha: 'straight', colourSpace: 'srgb', data: new Uint8Array(colour) });
    const layer = renderer.makeLayer();
    layer.frame = { x: 27.25, y: 27.25, width: 40, height: 40 };
    layer.transform = animation.AFXTransform3D.rotation(.21, 0, 0, 1);
    layer.contents = solid([255, 0, 0, 255]);
    // Keep MSAA active while this layer opts out, to exercise mixed flags.
    const trigger = renderer.makeLayer(); trigger.frame = { x: 1, y: 1, width: 2, height: 2 };
    trigger.contents = layer.contents; trigger.allowsEdgeAntialiasing = true;
    const gl = canvas.getContext('webgl2')!;
    const pixels = () => { renderer.render(); const data = new Uint8Array(96 * 96 * 4);
      gl.readPixels(0, 0, 96, 96, gl.RGBA, gl.UNSIGNED_BYTE, data); return data; };
    const fractional = (data: Uint8Array) => { let count = 0;
      for (let y = 10; y < 85; y++) for (let x = 10; x < 85; x++) {
        const a = data[(y * 96 + x) * 4 + 3]; if (a > 0 && a < 255) count++;
      } return count; };
    layer.allowsEdgeAntialiasing = false; const aliased = fractional(pixels());
    layer.allowsEdgeAntialiasing = true; const all = fractional(pixels());
    layer.edgeAntialiasingMask = animation.AFXEdgeAntialiasingMask.layerTopEdge;
    const topOnly = fractional(pixels());
    layer.edgeAntialiasingMask = 15;
    layer.zPosition = 1;
    const behind = renderer.makeLayer(); behind.frame = { x: 0, y: 0, width: 96, height: 96 };
    behind.contents = solid([0, 0, 255, 255]);
    const composed = pixels(); let edgePixels = 0, incorrectOcclusion = 0;
    for (let i = 0; i < composed.length; i += 4) if (composed[i] > 0 && composed[i] < 255) {
      edgePixels++; if (composed[i] + composed[i + 2] < 253 || composed[i + 3] !== 255) incorrectOcclusion++;
    }
    const error = gl.getError(); renderer.dispose();
    return { aliased, all, topOnly, edgePixels, incorrectOcclusion, error };
  });
  expect(result.aliased).toBe(0);
  expect(result.all).toBeGreaterThan(60);
  expect(result.topOnly).toBeGreaterThan(10);
  expect(result.topOnly).toBeLessThan(result.all / 2);
  expect(result.edgePixels).toBeGreaterThan(60);
  expect(result.incorrectOcclusion).toBe(0);
  expect(result.error).toBe(0);
});

test("rejects a canvas whose existing multisampled context cannot receive staged frames", async ({ page }) => {
  await page.goto("/tests/fixtures/afx-video-wall-browser.html");
  const result = await page.evaluate(async () => {
    const { createBrowserAnimationLayerHost } = await import("/src/SynCloudOS/PlatformAdapters/BrowserAnimationLayerHost.ts");
    const canvas = document.createElement("canvas");
    canvas.width = 100; canvas.height = 100;
    const gl = canvas.getContext("webgl2", { antialias: true });
    if (!gl?.getContextAttributes()?.antialias) return "unsupported";
    const host = createBrowserAnimationLayerHost(document, { now: () => 0, requestFrame: () => () => {}, reducedMotion: false, suspended: false });
    try { host.createRenderer(canvas, {}, new AbortController().signal); return "accepted"; }
    catch (error) { return String(error); }
  });
  if (result === "unsupported") test.skip(true, "multisampled WebGL2 canvas unavailable");
  expect(result).toMatch(/multisample/i);
});

test("the mounted AFX scene redraws moving layers and replaced video frames without manual render calls", async ({ page }) => {
  await page.goto("/tests/fixtures/afx-video-wall-browser.html");
  const result = await page.evaluate(async () => {
    const [{ createBrowserAnimationLayerHost }, { createMountedAnimationLayers }, video, media] = await Promise.all([
      import("/src/SynCloudOS/PlatformAdapters/BrowserAnimationLayerHost.ts"),
      import("/src/SynCloudOS/HostServices/mountedAnimationLayers.ts"),
      import("/src/FX/VideoFX/public.ts"),
      import("/src/FX/MediaFX/public.ts"),
    ]);
    const canvas = document.createElement("canvas");
    canvas.width = 100; canvas.height = 20;
    document.body.append(canvas);
    const scheduler = {
      now: () => performance.now() / 1000,
      requestFrame(callback: (time: number) => void) {
        const id = requestAnimationFrame((time) => callback(time / 1000));
        return () => cancelAnimationFrame(id);
      },
      reducedMotion: false, suspended: false,
    };
    const owner = new AbortController();
    const host = createBrowserAnimationLayerHost(document, scheduler);
    const mounted = createMountedAnimationLayers(host, owner.signal, () => { owner.signal.throwIfAborted(); });
    const wall = mounted.createRenderer(canvas);
    const gl = canvas.getContext("webgl2");
    if (!gl) return { backend: "unavailable" };
    const layer = wall.makeLayer();
    layer.frame = { x: 0, y: 0, width: 50, height: 20 };
    const makeFrame = (data: number[], index: number) => {
      const pixels = new video.VFXPixelBuffer(new video.VFXVideoFormat({ codedWidth: 1, codedHeight: 1, pixelFormat: "rgba8", colourSpace: "srgb" }), new Uint8Array(data));
      const frame = new video.VFXFrame({ pixels, timing: new media.MEFXSampleTimingInfo({ presentationTime: media.MEFXTime.finite(BigInt(index), 30) }) });
      pixels.close();
      return frame;
    };
    const read = (x: number) => { const pixels = new Uint8Array(4); gl.readPixels(x, 10, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels); return [...pixels]; };
    // Read in the same animation frame after the wall's queued submission;
    // WebGL may clear its drawing buffer after the frame is presented.
    const sample = (positions: number[]) => new Promise<number[][]>((resolve) =>
      requestAnimationFrame(() => resolve(positions.map(read))));
    const red = makeFrame([255, 0, 0, 255], 1);
    layer.contents = red;
    const [initial] = await sample([25]);
    layer.frame = { x: 50, y: 0, width: 50, height: 20 };
    const [oldPosition, moved] = await sample([25, 75]);
    const blue = makeFrame([0, 0, 255, 255], 2);
    layer.contents = blue;
    const [replaced] = await sample([75]);
    owner.abort();
    const released = wall.disposed;
    const nextOwner = new AbortController();
    const rebound = createMountedAnimationLayers(host, nextOwner.signal, () => { nextOwner.signal.throwIfAborted(); }).createRenderer(canvas);
    const reboundSucceeded = !rebound.disposed;
    nextOwner.abort(); red.close(); blue.close(); canvas.remove();
    return { backend: "webgl2", initial, oldPosition, moved, replaced, released, reboundSucceeded };
  });
  expect(result.backend).toBe("webgl2");
  expect(result.initial?.[0]).toBeGreaterThan(200);
  expect(result.oldPosition?.[3]).toBe(0);
  expect(result.moved?.[0]).toBeGreaterThan(200);
  expect(result.replaced?.[2]).toBeGreaterThan(200);
  expect(result.replaced?.[0]).toBeLessThan(50);
  expect(result.released).toBe(true);
  expect(result.reboundSucceeded).toBe(true);
});

test("layer opacity is applied once through WebGL staging and browser composition", async ({ page }) => {
  await page.goto("/tests/fixtures/afx-video-wall-browser.html");
  const result = await page.evaluate(async () => {
    const [{ BrowserAFXCanvasRenderer }, animation, graphics] = await Promise.all([
      import("/src/SynCloudOS/PlatformAdapters/BrowserAFXCanvasRenderer.ts"),
      import("/src/FX/AnimationFX/public.ts"),
      import("/src/FX/GraphicsFX/public.ts"),
    ]);
    const canvas = document.createElement("canvas");
    canvas.width = 20; canvas.height = 20;
    const renderer = new BrowserAFXCanvasRenderer(canvas);
    if (renderer.backend !== "webgl2") return { backend: renderer.backend };
    const wall = new animation.AFXRenderer({
      scheduler: { now: () => 0, requestFrame: () => () => {}, reducedMotion: false, suspended: false },
      target: renderer, width: 20, height: 20,
    });
    const layer = wall.makeLayer();
    layer.frame = { x: 0, y: 0, width: 20, height: 20 };
    layer.opacity = .5;
    layer.contents = new graphics.GFXImage({
      width: 1, height: 1, alpha: "straight", colourSpace: "srgb",
      data: new Uint8Array([255, 0, 0, 255]),
    });
    wall.render();
    const gl = canvas.getContext("webgl2")!;
    const raw = new Uint8Array(4);
    gl.readPixels(10, 10, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    const composed = document.createElement("canvas");
    composed.width = 20; composed.height = 20;
    const context = composed.getContext("2d")!;
    context.fillStyle = "rgb(0, 0, 0)";
    context.fillRect(0, 0, 20, 20);
    context.drawImage(canvas, 0, 0);
    const visible = [...context.getImageData(10, 10, 1, 1).data];
    wall.dispose();
    return { backend: renderer.backend, raw: [...raw], visible };
  });
  expect(result.backend).toBe("webgl2");
  expect(result.raw?.[3]).toBeGreaterThanOrEqual(120);
  expect(result.raw?.[3]).toBeLessThanOrEqual(136);
  expect(result.visible?.[0]).toBeGreaterThanOrEqual(120);
  expect(result.visible?.[0]).toBeLessThanOrEqual(136);
  expect(result.visible?.[1]).toBeLessThanOrEqual(2);
  expect(result.visible?.[2]).toBeLessThanOrEqual(2);
  expect(result.visible?.[3]).toBe(255);
});

test("a static retained AFX scene survives idle compositor frames and host repaint", async ({ page }) => {
  await page.goto("/tests/fixtures/afx-video-wall-browser.html");
  const result = await page.evaluate(async () => {
    const [{ BrowserAFXCanvasRenderer }, animation, graphics] = await Promise.all([
      import("/src/SynCloudOS/PlatformAdapters/BrowserAFXCanvasRenderer.ts"),
      import("/src/FX/AnimationFX/public.ts"),
      import("/src/FX/GraphicsFX/public.ts"),
    ]);
    const canvas = document.createElement("canvas");
    canvas.width = 20; canvas.height = 20;
    canvas.dataset.testid = "retained-scene";
    document.body.append(canvas);
    // These asynchronous snapshots read the canvas image after presentation.
    // WebKit snapshots an unpreserved drawing buffer as transparent, even for
    // plain WebGL clearColor/clear. Preserve this capture fixture's pixels;
    // keep the real adapter, idle scheduling and exact colour assertions.
    canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true });
    const renderer = new BrowserAFXCanvasRenderer(canvas);
    if (renderer.backend !== "webgl2") return { backend: renderer.backend };
    const wall = new animation.AFXRenderer({
      scheduler: { now: () => 0, requestFrame: () => () => {}, reducedMotion: false, suspended: false },
      target: renderer, width: 20, height: 20,
    });
    const layer = wall.makeLayer();
    layer.frame = { x: 0, y: 0, width: 20, height: 20 };
    layer.contents = new graphics.GFXImage({
      width: 1, height: 1, alpha: "straight", colourSpace: "srgb",
      data: new Uint8Array([255, 0, 0, 255]),
    });
    wall.render();
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const button = document.createElement("button");
    button.textContent = "focus target";
    document.body.append(button);
    button.focus();
    document.body.style.opacity = ".999";
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    document.body.style.opacity = "1";
    (window as any).__disposeRetainedScene = () => { wall.dispose(); button.remove(); canvas.remove(); };
    return { backend: renderer.backend };
  });
  expect(result.backend).toBe("webgl2");
  // Observe the asynchronously captured canvas with its preserved drawing buffer.
  const visible = await sharp(await page.getByTestId('retained-scene').screenshot())
    .extract({ left: 10, top: 10, width: 1, height: 1 }).ensureAlpha().raw().toBuffer();
  expect(visible[0]).toBeGreaterThan(220);
  expect(visible[1]).toBeLessThan(10);
  expect(visible[2]).toBeLessThan(10);
  expect(visible[3]).toBe(255);
  await page.evaluate(() => (window as any).__disposeRetainedScene());
});

test('restores current borrowed contents and a pending viewport after context loss, including an idle scene', async ({ page }) => {
  await page.goto('/tests/fixtures/afx-video-wall-browser.html');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(async () => {
    const [{ BrowserAFXCanvasRenderer }, animation, video, media] = await Promise.all([
      import('/src/SynCloudOS/PlatformAdapters/BrowserAFXCanvasRenderer.ts'),
      import('/src/FX/AnimationFX/public.ts'), import('/src/FX/VideoFX/public.ts'),
      import('/src/FX/MediaFX/public.ts'),
    ]);
    const canvas = document.createElement('canvas'); canvas.width = 40; canvas.height = 40;
    canvas.dataset.testid = 'recovery-scene'; document.body.append(canvas);
    // The capture is asynchronous; retain pixels for WebKit's canvas snapshot.
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true })!;
    const extension = gl.getExtension('WEBGL_lose_context')!;
    if (!extension) throw new Error('Context-loss test extension unavailable');
    let uploads = 0;
    const createTexture = gl.createTexture.bind(gl);
    gl.createTexture = () => { uploads++; return createTexture(); };
    const target = new BrowserAFXCanvasRenderer(canvas);
    const renderer = new animation.AFXRenderer({ target, width: 40, height: 40, scheduler: {
      now: () => performance.now() / 1000, reducedMotion: false, suspended: false,
      requestFrame(callback) { const id = requestAnimationFrame(time => callback(time / 1000)); return () => cancelAnimationFrame(id); },
    } });
    const makeFrame = (colour: number[]) => {
      const pixels = new video.VFXPixelBuffer(new video.VFXVideoFormat({ codedWidth: 1, codedHeight: 1, pixelFormat: 'rgba8', colourSpace: 'srgb' }), new Uint8Array(colour));
      const frame = new video.VFXFrame({ pixels, timing: new media.MEFXSampleTimingInfo({ presentationTime: media.MEFXTime.finite(0n, 1) }) });
      pixels.close(); return frame;
    };
    const first = makeFrame([255, 0, 0, 255]);
    const layer = renderer.makeLayer(); layer.frame = { x: 0, y: 0, width: 40, height: 40 };
    layer.allowsEdgeAntialiasing = true; layer.contents = first; renderer.render();
    const event = (name: string) => new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Missing ${name}`)), 5000);
      canvas.addEventListener(name, () => {
        clearTimeout(timeout);
        // Restoration is allowed after dispatch of the cancelled loss event
        // completes; a promise microtask inside that dispatch is too early.
        setTimeout(resolve, 0);
      }, { once: true });
    });
    const lost = event('webglcontextlost'); extension.loseContext(); await lost;
    const next = makeFrame([0, 0, 255, 255]);
    layer.contents = next; first.close();
    layer.frame = { x: 0, y: 0, width: 60, height: 30 };
    renderer.setViewport({ width: 60, height: 30, pixelRatio: 2 });
    renderer.render();
    const restored = event('webglcontextrestored'); extension.restoreContext(); await restored;
    (window as any).__recovery = { renderer, next, canvas, gl, uploads: () => uploads,
      async cycle() { const lost = event('webglcontextlost'); extension.loseContext(); await lost;
        const restored = event('webglcontextrestored'); extension.restoreContext(); await restored; },
      async disposeDuringLoss() { const lost = event('webglcontextlost'); extension.loseContext(); await lost;
        renderer.dispose(); next.close(); const count = uploads;
        const restored = event('webglcontextrestored'); extension.restoreContext(); await restored; return count; },
    };
  });
  const sample = async () => [...await sharp(await page.getByTestId('recovery-scene').screenshot())
    .extract({ left: 20, top: 10, width: 1, height: 1 }).ensureAlpha().raw().toBuffer()];
  await expect.poll(sample).toEqual([0, 0, 255, 255]);
  expect(await page.evaluate(() => { const s = (window as any).__recovery;
    return { width: s.canvas.width, height: s.canvas.height, uploads: s.uploads() }; }))
    .toEqual({ width: 120, height: 60, uploads: 2 });
  await page.evaluate(() => (window as any).__recovery.cycle());
  await expect.poll(sample).toEqual([0, 0, 255, 255]);
  const count = await page.evaluate(() => (window as any).__recovery.disposeDuringLoss());
  await page.getByTestId('recovery-scene').screenshot();
  expect(await page.evaluate(() => (window as any).__recovery.uploads())).toBe(count);
  expect(errors).toEqual([]);
});

test("one retained video frame paints two independent atlas crops through the AFX browser scene", async ({ page }, testInfo) => {
  await page.goto("/tests/fixtures/afx-video-wall-browser.html");
  await page.waitForFunction(() => (window as typeof window & { __afxVideoWallResult?: unknown }).__afxVideoWallResult !== undefined);
  const result = await page.evaluate(() => (window as typeof window & { __afxVideoWallResult?: unknown }).__afxVideoWallResult) as {
    backend?: string; sourceStorage?: string; left?: number[]; right?: number[];
    rotatedCentre?: number[]; rotatedEdge?: number[]; renderer?: string | null; error?: string;
    stress?: { quads: number; frames: number; backend: string; maximumSubmissionMs: number };
  };
  expect(result.error).toBeUndefined();
  expect(["webgl2", "canvas2d"]).toContain(result.backend);
  expect(["video-surface", "pixels"]).toContain(result.sourceStorage);
  const nativeAvailable = await page.evaluate(() => typeof VideoFrame === "function");
  expect(result.sourceStorage).toBe(nativeAvailable ? "video-surface" : "pixels");
  expect(result.left?.[0]).toBeGreaterThan(200);
  expect(result.left?.[2]).toBeLessThan(50);
  expect(result.right?.[2]).toBeGreaterThan(200);
  expect(result.right?.[0]).toBeLessThan(50);
  if (result.backend === "webgl2") {
    expect(result.rotatedCentre?.[2]).toBeGreaterThan(200);
    expect(result.rotatedEdge?.[3]).toBe(0);
  }
  expect(result.stress).toMatchObject({ quads: 1000, frames: 3, backend: result.backend });
  expect(Number.isFinite(result.stress?.maximumSubmissionMs)).toBe(true);
  console.log(JSON.stringify({ project: testInfo.project.name, ...result }));
});

test("a real WebCodecs decoded frame reaches the AFX wall as a retained surface", async ({ page, browserName }, testInfo) => {
  await page.goto("/tests/fixtures/afx-video-wall-browser.html");
  const result = await page.evaluate(async () => {
    if (typeof VideoFrame !== "function" || typeof VideoEncoder !== "function" || typeof VideoDecoder !== "function")
      return { supported: false as const, reason: "webcodecs-video-unavailable" };
    const [{ BrowserVideoDecoder }, { BrowserAFXCanvasRenderer }, animation, video, media] = await Promise.all([
      import("/src/SynCloudOS/PlatformAdapters/BrowserVideoDecoder.ts"),
      import("/src/SynCloudOS/PlatformAdapters/BrowserAFXCanvasRenderer.ts"),
      import("/src/FX/AnimationFX/public.ts"),
      import("/src/FX/VideoFX/public.ts"),
      import("/src/FX/MediaFX/public.ts"),
    ]);
    const codec = "vp8";
    const probe = await VideoEncoder.isConfigSupported({ codec, width: 4, height: 4, bitrate: 100_000, framerate: 30 });
    if (!probe.supported) return { supported: false as const, reason: "vp8-encode-unavailable" };
    let encoded: EncodedVideoChunk | undefined;
    const encoder = new VideoEncoder({ output(chunk) { encoded = chunk; }, error(error) { throw error; } });
    encoder.configure(probe.config);
    const input = document.createElement("canvas");
    input.width = 4; input.height = 4;
    const context = input.getContext("2d")!;
    context.fillStyle = "rgb(240, 20, 10)";
    context.fillRect(0, 0, 4, 2);
    context.fillStyle = "rgb(10, 20, 240)";
    context.fillRect(0, 2, 4, 2);
    const native = new VideoFrame(input, { timestamp: 2_000_000, duration: 33_333 });
    encoder.encode(native, { keyFrame: true });
    native.close();
    await encoder.flush();
    encoder.close();
    if (!encoded) throw new Error("VP8 encoder produced no frame");
    const data = new Uint8Array(encoded.byteLength);
    encoded.copyTo(data);
    const backend = new BrowserVideoDecoder({ outputStorage: "video-surface" });
    const capability = await video.VFXCodecCapabilities.queryDecoder({ codec, codedWidth: 4, codedHeight: 4 }, backend);
    if (!capability.supported) return { supported: false as const, reason: capability.reason ?? "vp8-decode-unavailable" };
    const outputs: InstanceType<typeof video.VFXFrame>[] = [];
    const decoder = new video.VFXDecoder({ backend, output(frame) { outputs.push(frame); } });
    decoder.configure(capability.config);
    decoder.decode(new video.VFXEncodedChunk({
      type: encoded.type, data,
      timing: new media.MEFXSampleTimingInfo({
        presentationTime: media.MEFXTime.finite(BigInt(encoded.timestamp), 1_000_000),
        duration: encoded.duration == null ? null : media.MEFXTime.finite(BigInt(encoded.duration), 1_000_000),
      }),
    }));
    await decoder.flush();
    const output = outputs[0];
    if (!output) throw new Error("VP8 decoder produced no frame");
    const storageKind = output.storageKind;
    decoder.dispose();
    const canvas = document.createElement("canvas");
    canvas.width = 100; canvas.height = 100;
    const renderer = new BrowserAFXCanvasRenderer(canvas);
    const wall = new animation.AFXRenderer({
      scheduler: { now: () => 0, requestFrame: () => () => {}, reducedMotion: false, suspended: false },
      target: renderer, width: 100, height: 100,
    });
    const topCrop = wall.makeLayer();
    topCrop.frame = { x: 0, y: 0, width: 50, height: 100 };
    topCrop.contents = output;
    topCrop.contentsRect = { x: 0, y: 0, width: 1, height: .5 };
    const bottomCrop = wall.makeLayer();
    bottomCrop.frame = { x: 50, y: 0, width: 50, height: 100 };
    bottomCrop.contents = output;
    bottomCrop.contentsRect = { x: 0, y: .5, width: 1, height: .5 };
    wall.render();
    const gl = canvas.getContext("webgl2")!;
    const topCropPixel = new Uint8Array(4);
    const bottomCropPixel = new Uint8Array(4);
    gl.readPixels(25, 50, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, topCropPixel);
    gl.readPixels(75, 50, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bottomCropPixel);
    wall.dispose(); output.close();
    return {
      supported: true as const,
      storageKind,
      backend: renderer.backend,
      topCrop: [...topCropPixel],
      bottomCrop: [...bottomCropPixel],
    };
  });
  if (!result.supported) {
    expect(browserName).toBe("webkit");
    test.skip(true, `WebCodecs decoded-surface path unavailable: ${result.reason}`);
    return;
  }
  expect(result.storageKind).toBe("video-surface");
  expect(result.backend).toBe("webgl2");
  expect(result.topCrop[0]).toBeGreaterThan(result.topCrop[2] + 100);
  expect(result.bottomCrop[2]).toBeGreaterThan(result.bottomCrop[0] + 100);
});

test("ordinary AFX image contentsRect views share one source image and render distinct pixels", async ({ page }) => {
  await page.goto("/tests/fixtures/afx-video-wall-browser.html");
  const result = await page.evaluate(async () => {
    const [{ GFXImage }, { layerContentSVG }] = await Promise.all([
      import("/src/FX/GraphicsFX/GFXImage.ts"),
      import("/src/SynCloudOS/PlatformAdapters/BrowserAnimationLayerContent.ts"),
    ]);
    const image = new GFXImage({ width: 4, height: 1, alpha: "straight", colourSpace: "srgb",
      data: new Uint8Array([255,0,0,255,255,0,0,255,0,0,255,255,0,0,255,255]) });
    const views = [0, .5].map((x) => layerContentSVG({ kind: "image", image },
      { x: 0, y: 0, width: 100, height: 50 }, `view-${x}`,
      { contentsRect: { x, y: 0, width: .5, height: 1 }, contentsCenter: { x: 0, y: 0, width: 1, height: 1 }, contentsGravity: "resize" }));
    const URLs = views.map((markup) => /<image\s[^>]*href="([^"]+)"/.exec(markup)?.[1]);
    const colours: number[][] = [];
    for (const markup of views) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50">${markup}</svg>`;
      const source = new Image();
      source.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await source.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 100; canvas.height = 50;
      const context = canvas.getContext("2d")!;
      context.drawImage(source, 0, 0);
      colours.push([...context.getImageData(50, 25, 1, 1).data]);
    }
    return { oneSource: URLs[0] === URLs[1], colours };
  });
  expect(result.oneSource).toBe(true);
  expect(result.colours[0]?.[0]).toBeGreaterThan(200);
  expect(result.colours[0]?.[2]).toBeLessThan(50);
  expect(result.colours[1]?.[2]).toBeGreaterThan(200);
  expect(result.colours[1]?.[0]).toBeLessThan(50);
});
