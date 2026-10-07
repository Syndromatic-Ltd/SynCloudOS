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

import { NSEDatePicker, NSEPasswordField, NSETabGroup, NSETimePicker } from "../../../src/NSE/public/controls";
import { NSE, NSEDatePicker as RootDatePicker, NSESecureTextField as RootSecureTextField, NSETabView as RootTabView, NSETimePicker as RootTimePicker } from "../../../src/NSE/NSE";
import { NSEStandaloneControlHost } from "../../../src/NSE/Overlays";
import { NSEFeedbackProvider } from "../../../src/NSE/Feedback";
import { NSEControlRuntimeProvider } from "../../../src/NSE/Controls/Core";
import { createStaticPresentationPort } from "../../fixtures/presentationTraits";

afterEach(cleanup);

const adapterPresentation = createStaticPresentationPort({ width: 900, height: 700 });

function OverlayHarness({ children }: { readonly children: React.ReactNode }) {
  return <NSEStandaloneControlHost document={document} window={window} presentation={adapterPresentation}>{children}</NSEStandaloneControlHost>;
}

const dateRoutes = [
  ["public controls", NSEDatePicker],
  ["NSE namespace/root", NSE.NSEDatePicker],
  ["NSE DateTime namespace", NSE.DateTime.NSEDatePicker]
] as const;

const timeRoutes = [
  ["public controls", NSETimePicker],
  ["NSE namespace/root", NSE.NSETimePicker],
  ["NSE DateTime namespace", NSE.DateTime.NSETimePicker]
] as const;

