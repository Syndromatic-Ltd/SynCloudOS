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

import { expect, test } from "playwright/test";

test("live AFXLayer opacity uses native playback without frame sampling and preserves retarget settlement", async ({ page }) => {
  await page.goto("/");
  const initial = await page.evaluate(async () => {
    const [afx, browser] = await Promise.all([
      import("/src/FX/AnimationFX/public.ts"),
      import("/src/SynCloudOS/PlatformAdapters/BrowserAnimationAdapter.ts"),
    ]);
    const element = document.createElement("div");
    document.body.append(element);
    let frameRequests = 0;
    const layer = new afx.AFXLayer(new browser.BrowserAnimationLayerSurface(element), {
      now: () => performance.now() / 1000,
      reducedMotion: false,
      suspended: false,
      requestFrame(callback: (time: number) => void) {
        frameRequests++;
        const id = requestAnimationFrame(() => callback(performance.now() / 1000));
        return () => cancelAnimationFrame(id);
      },
    });
    const first = layer.addAnimation(new afx.AFXBasicAnimation({
      targetId: "compositor-test", keyPath: "opacity", from: 1, to: 0,
      animation: new afx.AFXAnimation({ duration: 2, timing: "linear" }),
    }));
    (window as any).afxCompositorTest = { layer, first, element, afx, frameRequests: () => frameRequests };
    await Promise.all(element.getAnimations().map(animation => animation.ready));
    return { animations: element.getAnimations().length, frameRequests, model: layer.model.opacity, progress: first.progress };
  });
  expect(initial.animations).toBe(1);
  expect(initial.frameRequests).toBe(0);
  expect(initial.model).toBe(0);

  const during = await page.evaluate(async () => {
    const { layer, first, frameRequests } = (window as any).afxCompositorTest;
    const before = first.progress;
    const until = performance.now() + 350;
    while (performance.now() < until) { /* deliberately block the main thread */ }
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    // Headless software renderers may freeze the animation timeline during the
    // stall; the headed desktop-capture gate checks visible in-stall progress.
    await new Promise(resolve => setTimeout(resolve, 300));
    return { before, after: first.progress, presentation: layer.presentation.opacity, frameRequests: frameRequests() };
  });
  expect(during.after).toBeGreaterThan(during.before + 0.1);
  expect(during.presentation).toBeCloseTo(1 - during.after, 1);
  expect(during.frameRequests).toBe(0);

  const settled = await page.evaluate(async () => {
    const { layer, first, element, afx, frameRequests } = (window as any).afxCompositorTest;
    const visible = layer.presentation.opacity;
    const second = layer.addAnimation(new afx.AFXBasicAnimation({
      targetId: "compositor-test", keyPath: "opacity", from: 0, to: 1,
      animation: new afx.AFXAnimation({ duration: 0.1, timing: "linear" }),
    }));
    const interrupted = await first.finished;
    const keyframes = element.getAnimations()[0]?.effect?.getKeyframes();
    const completed = await second.finished;
    const result = { interrupted: interrupted.state, completed: completed.state, visible, retargetFrom: Number(keyframes?.[0]?.opacity), model: layer.model.opacity, presentation: layer.presentation.opacity, animations: element.getAnimations().length, frameRequests: frameRequests() };
    layer.dispose();
    return result;
  });
  expect(settled.interrupted).toBe("interrupted");
  expect(settled.completed).toBe("completed");
  expect(settled.retargetFrom).toBeCloseTo(settled.visible, 1);
  expect(settled.model).toBe(1);
  expect(settled.presentation).toBe(1);
  expect(settled.animations).toBe(0);
  expect(settled.frameRequests).toBe(0);
});

test("live AFXLayer transform uses native playback and cancellation releases it", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const [afx, browser] = await Promise.all([
      import("/src/FX/AnimationFX/public.ts"),
      import("/src/SynCloudOS/PlatformAdapters/BrowserAnimationAdapter.ts"),
    ]);
    const element = document.createElement("div");
    document.body.append(element);
    let frameRequests = 0;
    const layer = new afx.AFXLayer(new browser.BrowserAnimationLayerSurface(element), {
      now: () => performance.now() / 1000,
      reducedMotion: false,
      suspended: false,
      requestFrame() { frameRequests++; return () => {}; },
    });
    const handle = layer.addAnimation(new afx.AFXBasicAnimation({
      targetId: "compositor-transform", keyPath: "transform",
      from: "matrix(1,0,0,1,0,0)", to: "matrix(1,0,0,1,100,0)",
      animation: new afx.AFXAnimation({ duration: 1, timing: "linear" }),
    }));
    await Promise.all(element.getAnimations().map(item => item.ready));
    const keyframes = element.getAnimations()[0]?.effect?.getKeyframes();
    const active = element.getAnimations().length;
    handle.cancel();
    const settlement = await handle.finished;
    const retained = element.getAnimations().length;
    layer.dispose();
    return { active, retained, settlement: settlement.state, keyframes: keyframes?.length, frameRequests };
  });
  expect(result).toEqual({ active: 1, retained: 0, settlement: "cancelled", keyframes: 2, frameRequests: 0 });
});

