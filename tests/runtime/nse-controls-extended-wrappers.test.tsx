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
import { installNSEScrollIntoViewFixture } from "../nse/fixtures/browser";
installNSEScrollIntoViewFixture();

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEAppearanceProvider } from "../../src/NSE/Appearance";
import { atmoTheme } from "../../src/NSE/Appearance/atmo";
import { NSEButton, NSEImageView, NSESearchField, NSESegmentedControl } from "../../src/NSE/public/controls";
import { NSEStandaloneControlHost } from "../../src/NSE/Overlays";
import { HFXHapticEngine } from "../../src/FX/HapticsFX/HFXHapticEngine";
import { NSEFeedbackProvider } from "../../src/NSE/Feedback";
import { DateEntry } from "../../src/NSE/DateTime/Pickers/dateEntry";
import { TimeEntry } from "../../src/NSE/DateTime/Pickers/timeEntry";
import { MenuView } from "../../src/NSE/Menus/MenuView";
import { createStaticPresentationPort } from "../fixtures/presentationTraits";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const presentation = createStaticPresentationPort({ width: 1024, height: 768 });
function AppearanceHost({ children }: React.PropsWithChildren) {
  return <NSEAppearanceProvider theme={atmoTheme}>
    <NSEStandaloneControlHost document={document} window={window} presentation={presentation} parentResponderId="application:nse-control-gallery">
      {children}
    </NSEStandaloneControlHost>
  </NSEAppearanceProvider>;
}
function renderWithAppearance(children: React.ReactNode) {
  return render(children, { wrapper: AppearanceHost });
}

