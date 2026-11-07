/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import React, { useEffect, useMemo } from "react";
import { useNSETreeController } from "../Controllers";
import { NSEOutlineView } from "../DataViews";

export interface OpenPanelSource { readonly id: string; readonly name: string; readonly locked?: boolean; readonly group?: boolean; readonly children?: readonly OpenPanelSource[] }
export function NSEOpenPanelSources({ id, groups, selectedId, onSelect }: { id: string; groups: readonly OpenPanelSource[]; selectedId: string | null; onSelect(id: string): void }) {
  const content = useMemo(() => groups.map(group => ({ ...group, group: true })), [groups]);
  const controller = useNSETreeController<OpenPanelSource, string>({ id, content, getId: item => item.id,
    getChildren: item => item.children ?? [], withChildren: (item, children) => ({ ...item, children }), selection: { mode: "single", allowsEmpty: true } });
  useEffect(() => { controller.setContent(content); for (const group of content) controller.expand(group.id); }, [content, controller]);
  useEffect(() => { controller.select(selectedId && controller.node(selectedId) ? [selectedId] : []); }, [content, controller, selectedId]);
  return <NSEOutlineView aria-label="Sources" controller={controller} selectionHighlightStyle="sourceList" selectionMode="single" viewportBlockSize="fill"
    idForItem={item => item.id} childrenForItem={item => item.children ?? []} labelForItem={item => item.name}
    isExpandable={item => !!item.group}
    onSelectionChange={({ reason, snapshot }) => { const id = [...snapshot.selectedIds][0]; if (id && reason !== "controller-change" && reason !== "pointer") onSelect(id); }}
    delegate={{ isGroupItem: (_id, item) => !!item.group, shouldShowOutlineCell: (_id, item) => !item.group,
      didActivate: (id, item) => { if (!item.group) onSelect(id); },
      renderItem: ({ item }) => item.group ? item.name : <span className="nse-open-source-label" onClick={event => { event.stopPropagation(); onSelect(item.id); }}><svg className="nse-open-source-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">{item.id === "add-folder" ? <path d="M8 3v10M3 8h10"/> : item.id.startsWith("media:") ? <><rect x="1.5" y="3" width="13" height="10" rx="1.5"/><path d="M2.5 12l3.5-4 3 3 2-2 2.5 3"/></> : <path d="M1 3h5l2 2h7v9H1z"/>}</svg><span>{item.name}</span>{item.locked ? <svg className="nse-open-source-lock" width="12" height="14" viewBox="0 0 12 14" role="img" aria-label="Needs permission" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="1.5" y="6" width="9" height="6.5" rx="1"/><path d="M3.5 6V4a2.5 2.5 0 015 0v2"/></svg> : null}</span>,
    }} />;
}
