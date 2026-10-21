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

import { useSyncExternalStore } from "react";
import type { SynCloudOSAppearance, SynCloudOSResolvedAppearance } from "./appearanceService";

interface AppearanceRuntime {
  appearance: {
    subscribe(listener: () => void): () => void;
    get(): SynCloudOSAppearance;
    resolved(): SynCloudOSResolvedAppearance;
  };
}

export function useResolvedAppearance(runtime: AppearanceRuntime): SynCloudOSResolvedAppearance {
  return useSyncExternalStore(runtime.appearance.subscribe, runtime.appearance.resolved, () => "light");
}

export function useAppearance(runtime: AppearanceRuntime): SynCloudOSAppearance {
  return useSyncExternalStore(runtime.appearance.subscribe, runtime.appearance.get, () => "auto");
}
