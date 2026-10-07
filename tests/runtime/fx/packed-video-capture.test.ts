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

it("executes scoped VideoFX capture from an independently installed SDK archive", () => {
  const consumer = createInstalledConsumer(process.cwd(), "synware-video-capture-packed-");
  writeFileSync(join(consumer.root, "capture.mjs"), `
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createSynWare, useSynWareVideo } from "@syndromatic/syncloudos/sdk";
import { createSynWareTestHost } from "@syndromatic/syncloudos/sdk/testing";

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "http://syncloudos.test/" });
dom.window.requestAnimationFrame = (callback) => dom.window.setTimeout(() => callback(Date.now()), 0);
dom.window.cancelAnimationFrame = (handle) => dom.window.clearTimeout(handle);
Object.defineProperty(globalThis, "window", { value: dom.window, configurable: true });
Object.defineProperty(globalThis, "document", { value: dom.window.document, configurable: true });
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
Object.defineProperty(globalThis, "HTMLElement", { value: dom.window.HTMLElement, configurable: true });

const app = createSynWare({
  manifest: {
    schemaVersion: 1,
    id: "com.syndromatic.installed-video-capture",
    version: "1.0.0",
    title: "Installed Video Capture",
    routes: [{ path: "/installed-video-capture", primary: true }],
    permissions: ["video.capture.camera"],
  },
  root: () => null,
});
const host = createSynWareTestHost({ app, document: dom.window.document });
host.adapters.video.allow();
host.adapters.permissions.allow();
host.adapters.policy.allow();
await host.render();
const session = host.appContext.video.createCaptureSession();
assert.deepEqual(host.adapters.video.calls(), []);
const selected = await session.requestCamera({ width: 4096, height: 2160, frameRate: 120 });
assert.equal(selected.kind, "camera");
assert.equal(selected.width, 1280);
assert.equal(selected.height, 720);
assert.deepEqual(host.adapters.video.calls().map((call) => call.operation), ["video.camera"]);
session.dispose();
await host.dispose();
assert.equal(typeof useSynWareVideo, "function");
console.log("installed VideoFX scoped capture passed");
`);
  const jsdomVersion = JSON.parse(readFileSync(join(process.cwd(), "node_modules/jsdom/package.json"), "utf8")).version as string;
  runNode([consumer.npm, "install", "--prefer-offline", "--ignore-scripts", "--package-lock=false", "jsdom@" + jsdomVersion], consumer.root);
  expect(runNode(["capture.mjs"], consumer.root)).toContain("installed VideoFX scoped capture passed");

  writeFileSync(join(consumer.root, "capture.ts"), `
import { useSynWareVideo } from "@syndromatic/syncloudos/sdk";
import type { VFXCaptureSession, VFXVideoClient } from "@syndromatic/syncloudos/fx/video";
declare const client: VFXVideoClient;
const session: VFXCaptureSession = client.createCaptureSession();
void session;
void useSynWareVideo;
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
    files: ["capture.ts"],
  }, null, 2));
  expect(runNode([join(consumer.root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], consumer.root)).toBe("");
}, 120000);
