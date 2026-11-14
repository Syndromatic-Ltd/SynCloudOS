/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { useEffect, useState } from "react";
import { NSEData } from "../../Foundation/NSEData";
import { NSEWorkspace } from "../Application/NSEWorkspace";
import { NSEImageView } from "../Controls/Images/NSEImage";
import type { IFXImageResource } from "../../FX/ImageFX/IFXImageResource";
import type { OpenPanelImagePort } from "./openPanelHost";
import type { OpenPanelItem } from "./NSEOpenPanelCollection";

/** A visible collection cell owns its decode lease; fallback artwork stays until decoding succeeds. */
export function OpenPanelItemImage({ item, images }: { item: OpenPanelItem; images?: OpenPanelImagePort }) {
  const [thumbnail, setThumbnail] = useState<{ item: OpenPanelItem; resource: IFXImageResource } | null>(null);
  useEffect(() => {
    let current = true;
    let resource: IFXImageResource | undefined;
    const owner = new AbortController();
    const load = async () => {
      if (!images || item.kind === "directory") return;
      const source = item.media?.thumbnailUrl ?? (item.media?.kind === "image" ? item.media.source : undefined);
      if (source) resource = images.load({ source: { kind: "url", url: source, cors: "anonymous" }, accessibleLabel: item.name });
      else if (item.media?.kind === "image" && item.media.fileReference && "read" in item.media.fileReference) {
        const bytes = await item.media.fileReference.read(owner.signal);
        if (!current) return;
        resource = images.load({ source: { kind: "bytes", mimeType: item.media.mimeType, bytes }, accessibleLabel: item.name });
      }
      else if (item.handle?.kind === "file") {
        const file = await item.handle.getFile();
        if (!current || !file.type.startsWith("image/")) return;
        const bytes = await NSEData.read(file);
        if (!current) return;
        resource = images.load({ source: { kind: "bytes", mimeType: file.type, bytes }, accessibleLabel: item.name });
      }
      if (!resource) return;
      await resource.ready;
      if (current && resource.state === "ready") setThumbnail({ item, resource });
    };
    void load().catch(() => { /* Unreadable or unsupported image: retain the generic document art. */ });
    return () => { current = false; owner.abort(); resource?.release(); };
  }, [images, item]);
  const resource = thumbnail && thumbnail.item === item && thumbnail.resource.state === "ready" ? thumbnail.resource : null;
  return <NSEImageView className={resource ? "nse-open-thumbnail" : "nse-open-workspace-icon"} src={resource ?? NSEWorkspace.shared.iconForFile({ name: item.name, kind: item.kind }, 96)}
    geometry={images?.geometry} alt="" controls={false} wheelZoom={false} pannable={false} data-thumbnail-ready={resource ? "true" : undefined} />;
}
