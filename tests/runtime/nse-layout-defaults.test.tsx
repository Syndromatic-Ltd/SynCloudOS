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
import { NSEFlex, NSEForm, NSEFormRow, NSEFormSeparator, NSEInline, NSEStack, NSEText, resolveNSESpacing } from "../../src/NSE/Layout";
import { NSEGroupBox } from "../../src/NSE/Controls/Fields/NSEFields";
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

  it("gives a group box standard layout margins and a content stack by default", () => {
    const { container } = render(<NSEGroupBox label="Downloads"><span>Row</span></NSEGroupBox>);
    const box = container.querySelector("fieldset") as HTMLElement;
    expect(box.getAttribute("data-nse-layout-margins")).toBe("standard");
    expect(box.style.getPropertyValue("--nse-box-inset-top")).toBe("var(--nse-box-margin-top, 0px)");
    expect(container.querySelector(".nse-box-content")?.getAttribute("data-nse-content-layout")).toBe("stack");
  });

  it("lets a group box opt out of margins and the content stack, or take explicit insets", () => {
    const { container } = render(<>
      <NSEGroupBox data-testid="none" layoutMargins="none" contentLayout="flow"><span>Row</span></NSEGroupBox>
      <NSEGroupBox data-testid="explicit" contentInsets={{ top: 4, right: 6, bottom: 8, left: 10 }}><span>Row</span></NSEGroupBox>
    </>);
    const none = screen.getByTestId("none");
    expect(none.getAttribute("data-nse-layout-margins")).toBe("none");
    expect(none.querySelector(".nse-box-content")?.getAttribute("data-nse-content-layout")).toBeNull();
    const explicit = screen.getByTestId("explicit");
    expect(explicit.getAttribute("data-nse-layout-margins")).toBeNull();
    expect(explicit.style.getPropertyValue("--nse-box-inset-left")).toBe("10px");
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

  it("renders text in a named style and tone", () => {
    render(<NSEText as="output" textStyle="footnote" tone="secondary" numeric wrap="anywhere">1,572,864 bytes</NSEText>);
    const text = screen.getByText("1,572,864 bytes");
    expect(text.tagName).toBe("OUTPUT");
    expect(text.className).toBe("nse-text");
    expect(text.getAttribute("data-text-style")).toBe("footnote");
    expect(text.getAttribute("data-tone")).toBe("secondary");
    expect(text.getAttribute("data-numeric")).toBe("true");
    expect(text.getAttribute("data-wrap")).toBe("anywhere");
  });
});
