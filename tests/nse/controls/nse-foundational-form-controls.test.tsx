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
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NSECheckbox, NSERadioGroup } from "../../../src/NSE/Controls/Fields/NSEFields";

describe("NSE foundational native form controls", () => {
  it("maps mixed checkbox state onto a native checkbox and preserves reset semantics", async () => {
    const stateChanges = vi.fn();
    render(
      <form aria-label="checkbox form">
        <NSECheckbox label="Archive on publish" name="archive" defaultState="mixed" onStateChange={stateChanges} />
      </form>,
    );

    const form = screen.getByRole("form", { name: "checkbox form" }) as HTMLFormElement;
    const checkbox = screen.getByRole("checkbox", { name: "Archive on publish" }) as HTMLInputElement;
    expect(checkbox.indeterminate).toBe(true);
    expect(checkbox.getAttribute("aria-checked")).toBe("mixed");
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
    expect(stateChanges).toHaveBeenCalledWith(true, "commit");
    form.reset();
    await waitFor(() => expect(checkbox.indeterminate).toBe(true));
  });

  it("uses named native radios with required state, roving focus, and form reset", () => {
    const changes = vi.fn();
    render(
      <form aria-label="layout form">
        <NSERadioGroup
          name="layout"
          required
          defaultValue="grid"
          options={[
            { value: "grid", label: "Grid" },
            { value: "list", label: "List" },
            { value: "locked", label: "Locked", disabled: true },
          ]}
          onValueChange={changes}
        />
      </form>,
    );

    const form = screen.getByRole("form", { name: "layout form" }) as HTMLFormElement;
    const grid = screen.getByRole("radio", { name: "Grid" }) as HTMLInputElement;
    const list = screen.getByRole("radio", { name: "List" }) as HTMLInputElement;
    expect(grid.name).toBe("layout");
    expect(grid.required).toBe(true);
    expect(grid.checked).toBe(true);
    expect(grid.tabIndex).toBe(0);
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    expect(list.checked).toBe(true);
    expect(list.tabIndex).toBe(0);
    expect(changes).toHaveBeenCalledWith("list", "commit");
    form.reset();
    expect(grid.checked).toBe(true);
  });
});
