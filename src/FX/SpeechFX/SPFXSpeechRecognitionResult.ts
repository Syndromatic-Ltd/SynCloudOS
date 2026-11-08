/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { SPFXTranscription } from "./SPFXTranscription";
import { resultValues } from "./internal/transcriptionValues";
export class SPFXSpeechRecognitionResult {
  private constructor() {}
  get bestTranscription(): SPFXTranscription { return this.transcriptions[0]!; }
  get transcriptions(): readonly SPFXTranscription[] { return resultValues.get(this)!.transcriptions; }
  get isFinal(): boolean { return resultValues.get(this)!.isFinal; }
}
