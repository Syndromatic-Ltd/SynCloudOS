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

import { AFXTransform3D, AFXRenderer } from "../../src/FX/AnimationFX/public";
import { MEFXSampleTimingInfo, MEFXTime } from "../../src/FX/MediaFX/public";
import { VFXFrame, VFXPixelBuffer, VFXVideoFormat } from "../../src/FX/VideoFX/public";
import { BrowserAFXCanvasRenderer } from "../../src/SynCloudOS/PlatformAdapters/BrowserAFXCanvasRenderer";

declare global {
  interface Window { __afxVideoWallResult?: unknown; }
}

try {
  const canvas = document.querySelector<HTMLCanvasElement>("#wall")!;
  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = 4; atlasCanvas.height = 2;
  const source = atlasCanvas.getContext("2d")!;
  source.fillStyle = "rgb(255, 0, 0)"; source.fillRect(0, 0, 2, 2);
  source.fillStyle = "rgb(0, 0, 255)"; source.fillRect(2, 0, 2, 2);
  const timing = new MEFXSampleTimingInfo({ presentationTime: MEFXTime.finite(1n, 1) });
  let decoded: VFXFrame;
  if (typeof VideoFrame === "function") {
    const native = new VideoFrame(atlasCanvas, { timestamp: 1_000_000 });
    decoded = VFXFrame.fromVideoFrame(native, timing);
    native.close();
  } else {
    const pixels = new VFXPixelBuffer(new VFXVideoFormat({ codedWidth: 4, codedHeight: 2, pixelFormat: "rgba8", colourSpace: "srgb" }), new Uint8Array(source.getImageData(0, 0, 4, 2).data));
    decoded = new VFXFrame({ pixels, timing });
    pixels.close();
  }
  const sourceStorage = decoded.storageKind;
  const renderer = new BrowserAFXCanvasRenderer(canvas);
  const scheduler = { now: () => 0, requestFrame: () => () => {}, reducedMotion: false, suspended: false };
  const wall = new AFXRenderer({ scheduler, target: renderer, width: 200, height: 100 });
  const layers = [];
  for (let index = 0; index < 2; index++) {
    const layer = wall.makeLayer();
    layer.frame = { x: index * 100, y: 0, width: 100, height: 100 };
    layer.contents = decoded;
    layer.contentsRect = { x: index * 0.5, y: 0, width: 0.5, height: 1 };
    layers.push(layer);
  }
  wall.render();
  const gl = canvas.getContext("webgl2");
  const read = (x: number) => {
    if (!gl) return [...canvas.getContext("2d")!.getImageData(x, 50, 1, 1).data];
    const pixels = new Uint8Array(4);
    gl.readPixels(x, 50, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return [...pixels];
  };
  const extension = gl?.getExtension("WEBGL_debug_renderer_info");
  const left = read(50), right = read(150);
  layers[1].transform = AFXTransform3D.rotation(Math.PI / 3, 0, 1, 0);
  wall.render();
  const stressCanvas = document.createElement("canvas");
  stressCanvas.width = 800; stressCanvas.height = 500;
  const stressRenderer = new BrowserAFXCanvasRenderer(stressCanvas);
  const stressWall = new AFXRenderer({ scheduler, target: stressRenderer, width: 800, height: 500 });
  const stressLayers = [];
  for (let index = 0; index < 1000; index++) {
    const layer = stressWall.makeLayer();
    layer.frame = { x: (index % 40) * 20, y: Math.floor(index / 40) * 20, width: 20, height: 20 };
    layer.contentsRect = { x: (index % 12) / 12, y: Math.floor(index % 144 / 12) / 12, width: 1 / 12, height: 1 / 12 };
    stressLayers.push(layer);
  }
  const submissions: number[] = [];
  for (let index = 0; index < 3; index++) {
    const nextTiming = new MEFXSampleTimingInfo({ presentationTime: MEFXTime.finite(BigInt(index), 30) });
    let next: VFXFrame;
    if (typeof VideoFrame === "function") {
      const surface = new VideoFrame(atlasCanvas, { timestamp: index * 33_333 });
      next = VFXFrame.fromVideoFrame(surface, nextTiming);
      surface.close();
    } else {
      const pixels = new VFXPixelBuffer(new VFXVideoFormat({ codedWidth: 4, codedHeight: 2, pixelFormat: "rgba8", colourSpace: "srgb" }), new Uint8Array(source.getImageData(0, 0, 4, 2).data));
      next = new VFXFrame({ pixels, timing: nextTiming });
      pixels.close();
    }
    for (const layer of stressLayers) layer.contents = next;
    const start = performance.now();
    stressWall.render();
    submissions.push(performance.now() - start);
    next.close();
  }
  stressWall.dispose(); decoded.close();
  window.__afxVideoWallResult = {
    backend: renderer.backend,
    sourceStorage,
    left, right, rotatedCentre: read(150), rotatedEdge: read(190),
    stress: { quads: 1000, frames: submissions.length, backend: stressRenderer.backend, maximumSubmissionMs: Math.max(...submissions) },
    renderer: extension ? gl?.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null,
    vendor: extension ? gl?.getParameter(extension.UNMASKED_VENDOR_WEBGL) : null,
  };
  // Keep the scene visible for screenshot evidence; the host owns teardown.
} catch (error) {
  window.__afxVideoWallResult = { error: String(error) };
}
