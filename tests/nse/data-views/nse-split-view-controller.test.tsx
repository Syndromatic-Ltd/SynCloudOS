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

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NSEPreferencesController } from "../../../src/NSE/Controllers";
import {
  NSESplitViewAdapter,
  NSESplitViewController,
  type NSESplitViewPreferences,
} from "../../../src/NSE/DataViews/Split";

const panes = [
  { id: "content", minimum: 320, ideal: 720, maximum: Number.POSITIVE_INFINITY, collapsible: false, collapsePriority: 0 },
  { id: "inspector", minimum: 240, ideal: 300, maximum: 480, collapsible: true, collapsePriority: 10 },
] as const;

function createPreferences(initial?: NSESplitViewPreferences) {
  let stored: unknown = initial ? ["syncloudos:nse-preferences:v1", 1, initial] : null;
  return new NSEPreferencesController<NSESplitViewPreferences>({
    namespace: "split-test",
    adapter: {
      read: () => stored,
      write: (_key, value) => { stored = value; },
      remove: () => { stored = null; },
    },
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

afterEach(cleanup);

describe("split view controller", () => {
  it.each(["disabled", "invalid", "read-only"] as const)("blocks tab and divider mutation while %s", (kind) => {
    const controller = new NSESplitViewController({ id: `state-${kind}`, orientation: "horizontal", panes });
    controller.resize(900);
    render(<NSESplitViewAdapter aria-label="Inspector" controller={controller} state={{ kind, message: kind }} responsiveState={{ mode: "mobile", width: 390, height: 700, prefersReducedMotion: false }} windowBounds={{ width: 390, height: 700 }} panes={[{ id: "content", label: "Content", content: <p>Content</p> }, { id: "inspector", label: "Inspector", content: <p>Inspector</p> }]} />);
    fireEvent.click(screen.getByRole("tab", { name: "Inspector" }));
    expect(controller.getSnapshot().activePaneId).toBe("content");
    expect(screen.getByLabelText("Inspector", { selector: ".nse-split-view-adapter" }).getAttribute("aria-disabled")).toBe("true");
  });
  it("projects denied status without exposing pane content and restores controller state after Retry", () => {
    const controller = new NSESplitViewController({ id: "denied-projection", orientation: "horizontal", panes });
    controller.resize(900);
    controller.setActivePane("inspector");
    controller.moveDivider(0, -40);
    const retry = vi.fn();
    const activateSecret = vi.fn();
    const common = {
      "aria-label": "Denied workspace",
      controller,
      responsiveState: { mode: "desktop" as const, width: 900, height: 700, prefersReducedMotion: false },
      windowBounds: { width: 900, height: 700 },
      panes: [
        { id: "content", label: "Content", content: <button type="button" onClick={activateSecret}>Secret action</button> },
        { id: "inspector", label: "Inspector", content: <p>Secret inspector</p> },
      ],
    };
    const view = render(<NSESplitViewAdapter {...common} state={{ kind: "ready" }} />);
    const before = controller.getSnapshot();
    expect(screen.getByRole("button", { name: "Secret action" })).not.toBeNull();
    expect(screen.getByRole("separator")).not.toBeNull();

    view.rerender(<NSESplitViewAdapter {...common} state={{ kind: "denied", message: "Access denied", retry }} />);
    const host = screen.getByLabelText("Denied workspace", { selector: ".nse-split-view-adapter" });
    expect(host.getAttribute("data-nse-control")).toBe("split-view");
    expect(host.getAttribute("data-state")).toBe("denied");
    expect(host.getAttribute("aria-disabled")).toBe("true");
    expect(host.querySelectorAll("[data-pane-id], [role='separator']")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Secret action" })).toBeNull();
    expect(screen.queryByText("Secret inspector")).toBeNull();
    const retryButton = screen.getByRole("button", { name: "Retry" });
    expect(retryButton.getAttribute("aria-disabled")).toBe("false");
    fireEvent.click(retryButton);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(activateSecret).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toBe(before);

    view.rerender(<NSESplitViewAdapter {...common} state={{ kind: "ready" }} />);
    expect(controller.getSnapshot()).toBe(before);
    expect(controller.getSnapshot().activePaneId).toBe("inspector");
    expect(controller.getSnapshot().panes.map(({ size }) => size)).toEqual(before.panes.map(({ size }) => size));
    fireEvent.click(screen.getByRole("button", { name: "Secret action" }));
    expect(activateSecret).toHaveBeenCalledTimes(1);
  });
  it("solves minimum, ideal, maximum and collapse-priority constraints deterministically", () => {
    const controller = new NSESplitViewController({ id: "inspector", orientation: "horizontal", panes });

    controller.resize(820);
    expect(controller.getSnapshot().panes).toEqual([
      expect.objectContaining({ id: "content", size: 520, collapsed: false }),
      expect.objectContaining({ id: "inspector", size: 300, collapsed: false }),
    ]);

    controller.resize(500);
    expect(controller.getSnapshot().panes[1]).toMatchObject({ id: "inspector", collapsed: true });
    expect(controller.getSnapshot().panes[0]).toMatchObject({ id: "content", size: 500, collapsed: false });
  });

  it("clamps restoration, persists divider changes, and filters unavailable panes by stable ID", () => {
    const preferences = createPreferences({
      sizes: { content: 10_000, inspector: 1 },
      collapsedPaneIds: [],
      activePaneId: "inspector",
    });
    const controller = new NSESplitViewController({ id: "restored", orientation: "horizontal", panes, preferences });
    controller.resize(900);
    expect(controller.getSnapshot().panes).toEqual([
      expect.objectContaining({ id: "content", size: 660 }),
      expect.objectContaining({ id: "inspector", size: 240 }),
    ]);

    controller.moveDivider(0, -40);
    expect(controller.getSnapshot().panes.map(({ size }) => size)).toEqual([620, 280]);

    const restored = new NSESplitViewController({ id: "restored-again", orientation: "horizontal", panes, preferences });
    restored.resize(900);
    expect(restored.getSnapshot().panes.map(({ size }) => size)).toEqual([620, 280]);
    restored.setAvailablePaneIds(new Set(["content"]));
    expect(restored.getSnapshot().panes).toEqual([
      expect.objectContaining({ id: "content", size: 900, collapsed: false }),
    ]);
    expect(restored.getSnapshot().activePaneId).toBe("content");
  });

  it("preserves restored active pane and unavailable pane sizes across late geometry", () => {
    const preferences = createPreferences({
      sizes: { content: 620, inspector: 280 },
      collapsedPaneIds: [],
      activePaneId: "inspector",
    });
    const controller = new NSESplitViewController({ id: "late-geometry", orientation: "horizontal", panes, preferences });
    controller.resize(900);
    expect(controller.getSnapshot().activePaneId).toBe("inspector");
    controller.setAvailablePaneIds(new Set(["content"]));

    const restored = new NSESplitViewController({ id: "availability-restored", orientation: "horizontal", panes, preferences });
    restored.resize(900);
    expect(restored.getSnapshot().panes.map(({ size }) => size)).toEqual([620, 280]);
  });

  it("sanitises corrupt restoration that collapses every eligible pane", () => {
    const allCollapsible = panes.map((pane) => ({ ...pane, collapsible: true }));
    const preferences = createPreferences({
      sizes: { content: 620, inspector: 280 },
      collapsedPaneIds: ["content", "inspector", "unknown"],
      activePaneId: "inspector",
    });
    const controller = new NSESplitViewController({ id: "corrupt-collapse", orientation: "horizontal", panes: allCollapsible, preferences });
    controller.resize(900);
    expect(controller.getSnapshot().panes.some(({ collapsed, size }) => !collapsed && size > 0)).toBe(true);
  });

  it("keeps a visible survivor through sequential collapse and availability changes", () => {
    const flexible = panes.map((pane) => ({ ...pane, collapsible: true }));
    const controller = new NSESplitViewController({ id: "survivor-invariant", orientation: "horizontal", panes: flexible });
    controller.resize(900);
    controller.setCollapsed("content", true);
    controller.setCollapsed("inspector", true);
    expect(controller.getSnapshot().panes.filter(({ collapsed }) => !collapsed)).toHaveLength(1);
    controller.setAvailablePaneIds(new Set(["content"]));
    expect(controller.getSnapshot().panes).toEqual([expect.objectContaining({ id: "content", collapsed: false, size: 900 })]);
  });

  it("supports collapse, expansion, single-pane composition and logical RTL divider input", () => {
    const controller = new NSESplitViewController({ id: "adapter", orientation: "horizontal", panes });
    controller.resize(900);
    const responsive = { mode: "desktop", width: 900, height: 700, prefersReducedMotion: false } as const;
    const view = render(
      <NSESplitViewAdapter
        aria-label="Workspace"
        controller={controller}
        responsiveState={responsive}
        windowBounds={{ width: 900, height: 700 }}
        dir="rtl"
        panes={[
          { id: "content", label: "Content", content: <button type="button">Document</button> },
          { id: "inspector", label: "Inspector", content: <button type="button">Properties</button> },
        ]}
      />,
    );

    const separator = screen.getByRole("separator", { name: "Resize Content and Inspector" });
    const before = controller.getSnapshot().panes[0]!.size;
    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    expect(controller.getSnapshot().panes[0]!.size).toBeGreaterThan(before);

    view.rerender(
      <NSESplitViewAdapter
        aria-label="Workspace"
        controller={controller}
        responsiveState={{ ...responsive, mode: "mobile", width: 390 }}
        windowBounds={{ width: 390, height: 700 }}
        panes={[
          { id: "content", label: "Content", content: <button type="button">Document</button> },
          { id: "inspector", label: "Inspector", content: <button type="button">Properties</button> },
        ]}
      />,
    );
    expect(screen.getByRole("tablist", { name: "Workspace panes" })).not.toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Inspector" }));
    expect(controller.getSnapshot()).toMatchObject({ presentation: "single-pane", activePaneId: "inspector" });
    expect(screen.getByRole("button", { name: "Properties" })).not.toBeNull();

    screen.getByRole("tab", { name: "Inspector" }).focus();
    view.rerender(
      <NSESplitViewAdapter
        aria-label="Workspace"
        controller={controller}
        responsiveState={responsive}
        windowBounds={{ width: 900, height: 700 }}
        panes={[
          { id: "content", label: "Content", content: <button type="button">Document</button> },
          { id: "inspector", label: "Inspector", content: <button type="button">Properties</button> },
        ]}
      />,
    );
    expect(document.activeElement?.getAttribute("data-pane-id")).toBe("inspector");
  });

  it("preserves a surviving active pane through resize and explicit collapse", () => {
    const controller = new NSESplitViewController({ id: "survivor", orientation: "vertical", panes });
    controller.resize(1_000);
    controller.setActivePane("inspector");
    controller.setCollapsed("inspector", true);
    expect(controller.getSnapshot().activePaneId).toBe("content");
    controller.setCollapsed("inspector", false);
    expect(controller.getSnapshot().panes[1]).toMatchObject({ id: "inspector", collapsed: false });
  });

  it("resizes equal-priority panes proportionally", () => {
    const controller = new NSESplitViewController({
      id: "proportional",
      orientation: "horizontal",
      panes: [
        { id: "leading", minimum: 50, ideal: 100, maximum: 400, collapsible: false, collapsePriority: 0 },
        { id: "trailing", minimum: 50, ideal: 100, maximum: 400, collapsible: false, collapsePriority: 0 },
      ],
    });

    controller.resize(300);
    expect(controller.getSnapshot().panes.map(({ size }) => size)).toEqual([150, 150]);
    controller.resize(400);
    expect(controller.getSnapshot().panes.map(({ size }) => size)).toEqual([200, 200]);
  });
});
