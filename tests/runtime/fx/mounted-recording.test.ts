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

import { expect, it, vi } from "vitest";
import { createMountedAudioSessions } from "../../../src/SynCloudOS/AppSDK/mountedAudioSessions";
import { BrowserAudioCaptureAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserAudioCaptureAdapter";
import { AUFXAudioSession } from "../../../src/FX/AudioFX/AUFXAudioSession";
import { AUFXAudioRecorder } from "../../../src/FX/AudioFX/AUFXAudioRecorder";

it("does not acquire a recording session without the current declaration", () => {
  const createSession = vi.fn();
  let permissions: string[] = [];
  const client = createMountedAudioSessions({ createSession }, new AbortController().signal, () => permissions);
  expect(() => client.createSession()).toThrow(/audio.record/);
  expect(createSession).not.toHaveBeenCalled();
  permissions = ["audio.record"];
  createSession.mockImplementation(() => { throw new Error("fixture backend failure"); });
  for (let i = 0; i < 10; i++) expect(() => client.createSession()).toThrow(/fixture backend failure/);
});

it("keeps unavailable sessions truthful, isolated and revoked", () => {
  const host = new BrowserAudioCaptureAdapter(null);
  const a = new AbortController(), b = new AbortController();
  const first = createMountedAudioSessions(host, a.signal, () => ["audio.record"]).createSession();
  const second = createMountedAudioSessions(host, b.signal, () => ["audio.record"]).createSession();
  expect(first.state).toBe("unavailable");
  expect(first.capabilities.capture).toBe(false);
  expect(Object.isFrozen(first)).toBe(true);
  a.abort();
  expect(first.state).toBe("disposed");
  expect(second.state).toBe("unavailable");
  second.dispose();
  expect(second.state).toBe("disposed");
});

it("passes only the mount-issued opaque input capability to its capture host", () => {
  const capability = Object.freeze({}), createSession = vi.fn((_signal?: AbortSignal, _capability?: object) => new BrowserAudioCaptureAdapter(null).createSession());
  const session = createMountedAudioSessions({ createSession }, new AbortController().signal, () => ["audio.record"], capability).createSession();
  expect(createSession.mock.calls[0][1]).toBe(capability); expect(Object.keys(session)).not.toContain("capability"); session.dispose();
});

it("excludes continuous recording and tracks its real asynchronous stop finalization", async () => {
  let recorderListener: ((event: any) => void) | null = null;
  const recorderPort = {
    mimeType: "audio/webm",
    now: () => 1,
    subscribe: vi.fn((listener: (event: any) => void) => { recorderListener = listener; return () => { recorderListener = null; }; }),
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
    dispose: vi.fn(),
    decode: vi.fn(async () => ({ duration: 1, frameCount: 48_000, sampleRate: 48_000, channelCount: 1 })),
  };
  const recorder = new AUFXAudioRecorder(recorderPort);
  const session = new AUFXAudioSession({
    state: "active",
    route: { desiredInput: null, actualInput: null, desiredOutput: null, actualOutput: null },
    capabilities: { capture: true, inputSelection: false, outputSelection: false, mimeTypes: ["audio/webm"] },
    requestRecordAuthorization: async () => undefined,
    enumerateDevices: async () => [],
    setPreferredInput: async () => undefined,
    setPreferredOutput: async () => undefined,
    createRecorder: () => recorder,
    createInputNode: () => { throw new Error("unused"); },
    subscribe: () => () => {},
    dispose: vi.fn(),
  } as any);
  const release = vi.fn();
  const settlement = {
    track: vi.fn(<T,>(receipt: Promise<T>) => receipt),
    exclude: vi.fn(() => ({ id: "recording-live", release })),
  };
  const mounted = createMountedAudioSessions(
    { createSession: () => session },
    new AbortController().signal,
    () => ["audio.record"],
    Object.freeze({}),
    "com.syndromatic.recorder-probe",
    settlement,
  ).createSession();
  const take = mounted.createRecorder();

  take.record();
  expect(settlement.exclude).toHaveBeenCalledWith({
    owner: "audio",
    kind: "recording",
    label: "com.syndromatic.recorder-probe",
  });
  expect(release).not.toHaveBeenCalled();

  const stopping = take.stop();
  expect(release).toHaveBeenCalledTimes(1);
  expect(settlement.track).toHaveBeenCalledWith(stopping, {
    owner: "audio",
    kind: "stop",
    label: "com.syndromatic.recorder-probe",
  });

  recorderListener?.({ type: "data", data: new Blob([new Uint8Array([1])], { type: "audio/webm" }) });
  recorderListener?.({ type: "stop" });
  await expect(stopping).resolves.toMatchObject({ byteLength: 1, frameCount: 48_000 });
  mounted.dispose();
});
