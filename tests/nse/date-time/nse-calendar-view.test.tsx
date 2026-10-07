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

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NSECalendarMonthView, NSECalendarView, NSEClockView, type NSEPlainDate } from "../../../src/NSE/DateTime";

afterEach(cleanup);
const date = (year: number, month: number, day: number): NSEPlainDate => ({ year, month, day });

describe("NSECalendarView", () => {
  it("keeps keyboard focus inside the calendar instance that owns the active cell", () => {
    function Pair() {
      const [first, setFirst] = React.useState({ kind: "single" as const, value: date(2026, 7, 12) });
      const [second, setSecond] = React.useState({ kind: "single" as const, value: date(2026, 7, 12) });
      return <><NSECalendarView aria-label="First calendar" locale="en-GB" timeZone="UTC" visibleMonth={{ year: 2026, month: 7 }} selection={first} isDateDisabled={() => false} onSelectionChange={(next) => { if (next.kind === "single") setFirst(next); }} /><NSECalendarView aria-label="Second calendar" locale="en-GB" timeZone="UTC" visibleMonth={{ year: 2026, month: 7 }} selection={second} isDateDisabled={() => false} onSelectionChange={(next) => { if (next.kind === "single") setSecond(next); }} /></>;
    }
    render(<Pair />);
    const secondGrid = screen.getByRole("grid", { name: "Second calendar" });
    within(secondGrid).getByRole("gridcell", { name: /12 July 2026/ }).focus();
    fireEvent.keyDown(secondGrid, { key: "ArrowRight" });
    expect(document.activeElement).toBe(within(secondGrid).getByRole("gridcell", { name: /13 July 2026/ }));
  });

  it("maps clock pointer geometry to preview, commit, and cancellation", () => {
    const change = vi.fn();
    render(<NSEClockView aria-label="Meeting time" locale="en-GB" timeZone="UTC" date={date(2026, 7, 12)} value={{ hour: 3, minute: 0, second: 0 }} onValueChange={change} />);
    const face = screen.getByRole("img", { name: "Analogue clock" });
    Object.assign(face, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn(), getBoundingClientRect: () => ({ left: 0, top: 0, width: 120, height: 120, right: 120, bottom: 120, x: 0, y: 0, toJSON: () => ({}) }) });
    fireEvent.pointerDown(face, { pointerId: 4, clientX: 120, clientY: 60 });
    fireEvent.pointerMove(face, { pointerId: 4, clientX: 60, clientY: 0 });
    expect(change).toHaveBeenCalledWith(expect.objectContaining({ hour: expect.any(Number), minute: expect.any(Number) }), "preview");
    fireEvent.pointerCancel(face, { pointerId: 4 });
    expect(change).toHaveBeenLastCalledWith({ hour: 3, minute: 0, second: 0 }, "preview");
    fireEvent.pointerDown(face, { pointerId: 5, clientX: 60, clientY: 0 });
    fireEvent.pointerUp(face, { pointerId: 5, clientX: 60, clientY: 0 });
    expect(change).toHaveBeenLastCalledWith(expect.any(Object), "commit");
  });
  it("moves DOM focus with the active date during keyboard selection", () => {
    function Harness() {
      const [selection, setSelection] = React.useState({ kind: "single" as const, value: date(2026, 7, 12) });
      return <NSECalendarView aria-label="Keyboard dates" locale="en-GB" timeZone="UTC" visibleMonth={{ year: 2026, month: 7 }} selection={selection} isDateDisabled={() => false} onSelectionChange={(next) => { if (next.kind === "single") setSelection(next); }} />;
    }
    render(<Harness />);
    const initial = screen.getByRole("gridcell", { name: /12 July 2026/ });
    initial.focus();
    fireEvent.keyDown(screen.getByRole("grid", { name: "Keyboard dates" }), { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByRole("gridcell", { name: /13 July 2026/ }));
  });
  it("renders a locale-aligned semantic grid with one tabbable day", () => {
    const { container } = render(<NSECalendarView aria-label="Event dates" locale="en-GB" timeZone="Europe/London" visibleMonth={{ year: 2026, month: 7 }} selection={{ kind: "single", value: date(2026, 7, 12) }} isDateDisabled={() => false} />);
    expect(screen.getByRole("grid", { name: "Event dates" })).toBeTruthy();
    expect(screen.getAllByRole("columnheader")[0].textContent).toMatch(/Mon/i);
    expect(container.querySelectorAll('[role="gridcell"][tabindex="0"]')).toHaveLength(1);
  });

  it("extends ranges from the active end with keyboard navigation", () => {
    const onSelectionChange = vi.fn();
    render(<NSECalendarView aria-label="Event dates" locale="en-GB" timeZone="Europe/London" visibleMonth={{ year: 2026, month: 7 }} selection={{ kind: "range", value: { start: date(2026, 7, 10), end: date(2026, 7, 12) } }} isDateDisabled={() => false} onSelectionChange={onSelectionChange} />);
    fireEvent.keyDown(screen.getByRole("grid"), { key: "ArrowRight", shiftKey: true });
    expect(onSelectionChange).toHaveBeenCalledWith({ kind: "range", value: { start: date(2026, 7, 10), end: date(2026, 7, 13) }, reason: "keyboard-range" });
  });

  it("routes buttons and Page keys through equivalent navigation requests", () => {
    const onVisibleMonthChange = vi.fn();
    render(<NSECalendarView aria-label="Dates" locale="en-US" timeZone="UTC" visibleMonth={{ year: 2026, month: 7 }} selection={{ kind: "none" }} isDateDisabled={() => false} onVisibleMonthChange={onVisibleMonthChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "PageDown" });
    expect(onVisibleMonthChange).toHaveBeenNthCalledWith(1, { year: 2026, month: 8 }, { unit: "month", direction: 1, reason: "button" });
    expect(onVisibleMonthChange).toHaveBeenNthCalledWith(2, { year: 2026, month: 8 }, { unit: "month", direction: 1, reason: "keyboard" });
  });

  it("describes event indicators non-visually and disables unavailable dates", () => {
    render(<NSECalendarView aria-label="Dates" locale="en-GB" timeZone="UTC" visibleMonth={{ year: 2026, month: 7 }} selection={{ kind: "none" }} isDateDisabled={(value) => value.day === 12} eventIndicatorsForDate={(value) => value.day === 13 ? [{ id: "meeting", label: "Meetings", count: 2 }] : []} />);
    expect((screen.getByRole("gridcell", { name: /12/ }) as HTMLButtonElement).disabled).toBe(true);
    const indicated = screen.getByRole("gridcell", { name: /13/ });
    const description = document.getElementById(indicated.getAttribute("aria-describedby") ?? "");
    expect(description?.textContent).toContain("Meetings: 2");
  });

  it("normalizes a range selection made before the current start", () => {
    const onSelectionChange = vi.fn();
    render(<NSECalendarView aria-label="Dates" locale="en-GB" timeZone="UTC" visibleMonth={{ year: 2026, month: 7 }} selection={{ kind: "range", value: { start: date(2026, 7, 10), end: date(2026, 7, 12) } }} isDateDisabled={() => false} onSelectionChange={onSelectionChange} />);
    fireEvent.click(screen.getByRole("gridcell", { name: /^8 July 2026$/ }));
    expect(onSelectionChange).toHaveBeenCalledWith({ kind: "range", value: { start: date(2026, 7, 8), end: date(2026, 7, 10) }, reason: "pointer" });
  });

  it("supports week-boundary keys and reverses logical arrows in RTL", () => {
    const change = vi.fn();
    const { rerender } = render(<NSECalendarView aria-label="Dates" locale="en-GB" timeZone="UTC" visibleMonth={{ year: 2026, month: 7 }} selection={{ kind: "single", value: date(2026, 7, 15) }} isDateDisabled={() => false} onSelectionChange={change} />);
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Home" });
    expect(change).toHaveBeenLastCalledWith({ kind: "single", value: date(2026, 7, 13), reason: "keyboard" });
    rerender(<NSECalendarView aria-label="Dates" locale="ar-SA" timeZone="UTC" visibleMonth={{ year: 2026, month: 7 }} selection={{ kind: "single", value: date(2026, 7, 15) }} isDateDisabled={() => false} onSelectionChange={change} />);
    fireEvent.keyDown(screen.getByRole("grid"), { key: "ArrowRight" });
    expect(change).toHaveBeenLastCalledWith({ kind: "single", value: date(2026, 7, 14), reason: "keyboard" });
  });

  it("navigates months with touch swipe and reverses the logical direction in RTL",()=>{const navigate=vi.fn();const{rerender}=render(<NSECalendarView aria-label="Dates" locale="en-GB" timeZone="UTC" visibleMonth={{year:2026,month:7}} selection={{kind:"none"}} isDateDisabled={()=>false} onVisibleMonthChange={navigate}/>);const calendar=screen.getByRole("grid").closest('[data-nse-control="calendar"]')!;fireEvent.pointerDown(calendar,{pointerId:1,pointerType:"touch",clientX:120});fireEvent.pointerUp(calendar,{pointerId:1,pointerType:"touch",clientX:40});expect(navigate).toHaveBeenLastCalledWith({year:2026,month:8},{unit:"month",direction:1,reason:"swipe"});rerender(<NSECalendarView aria-label="Dates" locale="ar-SA" timeZone="UTC" visibleMonth={{year:2026,month:7}} selection={{kind:"none"}} isDateDisabled={()=>false} onVisibleMonthChange={navigate}/>);const rtlCalendar=screen.getByRole("grid").closest('[data-nse-control="calendar"]')!;fireEvent.pointerDown(rtlCalendar,{pointerId:2,pointerType:"touch",clientX:120});fireEvent.pointerUp(rtlCalendar,{pointerId:2,pointerType:"touch",clientX:40});expect(navigate).toHaveBeenLastCalledWith({year:2026,month:6},{unit:"month",direction:-1,reason:"swipe"});});

  it("uses instance-scoped event description ids", () => {
    const props = { locale: "en-GB", timeZone: "UTC", visibleMonth: { year: 2026, month: 7 }, selection: { kind: "none" } as const, isDateDisabled: () => false, eventIndicatorsForDate: (value: NSEPlainDate) => value.day === 13 ? [{ id: "meeting", label: "Meetings", count: 1 }] : [] };
    render(<><NSECalendarView aria-label="First" {...props} /><NSECalendarView aria-label="Second" {...props} /></>);
    const ids = screen.getAllByRole("gridcell", { name: /13/ }).map((element) => element.getAttribute("aria-describedby"));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("exports a distinct month view rather than an alias", () => {
    expect(NSECalendarMonthView).not.toBe(NSECalendarView);
  });
});

describe("NSEClockView", () => {
  it("offers synchronized numeric time alternatives and commits keyboard increments", () => {
    const change = vi.fn();
    render(<NSEClockView aria-label="Time" locale="en-GB" timeZone="Europe/London" date={date(2026, 7, 12)} value={{ hour: 13, minute: 5, second: 0 }} onValueChange={change} />);
    expect((screen.getByRole("spinbutton", { name: "Hour" }) as HTMLInputElement).value).toBe("13");
    fireEvent.keyDown(screen.getByRole("spinbutton", { name: "Minute" }), { key: "ArrowUp" });
    expect(change).toHaveBeenCalledWith({ hour: 13, minute: 6, second: 0 }, "commit");
  });

  it("reports DST gaps without removing the numeric alternative", () => {
    render(<NSEClockView aria-label="Time" locale="en-GB" timeZone="Europe/London" date={date(2026, 3, 29)} value={{ hour: 1, minute: 30, second: 0 }} disambiguation="reject" onValueChange={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).toMatch(/does not exist/i);
    expect(screen.getByRole("spinbutton", { name: "Hour" })).toBeTruthy();
  });

  it("offers month and year navigation plus Today, and marks today's date", () => {
    const month = vi.fn();
    const selection = vi.fn();
    render(<NSECalendarView aria-label="Plan" locale="en-GB" timeZone="UTC" today={date(2026, 9, 28)} visibleMonth={{ year: 2026, month: 3 }} selection={{ kind: "single", value: date(2026, 3, 28) }} isDateDisabled={() => false} onVisibleMonthChange={month} onSelectionChange={selection} />);
    expect(screen.queryByRole("button", { name: "Previous decade" })).toBeNull();
    for (const name of ["Previous year", "Previous month", "Today", "Next month", "Next year"]) expect(screen.getByRole("button", { name })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(month).toHaveBeenCalledWith({ year: 2026, month: 9 }, expect.objectContaining({ unit: "month", direction: 1 }));
    expect(selection).toHaveBeenCalledWith({ kind: "single", value: date(2026, 9, 28), reason: "today" });
  });

  it("brings a range into today's month without replacing it", () => {
    const selection = vi.fn();
    render(<NSECalendarView aria-label="Range" locale="en-GB" timeZone="UTC" today={date(2026, 3, 18)} visibleMonth={{ year: 2026, month: 3 }} selection={{ kind: "range", value: { start: date(2026, 3, 16), end: date(2026, 3, 20) } }} isDateDisabled={() => false} onSelectionChange={selection} />);
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(selection).not.toHaveBeenCalled();
    expect(screen.getByRole("gridcell", { name: /^18 March 2026$/ }).getAttribute("aria-current")).toBe("date");
    expect(screen.getByRole("gridcell", { name: /^16 March 2026$/ }).getAttribute("data-range-position")).toBe("start");
    expect(screen.getByRole("gridcell", { name: /^18 March 2026$/ }).getAttribute("data-range-position")).toBe("middle");
    expect(screen.getByRole("gridcell", { name: /^20 March 2026$/ }).getAttribute("data-range-position")).toBe("end");
  });
});
