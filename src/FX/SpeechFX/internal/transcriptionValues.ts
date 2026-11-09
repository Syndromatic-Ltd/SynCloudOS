/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { normaliseNSERange, type NSERange } from "../../../Foundation/NSERange";
import { SPFXTranscriptionSegment } from "../SPFXTranscriptionSegment";
import { SPFXTranscription } from "../SPFXTranscription";
import { SPFXSpeechRecognitionResult } from "../SPFXSpeechRecognitionResult";
import { speechFailure } from "./speechPort";
export interface SegmentObservation {
  readonly substring: string;
  readonly substringRange: NSERange;
  readonly timestamp: number;
  readonly duration: number;
  readonly confidence: number;
  readonly alternativeSubstrings: readonly string[];
}
export interface TranscriptionObservation {
  readonly formattedString: string;
  readonly segments: readonly SegmentObservation[];
}
export interface RecognitionObservation {
  readonly transcriptions: readonly TranscriptionObservation[];
  readonly isFinal: boolean;
}
export const segmentValues = new WeakMap<SPFXTranscriptionSegment, SegmentObservation>();
export const transcriptionValues = new WeakMap<
  SPFXTranscription,
  { formattedString: string; segments: readonly SPFXTranscriptionSegment[] }
>();
export const resultValues = new WeakMap<SPFXSpeechRecognitionResult, { transcriptions: readonly SPFXTranscription[]; isFinal: boolean }>();
export function createSpeechResult(observation: RecognitionObservation): SPFXSpeechRecognitionResult {
  try {
    if (!observation.transcriptions.length) throw new Error("Speech service supplied no transcription.");
    const transcriptions = observation.transcriptions.map(value => {
      const segments = value.segments.map(segment => {
        const range = normaliseNSERange(segment.substringRange);
        if (
          value.formattedString.slice(range.location, range.location + range.length) !== segment.substring ||
          !Number.isFinite(segment.timestamp) ||
          segment.timestamp < 0 ||
          !Number.isFinite(segment.duration) ||
          segment.duration < 0 ||
          !Number.isFinite(segment.confidence) ||
          segment.confidence < 0 ||
          segment.confidence > 1
        )
          throw new Error("Invalid speech segment observation.");
        const result = Object.create(SPFXTranscriptionSegment.prototype) as SPFXTranscriptionSegment;
        segmentValues.set(
          result,
          Object.freeze({ ...segment, substringRange: range, alternativeSubstrings: Object.freeze([...segment.alternativeSubstrings]) }),
        );
        return Object.freeze(result);
      });
      const result = Object.create(SPFXTranscription.prototype) as SPFXTranscription;
      transcriptionValues.set(result, Object.freeze({ formattedString: value.formattedString, segments: Object.freeze(segments) }));
      return Object.freeze(result);
    });
    const result = Object.create(SPFXSpeechRecognitionResult.prototype) as SPFXSpeechRecognitionResult;
    resultValues.set(result, Object.freeze({ transcriptions: Object.freeze(transcriptions), isFinal: observation.isFinal }));
    return Object.freeze(result);
  } catch (error) {
    throw speechFailure(error);
  }
}
