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
import { NSEFlex, NSEForm, NSEFormRow, NSEFormSeparator, NSEInline, NSEStack, resolveNSESpacing } from "../../src/NSE/Layout";
import { NSETextField } from "../../src/NSE/Controls/Fields";
import { NSEBox } from "../../src/NSE/Controls/Fields/NSEFields";
import { NSEDialog, NSEDividerDrawer, NSEPane } from "../../src/NSE/Containers";

afterEach(cleanup);

describe("NSE default layout", () => {
  it("applies a stack's gap even when no row or column gap is given", () => {
    // React writes an undefined style value as "", and clearing row-gap or
    // column-gap after `gap` erased the shorthand: every stack had no gap.
    const { container } = render(<>
      <NSEStack data-testid="stack"><span>A</span><span>B</span></NSEStack>
      <NSEInline data-testid="inline"><span>A</span><span>B</span></NSEInline>
      <NSEFlex data-testid="flex" gap={12}><span>A</span></NSEFlex>
      <NSEFlex data-testid="row-only" rowGap="group"><span>A</span></NSEFlex>
    </>);
    expect(screen.getByTestId("stack").style.gap).toBe("var(--nse-spacing-standard)");
    expect(screen.getByTestId("inline").style.gap).toBe("var(--nse-spacing-inline)");
    expect(screen.getByTestId("flex").style.gap).toBe("12px");
    expect(screen.getByTestId("row-only").style.rowGap).toBe("var(--nse-spacing-group)");
    expect(container.querySelectorAll("[style*='gap']")).toHaveLength(4);
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
      <NSEStack data-testid="leading" alignment="leading"><span>A</span></NSEStack>
      <NSEStack data-testid="fill"><span>A</span></NSEStack>
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

  it("names each form row's controls by its label and describes them by its help", () => {
    render(<NSEForm labelWidth={96}>
      <NSEFormRow label="Name:" help="As it appears on invoices."><input aria-label="Name field" /></NSEFormRow>
      <NSEFormSeparator />
      <NSEFormRow><span>Full-width note</span></NSEFormRow>
      <NSEFormRow label="Sync:" labelAlign="center"><span>Switch</span></NSEFormRow>
    </NSEForm>);
    const group = screen.getByRole("group", { name: "Name:" });
    expect(group.getAttribute("data-nse-content-layout")).toBe("stack");
    expect(group.getAttribute("aria-describedby")).toBe(screen.getByText("As it appears on invoices.").id);
    const rows = document.querySelectorAll(".nse-form-row");
    expect(rows[1]!.getAttribute("data-nse-full-width")).toBe("true");
    expect(rows[1]!.querySelector(".nse-form-label")).toBeNull();
    expect(rows[2]!.getAttribute("data-label-align")).toBe("center");
    expect((document.querySelector(".nse-form") as HTMLElement).style.getPropertyValue("--nse-form-label-column")).toBe("96px");
    expect(document.querySelector("hr.nse-form-separator")).not.toBeNull();
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
