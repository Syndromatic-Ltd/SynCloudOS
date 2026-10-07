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
import { AUFXAudioChunkStream, AUFXAudioFile, AUFXAudioFormat, AUFXAudioPCMBuffer } from "../../../src/FX/AudioFX/public";
import { createMountedAudioFiles } from "../../../src/SynCloudOS/AppSDK/mountedAudioFiles";
import { RuntimeAudioFileService } from "../../../src/SynCloudOS/AudioFX/AudioFileService";

function file() { const pcm = new AUFXAudioPCMBuffer(new AUFXAudioFormat(8000, 1), 1); pcm.frameLength = 1; return new AUFXAudioFile(pcm); }
function sizedFile(samples: number) { const result = file(); Object.defineProperty(result, "length", { configurable: true, value: samples }); return result; }
function streamRequest() {
  const source = new AUFXAudioChunkStream(async function* () { /* The host owns consumption. */ });
  const sink = new WritableStream<Uint8Array>();
  return { source, sink, format: "opus-webm" as const, bitrate: 64_000 };
}

it("gates streaming export with audio.play and forwards its live source and sink to the host", async () => {
  const owner = new AbortController();
  let permissions: string[] = [];
  const exportStream = vi.fn(async () => ({ mimeType: "audio/webm" as const, fileType: "webm" as const, byteLength: 42 }));
  const host = { capabilities: () => Object.freeze({ decode: [], encode: [] }), openFile: vi.fn(), exportFile: vi.fn(), exportStream };
  const client = createMountedAudioFiles(host, owner.signal, () => permissions);
  const request = streamRequest();
  await expect(client.exportStream(request)).rejects.toMatchObject({ name: "SecurityError" });
  expect(exportStream).not.toHaveBeenCalled();
  permissions = ["audio.play"];
  await expect(client.exportStream(request)).resolves.toMatchObject({ fileType: "webm", byteLength: 42 });
  expect(exportStream).toHaveBeenCalledWith(request, expect.any(AbortSignal));
});

it("revokes a streaming export and retains its operation slot until a non-cooperative host settles", async () => {
  const finish: Array<(value: { mimeType: "audio/webm"; fileType: "webm"; byteLength: number }) => void> = [];
  const exportStream = vi.fn((_request: ReturnType<typeof streamRequest>, _signal: AbortSignal) => new Promise<{ mimeType: "audio/webm"; fileType: "webm"; byteLength: number }>(resolve => finish.push(resolve)));
  const host = { capabilities: () => Object.freeze({ decode: [], encode: [] }), openFile: vi.fn(), exportFile: vi.fn(), exportStream };
  const client = createMountedAudioFiles(host, new AbortController().signal, () => ["audio.play"]);
  const callers = Array.from({ length: 8 }, () => new AbortController());
  const pending = callers.map(controller => client.exportStream(streamRequest(), controller.signal));
  await vi.waitFor(() => expect(exportStream).toHaveBeenCalledTimes(8));
  callers[0].abort();
  await expect(pending[0]).rejects.toMatchObject({ name: "AbortError" });
  expect(exportStream.mock.calls[0][1].aborted).toBe(true);
  await expect(client.exportStream(streamRequest())).rejects.toMatchObject({ name: "QuotaExceededError" });
  finish[0]({ mimeType: "audio/webm", fileType: "webm", byteLength: 1 });
  await vi.waitFor(() => expect(exportStream.mock.calls[0][1].aborted).toBe(true));
  const retry = client.exportStream(streamRequest());
  await vi.waitFor(() => expect(exportStream).toHaveBeenCalledTimes(9));
  for (const resolve of finish.slice(1)) resolve({ mimeType: "audio/webm", fileType: "webm", byteLength: 1 });
  await Promise.all([...pending.slice(1), retry]);
});

it("requires audio.play and revokes every owned file with its mount", async () => {
  const opened = file(), host = { capabilities: () => Object.freeze({ decode: [], encode: [] }), openFile: vi.fn(async () => opened), exportFile: vi.fn() };
  let permissions: string[] = []; const owner = new AbortController(), client = createMountedAudioFiles(host, owner.signal, () => permissions);
  await expect(client.openFile({ source: "/tone.wav" })).rejects.toMatchObject({ name: "SecurityError" });
  permissions = ["audio.play"]; expect(await client.openFile({ source: "/tone.wav" })).toBe(opened);
  owner.abort(); expect(opened.isOpen).toBe(false);
});

