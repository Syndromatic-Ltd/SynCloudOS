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
import { installNSEScrollIntoViewFixture } from "../nse/fixtures/browser";
installNSEScrollIntoViewFixture();

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import React, { useMemo, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { GFXColour } from "../../src/FX/GraphicsFX/public";
import { NSEColourPanel, NSEColourPanelProvider, NSEColourWell } from "../../src/NSE/Colour";
import { NSEComboBox, type NSECompletionDataSource } from "../../src/NSE/Controls/Completion";
import { NSECalendarView, type NSECalendarMonth } from "../../src/NSE/DateTime";
import { NSEOverlayProvider } from "../../src/NSE/Overlays";
import { NSEProgressIndicator } from "../../src/NSE/Progress";
import { NSEScrollView } from "../../src/NSE/Scroll";
import { createSynCloudOS } from "../../src/SynCloudOS/Runtime/createSynCloudOS";
import { createStaticPresentationPort } from "../fixtures/presentationTraits";
import { createTestRuntimeEnvironment } from "../runtime/helpers";
import budgets from "../fixtures/conformance-performance-budgets.json";
import { runStructuralScenario } from "./structural-performance-scenario";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const workArea = Object.freeze({ width: 1280, height: 720, safeArea: Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 }) });
const presentation = createStaticPresentationPort({ width: 1280, height: 720 });
function OverlayHarness({ runtimeId, children }: { readonly runtimeId: string; readonly children: React.ReactNode }) {
  const runtimePort = useMemo(() => ({
    runtimeId,
    signal: new AbortController().signal,
    environment: {
      browser: { getDocument: () => document, getWindow: () => window },
      workArea: { getSnapshot: () => workArea, subscribe: () => () => undefined },
      visualViewport: { getSnapshot: () => null, subscribe: () => () => undefined },
      presentation,
      setTimeout: (callback: () => void) => { callback(); return 0; },
      clearTimeout: () => undefined,
    },
    restoreFocus: (_responderId: string, anchor: HTMLElement | null) => anchor?.focus(),
    reportPlacementFailure: () => undefined,
    wrapFocusScope: (_options: unknown, node: React.ReactNode) => node,
  }), [runtimeId]);
  return <NSEOverlayProvider runtimePort={runtimePort} defaultParentResponderId="workspace">{children}</NSEOverlayProvider>;
}

it("drives 120 real wheel previews into one undo group", async () => {
  const budget = budgets.portableCases["colour-controls.wheel-preview-120"];
  const runtime = createSynCloudOS({ id: "performance:colour", environment: createTestRuntimeEnvironment() });
  const undo = runtime.undo.create({ kind: "application", id: "performance:colour" });
  let previews = 0, commits = 0, publications = 0, renders = 0;
  let committedColour: GFXColour | undefined;
  function Harness() {
    renders += 1;
    const [colour, setColour] = useState(() => GFXColour.parse("#356ac3"));
    const options = useMemo(() => ({ undoManager: undo }), []);
    return <OverlayHarness runtimeId={runtime.runtimeId}><NSEColourPanelProvider service={runtime.colourPanel} options={options}><NSEColourWell id="performance-colour-well" aria-label="Performance colour" value={colour} onValueChange={(next, phase) => { if (phase === "preview") previews += 1; else { commits += 1; committedColour = next; } setColour(next); }} /><NSEColourPanel /></NSEColourPanelProvider></OverlayHarness>;
  }
  await runStructuralScenario({ run: () => {
    const view = render(<Harness />);
    fireEvent.click(view.getByRole("button", { name: "Performance colour" }));
    const wheel = view.getByRole("slider", { name: "Colour hue and saturation" });
    const unsubscribe = runtime.colourPanel.subscribe(() => { publications += 1; });
    Object.defineProperty(wheel, "getBoundingClientRect", { value: () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}) }), configurable: true });
    const openingRenders = renders;
    fireEvent.pointerDown(wheel, { pointerId: 9, clientX: 100, clientY: 0 });
    for (let index = 0; index < budget.previews - 2; index += 1) {
      const angle = (index / budget.previews) * Math.PI * 2;
      fireEvent.pointerMove(wheel, { pointerId: 9, clientX: 100 + Math.cos(angle) * 90, clientY: 100 + Math.sin(angle) * 90 });
    }
    fireEvent.pointerUp(wheel, { pointerId: 9, clientX: 190, clientY: 100 });
    // Release commits the last preview directly; no panel-wide Apply step.
    expect(committedColour?.hsva.h).toBeCloseTo(0);
    expect(committedColour?.hsva.s).toBeCloseTo(0.9);
    expect(committedColour?.hsva.v).toBeCloseTo(195 / 255);
    expect(committedColour?.hsva.a).toBe(1);
    expect(renders - openingRenders).toBeLessThanOrEqual(budget.previews);
    const released = { previews, commits, publications, renders };
    fireEvent.pointerMove(wheel, { pointerId: 9, clientX: 0, clientY: 100 });
    fireEvent.pointerUp(wheel, { pointerId: 9, clientX: 0, clientY: 100 });
    expect({ previews, commits, publications, renders }).toEqual(released);
    unsubscribe();
    return { view, previews, commits, publications, undoEntries: undo.inspect().entries.length };
  }, assertStructural: async ({ view, previews: previewCount, commits: commitCount, publications: publicationCount, undoEntries }) => {
    expect(previewCount).toBe(budget.previews);
    expect(commitCount).toBe(budget.maxCommits);
    expect(publicationCount).toBeLessThanOrEqual(budget.maxPublications);
    expect(undoEntries).toBe(1);
    view.unmount();
    await runtime.dispose("performance-complete");
    expect(runtime.colourPanel.getSnapshot()).toMatchObject({ status: "disposed", activeTargetId: null, pickers: [] });
  } });
});

