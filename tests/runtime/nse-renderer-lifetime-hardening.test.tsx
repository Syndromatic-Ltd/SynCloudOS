// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NSEViewController, nseAttachView, nseUpdateTraits } from '../../src/NSE/Application/NSEViewController';
import { observable } from '../../src/NSE/Objects/observable';
import { nseUnowned } from '../../src/NSE/Controllers/ownership';
import { outlet, type NSEViewOutlet } from '../../src/NSE/Application/viewOutlet';

class CanvasView extends NSEViewController {
  @outlet accessor canvas!: NSEViewOutlet<HTMLCanvasElement>;
  @observable accessor value = 0;
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function fixture() {
  const view = new CanvasView({ owner: nseUnowned });
  const canvas = document.createElement('canvas');
  let width = 200, height = 100;
  Object.defineProperties(canvas, { clientWidth: { get: () => width }, clientHeight: { get: () => height } });
  const pending = new Set<(time: number) => void>();
  const stateListeners = new Set<() => void>();
  const renderer = { setViewport: vi.fn(), dispose: vi.fn() };
  const createRenderer = vi.fn(() => renderer);
  const frames = {
    now: () => 0, reducedMotion: false, suspended: false,
    requestFrame(callback: (time: number) => void) { pending.add(callback); return () => { pending.delete(callback); }; },
    subscribeState(callback: () => void) { stateListeners.add(callback); return () => { stateListeners.delete(callback); }; },
  };
  view.canvas.ref(canvas);
  view[nseAttachView]({ element: document.createElement('div'), fx: { animation: { client: { createRenderer }, frames } } as any });
  return { view, canvas, renderer, createRenderer, pending, stateListeners, frames,
    size(w: number, h: number) { width = w; height = h; },
    tick() { for (const callback of [...pending]) { pending.delete(callback); callback(1); } },
  };
}

describe('managed renderer acquisition and layout boundaries', () => {
  it('cleans every acquired subscription and observer if observe throws', () => {
    const f = fixture(); const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      observe() { throw new Error('observe failed'); }
      disconnect = disconnect;
    } as any);
    expect(() => f.view.fx.animation.manageRenderer(f.view.canvas)).toThrow('observe failed');
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(f.stateListeners.size).toBe(0);
    expect(f.pending.size).toBe(0);
    f.view.dispose();
  });

  it('requests canonical CSS layout while preserving the authored canvas size', () => {
    const f = fixture(); f.canvas.style.width = '100%'; f.canvas.style.height = '50vh';
    f.view.fx.animation.manageRenderer(f.view.canvas);
    expect(f.createRenderer).toHaveBeenCalledWith(f.canvas, expect.objectContaining({ layout: 'css' }), expect.any(AbortSignal));
    expect(f.canvas.style.width).toBe('100%'); expect(f.canvas.style.height).toBe('50vh');
    f.view.dispose();
  });

  it('seeds a positive backing store before allocation for a zero-initialized canvas', () => {
    const f = fixture(); f.canvas.width = 0; f.canvas.height = 0;
    f.createRenderer.mockImplementation(() => {
      if (!f.canvas.width || !f.canvas.height) throw new Error('zero backing dimensions');
      return f.renderer;
    });
    f.view.fx.animation.manageRenderer(f.view.canvas);
    expect(f.createRenderer).toHaveBeenCalledTimes(1);
    f.view.dispose();
  });

  it('releases a renderer returned after reentrant owner disposal', () => {
    const f = fixture();
    f.createRenderer.mockImplementation(() => { f.view.dispose(); return f.renderer; });
    expect(() => f.view.fx.animation.manageRenderer(f.view.canvas)).toThrow();
    expect(f.renderer.dispose).toHaveBeenCalledTimes(1);
    expect(f.stateListeners.size).toBe(0);
  });

  it('stops callbacks and releases resources after an asynchronous resize failure', () => {
    const f = fixture(); const onRenderError = vi.fn();
    const managed = f.view.fx.animation.manageRenderer(f.view.canvas, { onRenderError });
    const callback = vi.fn(); managed.onFrame(callback, { reducedMotion: 'continue' });
    const failure = new Error('viewport failed'); f.renderer.setViewport.mockImplementation(() => { throw failure; });
    f.size(400, 200); window.dispatchEvent(new Event('resize')); f.tick();
    expect(onRenderError).toHaveBeenCalledOnce();
    expect(managed.getSnapshot().active).toBe(false);
    expect(f.renderer.dispose).toHaveBeenCalledTimes(1);
    expect(f.pending.size).toBe(0);
    f.view.dispose();
  });

  it('releases a frame subscription acquired during reentrant disposal', () => {
    const f = fixture(); const stop = vi.fn();
    f.frames.subscribeState = () => { f.view.dispose(); return stop; };
    expect(() => f.view.fx.animation.manageRenderer(f.view.canvas)).toThrow();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(f.createRenderer).not.toHaveBeenCalled();
  });

  it('delivers a fresh static frame when the controller state changes', () => {
    const f = fixture(); f.view[nseUpdateTraits]({ reducedMotion: true, presentation: null });
    const managed = f.view.fx.animation.manageRenderer(f.view.canvas); const callback = vi.fn();
    managed.onFrame(callback, { reducedMotion: 'static' }); f.tick();
    expect(callback).toHaveBeenCalledTimes(1); expect(f.pending.size).toBe(0);
    f.view.value++; f.tick();
    expect(callback).toHaveBeenCalledTimes(2); expect(f.pending.size).toBe(0);
    f.view.dispose();
  });

  it('batches ResizeObserver feedback and preserves full fractional DPR through zero-size recovery', () => {
    const callbacks: Array<() => void> = []; const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { callbacks.push(callback); }
      observe() {} disconnect = disconnect;
    });
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(1.5);
    const f = fixture(); f.size(0, 0);
    const managed = f.view.fx.animation.manageRenderer(f.view.canvas);
    expect(f.createRenderer).not.toHaveBeenCalled();
    f.size(320, 180); callbacks[0](); callbacks[0](); callbacks[0]();
    expect(f.pending.size).toBe(1); f.tick();
    expect(f.renderer.setViewport).toHaveBeenCalledExactlyOnceWith({ width: 320, height: 180, pixelRatio: 1.5 });
    callbacks[0](); f.tick();
    expect(f.renderer.setViewport).toHaveBeenCalledTimes(1);
    expect(managed.getSnapshot()).toMatchObject({ active: true, pixelRatio: 1.5 });
    f.view.dispose(); expect(disconnect).toHaveBeenCalledTimes(1); expect(f.pending.size).toBe(0);
  });
});