it("keeps file identity isolated across mounted owners", async () => {
  const oneFile = file(), twoFile = file(); let next = oneFile;
  const host = { capabilities: () => Object.freeze({ decode: [], encode: [] }), openFile: vi.fn(async () => next), exportFile: vi.fn(async () => Object.freeze({ data: new Blob(), mimeType: "audio/wav", byteLength: 0, fileType: "wav" as const })) };
  const one = createMountedAudioFiles(host, new AbortController().signal, () => ["audio.play"]); next = oneFile; await one.openFile({ source: "/one.wav" });
  const two = createMountedAudioFiles(host, new AbortController().signal, () => ["audio.play"]); next = twoFile; await two.openFile({ source: "/two.wav" });
  await expect(two.exportFile(oneFile)).rejects.toMatchObject({ name: "SecurityError" });
  await expect(one.exportFile(oneFile)).resolves.toMatchObject({ fileType: "wav" });
});

it("forwards the typed compressed export request only for the owning mount", async () => {
  const owned = file();
  const exportFile = vi.fn(async () => Object.freeze({ data: new Blob(), mimeType: "audio/webm" as const, byteLength: 0, fileType: "webm" as const }));
  const host = { capabilities: () => Object.freeze({ decode: [], encode: [] }), openFile: vi.fn(async () => owned), exportFile };
  const client = createMountedAudioFiles(host, new AbortController().signal, () => ["audio.play"]);
  await client.openFile({ source: "/tone.wav" });
  const options = { format: "opus-webm" as const, bitrate: 64_000 };
  await expect(client.exportFile(owned, undefined, options)).resolves.toMatchObject({ fileType: "webm" });
  expect(exportFile).toHaveBeenCalledWith(owned, expect.any(AbortSignal), options);
});

it("closes a late file result when its owner is revoked during a non-cooperative open", async () => {
  const lateFile = file();
  let finish!: (value: AUFXAudioFile) => void;
  const host = {
    capabilities: () => Object.freeze({ decode: [], encode: [] }),
    openFile: vi.fn(() => new Promise<AUFXAudioFile>(resolve => { finish = resolve; })),
    exportFile: vi.fn(),
  };
  const owner = new AbortController();
  const client = createMountedAudioFiles(host, owner.signal, () => ["audio.play"]);
  const pending = client.openFile({ source: "/late.wav" });
  await vi.waitFor(() => expect(host.openFile).toHaveBeenCalled());
  owner.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  finish(lateFile);
  await vi.waitFor(() => expect(lateFile.isOpen).toBe(false));
});

it("bounds live files and releases the slot when a file closes", async () => {
  const host = { capabilities: () => Object.freeze({ decode: [], encode: [] }), openFile: vi.fn(async () => file()), exportFile: vi.fn() };
  const client = createMountedAudioFiles(host, new AbortController().signal, () => ["audio.play"]);
  const opened: AUFXAudioFile[] = [];
  for (let index = 0; index < 16; index++) opened.push(await client.openFile({ source: `/tone-${index}.wav` }));
  await expect(client.openFile({ source: "/over.wav" })).rejects.toMatchObject({ name: "QuotaExceededError" });
  opened[0].close();
  await expect(client.openFile({ source: "/retry.wav" })).resolves.toMatchObject({ isOpen: true });
});

it("reserves live-file slots while opens are pending", async () => {
  let finish!: (value: AUFXAudioFile) => void, hold = false;
  const host = { capabilities: () => Object.freeze({ decode: [], encode: [] }), openFile: vi.fn(() => hold ? new Promise<AUFXAudioFile>(resolve => { finish = resolve; }) : Promise.resolve(file())), exportFile: vi.fn() };
  const client = createMountedAudioFiles(host, new AbortController().signal, () => ["audio.play"]);
  const opened: AUFXAudioFile[] = [];
  for (let index = 0; index < 15; index++) opened.push(await client.openFile({ source: `/tone-${index}.wav` }));
  hold = true;
  const pending = client.openFile({ source: "/pending.wav" });
  await vi.waitFor(() => expect(host.openFile).toHaveBeenCalledTimes(16));
  await expect(client.openFile({ source: "/over.wav" })).rejects.toMatchObject({ name: "QuotaExceededError" });
  finish(file());
  await pending;
});

