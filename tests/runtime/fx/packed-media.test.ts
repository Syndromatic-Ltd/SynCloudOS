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
  writeFileSync(join(consumer.root, "specimen.mjs"), "\nimport assert from \"node:assert/strict\";\nimport { MEFXBlockBuffer, MEFXBufferQueue, MEFXFormatDescription, MEFXSampleBuffer, MEFXSampleTimingInfo, MEFXTime, MEFXTimeRange, MEFXTimeMapping, MEFXTimebase } from \"@syndromatic/syncloudos/fx/media\";\nimport { createSynWare } from \"@syndromatic/syncloudos/sdk/testing\";\nimport { createDeterministicRuntimeEnvironment, createSynWareTestHost } from \"@syndromatic/syncloudos/sdk/testing\";\nimport { JSDOM } from \"jsdom\";\nconst third = MEFXTime.finite(1n, 3);\nconst sixth = MEFXTime.finite(1n, 6);\nassert.deepEqual(third.addDuration(sixth).value, {\n  kind: \"finite\", value: 1n, timescale: 2, epoch: 0n, rounded: false,\n});\nconst source = new MEFXTimeRange(MEFXTime.finite(0n, 1), MEFXTime.finite(10n, 1));\nconst target = new MEFXTimeRange(MEFXTime.finite(1001n, 30000), MEFXTime.finite(1001n, 100));\nconst mapping = new MEFXTimeMapping(source, target);\nassert.equal(mapping.map(source.end).compare(target.end), 0);\nconst sourceClock = {\n  seconds: 0,\n  now() {\n    return Object.freeze({\n      position: MEFXTime.fromSeconds(this.seconds, 1000000, \"nearest-even\"),\n      domain: \"packed:test\",\n      generation: 0,\n      uncertaintySeconds: 0,\n    });\n  },\n  subscribeDiscontinuities() { return () => {}; },\n};\nconst timebase = new MEFXTimebase(sourceClock, { mediaAnchor: MEFXTime.finite(5n, 1) });\nsourceClock.seconds = 2;\nassert.equal(timebase.now().position.toSeconds(), 7);\nlet releases = 0;\nconst block = new MEFXBlockBuffer(new Uint8Array([1, 2, 3, 4]), { onBackingRelease: () => { releases += 1; } });\nconst slice = block.slice(1, 3);\nlet transferred;\nassert.equal(block.transfer((owned) => { transferred = owned; return \"accepted\"; }), \"accepted\");\nassert.equal(block.closed, true);\nconst copied = new Uint8Array(slice.byteLength);\nslice.copyTo(copied);\nassert.deepEqual([...copied], [2, 3]);\nslice.close();\nassert.equal(releases, 0);\nconst format = new MEFXFormatDescription({ mediaType: \"data\", codec: \"packed.fixture\" });\nconst timing = new MEFXSampleTimingInfo({ presentationTime: MEFXTime.finite(0n, 1), duration: MEFXTime.finite(1n, 1) });\nconst samples = new MEFXSampleBuffer({ payload: transferred, format, sampleCount: 1, sampleSizes: [4], timings: [timing] });\nassert.equal(samples.sampleSizeAt(0), 4);\nsamples.close();\ntransferred.close();\nassert.equal(releases, 1);\nconst rejected = new MEFXBlockBuffer(new Uint8Array([9]));\nawait assert.rejects(rejected.transfer(async () => { throw new Error(\"packed rejection\"); }), /packed rejection/);\nassert.equal(rejected.closed, false);\nrejected.close();\nconst queue = new MEFXBufferQueue({\n  maxCount: 1,\n  maxBytes: 8,\n  overflow: \"wait\",\n  byteCost: (value) => value.byteLength,\n  transfer: (value, accept) => value.transfer(accept),\n  close: (value) => value.close(),\n});\nconst firstQueued = new MEFXBlockBuffer(new Uint8Array([11, 12]));\nconst secondQueued = new MEFXBlockBuffer(new Uint8Array([21, 22]));\nawait queue.enqueue(firstQueued);\nassert.equal(firstQueued.closed, true);\nconst secondAdmission = queue.enqueue(secondQueued);\nassert.equal(queue.snapshot().pendingEnqueues, 1);\nassert.equal(secondQueued.closed, false);\nconst firstDequeued = await queue.dequeue();\nassert.ok(firstDequeued);\nfirstDequeued.close();\nawait secondAdmission;\nassert.equal(secondQueued.closed, true);\nconst secondDequeued = await queue.dequeue();\nassert.ok(secondDequeued);\nconst secondCopy = new Uint8Array(secondDequeued.byteLength);\nsecondDequeued.copyTo(secondCopy);\nassert.deepEqual([...secondCopy], [21, 22]);\nsecondDequeued.close();\nqueue.end();\nassert.equal(await queue.dequeue(), null);\nconst deterministic = createDeterministicRuntimeEnvironment({ now: 10000 });\ndeterministic.clock.set(4000);\ndeterministic.mediaClock.advanceSeconds(2);\nassert.equal(deterministic.environment.now(), 4000);\nassert.equal(deterministic.environment.monotonicNowSeconds(), 2);\ndeterministic.dispose();\n\nconst dom = new JSDOM(\"<!doctype html><html><body></body></html>\", { url: \"https://example.test/media\" });\nObject.defineProperty(dom.window, \"requestAnimationFrame\", {\n  configurable: true,\n  value: (callback) => dom.window.setTimeout(() => callback(Date.now()), 0),\n});\nObject.defineProperty(dom.window, \"cancelAnimationFrame\", {\n  configurable: true,\n  value: (handle) => dom.window.clearTimeout(handle),\n});\nObject.defineProperty(globalThis, \"window\", { configurable: true, value: dom.window });\nObject.defineProperty(globalThis, \"document\", { configurable: true, value: dom.window.document });\nObject.defineProperty(globalThis, \"navigator\", { configurable: true, value: dom.window.navigator });\nfor (const key of [\"HTMLElement\", \"Element\", \"Node\", \"Event\", \"CustomEvent\", \"MutationObserver\"]) {\n  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });\n}\nObject.defineProperty(globalThis, \"requestAnimationFrame\", {\n  configurable: true,\n  value: dom.window.requestAnimationFrame.bind(dom.window),\n});\nObject.defineProperty(globalThis, \"cancelAnimationFrame\", {\n  configurable: true,\n  value: dom.window.cancelAnimationFrame.bind(dom.window),\n});\n\nconst mountedApp = createSynWare({\n  manifest: {\n    schemaVersion: 1,\n    bundleIdentifier: \"com.syndromatic.packed-media\",\n    version: \"1.0.0\",\n    displayName: \"Packed Media\",\n    routes: [{ path: \"/packed-media\", primary: true }],\n    permissions: [],\n  },\n  root() { return null; },\n});\nconst host = createSynWareTestHost({ app: mountedApp, document: dom.window.document });\nawait host.render();\nconst mounted = host.appContext.media.copyBlock(new Uint8Array([31, 32, 33]));\nconst mountedSlice = mounted.slice(1);\nmounted.close();\nconst mountedCopy = new Uint8Array(mountedSlice.byteLength);\nmountedSlice.copyTo(mountedCopy);\nassert.deepEqual([...mountedCopy], [32, 33]);\nconst mountedQueue = host.appContext.media.createQueue({\n  maxCount: 1,\n  maxBytes: 4,\n  byteCost: (value) => value.byteLength,\n  transfer: (value, accept) => value.transfer(accept),\n  close: (value) => value.close(),\n});\nconst mountedQueued = host.appContext.media.copyBlock(new Uint8Array([41, 42]));\nawait mountedQueue.enqueue(mountedQueued);\nassert.equal(mountedQueued.closed, true);\nconst mountedDequeued = await mountedQueue.dequeue();\nassert.ok(mountedDequeued);\nconst mountedQueuedCopy = new Uint8Array(mountedDequeued.byteLength);\nmountedDequeued.copyTo(mountedQueuedCopy);\nassert.deepEqual([...mountedQueuedCopy], [41, 42]);\nmountedDequeued.close();\nmountedQueue.dispose();\nconst mountedClock = host.appContext.media.observeClock();\nhost.mediaClock.advanceSeconds(1.5);\nassert.equal(mountedClock.now().position.toSeconds(), 1.5);\nawait host.dispose();\nassert.equal(mountedSlice.closed, true);\nassert.throws(() => mountedClock.now(), (error) => error?.name === \"AbortError\");\ndom.window.close();\nconsole.log(\"MediaFX installed operations passed\");\n");
  expect(runNode(["specimen.mjs"], consumer.root)).toContain("MediaFX installed operations passed");

  writeFileSync(join(consumer.root, "consumer.ts"), `
import { MEFXBlockBuffer, MEFXBufferQueue, MEFXFormatDescription, MEFXSampleBuffer, MEFXSampleTimingInfo, MEFXTime, MEFXTimeRange, MEFXTimeMapping, MEFXTimebase } from "@syndromatic/syncloudos/fx/media";
import type { MEFXBlockSegmentInput, MEFXBufferQueueOptions, MEFXBufferQueueSnapshot, MEFXClock, MEFXClockReading, MEFXComparison, MEFXFormatDescriptionInit, MEFXRounding, MEFXSampleBufferInit, MEFXTimeJSON, MEFXTimebaseSnapshot } from "@syndromatic/syncloudos/fx/media";
import type { MEFXMediaClient } from "@syndromatic/syncloudos/sdk";
import { useMedia } from "@syndromatic/syncloudos/sdk";
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
void useMedia;
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
