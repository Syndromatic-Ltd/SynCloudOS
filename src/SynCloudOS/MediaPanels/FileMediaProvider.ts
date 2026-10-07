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

import { throwIfFilePanelAborted, type FilePanelReference, type FilePanelResult } from "../FilePanels";
import { MediaPanelProviderError } from "./MediaPanelService";
import type {
  FileMediaProviderOptions,
  MediaKind,
  MediaPanelItem,
  MediaPanelProvider,
  MediaPanelQuery,
} from "./mediaPanelTypes";

interface MediaLease {
  readonly reference: FilePanelReference;
  readonly thumbnailUrl?: string;
  released: boolean;
}

const ACCEPTS = Object.freeze({
  image: {
    description: "Images",
    mimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"] as const,
    extensions: [".png", ".jpg", ".jpeg", ".webp", ".gif"] as const,
  },
  video: {
    description: "Videos",
    mimeTypes: ["video/mp4", "video/webm", "video/quicktime"] as const,
    extensions: [".mp4", ".webm", ".mov"] as const,
  },
  audio: {
    description: "Audio",
    mimeTypes: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4"] as const,
    extensions: [".mp3", ".wav", ".ogg", ".m4a"] as const,
  },
} satisfies Record<MediaKind, { readonly description: string; readonly mimeTypes: readonly `${string}/${string}`[]; readonly extensions: readonly `.${string}`[] }>);

function mediaKindForMime(mimeType: string): MediaKind | null {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized.startsWith("image/")) return "image";
  if (normalized.startsWith("video/")) return "video";
  if (normalized.startsWith("audio/")) return "audio";
  return null;
}

function resultError(result: Exclude<FilePanelResult<FilePanelReference>, { readonly kind: "accepted" } | { readonly kind: "cancelled" }>): MediaPanelProviderError {
  if (result.kind === "choose-another") return new MediaPanelProviderError("interrupted", "The file selection needs another destination.");
  if (result.kind === "denied" || result.kind === "revoked") return new MediaPanelProviderError("denied", result.message);
  if (result.kind === "unavailable") return new MediaPanelProviderError("unavailable", result.message);
  if (result.kind === "interrupted") return new MediaPanelProviderError("interrupted", result.message);
  return new MediaPanelProviderError("error", result.message);
}

function acceptsFor(kinds: readonly MediaKind[]) {
  return Object.freeze(kinds.map((kind) => ACCEPTS[kind]));
}

/**
 * File-backed provider with no browser globals. Its `userInitiated` gate is a
 * scheduling guard; the File System Access port remains the security authority.
 */
export function createFileMediaProvider(options: FileMediaProviderOptions): MediaPanelProvider {
  const id = options.id.trim();
  const label = options.label.trim();
  if (!id) throw new TypeError("File media provider IDs must not be empty.");
  if (!label) throw new TypeError("File media provider labels must not be empty.");
  const leases = new WeakMap<MediaPanelItem, MediaLease>();

  const release = (items: readonly MediaPanelItem[]) => {
    for (const item of items) {
      const lease = leases.get(item);
      if (!lease || lease.released) continue;
      lease.released = true;
      if (lease.thumbnailUrl) options.thumbnails?.revokeThumbnail(lease.thumbnailUrl);
      options.filePanelService.release(lease.reference, "caller-finished");
    }
  };

  const provider: MediaPanelProvider = {
    id,
    label,
    requiresUserActivation: true,
    async query(query: MediaPanelQuery, signal: AbortSignal) {
      throwIfFilePanelAborted(signal);
      if (!query.userInitiated) {
        throw new MediaPanelProviderError("interrupted", "File media selection must start from an active user action.");
      }
      if (query.cursor !== null) return { items: Object.freeze([]), nextCursor: null };
      const result = await options.filePanelService.open({
        id: `media:${id}:${query.id}`,
        accepts: acceptsFor(query.kinds),
        selection: "multiple-files",
        access: "read",
        requires: [],
      }, signal);
      throwIfFilePanelAborted(signal);
      if (result.kind === "cancelled" || result.kind === "choose-another") return { items: Object.freeze([]), nextCursor: null };
      if (result.kind !== "accepted") throw resultError(result);

      const items: MediaPanelItem[] = [];
      const referencesById = new Map<string, FilePanelReference>();
      for (const reference of result.values) {
        if (!referencesById.has(reference.id)) referencesById.set(reference.id, reference);
      }
      const references = [...referencesById.values()];
      try {
        for (const reference of references) {
          throwIfFilePanelAborted(signal);
          if (reference.kind === "directory-handle") {
            options.filePanelService.release(reference, "caller-finished");
            continue;
          }
          const file = await reference.read(signal);
          throwIfFilePanelAborted(signal);
          const mimeType = (reference.kind === "ephemeral-file" ? reference.mediaType : file.type).trim().toLowerCase() || "application/octet-stream";
          const kind = mediaKindForMime(mimeType);
          if (!kind || !query.kinds.includes(kind)) {
            options.filePanelService.release(reference, "caller-finished");
            continue;
          }
          let thumbnailUrl: string | undefined;
          try {
            if (kind === "image" && options.thumbnails) {
              thumbnailUrl = await options.thumbnails.createThumbnail(file, signal);
              throwIfFilePanelAborted(signal);
              if (!thumbnailUrl.trim()) throw new MediaPanelProviderError("error", "The thumbnail service returned an invalid URL.");
            }
            const item: MediaPanelItem = Object.freeze({
              id: reference.id,
              providerId: id,
              kind,
              name: reference.name,
              mimeType,
              ...(thumbnailUrl ? { thumbnailUrl } : {}),
              fileReference: reference,
            });
            leases.set(item, { reference, thumbnailUrl, released: false });
            items.push(item);
          } catch (error) {
            if (thumbnailUrl) options.thumbnails?.revokeThumbnail(thumbnailUrl);
            throw error;
          }
        }
        return { items: Object.freeze(items), nextCursor: null };
      } catch (error) {
        release(items);
        for (const reference of references) {
          if (items.some((item) => item.fileReference === reference)) continue;
          options.filePanelService.release(reference, "caller-finished");
        }
        if (error instanceof MediaPanelProviderError) throw error;
        if (typeof error === "object" && error !== null && "code" in error && (error as { readonly code?: unknown }).code === "operation-aborted") {
          throw new MediaPanelProviderError("interrupted", "File media selection was interrupted.");
        }
        throw new MediaPanelProviderError("error", "The selected media could not be prepared.");
      }
    },
    release,
  };
  return Object.freeze(provider);
}
