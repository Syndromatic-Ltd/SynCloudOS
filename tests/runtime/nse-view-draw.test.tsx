// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GFXColour, GFXContext, GFXGradient, GFXPath } from "../../src/FX/GraphicsFX/public";
import { NSEView } from "../../src/NSE/Views/NSEView";
import { NSEAppearance } from "../../src/NSE/Appearance/NSEAppearance";
import { useNSEAppearance } from "../../src/NSE/Appearance/NSEAppearanceProvider";
import { NSEMenu } from "../../src/NSE/Menus/NSEMenu";
import { NSEOverlayProvider } from "../../src/NSE/Overlays";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact/SynCloudOSProvider";
import { RuntimeInputBoundary } from "../../src/SynCloudOSReact/RuntimeInputBoundary";
import { useRuntimeNSEOverlayPort } from "../../src/SynCloudOSReact";
import { createTestRuntime, createTestRuntimeEnvironment } from "./helpers";

afterEach(cleanup);

function drawingRuntime(width = 200, height = 100) {
  let size = { width, height };
  const listeners = new Set<() => void>();
  const release = vi.fn();
  const geometry = {
    measure: vi.fn(() => size),
    observe: vi.fn((_element: HTMLElement, listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); release(); };
    }),
  };
  const runtime = createTestRuntime({ environment: { ...createTestRuntimeEnvironment(), imageGeometry: geometry } });
  return { runtime, geometry, release, resize(next: typeof size) { size = next; act(() => { for (const listener of listeners) listener(); }); } };
}

