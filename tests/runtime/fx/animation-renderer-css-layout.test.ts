// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AFXRenderer } from '../../../src/FX/AnimationFX/AFXRenderer';
import { BrowserAFXCanvasRenderer } from '../../../src/SynCloudOS/PlatformAdapters/BrowserAFXCanvasRenderer';
import { createBrowserAnimationLayerHost } from '../../../src/SynCloudOS/PlatformAdapters/BrowserAnimationLayerHost';
import { createMountedAnimationLayers } from '../../../src/SynCloudOS/HostServices/mountedAnimationLayers';

const resources: Array<{ dispose(): void }> = [];
const nodes: Element[] = [];
afterEach(() => { for (const resource of resources.splice(0)) resource.dispose(); for (const node of nodes.splice(0)) node.remove(); vi.restoreAllMocks(); });

function canvasFixture(sizing: 'inline' | 'stylesheet') {
  let lost = true;
  const constants = new Map([['FRAMEBUFFER_COMPLETE', 1], ['TRIANGLES', 2]]);
  const gl = new Proxy({}, {
    get(_target, key) {
      if (typeof key === 'string' && constants.has(key)) return constants.get(key);
      if (typeof key === 'string' && key.startsWith('create')) return () => ({});
      if (key === 'getShaderParameter' || key === 'getProgramParameter') return () => true;
      if (key === 'getAttribLocation') return () => 0;
      if (key === 'getUniformLocation') return () => ({});
      if (key === 'isContextLost') return () => lost;
      if (key === 'getContextAttributes') return () => ({ antialias: false });
      if (key === 'checkFramebufferStatus') return () => constants.get('FRAMEBUFFER_COMPLETE');
      return () => {};
    },
  }) as WebGL2RenderingContext;
  const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 50;
  if (sizing === 'inline') canvas.style.cssText = 'width: 100% !important; height: 50vh';
  else {
    canvas.className = 'responsive-fx-canvas';
    const style = document.createElement('style'); style.textContent = '.responsive-fx-canvas { width: 75%; height: 40vh; }';
    document.head.append(style); nodes.push(style);
  }
  document.body.append(canvas); nodes.push(canvas);
  vi.spyOn(canvas, 'getContext').mockImplementation(((kind: string) => kind === 'webgl2' ? gl : null) as HTMLCanvasElement['getContext']);
  return { canvas, recover() { lost = false; canvas.dispatchEvent(new Event('webglcontextrestored')); },
    lose() { lost = true; canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })); } };
}
const scheduler = { now: () => 0, requestFrame: () => () => {}, reducedMotion: false, suspended: false };

describe('CSS-owned renderer layout', () => {
  it.each(['inline', 'stylesheet'] as const)('preserves %s layout across deferred viewport application and repeated context recovery', sizing => {
    const f = canvasFixture(sizing); const original = f.canvas.getAttribute('style');
    const owner = new AbortController();
    const client = createMountedAnimationLayers(createBrowserAnimationLayerHost(document, scheduler), owner.signal, () => owner.signal.throwIfAborted());
    const renderer = client.createRenderer(f.canvas, { layout: 'css' }); resources.push(renderer);
    const layer = renderer.makeLayer();
    renderer.setViewport({ width: 240, height: 120, pixelRatio: 1.5 });
    expect(f.canvas.width).toBe(100); expect(f.canvas.height).toBe(50);
    f.recover(); renderer.render();
    expect(f.canvas.width).toBe(360); expect(f.canvas.height).toBe(180);
    expect(f.canvas.getAttribute('style')).toBe(original);
    expect(getComputedStyle(f.canvas).width).toBe(sizing === 'inline' ? '100%' : '75%');
    f.lose(); renderer.setViewport({ width: 320, height: 180, pixelRatio: 2 });
    expect(f.canvas.width).toBe(360);
    f.recover(); renderer.render();
    expect(f.canvas.width).toBe(640); expect(f.canvas.height).toBe(360);
    expect(f.canvas.getAttribute('style')).toBe(original); expect(layer.superlayer).toBe(renderer.layer);
    owner.abort(); expect(renderer.disposed).toBe(true);
  });

  it('supports CSS layout on the browser target itself', () => {
    const f = canvasFixture('inline'); const original = f.canvas.getAttribute('style');
    const target = new BrowserAFXCanvasRenderer(f.canvas, { layout: 'css' });
    const renderer = new AFXRenderer({ target, scheduler, width: 100, height: 50 }); resources.push(renderer);
    renderer.setViewport({ width: 80, height: 40, pixelRatio: 2 }); f.recover(); renderer.render();
    expect(f.canvas.width).toBe(160); expect(f.canvas.height).toBe(80);
    expect(f.canvas.getAttribute('style')).toBe(original);
  });
});
