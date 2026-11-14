/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import React, { useEffect, useId, useMemo } from "react";
import { useNSEArrayController } from "../Controllers";
import { NSECollectionView, createAdaptiveCollectionLayout, type NSEDataViewAdapter } from "../DataViews";
import type { FilePanelDirectory } from "../../SynCloudOS/nseRuntimeContracts";
import type { FilePanelFileHandle } from "../../SynCloudOS/nseRuntimeContracts";
import type { MediaPanelItem } from "../../SynCloudOS/nseRuntimeContracts";
import type { OpenPanelImagePort } from "./openPanelHost";
import { OpenPanelItemImage } from "./NSEOpenPanelItemImage";

export interface OpenPanelItem { readonly id: string; readonly name: string; readonly kind: "file" | "directory" | "media"; readonly handle?: FilePanelDirectory | FilePanelFileHandle; readonly media?: MediaPanelItem }
export function OpenPanelCollection({ items, selectedIds, multiple, compact, width, height, title, images, onSelect, onActivate }: {
  items: readonly OpenPanelItem[]; selectedIds: ReadonlySet<string>; multiple: boolean; compact: boolean; width: number; height: number; title: string;
  images?: OpenPanelImagePort;
  onSelect(ids: ReadonlySet<string>): void; onActivate(item: OpenPanelItem): void;
}) {
  const id = useId();
  const displayed = useMemo(() => items.map(item => ({ id: item.id, name: item.name, kind: item.kind })), [items]);
  type DisplayItem = (typeof displayed)[number];
  const controller = useNSEArrayController<DisplayItem, string>({ id: `open-panel:${id}`, content: displayed, getId: item => item.id, selection: { mode: multiple ? "multiple" : "single", allowsEmpty: true } }, [multiple]);
  useEffect(() => { controller.setContent(displayed); controller.select(new Set([...selectedIds].filter(id => items.some(item => item.id === id)))); }, [controller, displayed, items, selectedIds]);
  const adapter = useMemo<NSEDataViewAdapter<DisplayItem, string>>(() => ({ controller, idForItem: item => item.id, labelForItem: item => item.name }), [controller]);
  const columns = compact ? 3 : Math.max(1, Math.min(5, Math.floor(width / 100)));
  const gap = compact ? 8 : 12;
  const itemWidth = Math.max(1, (width - gap * (columns - 1)) / columns);
  const picturesOnly = compact && displayed.every(item => item.kind === "media");
  const layout = useMemo(() => createAdaptiveCollectionLayout({ itemSize: { inline: itemWidth, block: compact ? itemWidth + (picturesOnly ? 0 : 26) : 92 }, minimumGap: gap }), [compact, gap, itemWidth, picturesOnly]);
  return <NSECollectionView aria-label={title} className="nse-open-collection" adapter={adapter} layout={layout} viewportInlineSize={width} viewportBlockSize={height}
    selectionMode={multiple ? "multiple" : "single"} pointerActivation={compact ? "single-click" : "double-click"}
    onSelectionChange={({ snapshot }) => onSelect(snapshot.selectedIds)} onActivate={(id) => { const item = items.find(item => item.id === id); if (item && (!compact || item.kind === "directory")) onActivate(item); }}
    renderItem={({ item, selected }) => <div className="nse-open-item" data-kind={item.kind} data-selected={selected || undefined}>
      <div className="nse-open-item-picture">{items.some(source => source.id === item.id) ? <OpenPanelItemImage item={items.find(source => source.id === item.id)!} images={images} /> : null}</div>
      <span className="nse-open-item-name">{item.name}</span>
    </div>} />;
}
