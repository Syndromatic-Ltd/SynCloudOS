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
const output = resolve(repositoryRoot, ".artifacts/synapp-sdk/fx-video-encode-consumer.json");
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
import { useSCOS } from "@syndromatic/syncloudos/sdk";
import { createSynWare } from "@syndromatic/syncloudos/sdk/testing";
import { IFXFilterRegistry } from "@syndromatic/syncloudos/fx/image";
import { MEFXSampleTimingInfo, MEFXTime } from "@syndromatic/syncloudos/fx/media";
import {
  VFXContainerReader,
  VFXContainerWriter,
  VFXFrame,
  VFXFrameProcessingGraph,
  VFXPixelBuffer,
  VFXVideoFormat,
} from "@syndromatic/syncloudos/fx/video";
import { VFXWebMContainerBackend } from "@syndromatic/syncloudos/fx/video/webm";
import { defineWebspring, type WebspringViewProps } from "@syndromatic/syncloudos/webspring";

declare global { interface Window { fxVideoEncode: any; } }
window.fxVideoEncode = { ready: false };

function makeFrame(timestampMicroseconds: number) {
  const format = new VFXVideoFormat({
    codedWidth: 16,
    codedHeight: 16,
    pixelFormat: "rgba8",
    colourSpace: "srgb",
    cleanAperture: { x: 1, y: 1, width: 14, height: 14 },
    pixelAspectRatio: { numerator: 1, denominator: 1 },
  });
  const bytes = new Uint8Array(format.byteLength);
  for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) {
    const offset = (y * 16 + x) * 4;
    bytes[offset] = x < 8 ? 210 : 40;
    bytes[offset + 1] = y < 8 ? 70 : 180;
    bytes[offset + 2] = 90;
    bytes[offset + 3] = 255;
  }
  const pixels = new VFXPixelBuffer(format, bytes);
  try {
    return new VFXFrame({
      pixels,
      timing: new MEFXSampleTimingInfo({
        presentationTime: MEFXTime.finite(BigInt(timestampMicroseconds), 1_000_000),
        duration: MEFXTime.finite(33_333n, 1_000_000),
      }),
    });
  } finally { pixels.close(); }
}

function concatenate(parts: readonly Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.byteLength; }
  return result;
}

async function externalPlayer(bytes: Uint8Array) {
  const owned = bytes.slice();
  const url = URL.createObjectURL(new Blob([owned.buffer as ArrayBuffer], { type: "video/webm" }));
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  try {
    const loaded = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("External WebM player timed out.")), 10_000);
      video.addEventListener("loadedmetadata", () => { clearTimeout(timeout); resolve(); }, { once: true });
      video.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("External WebM player rejected the exported file.")); }, { once: true });
    });
    video.src = url;
    await loaded;
    return { width: video.videoWidth, height: video.videoHeight, duration: Number.isFinite(video.duration) ? video.duration : null };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

