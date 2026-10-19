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

import { useEffect, useId, useMemo } from "react";

import { useNSEArrayController } from "../Controllers";
import { NSECollectionView, createAdaptiveCollectionLayout, type NSEDataViewAdapter } from "../DataViews";
import type { MediaPanelItem } from "../../SynCloudOS/SynCloudOS";
import { encodeOpaqueIdentity } from "../../SynCloudOS/nseRuntimeContracts";

export type MediaCollectionSelectionMode = "single" | "multiple";

export interface MediaCollectionPresenterProps {
  readonly items: readonly MediaPanelItem[];
  readonly selectedIds: ReadonlySet<string>;
  readonly selection: MediaCollectionSelectionMode;
  readonly direction: "ltr" | "rtl";
  onSelectionChange(ids: ReadonlySet<string>): void;
  onActivate(item: MediaPanelItem): void;
}

export function mediaCollectionItemId(item: MediaPanelItem): string {
  return encodeOpaqueIdentity([item.providerId, item.id]);
}

export function NSEMediaCollectionPresenter({ items, selectedIds, selection, direction, onSelectionChange, onActivate }: MediaCollectionPresenterProps) {
  const instanceId = useId().replace(/:/g, "");
  const controller = useNSEArrayController<MediaPanelItem, string>({
    id: `media-collection-${instanceId}`,
    content: items,
    getId: mediaCollectionItemId,
    selection: { mode: selection, allowsEmpty: true, preservesSelection: true },
  }, [selection]);
  useEffect(() => {
    controller.setContent(items);
    const available = new Set(items.map(mediaCollectionItemId));
    controller.select(new Set([...selectedIds].filter((id) => available.has(id))));
  }, [controller, items, selectedIds]);
  const adapter = useMemo<NSEDataViewAdapter<MediaPanelItem, string>>(() => ({
    controller,
    idForItem: mediaCollectionItemId,
    labelForItem: (item) => item.name,
  }), [controller]);
  const layout = useMemo(() => createAdaptiveCollectionLayout({ itemSize: { inline: 140, block: 120 }, minimumGap: 8 }), []);
  return (
    <div data-nse-media-presenter="collection-view" dir={direction}>
      <NSECollectionView
        aria-label="Media results"
        adapter={adapter}
        layout={layout}
        viewportInlineSize={600}
        viewportBlockSize={360}
        dir={direction}
        selectionMode={selection}
        onSelectionChange={({ snapshot }) => onSelectionChange(snapshot.selectedIds)}
        onActivate={(_id, item) => onActivate(item)}
        renderItem={({ item, selected }) => (
          <div className="nse-media-grid-item" aria-label={`${item.name}, ${item.kind}`} data-selected={selected ? "true" : "false"} data-nse-part="media-item">
            {item.thumbnailUrl ? <img className="nse-media-grid-thumbnail" src={item.thumbnailUrl} alt="" /> : <span className="nse-media-grid-placeholder" aria-hidden="true">{item.kind}</span>}
            <span className="nse-media-grid-name">{item.name}</span>
          </div>
        )}
      />
    </div>
  );
}
