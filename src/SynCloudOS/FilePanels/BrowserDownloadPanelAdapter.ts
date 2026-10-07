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

import { throwIfFilePanelAborted } from "./FilePanelService";
import type {
  DownloadFilePanelPort,
  FilePanelAdapter,
  FilePanelExportPayload,
  FilePanelResult,
  FilePanelSaveTarget,
  OpenPanelRequest,
  SavePanelRequest,
} from "./filePanelTypes";

/**
 * A download is an explicit write-only export sink. It intentionally has no
 * readable location, overwrite identity, browser handle, or document mapping.
 */
export function createDownloadFilePanelAdapter(port: DownloadFilePanelPort): FilePanelAdapter {
  const id = port.id?.trim() || "download-export";
  return {
    id,
    capabilities: new Set(["write", "download-export"]),
    supports(request: OpenPanelRequest | SavePanelRequest): boolean {
      return !("selection" in request) && request.destination === "handle-or-download";
    },
    async open(): Promise<FilePanelResult<never>> {
      return { kind: "unavailable", missingCapabilities: Object.freeze(["read"]), message: "A download export cannot read files." };
    },
    async save(request: SavePanelRequest, signal: AbortSignal): Promise<FilePanelResult<FilePanelSaveTarget>> {
      throwIfFilePanelAborted(signal);
      const sink = {
        kind: "download-export" as const,
        async write(payload: FilePanelExportPayload, writeSignal?: AbortSignal) {
          throwIfFilePanelAborted(writeSignal);
          const result = await port.export(payload, writeSignal);
          return result;
        },
      };
      return {
        kind: "accepted",
        values: Object.freeze([{
          kind: "download-export" as const,
          suggestedName: request.suggestedName,
          exists: false as const,
          sink,
        }]),
      };
    },
  };
}