it("keeps 100 calendar month changes bounded and attached", async () => {
  const budget = budgets.portableCases["calendar-controls.month-change-100"];
  let changes = 0;
  function Harness() { const [month, setMonth] = useState<NSECalendarMonth>({ year: 2026, month: 1 }); return <NSECalendarView aria-label="Calendar performance" locale="en-GB" timeZone="Europe/London" visibleMonth={month} selection={{ kind: "none" }} isDateDisabled={() => false} onVisibleMonthChange={(next) => { changes += 1; setMonth(next); }} />; }
  await runStructuralScenario({ run: () => {
    const view = render(<Harness />); const next = view.getByRole("button", { name: "Next month" });
    for (let index = 0; index < budget.changes; index += 1) fireEvent.click(next);
    return { view, cells: view.container.querySelectorAll('[role="gridcell"]').length, connectedCells: [...view.container.querySelectorAll('[role="gridcell"]')].filter((cell) => cell.isConnected).length, changes };
  }, assertStructural: ({ view, cells, connectedCells, changes: changeCount }) => { expect(changeCount).toBe(budget.changes); expect(cells).toBeLessThanOrEqual(budget.maxMountedDateCells); expect(connectedCells).toBe(cells); view.unmount(); expect(document.querySelectorAll('[aria-label="Calendar performance"]')).toHaveLength(0); } });
});

it("suppresses a stale hosted completion generation", async () => {
  const budget = budgets.portableCases["completion-controls.stale-query"];
  let settleFirst!: (items: readonly string[]) => void, settleSecond!: (items: readonly string[]) => void, calls = 0;
  const source: NSECompletionDataSource<string> = { query: () => new Promise((resolve) => { calls += 1; if (calls === 1) settleFirst = resolve; else settleSecond = resolve; }), idForItem: (item) => item, labelForItem: (item) => item };
  await runStructuralScenario({ run: async () => {
    const view = render(<OverlayHarness runtimeId="performance:completion"><NSEComboBox aria-label="Completion performance" dataSource={source} value={null} inputValue="" onInputValueChange={() => {}} onValueChange={() => {}} /></OverlayHarness>); const input = view.getByRole("combobox");
    fireEvent.change(input, { target: { value: "L" } }); fireEvent.change(input, { target: { value: "Lo" } });
    await act(async () => { settleSecond(["London"]); await Promise.resolve(); });
    await act(async () => { settleFirst(["Lisbon"]); await Promise.resolve(); });
    return { view, calls, options: view.queryAllByRole("option").map((option) => option.textContent) };
  }, assertStructural: ({ view, calls: queryCount, options }) => { expect(queryCount).toBe(budget.queries); expect(options).toEqual(["London"]); expect(options).toHaveLength(budget.maxPublishedOptions); view.unmount(); expect(document.querySelectorAll('[role="option"]')).toHaveLength(0); } });
});

it("coalesces the real scroll view observer and keeps rubber-band listeners distinct", async () => {
  const budget = budgets.portableCases["scroll-controls.passive-coalescing"];
  let scheduled: FrameRequestCallback | undefined;
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { scheduled = callback; return 1; }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const add = vi.spyOn(HTMLElement.prototype, "addEventListener");
  const remove = vi.spyOn(HTMLElement.prototype, "removeEventListener");
  let publications = 0;
  await runStructuralScenario({ run: () => {
    const view = render(<NSEScrollView data-testid="performance-scroll" onScrollSnapshot={() => { publications += 1; }}><div style={{ height: 2000 }} /></NSEScrollView>);
    const host = view.getByTestId("performance-scroll");
    for (let index = 0; index < budget.events; index += 1) fireEvent.scroll(host);
    scheduled?.(0);
    const hostCalls = add.mock.calls.filter((_call, index) => add.mock.contexts[index] === host);
    return { view, host, publications, passiveScrollListeners: hostCalls.filter(([name,, options]) => name === "scroll" && (options as AddEventListenerOptions)?.passive === true).length, rubberBandNonPassiveListeners: hostCalls.filter(([name,, options]) => (name === "wheel" || name === "touchmove") && (options as AddEventListenerOptions)?.passive === false).length };
  }, assertStructural: ({ view, host, publications: publicationCount, passiveScrollListeners, rubberBandNonPassiveListeners }) => {
    expect(passiveScrollListeners).toBe(budget.maxPassiveListeners);
    expect(rubberBandNonPassiveListeners).toBe(budget.rubberBandNonPassiveListeners);
    expect(publicationCount).toBeLessThanOrEqual(budget.maxPublications);
    view.unmount();
    expect(remove.mock.calls.filter((_call, index) => remove.mock.contexts[index] === host && remove.mock.calls[index][0] === "scroll")).toHaveLength(1);
    expect(cancelAnimationFrame).not.toHaveBeenCalled();
  } });
});

it("schedules no animation for reduced-motion indeterminate progress", async () => {
  const budget = budgets.portableCases["progress-controls.reduced-motion"];
  const raf = vi.fn(); vi.stubGlobal("requestAnimationFrame", raf);
  await runStructuralScenario({ run: () => render(<NSEProgressIndicator aria-label="Static progress" state={{ kind: "indeterminate" }} reducedMotion />), assertStructural: (view) => { expect(raf).toHaveBeenCalledTimes(budget.maxAnimationCallbacks); expect(view.getByRole("progressbar").getAttribute("data-motion")).toBe("static"); view.unmount(); } });
});
