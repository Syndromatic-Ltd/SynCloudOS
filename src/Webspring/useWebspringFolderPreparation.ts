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

import { useCallback, useEffect } from "react";
import type { WebspringFolderPresentationComponent } from "./webspringTypes";

/**
 * Readies a folder presentation to open over `stage`. While a stage is given
 * the presentation warms (the split presentation loads its capture engine at
 * idle). The returned function prepares an opening (the split presentation
 * snapshots the stage); call it from the folder control's pointerenter,
 * pointerdown and focus so the work is under way before the click lands.
 * Pass a null stage while the view shows no folders.
 */
export function useWebspringFolderPreparation(presentation: WebspringFolderPresentationComponent, stage: HTMLElement | null): () => void {
  useEffect(() => {
    if (stage) presentation.warm?.();
  }, [presentation, stage]);
  return useCallback(() => {
    if (stage) presentation.prepare?.(stage);
  }, [presentation, stage]);
}