test("a live compositor transform follows layer geometry changes without losing its timeline", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const [afx, browser] = await Promise.all([
      import("/src/FX/AnimationFX/public.ts"),
      import("/src/SynCloudOS/PlatformAdapters/BrowserAnimationAdapter.ts"),
    ]);
    const element = document.createElement("div");
    document.body.append(element);
    const layer = new afx.AFXLayer(new browser.BrowserAnimationLayerSurface(element), {
      now: () => performance.now() / 1000,
      reducedMotion: false,
      suspended: false,
      requestFrame() { throw new Error("Transform unexpectedly fell back to frames"); },
    });
    layer.frame = { x: 0, y: 0, width: 50, height: 50 };
    const handle = layer.addAnimation(new afx.AFXBasicAnimation({
      targetId: "geometry", keyPath: "transform",
      from: "matrix(1,0,0,1,0,0)", to: "matrix(1,0,0,1,100,0)",
      animation: new afx.AFXAnimation({ duration: 2, timing: "linear" }),
    }));
    await Promise.all(element.getAnimations().map(item => item.ready));
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const before = element.getBoundingClientRect().x;
    const priorProgress = handle.progress;
    layer.position = { x: layer.position.x + 50, y: layer.position.y };
    const after = element.getBoundingClientRect().x;
    const nextProgress = handle.progress;
    handle.cancel();
    layer.dispose();
    return { before, after, priorProgress, nextProgress };
  });
  expect(result.after - result.before).toBeCloseTo(50, 0);
  expect(result.nextProgress).toBeGreaterThanOrEqual(result.priorProgress);
});

test("native playback keeps pause, seek, reduced-motion and owner-abort settlement", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const [afx, browser] = await Promise.all([
      import("/src/FX/AnimationFX/public.ts"),
      import("/src/SynCloudOS/PlatformAdapters/BrowserAnimationAdapter.ts"),
    ]);
    const element = document.createElement("div");
    document.body.append(element);
    const states = new Set<() => void>();
    let reduced = false;
    let frames = 0;
    const owner = new AbortController();
    const layer = new afx.AFXLayer(new browser.BrowserAnimationLayerSurface(element), {
      now: () => performance.now() / 1000,
      get reducedMotion() { return reduced; },
      suspended: false,
      requestFrame() { frames++; return () => {}; },
      subscribeState(listener: () => void) { states.add(listener); return () => states.delete(listener); },
    }, { signal: owner.signal });
    const animation = () => new afx.AFXBasicAnimation({
      targetId: "lifecycle", keyPath: "opacity", from: 1, to: 0,
      animation: new afx.AFXAnimation({ duration: 2, timing: "linear" }),
    });
    const first = layer.addAnimation(animation());
    await Promise.all(element.getAnimations().map(item => item.ready));
    first.pause();
    await new Promise(resolve => setTimeout(resolve, 40));
    const paused = first.progress;
    await new Promise(resolve => setTimeout(resolve, 100));
    const stillPaused = first.progress;
    first.seek(1);
    const sought = first.progress;
    first.resume();
    reduced = true;
    for (const listener of states) listener();
    const reducedSettlement = await first.finished;
    const afterReduced = { model: layer.model.opacity, presentation: layer.presentation.opacity, animations: element.getAnimations().length };
    reduced = false;
    const second = layer.addAnimation(animation());
    await Promise.all(element.getAnimations().map(item => item.ready));
    owner.abort();
    const abortedSettlement = await second.finished;
    return { paused, stillPaused, sought, reducedSettlement, afterReduced, abortedSettlement, animations: element.getAnimations().length, frames, listeners: states.size };
  });
  expect(result.stillPaused).toBeCloseTo(result.paused, 2);
  expect(result.sought).toBeCloseTo(0.5, 2);
  expect(result.reducedSettlement).toMatchObject({ state: "completed", reduced: true });
  expect(result.afterReduced).toEqual({ model: 0, presentation: 0, animations: 0 });
  expect(result.abortedSettlement.state).toBe("cancelled");
  expect(result.animations).toBe(0);
  expect(result.frames).toBe(0);
  expect(result.listeners).toBe(0);
});
