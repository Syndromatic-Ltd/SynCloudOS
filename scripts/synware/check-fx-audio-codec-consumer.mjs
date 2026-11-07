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
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assertIndependentModules, createInstalledConsumer, isWithin, runNode } from "./installed-consumer.mjs";
import { assertSdkSourceUnchanged, captureSdkSourceFingerprint } from "./sdk-package-manifest.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const output = resolve(repositoryRoot, ".artifacts/synapp-sdk/fx-audio-codec-consumer.json");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const write = (root, path, content) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), content); };

function staticServer(directory) {
  let roundtrip = null;
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (pathname === "/roundtrip.webm" && request.method === "PUT") {
      const chunks = []; let length = 0;
      request.on("data", bytes => { length += bytes.length; if (length > 16 * 1024 * 1024) { response.writeHead(413).end(); request.destroy(); } else chunks.push(bytes); });
      request.on("end", () => { if (length > 16 * 1024 * 1024) return; roundtrip = Buffer.concat(chunks); response.writeHead(204).end(); });
      return;
    }
    if (pathname === "/roundtrip.webm" && request.method === "GET") {
      if (!roundtrip) { response.writeHead(404).end(); return; }
      response.setHeader("Content-Type", "audio/webm"); response.end(roundtrip); return;
    }
    const path = resolve(directory, "." + (pathname === "/" ? "/index.html" : pathname));
    if (!isWithin(directory, path)) { response.writeHead(403).end(); return; }
    if (!existsSync(path)) { response.writeHead(404).end(); return; }
    response.setHeader("Content-Type", { ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript", ".wav": "audio/wav" }[extname(path)] ?? "application/octet-stream");
    response.end(readFileSync(path));
  });
  return new Promise((accept, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => accept({ server, url: `http://127.0.0.1:${server.address().port}` })); });
}

