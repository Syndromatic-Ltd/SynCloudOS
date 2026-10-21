// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSENavigationDestinationHost } from "../../src/NSE/Navigation/NSENavigationDestinationHost";
import { NSETabBarController } from "../../src/NSE/Navigation/NSETabBarController";
import { panoramaSlot } from "../../src/NSE/Navigation/usePanoramaNavigation";
import { NSESourceListScene } from "../../src/NSE/Navigation/SourceList";
import { NSEAdaptiveNavigationController } from "../../src/NSE/Navigation/NSEAdaptiveNavigationController";
import { createStaticPresentationTraits } from "../fixtures/presentationTraits";
import { defineNSETheme } from "../../src/NSE/Appearance";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function pointer(target: Element, type: string, x: number, y: number, pointerType = "touch", time?: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true }, button: { value: 0 }, clientX: { value: x }, clientY: { value: y }, pointerType: { value: pointerType }, buttons: { value: type === "pointerup" ? 0 : 1 } });
  if (time !== undefined) Object.defineProperty(event, "timeStamp", { value: time });
  fireEvent(target, event);
}
function fixture(count = 3) {
  const controller = new NSETabBarController<React.ReactNode>({ id: "panorama-test", destinations: Array.from({ length: count }, (_, index) => ({ id: String(index), label: `Section ${index}`, icon: { kind: "template" as const, name: "item" }, createContent: () => <input aria-label={`Draft ${index}`} defaultValue={`Value ${index}`} /> })) });
  const element = (panorama = true, dir: "ltr" | "rtl" = "ltr", reducedMotion = true) => <NSENavigationDestinationHost controller={controller} idScope="test" panorama={panorama ? { title: "people" } : undefined} reducedMotion={reducedMotion} dir={dir} />;
  return { controller, element };
}
describe("retained Panorama presentation", () => {
  it("reveals genuine neighbors while exposing only the selected app to assistive technology", () => {
    const { controller, element } = fixture(); const view = render(element());
    expect(view.container.querySelectorAll("input")).toHaveLength(3);
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    const peek = view.container.querySelector('[data-nse-tab-panel="1"]')!;
    expect(peek.hasAttribute("hidden")).toBe(false);
    expect(peek.hasAttribute("inert")).toBe(true);
    expect(peek.getAttribute("aria-hidden")).toBe("true");
    expect(view.container.querySelectorAll(".nse-panorama-title")).toHaveLength(1);
    controller.dispose();
  });
  it("wraps in both directions and keeps each content node across renderer and direction changes", async () => {
    const { controller, element } = fixture(); const view = render(element());
    const nodes = Array.from(view.container.querySelectorAll("input"));
    fireEvent.change(nodes[1], { target: { value: "Retained neighbor draft" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Previous section" })); });
    expect(controller.getSnapshot().selectedDestinationId).toBe("2");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Next section" })); });
    expect(controller.getSnapshot().selectedDestinationId).toBe("0");
    view.rerender(element(false)); view.rerender(element(true, "rtl"));
    expect(Array.from(view.container.querySelectorAll("input"))).toEqual(nodes);
    expect(nodes[1].value).toBe("Retained neighbor draft");
    controller.dispose();
  });
  it("supports heading activation and keyboard navigation as explicit desktop adaptations", async () => {
    const { controller, element } = fixture(); render(element());
    await act(async () => { fireEvent.click(screen.getByRole("tab", { name: "Section 1" })); });
    expect(controller.getSnapshot().selectedDestinationId).toBe("1");
    await act(async () => { fireEvent.keyDown(screen.getByRole("tab", { name: "Section 1" }), { key: "ArrowRight" }); });
    expect(controller.getSnapshot().selectedDestinationId).toBe("2");
    controller.dispose();
  });
  it("handles one and two destinations without duplicate content trees", async () => {
    const one = fixture(1); const view = render(one.element());
    expect(screen.getByRole("button", { name: "Next section" }).hasAttribute("disabled")).toBe(true);
    expect(view.container.querySelectorAll("input")).toHaveLength(1); view.unmount(); one.controller.dispose();
    const two = fixture(2); const next = render(two.element());
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Previous section" })); });
    expect(two.controller.getSnapshot().selectedDestinationId).toBe("1");
    expect(next.container.querySelectorAll("input")).toHaveLength(2); two.controller.dispose();
  });
  it("commits horizontal gestures, cancels safely, and preserves vertical scrolling and editable controls", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 480, height: 600, x: 0, y: 0, top: 0, left: 0, bottom: 600, right: 480, toJSON() {} });
    const { controller, element } = fixture(); const view = render(element());
    const host = view.container.querySelector('[data-nse-panorama="true"]')!;
    await act(async () => { pointer(host, "pointerdown", 200, 100); pointer(host, "pointermove", 80, 105); pointer(host, "pointerup", 80, 105); });
    expect(controller.getSnapshot().selectedDestinationId).toBe("1");
    await act(async () => { pointer(host, "pointerdown", 200, 100); pointer(host, "pointermove", 80, 105); pointer(host, "pointercancel", 80, 105); });
    expect(controller.getSnapshot().selectedDestinationId).toBe("1");
    await act(async () => { pointer(host, "pointerdown", 200, 100); pointer(host, "pointermove", 195, 240); pointer(host, "pointerup", 195, 240); });
    expect(controller.getSnapshot().selectedDestinationId).toBe("1");
    const input = screen.getByRole("textbox");
    await act(async () => { pointer(input, "pointerdown", 200, 100); pointer(input, "pointermove", 80, 105); pointer(input, "pointerup", 80, 105); });
    expect(controller.getSnapshot().selectedDestinationId).toBe("1");
    view.unmount(); controller.dispose();
  });
  it("reverses a two-panel track without duplicating or overlapping slots", () => {
    expect([panoramaSlot(0, .1, 2), panoramaSlot(1, .1, 2)]).toEqual([0, 1]);
    expect([panoramaSlot(0, -.1, 2), panoramaSlot(1, -.1, 2)]).toEqual([0, -1]);
    expect([panoramaSlot(0, -1, 2), panoramaSlot(1, -1, 2)]).toEqual([0, -1]);
  });
  it("repairs focus when a focused app becomes an inert neighbor", async () => {
    const { controller, element } = fixture(); render(element());
    screen.getByRole("textbox").focus();
    await act(async () => { await controller.select("1"); });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Section 1" }));
    controller.dispose();
  });
  it("settles fractional positions on renderer re-entry and when reduced motion turns on", async () => {
    const frames = new Map<number, FrameRequestCallback>(); let serial = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { frames.set(++serial, callback); return serial; });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(id => { frames.delete(id); });
    vi.spyOn(performance, "now").mockReturnValue(0);
    const { controller, element } = fixture(); const view = render(element(true, "ltr", false));
    await act(async () => { await controller.select("1"); });
    act(() => { const entries = [...frames.values()]; frames.clear(); entries.forEach(callback => callback(100)); });
    const selected = view.container.querySelector<HTMLElement>('[data-nse-tab-panel="1"]')!;
    expect(selected.style.transform).not.toBe("translateX(0px)");
    view.rerender(element(false, "ltr", false)); view.rerender(element(true, "ltr", false));
    expect(selected.style.transform).toBe("translateX(0px)");
    await act(async () => { await controller.select("2"); });
    act(() => { const entries = [...frames.values()]; frames.clear(); entries.forEach(callback => callback(100)); });
    view.rerender(element(true, "ltr", true));
    expect(view.container.querySelector<HTMLElement>('[data-nse-tab-panel="2"]')!.style.transform).toBe("translateX(0px)");
    expect(frames.size).toBe(0);
    view.unmount(); controller.dispose();
  });
  it("distinguishes short flicks from slow drags, pauses and reversed releases in both directions", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 480, height: 600, x: 0, y: 0, top: 0, left: 0, bottom: 600, right: 480, toJSON() {} });
    const { controller, element } = fixture(); const view = render(element());
    const host = view.container.querySelector('[data-nse-panorama="true"]')!;
    const gesture = async (points: Array<[number, number]>) => act(async () => {
      pointer(host, "pointerdown", points[0][0], 100, "touch", points[0][1]);
      for (const [x, time] of points.slice(1, -1)) pointer(host, "pointermove", x, 100, "touch", time);
      const [x, time] = points.at(-1)!; pointer(host, "pointerup", x, 100, "touch", time);
    });
    await gesture([[200, 0], [170, 20], [170, 25]]); // 30px quick flick, below .18 panels.
    expect(controller.getSnapshot().selectedDestinationId).toBe("1");
    await gesture([[200, 100], [170, 300], [170, 320]]); // Same distance slowly.
    expect(controller.getSnapshot().selectedDestinationId).toBe("1");
    await gesture([[200, 400], [170, 420], [170, 600]]); // Fast movement, paused release.
    expect(controller.getSnapshot().selectedDestinationId).toBe("1");
    await gesture([[200, 700], [60, 720], [100, 750], [110, 760]]); // Net left, fast right release.
    expect(controller.getSnapshot().selectedDestinationId).toBe("1");
    view.rerender(element(true, "rtl"));
    await gesture([[200, 1000], [230, 1020], [230, 1025]]);
    expect(controller.getSnapshot().selectedDestinationId).toBe("2");
    view.unmount(); controller.dispose();
  });
  it("does not restart motion when a pending selection rejects after unmount", async () => {
    const frames = new Map<number, FrameRequestCallback>(); let serial = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { frames.set(++serial, callback); return serial; });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(id => { frames.delete(id); });
    let rejectSelection!: (error: Error) => void;
    const controller = new NSETabBarController<React.ReactNode>({ id: "pending-panorama", onSelect: () => new Promise<void>((_, reject) => { rejectSelection = reject; }), destinations: ["a", "b"].map(id => ({ id, label: id, icon: { kind: "template" as const, name: id } })) });
    const view = render(<NSENavigationDestinationHost controller={controller} idScope="pending" panorama={{ title: "Pending" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Next section" }));
    view.unmount();
    await act(async () => { rejectSelection(new Error("Cancelled externally")); });
    expect(frames.size).toBe(0);
    controller.dispose();
  });
  it("preserves mouse text selection in app content, including whitespace origins", async () => {
    const controller = new NSETabBarController<React.ReactNode>({ id: "text-panorama", destinations: ["a", "b"].map(id => ({ id, label: id, icon: { kind: "template" as const, name: id }, createContent: () => <section data-testid={`text-${id}`}><p>Selectable paragraph inside an app-owned section.</p></section> })) });
    const view = render(<NSENavigationDestinationHost controller={controller} idScope="text" panorama={{ title: "Reading" }} reducedMotion />);
    const section = screen.getByTestId("text-a");
    await act(async () => { pointer(section, "pointerdown", 200, 100, "mouse", 0); pointer(section, "pointermove", 50, 100, "mouse", 20); pointer(section, "pointerup", 50, 100, "mouse", 25); });
    expect(controller.getSnapshot().selectedDestinationId).toBe("a");
    // A selection emerging after a blank origin must also abort before lock.
    const host = view.container.querySelector('[data-nse-panorama="true"]')!;
    vi.spyOn(window, "getSelection").mockReturnValue({ toString: () => "" } as Selection);
    pointer(host, "pointerdown", 200, 100, "mouse", 100);
    vi.mocked(window.getSelection).mockReturnValue({ toString: () => "Selected text" } as Selection);
    await act(async () => { pointer(host, "pointermove", 50, 100, "mouse", 120); pointer(host, "pointerup", 50, 100, "mouse", 125); });
    expect(controller.getSnapshot().selectedDestinationId).toBe("a");
    view.unmount(); controller.dispose();
  });
  it("inherits RTL through the source-list split and follows live ancestor direction changes without remounting", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 480, height: 600, x: 0, y: 0, top: 0, left: 0, bottom: 600, right: 480, toJSON() {} });
    const { controller } = fixture();
    const adaptive = new NSEAdaptiveNavigationController<React.ReactNode>({ id: "rtl-panorama", model: "peer", tabController: controller, traits: createStaticPresentationTraits({ width: 480, height: 600, reducedMotion: true }) });
    const presentation = { kind: "panorama" as const, placement: "block-start" as const, flow: "in-flow" as const, content: "label" as const, overflow: { kind: "scroll" as const } };
    const view = render(<div dir="rtl"><NSESourceListScene projection={{ controller, adaptiveController: adaptive, presentation, title: "Reading" }} /></div>);
    await act(async () => {});
    const input = screen.getByRole("textbox");
    const next = view.container.querySelector<HTMLElement>('[data-nse-tab-panel="1"]')!;
    expect(view.container.querySelector(".nse-split-view")!.getAttribute("dir")).toBe("rtl");
    expect(next.style.transform).toBe("translateX(-432px)");
    await act(async () => { view.container.firstElementChild!.setAttribute("dir", "ltr"); });
    expect(view.container.querySelector(".nse-split-view")!.getAttribute("dir")).toBe("ltr");
    expect(next.style.transform).toBe("translateX(432px)");
    expect(screen.getByRole("textbox")).toBe(input);
    view.unmount(); adaptive.dispose(); controller.dispose();
  });
  it("uses unique cyclic slots and permits neutral declarative themes", () => {
    expect(panoramaSlot(2, .99, 3)).toBe(2);
    expect(panoramaSlot(0, 1.01, 3)).toBe(3);
    for (const count of [2, 3, 5]) for (const position of [-5.8, -1, -.2, 0, .2, 1, 8.8]) {
      expect(new Set(Array.from({ length: count }, (_, i) => panoramaSlot(i, position, count))).size).toBe(count);
    }
    const base = defineNSETheme({ id: "example.base", displayName: "Base" });
    const presentation = { kind: "panorama" as const, placement: "block-start" as const, flow: "in-flow" as const, content: "label" as const, overflow: { kind: "scroll" as const } };
    const theme = defineNSETheme({ id: "example.any-identity", displayName: "Any", presentation: { ...base.presentation, peerNavigation: { compact: presentation, regular: presentation } } });
    expect(theme.presentation.peerNavigation.compact.kind).toBe("panorama");
  });
});
