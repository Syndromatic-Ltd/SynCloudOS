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

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { NSETopBar, nseTopBarStyles } from "../../src/NSE/Windows/Chrome";
import type { NSETopBarItem, NSETopBarVariant } from "../../src/NSE/Windows/Chrome";

afterEach(cleanup);

const variants: Array<{ variant: NSETopBarVariant; glyph: string }> = [
  { variant: "continuous", glyph: ".nse-app-topbar-button-icon" },
  { variant: "rail-aligned", glyph: ".nse-app-topbar-rail-aligned-pill-glyph" }
];

function maskOf(button: HTMLElement, glyphSelector: string): string | null {
  const glyph = button.querySelector<HTMLElement>(glyphSelector);
  return glyph ? glyph.style.getPropertyValue("--nse-app-topbar-glyph") : null;
}

function renderBar(variant: NSETopBarVariant, item: NSETopBarItem) {
  return render(<NSETopBar title="App" variant={variant} leadingItems={[item]} />);
}

describe.each(variants)("NSETopBar glyphs ($variant)", ({ variant, glyph }) => {
  it("masks the item's own icon URL for a webspring item", () => {
    renderBar(variant, { kind: "webspring", label: "Home", icon: "/brand/home.svg" });
    expect(maskOf(screen.getByRole("button", { name: "Home" }), glyph)).toBe('url("/brand/home.svg")');
  });

  it("falls back to the built-in house when a webspring item has no icon", () => {
    renderBar(variant, { kind: "webspring", label: "Home" });
    const builtIn = nseTopBarStyles.continuous.icons.webspring!;
    expect(builtIn).toEqual(expect.any(String));
    expect(maskOf(screen.getByRole("button", { name: "Home" }), glyph)).toBe(`url(${JSON.stringify(builtIn)})`);
  });

  it("masks a custom item's icon and draws nothing for a custom item without one", () => {
    cleanup();
    render(<NSETopBar title="App" variant={variant} trailingItems={[
      { kind: "custom", label: "With icon", icon: "/art/tool.svg" },
      { kind: "custom", label: "Bare" }
    ]} />);
    expect(maskOf(screen.getByRole("button", { name: "With icon" }), glyph)).toBe('url("/art/tool.svg")');
    expect(maskOf(screen.getByRole("button", { name: "Bare" }), glyph)).toBeNull();
  });

  it("reports selected, disabled and menu state on the button", () => {
    renderBar(variant, { kind: "userInfo", label: "Account", selected: true, opensMenu: true });
    const open = screen.getByRole("button", { name: "Account" });
    expect(open.getAttribute("aria-haspopup")).toBe("menu");
    expect(open.getAttribute("aria-expanded")).toBe("true");
    expect(open.getAttribute("data-selected")).toBe("true");

    cleanup();
    renderBar(variant, { kind: "settings", label: "Settings", disabled: true });
    const disabled = screen.getByRole("button", { name: "Settings" }) as HTMLButtonElement;
    expect(disabled.disabled).toBe(true);
    expect(disabled.getAttribute("data-selected")).toBe("false");
    expect(disabled.getAttribute("aria-expanded")).toBeNull();
  });
});
