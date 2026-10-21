// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEAnimationEnvironmentProvider, type NSEAnimator } from "../../src/NSE/Animation";
import { defineNSETheme, NSEThemeProvider } from "../../src/NSE/Appearance";
import { NSETabBar, NSETabBarController } from "../../src/NSE/Navigation";
import type { AFXAnimationDefinition, AFXAnimationHandle, AFXAnimationSettlement } from "../../src/FX/AnimationFX/animationTypes";

afterEach(cleanup);
const neutral = defineNSETheme({ id: "test.motion-base", displayName: "Base" });
const moving = defineNSETheme({ id: "test.motion", displayName: "Motion", presentation: {
  ...neutral.presentation, motion: { ...neutral.presentation.motion, peerNavigation: { kind: "slide", durationMs: 300, easing: "decelerate" } },
}});
function setup() {
  const release = vi.fn();
  const played: { target: HTMLElement; definition: AFXAnimationDefinition; handle: AFXAnimationHandle; finish: () => void }[] = [];
  const animator: NSEAnimator = { ownerAppId: "test", animations: {
    acquireOwner: owner => ({ ...owner, epoch: 1, release }),
    animate(target, definition) {
      let state: AFXAnimationHandle["state"] = "running";
      let resolve!: (value: AFXAnimationSettlement) => void;
      const finished = new Promise<AFXAnimationSettlement>(done => { resolve = done; });
      const settle = (next: AFXAnimationSettlement["state"]) => { if (state !== "running") return; state = next; resolve({ state: next, reduced: false }); };
      const handle: AFXAnimationHandle = { id: String(played.length), get state() { return state; }, finished, progress: 0, cancel: () => settle("cancelled"), pause() {}, resume() {}, seek() {} };
      played.push({ target: target as HTMLElement, definition: definition as AFXAnimationDefinition, handle, finish: () => settle("completed") });
      return handle;
    },
  } as NSEAnimator["animations"] };
  const tabs = new NSETabBarController<React.ReactNode>({ id: "motion", destinations: ["one", "two", "three"].map(id => ({ id, label: id, icon: { kind: "template" as const, name: id }, createContent: () => <input aria-label={`Draft ${id}`} defaultValue={id} /> })) });
  const fixture = (reducedMotion = false, theme = moving, dir?: "ltr" | "rtl") => <NSEThemeProvider theme={theme}><NSEAnimationEnvironmentProvider animator={animator} reducedMotion={reducedMotion}><NSETabBar controller={tabs} aria-label="Peers" dir={dir} /></NSEAnimationEnvironmentProvider></NSEThemeProvider>;
  return { tabs, fixture, played, release };
}

