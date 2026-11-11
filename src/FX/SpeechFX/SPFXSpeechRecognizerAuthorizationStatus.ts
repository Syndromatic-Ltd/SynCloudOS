/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
export const SPFXSpeechRecognizerAuthorizationStatus = Object.freeze({
  notDetermined: "notDetermined",
  restricted: "restricted",
  denied: "denied",
  authorized: "authorized",
} as const);
export type SPFXSpeechRecognizerAuthorizationStatus =
  (typeof SPFXSpeechRecognizerAuthorizationStatus)[keyof typeof SPFXSpeechRecognizerAuthorizationStatus];
