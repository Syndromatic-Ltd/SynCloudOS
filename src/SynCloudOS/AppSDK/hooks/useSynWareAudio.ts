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

import type { AUFXAudioEngine } from "../../../FX/AudioFX/AUFXAudioEngine";
import type { AUFXAudioFormat } from "../../../FX/AudioFX/AUFXAudioFormat";
import { createAudioSessionFacade } from "../audioSessionFacade";
import type { AUFXAudioSession } from "../../../FX/AudioFX/AUFXAudioSession";
import type { AUFXAudioFile } from "../../../FX/AudioFX/AUFXAudioFile";
import { useLayoutEffect, useMemo, useRef } from "react";
import { useSynWare } from "../SynWareContext";
import type { AUFXAudioClient } from "../appClientTypes";

function abortError(): DOMException {
  return new DOMException("The declaring SynWare component was unmounted.", "AbortError");
}

/** Returns a component-owned sound client. Handles loaded through it are
 * released when the declaring subtree unmounts, in addition to normal mount
 * revocation when the app session closes. */
export function useSynWareAudio(): AUFXAudioClient {
  const app = useSynWare();
  const handles = useRef(new Set<string>());
  const controllers = useRef(new Set<AbortController>());
  const active = useRef(false);
  const engines = useRef(new Set<AUFXAudioEngine>());
  const sessions = useRef(new Set<AUFXAudioSession>());
  const files = useRef(new Set<AUFXAudioFile>());

  useLayoutEffect(() => {
    active.current = true;
    const ownedHandles = handles.current;
    const pendingControllers = controllers.current;
    const releaseOwned = () => {
      active.current = false;
      for (const controller of pendingControllers) controller.abort(abortError());
      pendingControllers.clear();
      for (const session of sessions.current) session.dispose();
      sessions.current.clear();
      for (const engine of engines.current) engine.dispose();
      engines.current.clear();
      for (const file of files.current) file.close();
      files.current.clear();
      for (const handleId of ownedHandles) {
        try { app.audio.release(handleId, "declaring SynWare component unmounted"); } catch { /* mount revocation is idempotent */ }
      }
      ownedHandles.clear();
    };
    app.signal.addEventListener("abort", releaseOwned, { once: true });
    return () => {
      app.signal.removeEventListener("abort", releaseOwned);
      releaseOwned();
    };
  }, [app.signal, app.audio]);

  return useMemo(() => Object.freeze({
    createEngine(format: AUFXAudioFormat, signal?: AbortSignal) {
      if (!active.current) throw abortError();
      const engine = app.audio.createEngine(format, signal);
      const dispose = engine.dispose.bind(engine);
      Object.defineProperty(engine, "dispose", { configurable: true, value: () => { try { dispose(); } finally { engines.current.delete(engine); } } });
      engines.current.add(engine);
      return engine;
    },
    createSession(signal?: AbortSignal) {
      if (!active.current) throw abortError();
      const raw = app.audio.createSession(signal);
      const session = createAudioSessionFacade(raw, () => sessions.current.delete(session));
      sessions.current.add(session);
      return session;
    },
    fileCapabilities: app.audio.fileCapabilities,
    async openFile(request: Parameters<AUFXAudioClient["openFile"]>[0], signal?: AbortSignal) {
      if (!active.current) throw abortError(); const file = await app.audio.openFile(request, signal);
      if (!active.current) { file.close(); throw abortError(); } files.current.add(file); return file;
    },
    exportFile(file: AUFXAudioFile, signal?: AbortSignal, options?: Parameters<typeof app.audio.exportFile>[2]) { if (!active.current || !files.current.has(file)) return Promise.reject(abortError()); return app.audio.exportFile(file, signal, options); },
    async exportStream(options: Parameters<AUFXAudioClient["exportStream"]>[0], signal?: AbortSignal) {
      if (!active.current) throw abortError();
      const controller = new AbortController();
      controllers.current.add(controller);
      const abortFromCaller = () => controller.abort(signal?.reason);
      if (signal?.aborted) abortFromCaller();
      else signal?.addEventListener("abort", abortFromCaller, { once: true });
      try { return await app.audio.exportStream(options, controller.signal); }
      finally { signal?.removeEventListener("abort", abortFromCaller); controllers.current.delete(controller); }
    },
    activation: app.audio.activation,
    async load(request: Parameters<AUFXAudioClient["load"]>[0], signal?: AbortSignal) {
      const controller = new AbortController();
      controllers.current.add(controller);
      const abortFromCaller = () => controller.abort(signal?.reason);
      signal?.addEventListener("abort", abortFromCaller, { once: true });
      try {
        const handle = await app.audio.load(request, controller.signal);
        if (!active.current) {
          app.audio.release(handle.id, "declaring SynWare component unmounted");
          throw abortError();
        }
        handles.current.add(handle.id);
        return handle;
      } finally {
        signal?.removeEventListener("abort", abortFromCaller);
        controllers.current.delete(controller);
      }
    },
    play: app.audio.play,
    pause: app.audio.pause,
    stop: app.audio.stop,
    setLoop: app.audio.setLoop,
    setVolume: app.audio.setVolume,
    setRate: app.audio.setRate,
    setCurrentTime: app.audio.setCurrentTime,
    release(handleId: string, reason?: string) {
      handles.current.delete(handleId);
      return app.audio.release(handleId, reason);
    },
    suspend: app.audio.suspend,
    resume: app.audio.resume,
  } satisfies AUFXAudioClient), [app.audio]);
}
