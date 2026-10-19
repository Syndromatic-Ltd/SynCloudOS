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
import { expect, it, vi } from 'vitest';
import * as imageFX from '../../../src/FX/ImageFX/public';
import { AFXRenderer, AFXTransform3D } from '../../../src/FX/AnimationFX/public';
import { AFXCompositionSnapshot } from '../../../src/FX/AnimationFX/AFXCompositionSnapshot';
import { GFXImage, GFXColour } from '../../../src/FX/GraphicsFX/public';
import type { AFXRendererScene } from '../../../src/FX/AnimationFX/AFXRenderer';
import { BrowserAFXCanvasRenderer } from '../../../src/SynCloudOS/PlatformAdapters/BrowserAFXCanvasRenderer';

const scheduler = { now: () => 0, reducedMotion: false, suspended: false, requestFrame: () => () => {} };
const source = 'vec4 ifxMain(vec2 uv, vec2 size) { return vec4(tint, phase); }';

it('exports a bounded immutable shader descriptor and replaces only declared uniform values', () => {
  expect(typeof imageFX.IFXShader).toBe('function');
  const tint = [.1, .2, .3];
  const shader = new imageFX.IFXShader(source, { tint: { type: 'vec3', value: tint }, phase: { type: 'float', value: .5 } });
  tint[0] = 1;
  expect(shader.uniforms.tint.value).toEqual([.1, .2, .3]);
  expect(Object.isFrozen(shader)).toBe(true);
  expect(Object.isFrozen(shader.uniforms.tint.value)).toBe(true);
  const next = shader.withUniforms({ phase: .75 });
  expect(next.source).toBe(source);
  expect(next.uniforms.phase).toEqual({ type: 'float', value: .75 });
  expect(shader.uniforms.phase.value).toBe(.5);
  expect(() => shader.withUniforms({ unknown: 1 })).toThrow(/uniform/i);
  expect(() => shader.withUniforms({ tint: [1, 2] })).toThrow();
  expect(() => shader.withUniforms({ tint: new Array(3) })).toThrow();
  expect(() => shader.withUniforms({ phase: Infinity })).toThrow();
  expect(() => new imageFX.IFXShader(source, { ifxInput: { type: 'float', value: 1 } })).toThrow(/reserved/i);
  expect(() => new imageFX.IFXShader('x'.repeat(65537))).toThrow(/source/i);
  expect(() => new imageFX.IFXShader(source, Object.fromEntries(Array.from({ length: 65 }, (_, i) => ['u' + i, { type: 'float', value: 0 }])))).toThrow(/uniform/i);
});

it('retains image content, particles and nested filters in subtree order with group opacity applied once', () => {
  const scenes: AFXRendererScene[] = [];
  const renderer = new AFXRenderer({ scheduler, width: 100, height: 80,
    target: { supportsParticleBatches: true, render(s) { scenes.push(s); }, dispose() {} } });
  const image = new GFXImage({ width: 1, height: 1, alpha: 'straight', colourSpace: 'srgb', data: new Uint8Array([255, 0, 0, 255]) });
  const before = renderer.makeLayer(); before.frame = { x: 0, y: 0, width: 10, height: 10 }; before.contents = image;
  const group = renderer.makeLayer(); group.frame = { x: 20, y: 10, width: 40, height: 30 }; group.contents = image; group.opacity = .5;
  const filters = [new imageFX.IFXShader('vec4 ifxMain(vec2 uv, vec2 size) { return texture(ifxInput, uv); }')];
  group.filters = filters; filters.length = 0;
  expect(() => { group.filters = new Array(1); }).toThrow();
  group.compositingFilter = new imageFX.IFXFilterRegistry().create('blend', { mode: 'addition' });
  const particles = renderer.makeParticleLayer(group);
  particles.setParticles([{ id: 1, contents: image, position: { x: 10, y: 10 }, zPosition: 0, renderOrder: 0, scale: 1, rotation: 0,
    colour: GFXColour.rgba(1, 1, 1, 1) }]);
  const nested = renderer.makeLayer(group); nested.frame = { x: 2, y: 3, width: 5, height: 6 }; nested.contents = image; nested.filters = group.filters;
  const after = renderer.makeLayer(); after.frame = before.frame; after.contents = image;
  renderer.render();
  const scene = scenes.at(-1)!;
  expect(scene.quads.map(q => q.layer)).toEqual([before, group, after]);
  const q = scene.quads[1];
  expect(q.opacity).toBe(.5);
  expect(q.compositingFilter?.parameters.mode).toBe('addition');
  expect(q.group?.filters).toHaveLength(1);
  expect(q.group?.scene.quads.map(q => q.layer)).toEqual([group, nested]);
  expect(q.group?.scene.quads[0].opacity).toBe(1);
  expect(q.group?.scene.particleBatches?.[0].beforeQuad).toBe(1);
  expect(q.group?.scene.particleBatches?.[0].opacity).toBe(1);
  expect(q.group?.scene.quads[1].group?.scene.quads[0].layer).toBe(nested);
  expect(() => { group.compositingFilter = new imageFX.IFXFilterRegistry().create('blend', { mode: 'multiply' }); }).toThrow(/unsupported/i);
  expect(group.compositingFilter?.parameters.mode).toBe('addition');
  renderer.dispose();
  expect(() => { group.filters = []; }).toThrow(expect.objectContaining({ code: "AFX_LAYER_DISPOSED" }));
  expect(() => { group.compositingFilter = null; }).toThrow(expect.objectContaining({ code: "AFX_LAYER_DISPOSED" }));
});

