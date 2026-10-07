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

import { useSynWareAudio, type AUFXAudioClient } from "../../src/SynCloudOS/AppSDK/sdkPackageEntry";
import { AUFXAudioChunkStream, type AUFXAudioStreamExport } from "../../src/FX/AudioFX/public";

declare const source: AUFXAudioChunkStream;
declare const sink: WritableStream<Uint8Array>;
declare const audio: AUFXAudioClient;

const request = { source, sink, format: "opus-webm" as const, bitrate: 64_000 };
const mountedReceipt: Promise<AUFXAudioStreamExport> = audio.exportStream(request);
const componentReceipt: Promise<AUFXAudioStreamExport> = useSynWareAudio().exportStream(request);
void mountedReceipt;
void componentReceipt;

// @ts-expect-error The streaming writer only accepts compressed Opus WebM.
audio.exportStream({ source, sink, format: "wav" });
// @ts-expect-error Streaming export consumes an AUFXAudioChunkStream, not a whole-file object.
audio.exportStream({ source: new Blob(), sink, format: "opus-webm" });
