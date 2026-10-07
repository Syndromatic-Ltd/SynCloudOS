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

import {
  Chronosphere, ChronosphereGridView, ChronosphereVortexView, createChronosphereAppSubject,
  type ChronosphereVersion, type ChronosphereViewComponent, type ChronosphereViewProps,
  type ChronosphereDetailRenderer, type ChronosphereFaceRenderer,
} from "@syndromatic/syncloudos/chronosphere";

type Detail = { readonly text: string; readonly author: string };
type Prepared = { readonly stars: number };
const entries: readonly ChronosphereVersion<Detail>[] = [
  { id: "draft-9", sequence: 9, title: "Draft", displayLabel: "1.9", dateLabel: "Yesterday", detail: { text: "Earlier", author: "Editor" } },
  { id: "draft-10", sequence: 10, savedAt: 2000, title: "Draft", displayLabel: "1.10", dateLabel: "Today", detail: { text: "Later", author: "Writer" } },
  { id: "live", sequence: 11, title: "Draft", dateLabel: "Now", isCurrent: true },
];
const subject = createChronosphereAppSubject("draft", "Draft", entries, { card: { aspectRatio: 0.75 } });
const face: ChronosphereFaceRenderer<Detail> = entry => <article>{entry.detail?.text}</article>;
const detail: ChronosphereDetailRenderer<Detail> = (entry, context) => <>
  <h2 id={context.titleId}>{entry.title}</h2><p id={context.bodyId}>{entry.detail?.author}</p>
</>;
const custom: ChronosphereViewComponent<Prepared, Detail> = Object.assign(
  ({ model, actions, renderFace, renderDetail }: ChronosphereViewProps<Prepared, Detail>) => <>
    <span>{model.prepared.stars}</span>
    {model.entries.map(entry => <button key={entry.id} onClick={() => actions.restore?.(entry)}>{entry.detail?.text}</button>)}
    {renderFace?.(model.entries[0], { active: true, detail: true, pane: "past" })}
    {renderDetail?.(model.entries[0], { titleId: "title", bodyId: "body" })}
  </>,
  { prepare: async () => ({ stars: 4 }) },
);

export const presentations = <>
  <Chronosphere subject={subject} view={ChronosphereGridView} renderFace={face} renderDetail={detail} onReturn={() => {}} onRestore={entry => { const text: string | undefined = entry.detail?.text; void text; }} />
  <Chronosphere subject={subject} view={ChronosphereVortexView} renderFace={face} renderDetail={detail} onReturn={() => {}} />
  <Chronosphere subject={subject} view={custom} renderFace={face} renderDetail={detail} onReturn={() => {}} />
</>;

// Negative declaration checks: narrative contracts have no public aliases.
// @ts-expect-error The old record name is intentionally removed.
type RemovedRecord = import("@syndromatic/syncloudos/chronosphere").ChronosphereArchiveEntry;
// @ts-expect-error The old museum status type is intentionally removed.
type RemovedStatus = import("@syndromatic/syncloudos/chronosphere").ChronosphereEntryStatus;
// @ts-expect-error Chronology comes from a numeric source, not a display label.
const badSequence: ChronosphereVersion = { id: "bad", sequence: "1.10", title: "Draft", dateLabel: "Today" };
// @ts-expect-error Application data stays typed through the subject and renderers.
const badDetail: ChronosphereVersion<Detail> = { id: "bad", sequence: 1, title: "Draft", dateLabel: "Today", detail: { text: 42, author: "Editor" } };
void [badSequence, badDetail];