describe("NSE extended wrapper controls", () => {
  it("renders extended control wrappers through semantic NSE owners", () => {
    renderWithAppearance(
      <div>
        <NSEButton bezelStyle="texturedRounded" title="Back" image="/icons/back.png" imagePosition="imageOnly" />
        <NSESegmentedControl aria-label="Tools" segmentStyle="texturedRounded" selection={{ mode: "momentary", selectedIds: new Set() }} items={[{ id: "refresh", label: "Refresh", image: "/icons/refresh.png" }]} />
        <NSESegmentedControl aria-label="Calendar view" segmentStyle="texturedRounded" selection={{ mode: "select-one", selectedIds: new Set(["day"]), allowsEmpty: false }} items={[{ id: "day", label: "Day" }, { id: "week", label: "Week" }]} />
        <DateEntry aria-label="Due date" value={{ year: 2026, month: 6, day: 18 }} minimum={{ year: 2026, month: 6, day: 1 }} maximum={{ year: 2026, month: 6, day: 30 }} locale="en-GB"  timeZone="Europe/London" mode="text" editor="segments"/>
        <TimeEntry aria-label="Start time" value={{ hour: 9, minute: 30, second: 0 }} minimum={{ hour: 8, minute: 0, second: 0 }} maximum={{ hour: 10, minute: 0, second: 0 }} minuteStep={15}  locale="en-GB" timeZone="Europe/London" editor="segments"/>
      </div>
    );

    expect(screen.getByRole("toolbar", { name: "Tools" }).classList.contains("nse-extended-tool-button-group")).toBe(true);
    expect(screen.getByRole("radio", { name: "Day" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("group", { name: "Due date" }).getAttribute("data-locale-order")).toBe("day-month-year");
    expect(screen.getByRole("group", { name: "Start time" }).getAttribute("data-value")).toBe("09:30:00");
  });

  it("puts a segmented control's className on its root and plays its haptic for every segment style", () => {
    const haptic = vi.fn();
    const engine = new HFXHapticEngine({ supported: true, trigger: haptic, cancel: vi.fn(), dispose: vi.fn() });
    const onSelectionChange = vi.fn();
    renderWithAppearance(
      <NSEFeedbackProvider value={engine}>
        <NSESegmentedControl aria-label="Edit controls" className="app-edit-controls" segmentStyle="texturedRounded" haptic="success" selection={{ mode: "momentary", selectedIds: new Set() }} items={[{ id: "done", label: "Done" }, { id: "reset", label: "Reset" }]} onSelectionChange={onSelectionChange} />
        <NSESegmentedControl aria-label="View" className="app-view-switcher" haptic="success" selection={{ mode: "select-one", selectedIds: new Set(["list"]), allowsEmpty: false }} items={[{ id: "list", label: "List" }, { id: "grid", label: "Grid" }]} />
      </NSEFeedbackProvider>
    );

    expect(screen.getByRole("toolbar", { name: "Edit controls" }).classList.contains("app-edit-controls")).toBe(true);
    expect(screen.getByRole("group", { name: "View" }).classList.contains("app-view-switcher")).toBe(true);
    const reset = screen.getByRole("button", { name: "Reset" });
    fireEvent.pointerDown(reset);
    fireEvent.click(reset);
    expect(onSelectionChange).toHaveBeenCalledWith(expect.objectContaining({ selectedIds: new Set(["reset"]) }));
    expect(haptic).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Grid" }));
    expect(haptic).toHaveBeenCalledTimes(2);
  });

  it("maps date and time pickers to controlled NSE picker values", async () => {
    const onDateChange = vi.fn();
    const onTimeChange = vi.fn();

    renderWithAppearance(
      <div>
        <DateEntry
          aria-label="Ship date"
          value={{ year: 2026, month: 6, day: 18 }}
          minimum={{ year: 2026, month: 6, day: 1 }}
          maximum={{ year: 2026, month: 6, day: 30 }}
          locale="en-US"
          onValueChange={onDateChange}
         timeZone="Europe/London" mode="text" editor="segments"/>
        <TimeEntry
          aria-label="Alarm"
          value={{ hour: 9, minute: 0, second: 0 }}
          minimum={{ hour: 8, minute: 0, second: 0 }}
          maximum={{ hour: 10, minute: 0, second: 0 }}
          minuteStep={15}
          onValueChange={onTimeChange}
         locale="en-GB" timeZone="Europe/London" editor="segments"/>
      </div>
    );

    // Segment editors are hosted Atmo pickers: open by their "{label} {value}" name.
    fireEvent.click(screen.getByRole("button", { name: "Day 18" }));
    fireEvent.click((await screen.findAllByRole("option", { name: "20" })).find((option) => option.tagName === "BUTTON")!);
    expect(onDateChange).toHaveBeenCalledWith({ year: 2026, month: 6, day: 20 }, "commit");

    fireEvent.click(screen.getByRole("button", { name: /^Minute / }));
    fireEvent.click((await screen.findAllByRole("option", { name: "30" })).find((option) => option.tagName === "BUTTON")!);
    expect(onTimeChange).toHaveBeenCalledWith({ hour: 9, minute: 30, second: 0 }, "commit");
  });

  it("supports nested menu rows with icons, shortcuts, separators, and disabled items", async () => {
    const onSelect = vi.fn();

    renderWithAppearance(
      <MenuView
        label="Nested"
        onSelect={onSelect}
        items={[
          {
            value: "file",
            label: "File",
            icon: <span>F</span>,
            children: [{ value: "export", label: "Export", shortcut: "E" }]
          },
          { value: "separator", label: "", separator: true },
          { value: "quit", label: "Quit", disabled: true }
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Nested" }));
    const file = await screen.findByRole("menuitem", { name: /file/i });

    // The canonical controller owns one active branch with a Back action.
    expect(file.getAttribute("aria-haspopup")).toBe("menu");
    expect(screen.queryByRole("menuitem", { name: /export/i })).toBeNull();
    expect(screen.getByRole("separator")).not.toBeNull();
    expect((screen.getByRole("menuitem", { name: "Quit" }) as HTMLButtonElement).disabled).toBe(true);

    // Expanding the parent reveals the nested branch through the same menu.
    fireEvent.click(file);
    const exportItem = await screen.findByRole("menuitem", { name: /export/i });
    expect(screen.getByRole("menuitem", { name: "Back" })).toBeTruthy();
    expect(exportItem.querySelector('[data-nse-part="shortcut-column"]')?.textContent).toBe("E");

    fireEvent.click(exportItem);
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith("export"));
  });

  it("draws the default, destructive and appearance buttons with the theme's art for each", () => {
    renderWithAppearance(
      <div>
        <NSEButton title="Plain" />
        <NSEButton title="Light" appearance="aqua" />
        <NSEButton title="Dark" appearance="darkAqua" />
        <NSEButton title="Save" keyEquivalent={"\r"} />
        <NSEButton title="Delete" hasDestructiveAction />
        <NSEButton title="Tool" bezelStyle="texturedRounded" />
      </div>
    );

    expect(screen.getByRole("button", { name: "Plain" }).getAttribute("data-tone")).toBe("medium");
    expect(screen.getByRole("button", { name: "Light" }).getAttribute("data-tone")).toBe("light");
    expect(screen.getByRole("button", { name: "Dark" }).getAttribute("data-tone")).toBe("dark");
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("data-tone")).toBe("affirmative");
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("data-key-equivalent")).toBe("default");
    expect(screen.getByRole("button", { name: "Delete" }).getAttribute("data-tone")).toBe("negative");
    expect(screen.getByRole("button", { name: "Tool" }).getAttribute("data-tone")).toBe("dark");
  });

  it("renders a 12-hour TimePicker with an AM/PM field when is24HrMode is false", () => {
    // 12-hour time picker mode: hours 1–12 + AM/PM; 13:30 → 1:30 PM. The committed
    // value stays 24-hour "13:30". See controls/picker/TimePicker.js (is24HrMode + ampm field).
    renderWithAppearance(<TimeEntry aria-label="Alarm" value={{ hour: 13, minute: 30, second: 0 }} hourCycle="h12"  locale="en-GB" timeZone="Europe/London" editor="segments"/>);

    expect(screen.getByRole("group", { name: "Alarm" }).getAttribute("data-value")).toBe("13:30:00");
    expect(screen.getByRole("group", { name: "Alarm" }).getAttribute("data-hour-mode")).toBe("12");
    expect(screen.getByRole("button", { name: "Hour 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "AM/PM PM" })).toBeTruthy();
  });

  it("hides DatePicker fields via hideMonth/hideDay/hideYear", () => {
    // DatePicker can omit individual fields.
    renderWithAppearance(<DateEntry aria-label="Due" value={{ year: 2026, month: 6, day: 18 }}  locale="en-GB"  hiddenFields={["year"]} timeZone="Europe/London" mode="text" editor="segments"/>);

    expect(screen.getByRole("button", { name: "Day 18" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Year / })).toBeNull();
  });

  it("renders NSEImageView with the source image and zoom controls", () => {
    // image family (SizeableImage zoom engine in an ImageView with +/- controls).
    const { container } = renderWithAppearance(<NSEImageView src="/sample.jpg" alt="Sample" />);

    expect(container.querySelector(".nse-control-sizeable-image-media")?.getAttribute("src")).toBe("/sample.jpg");
    expect(screen.getByRole("button", { name: "Zoom in" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Zoom out" })).not.toBeNull();
  });

  it("gives NSESearchField an italic prompt, a clear button only while it has text, and an optional magnifier", () => {
    const onClear = vi.fn();
    const { container, rerender } = renderWithAppearance(<NSESearchField aria-label="Find" onClear={onClear} />);

    // An empty field draws no mark: just its default prompt.
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.placeholder).toBe("search something…");
    expect(container.querySelectorAll(".nse-control-search-affordance")).toHaveLength(0);
    expect(container.querySelector(".nse-control-search-icon")).toBeNull();

    fireEvent.input(input, { target: { value: "atmo" } });
    const clear = screen.getByRole("button", { name: "Clear search" });
    expect(clear.getAttribute("data-state")).toBe("clear");

    fireEvent.click(clear);
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll(".nse-control-search-affordance")).toHaveLength(0);

    rerender(<NSESearchField aria-label="Find" showsSearchIcon placeholder="Search contacts…" />);
    const icon = container.querySelector(".nse-control-search-icon");
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(icon?.nextElementSibling?.tagName).toBe("INPUT");
    expect((container.querySelector("input") as HTMLInputElement).placeholder).toBe("Search contacts…");
  });
});
