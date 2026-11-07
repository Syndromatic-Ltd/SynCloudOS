/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import React, { useEffect, useMemo } from "react";
import { useNSETreeController } from "../Controllers";
import { NSEOutlineView } from "../DataViews";
import { NSEImageView } from "../Controls/Images/NSEImage";
import { NSEWorkspace } from "../Application/NSEWorkspace";

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
      renderItem: ({ item }) => item.group ? item.name.toLocaleUpperCase() : <span className="nse-open-source-label" onClick={event => { event.stopPropagation(); onSelect(item.id); }}>
        <NSEImageView className="nse-open-source-icon" src={NSEWorkspace.shared.iconForFile({ name: item.name, kind: "directory" }, 24)} controls={false} wheelZoom={false} pannable={false} alt="" />
        <span>{item.name}</span>{item.locked ? <span className="nse-open-source-lock" role="img" aria-label="Needs permission" title="Needs permission">Access required</span> : null}</span>,
    }} />;
}
