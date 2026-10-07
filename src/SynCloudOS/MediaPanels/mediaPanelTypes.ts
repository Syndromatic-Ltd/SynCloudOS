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

import type { FilePanelReference } from "../FilePanels";

export type MediaKind = "image" | "video" | "audio";

/**
 * A provider-scoped item identity. `source` is deliberately optional: a local
 * file reference is not a durable URL or a synthetic document location.
 */
export interface MediaPanelItem {
  readonly id: string;
  readonly providerId: string;
  readonly kind: MediaKind;
  readonly name: string;
  readonly mimeType: string;
  readonly source?: string;
  readonly thumbnailUrl?: string;
  readonly fileReference?: FilePanelReference;
}

export interface MediaPanelQuery {
  /** Stable panel/session key; replacing this request aborts the previous page. */
  readonly id: string;
  readonly providerId: string;
  readonly search: string;
  readonly kinds: readonly MediaKind[];
  /** A provider-owned opaque cursor; it is never re-used across providers. */
  readonly cursor: string | null;
  readonly pageSize?: number;
  /** A presenter may only set this while handling a real user gesture. */
  readonly userInitiated?: boolean;
}

export interface MediaPanelProviderPage {
  readonly items: readonly MediaPanelItem[];
  readonly nextCursor: string | null;
}

export interface MediaPanelProvider {
  readonly id: string;
  readonly label: string;
  /** Prevents a file picker or permission prompt from being scheduled by background panel work. */
  readonly requiresUserActivation?: boolean;
  query(query: MediaPanelQuery, signal: AbortSignal): Promise<MediaPanelProviderPage>;
  /** Releases provider-owned temporary thumbnails or file wrappers for discarded items. */
  release?(items: readonly MediaPanelItem[]): void;
}

export type MediaPanelResult =
  | {
      readonly kind: "accepted";
      readonly providerId: string;
      readonly items: readonly MediaPanelItem[];
      readonly nextCursor: string | null;
    }
  | { readonly kind: "empty"; readonly providerId: string }
  | { readonly kind: "denied"; readonly message: string }
  | { readonly kind: "unavailable"; readonly message: string }
  | { readonly kind: "interrupted"; readonly message: string }
  | { readonly kind: "error"; readonly message: string };

export interface MediaPanelService {
  readonly providers: readonly MediaPanelProvider[];
  query(query: MediaPanelQuery, signal?: AbortSignal): Promise<MediaPanelResult>;
  clear(queryId: string): void;
  dispose(): void;
}

/** The only object-thumbnail authority used by the File media provider. */
export interface MediaThumbnailPort {
  createThumbnail(file: File, signal: AbortSignal): Promise<string>;
  revokeThumbnail(url: string): void;
}

export interface FileMediaProviderOptions {
  readonly id: string;
  readonly label: string;
  readonly filePanelService: Pick<import("../FilePanels").FilePanelService, "open" | "release">;
  readonly thumbnails?: MediaThumbnailPort;
}
