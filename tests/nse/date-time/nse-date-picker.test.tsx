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
import React, { useMemo } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEDatePicker, NSEDateRangePicker, NSEDateTimePicker, NSETimePicker } from "../../../src/NSE/DateTime/Pickers";
import { NSEClockView } from "../../../src/NSE/DateTime/Calendar";
import { NSEOverlayProvider } from "../../../src/NSE/Overlays";
import { createStaticPresentationPort } from "../../fixtures/presentationTraits";
import { createSynCloudOS } from "../../../src/SynCloudOS/Runtime/createSynCloudOS";
import { SynCloudOSProvider, useRuntimeNSEOverlayPort } from "../../../src/SynCloudOSReact";
import { createTestRuntimeEnvironment } from "../../runtime/helpers";

afterEach(cleanup);
const date = (year: number, month: number, day: number) => ({ year, month, day });
const pickerWorkArea = Object.freeze({ width: 1280, height: 720, safeArea: Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 }) });
const pickerPresentation = createStaticPresentationPort({ width: 1280, height: 720 });
function PickerOverlay({ children }: { readonly children: React.ReactNode }) {
  const runtimePort = useMemo(() => ({ runtimeId: "runtime:date-picker", signal: new AbortController().signal, environment: { browser: { getDocument: () => document, getWindow: () => window }, workArea: { getSnapshot: () => pickerWorkArea, subscribe: () => () => undefined }, visualViewport: { getSnapshot: () => null, subscribe: () => () => undefined }, presentation: pickerPresentation, setTimeout: (callback: () => void) => { callback(); return 0; }, clearTimeout: () => undefined }, restoreFocus: (_responderId: string, anchor: HTMLElement | null) => anchor?.focus(), reportPlacementFailure: () => undefined, wrapFocusScope: (_options: unknown, node: React.ReactNode) => node }), []);
  return <NSEOverlayProvider runtimePort={runtimePort} defaultParentResponderId="workspace">{children}</NSEOverlayProvider>;
}
function RuntimePickerOverlay({ children }: { readonly children: React.ReactNode }) {
  const runtimePort = useRuntimeNSEOverlayPort("workspace");
  return <NSEOverlayProvider runtimePort={runtimePort} defaultParentResponderId="workspace">{children}</NSEOverlayProvider>;
}

