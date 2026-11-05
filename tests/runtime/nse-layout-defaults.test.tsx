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

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { NSEGridRow, NSEGridView, NSEStackItem, NSEStackView, resolveNSESpacing } from "../../src/NSE/Layout";
import { NSETextField } from "../../src/NSE/Controls/Fields";
import { NSEBox } from "../../src/NSE/Controls/Fields/NSEFields";
import { NSEDialog, NSEDividerDrawer, NSEPane } from "../../src/NSE/Containers";

afterEach(cleanup);

describe("NSE default layout", () => {
  it("spaces a column and a row by the theme's standard and inline spacing", () => {
    render(<>
      <NSEStackView data-testid="column" orientation="vertical"><span>A</span><span>B</span></NSEStackView>
      <NSEStackView data-testid="row"><span>A</span><span>B</span></NSEStackView>
      <NSEStackView data-testid="pixels" spacing={12}><span>A</span></NSEStackView>
      <NSEStackView data-testid="wrapping" overflowPolicy="wrap" distribution="equal-spacing"><span>A</span></NSEStackView>
    </>);
    expect(screen.getByTestId("column").style.gap).toBe("var(--nse-spacing-standard)");
    expect(screen.getByTestId("column").style.flexDirection).toBe("column");
    expect(screen.getByTestId("row").style.gap).toBe("var(--nse-spacing-inline)");
    expect(screen.getByTestId("row").style.alignItems).toBe("center");
    expect(screen.getByTestId("pixels").style.gap).toBe("12px");
    expect(screen.getByTestId("wrapping").style.flexWrap).toBe("wrap");
    expect(screen.getByTestId("wrapping").style.justifyContent).toBe("space-between");
  });

  it("keeps a hidden stack item mounted but out of the layout", () => {
    render(<NSEStackView orientation="vertical"><NSEStackItem id="shown">Shown</NSEStackItem><NSEStackItem id="gone" hidden>Gone</NSEStackItem></NSEStackView>);
    expect(screen.getByText("Gone").closest("[data-stack-item-id]")?.hasAttribute("hidden")).toBe(true);
    expect(screen.getByText("Shown").closest("[data-stack-item-id]")?.hasAttribute("hidden")).toBe(false);
  });

  it("resolves named spacing to the SDK's tokens and passes lengths through", () => {
    expect(resolveNSESpacing("tight")).toBe("var(--nse-spacing-tight)");
    expect(resolveNSESpacing("none")).toBe("0px");
    expect(resolveNSESpacing(6)).toBe("6px");
    expect(resolveNSESpacing("1.5rem")).toBe("1.5rem");
    expect(resolveNSESpacing(undefined)).toBeUndefined();
  });

  it("makes a leading stack a content stack, and leaves a fill stack alone", () => {
    render(<>
      <NSEStackView data-testid="leading" orientation="vertical" alignment="leading"><span>A</span></NSEStackView>
      <NSEStackView data-testid="fill" orientation="vertical"><span>A</span></NSEStackView>
    </>);
    const leading = screen.getByTestId("leading");
    expect(leading.getAttribute("data-nse-content-layout")).toBe("stack");
    expect(leading.style.alignItems).toBe("");
    const fill = screen.getByTestId("fill");
    expect(fill.getAttribute("data-nse-content-layout")).toBeNull();
    expect(fill.style.alignItems).toBe("stretch");
  });

  it("gives a box standard content margins and a content stack by default", () => {
    const { container } = render(<NSEBox title="Downloads"><span>Row</span></NSEBox>);
    const box = container.querySelector("fieldset") as HTMLElement;
    expect(box.getAttribute("data-nse-layout-margins")).toBe("standard");
    expect(box.style.getPropertyValue("--nse-box-inset-top")).toBe("var(--nse-box-margin-top, 0px)");
    expect(container.querySelector(".nse-box-content")?.getAttribute("data-nse-content-layout")).toBe("stack");
  });

  it("lets a box take explicit contentViewMargins, or opt out of the content stack", () => {
    const { container } = render(<>
      <NSEBox data-testid="none" contentViewMargins={{ width: 0, height: 0 }} contentLayout="flow"><span>Row</span></NSEBox>
      <NSEBox data-testid="explicit" contentViewMargins={{ width: 10, height: 4 }}><span>Row</span></NSEBox>
    </>);
    const none = screen.getByTestId("none");
    expect(none.style.getPropertyValue("--nse-box-inset-top")).toBe("0px");
    expect(none.querySelector(".nse-box-content")?.getAttribute("data-nse-content-layout")).toBeNull();
    const explicit = screen.getByTestId("explicit");
    expect(explicit.getAttribute("data-nse-layout-margins")).toBeNull();
    expect(explicit.style.getPropertyValue("--nse-box-inset-left")).toBe("10px");
    expect(explicit.style.getPropertyValue("--nse-box-inset-top")).toBe("4px");
    expect(container.querySelectorAll("[data-nse-content-layout='stack']")).toHaveLength(1);
  });

  it("lays out containers' bodies as content stacks unless asked for flow", () => {
    const { container } = render(<>
      <NSEPane title="Pane"><span>Body</span></NSEPane>
      <NSEPane title="Flow" contentLayout="flow"><span>Body</span></NSEPane>
      <NSEDialog title="Dialog"><span>Body</span></NSEDialog>
      <NSEDividerDrawer title="Drawer" defaultOpen><span>Body</span></NSEDividerDrawer>
    </>);
    const bodies = [...container.querySelectorAll(".nse-container-pane-body, .nse-container-dialog-body, .nse-container-divider-drawer-panel-inner")];
    expect(bodies.map((body) => body.getAttribute("data-nse-content-layout"))).toEqual(["stack", null, "stack", "stack"]);
  });

  it("lays out a two-column grid as a form, each row's views named by its label", () => {
    render(<NSEGridView columns={[{ xPlacement: "trailing", width: 96 }, { xPlacement: "fill" }]}>
      <NSEGridRow>{"Name:"}<input aria-label="Name field" /></NSEGridRow>
      <NSEGridRow mergesCells><span>Full-width note</span></NSEGridRow>
      <NSEGridRow yPlacement="centre">{"Sync:"}<span>Switch</span></NSEGridRow>
    </NSEGridView>);
    const group = screen.getByRole("group", { name: "Name:" });
    expect(group.getAttribute("data-nse-content-layout")).toBe("stack");
    const rows = document.querySelectorAll(".nse-form-row");
    expect(rows[1]!.getAttribute("data-nse-full-width")).toBe("true");
    expect(rows[1]!.querySelector(".nse-form-label")).toBeNull();
    expect(rows[2]!.getAttribute("data-label-align")).toBe("center");
    const grid = document.querySelector("[data-nse-control='grid-view']") as HTMLElement;
    expect(grid.style.getPropertyValue("--nse-form-label-column")).toBe("96px");
    expect(grid.getAttribute("data-label-alignment")).toBe("trailing");
  });

  it("places each cell of a grid that is not a form by its column", () => {
    render(<NSEGridView columns={[{ xPlacement: "leading" }, { xPlacement: "centre", width: 40 }, { xPlacement: "fill" }]}>
      <NSEGridRow>{"Size"}<span>12</span><span>points</span></NSEGridRow>
    </NSEGridView>);
    expect((document.querySelector(".nse-form-grid") as HTMLElement).style.gridTemplateColumns).toBe("max-content 40px minmax(0, 1fr)");
    const middle = screen.getByText("12").parentElement as HTMLElement;
    expect(middle.style.gridColumn).toBe("2");
    expect(middle.style.justifySelf).toBe("center");
  });

  it("draws a label text field in a font text style and colour", () => {
    render(<NSETextField isEditable={false} role="status" font="footnote" textColor="secondaryLabelColor" monospacedDigits lineBreakMode="byCharWrapping">1,572,864 bytes</NSETextField>);
    const text = screen.getByRole("status");
    expect(text.textContent).toBe("1,572,864 bytes");
    expect(text.tagName).toBe("SPAN");
    expect(text.className).toBe("nse-control-label-field");
    expect(text.getAttribute("data-font")).toBe("footnote");
    expect(text.getAttribute("data-text-color")).toBe("secondary");
    expect(text.getAttribute("data-monospaced-digits")).toBe("true");
    expect(text.getAttribute("data-line-break-mode")).toBe("char");
    expect(document.querySelector("input")).toBeNull();
  });
});
