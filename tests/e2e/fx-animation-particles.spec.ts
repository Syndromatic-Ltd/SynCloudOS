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

test('instanced AFX particles preserve mask, colour, layer order and resized output', async ({ page }) => {
  await page.goto('/tests/fixtures/afx-video-wall-browser.html');
  const result = await page.evaluate(async () => {
    const [{ BrowserAFXCanvasRenderer }, { AFXRenderer, AFXTransform3D }, { GFXImage, GFXColour }] = await Promise.all([
      import('/src/SynCloudOS/PlatformAdapters/BrowserAFXCanvasRenderer.ts'),
      import('/src/FX/AnimationFX/public.ts'), import('/src/FX/GraphicsFX/public.ts'),
    ]);
    const image = new GFXImage({ width: 2, height: 2, colourSpace: 'srgb', alpha: 'straight',
      data: new Uint8Array([255,255,255,255, 240,180,20,255, 50,230,150,180, 180,20,80,70]) });
    const solid = new GFXImage({ width: 1, height: 1, colourSpace: 'srgb', alpha: 'straight', data: new Uint8Array([10,20,40,255]) });
    const maskImage = new GFXImage({ width: 2, height: 2, colourSpace: 'srgb', alpha: 'straight',
      data: new Uint8Array([255,255,255,255,255,255,255,255,255,255,255,180,255,255,255,0]) });
    const renders: number[][][] = [];
    const errors: number[] = [];
    for (const instanced of [false, true]) {
      const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 96;
      const backend = new BrowserAFXCanvasRenderer(canvas);
      const renderer = new AFXRenderer({ width: 96, height: 96, target: {
        supportsParticleBatches: instanced, render: s => backend.render(s), dispose: () => backend.dispose(),
        setViewport: s => backend.setViewport(s),
      }, scheduler: { now: () => 0, requestFrame: () => () => {}, reducedMotion: false, suspended: false } });
      const background = renderer.makeLayer(); background.contents = solid; background.frame = { x: 0, y: 0, width: 120, height: 120 };
      background.allowsEdgeAntialiasing = true;
      const root = renderer.makeReplicatorLayer(); root.transform = AFXTransform3D.translation(45, 45); root.opacity = .8;
      root.instanceColour = GFXColour.rgba(.8,.7,.9,1); root.instanceRedOffset = .1; root.instanceCount = 2;
      root.instanceTransform = AFXTransform3D.translation(15, 10);
      const particles = renderer.makeParticleLayer(root);
      const mask = renderer.makeLayer(null); mask.contents = maskImage; mask.frame = { x: 0,y: 0,width: 2,height: 2 }; particles.setMask(mask);
      particles.setParticles([
        {id:1,contents:image,position:{x:0,y:0},zPosition:1,renderOrder:0,scale:18,rotation:.2,colour:GFXColour.rgba(.8,1,.7,.7)},
        {id:2,contents:solid,position:{x:15,y:6},zPosition:2,renderOrder:1,scale:20,rotation:-.3,colour:GFXColour.rgba(1,.4,.6,.8)},
      ]);
      const foreground = renderer.makeLayer(); foreground.contents = image; foreground.frame = {x:45,y:45,width:14,height:15}; foreground.zPosition = 3;
      const gl = canvas.getContext('webgl2')!;
      const captures: number[][] = [];
      for (const width of [96, 120]) {
        renderer.setViewport({width,height:96,pixelRatio:1}); renderer.render();
        const pixels = new Uint8Array(width*96*4); gl.readPixels(0,0,width,96,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        captures.push([...pixels]); errors.push(gl.getError());
      }
      renders.push(captures); renderer.dispose();
    }
    return { errors, deltas: renders[0].map((pixels, frame) => {
      let bad = 0, max = 0;
      for(let i=0;i<pixels.length;i++) {const delta=Math.abs(pixels[i]-renders[1][frame][i]);if(delta>4)bad++;max=Math.max(max,delta);}
      return {bad,max,total:pixels.length};
    }) };
  });
  expect(result.errors).toEqual([0,0,0,0]);
  for(const frame of result.deltas) expect(frame.bad/frame.total).toBeLessThan(.008);
});