describe("declarative peer motion", () => {
  it("commits selection immediately while coordinating inert outgoing and active incoming retained panes", async () => {
    const { tabs, fixture, played, release } = setup();
    const view = render(fixture());
    const original = screen.getByRole("textbox", { name: "Draft one" });
    await act(async () => { await tabs.select("two"); });
    expect(tabs.getSnapshot().selectedDestinationId).toBe("two");
    expect(played).toHaveLength(2);
    const outgoing = view.container.querySelector('[data-nse-peer-motion="exiting"]')!;
    expect(outgoing.hasAttribute("hidden")).toBe(false);
    expect(outgoing.hasAttribute("inert")).toBe(true);
    expect(outgoing.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getByRole("textbox").getAttribute("aria-label")).toBe("Draft two");
    expect(played[0]!.definition.duration).toBe(0.3);
    // Completed exits must never hold a transform on a retained destination.
    expect(played.every(item => item.definition.fill === "backwards")).toBe(true);
    expect(played[1]!.definition.timing).toEqual({ kind: "cubic-bezier", x1: 0.1, y1: 0.9, x2: 0.2, y2: 1 });
    expect(played[1]!.definition.animations[0]!.from).toContain("100%");
    await act(async () => { played.forEach(item => item.finish()); });
    expect(view.container.querySelector('[data-nse-peer-transition="running"]')).toBeNull();
    expect(original.closest('[data-nse-tab-panel]')!.hasAttribute("hidden")).toBe(true);
    expect(release).toHaveBeenCalledTimes(1);
    view.unmount(); tabs.dispose();
  });

  it("cancels superseded transitions, continues current presentation, and ignores late settlement", async () => {
    const { tabs, fixture, played } = setup();
    const view = render(fixture());
    await act(async () => { await tabs.select("two"); });
    const two = screen.getByRole("textbox");
    two.closest<HTMLElement>("[data-nse-tab-panel]")!.style.transform = "matrix(1, 0, 0, 1, 40, 0)";
    await act(async () => { await tabs.select("three"); });
    expect(played.slice(0, 2).every(item => item.handle.state === "cancelled")).toBe(true);
    expect(played).toHaveLength(4);
    expect(played[2]!.definition.animations[0]!.from).toBe("matrix(1, 0, 0, 1, 40, 0)");
    expect(tabs.getSnapshot().selectedDestinationId).toBe("three");
    expect(view.container.querySelector('[data-nse-peer-motion="exiting"]')!.contains(two)).toBe(true);
    await act(async () => { played.slice(0, 2).forEach(item => item.finish()); });
    expect(view.container.querySelector('[data-nse-peer-motion="entering"]')!.getAttribute("data-nse-tab-panel")).toBe("three");
    view.unmount();
    expect(played.every(item => item.handle.state === "cancelled")).toBe(true);
    tabs.dispose();
  });

  it("mirrors slides using the public dir prop and retains nodes when direction changes", async () => {
    const { tabs, fixture, played } = setup();
    const view = render(fixture(false, moving, "rtl"));
    const host = view.container.querySelector<HTMLElement>("[data-nse-navigation-destination-host]")!;
    expect(host.getAttribute("dir")).toBe("rtl");
    const original = screen.getByRole("textbox", { name: "Draft one" });
    await act(async () => { await tabs.select("two"); });
    expect(played[1]!.definition.animations[0]!.from).toContain("-100%");
    await act(async () => { played.forEach(item => item.finish()); });
    await act(async () => { await tabs.select("one"); });
    expect(played[3]!.definition.animations[0]!.from).toContain("100%");
    expect(played[3]!.definition.animations[0]!.from).not.toContain("-100%");
    view.rerender(fixture(false, moving, "ltr"));
    expect(view.container.querySelector("[data-nse-navigation-destination-host]")).toBe(host);
    expect(host.getAttribute("dir")).toBe("ltr");
    expect(screen.getByRole("textbox", { name: "Draft one" })).toBe(original);
    view.unmount(); tabs.dispose();
  });

  it("settles immediately for reduced motion and cancels when the preference changes", async () => {
    const { tabs, fixture, played } = setup();
    const view = render(fixture(true));
    await act(async () => { await tabs.select("two"); });
    expect(played).toHaveLength(0);
    view.rerender(fixture(false));
    await act(async () => { await tabs.select("three"); });
    expect(played).toHaveLength(2);
    view.rerender(fixture(true));
    expect(played.every(item => item.handle.state === "cancelled")).toBe(true);
    expect(view.container.querySelector('[data-nse-peer-transition="running"]')).toBeNull();
    expect(screen.getByRole("textbox").getAttribute("aria-label")).toBe("Draft three");
    view.unmount(); tabs.dispose();
  });

  it("uses neutral no-motion defaults and never waits for an unavailable animator", async () => {
    const { tabs, fixture, played } = setup();
    const view = render(fixture(false, neutral));
    await act(async () => { await tabs.select("two"); });
    expect(played).toHaveLength(0);
    view.rerender(<NSEThemeProvider theme={moving}><NSETabBar controller={tabs} aria-label="Peers" /></NSEThemeProvider>);
    await act(async () => { await tabs.select("three"); });
    expect(screen.getByRole("textbox").getAttribute("aria-label")).toBe("Draft three");
    view.unmount(); tabs.dispose();
  });
});