describe("civil date/time pickers", () => {
  it("keeps a reversed focus and click preview stable instead of collapsing the range", () => {
    const baseline = { start: date(2026, 3, 28), end: date(2026, 3, 30) };
    const expected = { start: date(2026, 3, 25), end: date(2026, 3, 28) };
    const changes: Array<{ value: typeof baseline | null; phase: string }> = [];
    function Harness() {
      const [range, setRange] = React.useState<typeof baseline | null>(baseline);
      return <PickerOverlay><NSEDateRangePicker aria-label="Travel" locale="en-GB" timeZone="UTC" value={range} onValueChange={(next, phase) => { changes.push({ value: next, phase }); setRange(next); }} /></PickerOverlay>;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Choose travel dates" }));
    const earlier = within(screen.getByRole("dialog", { name: "Travel calendar" })).getByRole("gridcell", { name: /^25 March 2026$/ });
    fireEvent.focus(earlier);
    fireEvent.click(earlier);
    expect(changes).toEqual([
      { value: expected, phase: "preview" },
      { value: expected, phase: "preview" },
    ]);
    expect((screen.getByRole("textbox", { name: "Travel start" }) as HTMLInputElement).value).toMatch(/25.*03.*2026/);
    expect((screen.getByRole("textbox", { name: "Travel end" }) as HTMLInputElement).value).toMatch(/28.*03.*2026/);
  });

  it("starts a wholly new later range with an explicit first and second selection phase", () => {
    const baseline = { start: date(2026, 3, 10), end: date(2026, 3, 12) };
    const changes: Array<{ value: typeof baseline | null; phase: string }> = [];
    function Harness() {
      const [range, setRange] = React.useState<typeof baseline | null>(baseline);
      return <PickerOverlay><NSEDateRangePicker aria-label="Travel" locale="en-GB" timeZone="UTC" value={range} onValueChange={(next, phase) => { changes.push({ value: next, phase }); setRange(next); }} /></PickerOverlay>;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Choose travel dates" }));
    const dialog = screen.getByRole("dialog", { name: "Travel calendar" });
    fireEvent.click(within(dialog).getByRole("gridcell", { name: /^20 March 2026$/ }));
    expect(changes.at(-1)).toEqual({ value: { start: date(2026, 3, 20), end: date(2026, 3, 20) }, phase: "preview" });
    fireEvent.click(within(dialog).getByRole("gridcell", { name: /^22 March 2026$/ }));
    expect(changes.at(-1)).toEqual({ value: { start: date(2026, 3, 20), end: date(2026, 3, 22) }, phase: "preview" });
  });

  it("parses the current text draft when Apply is clicked and refuses invalid drafts", () => {
    const change = vi.fn();
    render(<NSEDateTimePicker aria-label="Appointment" locale="en-GB" timeZone="UTC" mode="text" defaultValue={{ date: date(2026, 7, 12), time: { hour: 9, minute: 15, second: 0 }, timeZone: "UTC", disambiguation: "earlier" }} onValueChange={change} />);
    const input = screen.getByRole("textbox", { name: "Appointment date and time" });
    fireEvent.change(input, { target: { value: "18/07/2026 14:45" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply appointment" }));
    expect(change).toHaveBeenLastCalledWith({ date: date(2026, 7, 18), time: { hour: 14, minute: 45, second: 0 }, timeZone: "UTC", disambiguation: "earlier" }, "commit");
    change.mockClear();
    fireEvent.change(input, { target: { value: "not a date" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply appointment" }));
    expect(screen.getByRole("alert").textContent).toMatch(/valid date and time/i);
    expect(change).not.toHaveBeenCalled();
  });

  it("offers an explicit nullable clear path and restores the empty form value on reset", () => {
    const { container } = render(<form><NSEDateTimePicker aria-label="Appointment" name="appointment" locale="en-GB" timeZone="UTC" mode="text" defaultValue={null} /><button type="reset">Reset appointment</button></form>);
    fireEvent.click(screen.getByRole("button", { name: "Clear appointment" }));
    expect(container.querySelector<HTMLInputElement>('input[name="appointment"]')?.value).toBe("");
    fireEvent.change(screen.getByRole("textbox", { name: "Appointment date and time" }), { target: { value: "18/07/2026 14:45" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply appointment" }));
    expect(container.querySelector<HTMLInputElement>('input[name="appointment"]')?.value).toBe("2026-07-18T14:45:00");
    fireEvent.click(screen.getByRole("button", { name: "Reset appointment" }));
    expect(container.querySelector<HTMLInputElement>('input[name="appointment"]')?.value).toBe("");
  });

  it("paints value-derived clock hands with nonzero semantic geometry", () => {
    render(<NSEClockView aria-label="Clock" locale="en-GB" timeZone="UTC" date={date(2026, 7, 12)} value={{ hour: 1, minute: 30, second: 15 }} showSeconds onValueChange={vi.fn()} />);
    const face = screen.getByRole("img", { name: "Analogue clock" });
    const hour = face.querySelector<HTMLElement>('[data-nse-part="hour-hand"]')!;
    const minute = face.querySelector<HTMLElement>('[data-nse-part="minute-hand"]')!;
    const second = face.querySelector<HTMLElement>('[data-nse-part="second-hand"]')!;
    expect(hour.style.transform).toBe("rotate(45.125deg)");
    expect(minute.style.transform).toBe("rotate(181.5deg)");
    expect(second.style.transform).toBe("rotate(90deg)");
    expect(parseFloat(hour.style.blockSize)).toBeGreaterThan(0);
    expect(parseFloat(minute.style.inlineSize)).toBeGreaterThan(0);
  });
  it("restores the immutable opening range after a controlled calendar preview is cancelled", () => {
    const baseline = { start: date(2026, 3, 28), end: date(2026, 3, 30) };
    const changes: Array<{ value: typeof baseline | null; phase: string }> = [];
    function Harness() {
      const [range, setRange] = React.useState<typeof baseline | null>(baseline);
      return <PickerOverlay><NSEDateRangePicker aria-label="Travel" locale="en-GB" timeZone="UTC" value={range} onValueChange={(next, phase) => { changes.push({ value: next, phase }); setRange(next); }} /></PickerOverlay>;
    }
    render(<React.StrictMode><Harness /></React.StrictMode>);
    fireEvent.click(screen.getByRole("button", { name: "Choose travel dates" }));
    fireEvent.click(screen.getByRole("gridcell", { name: /^25 March 2026$/ }));
    expect((screen.getByRole("textbox", { name: "Travel start" }) as HTMLInputElement).value).toMatch(/25.*03.*2026/);
    fireEvent.click(within(screen.getByRole("dialog", { name: "Travel calendar" })).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Travel calendar" })).toBeNull();
    expect(changes.at(-1)).toEqual({ value: baseline, phase: "preview" });
    fireEvent.click(screen.getByRole("button", { name: "Choose travel dates" }));
    expect((screen.getByRole("textbox", { name: "Travel start" }) as HTMLInputElement).value).toMatch(/28.*03.*2026/);
  });

  it("replaces an open controlled range transaction with external authority and uses it on reopen", () => {
    const first = { start: date(2026, 3, 28), end: date(2026, 3, 30) };
    const second = { start: date(2026, 4, 8), end: date(2026, 4, 10) };
    const view = render(<PickerOverlay><NSEDateRangePicker aria-label="Travel" locale="en-GB" timeZone="UTC" value={first} /></PickerOverlay>);
    fireEvent.click(screen.getByRole("button", { name: "Choose travel dates" }));
    view.rerender(<PickerOverlay><NSEDateRangePicker aria-label="Travel" locale="en-GB" timeZone="UTC" value={second} /></PickerOverlay>);
    expect(within(screen.getByRole("dialog", { name: "Travel calendar" })).getByText("April 2026")).not.toBeNull();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Travel calendar" })).getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose travel dates" }));
    expect(within(screen.getByRole("dialog", { name: "Travel calendar" })).getByRole("gridcell", { name: /^8 April 2026$/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("renders text mode as a text editor without calendar or clock surfaces", () => {
    render(<NSEDateTimePicker aria-label="Appointment" locale="en-GB" timeZone="UTC" mode="text" value={{ date: date(2026, 7, 12), time: { hour: 13, minute: 30, second: 0 }, timeZone: "UTC", disambiguation: "earlier" }} />);
    expect(screen.getByRole("textbox", { name: "Appointment date and time" })).not.toBeNull();
    expect(screen.queryByRole("grid", { name: "Appointment calendar" })).toBeNull();
    expect(screen.queryByRole("img", { name: "Analogue clock" })).toBeNull();
  });

  it("renders calendar mode without a clock and clock mode without a calendar", () => {
    const initial = { date: date(2026, 7, 12), time: { hour: 13, minute: 30, second: 0 }, timeZone: "UTC", disambiguation: "earlier" as const };
    const view = render(<NSEDateTimePicker aria-label="Appointment" locale="en-GB" timeZone="UTC" mode={"calendar" as never} value={initial} />);
    expect(screen.getByRole("grid", { name: "Appointment calendar" })).not.toBeNull();
    expect(screen.queryByRole("img", { name: "Analogue clock" })).toBeNull();
    view.rerender(<NSEDateTimePicker aria-label="Appointment" locale="en-GB" timeZone="UTC" mode={"clock" as never} value={initial} />);
    expect(screen.getByRole("img", { name: "Analogue clock" })).not.toBeNull();
    expect(screen.queryByRole("grid", { name: "Appointment calendar" })).toBeNull();
  });

  it("marks combined mode distinctly and enforces constraints before preview", () => {
    const change = vi.fn();
    const minimum = { epochMilliseconds: Date.UTC(2026, 6, 10), timeZone: "UTC", calendar: "gregory" as const };
    render(<NSEDateTimePicker aria-label="Appointment" locale="en-GB" timeZone="UTC" mode="combined" value={{ date: date(2026, 7, 12), time: { hour: 13, minute: 30, second: 0 }, timeZone: "UTC", disambiguation: "earlier" }} minimum={minimum} onValueChange={change} />);
    expect(screen.getByTestId("date-time-editor").getAttribute("data-editor-mode")).toBe("combined");
    fireEvent.click(screen.getByRole("gridcell", { name: /^8 July 2026$/ }));
    expect(change).not.toHaveBeenCalledWith(expect.objectContaining({ date: date(2026, 7, 8) }), "preview");
  });

  it("constructs a null range through the hosted calendar and serializes it", () => {
    const change = vi.fn();
    function Harness() {
      const [range, setRange] = React.useState<ReturnType<typeof date> extends never ? never : { start: ReturnType<typeof date>; end: ReturnType<typeof date> } | null>(null);
      return <PickerOverlay><form><NSEDateRangePicker aria-label="Travel" name="travel" locale="en-GB" timeZone="UTC" value={range} minimum={date(2026, 3, 1)} onValueChange={(next, phase) => { change(next, phase); setRange(next); }} /></form></PickerOverlay>;
    }
    const { container } = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Choose travel dates" }));
    const grid = screen.getByRole("grid", { name: "Travel calendar" });
    fireEvent.click(within(grid).getByRole("gridcell", { name: /^10 March 2026$/ }));
    fireEvent.click(within(grid).getByRole("gridcell", { name: /^12 March 2026$/ }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Travel calendar" })).getByRole("button", { name: "Apply" }));
    expect(change).toHaveBeenLastCalledWith({ start: date(2026, 3, 10), end: date(2026, 3, 12) }, "commit");
    expect(container.querySelector<HTMLInputElement>('input[name="travel"]')?.value).toBe("2026-03-10/2026-03-12");
  });

  it("resets an uncontrolled combined transaction to its form opening value", () => {
    const initial = { date: date(2026, 7, 12), time: { hour: 9, minute: 15, second: 0 }, timeZone: "UTC", disambiguation: "earlier" as const };
    const { container } = render(<form><NSEDateTimePicker aria-label="Appointment" name="appointment" locale="en-GB" timeZone="UTC" defaultValue={initial} /><button type="reset">Reset appointment</button></form>);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Hour" }), { target: { value: "17" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply appointment" }));
    expect(container.querySelector<HTMLInputElement>('input[name="appointment"]')?.value).toContain("T17:15:00");
    fireEvent.click(screen.getByRole("button", { name: "Reset appointment" }));
    expect(container.querySelector<HTMLInputElement>('input[name="appointment"]')?.value).toContain("T09:15:00");
  });
  it("opens an empty combined date-time transaction and can create its first value", () => {
    const change = vi.fn();
    render(<PickerOverlay><NSEDateTimePicker aria-label="Appointment" locale="en-GB" timeZone="Europe/London" value={null} mode="automatic" onValueChange={change} /></PickerOverlay>);
    fireEvent.click(screen.getByRole("button", { name: "Appointment" }));
    expect(screen.getByRole("grid", { name: "Appointment calendar" })).not.toBeNull();
    expect(screen.getByRole("spinbutton", { name: "Hour" })).not.toBeNull();
  });

  it("renders date, time, zone, and disambiguation in calendar-clock mode", () => {
    render(<PickerOverlay><NSEDateTimePicker aria-label="Appointment" locale="en-GB" timeZone="Europe/London" mode="calendar-clock" value={{ date: date(2026, 7, 12), time: { hour: 13, minute: 30, second: 0 }, timeZone: "Europe/London", disambiguation: "later" }} /></PickerOverlay>);
    expect(screen.getByRole("grid", { name: "Appointment calendar" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Appointment time zone Europe/London" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Appointment disambiguation Later" })).not.toBeNull();
  });

  it("hosts range selection in a calendar transaction instead of only text fields", () => {
    render(<PickerOverlay><NSEDateRangePicker aria-label="Stay" locale="en-GB" timeZone="UTC" value={{ start: date(2026, 7, 10), end: date(2026, 7, 12) }} /></PickerOverlay>);
    fireEvent.click(screen.getByRole("button", { name: "Choose stay dates" }));
    expect(screen.getByRole("grid", { name: "Stay calendar" })).not.toBeNull();
    expect(screen.getByRole("gridcell", { name: /10 July 2026/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("opens a range calendar from the keyboard trigger", () => {
    render(<PickerOverlay><NSEDateRangePicker aria-label="Stay" locale="en-GB" timeZone="UTC" value={{ start: date(2026, 7, 10), end: date(2026, 7, 12) }} /></PickerOverlay>);
    fireEvent.keyDown(screen.getByRole("button", { name: "Choose stay dates" }), { key: "Enter" });
    expect(screen.getByRole("dialog", { name: "Stay calendar" })).not.toBeNull();
  });

  it("resynchronizes the open automatic calendar when a controlled value is replaced", () => {
    const view = render(<PickerOverlay><NSEDatePicker aria-label="Departure" locale="en-GB" timeZone="UTC" value={date(2026, 7, 12)} /></PickerOverlay>);
    fireEvent.click(screen.getByRole("button", { name: "Choose departure" }));
    expect(screen.getByText("July 2026")).not.toBeNull();
    view.rerender(<PickerOverlay><NSEDatePicker aria-label="Departure" locale="en-GB" timeZone="UTC" value={date(2026, 8, 19)} /></PickerOverlay>);
    expect(screen.getByText("August 2026")).not.toBeNull();
    expect(screen.getByRole("gridcell", { name: /19 August 2026/ }).getAttribute("tabindex")).toBe("0");
  });
  it("opens an automatic calendar under a live runtime responder", () => {
    const runtime = createSynCloudOS({ id: "runtime:live-date-picker", environment: createTestRuntimeEnvironment() });
    render(<SynCloudOSProvider runtime={runtime}><RuntimePickerOverlay><NSEDatePicker aria-label="Departure" locale="en-GB" timeZone="UTC" value={date(2026, 7, 12)} /></RuntimePickerOverlay></SynCloudOSProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Choose departure" }));
    expect(screen.getByRole("dialog", { name: "Departure calendar" })).not.toBeNull();
  });

  it("parses localized text and serializes unambiguous form values", () => {
    const change = vi.fn();
    const { container } = render(<form><NSEDatePicker aria-label="Date" name="date" locale="en-GB" timeZone="Europe/London" defaultValue={date(2026, 7, 12)} mode="text" onValueChange={change} /></form>);
    const input = screen.getByRole("textbox", { name: "Date" });
    fireEvent.change(input, { target: { value: "13/07/2026" } }); fireEvent.keyDown(input, { key: "Enter" });
    expect(change).toHaveBeenCalledWith(date(2026, 7, 13), "commit");
    expect(container.querySelector<HTMLInputElement>('input[type="hidden"]')?.value).toBe("2026-07-13");
  });

  it("rolls invalid text back with Escape and respects min/max", () => {
    const change = vi.fn();
    render(<NSEDatePicker aria-label="Date" locale="en-GB" timeZone="UTC" value={date(2026, 7, 12)} minimum={date(2026, 7, 10)} maximum={date(2026, 7, 20)} mode="text" onValueChange={change} />);
    const input = screen.getByRole("textbox", { name: "Date" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "31/02/2026" } }); fireEvent.keyDown(input, { key: "Enter" });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toMatch(/12.*07.*2026/);
    expect(change).not.toHaveBeenCalled();
  });

  it("commits combined date-time atomically and rejects DST gaps", () => {
    const change = vi.fn();
    render(<NSEDateTimePicker aria-label="Appointment" locale="en-GB" timeZone="Europe/London" defaultValue={{ date: date(2026, 3, 29), time: { hour: 0, minute: 30, second: 0 }, timeZone: "Europe/London", disambiguation: "reject" }} onValueChange={change} />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Hour" }), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply appointment" }));
    expect(screen.getByRole("alert").textContent).toMatch(/does not exist/i);
    expect(change).not.toHaveBeenCalledWith(expect.anything(), "commit");
  });

  it("cancels range drafts back to the opening value", () => {
    const change = vi.fn();
    render(<NSEDateRangePicker aria-label="Stay" locale="en-GB" timeZone="UTC" defaultValue={{ start: date(2026, 7, 10), end: date(2026, 7, 12) }} onValueChange={change} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Stay end" }), { target: { value: "15/07/2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel stay" }));
    expect((screen.getByRole("textbox", { name: "Stay end" }) as HTMLInputElement).value).toMatch(/12.*07.*2026/);
    expect(change).not.toHaveBeenCalled();
  });

  it("provides a time-only form control", () => {
    const change = vi.fn();
    render(<NSETimePicker aria-label="Time" locale="en-GB" timeZone="UTC" defaultValue={{ hour: 13, minute: 5, second: 0 }} onValueChange={change} />);
    fireEvent.keyDown(screen.getByRole("spinbutton", { name: "Minute" }), { key: "ArrowUp" });
    expect(change).toHaveBeenCalledWith({ hour: 13, minute: 6, second: 0 }, "commit");
  });

  it("edits the default time field by typing, arrows and day period, one stepper tab stop", () => {
    const change = vi.fn();
    render(<NSETimePicker aria-label="Time" locale="en-US" timeZone="UTC" defaultValue={{ hour: 9, minute: 5, second: 0 }} onValueChange={change} />);
    const hour = screen.getByRole("spinbutton", { name: "Hour", exact: true });
    const minute = screen.getByRole("spinbutton", { name: "Minute", exact: true });
    fireEvent.keyDown(hour, { key: "1" });
    fireEvent.keyDown(hour, { key: "1" });
    expect(change).toHaveBeenLastCalledWith({ hour: 11, minute: 5, second: 0 }, "commit");
    fireEvent.keyDown(minute, { key: "ArrowDown" });
    expect(change).toHaveBeenLastCalledWith({ hour: 11, minute: 4, second: 0 }, "commit");
    fireEvent.keyDown(screen.getByRole("spinbutton", { name: "AM/PM" }), { key: "p" });
    expect(change).toHaveBeenLastCalledWith({ hour: 23, minute: 4, second: 0 }, "commit");
    for (const button of screen.getAllByRole("button", { name: /^(Increment|Decrement) Step time/ })) expect(button.getAttribute("tabindex")).toBe("-1");
  });

  it("preserves an empty time as empty form truth", () => {
    const { container } = render(<form><NSETimePicker aria-label="Time" name="time" locale="en-GB" timeZone="UTC" value={null} onValueChange={vi.fn()} /></form>);
    expect(container.querySelector<HTMLInputElement>('input[name="time"]')?.value).toBe("");
    expect(screen.queryByRole("spinbutton", { name: "Hour" })).toBeNull();
  });

  it("resynchronizes controlled date values", () => {
    const change = vi.fn();
    const { rerender } = render(<NSEDatePicker aria-label="Date" locale="en-GB" timeZone="UTC" value={date(2026, 7, 12)} mode="text" onValueChange={change} />);
    rerender(<NSEDatePicker aria-label="Date" locale="en-GB" timeZone="UTC" value={date(2026, 7, 18)} mode="text" onValueChange={change} />);
    expect((screen.getByRole("textbox", { name: "Date" }) as HTMLInputElement).value).toMatch(/18.*07.*2026/);
  });

  it("projects deterministic authority evidence without changing date, time, or text-editor semantics", () => {
    const timeChange = vi.fn();
    render(
      <>
        <NSEDatePicker aria-label="Date" locale="en-GB" timeZone="UTC" mode="text" defaultValue={date(2026, 7, 12)} />
        <NSEDateTimePicker aria-label="Appointment" locale="en-GB" timeZone="UTC" mode="text" defaultValue={{ date: date(2026, 7, 12), time: { hour: 9, minute: 15, second: 0 }, timeZone: "UTC", disambiguation: "earlier" }} />
        <NSETimePicker aria-label="Time" locale="en-GB" timeZone="UTC" defaultValue={{ hour: 13, minute: 5, second: 0 }} onValueChange={timeChange} />
      </>,
    );

    const datePicker = screen.getByRole("textbox", { name: "Date" }).closest('[data-nse-control="date-picker"]')!;
    const dateTimePicker = screen.getByRole("textbox", { name: "Appointment date and time" }).closest('[data-nse-control="date-time-picker"]')!;
    const timePicker = screen.getByRole("spinbutton", { name: "Minute" }).closest('[data-nse-control="time-picker"]')!;
    expect(datePicker.getAttribute("data-nse-theme-slot")).toBe("date-picker.select.normal");
    expect(dateTimePicker.getAttribute("data-nse-theme-slot")).toBe("date-time-picker.select.normal");
    expect(timePicker.getAttribute("data-nse-theme-slot")).toBe("time-picker.select.normal");
    for (const control of [datePicker, dateTimePicker, timePicker]) {
      expect(control.getAttribute("data-nse-theme-authority")).toBeNull();
      expect(control.getAttribute("data-nse-theme-recipe-id")).toBeNull();
    }
    fireEvent.keyDown(screen.getByRole("spinbutton", { name: "Minute" }), { key: "ArrowUp" });
    expect(timeChange).toHaveBeenCalledWith({ hour: 13, minute: 6, second: 0 }, "commit");
  });

  it("never commits a reversed or invalid range", () => {
    const change = vi.fn();
    render(<NSEDateRangePicker aria-label="Stay" locale="en-GB" timeZone="UTC" defaultValue={{ start: date(2026, 7, 10), end: date(2026, 7, 12) }} onValueChange={change} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Stay end" }), { target: { value: "08/07/2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply stay" }));
    expect(screen.getByRole("alert").textContent).toMatch(/range|before/i);
    expect(change).not.toHaveBeenCalledWith(expect.anything(), "commit");
  });

  it("previews hover and focus ranges and applies the declared reverse restart policy", () => {
    const change = vi.fn();
    render(<PickerOverlay><NSEDateRangePicker aria-label="Stay" locale="en-GB" timeZone="UTC" reversePolicy="restart" value={{ start: date(2026, 7, 10), end: date(2026, 7, 12) }} onValueChange={change} /></PickerOverlay>);
    fireEvent.click(screen.getByRole("button", { name: "Choose stay dates" }));
    const earlier = screen.getByRole("gridcell", { name: "8 July 2026" });
    fireEvent.pointerEnter(earlier);
    expect(change).toHaveBeenLastCalledWith({ start: date(2026, 7, 8), end: date(2026, 7, 8) }, "preview");
    fireEvent.focus(screen.getByRole("gridcell", { name: "14 July 2026" }));
    expect(change).toHaveBeenLastCalledWith({ start: date(2026, 7, 10), end: date(2026, 7, 14) }, "preview");
    fireEvent.click(earlier);
    expect(change).toHaveBeenLastCalledWith({ start: date(2026, 7, 8), end: date(2026, 7, 8) }, "preview");
  });

  it("blocks every range mutation route while read-only", () => {
    const change = vi.fn();
    render(<NSEDateRangePicker aria-label="Stay" locale="en-GB" timeZone="UTC" defaultValue={{ start: date(2026, 7, 10), end: date(2026, 7, 12) }} readOnly onValueChange={change} />);
    expect((screen.getByRole("button", { name: "Apply stay" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Stay end" }), { target: { value: "15/07/2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply stay" }));
    expect(change).not.toHaveBeenCalled();
  });

  it("commits a clicked day and closes, while arrows only move and Escape cancels", () => {
    const change = vi.fn();
    render(<PickerOverlay><NSEDatePicker aria-label="Departure" locale="en-GB" timeZone="Europe/London" value={date(2026, 7, 12)} onValueChange={change} /></PickerOverlay>);
    const trigger = screen.getByRole("button", { name: "Choose departure" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Departure calendar" }).closest('[data-nse-overlay-kind="popover"]')).not.toBeNull();
    expect(screen.queryByRole("button", { name: /apply/i })).toBeNull();
    fireEvent.keyDown(screen.getByRole("gridcell", { name: /^12 July 2026$/ }), { key: "ArrowRight" });
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Departure calendar" })).not.toBeNull();
    fireEvent.keyDown(screen.getByRole("gridcell", { name: /^13 July 2026$/ }), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Departure calendar" })).toBeNull();
    expect(change).not.toHaveBeenCalledWith(date(2026, 7, 13), "commit");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("gridcell", { name: /^13 July 2026$/ }));
    expect(change).toHaveBeenCalledWith(date(2026, 7, 13), "commit");
    expect(screen.queryByRole("dialog", { name: "Departure calendar" })).toBeNull();
  });

  it("publishes an inline calendar selection immediately", () => {
    const change = vi.fn();
    render(<NSEDatePicker aria-label="Departure" locale="en-GB" timeZone="UTC" mode="calendar" value={date(2026, 7, 12)} onValueChange={change} />);
    fireEvent.click(screen.getByRole("gridcell", { name: /^14 July 2026$/ }));
    expect(change).toHaveBeenCalledWith(date(2026, 7, 14), "commit");
  });

  it("blocks automatic calendar opening while read-only", () => {
    render(<PickerOverlay><NSEDatePicker aria-label="Departure" locale="en-GB" timeZone="UTC" value={date(2026, 7, 12)} readOnly /></PickerOverlay>);
    expect((screen.getByRole("button", { name: "Choose departure" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("resynchronizes a controlled combined date-time draft", () => {
    const first = { date: date(2026, 7, 12), time: { hour: 9, minute: 15, second: 0 }, timeZone: "UTC", disambiguation: "earlier" as const };
    const second = { date: date(2026, 7, 13), time: { hour: 17, minute: 45, second: 0 }, timeZone: "UTC", disambiguation: "earlier" as const };
    const { rerender } = render(<NSEDateTimePicker aria-label="Appointment" locale="en-GB" timeZone="UTC" value={first} />);
    rerender(<NSEDateTimePicker aria-label="Appointment" locale="en-GB" timeZone="UTC" value={second} />);
    expect((screen.getByRole("spinbutton", { name: "Hour" }) as HTMLInputElement).value).toBe("17");
    expect((screen.getByRole("spinbutton", { name: "Minute" }) as HTMLInputElement).value).toBe("45");
  });

  it("blocks every combined date-time mutation route while read-only", () => {
    const change = vi.fn();
    render(<NSEDateTimePicker aria-label="Appointment" locale="en-GB" timeZone="UTC" value={{ date: date(2026, 7, 12), time: { hour: 9, minute: 15, second: 0 }, timeZone: "UTC", disambiguation: "earlier" }} readOnly onValueChange={change} />);
    expect((screen.getByRole("button", { name: "Apply appointment" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Apply appointment" }));
    expect(change).not.toHaveBeenCalled();
  });

  it("pages the popover calendar without moving the chosen date", () => {
    const change = vi.fn();
    render(<PickerOverlay><NSEDatePicker aria-label="Leap" locale="en-GB" timeZone="UTC" value={date(2028, 2, 29)} onValueChange={change} /></PickerOverlay>);
    fireEvent.click(screen.getByRole("button", { name: "Choose leap" }));
    const sheet = screen.getByRole("dialog", { name: "Leap calendar" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Next year" }));
    expect(within(sheet).getByRole("heading", { name: /February 2029/ })).toBeTruthy();
    expect(within(sheet).queryByRole("gridcell", { name: /^29 February 2029$/ })).toBeNull();
    expect(change).not.toHaveBeenCalled();
  });

  it("pages the date-time calendar as a view, leaving the date alone", () => {
    const change = vi.fn();
    const value = { date: date(2026, 10, 25), time: { hour: 1, minute: 30, second: 0 }, timeZone: "Europe/London", disambiguation: "earlier" as const };
    render(<PickerOverlay><NSEDateTimePicker aria-label="Meeting" mode="calendar" locale="en-GB" timeZone="Europe/London" value={value} onValueChange={change} /></PickerOverlay>);
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByText(/November 2026/)).toBeTruthy();
    expect(change).not.toHaveBeenCalled();
  });

  it("starts an empty range on today's month and applies a clicked draft without a stale error", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
    try {
      const change = vi.fn();
      render(<PickerOverlay><NSEDateRangePicker aria-label="Holiday" locale="en-GB" timeZone="Europe/London" value={null} onValueChange={change} /></PickerOverlay>);
      expect(screen.getByRole("button", { name: "Choose holiday dates" }).textContent).toBe("dd/mm/yyyy – dd/mm/yyyy");
      fireEvent.click(screen.getByRole("button", { name: "Choose holiday dates" }));
      const sheet = screen.getByRole("dialog", { name: "Holiday calendar" });
      fireEvent.blur(within(sheet).getByRole("textbox", { name: "Holiday start" }));
      fireEvent.click(within(sheet).getByRole("gridcell", { name: /^9 September 2026$/ }));
      fireEvent.click(within(sheet).getByRole("gridcell", { name: /^13 September 2026$/ }));
      expect(within(sheet).queryByRole("alert")).toBeNull();
      fireEvent.click(within(sheet).getByRole("button", { name: "Apply" }));
      expect(change).toHaveBeenLastCalledWith({ start: date(2026, 9, 9), end: date(2026, 9, 13) }, "commit");
    } finally {
      vi.useRealTimers();
    }
  });

  it("hints the locale's date shape in an empty date field", () => {
    render(<NSEDatePicker aria-label="Due" mode="text" locale="en-GB" timeZone="UTC" value={null} />);
    expect(screen.getByRole("textbox", { name: "Due" }).getAttribute("placeholder")).toBe("dd/mm/yyyy");
  });
});
