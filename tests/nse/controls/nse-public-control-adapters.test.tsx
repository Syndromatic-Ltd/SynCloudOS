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

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NSEDatePicker } from "../../../src/NSE/public/controls";
import { NSEDateEntry } from "../../../src/NSE/DateTime/Pickers/dateEntry";
import { NSETimeEntry } from "../../../src/NSE/DateTime/Pickers/timeEntry";
import { NSE, NSEDatePicker as RootDatePicker, NSESecureTextField as RootSecureTextField, NSETabView as RootTabView } from "../../../src/NSE/NSE";
import { NSEStandaloneControlHost } from "../../../src/NSE/Overlays";
import { NSEFeedbackProvider } from "../../../src/NSE/Feedback";
import { NSEControlRuntimeProvider } from "../../../src/NSE/Controls/Core";
import { createStaticPresentationPort } from "../../fixtures/presentationTraits";

afterEach(cleanup);

const adapterPresentation = createStaticPresentationPort({ width: 900, height: 700 });

function OverlayHarness({ children }: { readonly children: React.ReactNode }) {
  return <NSEStandaloneControlHost document={document} window={window} presentation={adapterPresentation}>{children}</NSEStandaloneControlHost>;
}

const routes = [
  ["public controls", NSEDatePicker],
  ["NSE namespace/root", NSE.NSEDatePicker],
  ["NSE DateTime namespace", NSE.DateTime.NSEDatePicker]
] as const;

