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
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChronosphereVersion } from "../../../src/NSE/Chronosphere/chronosphereTypes";

const host = vi.hoisted(() => ({ app: {} as Record<string, any> }));
vi.mock("../../../src/NSE/Chronosphere/chronosphereEnvironment", () => ({ useChronosphereEnvironment: () => host.app }));
import { ChronosphereTimeline } from "../../../src/NSE/Chronosphere/ChronosphereTimeline";

const history = (length: number): ChronosphereVersion[] => Array.from({ length }, (_, index) => ({
  id: `archive-${index}`, sequence: index, displayLabel: `Version ${index}`, title: `Archive ${index}`,
  dateLabel: `Date ${index}`, summary: "", tint: [1, 0, 0],
  isCurrent: index === 0,
}));
let root: Root, container: HTMLDivElement, frames: Map<number, (time: number) => void>;
let signal: AbortController, serial: number, time: number;
const select = vi.fn();
beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  frames = new Map(); signal = new AbortController(); serial = 0; time = 0; select.mockReset();
  host.app = { signal: signal.signal, scheduler: {
    requestAnimationFrame(callback: (time: number) => void) {
      const id = ++serial; frames.set(id, callback); return { dispose: () => frames.delete(id) };
    },
  } };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0, y: 0, top: 0, left: 0, right: 160, bottom: 600, width: 160, height: 600, toJSON() {},
  });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });

const rail = () => container.querySelector<HTMLElement>(".chronosphere-rail")!;
const viewport = () => container.querySelector<HTMLElement>(".chronosphere-timeline-viewport")!;
const button = (index: number) => container.querySelector<HTMLButtonElement>(`button[data-entry-index="${index}"]`)!;
const y = (index: number) => Number.parseFloat(button(index).parentElement!.style.top);
async function render(entries: readonly ChronosphereVersion[], props: Partial<React.ComponentProps<typeof ChronosphereTimeline>> = {}) {
  await act(async () => root.render(<ChronosphereTimeline entries={entries} activeIndex={0} onSelect={select}
    reducedMotion={false} visible label="Archive history" {...props} />));
}
async function settle() {
  for (let frame = 0; frames.size && frame < 100; frame++) await act(async () => {
    time += 16; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(time));
  });
  expect(frames.size).toBe(0);
}
function move(clientY: number) {
  const event = new MouseEvent("pointermove", { bubbles: true, clientY });
  Object.defineProperty(event, "pointerType", { value: "mouse" }); viewport().dispatchEvent(event);
}
async function key(index: number, value: string) {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: value });
  await act(async () => button(index).dispatchEvent(event)); return event;
}