it("retains caller-aborted decode reservations until the non-cooperative host settles", async () => {
  const finishes: Array<(value: AUFXAudioFile) => void> = [];
  let hold = true;
  const host = { capabilities: () => Object.freeze({ decode: [], encode: [] }), openFile: vi.fn(() => hold ? new Promise<AUFXAudioFile>(resolve => finishes.push(resolve)) : Promise.resolve(file())), exportFile: vi.fn() };
  const client = createMountedAudioFiles(host, new AbortController().signal, () => ["audio.play"]);
  const controllers = [new AbortController(), new AbortController()];
  const pending = controllers.map((controller, index) => client.openFile({ source: `/pending-${index}.wav` }, controller.signal));
  await vi.waitFor(() => expect(host.openFile).toHaveBeenCalledTimes(2));
  controllers.forEach(controller => controller.abort());
  await Promise.all(pending.map(value => expect(value).rejects.toMatchObject({ name: "AbortError" })));
  await expect(client.openFile({ source: "/blocked.wav" })).rejects.toMatchObject({ name: "QuotaExceededError" });
  const late = file(); finishes.shift()!(late);
  await vi.waitFor(() => expect(late.isOpen).toBe(false));
  hold = false;
  await expect(client.openFile({ source: "/retry.wav" })).resolves.toMatchObject({ isOpen: true });
  finishes.shift()!(file());
});

it("prevents one runtime file identity from being owned by two mounts", async () => {
  const shared = file();
  const port = { capabilities: () => Object.freeze({ decode: [], encode: [] }), openFile: vi.fn(async () => shared), exportFile: vi.fn() };
  const service = new RuntimeAudioFileService(port);
  const one = createMountedAudioFiles(service, new AbortController().signal, () => ["audio.play"]);
  const two = createMountedAudioFiles(service, new AbortController().signal, () => ["audio.play"]);
  expect(await one.openFile({ source: "/shared.wav" })).toBe(shared);
  await expect(two.openFile({ source: "/shared.wav" })).rejects.toThrow(/identity.*owned/i);
  expect(shared.isOpen).toBe(true);
});

it("reserves aggregate decoded PCM before decode and releases it on close", async () => {
  const host = { capabilities: () => Object.freeze({ decode: [], encode: [] }), openFile: vi.fn(async () => sizedFile(16_777_216)), exportFile: vi.fn() };
  const client = createMountedAudioFiles(host, new AbortController().signal, () => ["audio.play"]);
  const one = await client.openFile({ source: "/one.wav" }), two = await client.openFile({ source: "/two.wav" });
  await expect(client.openFile({ source: "/over.wav" })).rejects.toMatchObject({ name: "QuotaExceededError" });
  one.close();
  await expect(client.openFile({ source: "/retry.wav" })).resolves.toMatchObject({ isOpen: true });
  two.close();
});

it("keeps reservations charged between host settlement and live-file accounting", async () => {
  const host = { capabilities: () => Object.freeze({ decode: [], encode: [] }), openFile: vi.fn(async () => sizedFile(16_777_216)), exportFile: vi.fn() };
  const client = createMountedAudioFiles(host, new AbortController().signal, () => ["audio.play"]);
  const first = client.openFile({ source: "/one.wav" }), second = client.openFile({ source: "/two.wav" });
  const interleaved = new Promise<PromiseSettledResult<AUFXAudioFile>[]>(resolve => queueMicrotask(() => {
    void Promise.allSettled([client.openFile({ source: "/three.wav" }), client.openFile({ source: "/four.wav" })]).then(resolve);
  }));
  const results = await interleaved;
  expect(results).toHaveLength(2);
  for (const result of results) { expect(result.status).toBe("rejected"); if (result.status === "rejected") expect(result.reason).toMatchObject({ name: "QuotaExceededError" }); }
  await Promise.all([first, second]);
  expect(host.openFile).toHaveBeenCalledTimes(2);
});

it("bounds pending operations and permits a retry after one settles", async () => {
  const opened = file();
  const finishes: Array<(value: { data: Blob; mimeType: "audio/wav"; byteLength: number; fileType: "wav" }) => void> = [];
  const host = {
    capabilities: () => Object.freeze({ decode: [], encode: [] }),
    openFile: vi.fn(async () => opened),
    exportFile: vi.fn(() => new Promise(resolve => finishes.push(resolve))),
  };
  const client = createMountedAudioFiles(host, new AbortController().signal, () => ["audio.play"]);
  await client.openFile({ source: "/tone.wav" });
  const pending = Array.from({ length: 8 }, () => client.exportFile(opened));
  await vi.waitFor(() => expect(host.exportFile).toHaveBeenCalledTimes(8));
  await expect(client.exportFile(opened)).rejects.toMatchObject({ name: "QuotaExceededError" });
  finishes.shift()!({ data: new Blob(), mimeType: "audio/wav", byteLength: 0, fileType: "wav" });
  await pending[0];
  const retry = client.exportFile(opened);
  await vi.waitFor(() => expect(host.exportFile).toHaveBeenCalledTimes(9));
  for (const finish of finishes.splice(0)) finish({ data: new Blob(), mimeType: "audio/wav", byteLength: 0, fileType: "wav" });
  await Promise.all([...pending.slice(1), retry]);
});
