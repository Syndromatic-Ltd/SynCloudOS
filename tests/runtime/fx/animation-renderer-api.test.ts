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

import { expect, it, vi } from "vitest";
import { AFXLayer, AFXRenderer, AFXTransaction, AFXTransform3D } from "../../../src/FX/AnimationFX/public";
import { MEFXSampleTimingInfo, MEFXTime } from "../../../src/FX/MediaFX/public";
import { VFXFrame, VFXPixelBuffer, VFXVideoFormat } from "../../../src/FX/VideoFX/public";
import { GFXColour, GFXImage } from "../../../src/FX/GraphicsFX/public";

it('automatically submits replacement video contents after prior borrowed frames are released', () => {
  const pending = new Set<(time: number) => void>();
  const submitted: VFXFrame[][] = [];
  const renderer = new AFXRenderer({ width: 100, height: 100,
    scheduler: { now: () => 0, reducedMotion: false, suspended: false,
      requestFrame(callback) { pending.add(callback); return () => pending.delete(callback); } },
    target: { render(scene) {
      const frames = scene.quads.map(quad => quad.content as VFXFrame);
      expect(frames.every(frame => !frame.closed)).toBe(true);
      submitted.push(frames);
    }, dispose() {} },
  });
  const pixels = new VFXPixelBuffer(new VFXVideoFormat({ codedWidth: 4, codedHeight: 4,
    pixelFormat: 'rgba8', colourSpace: 'srgb' }), new Uint8Array(64));
  const first = new VFXFrame({ pixels, timing: new MEFXSampleTimingInfo({ presentationTime: MEFXTime.finite(0n, 24) }) });
  const second = new VFXFrame({ pixels, timing: new MEFXSampleTimingInfo({ presentationTime: MEFXTime.finite(1n, 24) }) });
  pixels.close();
  const layers = [renderer.makeLayer(), renderer.makeLayer()];
  for (const layer of layers) { layer.frame = { x: 0, y: 0, width: 40, height: 40 }; layer.contents = first; }
  renderer.render();
  const before = submitted.length;
  AFXTransaction.begin(); AFXTransaction.setDisableActions(true);
  try { for (const layer of layers) layer.contents = second; }
  finally { AFXTransaction.commit(); }
  first.close();
  // The caller still owns the new frame. Previous contents no longer belong
  // to any presentation layer and are not sampled by the deferred submission.
  for (let frame = 0; frame < 3 && pending.size; frame++) {
    const callbacks = [...pending]; pending.clear();
    for (const callback of callbacks) callback((frame + 1) * 16);
  }
  expect(submitted.length - before).toBe(1);
  expect(submitted.at(-1)).toEqual([second, second]);
  renderer.dispose(); second.close();
});

it('preserves the CALayer antialiasing gate and independent edge mask in a rendered scene', () => {
  const scenes: any[] = [];
  const renderer = new AFXRenderer({
    scheduler: { now: () => 0, requestFrame: () => () => {}, reducedMotion: false, suspended: false },
    target: { render(scene) { scenes.push(scene); }, dispose() {} }, width: 100, height: 100,
  });
  const layer = renderer.makeLayer();
  layer.frame = { x: 10, y: 10, width: 40, height: 40 };
  layer.contents = new GFXImage({ width: 1, height: 1, alpha: 'straight', colourSpace: 'srgb', data: new Uint8Array([255, 0, 0, 255]) });
  expect(layer.allowsEdgeAntialiasing).toBe(false);
  expect(layer.edgeAntialiasingMask).toBe(15);
  layer.edgeAntialiasingMask = 9;
  renderer.render();
  expect(scenes.at(-1).quads[0].edgeAntialiasingMask).toBe(0);
  layer.allowsEdgeAntialiasing = true;
  renderer.render();
  expect(scenes.at(-1).quads[0].edgeAntialiasingMask).toBe(9);
  expect(() => { layer.edgeAntialiasingMask = 16; }).toThrow(/antialias/i);
  expect(layer.edgeAntialiasingMask).toBe(9);
  renderer.dispose();
});

