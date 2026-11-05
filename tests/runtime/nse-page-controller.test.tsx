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

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEPageController } from "../../src/NSE/Page";

afterEach(cleanup);

const days = ["Saturday", "Sunday", "Monday"] as const;

describe("NSEPageController", () => {
  it("shows the selected object's page and keeps the others mounted but inert", () => {
    render(<NSEPageController aria-label="Days" arrangedObjects={days} selectedIndex={1} identifierForObject={(day) => day} viewForObject={(day) => <span>{day}</span>} />);
    const pages = [...document.querySelectorAll("[aria-roledescription='page']")];
    expect(pages).toHaveLength(3);
    expect(pages.map((page) => page.getAttribute("data-active"))).toEqual(["false", "true", "false"]);
    expect(pages[0]!.hasAttribute("inert")).toBe(true);
    expect((document.querySelector(".nse-container-sliding-view-track") as HTMLElement).style.transform).toBe("translate3d(-100%, 0, 0)");
    expect(screen.getByLabelText("Days").getAttribute("data-transition-style")).toBe("horizontalStrip");
  });

  it("turns the page on a horizontal swipe and reports the transition", () => {
    const onSelectedIndexChange = vi.fn();
    render(<NSEPageController aria-label="Days" arrangedObjects={days} onSelectedIndexChange={onSelectedIndexChange} viewForObject={(day) => <span>{day}</span>} />);
    const controller = screen.getByLabelText("Days");
    fireEvent.pointerDown(controller, { pointerId: 1, isPrimary: true, clientX: 200, clientY: 10 });
    fireEvent.pointerUp(controller, { pointerId: 1, clientX: 100, clientY: 14 });
    expect(onSelectedIndexChange).toHaveBeenCalledWith(1, "Sunday");
    expect(controller.getAttribute("data-selected-index")).toBe("1");
    fireEvent.pointerDown(controller, { pointerId: 2, isPrimary: true, clientX: 100, clientY: 10 });
    fireEvent.pointerUp(controller, { pointerId: 2, clientX: 120, clientY: 10 });
    expect(controller.getAttribute("data-selected-index")).toBe("1");
  });

  it("does not turn past the first page", () => {
    const onSelectedIndexChange = vi.fn();
    render(<NSEPageController aria-label="Days" arrangedObjects={days} selectedIndex={0} onSelectedIndexChange={onSelectedIndexChange} viewForObject={(day) => <span>{day}</span>} />);
    const controller = screen.getByLabelText("Days");
    fireEvent.pointerDown(controller, { pointerId: 1, isPrimary: true, clientX: 100, clientY: 10 });
    fireEvent.pointerUp(controller, { pointerId: 1, clientX: 220, clientY: 10 });
    expect(onSelectedIndexChange).not.toHaveBeenCalled();
  });
});
