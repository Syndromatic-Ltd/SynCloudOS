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

import React, { useRef, useState } from "react";
import { NSEMediaPanel, type NSEMediaPanelWindowBridge } from "../../../src/NSE/NSE";
import type { MediaPanelItem, MediaPanelService } from "../../../src/SynCloudOS/SynCloudOS";

export interface DocumentMediaInsertion {
  readonly source: string;
  readonly mimeType: string;
  readonly name: string;
}

export interface DocumentMediaFixtureProps {
  readonly service: MediaPanelService;
  readonly windowBridge: NSEMediaPanelWindowBridge;
  readonly compact?: boolean;
}

/** Exercises insertion into a document through the real media panel. */
export function DocumentMediaFixture({ service, windowBridge, compact }: DocumentMediaFixtureProps) {
  const [open, setOpen] = useState(false);
  const [insertion, setInsertion] = useState<DocumentMediaInsertion | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const insert = (items: readonly MediaPanelItem[]) => {
    const selected = items[0];
    if (!selected?.source) throw new TypeError("Document media requires a stable source.");
    setInsertion({ source: selected.source, mimeType: selected.mimeType, name: selected.name });
  };
  return (
    <section aria-label="Document media fixture">
      <button ref={trigger} type="button" onClick={() => setOpen(true)}>Insert image</button>
      <NSEMediaPanel
        id="example-document-media"
        open={open}
        anchor={trigger.current}
        parentResponderId="window:example-document"
        parentWindowControllerId="window:example-document"
        compact={compact}
        service={service}
        windowBridge={windowBridge}
        query={{ id: "example-document-media", providerId: "stock", search: "", kinds: ["image"], cursor: null }}
        selection="single"
        onInsert={insert}
        onOpenChange={setOpen}
      />
      <output aria-label="Inserted media">{insertion ? JSON.stringify(insertion) : "No media inserted"}</output>
    </section>
  );
}
