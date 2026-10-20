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
  writeFileSync(join(consumer.root, "capture.mjs"), "\nimport assert from \"node:assert/strict\";\nimport { JSDOM } from \"jsdom\";\nimport { useVideo } from \"@syndromatic/syncloudos/sdk\";\nimport { createSynWare } from \"@syndromatic/syncloudos/sdk/testing\";\nimport { createSynWareTestHost } from \"@syndromatic/syncloudos/sdk/testing\";\n\nconst dom = new JSDOM('<!doctype html><html><body><div id=\"root\"></div></body></html>', { url: \"http://syncloudos.test/\" });\ndom.window.requestAnimationFrame = (callback) => dom.window.setTimeout(() => callback(Date.now()), 0);\ndom.window.cancelAnimationFrame = (handle) => dom.window.clearTimeout(handle);\nObject.defineProperty(globalThis, \"window\", { value: dom.window, configurable: true });\nObject.defineProperty(globalThis, \"document\", { value: dom.window.document, configurable: true });\nObject.defineProperty(globalThis, \"navigator\", { value: dom.window.navigator, configurable: true });\nObject.defineProperty(globalThis, \"HTMLElement\", { value: dom.window.HTMLElement, configurable: true });\n\nconst app = createSynWare({\n  manifest: {\n    schemaVersion: 1,\n    bundleIdentifier: \"com.syndromatic.installed-video-capture\",\n    version: \"1.0.0\",\n    displayName: \"Installed Video Capture\",\n    routes: [{ path: \"/installed-video-capture\", primary: true }],\n    permissions: [\"video.capture.camera\"],\n  },\n  root: () => null,\n});\nconst host = createSynWareTestHost({ app, document: dom.window.document });\nhost.adapters.video.allow();\nhost.adapters.permissions.allow();\nhost.adapters.policy.allow();\nawait host.render();\nconst session = host.appContext.video.createCaptureSession();\nassert.deepEqual(host.adapters.video.calls(), []);\nconst selected = await session.requestCamera({ width: 4096, height: 2160, frameRate: 120 });\nassert.equal(selected.kind, \"camera\");\nassert.equal(selected.width, 1280);\nassert.equal(selected.height, 720);\nassert.deepEqual(host.adapters.video.calls().map((call) => call.operation), [\"video.camera\"]);\nsession.dispose();\nawait host.dispose();\nassert.equal(typeof useVideo, \"function\");\nconsole.log(\"installed VideoFX scoped capture passed\");\n");
  const jsdomVersion = JSON.parse(readFileSync(join(process.cwd(), "node_modules/jsdom/package.json"), "utf8")).version as string;
  runNode([consumer.npm, "install", "--prefer-offline", "--ignore-scripts", "--package-lock=false", "jsdom@" + jsdomVersion], consumer.root);
  expect(runNode(["capture.mjs"], consumer.root)).toContain("installed VideoFX scoped capture passed");

  writeFileSync(join(consumer.root, "capture.ts"), `
import { useVideo } from "@syndromatic/syncloudos/sdk";
import type { VFXCaptureSession, VFXVideoClient } from "@syndromatic/syncloudos/fx/video";
declare const client: VFXVideoClient;
const session: VFXCaptureSession = client.createCaptureSession();
void session;
void useVideo;
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
