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

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React, { type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NSEViewController, nseUpdateTraits } from "../../../src/NSE/Application/NSEViewController";
import { NSEUserDefaultsController } from "../../../src/NSE/Controllers";
import {
  NSESplitViewController,
  NSESplitViewItem,
  type NSESplitViewItemOptions,
  type NSESplitViewPreferences,
} from "../../../src/NSE/DataViews/Split";
import { nseSplitViewLayout } from "../../../src/NSE/DataViews/Split/NSESplitViewController";
import { SplitViewControllerView } from "../../../src/NSE/DataViews/Split/splitViewControllerView";
import { ViewControllerView } from "../../../src/SynCloudOS/AppHosting/applicationHosting";
import { createStaticPresentationTraits } from "../../fixtures/presentationTraits";
import { defaultsFrom } from "../../fixtures/userDefaults";
import { SourceListFrameProvider } from "../../../src/NSE/Navigation/SourceList/sourceListFrameContext";

/** A child view controller that renders `content`. */
class PaneViewController extends NSEViewController {
  readonly #content: () => ReactNode;
  constructor(title: string, content: () => ReactNode) {
    super({ title });
    this.#content = content;
  }
  renderView(): ReactNode { return this.#content(); }
}

function item(identifier: string, title: string, content: () => ReactNode, options: Partial<NSESplitViewItemOptions> = {}) {
  return new NSESplitViewItem({ identifier, viewController: new PaneViewController(title, content), ...options });
}

/** Content then an inspector: the content absorbs resizing, the inspector collapses first. */
function inspectorSplit(id: string, contents: { readonly content?: () => ReactNode; readonly inspector?: () => ReactNode } = {}, preferences?: NSEUserDefaultsController<NSESplitViewPreferences>) {
  return new NSESplitViewController({
    id,
    title: "Workspace",
    preferences,
    splitViewItems: [
      item("content", "Content", contents.content ?? (() => <p>Content</p>), { minimumThickness: 320 }),
      item("inspector", "Inspector", contents.inspector ?? (() => <p>Inspector</p>), { behavior: "inspector", minimumThickness: 240, maximumThickness: 480, preferredThicknessFraction: 1 / 3 }),
    ],
  });
}

function createPreferences(initial?: NSESplitViewPreferences) {
  let stored: unknown = initial ? ["syncloudos:nse-preferences:v1", 1, initial] : null;
  return new NSEUserDefaultsController<NSESplitViewPreferences>({
    namespace: "split-test",
    defaults: defaultsFrom({
      read: () => stored,
      write: (_key, value) => { stored = value; },
      remove: () => { stored = null; },
    }),
    schema: {
      version: 1,
      defaults: { sizes: {}, collapsedPaneIds: [], activePaneId: "content" },
      fields: {
        sizes: { validate: (value): value is Readonly<Record<string, number>> => typeof value === "object" && value !== null },
        collapsedPaneIds: { validate: (value): value is readonly string[] => Array.isArray(value) && value.every((id) => typeof id === "string") },
        activePaneId: { validate: (value): value is string | null => value === null || typeof value === "string" },
      },
      migrations: [],
    },
  });
}

const thicknesses = (controller: NSESplitViewController) => controller.getSnapshot().items.map(({ thickness }) => thickness);

function setWidth(controller: NSESplitViewController, width: number) {
  act(() => controller[nseUpdateTraits]({ reducedMotion: false, presentation: createStaticPresentationTraits({ width, height: 700 }) }));
}

afterEach(cleanup);

describe("NSESplitViewController", () => {
  it("measures the controller wrapper when a custom split view does not render the default layout", () => {
    class CustomSplit extends NSESplitViewController { static override view = () => <p>Custom layout</p>; }
    const controller = new CustomSplit({ id: "controller-allocation", splitViewItems: [item("content", "Content", () => null)] });
    render(<ViewControllerView controller={controller} />);
    setWidth(controller, 1440);
    Object.defineProperty(controller.view.element, "clientWidth", { configurable: true, value: 430 });
    Object.defineProperty(controller.view.element, "clientHeight", { configurable: true, value: 700 });
    act(() => controller.viewDidLayout());
    expect(controller.snapshot.presentation).toBe("single-pane");
    expect(controller.snapshot.availableSize).toBe(430);
    controller.dispose();
  });
  it.each(["default", "embedded", "strict"] as const)("lets the %s split renderer own valid inset bounds without competing wrapper measurements", (mode) => {
    let showDefault = true;
    class FramedSplit extends NSESplitViewController {
      static override view = ({ controller }: { controller: NSESplitViewController }) => <section data-testid="custom-frame">{showDefault ? <SplitViewControllerView controller={controller} /> : <p>Custom layout only</p>}</section>;
    }
    const Controller = mode === "default" ? NSESplitViewController : FramedSplit;
    const controller = new Controller({ id: `inset-${mode}`, splitViewItems: [item("content", "Content", () => <p>Editor</p>)] });
    let outer: HTMLElement | null = null;
    let valid = false;
    const isInner = (element: HTMLElement) => element.classList.contains("nse-split-view-controller-view");
    const observations = new Map<Element, () => void>();
    const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) { return !valid ? 0 : this === outer ? 900 : isInner(this) ? 880 : 0; });
    const height = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) { return !valid ? 0 : this === outer ? 700 : isInner(this) ? 660 : 0; });
    const rectangle = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) { return new DOMRect(this === outer ? 10 : 30, this === outer ? 20 : 40, this.clientWidth, this.clientHeight); });
    vi.stubGlobal("ResizeObserver", class {
      constructor(readonly callback: () => void) {}
      observe(element: Element) { observations.set(element, this.callback); }
      disconnect() {}
    });
    const content = () => <ViewControllerView controller={controller} />;
    try {
      const view = render(mode === "strict" ? <React.StrictMode>{content()}</React.StrictMode> : content());
      setWidth(controller, 1440);
      outer = controller.view.element;
      const inner = outer.querySelector<HTMLElement>(".nse-split-view-controller-view")!;
      valid = true;
      expect(() => act(() => observations.get(inner)!())).not.toThrow();
      expect(controller.snapshot.availableSize).toBe(880);
      const revision = controller.snapshot.revision;
      act(() => { controller.viewDidLayout(); controller.viewDidDisappear(); });
      expect(controller.snapshot.availableSize).toBe(880);
      expect(controller.snapshot.revision).toBe(revision);
      if (mode !== "default") {
        showDefault = false;
        view.rerender(mode === "strict" ? <React.StrictMode>{content()}</React.StrictMode> : content());
        act(() => controller.viewDidLayout());
        expect(controller.snapshot.availableSize).toBe(900);
        expect(screen.getByText("Custom layout only")).toBeTruthy();
      }
      view.unmount();
    } finally {
      width.mockRestore(); height.mockRestore(); rectangle.mockRestore(); vi.unstubAllGlobals();
      controller.dispose();
    }
  });
  it("starts a hierarchy on its first pane until geometry is current, then retains the last presentation", () => {
    const controller = new NSESplitViewController({ id: "initial-geometry", splitViewItems: [
      item("sidebar", "Sources", () => null, { behavior: "sidebar" }),
      item("detail", "Detail", () => null),
    ] });
    expect(controller.snapshot.presentation).toBe("single-pane");
    expect(controller.compactItem?.identifier).toBe("sidebar");
    const current = createStaticPresentationTraits({ width: 900, height: 700 });
    controller[nseUpdateTraits]({ reducedMotion: false, presentation: current });
    expect(controller.snapshot.presentation).toBe("split");
    controller[nseUpdateTraits]({ reducedMotion: false, presentation: { ...current, geometryState: "unavailable", contentBounds: { x: 0, y: 0, width: 390, height: 700 } } });
    expect(controller.snapshot.presentation).toBe("split");
  });
  it("retains the compact selection while a regular-width constraint temporarily collapses its pane", () => {
    const controller = inspectorSplit("preferred-compact");
    const inspector = controller.splitViewItems[1]!;
    controller[nseSplitViewLayout].resize(900);
    controller.showDetail(inspector.viewController);
    controller[nseSplitViewLayout].resize(500);
    expect(inspector.isCollapsed).toBe(true);
    expect(controller.compactItem).toBe(inspector);
  });
  it("shares its sidebar seam and compact handoff with a source-list window's frame", () => {
    const setRailWidth = vi.fn(), setCompactNavigation = vi.fn();
    const controller = new NSESplitViewController({ id: "source-list", splitViewItems: [
      item("sidebar", "Sources", () => <p>Sources</p>, { behavior: "sidebar", minimumThickness: 208, maximumThickness: 460 }),
      item("content", "Content", () => <p>Content</p>, { minimumThickness: 320 }),
    ] });
    render(<SourceListFrameProvider value={{ railWidth: 264, setRailWidth, setCompactNavigation, minWidth: 208, maxWidth: 460, defaultWidth: 264, railLabel: "Library", scheme: "light" }}><ViewControllerView controller={controller} /></SourceListFrameProvider>);
    setWidth(controller, 900);
    const divider = screen.getByRole("separator");
    expect(divider.getAttribute("aria-valuenow")).toBe("264");
    fireEvent.keyDown(divider, { key: "ArrowRight" });
    expect(setRailWidth).toHaveBeenLastCalledWith(280);
    setWidth(controller, 390);
    expect(setCompactNavigation).toHaveBeenLastCalledWith(true);
  });
  it("shows a compact detail and returns focus to its initiating sidebar control", () => {
    let controller: NSESplitViewController;
    const sidebar = item("sidebar", "Folders", () => <button onClick={() => controller.showDetail(detail.viewController)}>Open note</button>, { behavior: "sidebar", minimumThickness: 208 });
    const detail = item("detail", "Note", () => <input aria-label="Note text" defaultValue="Keep me" />, { minimumThickness: 320 });
    controller = new NSESplitViewController({ id: "compact-detail", splitViewItems: [sidebar, detail] });
    render(<ViewControllerView controller={controller} />);
    setWidth(controller, 390);
    expect(controller.compactItem).toBe(sidebar);
    const open = screen.getByRole("button", { name: "Open note" });
    open.focus();
    fireEvent.click(open);
    expect(controller.compactItem).toBe(detail);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Note text" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to Folders" }));
    expect(controller.compactItem).toBe(sidebar);
    expect(document.activeElement).toBe(open);
    expect(() => controller.showDetail(new PaneViewController("Other", () => null))).toThrow(RangeError);
    act(() => { controller.compactItem = detail; });
    expect(controller.compactItem).toBe(detail);
    act(() => { controller.compactItem = null; });
    expect(controller.compactItem).toBe(sidebar);
  });

  it("uses its measured content width for compact collapse, retaining it through unavailable geometry", () => {
    const controller = inspectorSplit("content-width");
    let widthValue = 390;
    let resize: (() => void) | undefined;
    const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) { return this.classList.contains("nse-split-view-controller-view") ? widthValue : 0; });
    const height = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(() => 700);
    vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resize = callback; } observe() {} disconnect() {} });
    try {
      render(<ViewControllerView controller={controller} />);
      setWidth(controller, 1440);
      expect(controller.snapshot.presentation).toBe("single-pane");
      widthValue = 900;
      act(() => resize?.());
      expect(controller.snapshot.presentation).toBe("split");
      const current = createStaticPresentationTraits({ width: 390, height: 700 });
      act(() => controller[nseUpdateTraits]({ reducedMotion: false, presentation: { ...current, geometryState: "unavailable" } }));
      widthValue = 0;
      act(() => resize?.());
      expect(controller.snapshot.presentation).toBe("split");
    } finally { width.mockRestore(); height.mockRestore(); vi.unstubAllGlobals(); }
  });

  it("keeps the two foldable regions clear of the hinge, including a compact-sized book", () => {
    const controller = new NSESplitViewController({ id: "book", splitViewItems: [
      item("sidebar", "Folders", () => <p>Folders</p>, { behavior: "sidebar", minimumThickness: 208 }),
      item("detail", "Note", () => <p>Note</p>, { minimumThickness: 280 }),
    ] });
    const traits = { ...createStaticPresentationTraits({ width: 669, height: 867 }), viewportFeatures: { posture: "folded" as const, segments: [
      { x: 0, y: 0, width: 329, height: 867 }, { x: 340, y: 0, width: 329, height: 867 },
    ] } };
    render(<div dir="rtl"><ViewControllerView controller={controller} /></div>);
    act(() => controller[nseUpdateTraits]({ reducedMotion: false, presentation: traits }));
    expect(controller.snapshot.presentation).toBe("split");
    const split = document.querySelector('[data-book-regions="true"]');
    expect(split?.getAttribute("data-book-sidebar-side")).toBe("right");
    expect((split as HTMLElement).style.getPropertyValue("--nse-book-gap")).toBe("11px");
    expect(screen.queryByRole("separator")).toBeNull();
    act(() => controller[nseUpdateTraits]({ reducedMotion: false, presentation: { ...traits, geometryState: "retained" } }));
    expect(document.querySelector('[data-book-regions="true"]')).toBeNull();
  });

  it("adopts each item's view controller as a child and finds items by view controller", () => {
    const controller = inspectorSplit("children");
    const [content, inspector] = controller.splitViewItems;
    expect(controller.children).toEqual([content!.viewController, inspector!.viewController]);
    expect(controller.splitViewItemForViewController(inspector!.viewController)).toBe(inspector);
    expect(inspector!.canCollapse).toBe(true);
    expect(inspector!.holdingPriority).toBe(260);
    expect(content!.holdingPriority).toBe(250);
    controller.dispose();
    expect(content!.viewController.isDisposed).toBe(true);
  });

  it("solves minimum, preferred and maximum thicknesses, and collapses by holding priority", () => {
    const controller = inspectorSplit("solve");
    controller[nseSplitViewLayout].resize(900);
    expect(controller.getSnapshot().items).toEqual([
      expect.objectContaining({ identifier: "content", thickness: 600, isCollapsed: false }),
      expect.objectContaining({ identifier: "inspector", thickness: 300, isCollapsed: false }),
    ]);
    // The inspector's preferred third follows the split view until a divider moves; then it holds.
    controller[nseSplitViewLayout].resize(820);
    expect(thicknesses(controller)).toEqual([547, 273]);
    controller.setPosition(520, 0);
    controller[nseSplitViewLayout].resize(900);
    expect(thicknesses(controller)).toEqual([600, 300]);

    controller[nseSplitViewLayout].resize(500);
    expect(controller.getSnapshot().items[1]).toMatchObject({ identifier: "inspector", isCollapsed: true });
    expect(controller.getSnapshot().items[0]).toMatchObject({ identifier: "content", thickness: 500 });
  });

  it("collapses and expands through the item's isCollapsed and toggleInspector", () => {
    const controller = inspectorSplit("collapse");
    controller[nseSplitViewLayout].resize(900);
    const inspector = controller.splitViewItems[1]!;
    inspector.isCollapsed = true;
    expect(inspector.isCollapsed).toBe(true);
    expect(thicknesses(controller)).toEqual([900, 0]);
    controller.toggleInspector();
    expect(inspector.isCollapsed).toBe(false);
    expect(() => { controller.splitViewItems[0]!.isCollapsed = true; }).toThrow(TypeError);
  });

  it("places dividers with setPosition within the neighbouring items' limits", () => {
    const controller = inspectorSplit("position");
    controller[nseSplitViewLayout].resize(900);
    expect(controller.setPosition(700, 0)).toBe(true);
    expect(thicknesses(controller)).toEqual([660, 240]);
    controller.setPosition(400, 0);
    expect(thicknesses(controller)).toEqual([420, 480]);
  });

  it("clamps restoration, persists divider changes, and remembers a removed item's thickness", () => {
    const preferences = createPreferences({ sizes: { content: 10_000, inspector: 1 }, collapsedPaneIds: [], activePaneId: "inspector" });
    const controller = inspectorSplit("restored", {}, preferences);
    controller[nseSplitViewLayout].resize(900);
    expect(thicknesses(controller)).toEqual([660, 240]);

    controller[nseSplitViewLayout].moveDivider(0, -40);
    expect(thicknesses(controller)).toEqual([620, 280]);

    const restored = inspectorSplit("restored-again", {}, preferences);
    restored[nseSplitViewLayout].resize(900);
    expect(thicknesses(restored)).toEqual([620, 280]);
    expect(restored.getSnapshot().activeItemIdentifier).toBe("inspector");
    const inspector = restored.splitViewItems[1]!;
    restored.removeSplitViewItem(inspector);
    expect(inspector.viewController.isDisposed).toBe(true);
    expect(restored.getSnapshot().items).toEqual([expect.objectContaining({ identifier: "content", thickness: 900, isCollapsed: false })]);
    expect(restored.getSnapshot().activeItemIdentifier).toBe("content");
  });

  it("sanitises restoration that collapses every item, keeping one visible", () => {
    const preferences = createPreferences({ sizes: { content: 620, inspector: 280 }, collapsedPaneIds: ["content", "inspector", "unknown"], activePaneId: "inspector" });
    const controller = new NSESplitViewController({
      id: "corrupt",
      preferences,
      splitViewItems: [
        item("content", "Content", () => null, { canCollapse: true, minimumThickness: 320 }),
        item("inspector", "Inspector", () => null, { canCollapse: true, minimumThickness: 240 }),
      ],
    });
    controller[nseSplitViewLayout].resize(900);
    expect(controller.getSnapshot().items.some(({ isCollapsed, thickness }) => !isCollapsed && thickness > 0)).toBe(true);
  });

  it("resizes equal-priority items proportionally", () => {
    const controller = new NSESplitViewController({
      id: "proportional",
      splitViewItems: [
        item("leading", "Leading", () => null, { minimumThickness: 50, maximumThickness: 400, preferredThicknessFraction: 0.5 }),
        item("trailing", "Trailing", () => null, { minimumThickness: 50, maximumThickness: 400, preferredThicknessFraction: 0.5 }),
      ],
    });
    controller[nseSplitViewLayout].resize(300);
    expect(thicknesses(controller)).toEqual([150, 150]);
    controller[nseSplitViewLayout].resize(400);
    expect(thicknesses(controller)).toEqual([200, 200]);
  });

  it("renders its items' views, keeps them mounted across a compact width, and labels compact tabs with their titles", () => {
    const mounts = vi.fn();
    const unmounts = vi.fn();
    function Pane({ name }: { readonly name: string }) {
      const [count, setCount] = React.useState(0);
      React.useEffect(() => { mounts(name); return () => unmounts(name); }, [name]);
      return <button type="button" onClick={() => setCount((value) => value + 1)}>{`${name} ${count}`}</button>;
    }
    const controller = inspectorSplit("keep-mounted", { content: () => <Pane name="content" />, inspector: () => <Pane name="inspector" /> });
    controller[nseSplitViewLayout].resize(900);
    render(<ViewControllerView controller={controller} />);
    fireEvent.click(screen.getByRole("button", { name: "inspector 0" }));

    setWidth(controller, 390);
    expect(screen.getByRole("tablist", { name: "Workspace panes" })).not.toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Inspector" }));
    expect(controller.getSnapshot()).toMatchObject({ presentation: "single-pane", activeItemIdentifier: "inspector" });
    expect(screen.getByRole("button", { name: "inspector 1" })).not.toBeNull();

    setWidth(controller, 1440);
    expect(screen.getByRole("button", { name: "inspector 1" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "content 0" })).not.toBeNull();
    expect(unmounts).not.toHaveBeenCalled();
    expect(mounts).toHaveBeenCalledTimes(2);
    expect(document.activeElement?.getAttribute("data-pane-id")).toBe("inspector");
  });

  it("keeps a nested split view whole in a compact width; only the outermost shows one item", () => {
    const inner = new NSESplitViewController({
      id: "inner",
      title: "Field",
      isVertical: false,
      splitViewItems: [
        item("canvas", "Canvas", () => <p>Canvas</p>, { minimumThickness: 100 }),
        item("analysis", "Analysis", () => <p>Analysis</p>, { minimumThickness: 100, canCollapse: true }),
      ],
    });
    const outer = new NSESplitViewController({
      id: "outer",
      title: "Lab",
      splitViewItems: [
        new NSESplitViewItem({ identifier: "centre", viewController: inner, minimumThickness: 300 }),
        item("inspector", "Inspector", () => <p>Inspector</p>, { behavior: "inspector", minimumThickness: 200 }),
      ],
    });
    render(<ViewControllerView controller={outer} />);
    setWidth(outer, 390);
    setWidth(inner, 390);
    expect(outer.getSnapshot().presentation).toBe("single-pane");
    expect(inner.getSnapshot().presentation).toBe("split");
    expect(screen.getByText("Canvas")).not.toBeNull();
    expect(screen.getByText("Analysis")).not.toBeNull();
  });

  it("projects a denied state without exposing item views, and restores them after Retry", () => {
    const activateSecret = vi.fn();
    const controller = inspectorSplit("denied", { content: () => <button type="button" onClick={activateSecret}>Secret action</button>, inspector: () => <p>Secret inspector</p> });
    controller[nseSplitViewLayout].resize(900);
    render(<ViewControllerView controller={controller} />);
    expect(screen.getByRole("button", { name: "Secret action" })).not.toBeNull();
    expect(screen.getByRole("separator")).not.toBeNull();

    const retry = vi.fn();
    act(() => { controller.state = { kind: "denied", message: "Access denied", retry }; });
    const host = screen.getByLabelText("Workspace", { selector: ".nse-split-view-controller-view" });
    expect(host.getAttribute("data-state")).toBe("denied");
    expect(host.getAttribute("aria-disabled")).toBe("true");
    expect(host.querySelectorAll("[data-pane-id], [role='separator']")).toHaveLength(0);
    expect(screen.queryByText("Secret inspector")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);

    act(() => { controller.state = { kind: "ready" }; });
    fireEvent.click(screen.getByRole("button", { name: "Secret action" }));
    expect(activateSecret).toHaveBeenCalledTimes(1);
  });

  it("divides the space it occupies, and moves dividers logically in right-to-left layouts", () => {
    const controller = new NSESplitViewController({
      id: "measured",
      title: "Field",
      isVertical: false,
      splitViewItems: [
        item("canvas", "Canvas", () => <p>Canvas</p>, { minimumThickness: 200 }),
        item("analysis", "Analysis", () => <p>Analysis</p>, { minimumThickness: 120, maximumThickness: 600, canCollapse: true, holdingPriority: 260, preferredThicknessFraction: 0.4 }),
      ],
    });
    let observed: (() => void) | null = null;
    const height = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("nse-split-view-controller-view") ? 500 : 0;
    });
    const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("nse-split-view-controller-view") ? 800 : 0;
    });
    vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { observed = callback; } observe() {} disconnect() {} });
    try {
      render(<div dir="rtl"><ViewControllerView controller={controller} /></div>);
      expect(controller.getSnapshot().availableSize).toBe(500);
      expect(thicknesses(controller)).toEqual([300, 200]);
      const divider = screen.getByRole("separator", { name: "Resize Canvas and Analysis" });
      expect(divider.getAttribute("data-orientation")).toBe("vertical");
      fireEvent.keyDown(divider, { key: "ArrowDown" });
      expect(thicknesses(controller)).toEqual([316, 184]);
      height.mockImplementation(function (this: HTMLElement) { return this.classList.contains("nse-split-view-controller-view") ? 420 : 0; });
      act(() => observed?.());
      expect(controller.getSnapshot().availableSize).toBe(420);
    } finally {
      height.mockRestore();
      width.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("marks a two-item side-by-side split's panes, so they fill the split view's cells", () => {
    const controller = new NSESplitViewController({
      id: "two",
      splitViewItems: [
        item("plots", "Plots", () => <p>Plots</p>, { minimumThickness: 200 }),
        item("slice", "Slice", () => <p>Slice</p>, { minimumThickness: 200, maximumThickness: 600, canCollapse: true }),
      ],
    });
    controller[nseSplitViewLayout].resize(900);
    render(<ViewControllerView controller={controller} />);
    expect(document.querySelector(".nse-split-view-sidebar > [data-pane-id=\"plots\"]")?.getAttribute("data-nse-part")).toBe("split-pane");
    expect(document.querySelector(".nse-split-view-main > [data-pane-id=\"slice\"]")?.getAttribute("data-nse-part")).toBe("split-pane");
    expect(document.querySelector("[data-pane-id=\"plots\"] [data-nse-view-controller]")?.textContent).toBe("Plots");
  });
});