function Probe() {
  const app = useSCOS();
  useEffect(() => {
    void (async () => {
      const encoderConfig = { codec: "vp8", codedWidth: 16, codedHeight: 16, bitrate: 120_000, framerate: 30 } as const;
      const supported = await app.video.queryEncoder(encoderConfig);
      const unsupported = await app.video.queryEncoder({
        codec: "definitely-not-a-real-video-codec",
        codedWidth: 16,
        codedHeight: 16,
        bitrate: 120_000,
        framerate: 30,
      });
      const decoderSupport = await app.video.queryDecoder({ codec: "vp8", codedWidth: 16, codedHeight: 16 });
      const globals = {
        encoder: typeof globalThis.VideoEncoder === "function",
        decoder: typeof globalThis.VideoDecoder === "function",
        worker: typeof globalThis.Worker === "function",
      };
      const graph = new VFXFrameProcessingGraph(source => new IFXFilterRegistry().create("gaussianBlur", { sigma: 1 }).apply(source));
      const processor = app.video.createFrameProcessor({ maximumRetainedBytes: 2 * 1024 * 1024 });
      const firstSource = makeFrame(0);
      let firstProcessed;
      try { firstProcessed = await processor.process(firstSource, graph, { interpolation: "nearest" }); }
      finally { firstSource.close(); }
      const processingTimeline = [{
        timestamp: 0,
        backend: firstProcessed.diagnostics.backend,
        copyCount: firstProcessed.diagnostics.copyCount,
        peakRetainedBytes: firstProcessed.diagnostics.peakRetainedBytes,
        colourSpace: firstProcessed.frame.format.colourSpace,
        cleanAperture: firstProcessed.frame.format.cleanAperture,
        pixelAspectRatio: firstProcessed.frame.format.pixelAspectRatio,
      }];
      if (!globals.encoder || !supported.supported) {
        firstProcessed.frame.close();
        processor.dispose();
        window.fxVideoEncode = { ready: true, available: false, globals, supported, unsupported, decoderSupport, processingTimeline };
        return;
      }

      const encoded: Array<{ chunk: import("@syndromatic/syncloudos/fx/video").VFXEncodedChunk; metadata: import("@syndromatic/syncloudos/fx/video").VFXEncoderOutputMetadata }> = [];
      const encoder = app.video.createEncoder({ output(chunk, metadata) { encoded.push({ chunk, metadata }); } });
      let secondProcessed: Awaited<ReturnType<typeof processor.process>> | undefined;
      try {
        await encoder.configure(encoderConfig);
        const second = makeFrame(33_333);
        try { secondProcessed = await processor.process(second, graph, { interpolation: "nearest" }); }
        finally { second.close(); }
        processingTimeline.push({
          timestamp: 33_333,
          backend: secondProcessed.diagnostics.backend,
          copyCount: secondProcessed.diagnostics.copyCount,
          peakRetainedBytes: secondProcessed.diagnostics.peakRetainedBytes,
          colourSpace: secondProcessed.frame.format.colourSpace,
          cleanAperture: secondProcessed.frame.format.cleanAperture,
          pixelAspectRatio: secondProcessed.frame.format.pixelAspectRatio,
        });
        encoder.encode(firstProcessed.frame, { keyFrame: true });
        encoder.encode(secondProcessed.frame);
        await encoder.flush();
      } finally {
        encoder.dispose();
        firstProcessed.frame.close();
        secondProcessed?.frame.close();
        processor.dispose();
      }
      if (encoded.length < 1) throw new Error("Mounted VideoFX encoder produced no output chunks.");

      const fragments: Uint8Array[] = [];
      const backend = new VFXWebMContainerBackend();
      const writer = new VFXContainerWriter({
        backend,
        sink: { async write(bytes) { fragments.push(bytes.slice()); await Promise.resolve(); } },
        track: { id: 1, kind: "video", codec: "vp8", codedWidth: 16, codedHeight: 16, timescale: 1_000_000 },
        maximumBufferedBytes: 64 * 1024,
      });
      for (const item of encoded) await writer.write(item.chunk);
      await writer.close();
      const movie = concatenate(fragments);
      const reader = new VFXContainerReader({ backend: new VFXWebMContainerBackend(), maximumBufferedBytes: 64 * 1024, maximumElementBytes: 32 * 1024 });
      const imported = await reader.read(movie);
      const player = await externalPlayer(movie);

      const decoded: Array<{ width: number; height: number; pixelFormat: string; timestamp: number }> = [];
      if (decoderSupport.supported) {
        const decoder = app.video.createDecoder({
          output(frame) {
            const presentation = frame.timing.presentationTime.convertScale(1_000_000, "nearest-even");
            decoded.push({
              width: frame.format.codedWidth,
              height: frame.format.codedHeight,
              pixelFormat: frame.format.pixelFormat,
              timestamp: presentation.value.kind === "finite"
                ? Number(presentation.value.value)
                : -1,
            });
            frame.close();
          },
        });
        try {
          decoder.configure({ codec: "vp8", codedWidth: 16, codedHeight: 16 });
          for (const chunk of imported.chunks) decoder.decode(chunk);
          await decoder.flush();
        } finally { decoder.dispose(); }
      }

      window.fxVideoEncode = {
        ready: true,
        available: true,
        globals,
        supported,
        unsupported,
        decoderSupport,
        processingTimeline,
        encoded: encoded.map(item => ({
          type: item.chunk.type,
          byteLength: item.chunk.byteLength,
          decoderCodec: item.metadata.decoderConfig?.codec ?? null,
        })),
        container: {
          byteLength: movie.byteLength,
          fragments: fragments.length,
          diagnostics: writer.diagnostics,
          capabilities: backend.capabilities,
          importedTrack: imported.track,
          importedTypes: imported.chunks.map(chunk => chunk.type),
          importedTiming: imported.chunks.map(chunk => chunk.webCodecsTiming()),
          seekIndex: imported.seekIndex,
        },
        player,
        decoded,
      };
    })().catch(error => {
      window.fxVideoEncode = { ready: false, error: error instanceof Error ? error.stack ?? error.message : String(error) };
    });
  }, [app]);
  return <p id="probe">VFX-03 installed encode/container probe</p>;
}

function Website({ actions, applicationOutlet }: WebspringViewProps) {
  return <main><button id="open" onClick={() => { void actions.openApp("org.example.vfx03"); }}>Open VFX-03 probe</button>{applicationOutlet}</main>;
}

const shell = defineWebspring({
  manifest: {
    schemaVersion: 1,
    id: "org.example.vfx03-shell",
    version: "1.0.0",
    title: "VFX-03 shell",
    webspringShell: {
      views: [{ id: "website", presentations: ["desktop", "tablet", "mobile"], mode: "persistent" }],
      defaults: { desktop: "website", tablet: "website", mobile: "website" },
      homeRoute: "/",
      branding: { name: { key: "brand", fallback: "VFX-03" } },
    },
  },
  components: { website: Website },
});

