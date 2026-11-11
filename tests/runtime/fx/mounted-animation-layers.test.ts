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
import { createMountedAnimationLayers } from "../../../src/SynCloudOS/HostServices/mountedAnimationLayers";
import { createBrowserAnimationLayerHost } from "../../../src/SynCloudOS/PlatformAdapters/BrowserAnimationLayerHost";
import { AFXShapeLayer } from "../../../src/FX/AnimationFX/AFXShapeLayer";
import { AFXEmitterLayer } from "../../../src/FX/AnimationFX/AFXEmitterLayer";
import { AFXEmitterCell } from "../../../src/FX/AnimationFX/AFXEmitterCell";
import { AFXTiledLayer } from "../../../src/FX/AnimationFX/AFXTiledLayer";
import { GFXPath } from "../../../src/FX/GraphicsFX/GFXPath";
import { GFXImage } from "../../../src/FX/GraphicsFX/GFXImage";

const emitterPixel = new GFXImage({
  width: 1,
  height: 1,
  alpha: "straight",
  colourSpace: "srgb",
  data: new Uint8Array([255, 255, 255, 255]),
});

it("keeps explicit bindLayer frame ownership and restores authored CSS when released", () => {
  const host = createBrowserAnimationLayerHost(document, { now: () => 0, requestFrame: () => () => {}, reducedMotion: true, suspended: false });
  const owner = new AbortController();
  const client = createMountedAnimationLayers(host, owner.signal, () => owner.signal.throwIfAborted());
  const element = document.createElement("div");
  element.style.cssText = "position: relative; width: 320px; height: 150px";
  const original = element.getAttribute("style");
  const layer = client.bindLayer(element);
  layer.frame = { x: 20, y: 30, width: 80, height: 60 };
  expect(element.style.position).toBe("absolute");
  expect(element.style.left).toBe("0px");
  expect(element.style.top).toBe("0px");
  expect(element.style.width).toBe("80px");
  expect(element.style.height).toBe("60px");
  owner.abort();
  expect(element.getAttribute("style")).toBe(original);
});

it("binds one video-wall canvas through mounted AnimationFX authority and releases it on abort", () => {
  const host = createBrowserAnimationLayerHost(document, { now: () => 0, requestFrame: () => () => {}, reducedMotion: false, suspended: false });
  const owner = new AbortController();
  const client = createMountedAnimationLayers(host, owner.signal, () => owner.signal.throwIfAborted());
  const canvas = document.createElement("canvas");
  canvas.width = 200; canvas.height = 100;
  vi.spyOn(canvas, "getContext").mockImplementation(((kind: string) => kind === "2d"
    ? { clearRect() {}, save() {}, restore() {}, setTransform() {}, drawImage() {} }
    : null) as HTMLCanvasElement["getContext"]);
  const wall = client.createRenderer(canvas);
  expect(wall.layer.frame).toEqual({ x: 0, y: 0, width: 200, height: 100 });
  wall.makeLayer();
  owner.abort();
  expect(wall.disposed).toBe(true);
  expect(() => wall.render()).toThrow(/disposed/i);
  const next = new AbortController();
  const replacement = createMountedAnimationLayers(host, next.signal, () => {}).createRenderer(canvas);
  replacement.dispose();
});

it("rolls back if a custom element revokes its owner during constructor style writes", () => {
  const host = createBrowserAnimationLayerHost(document, { now: () => 0, requestFrame: () => () => {}, reducedMotion: true, suspended: false });
  const owner = new AbortController();
  class RevokingElement extends HTMLElement {
    static observedAttributes = ["style"];
    attributeChangedCallback() { owner.abort(); }
  }
  customElements.define("fx-revoking-layer", RevokingElement);
  const element = document.createElement("fx-revoking-layer");
  const client = createMountedAnimationLayers(host, owner.signal, () => owner.signal.throwIfAborted());
  expect(() => client.bindLayer(element)).toThrow();
  expect(owner.signal.aborted).toBe(true);
  expect(element.getAttribute("style")).toBeNull();
  const next = new AbortController();
  const replacement = createMountedAnimationLayers(host, next.signal, () => {}).bindLayer(element);
  replacement.dispose();
});