it.each(['filter', 'addition'] as const)('preserves descendant picking through nested %s groups and their projected bounds', mode => {
  const renderer = new AFXRenderer({ scheduler, width: 100, height: 100, target: { render() {}, dispose() {} } });
  const image = new GFXImage({ width: 1, height: 1, alpha: 'straight', colourSpace: 'srgb', data: new Uint8Array([255, 0, 0, 255]) });
  const group = renderer.makeLayer(); group.frame = { x: 20, y: 20, width: 60, height: 60 };
  const child = renderer.makeLayer(group); child.frame = { x: 10, y: 10, width: 20, height: 20 }; child.contents = image;
  const nested = renderer.makeLayer(group); nested.frame = { x: 30, y: 30, width: 20, height: 20 };
  const deeper = renderer.makeLayer(nested); deeper.frame = { x: 2, y: 2, width: 10, height: 10 }; deeper.contents = image;
  renderer.setPickable(child, true); renderer.setPickable(deeper, true);
  renderer.render();
  expect(renderer.hitTest({ x: 35, y: 35 })).toBe(child);
  expect(renderer.hitTest({ x: 55, y: 55 })).toBe(deeper);
  const identity = new imageFX.IFXShader('vec4 ifxMain(vec2 uv, vec2 size) { vec4 p = texture(ifxInput, uv); return vec4(p.a > 0.0 ? p.rgb / p.a : vec3(0.0), p.a); }');
  for (const layer of [group, nested]) {
    if (mode === 'filter') layer.filters = [identity];
    else layer.compositingFilter = new imageFX.IFXFilterRegistry().create('blend', { mode: 'addition' });
  }
  renderer.render();
  expect(renderer.hitTest({ x: 35, y: 35 })).toBe(child);
  expect(renderer.hitTest({ x: 55, y: 55 })).toBe(deeper);
  group.transform = AFXTransform3D.scale(2); renderer.render();
  expect(renderer.hitTest({ x: 20, y: 20 })).toBe(child);
  expect(renderer.hitTest({ x: 60, y: 60 })).toBe(deeper);
  group.opacity = 0; renderer.render(); expect(renderer.hitTest({ x: 20, y: 20 })).toBeNull();
  renderer.dispose();
});

