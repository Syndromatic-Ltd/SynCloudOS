// @vitest-environment jsdom
import React from "react";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NSEView, type NSEViewLayerContentsPlacement } from "../../../src/NSE/Views/NSEView";
import { NSEViewController } from "../../../src/NSE/Application/NSEViewController";
import { nseUnowned } from "../../../src/NSE/Controllers/ownership";
import { outlet, type NSEViewOutlet } from "../../../src/NSE/Application/viewOutlet";
import { renderGraphics as render } from "./graphicsViewFixture";

class PlotView extends NSEViewController { @outlet accessor plotView!: NSEViewOutlet<HTMLDivElement>; }

describe("NSEView drawing outlets and layerContentsPlacement", () => {
  it("keeps its outlet on the view div and delivers pointer events on that view", async () => {
    const controller = new PlotView({ owner: nseUnowned });
    const pointerDown = vi.fn();
    const view = render(<NSEView ref={controller.plotView.ref} draw={() => {}} aria-label="Field" onPointerDown={pointerDown} />);
    const host = view.container.firstElementChild!;
    expect(controller.plotView.current).toBe(host);
    expect(host.tagName).toBe("DIV");
    fireEvent.pointerDown(view.container.querySelector("svg")!, { clientX: 50, clientY: 25 });
    expect(pointerDown).toHaveBeenCalledOnce();
    expect(pointerDown.mock.calls[0]![0].clientX).toBe(50);
    view.unmount();
    await Promise.resolve(); // Outlets defer detach so StrictMode can reattach the committed element.
    expect(controller.plotView.current).toBeNull();
    controller.dispose();
  });

  it.each([
    ["scaleAxesIndependently", "none"],
    ["scaleProportionallyToFit", "xMidYMid meet"],
    ["scaleProportionallyToFill", "xMidYMid slice"],
  ] as const)("maps %s to the SVG scaling behaviour", (placement, aspect) => {
    const svg = render(<NSEView draw={() => {}} layerContentsPlacement={placement} />).container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 200 100");
    expect(svg.getAttribute("preserveAspectRatio")).toBe(aspect);
    expect(svg.hasAttribute("width")).toBe(false);
    expect(svg.style.width).toBe("100%");
    expect(svg.style.height).toBe("100%");
  });

  it.each([
    ["center", "50%", "50%", "translate(-50%, -50%)"],
    ["top", "50%", "0%", "translate(-50%, 0%)"],
    ["topRight", "100%", "0%", "translate(-100%, 0%)"],
    ["right", "100%", "50%", "translate(-100%, -50%)"],
    ["bottomRight", "100%", "100%", "translate(-100%, -100%)"],
    ["bottom", "50%", "100%", "translate(-50%, -100%)"],
    ["bottomLeft", "0%", "100%", "translate(0%, -100%)"],
    ["left", "0%", "50%", "translate(0%, -50%)"],
    ["topLeft", "0%", "0%", "translate(0%, 0%)"],
  ] as const)("keeps natural size at %s", (placement, left, top, transform) => {
    const svg = render(<NSEView draw={() => {}} layerContentsPlacement={placement} />).container.querySelector("svg")!;
    expect([svg.getAttribute("width"), svg.getAttribute("height")]).toEqual(["200", "100"]);
    expect([svg.style.left, svg.style.top, svg.style.transform]).toEqual([left, top, transform]);
  });

  it("defaults to fitting and rejects invented placement names", () => {
    const svg = render(<NSEView draw={() => {}} />).container.querySelector("svg")!;
    expect(svg.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
    expect(() => render(<NSEView draw={() => {}} layerContentsPlacement={"centre" as NSEViewLayerContentsPlacement} />)).toThrow(/layerContentsPlacement/);
  });
});
