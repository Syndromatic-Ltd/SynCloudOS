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

export interface WebspringFolderPreparationOptions {
  /**
   * The view is at rest: no launch, editing, drag or open folder. While it is,
   * the presentation keeps an opening prepared in the background, so a tap
   * with no hover before it opens at once.
   */
  readonly atRest?: boolean;
}

/**
 * Readies a folder presentation to open over `stage`. While a stage is given
 * the presentation warms (the split presentation loads its capture engine at
 * idle), and while the view is also at rest it keeps an opening prepared (the
 * split presentation keeps a current snapshot of the stage, retaken at idle
 * after the stage changes). The returned function prepares for a reach; call
 * it from the folder control's pointerenter, pointerdown and focus. Pass a
 * null stage while the view shows no folders.
 */
export function useWebspringFolderPreparation(
  presentation: WebspringFolderPresentationComponent,
  stage: HTMLElement | null,
  { atRest = false }: WebspringFolderPreparationOptions = {},
): () => void {
  useEffect(() => {
    if (stage) presentation.warm?.();
  }, [presentation, stage]);
  useEffect(() => {
    if (stage && atRest) return presentation.keepPrepared?.(stage);
  }, [atRest, presentation, stage]);
  return useCallback(() => {
    if (stage) presentation.prepare?.(stage);
  }, [presentation, stage]);
}
