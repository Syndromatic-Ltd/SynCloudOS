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
import { defineNSETheme } from "@syndromatic/syncloudos/nse/theme";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as cssTree from "css-tree";
import { readFileSync } from "node:fs";
import React, { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  NSEThemeProvider,
  useNSEVisualEnvironment,
  useNSEThemeRecipe,
  type NSEAppearanceServicePort,
} from "../../src/NSE/Appearance";
import { NSEAboutDialog } from "../../src/NSE/Components/NSESystemDialogs";
import { NSEPreferencesToast } from "../../src/NSE/Components/NSEPreferencesToast";
import { NSECheckbox, NSERadioGroup, NSETextField } from "../../src/NSE/Controls/Fields/NSEFields";
import { NSEPicker } from "../../src/NSE/Menus";
import { NSEOverlayProvider, NSEPopup as NSECanonicalPopup } from "../../src/NSE/Overlays";
import type { NSEOverlayRuntimePort } from "../../src/NSE/Overlays/overlayTypes";
import { atmoTheme } from "../../src/NSE/Themes/Atmo";
import { NSETooltip } from "../../src/NSE/Tooltips";
import { createStaticPresentationPort } from "../fixtures/presentationTraits";

const customAppearance = defineNSETheme({ id: "com.test.custom-test", displayName: "Custom test", recipes: [
  { slot: "toolbar.item.normal", recipeId: "custom-test.toolbar.normal" },
  { slot: "toolbar.item.selected", recipeId: "custom-test.toolbar.selected" },
] });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function service(
  requested: "auto" | "light" | "dark",
  resolved: "light" | "dark",
  runtimeId: string,
): NSEAppearanceServicePort {
  return {
    runtimeId,
    get: () => requested,
    resolved: () => resolved,
    subscribe: () => () => undefined,
  };
}

function Probe({ id }: { readonly id: string }) {
  const appearance = useNSEVisualEnvironment();
  return <output data-testid={id}>{JSON.stringify(appearance)}</output>;
}

function SlotProbe({ slot }: { readonly slot: string }) {
  const projection = useNSEThemeRecipe(slot);
  return <output data-testid="slot-probe" {...projection.attributes}>{projection.recipeId ?? "unresolved"}</output>;
}

function overlayRuntime(runtimeId = "runtime:p11"): NSEOverlayRuntimePort {
  const controller = new AbortController();
  const workArea = { width: 1024, height: 768, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } } as const;
  const visualViewport = { width: 1024, height: 768, offsetLeft: 0, offsetTop: 0 } as const;
  const presentation = createStaticPresentationPort({ width: 1024, height: 768 });
  return {
    runtimeId,
    signal: controller.signal,
    environment: {
      browser: { getDocument: () => document, getWindow: () => window },
      workArea: {
        getSnapshot: () => workArea,
        subscribe: () => () => undefined,
      },
      visualViewport: {
        getSnapshot: () => visualViewport,
        subscribe: () => () => undefined,
      },
      presentation,
      setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
      clearTimeout: (handle) => window.clearTimeout(handle as number),
    },
    restoreFocus: () => undefined,
    reportPlacementFailure: () => undefined,
    wrapFocusScope: (_options, children) => children,
  };
}

const completeProjection = {
  "data-nse-theme": "com.syndromatic.atmo",
  "data-nse-chrome": "hud",
  "data-nse-appearance-requested": "auto",
  "data-nse-appearance": "dark",
  "data-nse-contrast": "high",
  "data-nse-transparency": "reduced",
  "data-mode": "dark",
} as const;

function expectCompleteProjection(element: Element) {
  for (const [name, value] of Object.entries(completeProjection)) {
    expect(element.getAttribute(name)).toBe(value);
  }
}

function CanonicalPortalSpecimens() {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  return (
    <>
      <button ref={setAnchor}>Canonical anchor</button>
      <NSECanonicalPopup
        id="p11-canonical-popup"
        open
        anchor={anchor}
        parentResponderId="workspace"
        title="Canonical popup"
      >
        Canonical portal
      </NSECanonicalPopup>
      <NSETooltip id="p11-tooltip" open anchor={anchor} content="Projected tooltip" />
      <NSEPicker
        label="Canonical picker"
        options={[{ value: "one", label: "One" }]}
        listboxOverlay={{ id: "p11-listbox", parentResponderId: "workspace" }}
      />
    </>
  );
}