const tabRoutes = [
  ["public controls", NSETabGroup],
  ["NSE namespace/root", NSE.NSETabGroup]
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
  it.each(dateRoutes)("mounts the %s date route inside the standard overlay provider", (_route, DatePicker) => {
    const { container } = render(<OverlayHarness><DatePicker aria-label="Provider date" defaultValue={{ year: 2026, month: 6, day: 18 }}  locale="en-GB" timeZone="Europe/London" mode="text" editor="segments"/></OverlayHarness>);
    expect(container.querySelector('[data-nse-control="date-picker"]')).not.toBeNull();
    expect((container.querySelector('input[type="hidden"]') as HTMLInputElement).value).toBe("2026-06-18");
  });

  it.each(timeRoutes)("mounts the %s time route in 24-hour mode inside the standard overlay provider", (_route, TimePicker) => {
    const { container } = render(<OverlayHarness><TimePicker aria-label="Provider time" defaultValue={{ hour: 13, minute: 30, second: 0 }} hourCycle="h24"  locale="en-GB" timeZone="Europe/London" editor="segments"/></OverlayHarness>);
    expect(container.querySelector('[data-nse-control="time-picker"]')).not.toBeNull();
    expect(container.querySelector('[data-hour-mode="24"]')).not.toBeNull();
  });

  it.each(timeRoutes)("mounts the %s time route in 12-hour mode inside the standard overlay provider", (_route, TimePicker) => {
    const { container } = render(<OverlayHarness><TimePicker aria-label="Provider time" locale="en-US" defaultValue={{ hour: 13, minute: 30, second: 0 }} hourCycle="h12"  timeZone="Europe/London" editor="segments"/></OverlayHarness>);
    expect(container.querySelector('[data-nse-control="time-picker"]')).not.toBeNull();
    expect(container.querySelector('[data-hour-mode="12"]')).not.toBeNull();
  });

  it("keeps an omitted date empty and resets a supplied civil default through its form", () => {
    const props = { "aria-label": "Date", locale: "en-GB", timeZone: "Europe/London", mode: "text" as const, editor: "segments" as const, name: "date" };
    const view = render(<NSEDatePicker {...props} />);
    expect(view.container.querySelector<HTMLInputElement>('input[type="hidden"]')!.value).toBe("");
    view.rerender(<form><NSEDatePicker {...props} defaultValue={{ year: 2026, month: 6, day: 18 }} /></form>);
    fireEvent.change(screen.getByRole("combobox", { name: "Day" }), { target: { value: "20" } });
    expect(view.container.querySelector<HTMLInputElement>('input[type="hidden"]')!.value).toBe("2026-06-20");
    fireEvent.reset(view.container.querySelector("form")!);
    expect(view.container.querySelector<HTMLInputElement>('input[type="hidden"]')!.value).toBe("2026-06-18");
  });

  it("round-trips plain civil dates without introducing instant conversions", () => {
    const change = vi.fn();
    const view = render(<NSEDatePicker aria-label="Local date" value={{ year: 2026, month: 6, day: 18 }} onValueChange={change} locale="en-GB" timeZone="Pacific/Honolulu" mode="text" editor="segments" />);
    expect(view.container.querySelector<HTMLInputElement>('input[type="hidden"]')!.value).toBe("2026-06-18");
    fireEvent.change(screen.getByRole("combobox", { name: "Day" }), { target: { value: "20" } });
    expect(change).toHaveBeenCalledWith({ year: 2026, month: 6, day: 20 }, "commit");
  });

  it("keeps canonical date field visibility, bounds, gates, formatting, and host props", () => {
    const change = vi.fn();
    const { container, rerender } = render(<NSEDatePicker data-consumer="civil" className="consumer-date" aria-label="Bounded date" value={{ year: 2026, month: 6, day: 18 }} minimum={{ year: 2026, month: 6, day: 10 }} maximum={{ year: 2026, month: 6, day: 20 }}  disabled onValueChange={change}  hiddenFields={["month"]} locale="en-GB" timeZone="Europe/London" mode="text" editor="segments"/>);
    expect(container.querySelector('.consumer-date[data-consumer="civil"]')).not.toBeNull();
    expect(screen.queryByRole("combobox", { name: "Month" })).toBeNull();
    expect((screen.getByRole("combobox", { name: "Day" }) as HTMLSelectElement).disabled).toBe(true);
    rerender(<NSEDatePicker aria-label="Bounded date" value={{ year: 2026, month: 6, day: 18 }} minimum={{ year: 2026, month: 6, day: 10 }} maximum={{ year: 2026, month: 6, day: 20 }}  readOnly onValueChange={change}  hiddenFields={["year"]} locale="en-GB" timeZone="Europe/London" mode="text" editor="segments"/>);
    expect(screen.queryByRole("combobox", { name: "Year" })).toBeNull();
    expect((screen.getByRole("combobox", { name: "Day" }) as HTMLSelectElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("combobox", { name: "Day" }), { target: { value: "21" } });
    expect(change).not.toHaveBeenCalled();
  });

  it("preserves time interval, locale clock defaults, explicit modes, bounds, gates, and host props", () => {
    const change = vi.fn();
    const { container, rerender } = render(<NSETimePicker className="consumer-time" data-consumer="clock" aria-label="US time" locale="en-US" defaultValue={{ hour: 13, minute: 30, second: 0 }} minuteStep={15} minimum={{ hour: 9, minute: 0, second: 0 }} maximum={{ hour: 14, minute: 0, second: 0 }} onValueChange={change}  timeZone="Europe/London" editor="segments"/>);
    expect(container.querySelector('.consumer-time[data-consumer="clock"] [data-hour-mode="12"]')).not.toBeNull();
    expect(Array.from(screen.getByRole("combobox", { name: "Minute" }).querySelectorAll("option")).map((option) => option.value)).toEqual(["0", "15", "30", "45"]);
    fireEvent.change(screen.getByRole("combobox", { name: "Minute" }), { target: { value: "45" } });
    expect(change).toHaveBeenLastCalledWith({ hour: 13, minute: 45, second: 0 }, "commit");
    rerender(<NSETimePicker aria-label="UK time" locale="en-GB" value={{ hour: 10, minute: 0, second: 0 }} hourCycle="h24" disabled onValueChange={change}  timeZone="Europe/London" editor="segments"/>);
    expect(container.querySelector('[data-hour-mode="24"]')).not.toBeNull();
    expect((screen.getByRole("combobox", { name: "Hour" }) as HTMLSelectElement).disabled).toBe(true);
    rerender(<NSETimePicker aria-label="Read only" value={{ hour: 10, minute: 0, second: 0 }} readOnly onValueChange={change}  locale="en-GB" timeZone="Europe/London" editor="segments"/>);
    expect((screen.getByRole("combobox", { name: "Minute" }) as HTMLSelectElement).disabled).toBe(true);
  });

  it.each(timeRoutes)("anchors non-zero boundary intervals and truncates the maximum through the %s route", (_route, TimePicker) => {
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
    const { container } = render(<OverlayHarness><NSETimePicker aria-label="Spanning time" locale="en-US" defaultValue={{ hour: 11, minute: 10, second: 0 }} minuteStep={15} minimum={{ hour: 11, minute: 10, second: 0 }} maximum={{ hour: 13, minute: 42, second: 0 }} hourCycle="h12"  timeZone="Europe/London" editor="segments"/></OverlayHarness>);
    expect(pickerOptions("Hour")).toEqual(["11"]);
    fireEvent.click(pickerTrigger("AM/PM"));
    fireEvent.click(screen.getByRole("option", { name: "PM" }));
    expect((container.querySelector('input[type="hidden"]') as HTMLInputElement).value).toBe("12:10:00");
    expect(pickerOptions("Hour")).toEqual(["12", "1"]);
  });

  it("preserves password preview, commit, cancel, formatter, validity, decorations, and host semantics", () => {
    const phases: string[] = [];
    const formatter = { format: (value: string) => value.toUpperCase(), editingText: (value: string) => value.toUpperCase(), parse: (text: string) => ({ ok: true as const, value: text.toLowerCase() }), validatePartial: () => ({ valid: true }) };
    const { container, rerender } = render(<form><NSEPasswordField label="Credential" name="credential" required pattern="[a-z]+" hint="lowercase" prefix="Lock" suffix="Required" formatter={formatter} formatterContext={{ locale: "en-GB" }} defaultValue="seed" onValueChange={(_value, phase) => phases.push(phase)} /></form>);
    const input = container.querySelector('input[name="credential"]') as HTMLInputElement;
    expect(input.closest("label")?.htmlFor).toBe(input.id);
    expect(input.type).toBe("password");
    expect(input.value).toBe("SEED");
    fireEvent.change(input, { target: { value: "NEXT" } });
    expect(phases).toEqual(["preview"]);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(phases).toEqual(["preview", "cancel"]);
    expect(input.value).toBe("SEED");
    fireEvent.change(input, { target: { value: "FINAL" } });
    fireEvent.blur(input);
    expect(phases).toEqual(["preview", "cancel", "preview", "commit"]);
    expect(input.required).toBe(true);
    expect(input.pattern).toBe("[a-z]+");
    expect(screen.getByText("Lock")).not.toBeNull();
    expect(screen.getByText("Required")).not.toBeNull();
    rerender(<NSEPasswordField label="Credential" value="fixed" disabled onValueChange={(_value, phase) => phases.push(phase)} />);
    expect((screen.getByLabelText("Credential") as HTMLInputElement).disabled).toBe(true);
  });

  it("commits a canonical password only after its accepted command executes", async () => {
    const changes = vi.fn();
    const dispatch = vi.fn(async () => ({ status: "executed" as const, commandId: "credential.set", responderId: "credential", operationId: "op", correlationId: "correlation", value: undefined }));
    const port = {
      signal: new AbortController().signal,
      commands: {
        getPresentationGeneration: () => ({ registryGeneration: 3, responderGeneration: 7 }),
        validate: vi.fn(async () => ({ commandId: "credential.set", responderId: "credential", title: "Set credential", enabled: true, denied: false, hidden: false, state: "off" as const, stale: false })),
        prepareDispatch: vi.fn(async () => ({ status: "accepted" as const, acceptance: { commandId: "credential.set", responderId: "credential" } as never })),
        dispatch
      }
    };
    const { container } = render(<NSEControlRuntimeProvider port={port}><NSEPasswordField label="Command credential" defaultValue="base" command={{ id: "credential.set", payload: "base", responderId: "credential" }} onValueChange={changes} /></NSEControlRuntimeProvider>);
    await waitFor(() => expect(port.commands.validate).toHaveBeenCalled());
    const input = container.querySelector('input[type="password"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "next" } });
    expect(changes).toHaveBeenCalledWith("next", "preview");
    expect(changes).not.toHaveBeenCalledWith("next", "commit");
    fireEvent.blur(input);
    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
    expect(changes).toHaveBeenCalledWith("next", "commit");
  });

  it("preserves controlled value-tab host, icon, caption and callback semantics without owning panels", () => {
    const change = vi.fn();
    const options = [{ value: "a", label: "Account", icon: <span>★</span>, caption: "Profile" }, { value: "b", label: "Billing", src: "/billing.svg", caption: "Plans" }];
    const view = render(<NSETabGroup className="consumer-tabs" data-consumer="pages" tone="light" selectionHaptic={false} label="Pages" value="a" options={options} onValueChange={change} />);
    expect(view.container.querySelector('.consumer-tabs[data-consumer="pages"][data-tone="light"]')).not.toBeNull();
    expect(screen.queryByRole("tabpanel")).toBeNull();
    expect(screen.queryByText("Profile")).toBeNull();
    expect(view.container.querySelector('img[src="/billing.svg"]')).not.toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Billing" }));
    expect(change).toHaveBeenCalledWith("b");
    expect(screen.getByRole("tab", { name: "Account" }).getAttribute("aria-selected")).toBe("true");
    view.rerender(<NSETabGroup label="Pages" value="b" options={options} onValueChange={change} />);
    expect(screen.getByRole("tab", { name: "Billing" }).getAttribute("aria-selected")).toBe("true");
  });

  it("draws icon tabs named by their tooltip, or by captions beneath the icons", () => {
    const change = vi.fn();
    const options = [{ value: "wheel", label: "Colour Wheel", icon: <svg data-glyph="wheel" /> }, { value: "sliders", label: "Colour Sliders", icon: <svg data-glyph="sliders" /> }];
    const view = render(<NSETabGroup label="Colour pickers" tabStyle="icons" selectionHaptic={false} value="wheel" options={options} onValueChange={change} />);
    const list = screen.getByRole("tablist", { name: "Colour pickers" });
    expect(list.classList.contains("nse-icon-tabs")).toBe(true);
    expect(list.classList.contains("nse-control-toolbar")).toBe(false);
    const sliders = screen.getByRole("tab", { name: "Colour Sliders" });
    // Without a tooltip provider the name falls back to a title; no caption shows.
    expect(sliders.getAttribute("title")).toBe("Colour Sliders");
    expect(sliders.querySelector('[data-nse-part="tab-icon"] [data-glyph="sliders"]')).not.toBeNull();
    expect(screen.queryByText("Colour Sliders")).toBeNull();
    fireEvent.click(sliders);
    expect(change).toHaveBeenCalledWith("sliders");
    view.rerender(<NSETabGroup label="Colour pickers" tabStyle="icons" showsCaptions selectionHaptic={false} value="wheel" options={options} onValueChange={change} />);
    expect(screen.getByText("Colour Sliders").getAttribute("data-nse-part")).toBe("tab-caption");
    expect(screen.getByRole("tab", { name: "Colour Sliders" }).getAttribute("title")).toBeNull();
  });

  it.each(tabRoutes)("preserves canonical Atmo, icon, caption, and panel semantics through the %s route", (_route, TabGroup) => {
    const { container } = render(<div data-consumer="tabs"><section id="external-panel" role="tabpanel">External panel</section><TabGroup label="Route tabs" tone="light" defaultValue="external" options={[
      { value: "external", label: "External", icon: "/external.svg", caption: "Ignored caption" },
      { value: "owned", caption: "Owned caption", icon: <span data-glyph="owned">◆</span> },
      { value: "history", label: "History" }
    ]} /></div>);
    const externalTab = screen.getByRole("tab", { name: "External" });
    const ownedTab = screen.getByRole("tab", { name: "Owned caption" });
    const historyTab = screen.getByRole("tab", { name: "History" });
    const tablist = screen.getByRole("tablist", { name: "Route tabs" });
    expect(externalTab.classList.contains("nse-control-button")).toBe(true);
    expect(externalTab.getAttribute("data-tone")).toBe("light");
    expect(tablist.matches('.nse-extended-tab-group.nse-control-toolbar[data-grouped="true"]')).toBe(true);
    expect(externalTab.parentElement).toBe(tablist);
    expect(ownedTab.parentElement).toBe(tablist);
    expect(historyTab.parentElement).toBe(tablist);
    expect(tablist.querySelector('.nse-control-button:first-child:not(:last-child)')).toBe(externalTab);
    expect(tablist.querySelector('.nse-control-button:not(:first-child):not(:last-child)')).toBe(ownedTab);
    expect(tablist.querySelector('.nse-control-button:last-child:not(:first-child)')).toBe(historyTab);
    expect(externalTab.querySelector('.nse-extended-option-icon img[src="/external.svg"]')).not.toBeNull();
    expect(externalTab.querySelector('.nse-extended-option-label')?.textContent).toBe("External");
    expect(screen.queryByText("Ignored caption")).toBeNull();
    expect(ownedTab.querySelector('.nse-extended-option-icon [data-glyph="owned"]')).not.toBeNull();
    expect(ownedTab.querySelector('.nse-extended-option-label')?.textContent).toBe("Owned caption");
    expect(externalTab.getAttribute("aria-controls")).toBeNull();
    expect(container.querySelectorAll("#external-panel")).toHaveLength(1);
    expect(container.querySelector('[role="tabpanel"][data-restoration-id="owned"]')).toBeNull();
  });

  it("only publishes and requests feedback when value-tab selection changes", () => {
    const change = vi.fn(), trigger = vi.fn(async () => {});
    const engine = { trigger } as NonNullable<React.ComponentProps<typeof NSEFeedbackProvider>["value"]>;
    render(<NSEFeedbackProvider value={engine}><NSETabGroup label="Stable tabs" defaultValue="a" selectionHaptic="selection" options={[{ value: "a", label: "A" }, { value: "b", label: "B" }]} onValueChange={change} /></NSEFeedbackProvider>);
    fireEvent.click(screen.getByRole("tab", { name: "A" }));
    expect(change).not.toHaveBeenCalled(); expect(trigger).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: "B" }));
    expect(change).toHaveBeenCalledExactlyOnceWith("b"); expect(trigger).toHaveBeenCalledExactlyOnceWith("selection");
  });

  it("publishes one canonical engine or stateless adapter through the semantic public routes", () => {
    expect(NSE.NSEDatePicker).toBe(NSEDatePicker);
    expect(NSE.NSETimePicker).toBe(NSETimePicker);
    expect(NSE.NSEPasswordField).toBe(NSEPasswordField);
    expect(NSE.NSETabGroup).toBe(NSETabGroup);
    expect(NSE.DateTime.NSEDatePicker).toBe(RootDatePicker);
    expect(NSE.DateTime.NSETimePicker).toBe(RootTimePicker);
    expect(NSE.FieldExtensions.NSESecureTextField).toBe(RootSecureTextField);
    expect(NSE.Navigation.NSETabView).toBe(RootTabView);
  });
  it("routes canonical date and time props through the canonical civil picker engines", () => {
    const { container } = render(<><NSEDatePicker aria-label="Legacy date" defaultValue={{ year: 2026, month: 6, day: 18 }}  locale="en-GB" timeZone="Europe/London" mode="text" editor="segments"/><NSETimePicker aria-label="Legacy time" defaultValue={{ hour: 13, minute: 30, second: 0 }}  locale="en-GB" timeZone="Europe/London" editor="segments"/></>);
    expect(container.querySelectorAll('[data-nse-control="date-picker"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-nse-control="time-picker"]')).toHaveLength(1);
    expect((container.querySelector('[data-nse-control="date-picker"] input[type="hidden"]') as HTMLInputElement).value).toBe("2026-06-18");
  });

  it("routes the canonical password name through the canonical formatted field engine", () => {
    const { container } = render(<NSEPasswordField label="Legacy password" defaultValue="secret" />);
    expect(container.querySelector('.nse-control-text-field')).not.toBeNull();
    expect(screen.getByLabelText("Legacy password").getAttribute("type")).toBe("password");
  });

  it("routes the canonical tab group through canonical tab navigation semantics", () => {
    const { container } = render(<NSETabGroup label="Pages" defaultValue="a" options={[{ value: "a", label: "A" }, { value: "b", label: "B" }]} />);
    expect(container.querySelector('[data-nse-control="tab-group"]')).not.toBeNull();
    expect(screen.getByRole("tab", { name: "A" }).getAttribute("aria-selected")).toBe("true");
  });

  it("preserves canonical hidden date fields through the canonical date editor", () => {
    const onValueChange = vi.fn();
    render(<NSEDatePicker aria-label="Legacy date" locale="en-GB" defaultValue={{ year: 2026, month: 6, day: 18 }}  onValueChange={onValueChange}  hiddenFields={["month"]} timeZone="Europe/London" mode="text" editor="segments"/>);
    fireEvent.change(screen.getByRole("combobox", { name: "Day" }), { target: { value: "20" } });
    expect(onValueChange).toHaveBeenLastCalledWith({ year: 2026, month: 6, day: 20 }, "commit");
    expect(screen.queryByRole("button", { name: /^Month/ })).toBeNull();
  });

  it("preserves canonical minute interval, bounds, and clock mode", () => {
    const onValueChange = vi.fn();
    render(<NSETimePicker aria-label="Legacy time" locale="en-GB" defaultValue={{ hour: 10, minute: 0, second: 0 }} minuteStep={15} minimum={{ hour: 9, minute: 0, second: 0 }} maximum={{ hour: 10, minute: 30, second: 0 }} hourCycle="h24" onValueChange={onValueChange}  timeZone="Europe/London" editor="segments"/>);
    fireEvent.change(screen.getByRole("combobox", { name: "Minute" }), { target: { value: "15" } });
    expect(onValueChange).toHaveBeenLastCalledWith({ hour: 10, minute: 15, second: 0 }, "commit");
    expect(screen.queryByRole("combobox", { name: /AM\/PM/i })).toBeNull();
  });

  it("derives the canonical time clock mode from locale when no override is supplied", () => {
    render(<NSETimePicker aria-label="US time" locale="en-US" defaultValue={{ hour: 13, minute: 30, second: 0 }}  timeZone="Europe/London" editor="segments"/>);
    expect((screen.getByRole("combobox", { name: /AM\/PM/i }) as HTMLSelectElement).value).toBe("pm");
  });

  it("forwards canonical password validity and field semantics", () => {
    render(<form><NSEPasswordField label="Legacy password" name="password" required pattern="[A-Z]{2}[0-9]{2}" defaultValue="bad" /></form>);
    const input = screen.getByLabelText("Legacy password") as HTMLInputElement;
    expect(input.required).toBe(true);
    expect(input.pattern).toBe("[A-Z]{2}[0-9]{2}");
    expect(input.checkValidity()).toBe(false);
    fireEvent.invalid(input);
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  it("preserves canonical date and password host props and decorations", () => {
    const { container } = render(<><NSEDatePicker aria-label="Legacy date" className="consumer-date" data-consumer="calendar" defaultValue={{ year: 2026, month: 6, day: 18 }}  locale="en-GB" timeZone="Europe/London" mode="text" editor="segments"/><NSEPasswordField label="Legacy password" className="consumer-password" data-consumer="credentials" hint="Use four words" placeholder="Fallback" defaultValue="secret" /></>);
    expect(container.querySelector('.consumer-date[data-nse-control="date-picker"]')).not.toBeNull();
    expect(container.querySelector(".consumer-date")?.getAttribute("data-consumer")).toBe("calendar");
    const password = screen.getByLabelText("Legacy password");
    expect(password.closest("label")?.classList.contains("consumer-password")).toBe(true);
    expect(password.getAttribute("data-consumer")).toBe("credentials");
    expect(password.getAttribute("placeholder")).toBe("Fallback");
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

  it("keeps controlled tab selection stateless across replacement", () => {
    const onValueChange = vi.fn();
    const { rerender } = render(<NSETabGroup label="Pages" value="a" options={[{ value: "a", label: "A" }, { value: "b", label: "B" }]} onValueChange={onValueChange} />);
    fireEvent.click(screen.getByRole("tab", { name: "B" }));
    expect(onValueChange).toHaveBeenCalledWith("b");
    expect(screen.getByRole("tab", { name: "A" }).getAttribute("aria-selected")).toBe("true");
    rerender(<NSETabGroup label="Pages" value="b" options={[{ value: "a", label: "A" }, { value: "b", label: "B" }]} onValueChange={onValueChange} />);
    expect(screen.getByRole("tab", { name: "B" }).getAttribute("aria-selected")).toBe("true");
  });
});