it("binds actual shape content and restores the element when its mount is revoked", () => {
  const host = createBrowserAnimationLayerHost(document, { now: () => 0, requestFrame: () => () => {}, reducedMotion: true, suspended: false });
  const owner = new AbortController();
  const client = createMountedAnimationLayers(host, owner.signal, () => owner.signal.throwIfAborted());
  const element = document.createElement("div");
  element.style.color = "red";
  const initialStyle = element.getAttribute("style");
  const layer = client.bindShapeLayer(element);
  expect(layer).toBeInstanceOf(AFXShapeLayer);
  layer.bounds = { x: 0, y: 0, width: 60, height: 40 };
  layer.path = GFXPath.rect({ x: 2, y: 2, width: 20, height: 20 });
  expect(element.querySelector("svg path")).not.toBeNull();
  expect(() => client.bindLayer(element)).toThrow(/already/);
  owner.abort();
  expect(element.getAttribute("style")).toBe(initialStyle);
  expect(element.querySelector("svg")).toBeNull();
  expect(() => client.bindLayer(element)).toThrow();
  const nextOwner = new AbortController();
  const replacement = createMountedAnimationLayers(host, nextOwner.signal, () => {}).bindGradientLayer(element);
  replacement.dispose();
});

it("binds an emitter layer through the mounted client and releases it with its owner", () => {
  const host = createBrowserAnimationLayerHost(document, { now: () => 0, requestFrame: () => () => {}, reducedMotion: true, suspended: false });
  const owner = new AbortController();
  const client = createMountedAnimationLayers(host, owner.signal, () => owner.signal.throwIfAborted());
  const element = document.createElement("div");
  const layer = client.bindEmitterLayer(element);
  expect(layer).toBeInstanceOf(AFXEmitterLayer);
  layer.frame = { x: 0, y: 0, width: 60, height: 40 };
  layer.emitterCells = [new AFXEmitterCell({ contents: emitterPixel, birthRate: 2, lifetime: 1 })];
  layer.startEmitting();
  expect(layer.isEmitting).toBe(true);
  expect(layer.presentation.content).toMatchObject({ kind: "emitter", particles: [] });
  owner.abort();
  expect(element.querySelector("svg")).toBeNull();
  expect(() => layer.stopEmitting()).toThrow(expect.objectContaining({ code: "AFX_EMITTER_LAYER_DISPOSED" }));
  const nextOwner = new AbortController();
  const replacement = createMountedAnimationLayers(host, nextOwner.signal, () => {}).bindEmitterLayer(element);
  replacement.dispose();
});

it("binds a tiled layer, renders a scoped tile, and releases it with its owner", async () => {
  const host = createBrowserAnimationLayerHost(document, {
    now: () => 0,
    requestFrame: (callback) => { queueMicrotask(() => callback(0)); return () => {}; },
    reducedMotion: true,
    suspended: false,
  });
  const owner = new AbortController();
  const client = createMountedAnimationLayers(host, owner.signal, () => owner.signal.throwIfAborted());
  const element = document.createElement("div");
  const layer = client.bindTiledLayer(element);
  expect(layer).toBeInstanceOf(AFXTiledLayer);
  layer.frame = { x: 0, y: 0, width: 10, height: 10 };
  layer.tileSize = { width: 10, height: 10 };
  layer.drawTile = (request) => new GFXImage({
    width: request.pixelWidth,
    height: request.pixelHeight,
    alpha: "straight",
    colourSpace: "srgb",
    data: new Uint8Array(request.pixelWidth * request.pixelHeight * 4).fill(255),
  });
  layer.setVisibleRect({ x: 0, y: 0, width: 10, height: 10 });
  await layer.waitForIdle();
  expect(layer.presentation.content).toMatchObject({ kind: "tiled", tiles: [{ key: "0:0:0" }] });
  expect(element.querySelector('svg[data-afx-content="tiled"] image')).not.toBeNull();
  owner.abort();
  expect(element.querySelector("svg")).toBeNull();
  expect(() => layer.invalidate()).toThrow(expect.objectContaining({ code: "AFX_TILED_LAYER_DISPOSED" }));
  const nextOwner = new AbortController();
  const replacement = createMountedAnimationLayers(host, nextOwner.signal, () => {}).bindTiledLayer(element);
  replacement.dispose();
});