it('clips filtered descendant picks and keeps accepted painter/depth order', () => {
  const renderer = new AFXRenderer({ scheduler, width: 100, height: 100, target: { render() {}, dispose() {} } });
  const image = new GFXImage({ width: 1, height: 1, alpha: 'straight', colourSpace: 'srgb', data: new Uint8Array([255, 0, 0, 255]) });
  const group = renderer.makeLayer(); group.frame = { x: 20, y: 20, width: 40, height: 40 }; group.bounds = { x: 5, y: 5, width: 40, height: 40 };
  group.filters = [new imageFX.IFXShader('vec4 ifxMain(vec2 uv, vec2 size) { return texture(ifxInput, uv); }')];
  const front = renderer.makeLayer(group); front.frame = { x: -5, y: -5, width: 40, height: 40 }; front.contents = image; front.zPosition = 2;
  const back = renderer.makeLayer(group); back.frame = front.frame; back.contents = image; back.zPosition = 1;
  renderer.setPickable(front, true); renderer.setPickable(back, true); renderer.render();
  expect(renderer.hitTest({ x: 25, y: 25 })).toBe(front);
  expect(renderer.hitTest({ x: 15, y: 15 })).toBeNull();
  front.hidden = true; renderer.render(); expect(renderer.hitTest({ x: 25, y: 25 })).toBe(back);
  back.opacity = .5;
  const last = renderer.makeLayer(group); last.frame = back.frame; last.contents = image; last.opacity = .5; last.zPosition = 0;
  renderer.setPickable(last, true); renderer.render(); expect(renderer.hitTest({ x: 25, y: 25 })).toBe(last);
  renderer.dispose();
});

function gpuFixture(signal?: AbortSignal) {
  let id = 0;
  const live = new Map<object, string>();
  const calls = new Map<string, number>();
  const sources = new Map<object, string>();
  let failCompile = false;
  const constants = new Map(['FRAMEBUFFER_COMPLETE', 'TRIANGLES', 'MAX_TEXTURE_SIZE'].map((name, index) => [name, index + 1]));
  const gl = new Proxy({}, { get(_target, property) {
    const name = String(property);
    if (constants.has(name)) return constants.get(name);
    if (name.startsWith('create')) return () => { const handle = { id: ++id }; live.set(handle, name.slice(6)); calls.set(name, (calls.get(name) ?? 0) + 1); return handle; };
    if (name.startsWith('delete')) return (handle: object) => live.delete(handle);
    if (name === 'shaderSource') return (handle: object, source: string) => sources.set(handle, source);
    if (name === 'getShaderParameter') return (handle: object) => !failCompile || !sources.get(handle)?.includes('badShader');
    if (name === 'getProgramParameter') return () => true;
    if (name === 'getAttribLocation') return () => 0;
    if (name === 'getUniformLocation') return () => ({});
    if (name === 'getParameter') return () => 16384;
    if (name === 'isContextLost') return () => false;
    if (name === 'getContextAttributes') return () => ({ antialias: false });
    if (name === 'checkFramebufferStatus') return () => constants.get('FRAMEBUFFER_COMPLETE');
    if (name === 'readPixels') return () => { throw new Error('Per-frame readback'); };
    return () => {};
  } }) as WebGL2RenderingContext;
  const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 16;
  vi.spyOn(canvas, 'getContext').mockImplementation(((kind: string) => kind === 'webgl2' ? gl : null) as HTMLCanvasElement['getContext']);
  const target = new BrowserAFXCanvasRenderer(canvas);
  const renderer = new AFXRenderer({ scheduler, target, width: 16, height: 16, signal });
  return { renderer, target, live, calls, setCompileFailure(value: boolean) { failCompile = value; } };
}

it('reuses shader programs and pass storage, bounds live surfaces and deletes all handles on abort', () => {
  const owner = new AbortController();
  const { renderer, target, live, calls } = gpuFixture(owner.signal);
  const layer = renderer.makeLayer(); layer.frame = { x: 0, y: 0, width: 16, height: 16 };
  const shader = new imageFX.IFXShader('vec4 ifxMain(vec2 uv, vec2 size) { return vec4(value); }', { value: { type: 'float', value: 1 } });
  layer.contents = shader; renderer.render();
  const allocations = [...calls.entries()];
  for (let frame = 0; frame < 30; frame++) { layer.contents = shader.withUniforms({ value: frame / 30 }); renderer.render(); }
  expect([...calls.entries()]).toEqual(allocations);
  expect([...target.measureResidency()].filter(x => typeof x.key === 'string' && x.key.startsWith('ifx-program:'))).toHaveLength(1);
  layer.bounds = { x: 0, y: 0, width: 16385, height: 1 };
  expect(() => renderer.render()).toThrow(/16384 pixels per axis/);
  // A full 6K canvas fits: an isolated subtree plus its filter pass.
  layer.bounds = { x: 0, y: 0, width: 6144, height: 3456 };
  layer.filters = [shader];
  renderer.render();
  layer.filters = [];
  layer.bounds = { x: 0, y: 0, width: 16384, height: 8192 };
  layer.filters = [shader, shader];
  expect(() => renderer.render()).toThrow(/1024 MiB per frame/);
  layer.filters = [];
  layer.bounds = { x: 0, y: 0, width: 16, height: 16 };
  renderer.render();
  layer.contents = null; renderer.render();
  expect([...target.measureResidency()].filter(x => typeof x.key === 'string' && x.key.startsWith('ifx'))).toHaveLength(0);
  owner.abort(); expect(renderer.disposed).toBe(true); expect(live.size).toBe(0); expect([...target.measureResidency()]).toEqual([]);
});

