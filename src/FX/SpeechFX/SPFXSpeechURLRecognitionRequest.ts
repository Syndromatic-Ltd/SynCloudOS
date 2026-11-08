/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { SPFXSpeechRecognitionRequest } from "./SPFXSpeechRecognitionRequest";
/** SFSpeechURLRecognitionRequest. Web Speech cannot recognize this source;
 * recognitionTask reports SPFXError asynchronously without fetching the URL. */
export class SPFXSpeechURLRecognitionRequest extends SPFXSpeechRecognitionRequest {
  #url: URL;
  constructor(url: URL) { super(); this.#url = new URL(url.href); }
  get url(): URL { return new URL(this.#url.href); }
}
