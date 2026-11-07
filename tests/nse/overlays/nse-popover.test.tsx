// @vitest-environment jsdom
import React, { useMemo, useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NSEPopover } from "../../../src/NSE/Overlays/NSEPopover";
import { NSEOverlayProvider } from "../../../src/NSE/Overlays/NSEOverlayProvider";
import { computeNSEOverlayPosition } from "../../../src/NSE/Overlays/computeNSEOverlayPosition";
import { NSEAnimationEnvironmentProvider } from "../../../src/NSE/Animation/NSEAnimationEnvironment";
import { NSEViewController, nsePopoverPositioning } from "../../../src/NSE/Application/NSEViewController";
import { createStaticPresentationPort } from "../../fixtures/presentationTraits";

afterEach(cleanup);
const presentation = createStaticPresentationPort({ width: 1000, height: 720 });
const workArea = { width: 1000, height: 720, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } };

function Harness({ children, reducedMotion = false }: { children: React.ReactNode; reducedMotion?: boolean }) {
  const runtimePort = useMemo(() => ({
    runtimeId: "popover-test", signal: new AbortController().signal,
    environment: {
      browser: { getDocument: () => document, getWindow: () => window },
      workArea: { getSnapshot: () => workArea, subscribe: () => () => undefined },
      visualViewport: { getSnapshot: () => null, subscribe: () => () => undefined }, presentation,
      setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay), clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
    restoreFocus: () => undefined, reportPlacementFailure: () => { throw new Error("Placement failed"); },
    wrapFocusScope: (_options: unknown, node: React.ReactNode) => node,
  }), []);
  return <NSEAnimationEnvironmentProvider reducedMotion={reducedMotion}><NSEOverlayProvider runtimePort={runtimePort}>{children}</NSEOverlayProvider></NSEAnimationEnvironmentProvider>;
}

function Fixture({ drawsBackground = true, open = true }: { drawsBackground?: boolean; open?: boolean }) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  return <><button ref={setAnchor}>Anchor</button><NSEPopover id="paper" open={open} surface="overlay" anchor={anchor} parentWindowControllerId={null} parentResponderId="test" drawsBackground={drawsBackground} title="Options" onOpenChange={() => undefined}>
    <div style={{ "--nse-popover-content-fill": "#efe2c6" } as React.CSSProperties}><input aria-label="Draft" defaultValue="Keep me" /></div>
  </NSEPopover></>;
}

function measured(element: HTMLElement, x: number, y: number, width: number, height: number) {
  element.getBoundingClientRect = () => ({ x, y, left: x, top: y, right: x + width, bottom: y + height, width, height, toJSON: () => ({}) });
  for (const [key, value] of Object.entries({ offsetWidth: width, offsetHeight: height, clientWidth: width, clientHeight: height })) Object.defineProperty(element, key, { configurable: true, value });
}

describe("popover frame and presentation", () => {
  it("keeps an arrow and frame while the content paints its plate", async () => {
    render(<Harness><Fixture drawsBackground={false} /></Harness>);
    const surface = await screen.findByRole("dialog", { name: "Options" });
    expect(surface.getAttribute("data-nse-popover-draws-background")).toBe("false");
    expect(surface.querySelector('[data-nse-part="arrow"]')).not.toBeNull();
    expect(surface.querySelector('[data-nse-part="popover-frame"]')).not.toBeNull();
    await waitFor(() => expect(surface.style.getPropertyValue("--nse-popover-content-fill")).toBe("#efe2c6"));
  });

  it("uses the animation environment's cross-fade path and retains a closing surface briefly", async () => {
    const view = render(<Harness reducedMotion><Fixture /></Harness>);
    const surface = await screen.findByRole("dialog", { name: "Options" });
    expect(surface.getAttribute("data-nse-reduced-motion")).toBe("true");
    view.rerender(<Harness reducedMotion><Fixture open={false} /></Harness>);
    expect(surface.getAttribute("data-state")).toBe("closing");
    expect(surface.hasAttribute("inert")).toBe(true);
    await waitFor(() => expect(document.getElementById("paper")).toBeNull());
  });

  it("retains background drawing by default and passes content-painting options through a controller", () => {
    const root = new NSEViewController();
    const anchor = document.createElement("button");
    const child = root.presentAsPopover(NSEViewController, { of: anchor, preferredEdge: "minX", drawsBackground: false });
    expect(child[nsePopoverPositioning]).toMatchObject({ drawsBackground: false, preferredEdge: "minX" });
    expect(() => root.presentAsPopover(NSEViewController, { of: anchor, drawsBackground: "false" as never })).toThrow(TypeError);
    root.dispose();
  });
});

describe("real Floating UI popover geometry", () => {
  it("flips above a bottom anchor, shifts inside the region and points at its centre", async () => {
    const anchor = document.createElement("button"), floating = document.createElement("div"), arrow = document.createElement("span");
    document.body.append(anchor, floating); floating.append(arrow);
    measured(anchor, 380, 330, 20, 20); measured(floating, 0, 0, 240, 140); measured(arrow, 0, 0, 20, 20);
    const stop = computeNSEOverlayPosition({ anchor, floating, arrow, placement: "block-end", offset: 12, boundary: () => ({ x: 100, y: 60, width: 320, height: 300 }) });
    try {
      await waitFor(() => expect(floating.dataset.placement).toBe("top"));
      expect(Number.parseFloat(floating.style.left)).toBeLessThanOrEqual(172);
      expect(Number.parseFloat(floating.style.left) + Number.parseFloat(arrow.style.left) + 10).toBe(390);
      expect(arrow.style.bottom).toBe("-10px");
      expect(floating.style.transformOrigin).toBe(`${Number.parseFloat(arrow.style.left) + 10}px 150px`);
    } finally { stop(); anchor.remove(); floating.remove(); }
  });

  it("keeps a pointer-anchored context menu at the event instead of the view centre", async () => {
    const anchor = document.createElement("button"), floating = document.createElement("div");
    document.body.append(anchor, floating);
    measured(anchor, 100, 100, 500, 400); measured(floating, 0, 0, 120, 80);
    const stop = computeNSEOverlayPosition({ anchor, floating, anchorPoint: { x: 220, y: 210 }, placement: "block-end-inline-start", boundary: () => ({ x: 0, y: 0, width: 1000, height: 720 }) });
    try { await waitFor(() => expect(floating.style.left).toBe("220px")); expect(floating.style.top).toBe("210px"); }
    finally { stop(); anchor.remove(); floating.remove(); }
  });
});
