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

// @vitest-environment jsdom

import { expect, it } from "vitest";
import { SynCloudOSLifecycleError } from "../../../src/SynCloudOS/fxRuntimeContracts";
import { createSynWare } from "../../../src/SynCloudOS/AppSDK";
import { createSynWareTestHost } from "../../../src/SynCloudOS/AppSDK/testing";
import {
  MEFXBlockBuffer,
  MEFXBufferQueue,
  type MEFXBufferQueueOptions,
  type MEFXClock,
  type MEFXTimebase,
  type MEFXTimebaseOptions,
} from "../../../src/FX/MediaFX/public";
import { createMountedMediaClient } from "../../../src/SynCloudOS/AppSDK/mountedMediaClient";
import { MediaClockService } from "../../../src/SynCloudOS/MediaFX/MediaClockService";

type MountedMediaProbe = Readonly<{
  copyBlock(bytes: Uint8Array, signal?: AbortSignal): MEFXBlockBuffer;
  createQueue<T>(options: MEFXBufferQueueOptions<T>, signal?: AbortSignal): MEFXBufferQueue<T>;
  observeClock(signal?: AbortSignal): MEFXClock & { dispose(): void };
  createTimebase(options?: MEFXTimebaseOptions, signal?: AbortSignal): MEFXTimebase;
}>;

const MediaProbe = createSynWare({
  manifest: {
    schemaVersion: 1,
    bundleIdentifier: "com.syndromatic.media-probe",
    version: "1.0.0",
    displayName: "Media Probe",
    routes: [{ path: "/media-probe", primary: true }],
    permissions: [],
  },
  root() {
    return null;
  },
});

function mediaOf(host: ReturnType<typeof createSynWareTestHost>): MountedMediaProbe {
  const media = (host.appContext as unknown as { media?: MountedMediaProbe }).media;
  expect(media).toBeDefined();
  return media!;
}

function bytesOf(block: MEFXBlockBuffer): number[] {
  const bytes = new Uint8Array(block.byteLength);
  block.copyTo(bytes);
  return [...bytes];
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

it("copies runtime-owned media blocks and keeps retained slices alive until their own release", async () => {
  const host = createSynWareTestHost({ app: MediaProbe, document });
  await host.render();
  try {
    const media = mediaOf(host);
    const input = new Uint8Array([1, 2, 3, 4]);
    const block = media.copyBlock(input);
    input[1] = 99;
    expect(bytesOf(block)).toEqual([1, 2, 3, 4]);

    const slice = block.slice(1, 3);
    block.close();
    expect(bytesOf(slice)).toEqual([2, 3]);

    await host.dispose();
    expect(slice.closed).toBe(true);
    expect(() => bytesOf(slice)).toThrow(SynCloudOSLifecycleError);
  } finally {
    await host.dispose();
  }
});

it("creates a mounted bounded queue that is revoked with the app owner", async () => {
  const host = createSynWareTestHost({ app: MediaProbe, document });
  await host.render();
  try {
    const media = mediaOf(host);
    const queue = media.createQueue<MEFXBlockBuffer>({
      maxCount: 2,
      maxBytes: 8,
      overflow: "wait",
      byteCost: (value) => value.byteLength,
      transfer: (value, accept) => value.transfer(accept),
      close: (value) => value.close(),
    });
    const source = new MEFXBlockBuffer(new Uint8Array([5, 6]));
    await queue.enqueue(source);
    expect(source.closed).toBe(true);
    const owned = await queue.dequeue();
    expect(owned && bytesOf(owned)).toEqual([5, 6]);
    owned?.close();

    await host.dispose();
    expect(queue.snapshot().disposed).toBe(true);
    const late = new MEFXBlockBuffer(new Uint8Array([7]));
    await expect(queue.enqueue(late)).rejects.toThrow(expect.objectContaining({ code: "MEFX_BUFFER_QUEUE_DISPOSED" }));
    expect(late.closed).toBe(false);
    late.close();
  } finally {
    await host.dispose();
  }
});

it("rejects an asynchronous block transfer whose mounted owner is revoked before acceptance settles", async () => {
  const host = createSynWareTestHost({ app: MediaProbe, document });
  await host.render();
  const gate = deferred<void>();
  const block = mediaOf(host).copyBlock(new Uint8Array([8, 9]));
  let transferred: MEFXBlockBuffer | null = null;
  const pending = block.transfer(async (owned) => {
    transferred = owned;
    await gate.promise;
    return "accepted";
  });

  await host.dispose();
  expect(block.closed).toBe(true);
  expect(transferred?.closed).toBe(true);
  gate.resolve();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
});

it("charges one backing allocation and one mounted handle per retained block view", () => {
  const mount = new AbortController();
  const clockService = new MediaClockService("runtime:media-budget" as never, () => 0);
  const media = createMountedMediaClient(clockService, mount.signal, {
    maxHandles: 2,
    bytes: 4,
    sessions: 1,
    workerJobs: 0,
  });

  const block = media.copyBlock(new Uint8Array([1, 2, 3, 4]));
  const slice = block.slice(1, 3);
  expect(() => block.slice()).toThrowError(DOMException);

  block.close();
  expect(() => media.copyBlock(new Uint8Array([5]))).toThrowError(DOMException);
  expect(bytesOf(slice)).toEqual([2, 3]);

  slice.close();
  const replacement = media.copyBlock(new Uint8Array([5, 6, 7, 8]));
  expect(bytesOf(replacement)).toEqual([5, 6, 7, 8]);
  replacement.close();

  const queue = media.createQueue<MEFXBlockBuffer>({
    maxCount: 1,
    maxBytes: 4,
    byteCost: (value) => value.byteLength,
    transfer: (value, accept) => value.transfer(accept),
    close: (value) => value.close(),
  });
  expect(() => media.createQueue({
    maxCount: 1,
    maxBytes: 1,
    byteCost: () => 0,
    transfer: (value: object, accept: (owned: object) => unknown) => accept(value),
    close: () => undefined,
  })).toThrowError(DOMException);
  queue.dispose();
  const replacementQueue = media.createQueue({
    maxCount: 1,
    maxBytes: 1,
    byteCost: () => 0,
    transfer: (value: object, accept: (owned: object) => unknown) => accept(value),
    close: () => undefined,
  });
  replacementQueue.dispose();
  mount.abort();
  clockService.dispose();
});

it("scopes runtime media clocks and timebases without requesting a device permission", async () => {
  const host = createSynWareTestHost({ app: MediaProbe, document });
  await host.render();
  try {
    const media = mediaOf(host);
    const clock = media.observeClock();
    expect(clock.now().position.toSeconds()).toBe(0);
    host.mediaClock.advanceSeconds(2.5);
    expect(clock.now().position.toSeconds()).toBeCloseTo(2.5);

    const timebase = media.createTimebase();
    expect(timebase.now().position.toSeconds()).toBe(0);
    host.mediaClock.advanceSeconds(1.25);
    expect(timebase.now().position.toSeconds()).toBeCloseTo(1.25);

    await host.dispose();
    expect(() => clock.now()).toThrowError(DOMException);
    expect(() => timebase.now()).toThrowError(DOMException);
  } finally {
    await host.dispose();
  }
});
