/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { SPFXSpeechRecognitionTaskHint } from "./SPFXSpeechRecognitionTaskHint";
/** SFSpeechRecognitionRequest. Construct an audio-buffer or URL request. */
export abstract class SPFXSpeechRecognitionRequest {
  shouldReportPartialResults = true;
  requiresOnDeviceRecognition = false;
  taskHint: SPFXSpeechRecognitionTaskHint = SPFXSpeechRecognitionTaskHint.unspecified;
  contextualStrings: string[] = [];
  addsPunctuation = false;
}