describe("NSEView.draw", () => {
  it("names the drawing as an image while retaining accessible interactive subviews", () => {
    const { runtime } = drawingRuntime();
    const view = render(<SynCloudOSProvider runtime={runtime}><NSEView draw={() => {}} aria-label="Named figure" aria-description="A measured plot"><button>Inspect</button></NSEView></SynCloudOSProvider>);
    expect(screen.getByRole("img", { name: "Named figure" }).getAttribute("aria-description")).toBe("A measured plot");
    expect(screen.getByRole("button", { name: "Inspect" })).toBeTruthy();
    view.unmount(); runtime.dispose();
  });

  it("records its measured bounds with a fresh context on every React display", () => {
    const { runtime, geometry, resize, release } = drawingRuntime();
    const contexts: GFXContext[] = [];
    let colour = GFXColour.parse("#123456");
    const draw = vi.fn((rect, context: GFXContext) => {
      contexts.push(context);
      context.setFill(colour);
      context.fill(GFXPath.rect(rect));
    });
    const content = () => <SynCloudOSProvider runtime={runtime}><NSEView draw={draw} aria-label="Figure" toolTip="Details" style={{ width: 200, height: 100 }} /></SynCloudOSProvider>;
    const view = render(content());
    const host = view.container.firstElementChild!;
    expect(geometry.measure).toHaveBeenCalledWith(host);
    expect(host.getAttribute("title")).toBe("Details");
    expect(view.container.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 200 100");
    expect(draw.mock.calls.at(-1)?.[0]).toEqual({ x: 0, y: 0, width: 200, height: 100 });
    colour = GFXColour.parse("#abcdef");
    const before = contexts.at(-1);
    view.rerender(content());
    expect(contexts.at(-1)).not.toBe(before);
    expect(view.container.querySelector("path")?.getAttribute("fill")).toBe("rgb(171 205 239)");
    resize({ width: 320, height: 180 });
    expect(view.container.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 320 180");
    expect(draw.mock.calls.at(-1)?.[0]).toEqual({ x: 0, y: 0, width: 320, height: 180 });
    view.unmount();
    expect(release).toHaveBeenCalledOnce();
    runtime.dispose();
  });

  it("requires the private runtime drawing environment only when drawing", () => {
    expect(() => render(<NSEView toolTip="Plain">Subview</NSEView>)).not.toThrow();
    expect(() => render(<NSEView draw={() => {}} />)).toThrow(/SynCloudOSProvider/);
  });

  it("waits for positive finite bounds and clears a drawing when its bounds collapse", () => {
    const { runtime, resize } = drawingRuntime(0, 0);
    const draw = vi.fn();
    const view = render(<SynCloudOSProvider runtime={runtime}><NSEView draw={draw} /></SynCloudOSProvider>);
    expect(draw).not.toHaveBeenCalled();
    resize({ width: 200, height: 100 });
    expect(draw).toHaveBeenCalled();
    resize({ width: 0, height: 100 });
    expect(view.container.querySelector("svg")).toBeNull();
    resize({ width: NaN, height: Infinity });
    expect(view.container.querySelector("svg")).toBeNull();
    runtime.dispose();
  });

  it("uses the nearest runtime and keeps definition IDs distinct between views and displays", () => {
    const outer = drawingRuntime(400, 300), inner = drawingRuntime(80, 40);
    const draw = (_rect: unknown, context: GFXContext) => {
      context.setFill(new GFXGradient([
        { offset: 0, colour: GFXColour.parse("#000") },
        { offset: 1, colour: GFXColour.parse("#fff") },
      ], { kind: "linear", start: { x: 0, y: 0 }, end: { x: 1, y: 1 } }));
      context.fill(GFXPath.rect({ x: 0, y: 0, width: 10, height: 10 }));
    };
    const content = () => <SynCloudOSProvider runtime={outer.runtime}><NSEView draw={draw} /><SynCloudOSProvider runtime={inner.runtime}><NSEView draw={draw} /><NSEView draw={draw} /></SynCloudOSProvider></SynCloudOSProvider>;
    const view = render(content());
    expect([...view.container.querySelectorAll("svg")].map(svg => svg.getAttribute("viewBox"))).toEqual(["0 0 400 300", "0 0 80 40", "0 0 80 40"]);
    const ids = [...view.container.querySelectorAll("linearGradient")].map(node => node.id);
    expect(new Set(ids).size).toBe(3);
    view.rerender(content());
    expect([...view.container.querySelectorAll("linearGradient")].every(node => !ids.includes(node.id))).toBe(true);
    view.unmount();
    outer.runtime.dispose(); inner.runtime.dispose();
  });

  it("releases the old geometry subscription when a provider changes or draw is removed", () => {
    const first = drawingRuntime(), second = drawingRuntime(40, 20);
    const content = (runtime = first.runtime, draw: (() => void) | undefined = () => {}) => <SynCloudOSProvider runtime={runtime}><NSEView draw={draw} /></SynCloudOSProvider>;
    const view = render(content());
    view.rerender(content(second.runtime));
    expect(first.release).toHaveBeenCalledOnce();
    expect(view.container.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 40 20");
    view.rerender(<SynCloudOSProvider runtime={second.runtime}><NSEView /></SynCloudOSProvider>);
    expect(second.release).toHaveBeenCalledOnce();
    expect(view.container.querySelector("svg")).toBeNull();
    view.unmount();
    first.runtime.dispose(); second.runtime.dispose();
  });

  it("refuses to redraw through a disposed runtime's retained identifier authority", async () => {
    const { runtime } = drawingRuntime();
    const content = () => <SynCloudOSProvider runtime={runtime}><NSEView draw={() => {}} /></SynCloudOSProvider>;
    const view = render(content());
    await runtime.dispose();
    expect(() => view.rerender(content())).toThrow();
  });

  it("composes draw with a contextual menu, tooltip, appearance and subviews", async () => {
    const { runtime } = drawingRuntime();
    const menu = new NSEMenu({ identifier: "figure-menu", title: "Figure menu", items: [], standalone: true, runtime: {
      signal: runtime.signal,
      commands: { getPresentationGeneration: () => ({ registryGeneration: 0, responderGeneration: 0 }), validateMany: async () => new Map(), prepareDispatch: vi.fn(), dispatch: vi.fn() },
    } });
    function AppearanceProbe() { return <output>{useNSEAppearance().resolvedColourScheme}</output>; }
    function Figure() {
      const overlayPort = useRuntimeNSEOverlayPort("runtime");
      return <NSEOverlayProvider runtimePort={overlayPort} defaultParentResponderId="runtime">
        <NSEView menu={menu} toolTip="Figure details" appearance={new NSEAppearance("darkAqua")} draw={(rect, context) => context.fill(GFXPath.rect(rect))}>
          <AppearanceProbe />
        </NSEView>
      </NSEOverlayProvider>;
    }
    const view = render(<SynCloudOSProvider runtime={runtime}><RuntimeInputBoundary><Figure /></RuntimeInputBoundary></SynCloudOSProvider>);
    const host = screen.getByTitle("Figure details");
    expect(screen.getByText("dark")).toBeTruthy();
    expect(host.querySelector("svg path")).not.toBeNull();
    fireEvent.contextMenu(host, { clientX: 60, clientY: 40 });
    const popup = await screen.findByRole("menu");
    expect(popup.closest("[data-nse-colour-scheme-resolved]")?.getAttribute("data-nse-colour-scheme-resolved")).toBe("dark");
    expect(host.getAttribute("aria-expanded")).toBe("true");
    view.unmount();
    menu.dispose(); await runtime.dispose();
  });
});
