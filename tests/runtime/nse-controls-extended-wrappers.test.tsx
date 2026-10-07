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
import { atmoAppearance } from "../../src/NSE/Themes/Atmo";
import {
  NSEActivityButton,
  NSENotificationButton,
  NSEAppMenu,
  NSEButtonHeader,
  NSEEditMenu,
  NSEHeader,
  NSEHelpMenu,
  NSEIntegerPicker,
  NSEDatePicker,
  NSEListSelector,
  NSECroppableImage,
  NSEImageView,
  NSERotatingImage,
  type NSERotatingImageHandle,
  NSEMenu,
  NSEStandaloneControlHost,
  NSEInputBox,
  NSEPasswordField,
  NSEPickerGroup,
  NSESearchField,
  NSEPopupList,
  NSEPrevNextBanner,
  NSEProgressSlider,
  NSERadioToolButtonGroup,
  NSERoundedInput,
  NSETabGroup,
  NSETimePicker,
  NSEToolButton,
  NSEToolButtonGroup,
  NSEToolInput
} from "../../src/NSE/public/controls";
import { createStaticPresentationPort } from "../fixtures/presentationTraits";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const presentation = createStaticPresentationPort({ width: 1024, height: 768 });
function AppearanceHost({ children }: React.PropsWithChildren) {
  return <NSEAppearanceProvider appearance={atmoAppearance}>
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
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    const onHelp = vi.fn();
    const onAppMenuSelect = vi.fn();

    renderWithAppearance(
      <div>
        <NSEActivityButton active caption="Sync" />
        <NSENotificationButton variant="negative" label="Dismiss" />
        <NSEButtonHeader content="Actions" />
        <NSEToolButton label="Back" icon="/icons/back.png" />
        <NSEToolButtonGroup label="Tools">
          <NSEToolButton label="Refresh" showLabel>Refresh</NSEToolButton>
        </NSEToolButtonGroup>
        <NSERadioToolButtonGroup
          label="Calendar view"
          value="day"
          options={[
            { value: "day", label: "Day" },
            { value: "week", label: "Week" }
          ]}
        />
        <NSETabGroup
          label="Sections"
          value="files"
          options={[
            { value: "files", label: "Files" },
            { value: "details", label: "Details" }
          ]}
        />
        <NSEPasswordField label="Secret" hint="Password" />
        <NSERoundedInput label="Name" hint="Full name" />
        <NSEToolInput label="Filter" hint="Filter items" />
        <NSEHeader title="Header" actions={<NSEToolButton label="Info">Info</NSEToolButton>} />
        <NSEPrevNextBanner onPrevious={onPrevious} onNext={onNext}>Today</NSEPrevNextBanner>
        <NSEListSelector label="Provider" value="one" items={["One", "Two"]} />
        <NSEPopupList label="Popup actions" items={["Archive", "Pin"]} />
        <NSEPickerGroup label="Picker family">
          <NSEIntegerPicker label="Count" value={2} min={1} max={3} />
        </NSEPickerGroup>
        <NSEDatePicker aria-label="Due date" value={{ year: 2026, month: 6, day: 18 }} minimum={{ year: 2026, month: 6, day: 1 }} maximum={{ year: 2026, month: 6, day: 30 }} locale="en-GB"  timeZone="Europe/London" mode="text" editor="segments"/>
        <NSETimePicker aria-label="Start time" value={{ hour: 9, minute: 30, second: 0 }} minimum={{ hour: 8, minute: 0, second: 0 }} maximum={{ hour: 10, minute: 0, second: 0 }} minuteStep={15}  locale="en-GB" timeZone="Europe/London" editor="segments"/>
        <NSEProgressSlider label="Intensity" value={32} progressLabel="Download progress" />
        <NSEAppMenu
          open
          title="App menu"
          items={[{ value: "new", label: "New Card" }]}
          onSelect={onAppMenuSelect}
        />
        <NSEEditMenu autoDisableItems={false} showShortcuts />
        <NSEHelpMenu target="https://example.com/help" onOpenHelp={onHelp} />
      </div>
    );

    expect(screen.getByRole("button", { name: /sync/i }).getAttribute("data-active")).toBe("true");
    expect(screen.getByRole("button", { name: "Dismiss" }).getAttribute("data-variant")).toBe("negative");
    expect(screen.getByRole("button", { name: "Actions" }).classList.contains("nse-extended-button-header")).toBe(true);
    expect(screen.getByRole("toolbar", { name: "Tools" }).classList.contains("nse-extended-tool-button-group")).toBe(true);
    expect(screen.getByRole("radio", { name: "Day" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("tab", { name: "Files" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByLabelText("Secret").getAttribute("type")).toBe("password");
    expect(screen.getByLabelText("Name").getAttribute("placeholder")).toBe("Full name");
    expect(screen.getByLabelText("Filter").getAttribute("placeholder")).toBe("Filter items");
    expect(screen.getByText("Header")).not.toBeNull();
    expect(screen.getByText("Today")).not.toBeNull();
    expect(screen.getByRole("group", { name: "Picker family" })).not.toBeNull();
    expect(screen.getByRole("group", { name: "Due date" }).getAttribute("data-locale-order")).toBe("day-month-year");
    expect(screen.getByRole("group", { name: "Start time" }).getAttribute("data-value")).toBe("09:30:00");
    expect(screen.getByRole("progressbar", { name: "Download progress" })).not.toBeNull();
    expect(screen.getByText("App menu")).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "New Card" })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: /select all\s*(?:Ctrl|Cmd)\+A/i })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "New Card" }));

    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onHelp).toHaveBeenCalledWith("https://example.com/help");
    expect(onAppMenuSelect).toHaveBeenCalledWith("new");
  });

  it("maps ListSelector and PopupList selections onto current picker and menu primitives", async () => {
    const onListValueChange = vi.fn();
    const onListChange = vi.fn();
    const onListSelect = vi.fn();
    const onPopupSelect = vi.fn();

    renderWithAppearance(
      <div>
        <NSEListSelector
          label="Provider"
          value="one"
          items={[
            { value: "one", label: "One" },
            { value: "two", label: "Two" }
          ]}
          onValueChange={onListValueChange}
          onChange={onListChange}
          onSelect={onListSelect}
        />
        <NSEPopupList
          label="Actions"
          items={[
            { value: "archive", label: "Archive" },
            { value: "pin", label: "Pin" }
          ]}
          onSelect={onPopupSelect}
        />
      </div>
    );

    fireEvent.click(screen.getByRole("button", { name: /provider one/i }));
    fireEvent.click(await screen.findByRole("option", { name: "Two" }));

    expect(onListValueChange).toHaveBeenCalledWith("two");
    expect(onListChange).toHaveBeenCalledWith("two", "one");
    expect(onListSelect).toHaveBeenCalledWith(expect.objectContaining({ value: "two" }), "two");

    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Archive" }));

    await waitFor(() => expect(onPopupSelect).toHaveBeenCalledWith("archive", expect.objectContaining({ value: "archive" })));
  });

  it("keeps tab and progress slider wrappers controlled through their aliases", async () => {
    const onTabChange = vi.fn();
    const onSliderValueChange = vi.fn();
    const onPositionChange = vi.fn();

    renderWithAppearance(
      <div>
        <NSETabGroup
          label="Views"
          value="day"
          onValueChange={onTabChange}
          options={[
            { value: "day", label: "Day" },
            { value: "week", label: "Week" }
          ]}
        />
        <NSEProgressSlider
          label="Volume"
          position={10}
          minimum={0}
          maximum={100}
          snap={5}
          lockBar
          onValueChange={onSliderValueChange}
          onPositionChange={onPositionChange}
          progressLabel="Volume progress"
        />
      </div>
    );

    fireEvent.keyDown(screen.getByRole("tab", { name: "Day" }), { key: "ArrowRight" });
    expect(onTabChange).toHaveBeenCalledWith("week");

    fireEvent.change(screen.getByRole("slider", { name: "Volume" }), { target: { value: "35" } });

    await waitFor(() => expect(onSliderValueChange).toHaveBeenCalledWith(35));
    expect(onPositionChange).toHaveBeenCalledWith(35);
    expect(screen.getByRole("progressbar", { name: "Volume progress" }).getAttribute("aria-valuemax")).toBe("100");
  });

  it("maps integer, date, and time pickers to controlled NSE picker values", async () => {
    const onIntegerChange = vi.fn();
    const onDateChange = vi.fn();
    const onTimeChange = vi.fn();

    renderWithAppearance(
      <div>
        <NSEIntegerPicker label="Count" value={1} min={1} max={3} onValueChange={onIntegerChange} />
        <NSEDatePicker
          aria-label="Ship date"
          value={{ year: 2026, month: 6, day: 18 }}
          minimum={{ year: 2026, month: 6, day: 1 }}
          maximum={{ year: 2026, month: 6, day: 30 }}
          locale="en-US"
          onValueChange={onDateChange}
         timeZone="Europe/London" mode="text" editor="segments"/>
        <NSETimePicker
          aria-label="Alarm"
          value={{ hour: 9, minute: 0, second: 0 }}
          minimum={{ hour: 8, minute: 0, second: 0 }}
          maximum={{ hour: 10, minute: 0, second: 0 }}
          minuteStep={15}
          onValueChange={onTimeChange}
         locale="en-GB" timeZone="Europe/London" editor="segments"/>
      </div>
    );

    fireEvent.click(screen.getByRole("button", { name: "Count 1" }));
    fireEvent.click((await screen.findAllByRole("option", { name: "3" })).find((option) => option.tagName === "BUTTON")!);
    expect(onIntegerChange).toHaveBeenCalledWith(3);

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
      <NSEMenu
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

  it("maps NotificationButton variants onto the button tone vocabulary", () => {
    // Notification buttons: default = medium, alternate = dark, affirmative = green, negative = red.
    renderWithAppearance(
      <div>
        <NSENotificationButton variant="default" label="Default note" />
        <NSENotificationButton variant="alternate" label="Alternate note" />
        <NSENotificationButton variant="affirmative" label="Affirm note" />
        <NSENotificationButton variant="negative" label="Negative note" />
      </div>
    );

    expect(screen.getByRole("button", { name: "Default note" }).getAttribute("data-tone")).toBe("medium");
    expect(screen.getByRole("button", { name: "Alternate note" }).getAttribute("data-tone")).toBe("dark");
    expect(screen.getByRole("button", { name: "Affirm note" }).getAttribute("data-tone")).toBe("affirmative");
    expect(screen.getByRole("button", { name: "Negative note" }).getAttribute("data-tone")).toBe("negative");
  });

  it("renders a 12-hour TimePicker with an AM/PM field when is24HrMode is false", () => {
    // 12-hour time picker mode: hours 1–12 + AM/PM; 13:30 → 1:30 PM. The committed
    // value stays 24-hour "13:30". See controls/picker/TimePicker.js (is24HrMode + ampm field).
    renderWithAppearance(<NSETimePicker aria-label="Alarm" value={{ hour: 13, minute: 30, second: 0 }} hourCycle="h12"  locale="en-GB" timeZone="Europe/London" editor="segments"/>);

    expect(screen.getByRole("group", { name: "Alarm" }).getAttribute("data-value")).toBe("13:30:00");
    expect(screen.getByRole("group", { name: "Alarm" }).getAttribute("data-hour-mode")).toBe("12");
    expect(screen.getByRole("button", { name: "Hour 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "AM/PM PM" })).toBeTruthy();
  });

  it("hides DatePicker fields via hideMonth/hideDay/hideYear", () => {
    // DatePicker can omit individual fields.
    renderWithAppearance(<NSEDatePicker aria-label="Due" value={{ year: 2026, month: 6, day: 18 }}  locale="en-GB"  hiddenFields={["year"]} timeZone="Europe/London" mode="text" editor="segments"/>);

    expect(screen.getByRole("button", { name: "Day 18" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Year / })).toBeNull();
  });

  it("anchors the AppMenu top-left by default and supports top-right placement", () => {
    // AppMenu drops from the top-left status-bar corner; "top-right" is an NSE option
    // for wiring under the rightSlot / User Info button. See controls/menu/AppMenu.js.
    const { rerender } = renderWithAppearance(
      <NSEAppMenu open title="App" items={[{ value: "about", label: "About" }]} />
    );
    expect(
      document.querySelector(".nse-extended-app-menu-popup")?.getAttribute("data-app-menu-placement")
    ).toBe("top-left");

    rerender(
        <NSEAppMenu open title="App" placement="top-right" items={[{ value: "about", label: "About" }]} />
      );
    expect(
      document.querySelector(".nse-extended-app-menu-popup")?.getAttribute("data-app-menu-placement")
    ).toBe("top-right");
  });

  it("renders the ProgressSlider altBar as a secondary fill behind the primary bar", () => {
    // ProgressSlider altBarPosition: a secondary (buffer) fill drawn behind the
    // primary bar. Primary = barPosition.
    const { container } = renderWithAppearance(
      <NSEProgressSlider value={20} barPosition={40} altBarPosition={72} progressLabel="Buffer" />
    );
    const bar = container.querySelector(".nse-extended-progress-slider-bar") as HTMLElement;
    expect(bar.style.getPropertyValue("--nse-control-progress").trim()).toBe("40%");
    expect(bar.style.getPropertyValue("--nse-control-progress-alt").trim()).toBe("72%");
    expect(container.querySelector(".nse-control-progress-alt")).not.toBeNull();
  });

  it("renders NSEImageView with the source image and zoom controls", () => {
    // image family (SizeableImage zoom engine in an ImageView with +/- controls).
    const { container } = renderWithAppearance(<NSEImageView src="/sample.jpg" alt="Sample" />);

    expect(container.querySelector(".nse-control-sizeable-image-media")?.getAttribute("src")).toBe("/sample.jpg");
    expect(screen.getByRole("button", { name: "Zoom in" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Zoom out" })).not.toBeNull();
  });

  it("renders NSECroppableImage with a crop frame and Crop control", () => {
    // CroppableImage: zoom/pan a SizeableImage; Crop reports the visible source region.
    const { container } = renderWithAppearance(<NSECroppableImage src="/crop.jpg" alt="Crop" />);

    expect(container.querySelector(".nse-control-croppable-image-frame")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Crop" })).not.toBeNull();
  });

  it("renders NSERotatingImage spinning by default with imageSrc, and stops via the running prop", () => {
    // RotatingImage: imageSrc painted as background; spins while running; start()/stop() toggle it.
    const ref = React.createRef<NSERotatingImageHandle>();
    const { container, rerender } = renderWithAppearance(
      <NSERotatingImage ref={ref} imageSrc="/spin.png" size={48} />
    );
    const el = container.querySelector(".nse-control-rotating-image") as HTMLElement;

    expect(el).not.toBeNull();
    expect(el.getAttribute("data-running")).toBe("true");
    expect(el.style.backgroundImage).toContain("/spin.png");
    expect(typeof ref.current?.start).toBe("function");
    expect(typeof ref.current?.stop).toBe("function");

    rerender(
        <NSERotatingImage ref={ref} imageSrc="/spin.png" size={48} running={false} />
      );
    expect(el.getAttribute("data-running")).toBe("false");
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

  it("renders NSEInputBox as one framed box wrapping multiple controls", () => {
    const { container } = renderWithAppearance(
      <NSEInputBox label="URL" alwaysLooksFocused>
        <span className="nse-control-field-affix">https://</span>
        <input aria-label="address" />
        <button type="button">Go</button>
      </NSEInputBox>
    );

    const box = container.querySelector(".nse-control-input-box") as HTMLElement;
    expect(box.getAttribute("data-always-focused")).toBe("true");
    expect(container.querySelectorAll(".nse-control-input-box-frame")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Go" })).not.toBeNull();
    expect(screen.getByLabelText("address")).not.toBeNull();
  });

  it("defaults IntegerPicker to the 0–9 range and centers picker captions", async () => {
    // IntegerPicker default range is 0–9;
    // Picker.textAlign defaults to "center".
    const { container } = renderWithAppearance(<NSEIntegerPicker label="Rating" defaultValue={3} />);

    expect(container.querySelector(".nse-control-picker")?.getAttribute("data-text-align")).toBe("center");
    fireEvent.click(screen.getByRole("button", { name: "Rating 3" }));
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(10); // 0..9 inclusive
    expect(options[9].textContent).toContain("9");
  });
});