it("renders independent timed video layers through a general layer-tree renderer", () => {
  const scenes: Array<{ quads: readonly { content: VFXFrame | GFXImage }[] }> = [];
  const renderer = new AFXRenderer({
    scheduler: { now: () => 0, requestFrame: () => () => {}, reducedMotion: false, suspended: false },
    target: { render(scene) { scenes.push(scene); }, dispose() {} },
    width: 200, height: 100,
  });
  const layerA = renderer.makeLayer();
  const layerB = renderer.makeLayer();
  expect(layerA.superlayer).toBe(renderer.layer);
  layerA.frame = { x: 0, y: 0, width: 100, height: 100 };
  layerB.frame = { x: 100, y: 0, width: 100, height: 100 };
  const pixels = new VFXPixelBuffer(new VFXVideoFormat({ codedWidth: 4, codedHeight: 4, pixelFormat: "rgba8", colourSpace: "srgb" }), new Uint8Array(64));
  const frame = new VFXFrame({ pixels, timing: new MEFXSampleTimingInfo({ presentationTime: MEFXTime.finite(1n, 30) }) });
  pixels.close();
  const second = frame.clone();
  layerA.contents = frame;
  layerB.contents = second;
  renderer.render();
  expect(scenes[0]?.quads.map(quad => quad.content)).toEqual([frame, second]);
  frame.close();
  second.close();
  renderer.dispose();
});

it("renders ordinary image contents through the same layer-tree contract", () => {
  const scenes: Array<{ quads: readonly { content: unknown }[] }> = [];
  const renderer = new AFXRenderer({
    scheduler: { now: () => 0, requestFrame: () => () => {}, reducedMotion: false, suspended: false },
    target: { render(scene) { scenes.push(scene); }, dispose() {} },
    width: 100, height: 50,
  });
  const image = new GFXImage({ width: 2, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]) });
  const left = renderer.makeLayer();
  const right = renderer.makeLayer();
  left.frame = { x: 0, y: 0, width: 50, height: 50 };
  right.frame = { x: 50, y: 0, width: 50, height: 50 };
  left.contents = image;
  right.contents = image;
  right.contentsRect = { x: 0.5, y: 0, width: 0.5, height: 1 };
  renderer.render();
  expect(scenes[0]?.quads.map(quad => quad.content)).toEqual([image, image]);
  renderer.dispose();
});

it("reuses presentation snapshots already committed to renderer-owned surfaces", () => {
  const scenes: Array<{ quads: readonly { content: unknown }[] }> = [];
  const renderer = new AFXRenderer({
    scheduler: { now: () => 0, requestFrame: () => () => {}, reducedMotion: false, suspended: false },
    target: { render(scene) { scenes.push(scene); }, dispose() {} },
    width: 100, height: 50,
  });
  const image = new GFXImage({
    width: 1, height: 1, alpha: "straight", colourSpace: "srgb",
    data: new Uint8Array([255, 255, 255, 255]),
  });
  const layer = renderer.makeLayer();
  layer.frame = { x: 0, y: 0, width: 100, height: 50 };
  layer.contents = image;

  const presentation = vi.spyOn(AFXLayer.prototype, "presentation", "get");
  const multiply = vi.spyOn(AFXTransform3D.prototype, "multiply");
  renderer.render();
  const presentationReads = presentation.mock.calls.length;
  const initialMultiplyCalls = multiply.mock.calls.length;
  multiply.mockClear();
  renderer.render();
  const retainedMultiplyCalls = multiply.mock.calls.length;
  presentation.mockRestore();
  multiply.mockRestore();

  expect(scenes.at(-1)?.quads[0]?.content).toBe(image);
  expect(presentationReads).toBe(0);
  expect(initialMultiplyCalls).toBeLessThanOrEqual(7);
  expect(retainedMultiplyCalls).toBeLessThan(initialMultiplyCalls);
  renderer.dispose();
});

it("keeps local-transform caching when only layer contents change", () => {
  const renderer = new AFXRenderer({
    scheduler: { now: () => 0, requestFrame: () => () => {}, reducedMotion: false, suspended: false },
    target: { render() {}, dispose() {} },
    width: 100, height: 50,
  });
  const first = new GFXImage({
    width: 1, height: 1, alpha: "straight", colourSpace: "srgb",
    data: new Uint8Array([255, 0, 0, 255]),
  });
  const second = new GFXImage({
    width: 1, height: 1, alpha: "straight", colourSpace: "srgb",
    data: new Uint8Array([0, 0, 255, 255]),
  });
  const layer = renderer.makeLayer();
  layer.frame = { x: 5, y: 7, width: 80, height: 30 };
  layer.transform = AFXTransform3D.rotation(.2, 0, 1, 0);
  layer.contents = first;
  renderer.render();

  const multiply = vi.spyOn(AFXTransform3D.prototype, "multiply");
  renderer.render();
  const stableCalls = multiply.mock.calls.length;
  multiply.mockClear();
  layer.contents = second;
  multiply.mockClear();
  renderer.render();
  const contentsOnlyCalls = multiply.mock.calls.length;
  multiply.mockRestore();

  expect(contentsOnlyCalls).toBeLessThanOrEqual(stableCalls);
  renderer.dispose();
});

