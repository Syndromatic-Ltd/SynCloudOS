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

import { describe, expect, it } from "vitest";
import {
  resolveWindowPresentation,
  type ScreenSnapshot,
} from "../../src/SynCloudOS/Windows";
import {
  createWindowTestDependencies,
  modalWindow,
  panelWindow,
  popoverWindow,
  sheetWindow,
  standardWindow,
} from "../fixtures/windowTestDependencies";

const desktopScreen: ScreenSnapshot = {
  layoutViewport: { x: 0, y: 0, width: 1_440, height: 900 },
  visualViewport: { x: 0, y: 0, width: 1_440, height: 900 },
  workArea: { x: 0, y: 0, width: 1_440, height: 860 },
  safeAreaInsets: { blockStart: 0, inlineEnd: 0, blockEnd: 0, inlineStart: 0 },
  devicePixelRatio: 2,
  breakpoint: "regular",
  orientation: "landscape",
  virtualKeyboardInset: 0,
};

const compactScreen: ScreenSnapshot = {
  layoutViewport: { x: 0, y: 0, width: 390, height: 844 },
  visualViewport: { x: 0, y: 0, width: 390, height: 544 },
  workArea: { x: 0, y: 47, width: 390, height: 763 },
  safeAreaInsets: { blockStart: 47, inlineEnd: 0, blockEnd: 34, inlineStart: 0 },
  devicePixelRatio: 3,
  breakpoint: "compact",
  orientation: "portrait",
  virtualKeyboardInset: 300,
};

describe("non-destructive mobile window presentation", () => {
  it("returns the desktop bounds by reference at regular and wide breakpoints", async () => {
    const harness = createWindowTestDependencies();
    const controller = harness.manager.create(standardWindow("desktop"));

    const regular = resolveWindowPresentation(controller.record, desktopScreen);
    const wide = resolveWindowPresentation(controller.record, { ...desktopScreen, breakpoint: "wide" });

    expect(regular).toMatchObject({ kind: "desktop-window", visible: true, movable: true, resizable: true });
    expect(regular.bounds).toBe(controller.record.bounds);
    expect(wide.bounds).toBe(controller.record.bounds);
    await harness.cleanup();
  });

  it("maps fullscreen, sheets, popovers and hidden policies without mutating desktop geometry", async () => {
    const harness = createWindowTestDependencies();
    const parent = harness.manager.create(standardWindow("parent"));
    const standard = harness.manager.create(standardWindow("standard"));
    const modal = harness.manager.create(modalWindow("modal", parent.id, { mobilePolicy: "fullscreen" }));
    const panel = harness.manager.create(panelWindow("panel"));
    const sheet = harness.manager.create(sheetWindow("sheet", parent.id, { mobilePolicy: "fullscreen" }));
    const popover = harness.manager.create(popoverWindow("popover", parent.id));
    const hidden = harness.manager.create(standardWindow("hidden", { mobilePolicy: "hidden" }));
    const borderless = harness.manager.create(standardWindow("borderless", {
      role: "borderless",
      style: [],
    }));
    const originalBounds = new Map(harness.manager.list().map((entry) => [entry.id, entry.record.bounds]));

    expect(resolveWindowPresentation(standard.record, compactScreen)).toMatchObject({
      kind: "mobile-fullscreen",
      bounds: compactScreen.visualViewport,
      titleBarVisible: true,
      movable: false,
      resizable: false,
    });
    expect(resolveWindowPresentation(modal.record, compactScreen).kind).toBe("mobile-fullscreen");
    expect(resolveWindowPresentation(panel.record, compactScreen)).toMatchObject({
      kind: "mobile-sheet",
      bounds: { x: 0, y: 24, width: 390, height: 520 },
    });
    expect(resolveWindowPresentation(sheet.record, compactScreen).kind).toBe("mobile-sheet");
    expect(resolveWindowPresentation(popover.record, compactScreen).kind).toBe("mobile-sheet");
    expect(resolveWindowPresentation(hidden.record, compactScreen)).toMatchObject({ kind: "hidden", visible: false });
    expect(resolveWindowPresentation(borderless.record, compactScreen)).toMatchObject({
      kind: "mobile-fullscreen",
      titleBarVisible: false,
    });
    for (const controller of harness.manager.list()) expect(controller.record.bounds).toBe(originalBounds.get(controller.id));
    await harness.cleanup();
  });

  it("keeps compact sheet bounds inside the visual viewport above the keyboard", async () => {
    const harness = createWindowTestDependencies();
    const panel = harness.manager.create(panelWindow("small-panel", {
      bounds: { x: 900, y: 700, width: 320, height: 280 },
    }));

    const presentation = resolveWindowPresentation(panel.record, compactScreen);

    expect(presentation.bounds).toEqual({ x: 35, y: 264, width: 320, height: 280 });
    expect(presentation.bounds.y + presentation.bounds.height).toBeLessThanOrEqual(
      compactScreen.visualViewport.y + compactScreen.visualViewport.height,
    );
    expect(panel.record.bounds).toEqual({ x: 900, y: 700, width: 320, height: 280 });
    expect(resolveWindowPresentation(panel.record, desktopScreen).bounds).toBe(panel.record.bounds);
    await harness.cleanup();
  });
});
