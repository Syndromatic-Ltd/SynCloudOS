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

// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { AFXTransform3D, AFXRenderer } from "../../../src/FX/AnimationFX/public";
import { MEFXSampleTimingInfo, MEFXTime } from "../../../src/FX/MediaFX/public";
import { VFXFrame } from "../../../src/FX/VideoFX/public";
import { BrowserAFXCanvasRenderer } from "../../../src/SynCloudOS/PlatformAdapters/BrowserAFXCanvasRenderer";

it("uploads one native atlas surface and draws 1,000 independently cropped 3D-capable quads in one batch", () => {
  const uploads: unknown[][] = [];
  const allocations: unknown[][] = [];
  const draws: unknown[][] = [];
  const buffers: Float32Array[] = [];
  const deletedTextures: unknown[] = [];
  const contextOptions: WebGLContextAttributes[] = [];
  const constants = new Map<string, number>([
    "VERTEX_SHADER", "FRAGMENT_SHADER", "COMPILE_STATUS", "LINK_STATUS", "ARRAY_BUFFER",
    "FLOAT", "DYNAMIC_DRAW", "TEXTURE_2D", "RGBA", "UNSIGNED_BYTE", "TEXTURE_MIN_FILTER",
    "TEXTURE_MAG_FILTER", "TEXTURE_WRAP_S", "TEXTURE_WRAP_T", "LINEAR", "CLAMP_TO_EDGE",
    "COLOR_BUFFER_BIT", "DEPTH_BUFFER_BIT", "BLEND", "DEPTH_TEST", "LEQUAL", "SRC_ALPHA",
    "ONE_MINUS_SRC_ALPHA", "TRIANGLES", "TEXTURE0", "FRAMEBUFFER", "READ_FRAMEBUFFER",
    "DRAW_FRAMEBUFFER", "RENDERBUFFER", "COLOR_ATTACHMENT0", "DEPTH_ATTACHMENT", "RGBA8",
    "DEPTH_COMPONENT16", "FRAMEBUFFER_COMPLETE", "NEAREST",
  ].map((name, index) => [name, index + 1]));
  const gl = new Proxy({}, {
    get(_target, property) {
      if (typeof property === "string" && constants.has(property)) return constants.get(property);
      if (property === "createShader" || property === "createProgram" || property === "createBuffer" || property === "createTexture" ||
        property === "createFramebuffer" || property === "createRenderbuffer") return () => ({});
      if (property === "getShaderParameter" || property === "getProgramParameter") return () => true;
      if (property === "getAttribLocation") return () => 0;
      if (property === "getUniformLocation") return () => ({});
      if (property === "isContextLost") return () => false;
      if (property === "checkFramebufferStatus") return () => constants.get("FRAMEBUFFER_COMPLETE");
      if (property === "texImage2D" || property === "texSubImage2D") return (...args: unknown[]) => uploads.push(args);
      if (property === "texStorage2D") return (...args: unknown[]) => allocations.push(args);
      if (property === "drawArrays") return (...args: unknown[]) => draws.push(args);
      if (property === "bufferData") return (_target: unknown, data: Float32Array) => buffers.push(data);
      if (property === "deleteTexture") return (texture: unknown) => deletedTextures.push(texture);
      return () => {};
    },
  }) as unknown as WebGL2RenderingContext;
  const canvas = document.createElement("canvas");
  canvas.width = 800; canvas.height = 500;
  vi.spyOn(canvas, "getContext").mockImplementation(((kind: string, options?: WebGLContextAttributes) => {
    if (kind !== "webgl2") return null;
    if (options) contextOptions.push(options);
    return gl;
  }) as HTMLCanvasElement["getContext"]);
  const renderer = new BrowserAFXCanvasRenderer(canvas);
  expect(renderer.backend).toBe("webgl2");
  expect(contextOptions).toHaveLength(1);
  expect(contextOptions[0]).toMatchObject({ antialias: false, preserveDrawingBuffer: false });
  const scheduler = { now: () => 0, requestFrame: () => () => {}, reducedMotion: false, suspended: false };
  const wall = new AFXRenderer({ scheduler, target: renderer, width: 800, height: 500 });
  let decoded!: VFXFrame;
  for (let index = 0; index < 1000; index++) {
    const layer = wall.makeLayer();
    layer.frame = { x: (index % 40) * 20, y: Math.floor(index / 40) * 20, width: 20, height: 20 };
    if (!decoded) {
      const native = {
        codedWidth: 1920, codedHeight: 1080, timestamp: 1_000_000, duration: 33_333,
        clone() { return { ...this }; }, close() {},
      } as unknown as VideoFrame;
      decoded = VFXFrame.fromVideoFrame(native, new MEFXSampleTimingInfo({ presentationTime: MEFXTime.finite(1n, 1) }));
    }
    layer.contents = decoded;
    layer.contentsRect = { x: (index % 12) / 12, y: Math.floor(index % 144 / 12) / 12, width: 1 / 12, height: 1 / 12 };
  }
  let copies = 0;
  let closes = 0;
  const native = {
    codedWidth: 1920, codedHeight: 1080, timestamp: 1_000_000, duration: 33_333,
    clone() { return { ...this }; },
    close() { closes++; },
    copyTo() { copies++; throw new Error("GPU scene must not read pixels"); },
  } as unknown as VideoFrame;
  const atlas = VFXFrame.fromVideoFrame(native, new MEFXSampleTimingInfo({ presentationTime: MEFXTime.finite(1n, 1) }));
  for (const layer of wall.layer.sublayers) layer.contents = atlas;
  decoded.close();
  wall.render();
  wall.render();
  expect(uploads).toHaveLength(1);
  expect(draws).toEqual([[gl.TRIANGLES, 0, 6000], [gl.TRIANGLES, 0, 6000]]);
  expect(buffers).toHaveLength(2);
  expect(buffers[0]?.length).toBe(1000 * 6 * 17);
  expect(copies).toBe(0);
  const detailFrame = VFXFrame.fromVideoFrame(native, new MEFXSampleTimingInfo({ presentationTime: MEFXTime.finite(1n, 1) }));
  let detailLayer!: ReturnType<typeof wall.makeLayer>;
  for (const content of [detailFrame, atlas]) {
    const layer = wall.makeLayer();
    if (content === detailFrame) detailLayer = layer;
    layer.frame = { x: 0, y: 0, width: 20, height: 20 };
    layer.contents = content;
  }
  wall.render();
  expect(draws.slice(2).map((call) => call[2])).toEqual([6000, 6, 6]);
  expect(uploads).toHaveLength(2);
  detailLayer.contents = null;
  wall.render();
  expect(deletedTextures).toHaveLength(0);
  expect(allocations).toHaveLength(2);
  const nextFrame = VFXFrame.fromVideoFrame(native, new MEFXSampleTimingInfo({ presentationTime: MEFXTime.finite(2n, 1) }));
  for (const layer of wall.layer.sublayers) if (layer.contents) layer.contents = nextFrame;
  wall.render();
  expect(uploads).toHaveLength(3);
  expect(allocations, 'The next frame reuses the released compatible GPU storage.').toHaveLength(2);
  expect(copies).toBe(0);
  wall.dispose(); atlas.close(); detailFrame.close(); nextFrame.close(); native.close();
  expect(deletedTextures).toHaveLength(2);
  expect(closes).toBeGreaterThanOrEqual(3);
});

