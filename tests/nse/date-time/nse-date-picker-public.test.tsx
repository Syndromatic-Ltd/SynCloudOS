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
import { NSEDatePicker } from "../../../src/NSE/DateTime/Pickers/NSEDatePicker";

afterEach(cleanup);
const date = (year: number, month: number, day: number) => ({ year, month, day });
const civil = { locale: "en-GB", timeZone: "Europe/London" } as const;

describe("NSEDatePicker is NSDatePicker", () => {
  it("edits a date in a text field by default, and a time or a date and time by its elements", () => {
    const { container, rerender } = render(<NSEDatePicker aria-label="Due" {...civil} presentsCalendarOverlay={false} defaultValue={date(2026, 6, 18)} />);
    expect(container.querySelector('[data-nse-control="date-picker"] [data-nse-part="date-entry"]')).not.toBeNull();
    rerender(<NSEDatePicker aria-label="Start" {...civil} datePickerElements={["hourMinute"]} presentsCalendarOverlay={false} defaultValue={{ hour: 9, minute: 30, second: 0 }} />);
    expect(container.querySelector('[data-nse-control="time-picker"][data-editor="field"]')).not.toBeNull();
    expect(container.querySelector('[data-nse-part="clock-affix"]')).toBeNull();
    rerender(<NSEDatePicker aria-label="Start" {...civil} datePickerElements={["hourMinute"]} datePickerStyle="clockAndCalendar" defaultValue={{ hour: 9, minute: 30, second: 0 }} />);
    expect(container.querySelector('[data-nse-control="time-picker"][data-editor="clock"]')).not.toBeNull();
  });

  it("uses segmented fields for the textField style", () => {
    const { container } = render(<NSEDatePicker aria-label="Due" {...civil} datePickerStyle="textField" presentsCalendarOverlay={false} defaultValue={date(2026, 6, 18)} />);
    expect(container.querySelector('[data-nse-part="date-entry"]')).toBeNull();
    expect((container.querySelector('input[type="hidden"]') as HTMLInputElement).value).toBe("2026-06-18");
  });

  it("maps isEnabled and isEditable onto the field", () => {
    const { container, rerender } = render(<NSEDatePicker aria-label="Due" {...civil} presentsCalendarOverlay={false} isEnabled={false} defaultValue={date(2026, 6, 18)} />);
    expect(container.querySelector('[data-nse-control="date-picker"]')?.getAttribute("data-state")).toBe("disabled");
    rerender(<NSEDatePicker aria-label="Due" {...civil} presentsCalendarOverlay={false} isEditable={false} defaultValue={date(2026, 6, 18)} />);
    expect(container.querySelector('[data-nse-control="date-picker"]')?.getAttribute("data-state")).toBe("read-only");
  });

  it("edits its value live in the graphical calendar, and the month arrows move the date by a month", () => {
    const change = vi.fn();
    render(<NSEDatePicker aria-label="Day" {...civil} datePickerStyle="clockAndCalendar" today={date(2026, 1, 31)} defaultValue={date(2026, 1, 31)} maximum={date(2026, 12, 31)} onValueChange={change} />);
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(change).toHaveBeenLastCalledWith(date(2026, 2, 28), "commit");
    fireEvent.click(screen.getAllByRole("gridcell").find((cell) => cell.textContent === "14" && cell.getAttribute("aria-disabled") !== "true")!);
    expect(change).toHaveBeenLastCalledWith(date(2026, 2, 14), "commit");
  });

  it("selects a range in the graphical calendar in range mode", () => {
    const change = vi.fn();
    render(<NSEDatePicker aria-label="Trip" {...civil} datePickerMode="range" datePickerStyle="clockAndCalendar" today={date(2026, 3, 1)} defaultValue={{ start: date(2026, 3, 10), end: date(2026, 3, 10) }} onValueChange={change} />);
    const cell = screen.getAllByRole("gridcell").find((candidate) => candidate.textContent === "14")!;
    fireEvent.click(cell);
    expect(change).toHaveBeenLastCalledWith({ start: date(2026, 3, 10), end: date(2026, 3, 14) }, "commit");
  });
});
