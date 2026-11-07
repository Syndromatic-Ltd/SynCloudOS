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
import { BrowserSpeechAdapter, type BrowserSpeechRecognition } from "../../../src/SynCloudOS/PlatformAdapters/BrowserSpeechAdapter";
import { createMountedSpeechClient } from "../../../src/SynCloudOS/AppSDK/mountedSpeechClient";

class Recognition implements BrowserSpeechRecognition {
  static instances: Recognition[] = [];
  lang = ""; continuous = false; interimResults = false; maxAlternatives = 1;
  onstart: (() => void) | null = null;
  onresult: BrowserSpeechRecognition["onresult"] = null;
  onerror: BrowserSpeechRecognition["onerror"] = null;
  onend: (() => void) | null = null;
  start = vi.fn(); stop = vi.fn(); abort = vi.fn();
  constructor() { Recognition.instances.push(this); }
}
function setup() {
  Recognition.instances = [];
  return new BrowserSpeechAdapter({ isSecureContext: true, browserWindow: { SpeechRecognition: Recognition } });
}
describe("SpeechFX web recognition", () => {
  it("keeps capability, factory and authorization inspection passive", async () => {
    const client = setup();
    const recognizer = client.createRecognizer();
    expect(client.getCapabilities().recognition).toBe(true);
    expect(await recognizer.getAuthorizationStatus()).toBe("unknown");
    expect(Recognition.instances).toHaveLength(0);
    recognizer.dispose();
    expect(await recognizer.getAuthorizationStatus()).toBe("unavailable");
  });
  it("copies browser results into deeply frozen snapshots and finishes on end", async () => {
    const recognizer = setup().createRecognizer();
    const listener = vi.fn();
    const task = recognizer.recognitionTask({ locale: "en-GB", reportsPartialResults: true }, listener);
    const native = Recognition.instances[0]!;
    expect(native.lang).toBe("en-GB");
    const alternative = { transcript: "hello", confidence: 0.9 };
    native.onresult!({ results: [{ 0: alternative, length: 1, isFinal: true }], resultIndex: 0 });
    alternative.transcript = "changed";
    native.onend!();
    const result = await task.result;
    expect(result.bestTranscription.formattedString).toBe("hello");
    expect(Object.isFrozen(result.bestTranscription)).toBe(true);
    expect(Object.isFrozen(result.transcriptions)).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(native.onresult).toBeNull();
  });
  it("normalizes whitespace at transcript boundaries while retaining segment text", async () => {
    const task = setup().createRecognizer().recognitionTask({});
    const native = Recognition.instances[0]!;
    native.onresult!({ results: [
      { 0: { transcript: "  hello", confidence: 0.9 }, length: 1, isFinal: true },
      { 0: { transcript: " world  ", confidence: 0.8 }, length: 1, isFinal: true },
      { 0: { transcript: "日本語の文章", confidence: 0.9 }, length: 1, isFinal: true },
    ], resultIndex: 0 });
    native.onend!();
    expect((await task.result).bestTranscription.formattedString).toBe("hello world 日本語の文章");
  });
  it("aborts device work and ignores late callbacks on owner cancellation", async () => {
    const owner = new AbortController();
    const task = setup().createRecognizer(owner.signal).recognitionTask({});
    const native = Recognition.instances[0]!;
    const ended = task.result.catch(error => error);
    owner.abort();
    expect((await ended).name).toBe("AbortError");
    expect(native.abort).toHaveBeenCalledTimes(1);
    expect(native.onresult).toBeNull();
  });
  it("requests real authorization through browser recognition and maps denial", async () => {
    const recognizer = setup().createRecognizer();
    const granted = recognizer.requestAuthorization();
    Recognition.instances[0]!.onstart!();
    expect(await granted).toBe("granted");
    expect(Recognition.instances[0]!.abort).toHaveBeenCalledOnce();
    const denied = recognizer.requestAuthorization();
    Recognition.instances[1]!.onerror!({ error: "not-allowed" });
    expect(await denied).toBe("denied");
    expect(await recognizer.getAuthorizationStatus()).toBe("denied");
  });
  it("rechecks mounted policy before every active call and cancels on unmount", async () => {
    const adapter = setup(); const mount = new AbortController(); let permitted = true;
    const client = createMountedSpeechClient(adapter, mount.signal, () => ["speech.recognize"], () => permitted);
    const recognizer = client.createRecognizer();
    permitted = false;
    expect(() => recognizer.recognitionTask({})).toThrow(/denied/i);
    expect(Recognition.instances).toHaveLength(0);
    permitted = true;
    const task = recognizer.recognitionTask({}); const result = task.result.catch(error => error);
    mount.abort();
    expect((await result).name).toBe("AbortError");
    expect(client.getCapabilities().recognition).toBe(false);
    expect(await recognizer.getAuthorizationStatus()).toBe("unavailable");
  });
  it("allows finish to stop microphone work after policy revocation and denies its final result", async () => {
    let permitted = true;
    const client = createMountedSpeechClient(setup(), new AbortController().signal, () => ["speech.recognize"], () => permitted);
    const task = client.createRecognizer().recognitionTask({});
    const result = task.result.catch(error => error);
    const native = Recognition.instances[0]!;
    permitted = false;
    expect(() => task.finish()).not.toThrow();
    expect(native.stop).toHaveBeenCalledOnce();
    native.onresult!({ results: [{ 0: { transcript: "private", confidence: 0.9 }, length: 1, isFinal: true }], resultIndex: 0 });
    native.onend!();
    expect((await result).name).toBe("SecurityError");
  });
  it("reports insecure and missing implementations without invoking browser APIs", async () => {
    const client = new BrowserSpeechAdapter({ isSecureContext: false, browserWindow: { SpeechRecognition: Recognition } });
    expect(client.getCapabilities().recognition).toBe(false);
    expect(await client.createRecognizer().requestAuthorization()).toBe("unavailable");
    const absent = createMountedSpeechClient(undefined, new AbortController().signal, () => [], () => true);
    expect(absent.getCapabilities().recognition).toBe(false);
    expect(await absent.createRecognizer().getAuthorizationStatus()).toBe("unavailable");
  });
  it("settles cancellation even if browser abort throws during cleanup", async () => {
    const recognizer = setup().createRecognizer();
    const task = recognizer.recognitionTask({});
    Recognition.instances[0]!.abort.mockImplementation(() => { throw new Error("browser closed"); });
    const result = task.result.catch(error => error);
    expect(() => task.cancel()).not.toThrow();
    expect((await result).name).toBe("AbortError");
    expect(Recognition.instances[0]!.onend).toBeNull();
  });
  it("honors request cancellation, finish and browser failures", async () => {
    const recognizer = setup().createRecognizer();
    const request = new AbortController();
    const task = recognizer.recognitionTask({ signal: request.signal });
    const cancelled = task.result.catch(error => error);
    task.finish();
    expect(Recognition.instances[0]!.stop).toHaveBeenCalledOnce();
    request.abort();
    expect((await cancelled).name).toBe("AbortError");
    const next = recognizer.recognitionTask({});
    const failed = next.result.catch(error => error);
    Recognition.instances[1]!.onerror!({ error: "network" });
    expect((await failed).name).toBe("OperationError");
    expect(() => recognizer.recognitionTask({ maximumAlternatives: 0 })).toThrow(RangeError);
  });
});
