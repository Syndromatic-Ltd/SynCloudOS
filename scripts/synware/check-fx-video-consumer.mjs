#!/usr/bin/env node
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

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "playwright";
import { assertIndependentModules, createInstalledConsumer, isWithin, runNode } from "./installed-consumer.mjs";
import { assertSdkSourceUnchanged, captureSdkSourceFingerprint } from "./sdk-package-manifest.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const output = resolve(repositoryRoot, ".artifacts/synapp-sdk/fx-video-consumer.json");
const sha = path => createHash("sha256").update(readFileSync(path)).digest("hex");
const write = (root, path, contents) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), contents);
};

function staticServer(directory) {
  const mime = { ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript", ".css": "text/css", ".wasm": "application/wasm" };
  const server = createServer((request, response) => {
    const requested = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const path = resolve(directory, "." + (requested === "/" ? "/index.html" : requested));
    if (!isWithin(directory, path)) { response.writeHead(403).end(); return; }
    if (!existsSync(path)) { response.writeHead(404).end(); return; }
    response.setHeader("Content-Type", mime[extname(path)] ?? "application/octet-stream");
    response.end(readFileSync(path));
  });
  return new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => accept({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

const probeSource = `import { useEffect } from "react";
import { mountSynCloudOS } from "@syndromatic/syncloudos/browser";
import { createSynWare, useSynWare } from "@syndromatic/syncloudos/sdk";
import { MEFXSampleTimingInfo, MEFXTime } from "@syndromatic/syncloudos/fx/media";
import { VFXEncodedChunk } from "@syndromatic/syncloudos/fx/video";
import { defineWebspring, type WebspringViewProps } from "@syndromatic/syncloudos/webspring";

declare global { interface Window { fxVideo: any; } }
window.fxVideo = { ready: false };

type EncodedFixture = { type: "key" | "delta"; data: Uint8Array; timestamp: number; duration: number | null };

async function encodeFixture(): Promise<EncodedFixture> {
  const Encoder = globalThis.VideoEncoder;
  if (typeof Encoder !== "function") throw new DOMException("WebCodecs VideoEncoder is unavailable.", "NotSupportedError");
  const support = await Encoder.isConfigSupported({ codec: "vp8", width: 16, height: 16, bitrate: 100_000, framerate: 30 });
  if (!support.supported) throw new DOMException("VP8 VideoEncoder is unavailable.", "NotSupportedError");
  let resolveChunk!: (value: EncodedFixture) => void;
  let rejectChunk!: (reason: unknown) => void;
  const chunk = new Promise<EncodedFixture>((resolve, reject) => { resolveChunk = resolve; rejectChunk = reject; });
  const encoder = new Encoder({
    output(encoded) {
      const data = new Uint8Array(encoded.byteLength);
      encoded.copyTo(data);
      resolveChunk({ type: encoded.type, data, timestamp: encoded.timestamp, duration: encoded.duration ?? null });
    },
    error: rejectChunk,
  });
  encoder.configure(support.config ?? { codec: "vp8", width: 16, height: 16, bitrate: 100_000, framerate: 30 });
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas is unavailable.");
  context.fillStyle = "#c03020";
  context.fillRect(0, 0, 16, 16);
  const frame = new VideoFrame(canvas, { timestamp: 0, duration: 33_333 });
  encoder.encode(frame, { keyFrame: true });
  frame.close();
  await encoder.flush();
  encoder.close();
  return chunk;
}

function Probe() {
  const app = useSynWare();
  useEffect(() => {
    void (async () => {
      const decoderConfig = { codec: "vp8", codedWidth: 16, codedHeight: 16 } as const;
      const supported = await app.video.queryDecoder(decoderConfig);
      const unsupported = await app.video.queryDecoder({ codec: "definitely-not-a-real-video-codec", codedWidth: 16, codedHeight: 16 });
      const globals = {
        decoder: typeof globalThis.VideoDecoder === "function",
        encoder: typeof globalThis.VideoEncoder === "function",
      };

      if (!globals.decoder || !globals.encoder || !supported.supported) {
        window.fxVideo = { ready: true, available: false, globals, supported, unsupported };
        return;
      }

      const encoded = await encodeFixture();
      const decoded: Array<{ width: number; height: number; pixelFormat: string; timestamp: string }> = [];
      const decoder = app.video.createDecoder({
        output(frame) {
          decoded.push({
            width: frame.format.codedWidth,
            height: frame.format.codedHeight,
            pixelFormat: frame.format.pixelFormat,
            timestamp: frame.timing.presentationTime.toString(),
          });
          frame.close();
        },
      });
      try {
        decoder.configure(decoderConfig);
        decoder.decode(new VFXEncodedChunk({
          type: encoded.type,
          data: encoded.data,
          timing: new MEFXSampleTimingInfo({
            presentationTime: MEFXTime.finite(BigInt(encoded.timestamp), 1_000_000),
            duration: encoded.duration == null ? null : MEFXTime.finite(BigInt(encoded.duration), 1_000_000),
          }),
        }));
        await decoder.flush();
        window.fxVideo = {
          ready: true,
          available: true,
          globals,
          supported,
          unsupported,
          decoded,
          decoderStateBeforeDispose: decoder.state,
        };
      } finally {
        decoder.dispose();
      }
    })().catch(error => {
      window.fxVideo = { ready: false, error: error instanceof Error ? error.stack ?? error.message : String(error) };
    });
  }, [app]);
  return <p id="probe">VFX-02 installed WebCodecs probe</p>;
}

function Website({ actions, applicationOutlet }: WebspringViewProps) {
  return <main><button id="open" onClick={() => { void actions.openApp("org.example.vfx02"); }}>Open VFX-02 probe</button>{applicationOutlet}</main>;
}

const shell = defineWebspring({
  manifest: {
    schemaVersion: 1,
    id: "org.example.vfx02-shell",
    version: "1.0.0",
    title: "VFX-02 shell",
    webspringShell: {
      views: [{ id: "website", presentations: ["desktop", "tablet", "mobile"], mode: "persistent" }],
      defaults: { desktop: "website", tablet: "website", mobile: "website" },
      homeRoute: "/",
      branding: { name: { key: "brand", fallback: "VFX-02" } },
    },
  },
  components: { website: Website },
});

const app = createSynWare({
  manifest: {
    schemaVersion: 1,
    id: "org.example.vfx02",
    version: "1.0.0",
    title: "VFX-02 Probe",
    runtime: { policy: { public: true } },
    presentations: ["desktop", "tablet", "mobile"],
    routes: [{ path: "/vfx02", primary: true }],
    webspring: { visible: true, order: 1 },
  },
  root: Probe,
});

const element = document.getElementById("root")!;
mountSynCloudOS({ element, bundles: [app], shell, authentication: "disabled" })
  .then(host => { window.fxVideo.dispose = () => host.dispose("VFX-02 consumer verification"); })
  .catch(error => { window.fxVideo = { ready: false, error: String(error) }; });
`;

async function runBrowser(name, browserType, url) {
  const browser = await browserType.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    const failures = [];
    const consoleMessages = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => consoleMessages.push(`${message.type()}: ${message.text()}`));
    page.on("response", response => { if (response.status() >= 400) failures.push(response.url()); });
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    const bootstrap = await page.evaluate(() => ({ hasOpen: Boolean(document.querySelector("#open")), fxVideo: window.fxVideo ?? null }));
    assert(bootstrap.hasOpen || bootstrap.fxVideo?.error, `${name} did not bootstrap the installed VFX-02 consumer. ${consoleMessages.join(" | ")}`);
    assert.equal(bootstrap.fxVideo?.error ?? null, null, `${name} failed before app launch: ${bootstrap.fxVideo?.error ?? errors.join("; ")}`);
    await page.locator("#open").click();
    await page.waitForFunction(() => window.fxVideo?.ready || window.fxVideo?.error, { timeout: 30_000 });
    const result = await page.evaluate(() => window.fxVideo);
    assert.equal(result.error, undefined, `${name} VFX-02 probe failed: ${result.error ?? ""}`);
    assert.equal(result.unsupported.supported, false, `${name} must report an unsupported codec probe as unsupported.`);
    if (result.available) {
      assert.equal(result.supported.supported, true);
      assert.deepEqual(result.decoded.map(frame => [frame.width, frame.height, frame.pixelFormat]), [[16, 16, "rgba8"]]);
      assert.equal(result.decoderStateBeforeDispose, "configured");
    } else {
      assert(!result.globals.decoder || !result.globals.encoder || result.supported.supported === false);
    }
    assert.deepEqual(errors, []);
    const criticalFailures = failures.filter(failure => /\.(?:js|mjs|wasm)(?:\?|$)/u.test(failure));
    assert.deepEqual(criticalFailures, []);
    await page.evaluate(() => window.fxVideo.dispose?.());
    return { ...result, pageErrors: errors, failedRequests: failures, criticalFailedRequests: criticalFailures };
  } finally {
    await browser.close();
  }
}

async function main() {
  const consumer = createInstalledConsumer(repositoryRoot, "synware-fx-video-");
  const evidence = {
    archiveSha256: sha(consumer.archive),
    integrity: consumer.integrity,
    commit: consumer.manifest.commit,
    sourceSha256: consumer.sourceSha256,
    resourcesSha256: consumer.resourcesSha256,
    installedOutsideRepository: true,
    typecheck: false,
    packageGraph: null,
    browsers: null,
    passed: false,
  };
  let hosted;
  try {
    write(consumer.root, "tsconfig.json", JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        jsx: "react-jsx",
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        strict: true,
        skipLibCheck: false,
        noEmit: true,
        types: ["vite/client"],
      },
      include: ["src"],
    }));
    write(consumer.root, "src/main.tsx", probeSource);
    write(consumer.root, "index.html", '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>');
    write(consumer.root, "vite.config.mjs", 'import { writeFileSync } from "node:fs"; export default { plugins: [{ name: "record-inputs", generateBundle() { writeFileSync("resolved-modules.json", JSON.stringify([...this.getModuleIds()].sort(), null, 2)); } }], build: { sourcemap: false } };');

    runNode([join(consumer.root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], consumer.root, { log: join(consumer.root, "typecheck.log") });
    evidence.typecheck = true;
    runNode([join(consumer.root, "node_modules/vite/bin/vite.js"), "build"], consumer.root, { log: join(consumer.root, "build.log") });
    const moduleIds = JSON.parse(readFileSync(join(consumer.root, "resolved-modules.json"), "utf8"));
    assertIndependentModules(consumer.root, moduleIds);
    evidence.packageGraph = { modules: moduleIds.length, allResolvedInsideInstallation: true };

    hosted = await staticServer(join(consumer.root, "dist"));
    const browsers = {};
    for (const [name, browserType] of [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]]) {
      browsers[name] = await runBrowser(name, browserType, hosted.url);
    }
    assert.equal(browsers.chromium.available, true, "Chromium must execute the installed VP8 WebCodecs roundtrip.");
    evidence.browsers = browsers;
    assertSdkSourceUnchanged(consumer.manifest.source, captureSdkSourceFingerprint(repositoryRoot));
    evidence.passed = true;
    console.log("VFX-02 installed consumer passed: package-only graph, mounted app.video decoder, VP8 roundtrip where supported, and unsupported-codec probes.");
  } catch (error) {
    evidence.error = error instanceof Error ? error.stack : String(error);
    evidence.retainedConsumer = consumer.root;
    throw error;
  } finally {
    if (hosted) await new Promise(accept => hosted.server.close(accept));
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n");
    if (evidence.passed && !process.argv.includes("--keep")) rmSync(consumer.root, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