it("samples inherited sublayer geometry without recursively constructing ancestor presentations", () => {
  const renderer = new AFXRenderer({
    scheduler: { now: () => 0, requestFrame: () => () => {}, reducedMotion: false, suspended: false },
    target: { render() {}, dispose() {} }, width: 100, height: 50,
  });
  const parent = renderer.makeLayer(renderer.makeLayer());
  parent.bounds = { x: 3, y: 5, width: 100, height: 50 };
  parent.sublayerTransform = AFXTransform3D.translation(7, 11, 2);
  const child = renderer.makeLayer(parent);
  const inherited = child.presentation.inheritedTransform.values;
  const ancestorRead = vi.spyOn(parent, "presentation", "get");
  const snapshot = child.presentation;
  const reads = ancestorRead.mock.calls.length;
  ancestorRead.mockRestore();
  expect(snapshot.inheritedTransform.values).toEqual(inherited);
  expect(snapshot.inheritedTransform.transformPoint({ x: 0, y: 0, z: 0 })).toEqual({ x: 4, y: 6, z: 2 });
  expect(reads).toBe(0);
  renderer.dispose();
});

it("projects replicator colour modulation and an image mask through the retained renderer", () => {
  const scenes: Array<{ quads: readonly {
    colourModulation?: { scale: { r: number; g: number; b: number; a: number } };
    mask?: { content: GFXImage };
  }[] }> = [];
  const renderer = new AFXRenderer({
    scheduler: { now: () => 0, requestFrame: () => () => {}, reducedMotion: false, suspended: false },
    target: { render(scene) { scenes.push(scene); }, dispose() {} },
    width: 100, height: 50,
  });
  const reflection = renderer.makeReplicatorLayer();
  reflection.projectionMode = "projective";
  reflection.instanceCount = 1;
  reflection.instanceColour = GFXColour.rgba(.36, .36, .36, 1);
  const layer = renderer.makeLayer(reflection);
  layer.frame = { x: 0, y: 0, width: 100, height: 50 };
  layer.contents = new GFXImage({
    width: 1, height: 1, alpha: "straight", colourSpace: "srgb",
    data: new Uint8Array([255, 0, 0, 255]),
  });
  const mask = renderer.makeLayer(null);
  const maskImage = new GFXImage({
    width: 1, height: 2, alpha: "straight", colourSpace: "srgb",
    data: new Uint8Array([255, 255, 255, 0, 255, 255, 255, 255]),
  });
  mask.frame = { x: 0, y: 0, width: 100, height: 50 };
  mask.contents = maskImage;
  layer.setMask(mask);
  renderer.render();
  const quad = scenes.at(-1)?.quads[0];
  expect(quad?.colourModulation?.scale).toMatchObject({ r: .36, g: .36, b: .36, a: 1 });
  expect(quad?.mask?.content).toBe(maskImage);
  renderer.dispose();
});

it("hands one canonical frame to all shared crops in a single layer-tree transaction", () => {
  const scenes: Array<{ quads: readonly { content: VFXFrame | GFXImage }[] }> = [];
  const pending: Array<() => void> = [];
  const renderer = new AFXRenderer({
    scheduler: { now: () => 0, requestFrame(callback) { pending.push(() => callback(0)); return () => {}; }, reducedMotion: false, suspended: false },
    target: { render(scene) { scenes.push(scene); }, dispose() {} },
    width: 100, height: 50,
  });
  const layers = [renderer.makeLayer(), renderer.makeLayer()];
  layers.forEach((layer, index) => { layer.frame = { x: index * 50, y: 0, width: 50, height: 50 }; });
  const pixels = new VFXPixelBuffer(new VFXVideoFormat({ codedWidth: 2, codedHeight: 1, pixelFormat: "rgba8", colourSpace: "srgb" }), new Uint8Array(8));
  const first = new VFXFrame({ pixels, timing: new MEFXSampleTimingInfo({ presentationTime: MEFXTime.finite(0n, 30) }) });
  const second = new VFXFrame({ pixels, timing: new MEFXSampleTimingInfo({ presentationTime: MEFXTime.finite(1n, 30) }) });
  pixels.close();
  AFXTransaction.begin();
  layers.forEach((layer) => { layer.contents = first; });
  AFXTransaction.commit();
  renderer.render();
  expect(scenes.at(-1)?.quads.map(({ content }) => content)).toEqual([first, first]);
  AFXTransaction.begin();
  layers[0]!.contents = second;
  layers[1]!.contents = second;
  expect(scenes.at(-1)?.quads[0]?.content).toBe(first);
  AFXTransaction.commit();
  pending.splice(0).forEach((callback) => callback());
  expect(scenes.at(-1)?.quads.map(({ content }) => content)).toEqual([second, second]);
  renderer.dispose(); first.close(); second.close();
});

