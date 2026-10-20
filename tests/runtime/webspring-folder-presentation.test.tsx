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
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
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
import { createWebspringFolderSplitPresentation } from "../../src/Webspring/WebspringFolderSplitPresentation";

const folder = {
  kind: "folder",
  id: "folder.tools",
  title: "Tools",
  apps: [{ bundleIdentifier: "com.example.beta", displayName: "Beta" }, { bundleIdentifier: "com.example.gamma", displayName: "Gamma" }],
  badgeCount: 0,
} as unknown as WebspringFolderItem;

let stageBox = new DOMRect(0, 0, 800, 600);
let stage: HTMLElement;
let layer: HTMLElement;
const drawImage = vi.fn();

function buildStage() {
  const element = document.createElement("main");
  element.className = "webspring-board";
  element.innerHTML = [
    '<section class="webspring-board-launcher">',
    '<div class="webspring-board-page">',
    '<button type="button" class="webspring-board-icon" data-webspring-item-id="app.alpha" data-order-index="0">',
    '<span class="webspring-board-icon-well"><span aria-hidden="true">A</span></span>',
    '<span class="webspring-board-icon-label">Alpha</span>',
    "</button>",
    '<button type="button" class="webspring-board-icon is-folder" data-webspring-item-id="folder.tools" data-order-index="1">',
    '<span class="webspring-board-icon-well"><canvas width="8" height="8"></canvas></span>',
    '<span class="webspring-board-icon-label">Tools</span>',
    "</button>",
    "</div>",
    '<p id="webspring-board-keyboard-help">Hold an application to reorder.</p>',
    '<div class="webspring-board-folder-layer"></div>',
    "</section>",
    '<div class="webspring-drag-proxy">proxy</div>',
  ].join("");
  element.getBoundingClientRect = () => stageBox;
  return element;
}

