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
import React, { useMemo, useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEOverlayProvider } from "../../../src/NSE/Overlays";
import { NSETooltipProvider, useNSETooltip } from "../../../src/NSE/Tooltips";

interface ScheduledTask {
  readonly callback: () => void;
  readonly delayMs: number;
}

function createScheduler() {
  let nextHandle = 1;
  const pending = new Map<number, ScheduledTask>();
  const scheduler = {
    setTimeout: vi.fn((callback: () => void, delayMs: number) => {
      const handle = nextHandle++;
      pending.set(handle, { callback, delayMs });
      return handle;
    }),
    clearTimeout: vi.fn((handle: unknown) => {
      pending.delete(handle as number);
    }),
    runDelay(delayMs: number) {
      const task = [...pending.entries()].find(([, candidate]) => candidate.delayMs === delayMs);
      if (!task) throw new Error(`No scheduled tooltip task for ${delayMs}ms.`);
      pending.delete(task[0]);
      task[1].callback();
    },
    get pendingDelays() { return [...pending.values()].map((task) => task.delayMs); },
  };
  return scheduler;
}

const workAreaSnapshot = Object.freeze({
  width: 1280,
  height: 720,
  safeArea: Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 }),
});

function presentationSnapshot(reducedMotion: boolean) {
  return Object.freeze({
    revision: 1,
    contentBounds: Object.freeze({ x: 0, y: 0, width: 1280, height: 720 }),
    hostViewportBounds: Object.freeze({ x: 0, y: 0, width: 1280, height: 720 }),
    horizontalSizeClass: "wide" as const,
    orientation: "landscape" as const,
    workArea: Object.freeze({ x: 0, y: 0, width: 1280, height: 720 }),
    visualViewportBounds: Object.freeze({ x: 0, y: 0, width: 1280, height: 720 }),
    safeAreaInsets: Object.freeze({ blockStart: 0, inlineEnd: 0, blockEnd: 0, inlineStart: 0 }),
    virtualKeyboardInset: 0,
    devicePixelRatio: 1,
    primaryPointer: "fine" as const,
    hover: true,
    touch: false,
    reducedMotion,
    reducedTransparency: false,
    forcedColours: false,
  });
}

function TooltipHarness({
  scheduler,
  reducedMotion = false,
  runtimeController,
  children,
}: {
  readonly scheduler: ReturnType<typeof createScheduler>;
  readonly reducedMotion?: boolean;
  readonly runtimeController?: AbortController;
  readonly children: React.ReactNode;
}) {
  const runtimePort = useMemo(() => ({
    runtimeId: "runtime:tooltip-tests",
    signal: runtimeController?.signal ?? new AbortController().signal,
    environment: {
      browser: { getDocument: () => document, getWindow: () => window },
      workArea: { getSnapshot: () => workAreaSnapshot, subscribe: () => () => undefined },
      visualViewport: { getSnapshot: () => null, subscribe: () => () => undefined },
      presentation: {
        getSnapshot: () => presentationSnapshot(reducedMotion),
        subscribe: () => () => undefined,
      },
      setTimeout: scheduler.setTimeout,
      clearTimeout: scheduler.clearTimeout,
    },
    restoreFocus: vi.fn(),
    reportPlacementFailure: vi.fn(),
    wrapFocusScope: (_options: unknown, node: React.ReactNode) => node,
  }), [reducedMotion, runtimeController, scheduler]);
  return (
    <NSEOverlayProvider runtimePort={runtimePort}>
      <NSETooltipProvider leaveDelayMs={50}>{children}</NSETooltipProvider>
    </NSEOverlayProvider>
  );
}

