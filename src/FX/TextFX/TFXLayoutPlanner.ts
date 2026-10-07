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

import type { TFXLogicalTextInput, TFXTextLayoutResult, TFXTextLayoutService } from "./textLayoutTypes";
import { normaliseTFXTextLayoutRecord, snapshotTFXTextContainers, type TFXTextContainer } from "./TFXTextContainer";

/**
 * Logical fragment planner only. Visual shaping, rectangles and hit testing
 * remain adapter results; this type deliberately exposes no glyph identities.
 */
export class TFXLayoutPlanner {
  readonly #service: Pick<TFXTextLayoutService, "layout">;

  constructor(options: { readonly service: Pick<TFXTextLayoutService, "layout"> }) {
    const data = normaliseTFXTextLayoutRecord(options, "Typesetter options", ["service"]);
    if (!data.service || typeof data.service !== "object") throw new TypeError("Typesetter service is required.");
    this.#service = data.service as Pick<TFXTextLayoutService, "layout">;
  }

  plan(input: TFXLogicalTextInput, containers: readonly TFXTextContainer[]): Promise<TFXTextLayoutResult> {
    return this.#service.layout(input, snapshotTFXTextContainers(containers));
  }
}
