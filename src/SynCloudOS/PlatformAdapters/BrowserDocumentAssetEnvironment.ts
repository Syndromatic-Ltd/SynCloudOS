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

import { DocumentAssetError } from "../HostServices/PlatformAdapterRuntimeServices";

/** Explicit default platform seam; non-browser hosts may inject all dependencies. */
export function createBrowserDocumentAssetEnvironment(): {
  readonly indexedDB: IDBFactory | undefined;
  readonly randomUUID: () => string;
  readonly hash: (bytes: Uint8Array) => Promise<string>;
} {
  return {
    indexedDB: globalThis.indexedDB,
    randomUUID: () => {
      if (!globalThis.crypto?.randomUUID) throw new DocumentAssetError("asset-unsupported", "Asset UUID generation is unavailable.");
      return globalThis.crypto.randomUUID();
    },
    async hash(bytes) {
      if (!globalThis.crypto?.subtle) throw new DocumentAssetError("asset-unsupported", "Asset SHA-256 support is unavailable.");
      const result = await globalThis.crypto.subtle.digest("SHA-256", bytes.slice().buffer);
      return "sha256:" + [...new Uint8Array(result)].map(byte => byte.toString(16).padStart(2, "0")).join("");
    },
  };
}
