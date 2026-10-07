/*
 * SynWare SDK
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { AUFXAudioCodecConfiguration, AUFXAudioFile, AUFXAudioFileExportOptions, AUFXAudioFileOpenRequest, AUFXAudioStreamExportOptions } from "../../FX/AudioFX/AUFXAudioFile";
import type { RuntimeAudioFileService } from "../HostServices/AppSDKHostServiceTypes";

const MAX_PENDING_OPERATIONS = 8;
const MAX_LIVE_FILES = 16;
const MAX_FILE_SAMPLES = 16_777_216;
const MAX_MOUNT_SAMPLES = MAX_FILE_SAMPLES * 2;
type MountedAudioFileHost = Pick<RuntimeAudioFileService, "capabilities" | "negotiateCodec" | "openFile" | "exportFile"> & Partial<Pick<RuntimeAudioFileService, "exportStream">>;

function quota(message: string) { return new DOMException(message, "QuotaExceededError"); }

export function createMountedAudioFiles(host: MountedAudioFileHost | undefined, owner: AbortSignal, permissions: () => readonly string[]) {
  const files = new Set<AUFXAudioFile>();
  const fileSamples = new Map<AUFXAudioFile, number>();
  const controllers = new Set<AbortController>();
  const reservations = new Set<object>();
  let liveSamples = 0;

  const allowed = (): MountedAudioFileHost => {
    owner.throwIfAborted();
    if (!permissions().includes("audio.play")) throw new DOMException("SynWare capability audio.play must be declared.", "SecurityError");
    if (!host) throw new DOMException("Audio files are unavailable on this host.", "NotSupportedError");
    return host;
  };
  const releaseFile = (file: AUFXAudioFile) => {
    if (!files.delete(file)) return;
    liveSamples -= fileSamples.get(file) ?? 0;
    fileSamples.delete(file);
  };
  const revoke = () => {
    for (const controller of controllers) controller.abort();
    for (const file of [...files]) file.close();
    files.clear();
    fileSamples.clear();
    liveSamples = 0;
  };
  owner.addEventListener("abort", revoke, { once: true });

  const operation = async <T>(signal: AbortSignal | undefined, run: (activeHost: MountedAudioFileHost, merged: AbortSignal) => Promise<T>, discard?: (value: T) => void, releaseLifetime?: () => void) => {
    let lifetimeStarted = false;
    let underlyingSettled = false;
    let running: Promise<T> | null = null;
    const active = (() => { try { return allowed(); } catch (error) { releaseLifetime?.(); throw error; } })();
    try { signal?.throwIfAborted(); } catch (error) { releaseLifetime?.(); throw error; }
    if (controllers.size >= MAX_PENDING_OPERATIONS) { releaseLifetime?.(); throw quota(`A mounted application may have at most ${MAX_PENDING_OPERATIONS} pending audio-file operations.`); }
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    const releaseController = () => {
      signal?.removeEventListener("abort", abort);
      controllers.delete(controller);
    };
    controllers.add(controller);
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const activeRunning = run(active, controller.signal);
      running = activeRunning;
      lifetimeStarted = true;
      activeRunning.then(() => { underlyingSettled = true; releaseController(); }, () => { underlyingSettled = true; releaseController(); });
      const result = await new Promise<T>((resolve, reject) => {
        let settled = false;
        const aborted = () => { if (settled) return; settled = true; reject(controller.signal.reason ?? new DOMException("Audio file operation cancelled.", "AbortError")); };
        controller.signal.addEventListener("abort", aborted, { once: true });
        if (controller.signal.aborted) aborted();
        activeRunning.then(value => {
          if (settled) { try { discard?.(value); } catch {} return; }
          settled = true;
          controller.signal.removeEventListener("abort", aborted);
          resolve(value);
        }, error => {
          if (settled) return;
          settled = true;
          controller.signal.removeEventListener("abort", aborted);
          reject(error);
        });
      });
      try { owner.throwIfAborted(); signal?.throwIfAborted(); }
      catch (error) { try { discard?.(result); } catch {} throw error; }
      return result;
    } catch (error) {
      if (!lifetimeStarted) { releaseController(); releaseLifetime?.(); }
      else if (underlyingSettled) releaseLifetime?.();
      else running!.then(releaseLifetime, releaseLifetime);
      throw error;
    }
  };

  return Object.freeze({
    capabilities() { return allowed().capabilities(); },
    negotiateCodec(configuration: AUFXAudioCodecConfiguration, signal?: AbortSignal) {
      return operation(signal, (active, merged) => active.negotiateCodec(configuration, merged));
    },
    async openFile(request: AUFXAudioFileOpenRequest, signal?: AbortSignal) {
      allowed();
      signal?.throwIfAborted();
      if (files.size + reservations.size >= MAX_LIVE_FILES) throw quota(`A mounted application may keep at most ${MAX_LIVE_FILES} audio files open or opening.`);
      if (liveSamples + (reservations.size + 1) * MAX_FILE_SAMPLES > MAX_MOUNT_SAMPLES) throw quota("The mounted audio-file PCM allocation budget is reserved by other open files or decodes.");
      const reservation = {};
      reservations.add(reservation);
      const file = await operation(signal, (active, merged) => active.openFile(request, merged), value => value.close(), () => reservations.delete(reservation));
      try {
        let samples: number;
        try { samples = file.length * file.processingFormat.channelCount; }
        catch (error) { file.close(); throw error; }
        if (!Number.isSafeInteger(samples) || samples < 1 || samples > MAX_FILE_SAMPLES) { file.close(); throw new RangeError("Decoded audio exceeds the per-file PCM allocation budget."); }
        if (files.has(file)) throw new Error("The audio-file host returned an already-owned file identity.");
        const close = file.close.bind(file);
        try { Object.defineProperty(file, "close", { configurable: true, value: () => { try { close(); } finally { releaseFile(file); } } }); }
        catch (error) { close(); throw error; }
        files.add(file);
        fileSamples.set(file, samples);
        liveSamples += samples;
        reservations.delete(reservation);
        return file;
      } catch (error) { reservations.delete(reservation); throw error; }
    },
    exportFile(file: AUFXAudioFile, signal?: AbortSignal, options?: AUFXAudioFileExportOptions) {
      if (!files.has(file) || !file.isOpen) return Promise.reject(new DOMException("Audio file is not owned by this mounted application.", "SecurityError"));
      return operation(signal, (active, merged) => active.exportFile(file, merged, options));
    },
    exportStream(options: AUFXAudioStreamExportOptions, signal?: AbortSignal) {
      return operation(signal, (active, merged) => {
        if (typeof active.exportStream !== "function") throw new DOMException("Streaming audio export is unavailable on this host.", "NotSupportedError");
        return active.exportStream(options, merged);
      });
    },
  });
}
