/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
export const SPFXSpeechRecognitionTaskHint = Object.freeze({ unspecified: "unspecified", dictation: "dictation", search: "search", confirmation: "confirmation" } as const);
export type SPFXSpeechRecognitionTaskHint = typeof SPFXSpeechRecognitionTaskHint[keyof typeof SPFXSpeechRecognitionTaskHint];
