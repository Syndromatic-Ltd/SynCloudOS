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

import { describe, expect, it, vi } from "vitest";
import { AUFXSpeechUtterance } from "../../../src/FX/AudioFX/AUFXSpeechSynthesizer";
import { BrowserSpeechSynthesisAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserSpeechSynthesisAdapter";
import { createMountedAudioSpeechClient as createMountedSpeechClient } from "../../../src/SynCloudOS/AppSDK/mountedAudioSpeechClient";

function fixture() {
  const native = { speak: vi.fn(), cancel: vi.fn(), pause: vi.fn(), resume: vi.fn(), getVoices: () => [], addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const utterances: any[] = [];
  const host = new BrowserSpeechSynthesisAdapter({ synthesis: native as any, createUtterance(text) { const u = { text }; utterances.push(u); return u as SpeechSynthesisUtterance; } });
  return { native, utterances, host };
}
describe("AudioFX speech synthesis", () => {
  it("allows passive unavailable owners on hosts without speech", async () => {
    const owner = new AbortController();
    const synth = createMountedSpeechClient(undefined, owner.signal, () => ["audio.speech"]).createSynthesizer();
    expect(synth.authorizationStatus).toBe("unavailable");
    expect(synth.capabilities.speechSynthesis).toBe(false);
    await expect(synth.speak(new AUFXSpeechUtterance("Hello"))).rejects.toMatchObject({ name: "NotSupportedError" });
    owner.abort();
  });
  it("validates immutable utterance values", () => {
    const u = new AUFXSpeechUtterance("Hello", { rate: 1.2, language: "en-GB" });
    expect(Object.isFrozen(u)).toBe(true);
    expect(() => new AUFXSpeechUtterance("Hello", { rate: NaN })).toThrow(RangeError);
  });
  it("checks manifest authority before requesting or speaking", async () => {
    const f = fixture(), owner = new AbortController();
    const client = createMountedSpeechClient(f.host, owner.signal, () => []);
    const synth = client.createSynthesizer();
    expect(synth.authorizationStatus).toBe("denied");
    await expect(synth.requestAuthorization()).resolves.toBe("denied");
    await expect(synth.speak(new AUFXSpeechUtterance("Hello"))).rejects.toMatchObject({ name: "SecurityError" });
    expect(f.native.speak).not.toHaveBeenCalled();
  });
  it("serialises owners and cancels only the active owner's native speech", async () => {
    const f = fixture(), a = new AbortController(), b = new AbortController();
    const first = createMountedSpeechClient(f.host, a.signal, () => ["audio.speech"]).createSynthesizer();
    const second = createMountedSpeechClient(f.host, b.signal, () => ["audio.speech"]).createSynthesizer();
    const p1 = first.speak(new AUFXSpeechUtterance("First"));
    const p2 = second.speak(new AUFXSpeechUtterance("Second"));
    const rejected = expect(p1).rejects.toMatchObject({ name: "AbortError" });
    a.abort(); await rejected;
    expect(f.native.cancel).toHaveBeenCalledTimes(1);
    expect(f.native.speak).toHaveBeenCalledTimes(2);
    f.utterances[1].onend(); await p2;
    expect(second.isSpeaking).toBe(false);
    b.abort(); expect(f.native.cancel).toHaveBeenCalledTimes(1);
  });
  it("cleans queued work without interrupting another owner", async () => {
    const f = fixture(), a = new AbortController(), b = new AbortController();
    const first = createMountedSpeechClient(f.host, a.signal, () => ["audio.speech"]).createSynthesizer();
    const second = createMountedSpeechClient(f.host, b.signal, () => ["audio.speech"]).createSynthesizer();
    const p1 = first.speak(new AUFXSpeechUtterance("First"));
    const p2 = second.speak(new AUFXSpeechUtterance("Second"));
    const rejected = expect(p2).rejects.toMatchObject({ name: "AbortError" });
    b.abort(); await rejected; expect(f.native.cancel).not.toHaveBeenCalled();
    f.utterances[0].onend(); await p1;
  });
});

it("does not enqueue after a synchronous observer disposes the owner", async () => {
  const f = fixture(), owner = new AbortController();
  const synth = f.host.createSynthesizer(owner.signal, () => true);
  synth.subscribe(() => synth.dispose());
  await expect(synth.speak(new AUFXSpeechUtterance("Hello"))).rejects.toMatchObject({ name: "AbortError" });
  expect(f.native.speak).not.toHaveBeenCalled();
});

it("rejects revoked active completion and ignores saved late callbacks", async () => {
  const f = fixture(), a = new AbortController(), b = new AbortController(); let permitted = true;
  const first = f.host.createSynthesizer(a.signal, () => permitted), second = f.host.createSynthesizer(b.signal, () => true);
  const p1 = first.speak(new AUFXSpeechUtterance("First")), p2 = second.speak(new AUFXSpeechUtterance("Second"));
  const late = f.utterances[0].onend;
  permitted = false;
  const rejection = expect(p1).rejects.toMatchObject({ name: "SecurityError" }); late(); await rejection;
  late(); expect(second.isSpeaking).toBe(true);
  f.utterances[1].onend(); await p2;
});

it("does not leak listeners for a pre-aborted owner", () => {
  const f = fixture(), owner = new AbortController(); owner.abort();
  f.host.createSynthesizer(owner.signal, () => true).dispose();
  expect(f.native.addEventListener).not.toHaveBeenCalled();
});

it("releases caller-aborted mounted synthesizer leases for reuse", () => {
  const f = fixture(), owner = new AbortController();
  const client = createMountedSpeechClient(f.host, owner.signal, () => ["audio.speech"]);
  for (let i = 0; i < 12; i++) {
    const caller = new AbortController(); client.createSynthesizer(caller.signal); caller.abort();
  }
  expect(() => client.createSynthesizer()).not.toThrow(); owner.abort();
});

it("resumes the shared native queue after cancelling a paused owner", async () => {
  const f = fixture(), a = new AbortController(), b = new AbortController();
  const first = f.host.createSynthesizer(a.signal, () => true), second = f.host.createSynthesizer(b.signal, () => true);
  const p1 = first.speak(new AUFXSpeechUtterance("First")), p2 = second.speak(new AUFXSpeechUtterance("Second"));
  first.pauseSpeaking(); const rejection = expect(p1).rejects.toMatchObject({ name: "AbortError" });
  a.abort(); await rejection; expect(f.native.resume).toHaveBeenCalledTimes(1);
  f.utterances[1].onend(); await p2;
});

it("validates voice metadata and hides the native synthesizer port", () => {
  expect(() => new AUFXSpeechUtterance("Hello", { language: 42 as any })).toThrow(TypeError);
  expect(() => new AUFXSpeechUtterance("Hello", { voiceIdentifier: {} as any })).toThrow(TypeError);
  const f = fixture(), synth = f.host.createSynthesizer(new AbortController().signal, () => true);
  expect(Object.keys(synth)).not.toContain("port"); synth.dispose();
});