describe("NSE appearance composition", () => {

  it("selects explicit canonical appearance definitions without legacy aliases", () => {
    expect(atmoTheme.id).toBe("com.syndromatic.atmo");

    render(
      <NSEThemeProvider theme={customAppearance}>
        <Probe id="explicit-appearance" />
      </NSEThemeProvider>,
    );

    const probe = screen.getByTestId("explicit-appearance");
    expect(JSON.parse(probe.textContent ?? "{}").theme.id).toBe("com.test.custom-test");
    expect(probe.closest("[data-nse-theme]")?.getAttribute("data-nse-theme")).toBe("com.test.custom-test");
  });

  it("defines materially distinct high contrast and raster-free forced-colour paint contracts", () => {
    const css = readFileSync("src/NSE/Appearance/nse-appearance.css", "utf8");
    expect(css).toContain('[data-nse-contrast="high"]');
    expect(css).toContain("--nse-contrast-edge: #000");
    expect(css).toContain("--nse-contrast-accent: #004fd7");
    expect(css).toMatch(/data-nse-contrast="forced"[\s\S]*background-image:\s*none\s*!important/u);
    expect(css).toMatch(/forced-colors:\s*active[\s\S]*background-image:\s*none\s*!important/u);
    expect(css).toContain("[data-window-shadow-layer]");
    expect(css).toContain(".nse-menu-item:focus-visible");
    expect(css).toContain('[aria-disabled="true"]');
  });

  it("keeps semantic disabled and invalid state when controls change", async () => {
    const { rerender } = render(
      <NSEThemeProvider theme={atmoTheme}>
        <NSETextField label="Name" disabled invalid />
      </NSEThemeProvider>,
    );
    expect(screen.getByLabelText("Name").getAttribute("aria-invalid")).toBe("true");

    rerender(
      <NSEThemeProvider theme={atmoTheme}>
        <NSETextField label="Name" disabled invalid />
      </NSEThemeProvider>,
    );
    expect((screen.getByLabelText("Name") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByLabelText("Name").getAttribute("aria-invalid")).toBe("true");
  });

  it("projects requested and truthful resolved axes without mutating document authorities", () => {
    document.documentElement.setAttribute("data-user-sentinel", "preserved");

    render(
      <NSEThemeProvider
        theme={atmoTheme}
        chrome="hud"
        appearance="auto"
        appearanceService={service("auto", "dark", "runtime:dark")}
        contrast="high"
        transparency="reduced"
      >
        <div data-testid="child" />
      </NSEThemeProvider>,
    );

    const boundary = screen.getByTestId("child").closest("[data-nse-appearance]");
    expect(boundary).not.toBeNull();
    expectCompleteProjection(boundary!);
    expect(document.documentElement.getAttribute("data-user-sentinel")).toBe("preserved");
  });

  it("projects a source-bound slot result without assigning control state ownership", () => {
    render(
      <NSEThemeProvider theme={atmoTheme}>
        <SlotProbe slot="colour-picker.wheel.normal" />
      </NSEThemeProvider>,
    );

    const probe = screen.getByTestId("slot-probe");
    expect(probe.getAttribute("data-nse-theme-slot")).toBe("colour-picker.wheel.normal");
    expect(probe.getAttribute("data-nse-appearance-authority")).toBeNull();
    expect(probe.getAttribute("data-nse-theme-recipe-id")).toBeNull();
    expect(probe.getAttribute("data-nse-theme-state")).toBe("normal");
  });

  it("composes nested providers and independent runtime appearance services", () => {
    render(
      <div>
        <NSEThemeProvider
          theme={customAppearance}
          chrome="metal"
          appearanceService={service("auto", "dark", "runtime:a")}
        >
          <Probe id="outer" />
          <NSEThemeProvider theme={atmoTheme} chrome="hud">
            <Probe id="nested" />
          </NSEThemeProvider>
        </NSEThemeProvider>
        <NSEThemeProvider theme={atmoTheme} appearanceService={service("light", "light", "runtime:b")}>
          <Probe id="runtime-b" />
        </NSEThemeProvider>
      </div>,
    );

    expect(JSON.parse(screen.getByTestId("outer").textContent ?? "{}")).toMatchObject({
      theme: { id: "com.test.custom-test" },
      chrome: "metal",
      requestedAppearance: "auto",
      resolvedAppearance: "dark",
    });
    expect(JSON.parse(screen.getByTestId("nested").textContent ?? "{}")).toMatchObject({
      theme: { id: "com.syndromatic.atmo" },
      chrome: "hud",
      requestedAppearance: "auto",
      resolvedAppearance: "dark",
    });
    expect(JSON.parse(screen.getByTestId("runtime-b").textContent ?? "{}")).toMatchObject({
      theme: { id: "com.syndromatic.atmo" },
      requestedAppearance: "light",
      resolvedAppearance: "light",
    });
  });

  it("projects the complete payload through canonical portals", async () => {
    render(
      <NSEThemeProvider
        theme={atmoTheme}
        chrome="hud"
        appearanceService={service("auto", "dark", "runtime:portals")}
        contrast="high"
        transparency="reduced"
      >
        <NSEOverlayProvider runtimePort={overlayRuntime()}>
          <span>Canonical owner</span>
          <CanonicalPortalSpecimens />
        </NSEOverlayProvider>
      </NSEThemeProvider>,
    );

    expectCompleteProjection(document.querySelector("[data-nse-overlay-portal-host]")!);
    expectCompleteProjection((await screen.findByText("Canonical portal")).closest(".nse-overlay-popup")!);
    expectCompleteProjection(await screen.findByRole("tooltip"));

    fireEvent.click(screen.getByRole("button", { name: /canonical picker one/i }));
    const listbox = await screen.findByRole("listbox");
    expectCompleteProjection(listbox.closest("[data-nse-appearance]")!);
  });

  it("projects the complete payload on direct system dialog and Preferences portals", async () => {
    render(
      <NSEThemeProvider
        theme={atmoTheme}
        chrome="hud"
        appearanceService={service("auto", "dark", "runtime:system")}
        contrast="high"
        transparency="reduced"
      >
        <NSEAboutDialog
          open
          info={{ name: "Notes", version: "1", copyright: "Copyright", trademark: "Trademark" }}
          onDismiss={() => undefined}
        />
        <NSEPreferencesToast
          open
          title="Preferences"
          backLabel="Back"
          panes={[]}
          appearance="auto"
          resolvedMode="dark"
          onClose={() => undefined}
        />
      </NSEThemeProvider>,
    );

    const about = await screen.findByRole("dialog", { name: "Notes" });
    expectCompleteProjection(about.closest("[data-nse-appearance]")!);
    // The About alert correctly inerts its body siblings while both direct
    // portal specimens are mounted, so inspect the second portal as hidden.
    const preferences = screen.getByRole("dialog", { name: "Preferences", hidden: true });
    expectCompleteProjection(preferences.closest("[data-nse-appearance]")!);
  });

  it("retains native mixed checkbox state and exposes stable paint state", () => {
    render(<NSECheckbox label="Shared" state="mixed" disabled />);
    const input = screen.getByRole("checkbox", { name: "Shared" }) as HTMLInputElement;
    expect(input.indeterminate).toBe(true);
    expect(input.getAttribute("aria-checked")).toBe("mixed");
    expect(input.closest("label")?.getAttribute("data-state")).toBe("mixed");
    expect(input.closest("label")?.getAttribute("data-disabled")).toBe("true");
  });

  it("keeps native radio focus and exposes reachable disabled paint state", () => {
    render(
      <NSERadioGroup
        label="Mode"
        value="standard"
        options={[
          { value: "standard", label: "Standard" },
          { value: "locked", label: "Locked", disabled: true },
        ]}
      />,
    );
    const standard = screen.getByRole("radio", { name: "Standard" });
    const locked = screen.getByRole("radio", { name: "Locked" });
    standard.focus();
    expect(document.activeElement).toBe(standard);
    expect(standard.closest("label")?.getAttribute("data-disabled")).toBe("false");
    expect((locked as HTMLInputElement).disabled).toBe(true);
    expect(locked.closest("label")?.getAttribute("data-disabled")).toBe("true");
  });
});
