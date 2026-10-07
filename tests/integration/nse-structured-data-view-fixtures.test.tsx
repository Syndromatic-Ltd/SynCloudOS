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

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React, { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DiagnosticsDataViewFixture, createDiagnosticsRows } from "../fixtures/data-views/DiagnosticsDataViewFixture";
import { AgendaDataViewFixture, createAgendaRows } from "../fixtures/data-views/AgendaDataViewFixture";

afterEach(cleanup);

describe("structured data-view fixtures", () => {
  it("projects diagnostic hierarchy and copy-safe scalar table rows with stable IDs", () => {
    const records = [{ id: "cpu", label: "CPU", value: 42, children: [{ id: "core-0", label: "Core 0", value: null, children: [] }] }];
    expect(createDiagnosticsRows(records).map(({ id, valueText }) => [id, valueText])).toEqual([["cpu", "42"], ["core-0", "null"]]);
    render(<StrictMode><DiagnosticsDataViewFixture records={records} /></StrictMode>);
    expect(screen.getByRole("tree", { name: "Diagnostics" })).not.toBeNull();
    expect(screen.getByRole("grid", { name: "Diagnostic values" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand CPU" }));
    expect(screen.getByRole("treeitem", { name: "Core 0" })).not.toBeNull();
  });

  it("formats hostile diagnostic values without throwing", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(createDiagnosticsRows([
      { id: "cycle", label: "Cycle", value: cyclic, children: [] },
      { id: "big", label: "Big", value: 42n, children: [] },
    ]).map(({ valueText }) => valueText)).toEqual(['{"self":"[Circular]"}', "42"]);
  });

  it("formats hostile primitive, JSON and accessor traps without invoking them", () => {
    const primitive = vi.fn(() => { throw new Error("primitive trap"); });
    const toJSON = vi.fn(() => { throw new Error("json trap"); });
    const getter = vi.fn(() => { throw new Error("getter trap"); });
    const accessor: Record<string, unknown> = {};
    Object.defineProperty(accessor, "secret", { enumerable: true, get: getter });
    expect(() => createDiagnosticsRows([
      { id: "primitive", label: "Primitive", value: { [Symbol.toPrimitive]: primitive }, children: [] },
      { id: "json", label: "JSON", value: { toJSON }, children: [] },
      { id: "accessor", label: "Accessor", value: accessor, children: [] },
    ])).not.toThrow();
    expect(primitive).not.toHaveBeenCalled();
    expect(toJSON).not.toHaveBeenCalled();
    expect(getter).not.toHaveBeenCalled();
  });

  it("announces diagnostic denied/error states", () => {
    const view = render(<DiagnosticsDataViewFixture records={[]} state={{ kind: "denied", message: "Access denied" }} />);
    expect(screen.getAllByText("Access denied").length).toBeGreaterThan(0);
    view.rerender(<DiagnosticsDataViewFixture records={[]} state={{ kind: "error", message: "Probe failed" }} />);
    expect(screen.getAllByText("Probe failed").length).toBeGreaterThan(0);
  });

  it("sorts agenda rows chronologically and preserves stable selection/activation across updates", async () => {
    const events = [
      { id: "later", title: "Later", start: "2026-08-12T12:00:00Z", calendar: "Work" },
      { id: "early", title: "Early", start: "2026-08-12T09:00:00Z", calendar: "Home" },
    ];
    expect(createAgendaRows(events).map(({ id }) => id)).toEqual(["early", "later"]);
    const activate = vi.fn();
    const view = render(<AgendaDataViewFixture events={events} responsiveMode="desktop" onActivateEvent={activate} />);
    fireEvent.click(screen.getByRole("gridcell", { name: "Early" }));
    view.rerender(<AgendaDataViewFixture events={[{ ...events[1]!, title: "Early updated" }, events[0]!]} responsiveMode="desktop" onActivateEvent={activate} />);
    const row = await screen.findByRole("row", { name: /Early updated/ });
    expect(row.getAttribute("aria-selected")).toBe("true");
    fireEvent.doubleClick(screen.getByRole("gridcell", { name: "Early updated" }));
    expect(activate).toHaveBeenCalledWith(expect.objectContaining({ id: "early" }));
  });

  it("uses the injected compact collection fallback and empty state", () => {
    const events = [{ id: "event", title: "Event", start: "2026-08-12T09:00:00Z", calendar: "Work" }];
    const view = render(<AgendaDataViewFixture events={events} responsiveMode="mobile" />);
    expect(screen.getByRole("grid", { name: "Agenda cards" }).getAttribute("data-nse-control")).toBe("collection-view");
    view.rerender(<AgendaDataViewFixture events={[]} responsiveMode="mobile" />);
    expect(screen.getByText("No events")).not.toBeNull();
  });
});
