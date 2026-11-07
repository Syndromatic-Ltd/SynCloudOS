// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { AFXAnimation, AFXBasicAnimation } from '../../../src/FX/AnimationFX/public';
import { createAFXLayer } from '../../../src/FX/AnimationFX/host';
import { BrowserAnimationLayerSurface, createBrowserAFXFrameScheduler } from '../../../src/SynCloudOS/PlatformAdapters/BrowserAnimationAdapter';

it('accepts unbounded CoreAnimation timing while rejecting invalid infinity and zero cycles', () => {
  const timing = new AFXAnimation({ duration: 2, iterations: Infinity, timing: 'linear' });
  expect(timing.totalDuration).toBe(Infinity);
  expect(timing.progressAt(5)).toBe(.5);
  expect(new AFXAnimation({ duration: 2, repeatDuration: Infinity }).iterations).toBe(Infinity);
  expect(() => new AFXAnimation({ duration: 0, iterations: Infinity })).toThrow();
  expect(() => new AFXAnimation({ duration: 2, iterations: -Infinity })).toThrow();
});

it('runs an endless native layer effect, suspends and resumes with visibility, and settles on reduced motion', async () => {
  let hidden = false, reduced = false;
  let notifyMotion: (() => void) | undefined;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  vi.stubGlobal('matchMedia', () => ({ get matches() { return reduced; }, addEventListener(_name: string, listener: () => void) { notifyMotion = listener; }, removeEventListener() {} }));
  const element = document.createElement('div'); document.body.append(element);
  const native = { currentTime: 1500, pause: vi.fn(), play: vi.fn(), cancel: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const animate = vi.fn(() => native);
  element.animate = animate as unknown as typeof element.animate;
  const layer = createAFXLayer(new BrowserAnimationLayerSurface(element), createBrowserAFXFrameScheduler(window, document));
  const handle = layer.addAnimation(new AFXBasicAnimation({ targetId: 'loop', keyPath: 'opacity', from: 0, to: 1, animation: new AFXAnimation({ duration: 2, delay: .2, fill: 'both', iterations: Infinity, timing: 'linear' }) }));
  expect(animate.mock.calls[0]?.[1]).toMatchObject({ iterations: Infinity, duration: 2000, delay: 200, fill: 'both' });
  expect(handle.progress).toBe(0);
  hidden = true; document.dispatchEvent(new Event('visibilitychange'));
  expect(native.pause).toHaveBeenCalledTimes(1); expect(handle.state).toBe('running');
  hidden = false; document.dispatchEvent(new Event('visibilitychange'));
  expect(native.play).toHaveBeenCalledTimes(1);
  expect(native.removeEventListener).not.toHaveBeenCalled();
  handle.pause(); hidden = true; document.dispatchEvent(new Event('visibilitychange'));
  hidden = false; document.dispatchEvent(new Event('visibilitychange'));
  expect(native.play).toHaveBeenCalledTimes(1);
  handle.resume(); expect(native.play).toHaveBeenCalledTimes(2);
  reduced = true; notifyMotion?.();
  await expect(handle.finished).resolves.toMatchObject({ state: 'completed', reduced: true });
  expect(native.cancel).toHaveBeenCalledTimes(1); expect(layer.presentation.opacity).toBe(1);
  layer.dispose(); element.remove(); vi.unstubAllGlobals();
});
it('keeps frame-sampled endless presentation time frozen while suspended', () => {
  let now = 0, suspended = false;
  let notify: (() => void) | undefined;
  const pending = new Set<(time: number) => void>();
  const layer = createAFXLayer({ supportedProperties: ['opacity'], supportedContentKinds: ['image'], apply() {}, attach() {}, detach() {}, setMask() {}, dispose() {} }, {
    now: () => now, reducedMotion: false, get suspended() { return suspended; },
    requestFrame(callback) { pending.add(callback); return () => pending.delete(callback); },
    subscribeState(callback) { notify = callback; return () => { notify = undefined; }; },
  });
  const handle = layer.addAnimation(new AFXBasicAnimation({ targetId: 'loop', keyPath: 'opacity', from: 0, to: 1, animation: new AFXAnimation({ duration: 2, iterations: Infinity, timing: 'linear' }) }));
  const tick = (time: number) => { now = time; const batch = [...pending]; pending.clear(); batch.forEach(callback => callback(time)); };
  tick(.5); expect(layer.presentation.opacity).toBeCloseTo(.25);
  suspended = true; notify?.(); expect(pending.size).toBe(0);
  now = 100; suspended = false; notify?.(); tick(100.5);
  expect(layer.presentation.opacity).toBeCloseTo(.5); expect(handle.state).toBe('running');
  handle.cancel(); expect(pending.size).toBe(0); layer.dispose();
});

