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

import { expect, test } from 'playwright/test';

test('unfiltered additive groups preserve partial-alpha particle RGB through nesting, opacity and masks', async ({ page }) => {
  await page.goto('/tests/fixtures/afx-shader-browser.html');
  await page.waitForFunction(() => (window as unknown as { __afxShaderReady: boolean }).__afxShaderReady);
  const results = await page.evaluate(async () => {
    const [{ BrowserAFXCanvasRenderer }, { AFXRenderer }, { IFXFilterRegistry }, { GFXImage, GFXColour }] = await Promise.all([
      import('/src/SynCloudOS/PlatformAdapters/BrowserAFXCanvasRenderer.ts'), import('/src/FX/AnimationFX/public.ts'),
      import('/src/FX/ImageFX/public.ts'), import('/src/FX/GraphicsFX/public.ts'),
    ]);
    const results: { instanced: boolean; antialias: boolean; depth: number; pixels: number[][]; normal?: number[]; error: number }[] = [];
    for (const instanced of [false, true]) for (const antialias of [false, true]) for (const depth of [0, 1, 2]) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
      const target = new BrowserAFXCanvasRenderer(canvas);
      const renderer = new AFXRenderer({ width: 32, height: 32, target: { supportsParticleBatches: instanced,
        render: scene => target.render(scene), dispose: () => target.dispose() },
        scheduler: { now: () => 0, requestFrame: () => () => {}, reducedMotion: false, suspended: false } });
      const gl = canvas.getContext('webgl2')!;
      const pixel = () => { const data = new Uint8Array(4); gl.readPixels(16, 16, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, data); return [...data]; };
      const image = (data: number[]) => new GFXImage({ width: 1, height: 1, alpha: 'straight', colourSpace: 'srgb', data: new Uint8Array(data) });
      const addition = new IFXFilterRegistry().create('blend', { mode: 'addition' });
      const background = renderer.makeLayer(); background.frame = { x: 0, y: 0, width: 32, height: 32 }; background.contents = image([26, 0, 0, 255]);
      let parent = renderer.layer, outer: typeof parent | undefined;
      for (let index = 0; index < depth; index++) {
        const group = renderer.makeLayer(parent); group.frame = background.frame; group.compositingFilter = addition;
        group.allowsEdgeAntialiasing = antialias; outer ??= group; parent = group;
      }
      const particles = renderer.makeParticleLayer(parent); particles.compositingFilter = addition;
      particles.setParticles([{ id: 1, contents: image([204, 0, 0, 128]), position: { x: 16, y: 16 }, zPosition: 0,
        renderOrder: 0, scale: 32, rotation: 0, colour: GFXColour.rgba(1, 1, 1, 1) }]);
      const owner = outer ?? particles;
      renderer.render(); const full = pixel();
      owner.opacity = .5; renderer.render(); const opacity = pixel();
      const mask = renderer.makeLayer(null); mask.frame = background.frame; mask.contents = image([255, 255, 255, 128]); owner.setMask(mask);
      renderer.render(); const masked = pixel();
      owner.hidden = true; renderer.render(); const hidden = pixel();
      background.removeFromSuperlayer(); owner.hidden = false; owner.opacity = 1; owner.setMask(null);
      renderer.render(); const transparent = pixel();
      let normal: number[] | undefined;
      if (outer) {
        renderer.layer.insertSublayer(background, 0);
        outer.compositingFilter = new IFXFilterRegistry().create('blend', { mode: 'normal' });
        renderer.render(); normal = pixel();
      }
      results.push({ instanced, antialias, depth, pixels: [full, opacity, masked, hidden, transparent], normal, error: gl.getError() });
      renderer.dispose();
    }
    return results;
  });
  for (const result of results) {
    for (const [index, red] of [128, 77, 52, 26, 102].entries())
      expect(Math.abs(result.pixels[index][0] - red), JSON.stringify(result)).toBeLessThanOrEqual(2);
    expect(result.pixels.slice(0, 4).map(pixel => pixel.slice(1))).toEqual([[0, 0, 255], [0, 0, 255], [0, 0, 255], [0, 0, 255]]);
    // Retain the documented SRC_ALPHA contribution to additive destination alpha.
    expect(Math.abs(result.pixels[4][3] - [64, 16, 1][result.depth])).toBeLessThanOrEqual(2);
    if (result.normal) {
      expect(Math.abs(result.normal[0] - [0, 121, 126][result.depth]), JSON.stringify(result)).toBeLessThanOrEqual(2);
      expect(result.normal.slice(1)).toEqual([0, 0, 255]);
    }
    expect(result.error).toBe(0);
  }
});