beforeEach(() => {
  stageBox = new DOMRect(0, 0, 800, 600);
  stage = buildStage();
  document.body.append(stage);
  layer = stage.querySelector<HTMLElement>(".webspring-board-folder-layer")!;
  drawImage.mockClear();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({ drawImage }) as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  cleanup();
  stage.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const Presentation = createWebspringFolderSplitPresentation({ panelHeight: 240, duration: 0 });

function renderSplit({ reducedMotion = false, onClose = vi.fn(), Split = Presentation } = {}) {
  const view = render(<Split
    folder={folder}
    stage={stage}
    anchor={new DOMRect(100, 100, 80, 80)}
    reducedMotion={reducedMotion}
    renderApp={(app) => <button type="button">{`Open ${app.displayName}`}</button>}
    onClose={onClose}
  />, { container: layer });
  const root = view.container.querySelector<HTMLElement>(".webspring-folder-split")!;
  return { view, root, onClose };
}

const opened = (root: HTMLElement) => waitFor(() => expect(root.dataset.phase).toBe("open"));
const cloneOf = (root: HTMLElement, half: "is-top" | "is-bottom") =>
  root.querySelector<HTMLElement>(`.webspring-folder-split-half.${half} .webspring-folder-split-clone`)!;

describe("Webspring folder split presentation", () => {
  it("copies the stage into both halves as it mounts, with no capture to wait for", () => {
    const { root } = renderSplit();

    // The split never sits waiting for anything: it is at rest in the same
    // pass that mounts it, with both halves already filled.
    expect(root.dataset.phase).toBe("closed");
    expect(root.querySelectorAll(".webspring-folder-split-clone")).toHaveLength(2);
    expect(root.dataset.capture).toBeUndefined();
  });

  it("draws the stage's canvases across into each copy and drops what belongs to the split", async () => {
    const { root } = renderSplit();
    await opened(root);

    const source = stage.querySelector("canvas")!;
    for (const half of ["is-top", "is-bottom"] as const) {
      const clone = cloneOf(root, half);
      expect(clone.querySelector("canvas")!.width).toBe(8);
      expect(clone.querySelector(".webspring-folder-split")).toBeNull();
      expect(clone.querySelector(".webspring-drag-proxy")).toBeNull();
      expect(clone.querySelector("[id]")).toBeNull();
      expect(clone.getAttribute("aria-hidden")).toBe("true");
      expect(clone.style.pointerEvents).toBe("none");
    }
    expect(drawImage).toHaveBeenCalledWith(source, 0, 0);
  });

  it("lines its copy up with a stage whose edge is off screen", () => {
    stageBox = new DOMRect(-20, -30, 800, 600);
    const { root } = renderSplit();

    // The split covers what the stage shows; the copy keeps the stage's own
    // origin so its pixels stay where the viewer saw them.
    expect(root.style).toMatchObject({ left: "0px", top: "0px", width: "780px", height: "570px" });
    for (const half of ["is-top", "is-bottom"] as const) {
      expect(cloneOf(root, half).style).toMatchObject({ left: "-20px", top: "-30px", width: "800px", height: "600px" });
    }
  });

  it("fades every icon but the opened folder's own", async () => {
    const { root } = renderSplit();
    await opened(root);

    for (const half of ["is-top", "is-bottom"] as const) {
      const clone = cloneOf(root, half);
      expect(clone.querySelector('[data-webspring-item-id="folder.tools"]')!.getAttribute("data-webspring-folder-backdrop")).toBe("anchor");
      expect(clone.querySelector('[data-webspring-item-id="app.alpha"]')!.getAttribute("data-webspring-folder-backdrop")).toBe("backdrop");
    }
  });

  it("reveals an upward underlay pointer through the upper seam, covered while shut", async () => {
    const { root } = renderSplit();
    const [top, bottom] = root.querySelectorAll<HTMLElement>(".webspring-folder-split-half");

    // The top-stage cutout points up towards the folder's centre. The lower
    // clone covers the entire cutout at rest, leaving no notch in the stage.
    const topHost = top.querySelector<HTMLElement>(".webspring-folder-split-clone-host")!;
    const points = [...topHost.style.clipPath.matchAll(/(-?\d+)px (-?\d+)px/gu)]
      .map(([, x, y]) => ({ x: Number(x), y: Number(y) }));
    const [right, tip, left] = points;
    expect([right, tip, left]).toEqual([{ x: 154, y: 186 }, { x: 140, y: 172 }, { x: 126, y: 186 }]);
    expect(tip.x).toBe(100 + 80 / 2);
    expect(tip.y).toBeLessThan(left.y);
    expect(top.style.height).toBe("186px");
    expect(bottom.style.top).toBe("172px");
    expect(bottom.style.transform).toBe("");
    expect(screen.getByRole("dialog", { name: "Tools" }).style).toMatchObject({ top: "186px", height: "240px" });

    await opened(root);
    // The 240 px panel fits, so the top half stays and the bottom half moves
    // down by the panel's height plus the triangle depth it covered.
    expect(top.style.transform).toBe("translate3d(0, 0px, 0)");
    expect(bottom.style.transform).toBe("translate3d(0, 254px, 0)");
    expect(Number.parseFloat(bottom.style.top) + 254).toBe(186 + 240);
    expect(topHost.style.clipPath).not.toMatch(/url\(#/u);
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Open Beta"));
  });

  it("keeps the upward cutout attached to the upper seam when the panel shifts to fit", async () => {
    stageBox = new DOMRect(0, 0, 800, 300);
    const { root } = renderSplit();
    await opened(root);
    const [top, bottom] = root.querySelectorAll<HTMLElement>(".webspring-folder-split-half");
    const panel = screen.getByRole("dialog", { name: "Tools" });
    expect(panel.style).toMatchObject({ top: "60px", height: "240px" });
    expect(top.style.transform).toBe("translate3d(0, -126px, 0)");
    const clip = top.querySelector<HTMLElement>(".webspring-folder-split-clone-host")!.style.clipPath;
    const [, tip] = [...clip.matchAll(/(-?\d+)px (-?\d+)px/gu)];
    expect(Number(tip[2]) - 126).toBe(Number.parseFloat(panel.style.top) - 14);
    expect(bottom.style.transform).toBe("translate3d(0, 128px, 0)");
    expect(Number.parseFloat(bottom.style.top) + 128).toBe(300);
  });

  it("uses a straight upper seam without a cutout when the pointer is disabled", async () => {
    const { root } = renderSplit({ Split: createWebspringFolderSplitPresentation({ panelHeight: 240, duration: 0, notch: false }) });
    const [top, bottom] = root.querySelectorAll<HTMLElement>(".webspring-folder-split-half");
    expect(top.querySelector<HTMLElement>(".webspring-folder-split-clone-host")!.style.clipPath).toBe("");
    expect(top.style.height).toBe("186px");
    expect(bottom.style.top).toBe("186px");
    await opened(root);
    expect(bottom.style.transform).toBe("translate3d(0, 240px, 0)");
  });

  it("crossfades instead of parting for reduced motion", async () => {
    const { root } = renderSplit({ reducedMotion: true });
    await opened(root);

    expect(root.dataset.motion).toBe("fade");
    expect(root.querySelectorAll(".webspring-folder-split-clone")).toHaveLength(2);
  });

  it("lays out again when the stage resizes, keeping one copy per half", async () => {
    const { root } = renderSplit();
    await opened(root);

    stageBox = new DOMRect(0, 0, 900, 700);
    await act(async () => { window.dispatchEvent(new Event("resize")); });

    await waitFor(() => expect(root.style.width).toBe("900px"));
    expect(root.style.height).toBe("700px");
    expect(root.querySelectorAll(".webspring-folder-split-clone")).toHaveLength(2);
    for (const half of ["is-top", "is-bottom"] as const) {
      expect(cloneOf(root, half).style).toMatchObject({ width: "900px", height: "700px" });
    }
    const [top, bottom] = root.querySelectorAll<HTMLElement>(".webspring-folder-split-half");
    expect(top.style.height).toBe("186px");
    expect(bottom.style.top).toBe("172px");
    expect(root.dataset.phase).toBe("open");
  });

  it("closes on Escape, telling the view once the halves have rejoined", async () => {
    const { root, onClose } = renderSplit({ Split: createWebspringFolderSplitPresentation({ panelHeight: 240, duration: 0.3 }) });
    await opened(root);

    vi.useFakeTimers();
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Tools" }), { key: "Escape" });
    expect(root.dataset.phase).toBe("closing");
    const bottom = root.querySelector<HTMLElement>(".webspring-folder-split-half.is-bottom")!;
    expect(bottom.style.top).toBe("172px");
    expect(bottom.style.transform).toBe("");
    act(() => vi.advanceTimersByTime(359));
    expect(onClose).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when either half or the underlay is tapped, once", async () => {
    const { root, onClose } = renderSplit();
    await opened(root);

    fireEvent.click(root.querySelector(".webspring-folder-split-half.is-top")!);
    fireEvent.click(root.querySelector(".webspring-folder-split-half.is-bottom")!);
    fireEvent.click(root.querySelector(".webspring-folder-split-backdrop")!);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