const app = createSynWare({
  manifest: {
    schemaVersion: 1,
    id: "org.example.vfx03",
    version: "1.0.0",
    title: "VFX-03 Probe",
    runtime: { policy: { public: true } },
    presentations: ["desktop", "tablet", "mobile"],
    routes: [{ path: "/vfx03", primary: true }],
    webspring: { visible: true, order: 1 },
  },
  root: Probe,
});

const element = document.getElementById("root")!;
mountSynCloudOS({ element, bundles: [app], shell, authentication: "disabled" })
  .then(host => { window.fxVideoEncode.dispose = () => host.dispose("VFX-03 installed consumer verification"); })
  .catch(error => { window.fxVideoEncode = { ready: false, error: String(error) }; });
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
    const bootstrap = await page.evaluate(() => ({ hasOpen: Boolean(document.querySelector("#open")), state: window.fxVideoEncode ?? null }));
    assert(bootstrap.hasOpen || bootstrap.state?.error, `${name} did not bootstrap the installed VFX-03 consumer. ${consoleMessages.join(" | ")}`);
    assert.equal(bootstrap.state?.error ?? null, null, `${name} failed before app launch: ${bootstrap.state?.error ?? errors.join("; ")}`);
    await page.locator("#open").click();
    await page.waitForFunction(() => window.fxVideoEncode?.ready || window.fxVideoEncode?.error, { timeout: 30_000 });
    const result = await page.evaluate(() => window.fxVideoEncode);
    assert.equal(result.error, undefined, `${name} VFX-03 probe failed: ${result.error ?? ""}`);
    assert.equal(result.unsupported.supported, false, `${name} must reject an unsupported video encoder configuration.`);
    assert.equal(result.globals.worker, true, `${name} must expose Worker for mounted VideoFX processing.`);
    assert(result.processingTimeline.length >= 1, `${name} must process at least one installed VideoFX frame.`);
    assert(result.processingTimeline.every(frame => frame.backend === "worker-cpu"), `${name} must route installed frame processing through the owned worker backend.`);
    assert(result.processingTimeline.every(frame => frame.copyCount <= 3));
    assert(result.processingTimeline.every(frame => frame.peakRetainedBytes <= 2 * 1024 * 1024));
    assert(result.processingTimeline.every(frame => frame.colourSpace === "srgb"));
    assert(result.processingTimeline.every(frame => frame.cleanAperture?.width === 14 && frame.cleanAperture?.height === 14));
    assert(result.processingTimeline.every(frame => frame.pixelAspectRatio?.numerator === 1 && frame.pixelAspectRatio?.denominator === 1));
    if (result.available) {
      assert.equal(result.supported.supported, true);
      assert.deepEqual(result.processingTimeline.map(frame => frame.timestamp), [0, 33_333]);
      assert(result.encoded.length >= 1);
      assert.equal(result.encoded[0].type, "key");
      assert(result.container.byteLength > 0);
      assert(result.container.fragments >= result.encoded.length + 3);
      assert.equal(result.container.importedTrack.codec, "vp8");
      assert.equal(result.container.importedTrack.codedWidth, 16);
      assert.equal(result.container.importedTrack.codedHeight, 16);
      assert.deepEqual(result.container.importedTypes, result.encoded.map(item => item.type));
      assert.equal(result.container.seekIndex[0]?.timestampMicroseconds, 0);
      assert(result.container.diagnostics.peakBufferedBytes <= 64 * 1024);
      assert.equal(result.player.width, 16);
      assert.equal(result.player.height, 16);
      if (result.decoderSupport.supported) {
        assert(result.decoded.length >= 1);
        assert.deepEqual(result.decoded[0] && [result.decoded[0].width, result.decoded[0].height, result.decoded[0].pixelFormat], [16, 16, "rgba8"]);
      }
    } else {
      assert(!result.globals.encoder || result.supported.supported === false);
    }
    assert.deepEqual(errors, []);
    const criticalFailures = failures.filter(failure => /\.(?:js|mjs|wasm)(?:\?|$)/u.test(failure));
    assert.deepEqual(criticalFailures, []);
    await page.evaluate(() => window.fxVideoEncode.dispose?.());
    return { ...result, pageErrors: errors, failedRequests: failures, criticalFailedRequests: criticalFailures };
  } finally { await browser.close(); }
}

async function main() {
  const consumer = createInstalledConsumer(repositoryRoot, "synware-fx-video-encode-");
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
    assert.equal(browsers.chromium.available, true, "Chromium must execute the installed mounted VideoFX encoder and exported WebM roundtrip.");
    evidence.browsers = browsers;
    assertSdkSourceUnchanged(consumer.manifest.source, captureSdkSourceFingerprint(repositoryRoot));
    evidence.passed = true;
    console.log("VFX-03 installed consumer passed: mounted encode, bounded WebM export/reimport, external player metadata, decode roundtrip, and unsupported probe.");
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
