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

import { FilePanelReferenceError, throwIfFilePanelAborted } from "./FilePanelService";
import type {
  BrowserFilePanelPort,
  FilePanelAdapter,
  FilePanelReference,
  FilePanelReleaseReason,
  FilePanelResult,
  OpenPanelRequest,
  SavePanelRequest,
} from "./filePanelTypes";

function mediaType(file: File): string {
  return file.type.trim().toLowerCase() || "application/octet-stream";
}

function ephemeralReference(file: File, request: OpenPanelRequest, index: number): Extract<FilePanelReference, { readonly kind: "ephemeral-file" }> {
  let released = false;
  const assertLive = (signal?: AbortSignal) => {
    throwIfFilePanelAborted(signal);
    if (released) throw new FilePanelReferenceError("reference-released", "This temporary file reference has been released.");
  };
  return Object.freeze({
    kind: "ephemeral-file" as const,
    id: `${request.id}:file:${index}`,
    name: file.name,
    issuedByRequestId: request.id,
    capabilities: Object.freeze([
      "read" as const,
      ...(request.selection === "multiple-files" ? ["multiple-selection" as const] : []),
    ]),
    get released() { return released; },
    release: (_reason: FilePanelReleaseReason) => { released = true; },
    file,
    mediaType: mediaType(file),
    size: file.size,
    lastModified: file.lastModified,
    lifetime: "runtime-memory" as const,
    permission: "granted" as const,
    read: async (signal?: AbortSignal) => {
      assertLive(signal);
      return file;
    },
  });
}

/**
 * Injected browser-input adapter. It creates only ephemeral wrappers and
 * deliberately does not manufacture durable file identity or object URLs.
 */
export function createBrowserFilePanelAdapter(port: BrowserFilePanelPort): FilePanelAdapter {
  const id = port.id?.trim() || "browser-file-input";
  return {
    id,
    capabilities: new Set(["read", "multiple-selection"]),
    supports(request: OpenPanelRequest | SavePanelRequest): boolean {
      return "selection" in request
        && request.selection !== "single-directory"
        && request.access === "read"
        && !request.requires.includes("persistent-handle")
        && !request.requires.includes("directory")
        && !request.requires.includes("write");
    },
    async open(request, signal): Promise<FilePanelResult<FilePanelReference>> {
      throwIfFilePanelAborted(signal);
      const selected = await port.pickFiles(request, signal);
      try {
        throwIfFilePanelAborted(signal);
        if (selected.kind === "cancelled") return { kind: "cancelled" };
        if (request.selection === "single-file" && selected.files.length > 1) {
          return { kind: "error", message: "The browser input returned more than one file for a single-file request." };
        }
        return {
          kind: "accepted",
          values: Object.freeze(selected.files.map((file, index) => ephemeralReference(file, request, index))),
        };
      } finally {
        selected.cleanup();
      }
    },
    async save(): Promise<FilePanelResult<never>> {
      return { kind: "unavailable", missingCapabilities: Object.freeze(["write"]), message: "Browser input can only select temporary read-only files." };
    },
  };
}
