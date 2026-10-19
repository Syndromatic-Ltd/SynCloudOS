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

import React, { useEffect, useMemo } from "react";

import { useNSEArrayController } from "../../../src/NSE/Controllers";
import { NSECollectionView, NSETable, createListCollectionLayout, type NSEDataViewAdapter, type NSETableColumn } from "../../../src/NSE/DataViews";

export interface AgendaEvent { readonly id: string; readonly title: string; readonly start: string; readonly calendar: string }

export function createAgendaRows(events: readonly AgendaEvent[]): readonly AgendaEvent[] {
  return Object.freeze([...events].sort((left, right) => left.start.localeCompare(right.start)).map((event) => Object.freeze({ ...event })));
}

export function AgendaDataViewFixture({ events, responsiveMode, onActivateEvent }: { readonly events: readonly AgendaEvent[]; readonly responsiveMode: "desktop" | "tablet" | "mobile"; readonly onActivateEvent?: (event: AgendaEvent) => void }) {
  const rows = useMemo(() => createAgendaRows(events), [events]);
  const controller = useNSEArrayController<AgendaEvent, string>({ id: "example-agenda", content: rows, getId: (event) => event.id, selection: { mode: "single", allowsEmpty: true, preservesSelection: true } });
  useEffect(() => { controller.setContent(rows); }, [controller, rows]);
  const adapter = useMemo<NSEDataViewAdapter<AgendaEvent, string>>(() => ({ controller, idForItem: (event) => event.id, labelForItem: (event) => event.title }), [controller]);
  const columns = useMemo<readonly NSETableColumn<AgendaEvent, string, unknown>[]>(() => [
    { id: "time", title: "Time", value: (event) => new Date(event.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), width: { min: 72, ideal: 90, max: 140 } },
    { id: "event", title: "Event", value: (event) => event.title, width: { min: 120, ideal: 260, max: 480 } },
    { id: "calendar", title: "Calendar", value: (event) => event.calendar, width: { min: 90, ideal: 140, max: 240 } },
  ], []);
  const state = rows.length === 0 ? { kind: "empty" as const, message: "No events" } : { kind: "ready" as const };
  return responsiveMode === "mobile"
    ? <NSECollectionView aria-label="Agenda cards" adapter={adapter} layout={createListCollectionLayout(52)} state={state} selectionMode="single" onActivate={(_id, event) => onActivateEvent?.(event)} renderItem={({ item }) => <span>{item.title} · {item.calendar}</span>} />
    : <NSETable aria-label="Agenda" adapter={adapter} columns={columns} state={state} selectionMode="single" onDoubleAction={(_id, event) => onActivateEvent?.(event)} />;
}
