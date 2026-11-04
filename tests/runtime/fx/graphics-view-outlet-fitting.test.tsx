// @vitest-environment jsdom
import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GFXContext } from "../../../src/FX/GraphicsFX/public";
import { createOwnedGFXIdentifierIssuer } from "../../../src/FX/GraphicsFX/identifierAuthority";
import { NSEGraphicsView, convertPointToGFXDisplayList } from "../../../src/NSE/Graphics/NSEGraphicsView";
import { NSEViewController } from "../../../src/NSE/Application/NSEViewController";
import { nseUnowned } from "../../../src/NSE/Controllers/ownership";
import { outlet, type NSEViewOutlet } from "../../../src/NSE/Application/viewOutlet";

function plot() {
    let i = 0;
    const context = GFXContext.recording({ size: { width: 200, height: 100 }, identifiers: createOwnedGFXIdentifierIssuer(() => () => `plot${++i}`) });
    return context.displayList;
}
function box(svg: SVGSVGElement, rect: { left: number; top: number; width: number; height: number }) {
    svg.getBoundingClientRect = () => ({ ...rect, x: rect.left, y: rect.top, right: rect.left + rect.width, bottom: rect.top + rect.height, toJSON() { return this; } }) as DOMRect;
}
class PlotView extends NSEViewController { @outlet accessor plotView!: NSEViewOutlet<SVGSVGElement>; }

describe("NSEGraphicsView outlets, fitting and pointer conversion", () => {
    it("forwards its ref to the root svg so an @outlet can connect", () => {
        const view = new PlotView({ owner: nseUnowned });
        const { container } = render(<NSEGraphicsView ref={view.plotView.ref} displayList={plot()} label="Field"/>);
        expect(view.plotView.current).toBe(container.querySelector("svg"));
        view.dispose();
    });
    it("keeps fixed CSS-pixel size by default and fills its container with autoSize", () => {
        const list = plot();
        const fixed = render(<NSEGraphicsView displayList={list} label="Fixed"/>).container.querySelector("svg")!;
        expect([fixed.getAttribute("width"), fixed.getAttribute("height"), fixed.getAttribute("preserveAspectRatio")]).toEqual(["200", "100", "xMidYMid meet"]);
        const fluid = render(<NSEGraphicsView displayList={list} label="Fluid" autoSize contentsGravity="resize-aspect-fill"/>).container.querySelector("svg")!;
        expect(fluid.hasAttribute("width")).toBe(false);
        expect(fluid.style.width).toBe("100%");
        expect(fluid.getAttribute("viewBox")).toBe("0 0 200 100");
        expect(fluid.getAttribute("preserveAspectRatio")).toBe("xMidYMid slice");
        expect(render(<NSEGraphicsView displayList={list} label="Stretch" autoSize contentsGravity="resize"/>).container.querySelector("svg")!.getAttribute("preserveAspectRatio")).toBe("none");
        expect(() => render(<NSEGraphicsView displayList={list} label="Bad" contentsGravity={"centre" as never}/>)).toThrow(/contentsGravity/);
    });
    it("converts client points through every gravity", () => {
        const list = plot();
        const svg = render(<NSEGraphicsView displayList={list} label="Field" autoSize/>).container.querySelector("svg")!;
        // A 400x400 box: aspect fit scales by 2 and letterboxes 100px above and below.
        box(svg, { left: 10, top: 20, width: 400, height: 400 });
        expect(convertPointToGFXDisplayList(svg, 10, 120, list)).toEqual({ x: 0, y: 0 });
        expect(convertPointToGFXDisplayList(svg, 410, 320, list)).toEqual({ x: 200, y: 100 });
        expect(convertPointToGFXDisplayList(svg, 210, 20, list)).toEqual({ x: 100, y: -50 });
        svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
        // Aspect fill scales by 4 and crops 200px left and right.
        expect(convertPointToGFXDisplayList(svg, 210, 220, list)).toEqual({ x: 100, y: 50 });
        expect(convertPointToGFXDisplayList(svg, 10, 20, list)).toEqual({ x: 50, y: 0 });
        svg.setAttribute("preserveAspectRatio", "none");
        expect(convertPointToGFXDisplayList(svg, 410, 220, list)).toEqual({ x: 200, y: 50 });
        box(svg, { left: 0, top: 0, width: 0, height: 0 });
        expect(convertPointToGFXDisplayList(svg, 0, 0, list)).toBeNull();
    });
    it("passes the location in display-list space to pointer handlers", () => {
        const list = plot();
        const onPointerDown = vi.fn();
        const svg = render(<NSEGraphicsView displayList={list} label="Field" autoSize onPointerDown={onPointerDown}/>).container.querySelector("svg")!;
        box(svg, { left: 0, top: 0, width: 100, height: 50 });
        fireEvent.pointerDown(svg, { clientX: 50, clientY: 25 });
        expect(onPointerDown).toHaveBeenCalledTimes(1);
        expect(onPointerDown.mock.calls[0]![1]).toEqual({ x: 100, y: 50 });
    });
});