const probeSource = `import { useEffect } from "react";
import { mountSynCloudOS } from "@syndromatic/syncloudos/browser";
import { useSCOS } from "@syndromatic/syncloudos/sdk";
import { createSynWare } from "@syndromatic/syncloudos/sdk/testing";
import { AUFXAudioChunkStream, AUFXAudioFormat, AUFXAudioPCMBuffer, AUFXClockObservation } from "@syndromatic/syncloudos/fx/audio";
import { VFXContainerReader } from "@syndromatic/syncloudos/fx/video";
import { VFXWebMContainerBackend } from "@syndromatic/syncloudos/fx/video/webm";
import { defineWebspring, type WebspringViewProps } from "@syndromatic/syncloudos/webspring";

declare global { interface Window { fxAudioCodec: any; } }
window.fxAudioCodec = { ready: false };
function Probe() {
  const app = useSCOS();
  useEffect(() => { void (async () => {
    const opened = await app.audio.openFile({ source: "/tone.wav", processingFormat: new AUFXAudioFormat(48_000, 1) });
    let imported;
    try {
      opened.framePosition = 21;
      const exported = await app.audio.exportFile(opened, undefined, { format: "opus-webm", bitrate: 64_000 });
      const bytes = new Uint8Array(await exported.data.arrayBuffer());
      const parsed = await new VFXContainerReader({ backend: new VFXWebMContainerBackend(), maximumChunks: 128 }).read(bytes);
      const streamBuffer = new AUFXAudioPCMBuffer(new AUFXAudioFormat(48_000, 1), 960);
      streamBuffer.frameLength = 960;
      for (let frame = 0; frame < 960; frame++) streamBuffer.setSample(0, frame, Math.sin(2 * Math.PI * 440 * frame / 48_000) * 0.25);
      let streamReleased = 0;
      const source = new AUFXAudioChunkStream(async function* () {
        try { yield { buffer: streamBuffer, observation: new AUFXClockObservation({ samplePosition: 0, sampleRate: 48_000,
          domain: "render", hostAnchorSeconds: null, uncertaintySeconds: 0, discontinuityGeneration: 0 }) }; }
        finally { streamReleased++; }
      });
      const fragments: Uint8Array[] = [];
      const sink = new WritableStream<Uint8Array>({ write(fragment) { fragments.push(fragment.slice()); } });
      const streamed = await app.audio.exportStream({ source, sink, format: "opus-webm" });
      const streamBytes = new Uint8Array(streamed.byteLength);
      let offset = 0;
      for (const fragment of fragments) { streamBytes.set(fragment, offset); offset += fragment.byteLength; }
      const parsedStream = await new VFXContainerReader({ backend: new VFXWebMContainerBackend(), maximumChunks: 128 }).read(streamBytes);
      const stored = await fetch("/roundtrip.webm", { method: "PUT", body: exported.data });
      if (!stored.ok) throw new Error("Installed consumer could not store its roundtrip fixture.");
      imported = await app.audio.openFile({ source: "/roundtrip.webm" });
      const pcm = imported.readFrames(imported.length);
      let peak = 0;
      for (let frame = 0; frame < pcm.frameLength; frame++) peak = Math.max(peak, Math.abs(pcm.getSample(0, frame)));
      window.fxAudioCodec = { ready: true, mimeType: exported.mimeType, byteLength: exported.byteLength,
        cursorPreserved: opened.framePosition === 21, track: parsed.track, packets: parsed.chunks.length,
        decodedFrames: imported.length, peak, encodeObserved: app.audio.fileCapabilities().encode.some(item => item.mimeType === "audio/webm"),
        decodeObserved: app.audio.fileCapabilities().decode.some(item => item.mimeType === "audio/webm"),
        streamed: { mimeType: streamed.mimeType, byteLength: streamed.byteLength, actualBytes: streamBytes.byteLength,
          track: parsedStream.track, packets: parsedStream.chunks.length, released: streamReleased,
          sinkUnlocked: !sink.locked, hasBlob: "data" in streamed } };
    } finally { imported?.close(); opened.close(); }
  })().catch(error => { window.fxAudioCodec = { ready: false, error: error instanceof Error ? error.stack ?? error.message : String(error) }; }); }, [app]);
  return <p id="probe">Installed AUFX-02 Opus codec probe</p>;
}
function Website({ actions, applicationOutlet }: WebspringViewProps) {
  return <main><button id="open" onClick={() => { void actions.openApp("org.example.audio-codec"); }}>Open audio codec probe</button>{applicationOutlet}</main>;
}
const shell = defineWebspring({ manifest: { schemaVersion: 1, bundleIdentifier: "org.example.audio-codec-shell", version: "1.0.0", displayName: "Audio codec shell",
  webspringShell: { views: [{ id: "website", presentations: ["desktop", "tablet", "mobile"], mode: "persistent" }],
    defaults: { desktop: "website", tablet: "website", mobile: "website" }, homeRoute: "/", branding: { name: { key: "brand", fallback: "Audio codec" } } } },
  components: { website: Website } });
const app = createSynWare({ manifest: { schemaVersion: 1, bundleIdentifier: "org.example.audio-codec", version: "1.0.0", displayName: "Audio codec probe",
  permissions: ["audio.play"], runtime: { policy: { public: true } }, presentations: ["desktop", "tablet", "mobile"],
  routes: [{ path: "/audio-codec", primary: true }], webspring: { visible: true, order: 1 } }, root: Probe });
mountSynCloudOS({ element: document.getElementById("root")!, bundles: [app], shell, authentication: "disabled" })
  .then(host => { window.fxAudioCodec.dispose = () => host.dispose("installed audio codec complete"); })
  .catch(error => { window.fxAudioCodec = { ready: false, error: String(error) }; });
`;

