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

import type { SynCloudOSAssetCandidate } from "./assetTypes";

export const AssetManager = {
  getBestAssetForDPI(candidates: SynCloudOSAssetCandidate[], devicePixelRatio = 1) {
    const density = devicePixelRatio || 1;
    const sorted = [...candidates].sort((a, b) => (a.density ?? 1) - (b.density ?? 1));
    return sorted.find((candidate) => (candidate.density ?? 1) >= density)?.src ?? sorted.at(-1)?.src ?? "";
  }
};
