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

import { speechCancelled, unsupportedSpeech, type SpeechAdapter, type SpeechAuthorization, type SpeechRequest, type SpeechEvent, type SpeechSession } from "../../FX/SpeechFX/internal/speechPort";
/** The current adapter has no supplied-audio backend or Speech-only authorization
 * operation. Authorization never starts recognition, microphone capture or a source. */
export class BrowserSpeechAdapter implements SpeechAdapter {
  authorizationStatus(): SpeechAuthorization { return "unavailable"; }
  isAvailable(_locale: Intl.Locale): boolean { return false; }
  supportsOnDeviceRecognition(_locale: Intl.Locale): boolean { return false; }
  supportedLocales(): ReadonlySet<Intl.Locale> { return unsupportedSpeech("supportedLocales"); }
  start(_request: SpeechRequest, _listener: (event: SpeechEvent) => void, _signal: AbortSignal): SpeechSession { return unsupportedSpeech("Supplied audio-buffer and URL recognition"); }
  requestAuthorization(signal: AbortSignal): Promise<SpeechAuthorization> {
    if (signal.aborted) return Promise.reject(speechCancelled());
    return Promise.resolve("unavailable");
  }
}
