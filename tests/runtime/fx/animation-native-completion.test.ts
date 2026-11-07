import { afterEach, expect, it, vi } from 'vitest';
import { AFXAnimation, AFXBasicAnimation } from '../../../src/FX/AnimationFX/public';
import { BrowserAnimationAdapterFactory, type BrowserNativeAnimation } from '../../../src/SynCloudOS/PlatformAdapters/BrowserAnimationAdapter';
afterEach(() => vi.useRealTimers());
function fixture(withNative = true) {
  vi.useFakeTimers();
  const events = new Map<string, () => void>();
  const native: BrowserNativeAnimation = { currentTime: 0, playState: 'running', play: vi.fn(), pause: vi.fn(), cancel: vi.fn(), addEventListener: (name, listener) => { events.set(name, listener); }, removeEventListener: (name) => { events.delete(name); } };
  const factory = new BrowserAnimationAdapterFactory({ animate: () => withNative ? native : null, now: () => Date.now(), schedule: (callback, delay) => setTimeout(callback, delay), cancelScheduled: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>) });
  const lease = factory.acquire('watchdog', new AbortController().signal);
  const definition = new AFXBasicAnimation({ targetId: 'fade', keyPath: 'opacity', from: 1, to: 0, animation: new AFXAnimation({ duration: .55, timing: 'linear' }) }).toRuntime();
  const playback = lease.adapter.animate({ ...definition, target: {}, delay: 0, iterations: 1, autoreverses: false, fill: 'forwards', timing: 'linear' });
  const settled = vi.fn(); playback.finished.then(settled);
  return { native, events, playback, settled, lease };
}
it('waits for delayed native time rather than wall time, then handles native finish exactly once', async () => {
  const f = fixture(); f.native.currentTime = 350;
  await vi.advanceTimersByTimeAsync(550); expect(f.settled).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(1);
  f.events.get('finish')?.(); await Promise.resolve(); expect(f.settled).toHaveBeenCalledExactlyOnceWith('completed'); expect(vi.getTimerCount()).toBe(0); f.lease.release();
});
it('polls null pending time and completes terminal native time even without a finish event', async () => {
  const f = fixture(); f.native.currentTime = null;
  await vi.advanceTimersByTimeAsync(550); expect(f.settled).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(1);
  f.native.currentTime = 550; await vi.advanceTimersByTimeAsync(16);
  expect(f.settled).toHaveBeenCalledExactlyOnceWith('completed'); expect(vi.getTimerCount()).toBe(0); f.lease.release();
});
it('cleans the watchdog across pause, resume, seek and cancellation', async () => {
  const f = fixture(); f.native.currentTime = 350; await vi.advanceTimersByTimeAsync(550);
  f.playback.pause(); expect(vi.getTimerCount()).toBe(0); await vi.advanceTimersByTimeAsync(1000); expect(f.settled).not.toHaveBeenCalled();
  f.playback.play(); expect(vi.getTimerCount()).toBe(1); f.playback.seek(.4); expect(vi.getTimerCount()).toBe(1);
  f.playback.cancel(); await Promise.resolve(); expect(f.settled).toHaveBeenCalledExactlyOnceWith('cancelled'); expect(vi.getTimerCount()).toBe(0); expect(f.events.size).toBe(0); f.lease.release();
});
it('settles idle native cancellation and preserves wall time for effects without native playback', async () => {
  const f = fixture(); Object.defineProperty(f.native, 'playState', { value: 'idle' }); await vi.advanceTimersByTimeAsync(550);
  expect(f.settled).toHaveBeenCalledExactlyOnceWith('cancelled'); f.lease.release();
  const wall = fixture(false); await vi.advanceTimersByTimeAsync(550); expect(wall.settled).toHaveBeenCalledExactlyOnceWith('completed'); wall.lease.release();
});