function TooltipProbe({
  label,
  content,
  disabled = false,
  delayMs = 100,
  longPressOnCoarsePointer = true,
}: {
  readonly label: string;
  readonly content: React.ReactNode;
  readonly disabled?: boolean;
  readonly delayMs?: number;
  readonly longPressOnCoarsePointer?: boolean;
}) {
  const binding = useNSETooltip({ content, disabled, delayMs, longPressOnCoarsePointer });
  return <>{<button type="button" {...binding.anchorProps}>{label}</button>}{binding.tooltip}</>;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("NSE tooltip service", () => {
  it("cancels or closes a touch long press on move, up, and cancel", async () => {
    const scheduler = createScheduler();
    render(
      <TooltipHarness scheduler={scheduler}>
        <TooltipProbe label="Touch help" content="Touch guidance" />
      </TooltipHarness>,
    );
    const anchor = screen.getByRole("button", { name: "Touch help" });

    fireEvent.pointerDown(anchor, { pointerType: "touch", pointerId: 7 });
    expect(scheduler.pendingDelays).toContain(600);
    fireEvent.pointerMove(anchor, { pointerType: "touch", pointerId: 7, clientX: 30, clientY: 30 });
    expect(scheduler.pendingDelays).not.toContain(600);

    fireEvent.pointerDown(anchor, { pointerType: "touch", pointerId: 8 });
    scheduler.runDelay(600);
    expect((await screen.findByRole("tooltip")).textContent).toContain("Touch guidance");
    fireEvent.pointerUp(anchor, { pointerType: "touch", pointerId: 8 });
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());

    fireEvent.pointerDown(anchor, { pointerType: "touch", pointerId: 9 });
    scheduler.runDelay(600);
    expect(await screen.findByRole("tooltip")).toBeTruthy();
    fireEvent.pointerCancel(anchor, { pointerType: "touch", pointerId: 9 });
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  });

  it("shares hover delay, transfers immediately between siblings, and uses a leave grace period", async () => {
    const scheduler = createScheduler();
    render(
      <TooltipHarness scheduler={scheduler}>
        <TooltipProbe label="First" content="First help" />
        <TooltipProbe label="Second" content="Second help" />
      </TooltipHarness>,
    );

    const first = screen.getByRole("button", { name: "First" });
    const second = screen.getByRole("button", { name: "Second" });
    fireEvent.pointerEnter(first, { pointerType: "mouse" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(scheduler.pendingDelays).toContain(100);
    scheduler.runDelay(100);
    expect((await screen.findByRole("tooltip")).textContent).toContain("First help");

    fireEvent.pointerLeave(first, { pointerType: "mouse" });
    expect(scheduler.pendingDelays).toContain(50);
    fireEvent.pointerEnter(second, { pointerType: "mouse" });
    expect((await screen.findByRole("tooltip")).textContent).toContain("Second help");
    expect(scheduler.clearTimeout).toHaveBeenCalled();

    fireEvent.pointerLeave(second, { pointerType: "mouse" });
    scheduler.runDelay(50);
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  });

  it("retains the initial hover delay when a sibling replaces a still-pending tooltip", async () => {
    const scheduler = createScheduler();
    render(
      <TooltipHarness scheduler={scheduler}>
        <TooltipProbe label="Pending first" content="First pending help" />
        <TooltipProbe label="Pending second" content="Second pending help" />
      </TooltipHarness>,
    );

    fireEvent.pointerEnter(screen.getByRole("button", { name: "Pending first" }), { pointerType: "mouse" });
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Pending second" }), { pointerType: "mouse" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(scheduler.pendingDelays).toContain(100);
    scheduler.runDelay(100);
    expect((await screen.findByRole("tooltip")).textContent).toContain("Second pending help");
  });

  it("shows on keyboard focus, links aria-describedby only while open, and dismisses on Escape", async () => {
    const scheduler = createScheduler();
    render(
      <TooltipHarness scheduler={scheduler}>
        <TooltipProbe label="Keyboard help" content="Keyboard tooltip" />
      </TooltipHarness>,
    );

    const anchor = screen.getByRole("button", { name: "Keyboard help" });
    expect(anchor.getAttribute("aria-describedby")).toBeNull();
    fireEvent.focus(anchor);
    const tooltip = await screen.findByRole("tooltip");
    expect(anchor.getAttribute("aria-describedby")).toBe(tooltip.id);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
    expect(anchor.getAttribute("aria-describedby")).toBeNull();
  });

  it("uses touch long press, closes when the anchor disconnects, and applies zero motion delay", async () => {
    const scheduler = createScheduler();
    render(
      <TooltipHarness scheduler={scheduler}>
        <TooltipProbe label="Touch help" content="Touch tooltip" delayMs={240} />
      </TooltipHarness>,
    );

    const touchAnchor = screen.getByRole("button", { name: "Touch help" });
    fireEvent.pointerDown(touchAnchor, { pointerType: "touch" });
    expect(scheduler.pendingDelays).toContain(600);
    scheduler.runDelay(600);
    expect((await screen.findByRole("tooltip")).textContent).toContain("Touch tooltip");
    touchAnchor.remove();
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());

    const reducedMotionScheduler = createScheduler();
    render(
      <TooltipHarness scheduler={reducedMotionScheduler} reducedMotion>
        <TooltipProbe label="Reduced motion help" content="Immediate tooltip" delayMs={240} />
      </TooltipHarness>,
    );
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Reduced motion help" }), { pointerType: "mouse" });
    expect((await screen.findByRole("tooltip")).textContent).toContain("Immediate tooltip");
    // Reduced motion skips the tooltip's 240ms interaction delay, and the
    // opening placement is written in the commit that shows the tooltip, so
    // no scheduler work is left behind.
    expect(reducedMotionScheduler.pendingDelays).toEqual([]);
  });

  it("cancels a pending show when its anchor disconnects before the delay expires", async () => {
    const scheduler = createScheduler();
    render(
      <TooltipHarness scheduler={scheduler}>
        <TooltipProbe label="Detached pending help" content="Detached help" />
      </TooltipHarness>,
    );

    const anchor = screen.getByRole("button", { name: "Detached pending help" });
    fireEvent.pointerEnter(anchor, { pointerType: "mouse" });
    expect(scheduler.pendingDelays).toEqual([100]);

    anchor.remove();
    await waitFor(() => expect(scheduler.pendingDelays).toEqual([]));
    expect(scheduler.clearTimeout).toHaveBeenCalledTimes(1);
  });

  it("does not expose a duplicate tooltip for a disabled description that is already visible", () => {
    const scheduler = createScheduler();
    render(
      <TooltipHarness scheduler={scheduler}>
        <TooltipProbe label="Disabled help" content="Already visible description" disabled />
      </TooltipHarness>,
    );

    const anchor = screen.getByRole("button", { name: "Disabled help" });
    fireEvent.pointerEnter(anchor, { pointerType: "mouse" });
    fireEvent.focus(anchor);
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(anchor.getAttribute("aria-describedby")).toBeNull();
    expect(scheduler.pendingDelays).toEqual([]);
  });

  it("closes a live tooltip when its description becomes persistently visible", async () => {
    const scheduler = createScheduler();
    function Fixture() {
      const [disabled, setDisabled] = useState(false);
      return (
        <TooltipHarness scheduler={scheduler}>
          <button type="button" onClick={() => setDisabled((current) => !current)}>Toggle visible description</button>
          <TooltipProbe label="Dynamic description" content="Dynamic help" disabled={disabled} />
        </TooltipHarness>
      );
    }
    render(<Fixture />);

    const anchor = screen.getByRole("button", { name: "Dynamic description" });
    fireEvent.focus(anchor);
    await screen.findByRole("tooltip");
    fireEvent.click(screen.getByRole("button", { name: "Toggle visible description" }));
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Toggle visible description" }));
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(anchor.getAttribute("aria-describedby")).toBeNull();
  });

  it("cleans its one injected scheduler task when the tooltip branch unmounts", () => {
    const scheduler = createScheduler();
    const view = render(
      <TooltipHarness scheduler={scheduler}>
        <TooltipProbe label="Disposable help" content="Disposable tooltip" />
      </TooltipHarness>,
    );
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Disposable help" }), { pointerType: "mouse" });
    expect(scheduler.pendingDelays).toEqual([100]);
    view.unmount();
    expect(scheduler.pendingDelays).toEqual([]);
    expect(scheduler.clearTimeout).toHaveBeenCalledTimes(1);
  });

  it("cleans its pending timer when the owning runtime aborts", () => {
    const scheduler = createScheduler();
    const runtimeController = new AbortController();
    render(
      <TooltipHarness scheduler={scheduler} runtimeController={runtimeController}>
        <TooltipProbe label="Runtime disposable help" content="Runtime disposable tooltip" />
      </TooltipHarness>,
    );

    fireEvent.pointerEnter(screen.getByRole("button", { name: "Runtime disposable help" }), { pointerType: "mouse" });
    expect(scheduler.pendingDelays).toEqual([100]);
    runtimeController.abort();
    expect(scheduler.pendingDelays).toEqual([]);
    expect(scheduler.clearTimeout).toHaveBeenCalledTimes(1);
  });
});