async function main() {
  const manifestIndex = process.argv.indexOf("--manifest");
  if (manifestIndex >= 0 && !process.argv[manifestIndex + 1]) throw new Error("--manifest requires a path.");
  const consumer = createInstalledConsumer(repositoryRoot, "synware-fx-audio-codec-", manifestIndex < 0 ? {} : { manifestPath: resolve(process.argv[manifestIndex + 1]) });
  const evidence = { schemaVersion: 1, kind: "installed-aufx02-opus-webm", archiveSHA256: hash(readFileSync(consumer.archive)),
    sourceSHA256: consumer.sourceSha256, installedOutsideRepository: true, fixtureSHA256: hash(probeSource), typecheck: false,
    packageGraph: null, chromium: null, nativeDevice: "OPEN", passed: false };
  let hosted;
  try {
    write(consumer.root, "tsconfig.json", JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx", lib: ["ES2022", "DOM", "DOM.Iterable"], strict: true, skipLibCheck: false, noEmit: true, types: ["vite/client"] }, include: ["src"] }));
    write(consumer.root, "src/main.tsx", probeSource);
    write(consumer.root, "index.html", '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>');
    write(consumer.root, "vite.config.mjs", 'import { writeFileSync } from "node:fs"; export default { plugins: [{ name: "record-inputs", generateBundle() { writeFileSync("resolved-modules.json", JSON.stringify([...this.getModuleIds()].sort(), null, 2)); } }], build: { sourcemap: false } };');
    mkdirSync(join(consumer.root, "public"), { recursive: true });
    copyFileSync(resolve(repositoryRoot, "tests/fixtures/fx/audio/generated-440hz-pcm16.wav"), join(consumer.root, "public/tone.wav"));
    runNode([join(consumer.root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], consumer.root, { log: join(consumer.root, "typecheck.log") });
    evidence.typecheck = true;
    runNode([join(consumer.root, "node_modules/vite/bin/vite.js"), "build"], consumer.root, { log: join(consumer.root, "build.log") });
    const moduleIds = JSON.parse(readFileSync(join(consumer.root, "resolved-modules.json"), "utf8"));
    assertIndependentModules(consumer.root, moduleIds);
    evidence.packageGraph = { modules: moduleIds.length, allResolvedInsideInstallation: true };
    hosted = await staticServer(join(consumer.root, "dist"));
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage(); const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(hosted.url); await page.waitForLoadState("networkidle");
      await page.locator("#open").click();
      await page.waitForFunction(() => window.fxAudioCodec?.ready || window.fxAudioCodec?.error, undefined, { timeout: 30_000 });
      const result = await page.evaluate(() => window.fxAudioCodec);
      assert.equal(result.error, undefined, result.error ?? "Installed codec probe failed.");
      assert.equal(result.mimeType, "audio/webm");
      assert(result.byteLength > 64);
      assert.equal(result.cursorPreserved, true);
      assert.equal(result.track.kind, "audio"); assert.equal(result.track.codec, "opus");
      assert.equal(result.track.sampleRate, 48_000); assert.equal(result.track.channelCount, 1);
      assert(result.packets > 0); assert.equal(result.decodedFrames, 480); assert(result.peak > 0.1);
      assert.equal(result.encodeObserved, true); assert.equal(result.decodeObserved, true);
      assert.equal(result.streamed.mimeType, "audio/webm");
      assert.equal(result.streamed.byteLength, result.streamed.actualBytes);
      assert(result.streamed.byteLength > 64);
      assert.equal(result.streamed.track.codec, "opus");
      assert(result.streamed.packets > 0);
      assert.equal(result.streamed.released, 1);
      assert.equal(result.streamed.sinkUnlocked, true);
      assert.equal(result.streamed.hasBlob, false);
      assert.deepEqual(errors, []);
      evidence.chromium = { ...result, pageErrors: errors };
      await page.evaluate(() => window.fxAudioCodec.dispose?.());
    } finally { await browser.close(); }
    assertSdkSourceUnchanged(consumer.manifest.source, captureSdkSourceFingerprint(repositoryRoot));
    evidence.passed = true;
    console.log(JSON.stringify({ passed: true, archiveSHA256: evidence.archiveSHA256, chromium: evidence.chromium }, null, 2));
  } catch (error) { evidence.error = error instanceof Error ? error.stack : String(error); evidence.retainedConsumer = consumer.root; throw error; }
  finally {
    if (hosted) await new Promise(resolve => hosted.server.close(resolve));
    mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n");
    if (evidence.passed && !process.argv.includes("--keep")) rmSync(consumer.root, { recursive: true, force: true });
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