describe("Chronosphere edge timeline", () => {
  it("uses only real entries, native buttons and the entrance opacity contract", async () => {
    await render([]); expect(container.querySelectorAll("button")).toHaveLength(0);
    await render(history(1));
    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(rail().getAttribute("aria-label")).toBe("Archive history");
    expect(rail().style.opacity).toBe("1");
    expect(button(0).getAttribute("aria-current")).toBe("true");
    expect(button(0).getAttribute("aria-label")).toBe("Date 0 — Version 0");
    expect(button(0).type).toBe("button");
    await act(async () => button(0).click()); expect(select).toHaveBeenCalledExactlyOnceWith(0);
    expect((await key(0, "Enter")).defaultPrevented).toBe(false);
    expect((await key(0, " ")).defaultPrevented).toBe(false);
    await render(history(1), { visible: false });
    expect(rail().style.opacity).toBe("0"); expect(rail().hasAttribute("inert")).toBe(true);
    expect(rail().getAttribute("aria-hidden")).toBe("true");
  });

  it("coalesces pointer input locally and spreads neighboring hit targets symmetrically", async () => {
    let parentRenders = 0;
    function Parent() { parentRenders++; return <ChronosphereTimeline entries={history(19)} activeIndex={9}
      onSelect={select} reducedMotion={false} visible label="History" />; }
    await act(async () => root.render(<Parent />));
    const center = y(9), before = y(8) - center;
    await act(async () => { for (let i = 0; i < 40; i++) move(center); });
    expect(frames.size).toBe(1); await settle();
    expect(y(9)).toBeCloseTo(center, 1);
    expect(y(8) - y(9)).toBeGreaterThan(before + 8);
    expect(y(8) - y(9)).toBeCloseTo(y(9) - y(10), 1);
    for (let index = 1; index < 19; index++) {
      const size = (Number.parseFloat(button(index).style.height) + Number.parseFloat(button(index - 1).style.height)) / 2;
      expect(y(index - 1) - y(index)).toBeGreaterThanOrEqual(size - 0.1);
    }
    expect(parentRenders).toBe(1); expect(select).not.toHaveBeenCalled();
    await act(async () => move(0)); await settle();
    expect(y(18) - Number.parseFloat(button(18).style.height) / 2).toBeGreaterThanOrEqual(0);
    await act(async () => move(600)); await settle();
    expect(y(0) + Number.parseFloat(button(0).style.height) / 2).toBeLessThanOrEqual(600);
  });

  it("bounds mounted history, supports native scroll, and reaches both ends with the keyboard", async () => {
    const parentWheel = vi.fn(), parentKey = vi.fn();
    await act(async () => root.render(<div onWheel={parentWheel} onKeyDown={parentKey}>
      <ChronosphereTimeline entries={history(10000)} activeIndex={0} onSelect={select} reducedMotion={false} visible label="History" />
    </div>));
    expect(container.querySelectorAll("button").length).toBeLessThan(100);
    expect(button(0)).not.toBeNull(); expect(viewport().scrollTop).toBeGreaterThan(200000);
    await act(async () => { viewport().scrollTop = 120000; viewport().dispatchEvent(new Event("scroll", { bubbles: true })); });
    const middle = [...container.querySelectorAll<HTMLButtonElement>("button")].find(node => Number(node.dataset.entryIndex) > 4900 && Number(node.dataset.entryIndex) < 5100)!;
    expect(middle).toBeDefined(); await act(async () => middle.click());
    expect(select).toHaveBeenLastCalledWith(Number(middle.dataset.entryIndex));
    const wheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 100 });
    viewport().dispatchEvent(wheel); expect(parentWheel).not.toHaveBeenCalled(); expect(wheel.defaultPrevented).toBe(false);
    await key(Number(middle.dataset.entryIndex), "End");
    expect(select).toHaveBeenLastCalledWith(9999); expect(document.activeElement).toBe(button(9999));
    expect(button(9999).parentElement!.getAttribute("aria-setsize")).toBe("10000");
    expect(viewport().scrollTop).toBe(0);
    await key(9999, "Home"); expect(select).toHaveBeenLastCalledWith(0); expect(document.activeElement).toBe(button(0));
    await key(0, "ArrowUp"); expect(select).toHaveBeenLastCalledWith(1); expect(document.activeElement).toBe(button(1));
    expect(parentKey).not.toHaveBeenCalled(); expect(container.querySelectorAll("button").length).toBeLessThan(100);
  });

  it("keeps every entry reachable in a compact viewport and clamps changes to the archive", async () => {
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockReturnValue({
      x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 150, width: 100, height: 150, toJSON() {},
    });
    await render(history(200), { activeIndex: 150 }); expect(button(150)).not.toBeNull();
    await key(150, "PageUp"); expect(select.mock.lastCall![0]).toBeGreaterThan(150);
    await render(history(2), { activeIndex: 150 });
    expect(button(1).getAttribute("aria-current")).toBe("true");
    expect(viewport().scrollTop).toBe(0);
  });

  it("ignores touch hover and releases scheduled work when unmounted", async () => {
    await render(history(19));
    const touch = new MouseEvent("pointermove", { bubbles: true, clientY: 300 });
    Object.defineProperty(touch, "pointerType", { value: "touch" });
    await act(async () => viewport().dispatchEvent(touch)); expect(frames.size).toBe(0);
    await act(async () => move(300)); expect(frames.size).toBe(1);
    await act(async () => root.render(null)); expect(frames.size).toBe(0);
  });

  it("disables lens motion for reduced motion and cancels scheduled work on hide and abort", async () => {
    const entries = history(19);
    await render(entries, { reducedMotion: true });
    const baseline = y(8); await act(async () => move(y(9))); expect(frames.size).toBe(0); expect(y(8)).toBe(baseline);
    await key(0, "ArrowUp"); expect(select).toHaveBeenLastCalledWith(1); expect(frames.size).toBe(0);
    await render(entries); await act(async () => move(300)); expect(frames.size).toBe(1);
    await render(entries, { reducedMotion: true }); expect(frames.size).toBe(0); expect(y(8)).toBe(baseline);
    await render(entries); await act(async () => move(300)); expect(frames.size).toBe(1);
    await render(entries, { visible: false }); expect(frames.size).toBe(0);
    await render(entries); await act(async () => move(300)); expect(frames.size).toBe(1);
    await act(async () => signal.abort()); expect(frames.size).toBe(0);
    await act(async () => move(200)); expect(frames.size).toBe(0);
  });
});
