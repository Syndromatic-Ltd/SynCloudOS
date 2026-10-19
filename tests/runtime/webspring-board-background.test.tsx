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
import { act, cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact";
import type { SynCloudOSRuntime } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";
import { WebspringBoardView } from "../../src/Webspring/Contents/Views/WebspringBoardView/WebspringBoardView";
import { WebspringController } from "../../src/Webspring/WebspringController";
import * as publicApi from "../../src/Webspring/public";
import { WebspringSurface, defineWebspring, defineWidget, webspringSurfaceStyle, type WebspringDefinition, type WebspringDefinitionInput } from "../../src/Webspring/public";
import { createTestRuntime } from "./helpers";

type Options = Partial<Pick<WebspringDefinitionInput, "background" | "widgets">>;

function defineBoard(options: Options = {}) {
  return defineWebspring({
    manifest: {
      schemaVersion: 1,
      id: "com.example.background",
      version: "1.0.0",
      title: "Background fixture",
      webspringShell: {
        views: [{ id: "board", presentations: ["desktop", "tablet", "mobile"], mode: "launcher" }],
        defaults: { desktop: "board", tablet: "board", mobile: "board" },
        homeRoute: "/",
        branding: { name: { key: "site.name", fallback: "Background fixture" } },
      },
    },
    components: { board: WebspringBoardView },
    ...options,
  });
}

const runtimes: SynCloudOSRuntime[] = [];
afterEach(async () => {
  cleanup();
  for (const runtime of runtimes.splice(0)) await runtime.dispose({ reason: "test-complete", inFlight: "cancel" });
});

function renderBoard(shell: WebspringDefinition) {
  const runtime = createTestRuntime();
  runtimes.push(runtime);
  const controller = new WebspringController(runtime, shell, undefined);
  const view = render(
    <SynCloudOSProvider runtime={runtime}>
      <WebspringBoardView model={controller.model(runtime.store.getSnapshot(), "mobile")} actions={controller.actions} applicationOutlet={null} folderPresentation={shell.folderPresentation} />
    </SynCloudOSProvider>,
  );
  return { ...view, board: view.container.querySelector<HTMLElement>("main.webspring-board")! };
}

const property = (element: HTMLElement, name: string) => element.style.getPropertyValue(name);

describe("Board background", () => {
  it("defaults to tinted cotton with a spotlight", () => {
    const shell = defineBoard();
    expect(shell.background.launcher).toEqual(WebspringSurface.cotton());
    const style = webspringSurfaceStyle(WebspringSurface.cotton(), "--x") as Record<string, string>;
    expect(style["--x-colour"]).toBe("#5a6170");
    expect(style["--x-image"]).toContain("/assets/textures/NSETileCotton.jpg");
    expect(style["--x-image"]).toContain("radial-gradient");
    expect(style["--x-image"]).toContain("#4a6fa5");
    expect(style["--x-size"]).toContain("256px");
  });

  it("paints the Board root from the launcher surface", () => {
    const { board } = renderBoard(defineBoard());
    expect(property(board, "--webspring-launcher-colour")).toBe("#5a6170");
    expect(property(board, "--webspring-launcher-image")).toContain("NSETileCotton.jpg");
  });

  it("paints a flat colour with no layers when asked for a plain surface", () => {
    const { board } = renderBoard(defineBoard({ background: { launcher: WebspringSurface.plain("#223344") } }));
    expect(property(board, "--webspring-launcher-colour")).toBe("#223344");
    expect(property(board, "--webspring-launcher-image")).toBe("none");
    expect(property(board, "--webspring-launcher-overlay-image")).toBe("none");
  });

  it("lets a developer spread a preset and change one field", () => {
    const launcher = { ...WebspringSurface.cotton(), vignette: false as const };
    const style = webspringSurfaceStyle(launcher, "--x") as Record<string, string>;
    expect(style["--x-image"]).not.toContain("radial-gradient");
    expect(style["--x-image"]).toContain("#4a6fa5");
    expect(style["--x-image"]).toContain("NSETileCotton.jpg");
  });

  it("draws a texture, an overlay and a blend from a custom surface", () => {
    const style = webspringSurfaceStyle({
      colour: "#929eae",
      texture: { image: "/metal.webp", size: "100% 100%", repeat: false },
      vignette: false,
      overlay: { image: "/glow.png", opacity: 0.22, blend: "screen" },
    }, "--x") as Record<string, string>;
    expect(style["--x-image"]).toBe('url("/metal.webp")');
    expect(style["--x-size"]).toBe("100% 100%");
    expect(style["--x-repeat"]).toBe("no-repeat");
    expect(style["--x-overlay-image"]).toBe('url("/glow.png")');
    expect(style["--x-overlay-opacity"]).toBe("0.22");
    expect(style["--x-overlay-blend"]).toBe("screen");
  });

  it("rejects surfaces it cannot paint", () => {
    expect(() => defineBoard({ background: { launcher: { colour: "" } } })).toThrow(/colour/iu);
    expect(() => defineBoard({ background: { launcher: { tint: { colour: "red", opacity: 2 } } } })).toThrow(/opacity/iu);
    expect(() => defineBoard({ background: { launcher: { vignette: { edge: -1 } } } })).toThrow(/edge/iu);
    expect(() => defineBoard({ background: { launcher: { glow: true } as never } })).toThrow(/glow/iu);
    expect(() => defineBoard({ background: { shelf: WebspringSurface.plain("#000") } as never })).toThrow(/launcher/iu);
  });
});

describe("Board widget shelf", () => {
  const latest = defineWidget({ id: "latest", title: "Latest", load: async () => ["First post"] as readonly string[], view: ({ data }) => <p>{data[0]}</p>, whenEmpty: "hide" });

  it("renders no shelf element, and no shelf background, without widgets", async () => {
    const { board } = renderBoard(defineBoard({ background: { launcher: WebspringSurface.cotton(), shelf: WebspringSurface.plain("#ff0000") } }));
    await act(async () => undefined);
    expect(board.querySelector(".webspring-widget-shelf")).toBeNull();
    expect(board.querySelector("[data-widget-id]")).toBeNull();
    expect(board.innerHTML).not.toContain("Loading content");
    expect(board.style.getPropertyValue("--webspring-shelf-colour")).toBe("");
  });

  it("renders the shelf, on the shelf surface, when a widget is declared", async () => {
    const { board } = renderBoard(defineBoard({ widgets: [latest], background: { launcher: WebspringSurface.cotton(), shelf: WebspringSurface.plain("#0b0d11") } }));
    await act(async () => undefined);
    const shelf = board.querySelector<HTMLElement>(".webspring-widget-shelf");
    expect(shelf).not.toBeNull();
    expect(property(shelf!, "--webspring-shelf-colour")).toBe("#0b0d11");
    expect(screen.getByText("First post")).toBeTruthy();
  });
});

describe("removed content APIs", () => {
  it("are no longer exported or accepted", () => {
    expect(Object.keys(publicApi)).not.toContain("LowerContentShelfView");
    expect(Object.keys(publicApi)).toEqual(expect.arrayContaining(["defineWidget", "WebspringSurface"]));
    expect(defineBoard()).not.toHaveProperty("content");
  });

  it("require widgets to come from defineWidget", () => {
    expect(() => defineBoard({ widgets: [{ id: "latest" }] as never })).toThrow(/defineWidget/u);
    expect(() => defineBoard({ widgets: [latestWidget("a"), latestWidget("a")] })).toThrow(/duplicate/iu);
  });
});

function latestWidget(id: string) {
  return defineWidget({ id, title: id, load: () => [] as readonly string[], view: () => null, whenEmpty: "hide" });
}
