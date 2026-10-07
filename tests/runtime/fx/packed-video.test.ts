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

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createInstalledConsumer, runNode } from "../../../scripts/synware/installed-consumer.mjs";

it("executes and typechecks VideoFX frame ownership from an independently installed SDK archive", () => {
  const consumer = createInstalledConsumer(process.cwd(), "synware-video-packed-");
  writeFileSync(join(consumer.root, "specimen.mjs"), `
import assert from "node:assert/strict";
import { VFXDecoder, VFXEncodedChunk, VFXFrame, VFXPixelBuffer, VFXPixelBufferPool, VFXVideoFormat } from "@syndromatic/syncloudos/fx/video";
import { MEFXSampleTimingInfo, MEFXTime } from "@syndromatic/syncloudos/fx/media";

const format = new VFXVideoFormat({ codedWidth: 2, codedHeight: 2, pixelFormat: "rgba8", colourSpace: "srgb" });
const pool = new VFXPixelBufferPool({ maximumBuffers: 1, maximumBytes: 16 });
const pixels = pool.acquire(format, new Uint8Array(16).fill(7));
const timing = new MEFXSampleTimingInfo({ presentationTime: MEFXTime.finite(3n, 30), duration: MEFXTime.finite(1n, 30) });
const frame = new VFXFrame({ pixels, timing });
pixels.close();
const clone = frame.clone();
frame.close();
const clonePixels = clone.copyPixelBuffer();
assert.deepEqual([...clonePixels.copyData()], new Array(16).fill(7));
clonePixels.close();
const moved = clone.transfer();
assert.equal(clone.closed, true);
assert.equal(moved.timing, timing);
moved.close();
assert.equal(pool.diagnostics().availableBuffers, 1);
const reused = pool.acquire(format, new Uint8Array(16).fill(9));
assert.equal(pool.diagnostics().allocationCount, 1);
assert.deepEqual([...reused.copyData()], new Array(16).fill(9));
reused.close();
pool.dispose();

let callbacks;
const decoded = [];
const backend = {
  decodeQueueSize: 0,
  configure(_config, nextCallbacks) { callbacks = nextCallbacks; },
  decode(chunk) {
    const outputPixels = new VFXPixelBuffer(format, new Uint8Array(16).fill(chunk.type === "key" ? 11 : 12));
    const output = new VFXFrame({ pixels: outputPixels, timing: chunk.timing });
    outputPixels.close();
    callbacks.output(output);
  },
  async flush() {},
  reset() {},
  dispose() {},
};
const decoder = new VFXDecoder({ backend, output(output) { decoded.push(output); } });
decoder.configure({ codec: "fixture", codedWidth: 2, codedHeight: 2 });
const encoded = new VFXEncodedChunk({ type: "key", data: new Uint8Array([1, 2, 3]), timing });
assert.equal(encoded.webCodecsTiming().rounded, true);
decoder.decode(encoded);
await decoder.flush();
assert.equal(decoded.length, 1);
assert.equal(decoded[0].timing, timing);
decoded[0].close();
decoder.dispose();
console.log("VideoFX installed frame and decoder ownership passed");
`);
  expect(runNode(["specimen.mjs"], consumer.root)).toContain("VideoFX installed frame and decoder ownership passed");

  writeFileSync(join(consumer.root, "consumer.ts"), `
import { VFXDecoder, VFXEncodedChunk, VFXFrame, VFXPixelBuffer, VFXPixelBufferPool, VFXVideoFormat } from "@syndromatic/syncloudos/fx/video";
import type { VFXDecoderBackend, VFXDecoderConfig, VFXFrameInit, VFXPixelBufferPoolDiagnostics, VFXPixelBufferPoolOptions, VFXVideoFormatInit } from "@syndromatic/syncloudos/fx/video";
import { MEFXSampleTimingInfo, MEFXTime } from "@syndromatic/syncloudos/fx/media";

const init: VFXVideoFormatInit = { codedWidth: 1, codedHeight: 1, pixelFormat: "bgra8", colourSpace: "display-p3" };
const format = new VFXVideoFormat(init);
const pixels = new VFXPixelBuffer(format, new Uint8Array([3, 2, 1, 255]));
const timing = new MEFXSampleTimingInfo({ presentationTime: MEFXTime.finite(0n, 60), duration: MEFXTime.finite(1n, 60) });
const frameInit: VFXFrameInit = { pixels, timing };
const frame = new VFXFrame(frameInit);
const options: VFXPixelBufferPoolOptions = { maximumBuffers: 2, maximumBytes: 64 };
const pool = new VFXPixelBufferPool(options);
const diagnostics: VFXPixelBufferPoolDiagnostics = pool.diagnostics();
const decoderConfig: VFXDecoderConfig = { codec: "fixture", codedWidth: 1, codedHeight: 1, hardwareAcceleration: "no-preference", optimizeForLatency: false };
const backend: VFXDecoderBackend = { decodeQueueSize: 0, configure() {}, decode() {}, async flush() {}, reset() {}, dispose() {} };
const decoder = new VFXDecoder({ backend, output() {} });
decoder.configure(decoderConfig);
const encoded = new VFXEncodedChunk({ type: "key", data: new Uint8Array([1]), timing });
decoder.decode(encoded);
void decoder.flush();
decoder.dispose();
void diagnostics;
frame.close();
pixels.close();
pool.dispose();
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