test('GPU shaders filter an image and particle subtree in order, preserve straight alpha addition and recover their context', async ({ page }) => {
  await page.goto('/tests/fixtures/afx-shader-browser.html');
  await page.waitForFunction(() => (window as unknown as { __afxShaderReady: boolean }).__afxShaderReady);
  const result = await page.evaluate(async () => {
    const [{ BrowserAFXCanvasRenderer }, { AFXRenderer }, { IFXShader, IFXFilterRegistry }, { GFXImage, GFXColour }] = await Promise.all([
      import('/src/SynCloudOS/PlatformAdapters/BrowserAFXCanvasRenderer.ts'), import('/src/FX/AnimationFX/public.ts'),
      import('/src/FX/ImageFX/public.ts'), import('/src/FX/GraphicsFX/public.ts'),
    ]);
    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
    const target = new BrowserAFXCanvasRenderer(canvas);
    const renderer = new AFXRenderer({ width: 32, height: 32, target,
      scheduler: { now: () => 0, requestFrame: () => () => {}, reducedMotion: false, suspended: false } });
    const gl = canvas.getContext('webgl2')!;
    let textureAllocations = 0, programAllocations = 0;
    const createTexture = gl.createTexture.bind(gl), createProgram = gl.createProgram.bind(gl);
    gl.createTexture = () => { textureAllocations++; return createTexture(); };
    gl.createProgram = () => { programAllocations++; return createProgram(); };
    const pixel = (x = 16, y = 16) => { const data = new Uint8Array(4); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, data); return [...data]; };
    const image = new GFXImage({ width: 1, height: 1, alpha: 'straight', colourSpace: 'srgb', data: new Uint8Array([51, 0, 0, 255]) });
    const background = renderer.makeLayer(); background.frame = { x: 0, y: 0, width: 32, height: 32 }; background.contents = image;
    const group = renderer.makeLayer(); group.frame = background.frame; group.contents = image;
    const particles = renderer.makeParticleLayer(group);
    particles.setParticles([{ id: 1, contents: image, position: { x: 16, y: 16 }, zPosition: 1, renderOrder: 0,
      scale: 16, rotation: 0, colour: GFXColour.rgba(0, 1, 1, 1) }]);
    // Ordered passes: blue receives the image red outside the black particle;
    // red is then supplied by a uniform. Filter output is straight alpha.
    const first = new IFXShader('vec4 ifxMain(vec2 uv, vec2 size) { vec4 p = texture(ifxInput, uv); return vec4(0.0, p.r, 0.0, 1.0); }');
    const second = new IFXShader('vec4 ifxMain(vec2 uv, vec2 size) { vec4 p = texture(ifxInput, uv); return vec4(gain, 0.0, p.g, 0.5); }', { gain: { type: 'float', value: .4 } });
    group.filters = [first, second]; group.compositingFilter = new IFXFilterRegistry().create('blend', { mode: 'addition' });
    renderer.render(); const center = pixel(), outside = pixel(2, 2); const error = gl.getError();
    const firstAllocations = [textureAllocations, programAllocations];
    group.filters = [first, second.withUniforms({ gain: .6 })]; renderer.render(); const updated = pixel();
    const readPixels = gl.readPixels;
    gl.readPixels = () => { throw new Error('Unexpected per-frame GPU readback.'); };
    for (let frame = 0; frame < 30; frame++) {
      group.filters = [first, second.withUniforms({ gain: .6 })]; renderer.render();
    }
    gl.readPixels = readPixels;
    const repeatedAllocations = [textureAllocations, programAllocations];
    const generator = renderer.makeLayer(); generator.frame = { x: 0, y: 0, width: 4, height: 4 };
    generator.contents = new IFXShader('vec4 ifxMain(vec2 uv, vec2 size) { return vec4(0.0, 0.8, 0.0, 0.5); }');
    renderer.render(); const generated = pixel(1, 30);
    // Compilation failure must not publish or poison a future valid frame.
    group.filters = [new IFXShader('vec4 ifxMain(vec2 uv, vec2 size) { return missingSymbol; }')];
    let failed = false; try { renderer.render(); } catch { failed = true; }
    group.filters = [first, second]; renderer.render(); const repaired = pixel();
    const extension = gl.getExtension('WEBGL_lose_context')!;
    const lost = new Promise<void>(resolve => canvas.addEventListener('webglcontextlost', () => resolve(), { once: true }));
    extension.loseContext(); await lost;
    // Restoration becomes allowed after the lost-event dispatch has completed.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    const lostResidency = [...target.measureResidency()].length;
    const restored = new Promise<void>(resolve => canvas.addEventListener('webglcontextrestored', () => resolve(), { once: true }));
    extension.restoreContext(); await restored; renderer.render(); const recovered = pixel();
    group.filters = []; group.removeFromSuperlayer(); generator.removeFromSuperlayer(); renderer.render();
    const residue = [...target.measureResidency()].filter(x => typeof x.key === 'string' && x.key.startsWith('ifx')).length;
    renderer.dispose();
    return { center, outside, updated, generated, error, failed, repaired, lostResidency, recovered, residue, firstAllocations, repeatedAllocations,
      disposedResidency: [...target.measureResidency()].length };
  });
  const close = (actual: number[], expected: number[]) => actual.forEach((value, i) => expect(Math.abs(value - expected[i])).toBeLessThanOrEqual(2));
  close(result.center, [102, 0, 0, 255]);
  close(result.outside, [102, 0, 26, 255]);
  close(result.updated, [128, 0, 0, 255]);
  close(result.generated, [64, 102, 13, 255]);
  expect(result.repeatedAllocations).toEqual(result.firstAllocations);
  expect(result.error).toBe(0); expect(result.failed).toBe(true);
  close(result.repaired, result.center); close(result.recovered, result.center);
  expect(result.lostResidency).toBe(0); expect(result.residue).toBe(0); expect(result.disposedResidency).toBe(0);
});

