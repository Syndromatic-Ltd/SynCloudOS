// @vitest-environment jsdom
import React, { useEffect } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NSEViewController, nseUpdateTraits } from "../../../src/NSE/Application/NSEViewController";
import { NSESplitViewController, NSESplitViewItem } from "../../../src/NSE/DataViews/Split";
import { nseSplitViewLayout } from "../../../src/NSE/DataViews/Split/NSESplitViewController";
import { ViewControllerView } from "../../../src/SynCloudOS/AppHosting/applicationHosting";
import { createStaticPresentationTraits } from "../../fixtures/presentationTraits";
import { AnimationEnvironmentProvider } from "../../../src/NSE/Animation/NSEAnimationEnvironment";

const controllers: NSESplitViewController[] = [];
afterEach(() => { cleanup(); for (const controller of controllers.splice(0)) controller.dispose(); });

function frameClock() {
  let time = 0;
  const pending = new Set<(time: number) => void>();
  const listeners = new Set<() => void>();
  const frames = {
    now: () => time, reducedMotion: false, suspended: false,
    requestFrame(callback: (time: number) => void) { pending.add(callback); return () => { pending.delete(callback); }; },
    subscribeState(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
  return { frames, pending, listeners,
    step(seconds: number) { act(() => { time += seconds; const callbacks = [...pending]; pending.clear(); for (const callback of callbacks) callback(time); }); },
    reduce() { act(() => { frames.reducedMotion = true; for (const listener of listeners) listener(); }); },
  };
}

function workspace() {
  const mounted = vi.fn(), unmounted = vi.fn();
  function Editor({ name }: { name: string }) {
    useEffect(() => { mounted(name); return () => unmounted(name); }, [name]);
    return <label>{name}<input defaultValue={`${name} draft`} /></label>;
  }
  class Pane extends NSEViewController {
    constructor(readonly name: string) { super({ title: name }); }
    override renderView() { return <Editor name={this.name} />; }
  }
  const controller = new NSESplitViewController({ id: "animated-workspace", title: "Three pane workspace", splitViewItems: [
    new NSESplitViewItem({ identifier: "sidebar", viewController: new Pane("Sidebar"), behavior: "sidebar", minimumThickness: 200, maximumThickness: 300, preferredThicknessFraction: 0.2 }),
    new NSESplitViewItem({ identifier: "content", viewController: new Pane("Content"), minimumThickness: 320 }),
    new NSESplitViewItem({ identifier: "inspector", viewController: new Pane("Inspector"), behavior: "inspector", minimumThickness: 220, maximumThickness: 320, preferredThicknessFraction: 0.25 }),
  ] });
  controllers.push(controller);
  controller[nseSplitViewLayout].resize(1200);
  return { controller, mounted, unmounted };
}

function mountWorkspace(controller: NSESplitViewController, clock: ReturnType<typeof frameClock>, reducedMotion = false) {
  const view = render(<AnimationEnvironmentProvider frames={clock.frames} reducedMotion={reducedMotion}><ViewControllerView controller={controller} /></AnimationEnvironmentProvider>);
  act(() => controller[nseUpdateTraits]({ ...controller.traitCollection, presentation: createStaticPresentationTraits({ width: 1200, height: 800 }) }));
  return view;
}

it("animates a collapsed inspector while immediately removing its interaction and preserving its editor", () => {
  const { controller, mounted, unmounted } = workspace();
  const clock = frameClock();
  mountWorkspace(controller, clock);
  const editor = screen.getByRole("textbox", { name: "Inspector" }) as HTMLInputElement;
  editor.value = "Unsaved inspector edit";
  editor.focus();
  const initial = controller.snapshot.items[2]!.thickness;
  act(() => controller.toggleInspector());
  expect(controller.snapshot.items[2]!.isCollapsed).toBe(true);
  const collapsing = document.querySelector<HTMLElement>('[data-pane-id="inspector"]')!;
  expect(collapsing).not.toBeNull();
  expect(collapsing.hasAttribute("inert")).toBe(true);
  expect(collapsing.getAttribute("aria-hidden")).toBe("true");
  expect(document.activeElement?.closest('[data-pane-id="inspector"]')).toBeNull();
  expect(clock.pending.size).toBe(1);
  clock.step(0.1);
  expect(parseFloat(collapsing.style.flexBasis)).toBeGreaterThan(0);
  expect(parseFloat(collapsing.style.flexBasis)).toBeLessThan(initial);
  clock.step(0.2);
  expect(document.querySelector('[data-pane-id="inspector"]')).toBeNull();
  expect(clock.pending.size).toBe(0);
  act(() => controller.toggleInspector());
  clock.step(0.3);
  expect(screen.getByRole("textbox", { name: "Inspector" })).toBe(editor);
  expect(editor.value).toBe("Unsaved inspector edit");
  expect(mounted).toHaveBeenCalledTimes(3);
  expect(unmounted).not.toHaveBeenCalled();
});

it("reverses an in-flight sidebar collapse from its presented thickness and cancels on unmount", () => {
  const { controller } = workspace();
  const clock = frameClock();
  const view = mountWorkspace(controller, clock);
  const initial = controller.snapshot.items[0]!.thickness;
  act(() => controller.toggleSidebar());
  clock.step(0.08);
  const pane = document.querySelector<HTMLElement>('[data-pane-id="sidebar"]')!;
  expect(pane).not.toBeNull();
  const interrupted = parseFloat(pane.style.flexBasis);
  expect(interrupted).toBeGreaterThan(0);
  expect(interrupted).toBeLessThan(initial);
  act(() => controller.toggleSidebar());
  expect(parseFloat(pane.style.flexBasis)).toBe(interrupted);
  expect(pane.hasAttribute("inert")).toBe(false);
  clock.step(0.3);
  expect(parseFloat(pane.style.flexBasis)).toBe(controller.snapshot.items[0]!.thickness);
  act(() => controller.toggleSidebar());
  expect(clock.pending.size).toBe(1);
  view.unmount();
  expect(clock.pending.size).toBe(0);
  expect(clock.listeners.size).toBe(0);
});

it.each(["environment", "controller"] as const)("settles collapse immediately for %s reduced motion", source => {
  const { controller } = workspace();
  const clock = frameClock();
  mountWorkspace(controller, clock, source === "environment");
  if (source === "controller") act(() => controller[nseUpdateTraits]({ ...controller.traitCollection, reducedMotion: true }));
  screen.getByRole("textbox", { name: "Inspector" }).focus();
  act(() => controller.toggleInspector());
  expect(document.querySelector('[data-pane-id="inspector"]')).toBeNull();
  expect(clock.pending.size).toBe(0);
  expect(document.activeElement).not.toBe(document.body);
});

it("settles a running collapse when the shared scheduler changes to reduced motion", () => {
  const { controller } = workspace();
  const clock = frameClock();
  mountWorkspace(controller, clock);
  act(() => controller.toggleInspector());
  expect(clock.pending.size).toBe(1);
  clock.reduce();
  expect(document.querySelector('[data-pane-id="inspector"]')).toBeNull();
  expect(clock.pending.size).toBe(0);
});

it("exposes each three-pane seam's constrained value and keeps keyboard resizing immediate", () => {
  const { controller } = workspace();
  const clock = frameClock();
  mountWorkspace(controller, clock);
  const first = screen.getByRole("separator", { name: "Resize Sidebar and Content" });
  const second = screen.getByRole("separator", { name: "Resize Content and Inspector" });
  expect(first.getAttribute("aria-valuenow")).toBe(String(controller.snapshot.items[0]!.thickness));
  expect(first.getAttribute("aria-valuemin")).toBe("200");
  expect(first.getAttribute("aria-valuemax")).toBe("300");
  const before = controller.snapshot.items[0]!.thickness;
  fireEvent.keyDown(first, { key: "ArrowRight" });
  expect(controller.snapshot.items[0]!.thickness).toBe(before + 16);
  expect(clock.pending.size).toBe(0);
  expect(second.getAttribute("aria-orientation")).toBe("vertical");
});

it("animates the existing two-pane grid without remounting its inspector", () => {
  const { controller } = workspace();
  controller.removeSplitViewItem(controller.splitViewItems[0]!);
  const clock = frameClock();
  mountWorkspace(controller, clock);
  const editor = screen.getByRole("textbox", { name: "Inspector" });
  const grid = document.querySelector<HTMLElement>(".nse-split-view")!;
  const initial = parseFloat(grid.style.getPropertyValue("--nse-split-sidebar"));
  act(() => controller.toggleInspector());
  expect(document.querySelector('[data-pane-id="inspector"]')?.hasAttribute("inert")).toBe(true);
  clock.step(0.1);
  expect(parseFloat(grid.style.getPropertyValue("--nse-split-sidebar"))).toBeGreaterThan(initial);
  expect(parseFloat(grid.style.getPropertyValue("--nse-split-sidebar"))).toBeLessThan(controller.snapshot.availableSize);
  clock.step(0.2);
  expect(document.querySelector('[data-pane-id="inspector"]')).toBeNull();
  act(() => controller.toggleInspector());
  clock.step(0.3);
  expect(screen.getByRole("textbox", { name: "Inspector" })).toBe(editor);
});

it("cancels presentation work when the view stops exposing its panes", () => {
  const { controller } = workspace();
  const clock = frameClock();
  mountWorkspace(controller, clock);
  act(() => controller.toggleSidebar());
  expect(clock.pending.size).toBe(1);
  act(() => { controller.state = { kind: "denied", message: "Access denied" }; });
  expect(clock.pending.size).toBe(0);
  expect(document.querySelector("[data-pane-id]")).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
});