it('cleans failed shader compilations and enforces the aggregate program and surface quotas', () => {
  const { renderer, target, live, setCompileFailure } = gpuFixture();
  const layer = renderer.makeLayer(); layer.frame = { x: 0, y: 0, width: 16, height: 16 };
  const valid = new imageFX.IFXShader('vec4 ifxMain(vec2 uv, vec2 size) { return vec4(1.0); }');
  layer.contents = valid; renderer.render();
  setCompileFailure(true); layer.contents = new imageFX.IFXShader('vec4 ifxMain(vec2 uv, vec2 size) { return badShader; }');
  expect(() => renderer.render()).toThrow(/compile/);
  expect([...live.values()].filter(type => type === 'Shader')).toHaveLength(0);
  setCompileFailure(false); layer.contents = valid; renderer.render();
  for (let index = 0; index < 65; index++) {
    const child = renderer.makeLayer(); child.frame = layer.frame;
    child.contents = new imageFX.IFXShader(`vec4 ifxMain(vec2 uv, vec2 size) { return vec4(${index}.0); }`);
  }
  expect(() => renderer.render()).toThrow(/program budget/);
  for (const child of [...renderer.layer.sublayers]) if (child !== layer) child.removeFromSuperlayer();
  layer.contents = null;
  for (let index = 0; index < 15; index++) {
    const child = renderer.makeLayer(); child.frame = layer.frame; child.filters = Array(8).fill(valid);
  }
  expect(() => renderer.render()).toThrow(/surface budget/);
  expect([...target.measureResidency()].filter(x => typeof x.key === 'string' && x.key.startsWith('ifx-surface:'))).toHaveLength(0);
  renderer.dispose(); expect(live.size).toBe(0);
});

it('declares CPU composition capture unsupported for shader content and filtered subtrees', () => {
  const renderer = new AFXRenderer({ scheduler, width: 10, height: 10, target: { render() {}, dispose() {} } });
  const layer = renderer.makeLayer(); layer.frame = { x: 0, y: 0, width: 10, height: 10 };
  const shader = new imageFX.IFXShader('vec4 ifxMain(vec2 uv, vec2 size) { return vec4(1.0); }');
  layer.contents = shader;
  expect(AFXCompositionSnapshot.capture(layer, { bounds: layer.bounds, scale: 1, time: 0 }).capability.state).toBe('unsupported');
  layer.contents = null; layer.filters = [shader];
  expect(AFXCompositionSnapshot.capture(layer, { bounds: layer.bounds, scale: 1, time: 0 }).capability.state).toBe('unsupported');
  layer.filters = []; layer.compositingFilter = new imageFX.IFXFilterRegistry().create('blend', { mode: 'addition' });
  expect(AFXCompositionSnapshot.capture(layer, { bounds: layer.bounds, scale: 1, time: 0 }).capability.state).toBe('unsupported');
  renderer.dispose();
});

it('rejects filtered subtrees in Canvas2D before changing the visible canvas', () => {
  const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 80;
  const drawImage = vi.fn();
  vi.spyOn(canvas, 'getContext').mockImplementation(((kind: string) => kind === '2d' ? { drawImage } : null) as HTMLCanvasElement['getContext']);
  const target = new BrowserAFXCanvasRenderer(canvas);
  const renderer = new AFXRenderer({ scheduler, target, width: 100, height: 80 });
  const layer = renderer.makeLayer(); layer.frame = { x: 0, y: 0, width: 100, height: 80 };
  layer.filters = [new imageFX.IFXShader('vec4 ifxMain(vec2 uv, vec2 size) { return vec4(1.0); }')];
  expect(() => renderer.render()).toThrow(/WebGL2/);
  expect(drawImage).not.toHaveBeenCalled();
  renderer.dispose();
});