it("uses one decoded source for Canvas2D crops and rejects unsupported 3D before partial redraw", () => {
  const draws: unknown[][] = [];
  const context = {
    clearRect() {}, save() {}, restore() {}, setTransform() {},
    drawImage(...args: unknown[]) { draws.push(args); },
    globalAlpha: 1,
  };
  const canvas = document.createElement("canvas");
  canvas.width = 200; canvas.height = 100;
  const visible = { ...context, drawImage() {} };
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement, kind: string) {
    return kind === "2d" ? (this === canvas ? visible : context) : null;
  } as HTMLCanvasElement["getContext"]);
  const renderer = new BrowserAFXCanvasRenderer(canvas);
  expect(renderer.backend).toBe("canvas2d");
  const wall = new AFXRenderer({ width: 200, height: 100, target: renderer,
    scheduler: { now: () => 0, requestFrame: () => () => {}, reducedMotion: false, suspended: false } });
  const layers = [wall.makeLayer(), wall.makeLayer()];
  layers.forEach((layer, index) => {
    layer.frame = { x: index * 100, y: 0, width: 100, height: 100 };
    layer.contentsRect = { x: index * .5, y: 0, width: .5, height: 1 };
  });
  let copies = 0;
  const native = {
    codedWidth: 4, codedHeight: 2,
    clone() { return { ...this }; }, close() {},
    copyTo() { copies++; throw new Error("fallback should draw borrowed source"); },
  } as unknown as VideoFrame;
  const decoded = VFXFrame.fromVideoFrame(native, new MEFXSampleTimingInfo({ presentationTime: MEFXTime.finite(0n, 1) }));
  layers.forEach(layer => { layer.contents = decoded; });
  wall.render();
  expect(draws).toHaveLength(2);
  expect(draws[0]?.slice(1, 5)).toEqual([0, 0, 2, 2]);
  expect(draws[1]?.slice(1, 5)).toEqual([2, 0, 2, 2]);
  expect(draws[0]?.[0]).toBe(draws[1]?.[0]);
  expect(copies).toBe(0);
  layers[1].transform = AFXTransform3D.rotation(Math.PI / 3, 0, 1, 0);
  expect(() => wall.render()).toThrow(/affine/i);
  expect(draws).toHaveLength(2);
  wall.dispose(); decoded.close(); native.close();
  getContext.mockRestore();
});