test('identity filtering preserves antialiased child geometry inside an offscreen subtree', async ({ page }) => {
  await page.goto('/tests/fixtures/afx-shader-browser.html');
  await page.waitForFunction(() => (window as unknown as { __afxShaderReady: boolean }).__afxShaderReady);
  const delta = await page.evaluate(async () => {
    const [{ BrowserAFXCanvasRenderer }, { AFXRenderer, AFXTransform3D }, { IFXShader }, { GFXImage }] = await Promise.all([
      import('/src/SynCloudOS/PlatformAdapters/BrowserAFXCanvasRenderer.ts'), import('/src/FX/AnimationFX/public.ts'),
      import('/src/FX/ImageFX/public.ts'), import('/src/FX/GraphicsFX/public.ts'),
    ]);
    const captures: Uint8Array[] = [];
    for (const filtered of [false, true]) {
      const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
      const target = new BrowserAFXCanvasRenderer(canvas);
      const renderer = new AFXRenderer({ width: 32, height: 32, target,
        scheduler: { now: () => 0, requestFrame: () => () => {}, reducedMotion: false, suspended: false } });
      const group = renderer.makeLayer(); group.frame = { x: 0, y: 0, width: 32, height: 32 };
      if (filtered) group.filters = [new IFXShader('vec4 ifxMain(vec2 uv, vec2 size) { vec4 p = texture(ifxInput, uv); return vec4(p.a > 0.0 ? p.rgb / p.a : vec3(0.0), p.a); }')];
      const child = renderer.makeLayer(group); child.frame = { x: 6, y: 6, width: 20, height: 20 };
      child.contents = new GFXImage({ width: 1, height: 1, alpha: 'straight', colourSpace: 'srgb', data: new Uint8Array([255, 255, 255, 255]) });
      child.allowsEdgeAntialiasing = true; child.transform = AFXTransform3D.rotation(.3, 0, 0, 1);
      renderer.render(); const pixels = new Uint8Array(32 * 32 * 4);
      const gl = canvas.getContext('webgl2')!; gl.readPixels(0, 0, 32, 32, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      captures.push(pixels); renderer.dispose();
    }
    return Math.max(...captures[0].map((value, index) => Math.abs(value - captures[1][index])));
  });
  expect(delta).toBeLessThanOrEqual(2);
});

test('additive particle RGB survives filtering independently of accumulated alpha and respects opacity, mask and hidden flags', async ({ page }) => {
  await page.goto('/tests/fixtures/afx-shader-browser.html');
  await page.waitForFunction(() => (window as unknown as { __afxShaderReady: boolean }).__afxShaderReady);
  const results = await page.evaluate(async () => {
    const [{ BrowserAFXCanvasRenderer }, { AFXRenderer }, { IFXShader, IFXFilterRegistry }, { GFXImage, GFXColour }] = await Promise.all([
      import('/src/SynCloudOS/PlatformAdapters/BrowserAFXCanvasRenderer.ts'), import('/src/FX/AnimationFX/public.ts'),
      import('/src/FX/ImageFX/public.ts'), import('/src/FX/GraphicsFX/public.ts'),
    ]);
    const results: number[][][] = [];
    for (const instanced of [false, true]) {
      const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
      const target = new BrowserAFXCanvasRenderer(canvas);
      const renderer = new AFXRenderer({ width: 32, height: 32, target: { supportsParticleBatches: instanced,
        render: scene => target.render(scene), dispose: () => target.dispose() },
        scheduler: { now: () => 0, requestFrame: () => () => {}, reducedMotion: false, suspended: false } });
      const gl = canvas.getContext('webgl2')!;
      const pixel = () => { const data = new Uint8Array(4); gl.readPixels(16, 16, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, data); return [...data]; };
      const image = (data: number[]) => new GFXImage({ width: 1, height: 1, alpha: 'straight', colourSpace: 'srgb', data: new Uint8Array(data) });
      const addition = new IFXFilterRegistry().create('blend', { mode: 'addition' });
      const background = renderer.makeLayer(); background.frame = { x: 0, y: 0, width: 32, height: 32 }; background.contents = image([26, 0, 0, 255]);
      const group = renderer.makeLayer(); group.frame = background.frame;
      group.filters = [new IFXShader('vec4 ifxMain(vec2 uv, vec2 size) { return vec4(texture(ifxInput, uv).rgb, 0.5); }')];
      group.compositingFilter = addition;
      const particles = renderer.makeParticleLayer(group); particles.compositingFilter = addition;
      const cloud = image([204, 0, 0, 128]);
      particles.setParticles([1, 2].map(id => ({ id, contents: cloud, position: { x: 16, y: 16 }, zPosition: 0,
        renderOrder: id, scale: 32, rotation: 0, colour: GFXColour.rgba(1, 1, 1, 1) })));
      renderer.render(); const full = pixel();
      group.opacity = .5; renderer.render(); const opacity = pixel();
      const mask = renderer.makeLayer(null); mask.frame = background.frame; mask.contents = image([255, 255, 255, 128]); group.setMask(mask);
      renderer.render(); const masked = pixel();
      group.hidden = true; renderer.render(); const hidden = pixel();
      background.removeFromSuperlayer(); group.hidden = false; group.opacity = 1; group.setMask(null);
      renderer.render(); const transparent = pixel();
      results.push([full, opacity, masked, hidden, transparent]); renderer.dispose();
    }
    return results;
  });
  for (const result of results) {
    for (const [index, red] of [128, 77, 52, 26].entries()) expect(Math.abs(result[index][0] - red)).toBeLessThanOrEqual(2);
    expect(result.slice(0, 4).map(pixel => pixel.slice(1))).toEqual([[0, 0, 255], [0, 0, 255], [0, 0, 255], [0, 0, 255]]);
    expect(Math.abs(result[4][0] - 102)).toBeLessThanOrEqual(2);
    expect(Math.abs(result[4][3] - 64)).toBeLessThanOrEqual(2);
  }
});
