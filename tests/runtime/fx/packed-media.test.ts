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

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createInstalledConsumer, runNode } from "../../../scripts/synware/installed-consumer.mjs";

it("executes and typechecks MediaFX from an independently installed SDK archive", () => {
  const consumer = createInstalledConsumer(process.cwd(), "synware-media-packed-");
  const jsdomVersion = JSON.parse(readFileSync(join(process.cwd(), "node_modules/jsdom/package.json"), "utf8")).version as string;
  runNode([
    consumer.npm,
    "install",
    "--prefer-offline",
    "--ignore-scripts",
    "--package-lock=false",
    `jsdom@${jsdomVersion}`,
  ], consumer.root);
  writeFileSync(join(consumer.root, "specimen.mjs"), `
import assert from "node:assert/strict";
import { MEFXBlockBuffer, MEFXBufferQueue, MEFXFormatDescription, MEFXSampleBuffer, MEFXSampleTimingInfo, MEFXTime, MEFXTimeRange, MEFXTimeMapping, MEFXTimebase } from "@syndromatic/syncloudos/fx/media";
import { createSynWare } from "@syndromatic/syncloudos/sdk";
import { createDeterministicRuntimeEnvironment, createSynWareTestHost } from "@syndromatic/syncloudos/sdk/testing";
import { JSDOM } from "jsdom";
const third = MEFXTime.finite(1n, 3);
const sixth = MEFXTime.finite(1n, 6);
assert.deepEqual(third.addDuration(sixth).value, {
  kind: "finite", value: 1n, timescale: 2, epoch: 0n, rounded: false,
});
const source = new MEFXTimeRange(MEFXTime.finite(0n, 1), MEFXTime.finite(10n, 1));
const target = new MEFXTimeRange(MEFXTime.finite(1001n, 30000), MEFXTime.finite(1001n, 100));
const mapping = new MEFXTimeMapping(source, target);
assert.equal(mapping.map(source.end).compare(target.end), 0);
const sourceClock = {
  seconds: 0,
  now() {
    return Object.freeze({
      position: MEFXTime.fromSeconds(this.seconds, 1000000, "nearest-even"),
      domain: "packed:test",
      generation: 0,
      uncertaintySeconds: 0,
    });
  },
  subscribeDiscontinuities() { return () => {}; },
};
const timebase = new MEFXTimebase(sourceClock, { mediaAnchor: MEFXTime.finite(5n, 1) });
sourceClock.seconds = 2;
assert.equal(timebase.now().position.toSeconds(), 7);
let releases = 0;
const block = new MEFXBlockBuffer(new Uint8Array([1, 2, 3, 4]), { onBackingRelease: () => { releases += 1; } });
const slice = block.slice(1, 3);
let transferred;
assert.equal(block.transfer((owned) => { transferred = owned; return "accepted"; }), "accepted");
assert.equal(block.closed, true);
const copied = new Uint8Array(slice.byteLength);
slice.copyTo(copied);
assert.deepEqual([...copied], [2, 3]);
slice.close();
assert.equal(releases, 0);
const format = new MEFXFormatDescription({ mediaType: "data", codec: "packed.fixture" });
const timing = new MEFXSampleTimingInfo({ presentationTime: MEFXTime.finite(0n, 1), duration: MEFXTime.finite(1n, 1) });
const samples = new MEFXSampleBuffer({ payload: transferred, format, sampleCount: 1, sampleSizes: [4], timings: [timing] });
assert.equal(samples.sampleSizeAt(0), 4);
samples.close();
transferred.close();
assert.equal(releases, 1);
const rejected = new MEFXBlockBuffer(new Uint8Array([9]));
await assert.rejects(rejected.transfer(async () => { throw new Error("packed rejection"); }), /packed rejection/);
assert.equal(rejected.closed, false);
rejected.close();
const queue = new MEFXBufferQueue({
  maxCount: 1,
  maxBytes: 8,
  overflow: "wait",
  byteCost: (value) => value.byteLength,
  transfer: (value, accept) => value.transfer(accept),
  close: (value) => value.close(),
});
const firstQueued = new MEFXBlockBuffer(new Uint8Array([11, 12]));
const secondQueued = new MEFXBlockBuffer(new Uint8Array([21, 22]));
await queue.enqueue(firstQueued);
assert.equal(firstQueued.closed, true);
const secondAdmission = queue.enqueue(secondQueued);
assert.equal(queue.snapshot().pendingEnqueues, 1);
assert.equal(secondQueued.closed, false);
const firstDequeued = await queue.dequeue();
assert.ok(firstDequeued);
firstDequeued.close();
await secondAdmission;
assert.equal(secondQueued.closed, true);
const secondDequeued = await queue.dequeue();
assert.ok(secondDequeued);
const secondCopy = new Uint8Array(secondDequeued.byteLength);
secondDequeued.copyTo(secondCopy);
assert.deepEqual([...secondCopy], [21, 22]);
secondDequeued.close();
queue.end();
assert.equal(await queue.dequeue(), null);
const deterministic = createDeterministicRuntimeEnvironment({ now: 10000 });
deterministic.clock.set(4000);
deterministic.mediaClock.advanceSeconds(2);
assert.equal(deterministic.environment.now(), 4000);
assert.equal(deterministic.environment.monotonicNowSeconds(), 2);
deterministic.dispose();

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://example.test/media" });
Object.defineProperty(dom.window, "requestAnimationFrame", {
  configurable: true,
  value: (callback) => dom.window.setTimeout(() => callback(Date.now()), 0),
});
Object.defineProperty(dom.window, "cancelAnimationFrame", {
  configurable: true,
  value: (handle) => dom.window.clearTimeout(handle),
});
Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
for (const key of ["HTMLElement", "Element", "Node", "Event", "CustomEvent", "MutationObserver"]) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}
Object.defineProperty(globalThis, "requestAnimationFrame", {
  configurable: true,
  value: dom.window.requestAnimationFrame.bind(dom.window),
});
Object.defineProperty(globalThis, "cancelAnimationFrame", {
  configurable: true,
  value: dom.window.cancelAnimationFrame.bind(dom.window),
});

const mountedApp = createSynWare({
  manifest: {
    schemaVersion: 1,
    id: "com.syndromatic.packed-media",
    version: "1.0.0",
    title: "Packed Media",
    routes: [{ path: "/packed-media", primary: true }],
    permissions: [],
  },
  root() { return null; },
});
const host = createSynWareTestHost({ app: mountedApp, document: dom.window.document });
await host.render();
const mounted = host.appContext.media.copyBlock(new Uint8Array([31, 32, 33]));
const mountedSlice = mounted.slice(1);
mounted.close();
const mountedCopy = new Uint8Array(mountedSlice.byteLength);
mountedSlice.copyTo(mountedCopy);
assert.deepEqual([...mountedCopy], [32, 33]);
const mountedQueue = host.appContext.media.createQueue({
  maxCount: 1,
  maxBytes: 4,
  byteCost: (value) => value.byteLength,
  transfer: (value, accept) => value.transfer(accept),
  close: (value) => value.close(),
});
const mountedQueued = host.appContext.media.copyBlock(new Uint8Array([41, 42]));
await mountedQueue.enqueue(mountedQueued);
assert.equal(mountedQueued.closed, true);
const mountedDequeued = await mountedQueue.dequeue();
assert.ok(mountedDequeued);
const mountedQueuedCopy = new Uint8Array(mountedDequeued.byteLength);
mountedDequeued.copyTo(mountedQueuedCopy);
assert.deepEqual([...mountedQueuedCopy], [41, 42]);
mountedDequeued.close();
mountedQueue.dispose();
const mountedClock = host.appContext.media.observeClock();
host.mediaClock.advanceSeconds(1.5);
assert.equal(mountedClock.now().position.toSeconds(), 1.5);
await host.dispose();
assert.equal(mountedSlice.closed, true);
assert.throws(() => mountedClock.now(), (error) => error?.name === "AbortError");
dom.window.close();
console.log("MediaFX installed operations passed");
`);
  expect(runNode(["specimen.mjs"], consumer.root)).toContain("MediaFX installed operations passed");

  writeFileSync(join(consumer.root, "consumer.ts"), `
import { MEFXBlockBuffer, MEFXBufferQueue, MEFXFormatDescription, MEFXSampleBuffer, MEFXSampleTimingInfo, MEFXTime, MEFXTimeRange, MEFXTimeMapping, MEFXTimebase } from "@syndromatic/syncloudos/fx/media";
import type { MEFXBlockSegmentInput, MEFXBufferQueueOptions, MEFXBufferQueueSnapshot, MEFXClock, MEFXClockReading, MEFXComparison, MEFXFormatDescriptionInit, MEFXRounding, MEFXSampleBufferInit, MEFXTimeJSON, MEFXTimebaseSnapshot } from "@syndromatic/syncloudos/fx/media";
import type { MEFXMediaClient } from "@syndromatic/syncloudos/sdk";
import { useSynWareMedia } from "@syndromatic/syncloudos/sdk";
import { createDeterministicRuntimeEnvironment } from "@syndromatic/syncloudos/sdk/testing";
const rounding: MEFXRounding = "nearest-even";
const time = MEFXTime.finite(1n, 3).convertScale(600, rounding);
const json: MEFXTimeJSON = time.toJSON();
const restored = MEFXTime.fromJSON(json);
const range = new MEFXTimeRange(restored, MEFXTime.finite(1n, 1));
const mapping = new MEFXTimeMapping(range, range);
const comparison: MEFXComparison = mapping.map(restored).compare(restored);
const reading: MEFXClockReading = { position: restored, domain: "typed", generation: 0, uncertaintySeconds: 0 };
const clock: MEFXClock = { now: () => reading, subscribeDiscontinuities: () => () => undefined };
const timebase = new MEFXTimebase(clock);
const snapshot: MEFXTimebaseSnapshot = timebase.snapshot();
const segment: MEFXBlockSegmentInput = new Uint8Array([1, 2]);
const block = new MEFXBlockBuffer(segment);
const formatInit: MEFXFormatDescriptionInit = { mediaType: "data", codec: "typed.fixture" };
const format = new MEFXFormatDescription(formatInit);
const timing = new MEFXSampleTimingInfo({ presentationTime: restored, duration: MEFXTime.finite(1n, 1) });
const sampleInit: MEFXSampleBufferInit = { payload: block, format, sampleCount: 1, sampleSizes: [2], timings: [timing] };
const samples = new MEFXSampleBuffer(sampleInit);
samples.close();
block.close();
const queueOptions: MEFXBufferQueueOptions<MEFXBlockBuffer> = {
  maxCount: 2,
  maxBytes: 8,
  byteCost: (value) => value.byteLength,
  transfer: (value, accept) => value.transfer(accept),
  close: (value) => value.close(),
};
const queue = new MEFXBufferQueue(queueOptions);
const queueSnapshot: MEFXBufferQueueSnapshot = queue.snapshot();
void queueSnapshot;
queue.dispose();
declare const mediaClient: MEFXMediaClient;
mediaClient.copyBlock(new Uint8Array([1])).close();
void useSynWareMedia;
const deterministic = createDeterministicRuntimeEnvironment();
deterministic.mediaClock.advanceSeconds(1);
void snapshot;
deterministic.dispose();
void comparison;
`);
  writeFileSync(join(consumer.root, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    },
    files: ["consumer.ts"],
  }, null, 2));
  expect(runNode([join(consumer.root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], consumer.root)).toBe("");
}, 120000);
