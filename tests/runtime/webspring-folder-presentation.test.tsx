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
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebspringFolderItem } from "../../src/Webspring/webspringTypes";

// The stage capture itself is SnapDOM's; these tests drive its outcome.
const capture = vi.hoisted(() => ({
  available: true,
  strips: [] as DOMRect[],
  hold: null as Promise<void> | null,
}));
vi.mock("@zumer/snapdom", () => ({ snapdom: {} }));
vi.mock("../../src/Webspring/notificationScreenSliceCapture", () => ({
  screenSliceIgnoredSelectors: [],
  shouldUseNotificationSnapdomCapture: () => capture.available,
  collectNotificationCanvasReplacements: () => [],
  clearNotificationCanvasMarks: () => undefined,
  captureScreenSlice: async (_snapdom: unknown, _root: unknown, _replacements: unknown, _scale: number, strip: DOMRect) => {
    capture.strips.push(strip);
    await capture.hold;
    const canvas = document.createElement("canvas");
    canvas.width = strip.width;
    canvas.height = strip.height;
    return canvas;
  },
}));

const { createWebspringFolderSplitPresentation } = await import("../../src/Webspring/WebspringFolderSplitPresentation");

const folder = {
  kind: "folder",
  id: "folder.tools",
  title: "Tools",
  apps: [{ id: "beta", title: "Beta" }, { id: "gamma", title: "Gamma" }],
  badgeCount: 0,
} as unknown as WebspringFolderItem;

let stageBox = new DOMRect(0, 0, 800, 600);
let stage: HTMLElement;
const drawImage = vi.fn();

beforeEach(() => {
  capture.available = true;
  capture.strips = [];
  capture.hold = null;
  stageBox = new DOMRect(0, 0, 800, 600);
  stage = document.createElement("div");
  stage.getBoundingClientRect = () => stageBox;
  document.body.append(stage);
  drawImage.mockClear();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({ drawImage }) as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  cleanup();
  stage.remove();
  vi.restoreAllMocks();
});

function renderSplit({ reducedMotion = false, onClose = vi.fn() } = {}) {
  const Presentation = createWebspringFolderSplitPresentation({ panelHeight: 240, duration: 0 });
  const view = render(<Presentation
    folder={folder}
    stage={stage}
    anchor={new DOMRect(100, 100, 80, 80)}
    reducedMotion={reducedMotion}
    renderApp={(app) => <button type="button">{`Open ${app.title}`}</button>}
    onClose={onClose}
  />);
  const root = view.container.querySelector<HTMLElement>(".webspring-folder-split")!;
  return { view, root, onClose };
}

const opened = (root: HTMLElement) => waitFor(() => expect(root.dataset.phase).toBe("open"));

describe("Webspring folder split presentation", () => {
  it("parts the captured stage below the folder icon and opens", async () => {
    const { root } = renderSplit();
    await opened(root);

    expect(root.dataset).toMatchObject({ capture: "ready", motion: "split" });
    const [top, bottom] = root.querySelectorAll<HTMLCanvasElement>(".webspring-folder-split-half");
    // The seam sits 6 px below the icon; the 240 px panel fits beneath it.
    expect(top.style).toMatchObject({ top: "0px", height: "186px", transform: "translate3d(0, 0px, 0)" });
    expect(bottom.style).toMatchObject({ top: "186px", height: "414px", transform: "translate3d(0, 240px, 0)" });
    expect(screen.getByRole("dialog", { name: "Tools" }).style).toMatchObject({ top: "186px", height: "240px" });
    expect(drawImage).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), 0, 0, 800, 186, 0, 0, 800, 186);
    expect(drawImage).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), 0, 186, 800, 414, 0, 0, 800, 414);
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Open Beta"));
  });

  it("opens over a dimmed backdrop when the stage cannot be captured", async () => {
    capture.available = false;
    const { root } = renderSplit();
    await opened(root);

    expect(root.dataset).toMatchObject({ capture: "failed", motion: "fade" });
    expect(root.querySelectorAll(".webspring-folder-split-half")).toHaveLength(0);
    expect(screen.getByRole("dialog", { name: "Tools" }).style.height).toBe("240px");
  });

  it("crossfades for reduced motion", async () => {
    const { root } = renderSplit({ reducedMotion: true });
    await opened(root);

    expect(root.dataset).toMatchObject({ capture: "ready", motion: "fade" });
  });

  it("covers the live stage while it is captured, and a tap there cancels", async () => {
    const { promise, resolve: release } = Promise.withResolvers<void>();
    capture.hold = promise;
    const { root, onClose } = renderSplit();

    expect(root.dataset.phase).toBe("preparing");
    expect(root.style).toMatchObject({ left: "0px", top: "0px", width: "800px", height: "600px" });
    fireEvent.click(root.querySelector(".webspring-folder-split-backdrop")!);
    expect(onClose).toHaveBeenCalledTimes(1);
    await act(async () => release());
  });

  it("recaptures and lays out again when the stage resizes", async () => {
    const { root } = renderSplit();
    await opened(root);
    expect(capture.strips.map((strip) => strip.width)).toEqual([800]);

    stageBox = new DOMRect(0, 0, 900, 700);
    await act(async () => { window.dispatchEvent(new Event("resize")); });

    await waitFor(() => expect(capture.strips.map((strip) => strip.width)).toEqual([800, 900]));
    await waitFor(() => expect(root.dataset.capture).toBe("ready"));
    expect(root.style).toMatchObject({ width: "900px", height: "700px" });
    const bottom = root.querySelectorAll<HTMLCanvasElement>(".webspring-folder-split-half")[1];
    expect(bottom.style).toMatchObject({ top: "186px", height: "514px", transform: "translate3d(0, 240px, 0)" });
    expect(root.dataset.phase).toBe("open");
  });

  it("closes on Escape once the halves have rejoined", async () => {
    const { root, onClose } = renderSplit();
    await opened(root);

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Tools" }), { key: "Escape" });
    expect(root.dataset.phase).toBe("closing");
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
