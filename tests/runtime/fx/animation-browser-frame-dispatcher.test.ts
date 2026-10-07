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

import { afterEach, expect, it, vi } from "vitest";
import { createBrowserAFXFrameScheduler } from "../../../src/SynCloudOS/PlatformAdapters/BrowserAnimationAdapter";

function fakeBrowser() {
  let nowMs = 1000;
  let nextId = 0;
  const native = new Map<number, FrameRequestCallback>();
  const listeners = { document: 0, query: 0 };
  const query = Object.assign(new EventTarget(), { matches: false });
  const document = Object.assign(new EventTarget(), { hidden: false });
  for (const [target, key] of [[query, "query"], [document, "document"]] as const) {
    const add = target.addEventListener.bind(target), remove = target.removeEventListener.bind(target);
    target.addEventListener = (...args: Parameters<EventTarget["addEventListener"]>) => { listeners[key]++; add(...args); };
    target.removeEventListener = (...args: Parameters<EventTarget["removeEventListener"]>) => { listeners[key]--; remove(...args); };
  }
  const window = {
    performance: { now: () => nowMs },
    matchMedia: () => query,
    requestAnimationFrame(callback: FrameRequestCallback) { native.set(++nextId, callback); return nextId; },
    cancelAnimationFrame(id: number) { native.delete(id); },
  } as unknown as Window;
  return {
    window, document: document as unknown as Document, query, native, listeners,
    advance(milliseconds: number) { nowMs += milliseconds; },
    frame() {
      const callbacks = [...native.values()];
      native.clear();
      for (const callback of callbacks) callback(nowMs);
    },
  };
}

afterEach(() => { vi.restoreAllMocks(); });

it("serves every frame request of a window from one native animation frame", () => {
  const browser = fakeBrowser();
  const first = createBrowserAFXFrameScheduler(browser.window, browser.document);
  const second = createBrowserAFXFrameScheduler(browser.window, browser.document);
  const order: string[] = [];
  for (let index = 0; index < 50; index++) first.requestFrame(() => order.push(`a${index}`));
  second.requestFrame(() => order.push("b"));
  expect(browser.native.size).toBe(1);
  browser.frame();
  expect(order).toEqual([...Array.from({ length: 50 }, (_, index) => `a${index}`), "b"]);
  expect(browser.native.size).toBe(0);
});

it("reads the clock per callback, defers requests made in a callback, honours cancellation mid-frame and isolates failures", async () => {
  const browser = fakeBrowser();
  const scheduler = createBrowserAFXFrameScheduler(browser.window, browser.document);
  const seen: Array<[string, number]> = [];
  const errors: unknown[] = [];
  const rethrown = vi.spyOn(globalThis, "queueMicrotask").mockImplementation((task) => {
    try { task(); } catch (error) { errors.push(error); }
  });
  let cancelLater: () => void = () => {};
  scheduler.requestFrame((time) => {
    seen.push(["first", time]);
    browser.advance(4);
    cancelLater();
    scheduler.requestFrame((next) => seen.push(["next frame", next]));
  });
  scheduler.requestFrame(() => { throw new Error("isolated"); });
  cancelLater = scheduler.requestFrame(() => seen.push(["cancelled", 0]));
  scheduler.requestFrame((time) => seen.push(["after", time]));
  const cancelledBeforeFrame = scheduler.requestFrame(() => seen.push(["never", 0]));
  cancelledBeforeFrame();
  browser.frame();
  expect(seen).toEqual([["first", 1], ["after", 1.004]]);
  expect(errors).toHaveLength(1);
  expect(browser.native.size).toBe(1);
  browser.advance(12);
  browser.frame();
  expect(seen.at(-1)).toEqual(["next frame", 1.016]);
  rethrown.mockRestore();
});

it("releases the native frame when the last request is cancelled", () => {
  const browser = fakeBrowser();
  const scheduler = createBrowserAFXFrameScheduler(browser.window, browser.document);
  const cancel = [scheduler.requestFrame(() => {}), scheduler.requestFrame(() => {})];
  cancel[0]!();
  expect(browser.native.size).toBe(1);
  cancel[1]!();
  expect(browser.native.size).toBe(0);
});

it("fans visibility and reduced-motion changes out from one native listener pair", () => {
  const browser = fakeBrowser();
  const scheduler = createBrowserAFXFrameScheduler(browser.window, browser.document);
  const other = createBrowserAFXFrameScheduler(browser.window, browser.document);
  const calls: number[] = [];
  const unsubscribe = Array.from({ length: 200 }, (_, index) =>
    (index % 2 ? other : scheduler).subscribeState!(() => calls.push(index)));
  expect(browser.listeners).toEqual({ document: 1, query: 1 });
  browser.document.dispatchEvent(new Event("visibilitychange"));
  browser.query.dispatchEvent(new Event("change"));
  expect(calls).toHaveLength(400);
  expect(calls.slice(0, 3)).toEqual([0, 1, 2]);
  for (const release of unsubscribe) release();
  expect(browser.listeners).toEqual({ document: 0, query: 0 });
  browser.document.dispatchEvent(new Event("visibilitychange"));
  expect(calls).toHaveLength(400);
});
