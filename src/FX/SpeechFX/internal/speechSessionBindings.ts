/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { FXAppSession } from "../../../SynCloudOS/fxRuntimeContracts";
import type { SPFXSpeechRecognizer } from "../SPFXSpeechRecognizer";
export const speechSessionBindings = new WeakMap<Function, Readonly<{ resolve(): FXAppSession }>>();
export const speechRecognizers = new WeakMap<SPFXSpeechRecognizer, { dispose(): void }>();
