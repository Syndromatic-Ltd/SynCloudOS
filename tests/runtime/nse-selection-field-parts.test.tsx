// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NSEButton } from "../../src/NSE/Controls/Buttons/NSEButton";
import { NSERadioGroup } from "../../src/NSE/Controls/Fields/NSEFields";
afterEach(cleanup);
describe("native selection field drawing parts", () => {
  it("publishes the switch field and its enclosing content slot without changing its checked semantics", () => {
    render(<NSEButton buttonType="switch" title="Updates" state="on" />);
    const field = screen.getByRole("checkbox");
    expect(field.getAttribute("data-nse-part")).toBe("field");
    expect(field.parentElement?.getAttribute("data-nse-part")).toBe("content");
    expect((field as HTMLInputElement).checked).toBe(true);
  });
  it("publishes a radio field's native disabled and checked semantics", () => {
    render(<NSERadioGroup label="Layout" options={[{value:"list",label:"List"},{value:"grid",label:"Grid",isEnabled:false}]} value="list" />);
    const [list, grid] = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(list.getAttribute("data-nse-part")).toBe("field");
    expect(grid.getAttribute("data-nse-part")).toBe("field");
    expect(list.checked).toBe(true); expect(grid.disabled).toBe(true);
  });
});
