/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
export const SPFXSpeechRecognitionTaskState = Object.freeze({ starting: "starting", running: "running", finishing: "finishing", canceling: "canceling", completed: "completed" } as const);
export type SPFXSpeechRecognitionTaskState = typeof SPFXSpeechRecognitionTaskState[keyof typeof SPFXSpeechRecognitionTaskState];
