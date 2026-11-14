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
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StandaloneControlHost } from "../../../src/NSE/Overlays";
import { NSEPopUpButton } from "../../../src/NSE/Menus";
import { createStaticPresentationPort } from "../../fixtures/presentationTraits";
import { installNSEScrollIntoViewFixture } from "../fixtures/browser";

installNSEScrollIntoViewFixture();
const presentation = createStaticPresentationPort({ width: 1024, height: 768 });
afterEach(async () => { cleanup(); await act(async () => {}); vi.restoreAllMocks(); });

function desktop(matches: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
    matches: matches && query.includes("hover: hover"), media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  }) as MediaQueryList);
}

function Picker({ onValueChange }: { readonly onValueChange?: (value: string) => void }) {
  return <StandaloneControlHost document={document} window={window} presentation={presentation}>
    <NSEPopUpButton label="Page" items={[{ value: "paper", title: "Journal Paper" }, { value: "white", title: "White Page" }]} onValueChange={onValueChange} />
  </StandaloneControlHost>;
}

it("flashes the chosen row, then chooses it and fades the list out (desktop)", async () => {
  if (!window.matchMedia) Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: () => null });
  desktop(true);
  const onValueChange = vi.fn();
  render(<Picker onValueChange={onValueChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Page Journal Paper" }));
  const row = await screen.findByRole("option", { name: "White Page" });
  fireEvent.click(row);
  // Highlighted, unhighlighted, highlighted again; only then is the value chosen.
  expect(row.dataset.nseMenuFlash).toBe("off");
  expect(onValueChange).not.toHaveBeenCalled();
  await waitFor(() => expect(row.dataset.nseMenuFlash).toBe("on"));
  await waitFor(() => expect(onValueChange).toHaveBeenCalledWith("white"));
  // The list stays mounted while it fades, marked chosen, then goes.
  const popup = document.querySelector(".nse-overlay-popup--listbox") as HTMLElement;
  expect(popup.hasAttribute("data-nse-menu-chosen")).toBe(true);
  expect(popup.dataset.state).toBe("closing");
  await waitFor(() => expect(document.querySelector(".nse-overlay-popup--listbox")).toBeNull());
});

it("chooses at once with no flash or fade off a desktop", async () => {
  if (!window.matchMedia) Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: () => null });
  desktop(false);
  const onValueChange = vi.fn();
  render(<Picker onValueChange={onValueChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Page Journal Paper" }));
  const row = await screen.findByRole("option", { name: "White Page" });
  fireEvent.click(row);
  expect(onValueChange).toHaveBeenCalledWith("white");
  expect(row.dataset.nseMenuFlash).toBeUndefined();
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
});

it("closes an open list when its own button is pressed, rather than closing and reopening it", async () => {
  render(<Picker />);
  const button = screen.getByRole("button", { name: "Page Journal Paper" });
  fireEvent.click(button);
  await screen.findByRole("listbox");
  // A press focuses the button before its click lands.
  fireEvent.pointerDown(button, { button: 0 });
  act(() => { button.focus(); });
  fireEvent.click(button);
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  expect(button.getAttribute("aria-expanded")).toBe("false");
});

it("moves the highlight with the pointer, off the previously chosen row", async () => {
  render(<Picker />);
  fireEvent.click(screen.getByRole("button", { name: "Page Journal Paper" }));
  const chosen = await screen.findByRole("option", { name: "Journal Paper" });
  const other = screen.getByRole("option", { name: "White Page" });
  await waitFor(() => expect(chosen.dataset.highlighted).toBe("true"));
  fireEvent.mouseMove(other);
  expect(other.dataset.highlighted).toBe("true");
  expect(chosen.dataset.highlighted).toBeUndefined();
  // The chosen row keeps its check (aria-selected), just not the highlight.
  expect(chosen.getAttribute("aria-selected")).toBe("true");
});
