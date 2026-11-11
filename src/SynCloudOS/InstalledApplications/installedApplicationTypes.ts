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

import type { SynWareManifestV1 } from "../AppSDK/manifest/manifestTypes";
export interface InstalledApplicationConfiguration {
  readonly base: string;
  readonly receipt: string;
  readonly manifests: readonly {
    readonly bundleIdentifier: string;
    readonly fileName: string;
    readonly manifest: { readonly scope: string; readonly start_url: string; readonly name: string };
    readonly members: readonly SynWareManifestV1[];
  }[];
}
export interface InstalledApplicationSnapshot {
  readonly installed: boolean;
  readonly canInstall: boolean;
  readonly worker: "idle" | "registered" | "unsupported" | "failed";
  readonly persistence: "unrequested" | "granted" | "refused" | "unsupported";
  readonly error: string | null;
}
