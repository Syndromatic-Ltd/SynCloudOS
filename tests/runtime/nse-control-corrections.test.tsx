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

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MenuView } from "../../src/NSE/Menus/MenuView";
import {
  NSEImageView,
} from "../../src/NSE/public/controls";
import { ToolbarView as NSEToolbar } from "../../src/NSE/Toolbars/ToolbarView";
import { StandaloneControlHost } from "../../src/NSE/Overlays";
import { createStaticPresentationPort } from "../fixtures/presentationTraits";

const presentation = createStaticPresentationPort({ width: 1024, height: 768 });
function Host({ children }: React.PropsWithChildren) {
  return <StandaloneControlHost document={document} window={window} presentation={presentation}>{children}</StandaloneControlHost>;
}

afterEach(() => {
  cleanup();
});

describe("NSEMenu sub-item disclosure", () => {
  it("renders a semantic submenu indicator without literal chevron text", async () => {
    render(
      <Host><MenuView
        label="File"
        defaultOpen
        items={[{ value: "recent", label: "Open recent", children: [{ value: "a", label: "A.txt" }] }]}
      /></Host>
    );
    // The menu items render through a portal into document.body, not the render container.
    const row = await screen.findByRole("menuitem", { name: "Open recent" });
    const indicator = row.querySelector('[data-nse-part="submenu-arrow"]');
    expect(indicator).not.toBeNull();
    // The old implementation injected a literal "›" text node; the sprite version has no text content.
    expect(indicator?.textContent).toBe("");
  });
});

describe("NSEImageView imageScaling", () => {
  it("fits by default and shows the natural size with imageScaling none (NSImageView.imageScaling)", () => {
    const { container } = render(<><NSEImageView src="/x.png" alt="fitted" /><NSEImageView src="/x.png" alt="natural" imageScaling="none" controls={false} /></>);
    const views = container.querySelectorAll(".nse-control-image-view");
    expect(views[0]?.getAttribute("data-image-scaling")).toBe("proportionallyUpOrDown");
    expect(views[1]?.getAttribute("data-image-scaling")).toBe("none");
    expect(views[1]?.querySelector(".nse-control-image-view-controls")).toBeNull();
  });
});

describe("NSEToolbar fadeOnKeyboard", () => {
  it("does not add the fade class for a non-text focus when enabled", () => {
    const { container } = render(
      <NSEToolbar composition="children" fadeOnKeyboard>
        <button type="button">Action</button>
      </NSEToolbar>
    );
    const toolbar = container.querySelector(".nse-control-toolbar") as HTMLElement;
    expect(toolbar.getAttribute("data-fade-on-keyboard")).toBe("true");

    const button = container.querySelector("button") as HTMLButtonElement;
    act(() => {
      button.focus();
      fireEvent.focusIn(button);
    });
    expect(toolbar.classList.contains("nse-control-toolbar-fade-in")).toBe(false);
  });

  it("re-fades while a text field is focused, then clears when focus leaves", () => {
    const { container } = render(
      <div>
        <NSEToolbar composition="children" fadeOnKeyboard>
          <button type="button">Action</button>
        </NSEToolbar>
        <input type="text" aria-label="entry" />
      </div>
    );
    const toolbar = container.querySelector(".nse-control-toolbar") as HTMLElement;
    const field = container.querySelector("input") as HTMLInputElement;

    act(() => {
      field.focus();
      fireEvent.focusIn(field, { target: field });
    });
    expect(toolbar.classList.contains("nse-control-toolbar-fade-in")).toBe(true);
  });

  it("stays inert when fadeOnKeyboard is off", () => {
    const { container } = render(
      <NSEToolbar composition="children">
        <input type="text" aria-label="entry" />
      </NSEToolbar>
    );
    const toolbar = container.querySelector(".nse-control-toolbar") as HTMLElement;
    expect(toolbar.getAttribute("data-fade-on-keyboard")).toBeNull();
    const field = container.querySelector("input") as HTMLInputElement;
    act(() => {
      field.focus();
      fireEvent.focusIn(field, { target: field });
    });
    expect(toolbar.classList.contains("nse-control-toolbar-fade-in")).toBe(false);
  });
});
