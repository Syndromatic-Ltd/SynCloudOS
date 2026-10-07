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

import { useEffect, useRef, useState } from "react";
import { NSEPane, NSEPushButton, NSEInputBox } from "../../NSE/public/inspector-controls";
import { translateSynWareText } from "../AppSDK/useSynWareLocalisedStrings";
import type { InspectorLocalization } from "./inspectorLocalization";
import "./inspector.css";
import { inspectorPanels, type InspectorClient, type InspectorLink, type InspectorPanel, type InspectorSnapshot } from "./inspectorTypes";

/** Host-owned dev surface. Only the already redacted read-only client enters React. */
export function InspectorView({ client, localization, pageSize = 25 }: { readonly client: InspectorClient; readonly localization?: InspectorLocalization; readonly pageSize?: number }) {
  const [locale, setLocale] = useState<ReturnType<InspectorLocalization["getSnapshot"]> | null>(null);
  const t: InspectorLocalization["t"] = (key, fallback, params) => {
    try { if (localization) return localization.t(key, fallback, params); } catch { /* Revoked locale authority. */ }
    return translateSynWareText("diagnostics", key, fallback, params);
  };
  const valueLabel = (group: string, value: string) => t(`inspector.${group}.${value}`, value);
  const [snapshot, setSnapshot] = useState<InspectorSnapshot | null>(() => { try { return client.getSnapshot(); } catch { return null; } });
  const [panel, setPanel] = useState<InspectorPanel>("Runtime");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [missing, setMissing] = useState(false);
  const focused = useRef<HTMLElement | null>(null);
  const navigation = useRef<HTMLElement | null>(null);
  const size = Number.isSafeInteger(pageSize) ? Math.max(1, Math.min(200, pageSize)) : 25;
  useEffect(() => {
    let active = true;
    const update = () => {
      if (!active) return;
      try { setSnapshot(client.getSnapshot()); } catch { setSnapshot(null); setContent(""); }
      setOffset(0);
    };
    update();
    let remove = () => {};
    try { remove = client.subscribe(update); } catch { setSnapshot(null); }
    return () => { active = false; remove(); };
  }, [client]);
  useEffect(() => { if (selected) focused.current?.focus(); }, [panel, selected]);
  useEffect(() => {
    if (!localization) { setLocale(null); return; }
    const update = () => { try { setLocale(localization.getSnapshot()); } catch { setLocale(null); } };
    update();
    try { return localization.subscribe(update); } catch { setLocale(null); }
  }, [localization]);
  if (!snapshot) return <p role="alert">{t("inspector.revoked", "Inspector access is revoked or unavailable.")}</p>;
  const section = snapshot.panels.find(value => value.id === panel)!;
  const matching = selected ? section.rows.filter(row => row.id === selected || row.links.some(link => link.relation === "correlation" && link.id === selected)) : section.rows;
  const rows = matching.slice(offset, offset + size);
  const select = (next: InspectorPanel) => { setPanel(next); setSelected(null); setOffset(0); setMissing(false); };
  const follow = (link: InspectorLink) => {
    const target = snapshot.panels.find(value => value.id === link.panel)!;
    const exists = target.rows.some(row => row.id === link.id || row.links.some(candidate => candidate.relation === "correlation" && candidate.id === link.id));
    setPanel(link.panel); setSelected(link.id); setOffset(0); setMissing(!exists);
  };
  const capture = () => {
    try { if (snapshot.capture.status === "paused") client.resume(); else client.pause(); setSnapshot(client.getSnapshot()); }
    catch { setSnapshot(null); setContent(""); }
  };
  const title = t("inspector.title", "Development Inspector");
  return <NSEPane as="section" variant="inspector" title={title} aria-label={title} className="syncloudos-inspector" lang={locale?.locale} dir={locale?.direction}>
    <p role="status">{t("inspector.capture.summary", "Capture {status}. {retained} notices retained; {dropped} dropped; {skipped} skipped while paused.", { status: valueLabel("capture", snapshot.capture.status), retained: snapshot.capture.retained, dropped: snapshot.capture.dropped, skipped: snapshot.capture.skipped })}</p>
    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
      <NSEPushButton onClick={capture}>{snapshot.capture.status === "paused" ? t("inspector.capture.resume", "Resume capture") : t("inspector.capture.pause", "Pause capture")}</NSEPushButton>
      <NSEPushButton onClick={() => { try { setContent(client.exportSnapshot(snapshot).content); } catch { setSnapshot(null); setContent(""); } }}>{t("inspector.export", "Export sanitized snapshot")}</NSEPushButton>
    </div>
    <nav ref={navigation} aria-label={t("inspector.views", "Inspector views")} className="syncloudos-inspector__navigation" onKeyDown={event => {
      const buttons = Array.from(navigation.current?.querySelectorAll("button") ?? []);
      const index = buttons.indexOf(event.target as HTMLButtonElement);
      if (index < 0) return;
      const forward = locale?.direction === "rtl" ? "ArrowLeft" : "ArrowRight";
      const backward = locale?.direction === "rtl" ? "ArrowRight" : "ArrowLeft";
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : event.key === forward ? (index + 1) % buttons.length : event.key === backward ? (index + buttons.length - 1) % buttons.length : -1;
      if (next >= 0) { event.preventDefault(); buttons[next]?.focus(); }
    }}>
      {inspectorPanels.map(id => <NSEPushButton key={id} selected={panel === id} aria-pressed={panel === id} onClick={() => select(id)}>{valueLabel("panels", id)}</NSEPushButton>)}
    </nav>
    <h3>{valueLabel("panels", panel)}</h3>
    {section.status === "unsupported" && <p>{t("inspector.unsupported", "Unsupported by this owner. No introspection is available.")}</p>}
    {section.status === "unavailable" && <p role="alert">{t("inspector.unavailable", "The owner could not provide inspection data.")}</p>}
    {missing && <p role="status">{t("inspector.missing", "Owner record is not available in retained inspection data.")}</p>}
    {selected && <NSEPushButton onClick={() => { setSelected(null); setMissing(false); }}>{t("inspector.showAll", "Show all records")}</NSEPushButton>}
    <p>{t("inspector.records", "{count} records; {omitted} historical records omitted.", { count: matching.length, omitted: section.omittedHistory })}</p>
    {rows.map((row, index) => <article key={`${row.id}:${index}`} tabIndex={-1} aria-label={`${valueLabel("kind", row.kind)} ${row.id}`} ref={index === 0 ? focused : undefined} className="syncloudos-inspector__record">
      <NSEPane as="div" variant="surface">
      <h4>{valueLabel("kind", row.kind)} <small>{row.id}</small></h4>
      <dl><dt>{t("inspector.status", "Status")}</dt><dd data-inspector-status={row.status}>{valueLabel("status", row.status)}</dd><dt>{t("inspector.phase", "Phase")}</dt><dd>{valueLabel("phase", row.phase)}</dd>
        {row.startedAt !== undefined && <><dt>{t("inspector.started", "Started")}</dt><dd>{row.startedAt}</dd></>}
        {row.revision !== undefined && <><dt>{t("inspector.revision", "Revision")}</dt><dd>{row.revision}</dd></>}
        {row.parameterCount !== undefined && <><dt>{t("inspector.parameters", "Redacted parameters")}</dt><dd>{row.parameterCount}</dd></>}
        {row.queryCount !== undefined && <><dt>{t("inspector.query", "Redacted query fields")}</dt><dd>{row.queryCount}</dd></>}
      </dl>
      {row.pendingRoles.length > 0 && <p>{t("inspector.awaiting", "Awaiting: {roles}", { roles: row.pendingRoles.map(role => valueLabel("role", role)).join(", ") })}</p>}
      <div className="syncloudos-inspector__actions">{row.links.map(link => <NSEPushButton key={`${link.relation}:${link.id}`} onClick={() => follow(link)}>{valueLabel("relation", link.relation)}: {link.id}</NSEPushButton>)}</div>
      </NSEPane>
    </article>)}
    <div style={{ display: "flex", gap: "0.5rem" }}>
      <NSEPushButton disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - size))}>{t("inspector.previousPage", "Previous page")}</NSEPushButton>
      <NSEPushButton disabled={offset + size >= matching.length} onClick={() => setOffset(offset + size)}>{t("inspector.nextPage", "Next page")}</NSEPushButton>
    </div>
    {content && <NSEInputBox><label className="syncloudos-inspector__export">{t("inspector.snapshotJSON", "Sanitized snapshot JSON")}<textarea readOnly value={content} /></label></NSEInputBox>}
  </NSEPane>;
}