it("keeps decoded-frame leases with the caller across a failed submission and replacement", () => {
  let clones = 0, closes = 0, fail = false;
  const native = {
    codedWidth: 2, codedHeight: 1,
    clone() { clones++; return { ...this }; },
    close() { closes++; },
  } as unknown as VideoFrame;
  const timing = (index: number) => new MEFXSampleTimingInfo({ presentationTime: MEFXTime.finite(BigInt(index), 30) });
  const first = VFXFrame.fromVideoFrame(native, timing(1));
  const rejected = VFXFrame.fromVideoFrame(native, timing(2));
  const replacement = VFXFrame.fromVideoFrame(native, timing(3));
  expect(clones).toBe(3);
  const scenes: Array<readonly (VFXFrame | GFXImage)[]> = [];
  const renderer = new AFXRenderer({
    scheduler: { now: () => 0, requestFrame: () => () => {}, reducedMotion: false, suspended: false },
    target: { render(scene) { if (fail) throw new Error("GPU preparation failed"); scenes.push(scene.quads.map(quad => quad.content)); }, dispose() {} },
    width: 10, height: 10,
  });
  const layer = renderer.makeLayer();
  layer.frame = { x: 0, y: 0, width: 10, height: 10 };
  layer.contents = first;
  renderer.render();
  expect(scenes.at(-1)).toEqual([first]);
  AFXTransaction.begin();
  layer.contents = rejected;
  layer.contents = replacement;
  AFXTransaction.commit();
  expect(scenes.at(-1)).toEqual([first]);
  rejected.close();
  expect(closes).toBe(1);
  fail = true;
  expect(() => renderer.render()).toThrow(/GPU preparation/);
  expect(scenes.at(-1)).toEqual([first]);
  expect(first.closed).toBe(false);
  expect(replacement.closed).toBe(false);
  fail = false;
  renderer.render();
  expect(scenes.at(-1)).toEqual([replacement]);
  first.close();
  expect(closes).toBe(2);
  renderer.dispose();
  expect(replacement.closed).toBe(false);
  replacement.close();
  expect(closes).toBe(3);
});

it('hands a failed scheduled render to its owner instead of throwing from the frame callback', () => {
  const pending = new Set<(time: number) => void>();
  const failure = new RangeError('budget');
  let failing = true;
  const errors: unknown[] = [];
  const renderer = new AFXRenderer({ width: 10, height: 10,
    scheduler: { now: () => 0, reducedMotion: false, suspended: false,
      requestFrame(callback) { pending.add(callback); return () => pending.delete(callback); } },
    target: { render() { if (failing) throw failure; }, dispose() {} },
    onRenderError: (error) => errors.push(error),
  });
  const layer = renderer.makeLayer();
  const flush = () => { const callbacks = [...pending]; pending.clear(); for (const callback of callbacks) callback(16); };
  layer.frame = { x: 0, y: 0, width: 4, height: 4 };
  expect(flush).not.toThrow();
  expect(errors).toEqual([failure]);
  // The renderer stays live: the owner can change the scene and draw again.
  failing = false;
  layer.opacity = 0.5;
  flush();
  expect(errors).toEqual([failure]);
  expect(renderer.disposed).toBe(false);
  // Direct calls still throw to their caller.
  failing = true;
  expect(() => renderer.render()).toThrow(failure);
  expect(() => new AFXRenderer({ width: 1, height: 1, scheduler: { now: () => 0, reducedMotion: false, suspended: false, requestFrame: () => () => {} },
    target: { render() {}, dispose() {} }, onRenderError: 1 as never })).toThrow(/onRenderError/);
  renderer.dispose();
});
