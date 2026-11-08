/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { SPFXTranscriptionSegment } from "./SPFXTranscriptionSegment";
import { transcriptionValues } from "./internal/transcriptionValues";
export class SPFXTranscription {
  private constructor() {}
  get formattedString(): string { return transcriptionValues.get(this)!.formattedString; }
  get segments(): readonly SPFXTranscriptionSegment[] { return transcriptionValues.get(this)!.segments; }
}
