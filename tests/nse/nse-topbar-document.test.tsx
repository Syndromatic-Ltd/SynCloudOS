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
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSETopBar } from "../../src/NSE/Windows/Chrome/NSETopBar";

afterEach(cleanup);

describe("NSETopBar document window placement", () => {
  it("sets the app title beside the return control and the document in the middle", () => {
    const toggle = vi.fn();
    const { container } = render(<NSETopBar
      variant="rail-aligned" scheme="dark" title="Publisher" titlePlacement="leading"
      titleAction={{ label: "Switch apps", onClick: toggle }}
      leadingItems={[{ kind: "webspring", label: "Return to Webspring" }]}
      trailingItems={[{ kind: "settings", label: "Settings" }]}
      center={<span>My post</span>}
    />);
    const leading = container.querySelector(".nse-app-topbar-rail-aligned-leading")!;
    expect([...leading.children].map(child => child.tagName)).toEqual(["BUTTON", "H1"]);
    expect(leading.querySelector(".nse-app-topbar-rail-aligned-leading-title")?.textContent).toBe("Publisher");
    expect(container.querySelector(".nse-app-topbar-rail-aligned-centre")?.textContent).toBe("My post");
    expect(container.querySelector("[data-title-placement]")?.getAttribute("data-title-placement")).toBe("leading");
    fireEvent.click(screen.getByRole("button", { name: "Switch apps" }));
    expect(toggle).toHaveBeenCalledOnce();
    expect(container.querySelectorAll(".nse-app-topbar-rail-aligned-pill-glyph")).toHaveLength(2);
  });

  it("keeps the centred title by default", () => {
    const { container } = render(<NSETopBar variant="rail-aligned" title="Software" />);
    expect(container.querySelector(".nse-app-topbar-rail-aligned-leading-title")).toBeNull();
    expect(container.querySelector("h1.nse-app-topbar-rail-aligned-title")?.textContent).toBe("Software");
  });

  it("draws a settings item on the Cumulus bar from its own icon", () => {
    const { container } = render(<NSETopBar title="App" trailingItems={[{ kind: "settings", label: "Settings", icon: "/gear.svg" }]} />);
    const glyph = container.querySelector<HTMLElement>(".nse-app-topbar-button-icon")!;
    expect(glyph.style.getPropertyValue("--nse-app-topbar-glyph")).toBe('url("/gear.svg")');
  });
});
