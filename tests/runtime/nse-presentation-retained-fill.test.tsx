// @vitest-environment jsdom
import React, { useRef } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NSEAnimationEnvironmentProvider, NSEPresence, useNSEPresentation, type NSEAnimator } from "../../src/NSE/Animation";
import { createRuntimeAnimationService } from "../../src/SynCloudOS/AnimationFX/AnimationService";
import { BrowserAnimationAdapterFactory, type BrowserNativeAnimation } from "../../src/SynCloudOS/PlatformAdapters/BrowserAnimationAdapter";

const cleanups: Array<() => void> = [];
afterEach(() => { cleanup(); for (const dispose of cleanups.splice(0)) dispose(); });
function fixture() {
  const natives: Array<{ native: BrowserNativeAnimation; finish(): void; fill: unknown }> = [];
  const owner = new AbortController(); let sequence = 0;
  const factory = new BrowserAnimationAdapterFactory({ now: () => 0, animate(_target, _frames, options) {
    const listeners = new Map<string, Set<() => void>>();
    const emit = (type: string) => { for (const listener of [...listeners.get(type) ?? []]) listener(); };
    const native: BrowserNativeAnimation = {
      currentTime: 0, playState: "running", play() {}, pause() {},
      cancel: vi.fn(() => emit("cancel")),
      addEventListener(type, listener) { let set = listeners.get(type); if (!set) listeners.set(type, set = new Set()); set.add(listener); },
      removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    };
    natives.push({ native, fill: options.fill, finish: () => emit("finish") }); return native;
  } });
  const lease = factory.acquire("retained-fill", owner.signal);
  const service = createRuntimeAnimationService({ runtimeId: "retained-fill" as Parameters<typeof createRuntimeAnimationService>[0]["runtimeId"], signal: owner.signal, adapterLease: lease, randomUUID: () => String(++sequence), prefersReducedMotion: () => false });
  cleanups.push(() => { service.dispose(); lease.release(); owner.abort(); });
  const animator: NSEAnimator = { ownerAppId: "com.example.retained", animations: service as unknown as NSEAnimator["animations"] };
  return { natives, service, animator };
}
const fade = { duration: .08, timing: "linear" as const, tracks: [{ keyPath: "opacity" as const, values: [1, 0] }] };
const flush = () => act(async () => { for (let index=0;index<6;index++) await Promise.resolve(); });

it("removes a completed native forwards fill once when its handle is cancelled, preserving its completed settlement", async () => {
  const { service, natives } = fixture(), owner = service.acquireOwner({ appId: "com.example.retained", viewId: "surface" });
  const handle = service.animate(document.createElement("div"), { duration: .08, fill: "forwards", animations: [{ targetId: "surface", keyPath: "opacity", from: 1, to: 0 }] }, owner, 1);
  natives[0]!.finish(); const completed = await handle.finished;
  expect(completed.state).toBe("completed"); expect(natives[0]!.native.cancel).not.toHaveBeenCalled();
  handle.cancel("surface returned"); handle.cancel("repeat cleanup");
  expect(natives[0]!.native.cancel).toHaveBeenCalledOnce(); expect(await handle.finished).toBe(completed);
  expect(handle.state).toBe("completed"); expect(service.diagnostics()).toMatchObject({ activeCount: 0, settlementCount: 1 });
  owner.release();
});

it("clears a completed exit when the same presence key returns without an enter animation", async () => {
  const { natives, animator } = fixture();
  function Part({ name }: { name: string }) {
    const ref = useRef<HTMLDivElement>(null); useNSEPresentation(ref, { state: "presented", enter: null, exit: fade });
    return <div ref={ref} data-part={name} style={{ opacity: 1 }} />;
  }
  const view = (shown: boolean) => <NSEAnimationEnvironmentProvider animator={animator}><NSEPresence>{shown ? <section key="retained"><Part name="surface" /><Part name="holding" /></section> : null}</NSEPresence></NSEAnimationEnvironmentProvider>;
  const mounted = render(view(true)), surface = document.querySelector('[data-part="surface"]');
  mounted.rerender(view(false)); expect(natives).toHaveLength(2); expect(natives[0]!.fill).toBe("forwards");
  natives[0]!.finish(); await flush(); expect(document.querySelector('[data-part="surface"]')).toBe(surface);
  mounted.rerender(view(true)); await flush();
  expect(natives[0]!.native.cancel).toHaveBeenCalledOnce(); expect(natives[1]!.native.cancel).toHaveBeenCalledOnce();
  expect(document.querySelector('[data-part="surface"]')).toBe(surface); expect(natives).toHaveLength(2);
});

it("retires the previous completed handle on a model-only state change without replaying an entrance", async () => {
  const { animator, natives } = fixture(), presented = vi.fn();
  function Part({ state }: { state: string }) {
    const ref = useRef<HTMLDivElement>(null); useNSEPresentation(ref, { state, enter: previous => previous === null ? fade : null, onPresented: presented });
    return <div ref={ref} style={{ opacity: 1 }} />;
  }
  const view = (state: string) => <NSEAnimationEnvironmentProvider animator={animator}><Part state={state} /></NSEAnimationEnvironmentProvider>;
  const mounted = render(view("incoming")); natives[0]!.finish(); await flush();
  expect(presented).toHaveBeenLastCalledWith("incoming"); mounted.rerender(view("presented"));
  expect(natives[0]!.native.cancel).toHaveBeenCalledOnce(); expect(natives).toHaveLength(1); expect(presented).toHaveBeenLastCalledWith("presented");
});
