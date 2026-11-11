/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { NSERange } from "../../Foundation/NSERange";
import { segmentValues } from "./internal/transcriptionValues";
export class SPFXTranscriptionSegment {
  private constructor() {}
  get substring(): string { return segmentValues.get(this)!.substring; }
  get substringRange(): NSERange { return segmentValues.get(this)!.substringRange; }
  get timestamp(): number { return segmentValues.get(this)!.timestamp; }
  get duration(): number { return segmentValues.get(this)!.duration; }
  get confidence(): number { return segmentValues.get(this)!.confidence; }
  get alternativeSubstrings(): readonly string[] { return segmentValues.get(this)!.alternativeSubstrings; }
}
