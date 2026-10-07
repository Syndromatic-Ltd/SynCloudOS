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
import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSESidebar, NSESourceListScene, SourceListFrameProvider, type SourceListFrameContextValue } from "../../src/NSE/Navigation/SourceList";
import { defineNSEAppearance, NSEAppearanceProvider } from "../../src/NSE/Appearance";

afterEach(cleanup);

describe("source-list chrome ownership", () => {
  it("honours an explicit appearance override inside a differently themed frame", () => {
    const frame: SourceListFrameContextValue = { railWidth: 254, defaultWidth: 254, minWidth: 220, maxWidth: 320, setRailWidth: vi.fn(), railLabel: "Gallery", scheme: "dark", setBarTitle: vi.fn() };
    const view = render(<SourceListFrameProvider value={frame}>
      <NSEAppearanceProvider appearance={defineNSEAppearance({ id: "atmo", displayName: "Atmo" })} colourScheme="light">
        <NSESourceListScene sidebar={<p>Rows</p>}><p>Light content</p></NSESourceListScene>
      </NSEAppearanceProvider>
    </SourceListFrameProvider>);
    expect(view.container.querySelector('.nse-source-list-scene')?.getAttribute('data-mode')).toBe("light");
  });

  it("collapses sidebar sections by default and keeps explicitly controlled sections with their caller", () => {
    const sections = [{ id: "controls", label: "Controls", items: [{ id: "buttons", label: "Buttons" }] }];
    const view = render(<NSESidebar sections={sections} />);
    const toggle = screen.getByRole("button", { name: "Toggle sidebar section" });
    fireEvent.click(toggle);
    expect(view.container.querySelector('.nse-sidebar-section')?.getAttribute('data-collapsed')).toBe("true");
    expect(view.container.querySelector('.nse-sidebar-section-items')?.hasAttribute('inert')).toBe(true);
    fireEvent.click(toggle);
    expect(view.container.querySelector('.nse-sidebar-section')?.getAttribute('data-collapsed')).toBe("false");
    const onToggle = vi.fn();
    view.rerender(<NSESidebar sections={sections} collapsedSectionIds={[]} onToggleSection={onToggle} />);
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledWith(sections[0]);
    expect(view.container.querySelector('.nse-sidebar-section')?.getAttribute('data-collapsed')).toBe("false");
    view.rerender(<NSESidebar sections={sections} collapsedSectionIds={["controls"]} onToggleSection={onToggle} />);
    expect(view.container.querySelector('.nse-sidebar-section')?.getAttribute('data-collapsed')).toBe("true");
  });
  it("places a floating header inside the row scroll surface without a second material owner", () => {
    const view = render(<NSESidebar surface="metal" header={<input aria-label="Find sections" />} sections={[{ id: "sections", items: [{ id: "buttons", label: "Buttons" }] }]} />);
    const scroll = view.container.querySelector(".nse-sidebar-scroll")!;
    const header = view.container.querySelector(".nse-sidebar-header")!;
    expect(header).not.toBeNull();
    expect(header.parentElement).toBe(scroll);
    expect(scroll.contains(screen.getByRole("button", { name: "Buttons" }))).toBe(true);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Button" } });
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Button");
    expect(view.container.querySelectorAll('.nse-sidebar[data-surface="metal"]')).toHaveLength(1);
    screen.getByRole("textbox").focus();
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Home" });
    expect(document.activeElement).toBe(screen.getByRole("textbox"));
  });

  it("uses the frame width for its sole split footer and retains the content when compact", () => {
    const setBarTitle = vi.fn();
    const frame: SourceListFrameContextValue = { railWidth: 254, defaultWidth: 254, minWidth: 220, maxWidth: 320, setRailWidth: vi.fn(), railLabel: "Gallery", scheme: "dark", setBarTitle };
    const fixture = (compact: boolean, railWidth: number) => <SourceListFrameProvider value={{ ...frame, railWidth }}><NSESourceListScene compact={compact} title="Buttons" sidebar={<p>Rows</p>} status={{ rail: "25 sections", leading: "Ready" }}><input aria-label="Retained draft" defaultValue="Draft" /></NSESourceListScene></SourceListFrameProvider>;
    const view = render(fixture(false, 254));
    const draft = screen.getByRole("textbox");
    fireEvent.change(draft, { target: { value: "Edited draft" } });
    expect(view.container.querySelectorAll("footer")).toHaveLength(1);
    const footer = view.container.querySelector<HTMLElement>(".nse-statusbar")!;
    expect(footer.style.getPropertyValue("--nse-app-topbar-rail")).toBe("254px");
    expect(footer.querySelector(".nse-statusbar-metal-rail-content")?.textContent).toBe("25 sections");
    expect(setBarTitle).toHaveBeenCalledWith("Buttons");
    view.rerender(fixture(true, 254));
    expect(view.container.querySelector("footer")).toBeNull();
    expect(view.container.querySelector('.nse-source-list-scene')?.getAttribute('data-navigation-compact')).toBe("true");
    expect(screen.getByRole("textbox")).toBe(draft);
    expect((draft as HTMLInputElement).value).toBe("Edited draft");
    view.rerender(fixture(false, 300));
    expect(view.container.querySelector<HTMLElement>(".nse-statusbar")?.style.getPropertyValue("--nse-app-topbar-rail")).toBe("300px");
  });
});