const selectValues = (name: string) => Array.from(screen.getByRole("combobox", { name }).querySelectorAll("option"), (option) => option.value);
/** Hosted choices are Atmo pickers: open the listbox, read its options, close it. */
const pickerTrigger = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name} `) });
const pickerOptions = (name: string) => {
  fireEvent.click(pickerTrigger(name));
  const labels = screen.getAllByRole("option").map((option) => option.textContent ?? "");
  fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
  return labels;
};

describe("canonical public control contracts", () => {
  it.each(routes)("mounts the %s date route inside the standard overlay provider", (_route, DatePicker) => {
    const { container } = render(<OverlayHarness><DatePicker aria-label="Provider date" defaultValue={{ year: 2026, month: 6, day: 18 }}  locale="en-GB" timeZone="Europe/London" datePickerStyle="textField" presentsCalendarOverlay={false}/></OverlayHarness>);
    expect(container.querySelector('[data-nse-control="date-picker"]')).not.toBeNull();
    expect((container.querySelector('input[type="hidden"]') as HTMLInputElement).value).toBe("2026-06-18");
  });

  it.each(routes)("mounts the %s time route in 24-hour mode inside the standard overlay provider", (_route, DatePicker) => {
    const { container } = render(<OverlayHarness><DatePicker datePickerElements={["hourMinute"]} aria-label="Provider time" defaultValue={{ hour: 13, minute: 30, second: 0 }} hourCycle="h24"  locale="en-GB" timeZone="Europe/London"/></OverlayHarness>);
    expect(container.querySelector('[data-nse-control="time-picker"]')).not.toBeNull();
    expect(container.querySelector('[data-hour-mode="24"]')).not.toBeNull();
  });

  it.each(routes)("mounts the %s time route in 12-hour mode inside the standard overlay provider", (_route, DatePicker) => {
    const { container } = render(<OverlayHarness><DatePicker datePickerElements={["hourMinute"]} aria-label="Provider time" locale="en-US" defaultValue={{ hour: 13, minute: 30, second: 0 }} hourCycle="h12"  timeZone="Europe/London"/></OverlayHarness>);
    expect(container.querySelector('[data-nse-control="time-picker"]')).not.toBeNull();
    expect(container.querySelector('[data-hour-mode="12"]')).not.toBeNull();
  });

  it("keeps an omitted date empty and resets a supplied civil default through its form", () => {
    const props = { "aria-label": "Date", locale: "en-GB", timeZone: "Europe/London", mode: "text" as const, editor: "segments" as const, name: "date" };
    const view = render(<NSEDateEntry {...props} />);
    expect(view.container.querySelector<HTMLInputElement>('input[type="hidden"]')!.value).toBe("");
    view.rerender(<form><NSEDateEntry {...props} defaultValue={{ year: 2026, month: 6, day: 18 }} /></form>);
    fireEvent.change(screen.getByRole("combobox", { name: "Day" }), { target: { value: "20" } });
    expect(view.container.querySelector<HTMLInputElement>('input[type="hidden"]')!.value).toBe("2026-06-20");
    fireEvent.reset(view.container.querySelector("form")!);
    expect(view.container.querySelector<HTMLInputElement>('input[type="hidden"]')!.value).toBe("2026-06-18");
  });

  it("round-trips plain civil dates without introducing instant conversions", () => {
    const change = vi.fn();
    const view = render(<NSEDateEntry aria-label="Local date" value={{ year: 2026, month: 6, day: 18 }} onValueChange={change} locale="en-GB" timeZone="Pacific/Honolulu" mode="text" editor="segments" />);
    expect(view.container.querySelector<HTMLInputElement>('input[type="hidden"]')!.value).toBe("2026-06-18");
    fireEvent.change(screen.getByRole("combobox", { name: "Day" }), { target: { value: "20" } });
    expect(change).toHaveBeenCalledWith({ year: 2026, month: 6, day: 20 }, "commit");
  });

  it("keeps canonical date field visibility, bounds, gates, formatting, and host props", () => {
    const change = vi.fn();
    const { container, rerender } = render(<NSEDateEntry data-consumer="civil" className="consumer-date" aria-label="Bounded date" value={{ year: 2026, month: 6, day: 18 }} minimum={{ year: 2026, month: 6, day: 10 }} maximum={{ year: 2026, month: 6, day: 20 }}  disabled onValueChange={change}  hiddenFields={["month"]} locale="en-GB" timeZone="Europe/London" mode="text" editor="segments"/>);
    expect(container.querySelector('.consumer-date[data-consumer="civil"]')).not.toBeNull();
    expect(screen.queryByRole("combobox", { name: "Month" })).toBeNull();
    expect((screen.getByRole("combobox", { name: "Day" }) as HTMLSelectElement).disabled).toBe(true);
    rerender(<NSEDateEntry aria-label="Bounded date" value={{ year: 2026, month: 6, day: 18 }} minimum={{ year: 2026, month: 6, day: 10 }} maximum={{ year: 2026, month: 6, day: 20 }}  readOnly onValueChange={change}  hiddenFields={["year"]} locale="en-GB" timeZone="Europe/London" mode="text" editor="segments"/>);
    expect(screen.queryByRole("combobox", { name: "Year" })).toBeNull();
    expect((screen.getByRole("combobox", { name: "Day" }) as HTMLSelectElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("combobox", { name: "Day" }), { target: { value: "21" } });
    expect(change).not.toHaveBeenCalled();
  });

  it("preserves time interval, locale clock defaults, explicit modes, bounds, gates, and host props", () => {
    const change = vi.fn();
    const { container, rerender } = render(<NSETimeEntry className="consumer-time" data-consumer="clock" aria-label="US time" locale="en-US" defaultValue={{ hour: 13, minute: 30, second: 0 }} minuteStep={15} minimum={{ hour: 9, minute: 0, second: 0 }} maximum={{ hour: 14, minute: 0, second: 0 }} onValueChange={change}  timeZone="Europe/London" editor="segments"/>);
    expect(container.querySelector('.consumer-time[data-consumer="clock"] [data-hour-mode="12"]')).not.toBeNull();
    expect(Array.from(screen.getByRole("combobox", { name: "Minute" }).querySelectorAll("option")).map((option) => option.value)).toEqual(["0", "15", "30", "45"]);
    fireEvent.change(screen.getByRole("combobox", { name: "Minute" }), { target: { value: "45" } });
    expect(change).toHaveBeenLastCalledWith({ hour: 13, minute: 45, second: 0 }, "commit");
    rerender(<NSETimeEntry aria-label="UK time" locale="en-GB" value={{ hour: 10, minute: 0, second: 0 }} hourCycle="h24" disabled onValueChange={change}  timeZone="Europe/London" editor="segments"/>);
    expect(container.querySelector('[data-hour-mode="24"]')).not.toBeNull();
    expect((screen.getByRole("combobox", { name: "Hour" }) as HTMLSelectElement).disabled).toBe(true);
    rerender(<NSETimeEntry aria-label="Read only" value={{ hour: 10, minute: 0, second: 0 }} readOnly onValueChange={change}  locale="en-GB" timeZone="Europe/London" editor="segments"/>);
    expect((screen.getByRole("combobox", { name: "Minute" }) as HTMLSelectElement).disabled).toBe(true);
  });

  it("anchors non-zero boundary intervals and truncates the maximum", () => {
    const TimePicker = NSETimeEntry;
    const { rerender } = render(<OverlayHarness><TimePicker aria-label="Boundary time" locale="en-GB" value={{ hour: 9, minute: 10, second: 0 }} minuteStep={15} minimum={{ hour: 9, minute: 10, second: 0 }} maximum={{ hour: 10, minute: 42, second: 0 }} hourCycle="h24"  timeZone="Europe/London" editor="segments"/></OverlayHarness>);
    expect(pickerOptions("Minute")).toEqual(["10", "25", "40", "55"]);

    rerender(<OverlayHarness><TimePicker aria-label="Boundary time" locale="en-GB" value={{ hour: 10, minute: 30, second: 0 }} minuteStep={15} minimum={{ hour: 9, minute: 10, second: 0 }} maximum={{ hour: 10, minute: 42, second: 0 }} hourCycle="h24"  timeZone="Europe/London" editor="segments"/></OverlayHarness>);
    expect(pickerOptions("Minute")).toEqual(["00", "15", "30"]);

    rerender(<OverlayHarness><TimePicker aria-label="Boundary time" locale="en-US" value={{ hour: 9, minute: 10, second: 0 }} minuteStep={15} minimum={{ hour: 9, minute: 10, second: 0 }} maximum={{ hour: 10, minute: 42, second: 0 }} hourCycle="h12"  timeZone="Europe/London" editor="segments"/></OverlayHarness>);
    expect(pickerOptions("Minute")).toEqual(["10", "25", "40", "55"]);
    expect(pickerTrigger("AM/PM")).not.toBeNull();

    rerender(<OverlayHarness><TimePicker aria-label="Boundary time" value={{ hour: 9, minute: 12, second: 0 }} minuteStep={15} minimum={{ hour: 9, minute: 10, second: 0 }} maximum={{ hour: 10, minute: 42, second: 0 }} readOnly  locale="en-GB" timeZone="Europe/London" editor="segments"/></OverlayHarness>);
    expect((pickerTrigger("Minute") as HTMLButtonElement).disabled).toBe(true);
  });

  it("selects an available target-period hour without relying on post-selection clamping", () => {
    const { container } = render(<OverlayHarness><NSETimeEntry aria-label="Spanning time" locale="en-US" defaultValue={{ hour: 11, minute: 10, second: 0 }} minuteStep={15} minimum={{ hour: 11, minute: 10, second: 0 }} maximum={{ hour: 13, minute: 42, second: 0 }} hourCycle="h12"  timeZone="Europe/London" editor="segments"/></OverlayHarness>);
    expect(pickerOptions("Hour")).toEqual(["11"]);
    fireEvent.click(pickerTrigger("AM/PM"));
    fireEvent.click(screen.getByRole("option", { name: "PM" }));
    expect((container.querySelector('input[type="hidden"]') as HTMLInputElement).value).toBe("12:10:00");
    expect(pickerOptions("Hour")).toEqual(["12", "1"]);
  });

  it("publishes one canonical engine or stateless adapter through the semantic public routes", () => {
    expect(NSE.NSEDatePicker).toBe(NSEDatePicker);
    expect(NSE.DateTime.NSEDatePicker).toBe(RootDatePicker);
    expect("NSETimeEntry" in NSE).toBe(false);
    expect(NSE.FieldExtensions.NSESecureTextField).toBe(RootSecureTextField);
    expect(NSE.Navigation.NSETabView).toBe(RootTabView);
  });
  it("routes canonical date and time props through the canonical civil picker engines", () => {
    const { container } = render(<><NSEDateEntry aria-label="Legacy date" defaultValue={{ year: 2026, month: 6, day: 18 }}  locale="en-GB" timeZone="Europe/London" mode="text" editor="segments"/><NSETimeEntry aria-label="Legacy time" defaultValue={{ hour: 13, minute: 30, second: 0 }}  locale="en-GB" timeZone="Europe/London" editor="segments"/></>);
    expect(container.querySelectorAll('[data-nse-control="date-picker"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-nse-control="time-picker"]')).toHaveLength(1);
    expect((container.querySelector('[data-nse-control="date-picker"] input[type="hidden"]') as HTMLInputElement).value).toBe("2026-06-18");
  });

  it("preserves canonical hidden date fields through the canonical date editor", () => {
    const onValueChange = vi.fn();
    render(<NSEDateEntry aria-label="Legacy date" locale="en-GB" defaultValue={{ year: 2026, month: 6, day: 18 }}  onValueChange={onValueChange}  hiddenFields={["month"]} timeZone="Europe/London" mode="text" editor="segments"/>);
    fireEvent.change(screen.getByRole("combobox", { name: "Day" }), { target: { value: "20" } });
    expect(onValueChange).toHaveBeenLastCalledWith({ year: 2026, month: 6, day: 20 }, "commit");
    expect(screen.queryByRole("button", { name: /^Month/ })).toBeNull();
  });

  it("preserves canonical minute interval, bounds, and clock mode", () => {
    const onValueChange = vi.fn();
    render(<NSETimeEntry aria-label="Legacy time" locale="en-GB" defaultValue={{ hour: 10, minute: 0, second: 0 }} minuteStep={15} minimum={{ hour: 9, minute: 0, second: 0 }} maximum={{ hour: 10, minute: 30, second: 0 }} hourCycle="h24" onValueChange={onValueChange}  timeZone="Europe/London" editor="segments"/>);
    fireEvent.change(screen.getByRole("combobox", { name: "Minute" }), { target: { value: "15" } });
    expect(onValueChange).toHaveBeenLastCalledWith({ hour: 10, minute: 15, second: 0 }, "commit");
    expect(screen.queryByRole("combobox", { name: /AM\/PM/i })).toBeNull();
  });

  it("derives the canonical time clock mode from locale when no override is supplied", () => {
    render(<NSETimeEntry aria-label="US time" locale="en-US" defaultValue={{ hour: 13, minute: 30, second: 0 }}  timeZone="Europe/London" editor="segments"/>);
    expect((screen.getByRole("combobox", { name: /AM\/PM/i }) as HTMLSelectElement).value).toBe("pm");
  });

  it("preserves canonical date host props and decorations", () => {
    const { container } = render(<><NSEDateEntry aria-label="Legacy date" className="consumer-date" data-consumer="calendar" defaultValue={{ year: 2026, month: 6, day: 18 }}  locale="en-GB" timeZone="Europe/London" mode="text" editor="segments"/></>);
    expect(container.querySelector('.consumer-date[data-nse-control="date-picker"]')).not.toBeNull();
    expect(container.querySelector(".consumer-date")?.getAttribute("data-consumer")).toBe("calendar");
  });

  it("preserves tab-view close, reorder, external-panel identity and keep-alive state", () => {
    const close = vi.fn(), reorder = vi.fn();
    const items = [
      { id: "external", label: "External", panelId: "external-panel", ownsPanel: false, render: () => null },
      { id: "a", label: "A", closable: true, render: () => <input aria-label="Retained draft" defaultValue="seed" /> },
      { id: "b", label: "B", closable: true, render: () => <p>Billing panel</p> },
    ];
    render(<><section id="external-panel" role="tabpanel">External panel</section><RootTabView aria-label="Document pages" items={items} defaultSelectedId="a" keepAlive onRequestClose={close} onRequestReorder={reorder} /></>);
    const draft = screen.getByRole("textbox", { name: "Retained draft" });
    fireEvent.change(draft, { target: { value: "kept" } });
    fireEvent.click(screen.getByRole("tab", { name: "B" }));
    expect(screen.getByText("Billing panel")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "A" }));
    expect(screen.getByRole("textbox", { name: "Retained draft" })).toBe(draft);
    expect((draft as HTMLInputElement).value).toBe("kept");
    expect(screen.getByRole("tab", { name: "External" }).getAttribute("aria-controls")).toBe("external-panel");
    expect(document.querySelectorAll("#external-panel")).toHaveLength(1);
    fireEvent.keyDown(screen.getByRole("tab", { name: "A" }), { key: "ArrowRight", altKey: true });
    expect(reorder).toHaveBeenCalledWith("a", 2);
    fireEvent.click(screen.getByRole("button", { name: "Close A" }));
    expect(close).toHaveBeenCalledWith("a");
  });
});
