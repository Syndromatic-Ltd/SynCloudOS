// @vitest-environment jsdom
import React, { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useNSEViewSafeArea } from "../../src/NSE/Layout/useNSESafeArea";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = host = null;
  vi.restoreAllMocks();
});

function View({ name }: { name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useNSEViewSafeArea(ref);
  return <div ref={ref} data-view={name} />;
}

let rerender: () => void = () => {};
function Tree() {
  const [, setTick] = useState(0);
  rerender = () => setTick(tick => tick + 1);
  return <div id="a"><div id="b"><div id="c">
    {["one", "two", "three", "four", "five", "six"].map(name => <View key={name} name={name} />)}
  </div></div></div>;
}

function mount() {
  host = document.body.appendChild(document.createElement("div"));
  const reads: Element[] = [];
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => { reads.push(element); return real(element, pseudo); });
  act(() => { root = createRoot(host!); root.render(<Tree />); });
  return reads;
}

describe("safe-area measurement", () => {
  it("reads each ancestor's style once for a commit, however many views measure", () => {
    const reads = mount();
    // Six views share five ancestors up to the document element.
    expect(reads.length).toBe(new Set(reads).size);
    expect(new Set(reads).size).toBeGreaterThanOrEqual(6 + 5);
  });

  it("reads again on the next commit, so a transform applied in between is seen", async () => {
    const reads = mount();
    const ancestor = document.getElementById("b")!;
    await Promise.resolve();
    reads.length = 0;
    ancestor.style.transform = "scale(0.5)";
    act(() => rerender());
    expect(reads).toContain(document.querySelector("[data-view=one]"));
    // The walk stops at the first transformed ancestor.
    expect(reads).toContain(ancestor);
    expect(reads).not.toContain(document.getElementById("a"));
    expect(reads.length).toBe(new Set(reads).size);
  });
});
