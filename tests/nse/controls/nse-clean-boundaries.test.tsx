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
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEToolbar, type NSEToolbarProps } from "../../../src/NSE/Toolbars";
import { normalizeNSEProgress, progressStyle } from "../../../src/NSE/Progress/progressCore";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("explicit NSE toolbar ownership", () => {
  it.each([undefined, "unknown", "", null])("rejects composition %s before accessing a controller", (composition) => {
    expect(() => NSEToolbar({ composition } as unknown as NSEToolbarProps)).toThrow(/composition.*children.*configured/i);
  });

  it("rejects configured authority on the child branch", () => {
    expect(() => NSEToolbar({ composition: "children", controller: {} } as unknown as NSEToolbarProps)).toThrow(/configured toolbar props/i);
  });

  it("rejects children on the configured branch", () => {
    expect(() => NSEToolbar({ composition: "configured", children: <button>Lost child</button> } as unknown as NSEToolbarProps)).toThrow(/cannot receive children/i);
  });

  it("cancels deferred keyboard-focus work when a child toolbar unmounts", () => {
    const schedule = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(42);
    const cancel = vi.spyOn(window, "cancelAnimationFrame");
    const view = render(<><input aria-label="Editor" /><NSEToolbar composition="children" fadeOnKeyboard /></>);
    fireEvent.focusOut(screen.getByRole("textbox", { name: "Editor" }));
    expect(schedule).toHaveBeenCalledOnce();
    view.unmount();
    expect(cancel).toHaveBeenCalledWith(42);
  });

  it("coalesces focus-out work and clears the fade when keyboard fading is disabled", () => {
    let frame = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => ++frame);
    const cancel = vi.spyOn(window, "cancelAnimationFrame");
    const fixture = (enabled: boolean) => <><input aria-label="Editor" /><NSEToolbar composition="children" fadeOnKeyboard={enabled} /></>;
    const view = render(fixture(true));
    const field = screen.getByRole("textbox", { name: "Editor" });
    fireEvent.focusIn(field);
    expect(screen.getByRole("toolbar").classList.contains("nse-control-toolbar-fade-in")).toBe(true);
    fireEvent.focusOut(field);
    fireEvent.focusOut(field);
    expect(cancel).toHaveBeenCalledWith(1);
    view.rerender(fixture(false));
    expect(cancel).toHaveBeenCalledWith(2);
    expect(screen.getByRole("toolbar").classList.contains("nse-control-toolbar-fade-in")).toBe(false);
  });
});

describe("shared NSE progress normalisation", () => {
  it("projects whole percentages without floating point tails for both buffers", () => {
    const metrics = normalizeNSEProgress({ value: 58, alternateValue: 29 });
    expect(Object.values(progressStyle(metrics))).toEqual(["58%", "29%"]);
  });

  it("keeps fractional progress, absolute snapping and range clamping", () => {
    const metrics = normalizeNSEProgress({ value: 0.58, minimum: 0.25, maximum: 1.25, snap: 0.1, alternateValue: 2 });
    expect(metrics.value).toBeCloseTo(0.6);
    expect(metrics.percent).toBeCloseTo(35);
    expect(metrics.alternatePercent).toBe(100);
  });
});
