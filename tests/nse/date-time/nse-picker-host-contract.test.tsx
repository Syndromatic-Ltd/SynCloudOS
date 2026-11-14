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
import { DateEntry } from "../../../src/NSE/DateTime/Pickers/dateEntry";
import { TimeEntry } from "../../../src/NSE/DateTime/Pickers/timeEntry";

afterEach(cleanup);

describe("canonical picker host and editor contracts", () => {
  it.each(["date", "time"])("forwards %s host attributes and composes focus handlers", (kind) => {
    const focus = vi.fn();
    const blur = vi.fn();
    const props = {
      "aria-label": "Civil value", locale: "en-GB", timeZone: "Europe/London",
      editor: "segments" as const, id: "civil-host", className: "consumer-picker",
      "data-consumer": "civil", title: "Civil editor", onFocusCapture: focus, onBlurCapture: blur,
    };
    const view = render(kind === "date" ? <DateEntry {...props} mode="text" /> : <TimeEntry {...props} />);
    const host = view.container.querySelector<HTMLElement>("#civil-host")!;
    expect(host).not.toBeNull();
    expect(host.classList.contains("consumer-picker")).toBe(true);
    expect(host.dataset.consumer).toBe("civil");
    expect(host.getAttribute("title")).toBe("Civil editor");
    expect(host.hasAttribute("locale")).toBe(false);
    expect(host.hasAttribute("editor")).toBe(false);
    const field = screen.getAllByRole("combobox")[0]!;
    fireEvent.focus(field);
    expect(focus).toHaveBeenCalledOnce();
    fireEvent.blur(field);
    expect(blur).toHaveBeenCalledOnce();
  });

  it.each([{ isEnabled: false }, { readOnly: true }])("rejects segment commits while gated by %o", (gate) => {
    const change = vi.fn();
    render(<TimeEntry aria-label="Time" locale="en-GB" timeZone="Europe/London"
      defaultValue={{ hour: 13, minute: 30, second: 0 }} editor="segments"
      {...gate} onValueChange={change} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Minute" }), { target: { value: "45" } });
    expect(change).not.toHaveBeenCalled();
  });

  it("allows a custom editor to clear an optional time but protects required and gated values", () => {
    const change = vi.fn();
    const props = {
      "aria-label": "Time", locale: "en-GB", timeZone: "Europe/London", name: "time",
      defaultValue: { hour: 13, minute: 30, second: 0 }, onValueChange: change,
      renderEditor: ({ commit }: { commit(value: null): void }) => <button onClick={() => commit(null)}>Clear</button>,
    };
    const view = render(<TimeEntry {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(change).toHaveBeenCalledWith(null, "commit");
    expect(view.container.querySelector<HTMLInputElement>('input[name="time"]')!.value).toBe("");
    for (const gate of [{ required: true }, { isEnabled: false }, { readOnly: true }]) {
      change.mockClear();
      view.rerender(<TimeEntry {...props} {...gate} />);
      fireEvent.click(screen.getByRole("button", { name: "Clear" }));
      expect(change).not.toHaveBeenCalled();
    }
  });
});
