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
import { defineNSEAppearance } from "@syndromatic/syncloudos/nse/appearance";
import { installNSEScrollIntoViewFixture } from "../nse/fixtures/browser";
installNSEScrollIntoViewFixture();

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEAppearanceProvider } from "../../src/NSE/Appearance";
import { atmoAppearance } from "../../src/NSE/Themes/Atmo";
import { NSEMenu, NSEPicker } from "../../src/NSE/Menus";
import { NSELevelIndicator, NSEStepper } from "../../src/NSE/Controls/Values";
import { NSEComboBox } from "../../src/NSE/Controls/Completion";
import { NSEStandaloneControlHost, NSEPopup } from "../../src/NSE/Overlays";
import { createStaticPresentationPort } from "../fixtures/presentationTraits";

const customAppearance = defineNSEAppearance({ id: "custom-test", displayName: "Custom test", recipes: [
  { slot: "toolbar.item.normal.1x", recipeId: "custom-test.toolbar.normal" },
  { slot: "toolbar.item.selected.1x", recipeId: "custom-test.toolbar.selected" },
] });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const presentation = createStaticPresentationPort({ width: 1024, height: 768 });
function InteractionHost({ children }: React.PropsWithChildren) {
  return <NSEStandaloneControlHost document={document} window={window} presentation={presentation} parentResponderId="workspace">{children}</NSEStandaloneControlHost>;
}

describe("NSE menu and picker interactions", () => {
  it("projects native-leak controls through stable slots without changing value or keyboard contracts", () => {
    const stepperChange = vi.fn();
    const comboSource = {
      query: vi.fn(async () => [] as const),
      idForItem: (value: string) => value,
      labelForItem: (value: string) => value,
    };
    render(
      <InteractionHost>
        <NSELevelIndicator aria-label="Capacity" minimum={0} maximum={5} value={3} warningValue={3} />
        <NSEStepper aria-label="Quantity" minimum={0} maximum={5} step={1} value={2} onValueChange={stepperChange} />
        <NSEComboBox aria-label="Search" value={null} inputValue="" dataSource={comboSource} onInputValueChange={() => undefined} onValueChange={() => undefined} />
      </InteractionHost>,
    );

    const meter = screen.getByRole("meter", { name: "Capacity" });
    const stepper = screen.getByRole("spinbutton", { name: "Quantity" });
    const combo = screen.getByRole("combobox", { name: "Search" });
    expect(meter.getAttribute("data-nse-appearance-slot")).toBe("level-indicator.track.normal.1x");
    expect(meter.querySelector('[data-nse-part="segment"]')?.getAttribute("data-nse-appearance-slot")).toBe("level-indicator.segment.warning.1x");
    expect(stepper.getAttribute("data-nse-appearance-slot")).toBe("stepper.increment.normal.1x");
    expect(combo.closest('[data-nse-control="combo-box"]')?.getAttribute("data-nse-appearance-slot")).toBe("combo-box.well.normal.1x");
    fireEvent.keyDown(stepper, { key: "ArrowUp" });
    expect(stepperChange).toHaveBeenCalledWith(3, "commit");
  });

  it("opens picker options with keyboard focus and restores focus after selection", async () => {
    const onValueChange = vi.fn();

    render(
      <InteractionHost>
        <NSEAppearanceProvider appearance={atmoAppearance}>
          <NSEPicker
            label="Density"
            value="balanced"
            options={[
              { value: "compact", label: "Compact" },
              { value: "balanced", label: "Balanced" },
              { value: "immersive", label: "Immersive" }
            ]}
            onValueChange={onValueChange}
          />
        </NSEAppearanceProvider>
      </InteractionHost>
    );

    const trigger = screen.getByRole("button", { name: /density balanced/i });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });

    const balanced = await screen.findByRole("option", { name: "Balanced" });
    await waitFor(() => expect(document.activeElement).toBe(balanced));

    fireEvent.keyDown(balanced, { key: "ArrowDown" });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("option", { name: "Immersive" })));

    fireEvent.keyDown(screen.getByRole("option", { name: "Immersive" }), { key: "Enter" });

    expect(onValueChange).toHaveBeenCalledWith("immersive");
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("opens menus from the trigger, navigates enabled items, and preserves checked item selections", async () => {
    const onSelect = vi.fn();

    render(
      <InteractionHost>
        <NSEAppearanceProvider appearance={customAppearance}>
          <NSEMenu
            label="Actions"
            items={[
              { value: "pin", label: "Pin Surface", checked: true },
              { value: "disabled", label: "Disabled Item", disabled: true },
              { value: "archive", label: "Archive", checked: false }
            ]}
            onSelect={onSelect}
          />
        </NSEAppearanceProvider>
      </InteractionHost>
    );

    const trigger = screen.getByRole("button", { name: "Actions" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });

    const pin = await screen.findByRole("menuitemcheckbox", { name: "Pin Surface" });
    expect(pin.closest("[data-nse-appearance]")?.getAttribute("data-nse-appearance")).toBe("custom-test");
    expect(pin.getAttribute("aria-checked")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(pin));

    fireEvent.keyDown(pin, { key: "ArrowDown" });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("menuitemcheckbox", { name: "Archive" })));

    fireEvent.keyDown(screen.getByRole("menuitemcheckbox", { name: "Archive" }), { key: "Enter" });

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith("archive"));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
  it("keeps Tab navigation inside a modal popup", () => {
    render(
      <InteractionHost>
        <NSEPopup id="confirm-popup" open modal parentResponderId="workspace" title="Confirm">
          <button>Cancel</button>
          <button>Continue</button>
        </NSEPopup>
      </InteractionHost>,
    );
    const dialog = screen.getByRole("dialog");
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const continueButton = screen.getByRole("button", { name: "Continue" });
    continueButton.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(cancel);
    cancel.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(continueButton);
  });

});
