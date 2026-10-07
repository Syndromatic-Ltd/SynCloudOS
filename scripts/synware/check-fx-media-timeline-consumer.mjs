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
import { chromium, firefox, webkit } from "playwright";
import { assertIndependentModules, createInstalledConsumer, isWithin, runNode, verifyInstalledSdkResources } from "./installed-consumer.mjs";
import { assertSdkSourceUnchanged, captureSdkSourceFingerprint } from "./sdk-package-manifest.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const output = resolve(repositoryRoot, ".artifacts/synapp-sdk/fx-media-timeline-consumer.json");
const sha = path => createHash("sha256").update(readFileSync(path)).digest("hex");
const write = (root, path, contents) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), contents); };

function staticServer(directory) {
  const mime = { ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".wasm": "application/wasm", ".ttf": "font/ttf" };
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

const probeSource = readFileSync(resolve(repositoryRoot, "tests/fixtures/fx/installed-media-timeline.tsx"), "utf8");

async function runBrowser(name, browserType, url) {
  let browser;
  try { browser = await browserType.launch({ headless: true }); }
  catch (error) {
    if (/Executable doesn't exist/.test(String(error))) return { available: false, reason: "browser-executable-unavailable", detail: String(error) };
    throw error;
  }
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    await page.locator("#open").click();
    await page.locator("#run").click();
    try {
      await page.waitForFunction(() => window.fxMediaTimeline?.ready || window.fxMediaTimeline?.error, undefined, { timeout: 45_000 });
    } catch (error) {
      const state = await page.evaluate(() => window.fxMediaTimeline);
      throw new Error(`${name} installed VFX-06 probe timed out in state ${JSON.stringify(state)}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const result = await page.evaluate(() => window.fxMediaTimeline);
    if (result.supported === false && result.reason === "audio-worklet-unavailable") {
      await page.evaluate(() => window.disposeFXMediaTimeline?.());
      assert.deepEqual(pageErrors, []);
      return { available: false, reason: result.reason, pageErrors };
    }
    if (result.error === "Audio graph output is unavailable." && result.stage === "engine-starting") {
      await page.evaluate(() => window.disposeFXMediaTimeline?.());
      return { available: false, reason: "audio-output-unavailable", errorName: result.errorName ?? null, pageErrors };
    }
    assert.equal(result.error, undefined, `${name} installed VFX-06 probe failed: ${result.error ?? ""}`);
    assert.equal(result.processing.backend, "worker-cpu", `${name} must process the installed timeline through the packaged worker backend.`);
    assert(result.processing.copyCount <= 3);
    assert(result.processing.peakRetainedBytes <= 4 * 1024 * 1024);
    assert.equal(result.playback.first.action, "present", `${name} must draw its installed frame.`);
    assert(Math.abs(result.playback.first.skewSeconds) <= 0.04, `${name} installed dispatch skew exceeded tolerance plus clock uncertainty.`);
    assert.equal(result.playback.late.action, "drop");
    assert.equal(result.playback.waiting.reason, "audio-transport-pending");
    assert.equal(result.playback.pcm.paused.peak, 0);
    assert(Math.abs(result.playback.pcm.doubleRate.inferredRate - 2) < 0.01, `${name} did not render rate-2 PCM.`);
    assert.equal(result.playback.pcm.loops.length, 2);
    assert.equal(result.playback.slowRenderer.maximumActive, 1);
    assert.equal(result.playback.slowRenderer.cancelledDraws, 1);
    assert.equal(result.playback.slowRenderer.stale.reason, "presentation-invalidated");
    assert.equal(result.playback.eos.action, "end-of-stream");
    assert.equal(result.playback.teardown, "AbortError");
    assert.equal(result.playback.pcm.afterDispose.peak, 0);
    assert(result.titleInkPixels > 0, `${name} must draw shaped title pixels.`);
    assert.notDeepEqual(result.drawnPixel, [32, 64, 112, 255], `${name} must draw processed pixels.`);
    assert.deepEqual(pageErrors, []);
    await page.evaluate(() => window.disposeFXMediaTimeline?.());
    return { available: true, ...result, pageErrors };
  } finally { await browser.close(); }
}

async function main() {
  const manifestIndex = process.argv.indexOf("--manifest");
  if (manifestIndex >= 0 && !process.argv[manifestIndex + 1]) throw new Error("--manifest requires an archive manifest path.");
  const consumer = createInstalledConsumer(repositoryRoot, "synware-fx-media-timeline-", manifestIndex < 0 ? {} : { manifestPath: resolve(process.argv[manifestIndex + 1]) });
  const sharedProbe = resolve(repositoryRoot, "tests/e2e/fixtures/fx-media-timeline-probe.ts");
  const evidence = { schemaVersion: 2, kind: "installed-vfx06-behavior", archiveSha256: sha(consumer.archive), integrity: consumer.integrity,
    commit: consumer.manifest.commit, sourceSha256: consumer.sourceSha256, resourcesSha256: consumer.resourcesSha256,
    fixtureSha256: createHash("sha256").update(probeSource).digest("hex"), sharedProbeSha256: sha(sharedProbe),
    installedOutsideRepository: true, typecheck: false, packageGraph: null, browsers: {}, nativeDevice: "not-run", passed: false };
  let hosted;
  try {
    write(consumer.root, "tsconfig.json", JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx", lib: ["ES2022", "DOM", "DOM.Iterable"], strict: true, skipLibCheck: false, noEmit: true, types: ["vite/client"] }, include: ["src"] }));
    write(consumer.root, "src/main.tsx", probeSource);
    copyFileSync(sharedProbe, join(consumer.root, "src/fx-media-timeline-probe.ts"));
    write(consumer.root, "index.html", '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>');
    write(consumer.root, "vite.config.mjs", 'import { writeFileSync } from "node:fs"; export default { plugins: [{ name: "record-inputs", generateBundle() { writeFileSync("resolved-modules.json", JSON.stringify([...this.getModuleIds()].sort(), null, 2)); } }], build: { sourcemap: false } };');
    mkdirSync(join(consumer.root, "public"), { recursive: true });
    copyFileSync(resolve(repositoryRoot, "tests/fixtures/fx/fonts/notosans-NotoSans[wdth,wght].ttf"), join(consumer.root, "public/font.ttf"));
    runNode([join(consumer.root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], consumer.root, { log: join(consumer.root, "typecheck.log") });
    evidence.typecheck = true;
    runNode([join(consumer.root, "node_modules/vite/bin/vite.js"), "build"], consumer.root, { log: join(consumer.root, "build.log") });
    const moduleIds = JSON.parse(readFileSync(join(consumer.root, "resolved-modules.json"), "utf8"));
    assertIndependentModules(consumer.root, moduleIds);
    evidence.packageGraph = { modules: moduleIds.length, allResolvedInsideInstallation: true };
    hosted = await staticServer(join(consumer.root, "dist"));
    const browsers = evidence.browsers;
    for (const [name, browserType] of [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]]) browsers[name] = await runBrowser(name, browserType, hosted.url);
    assert.equal(browsers.chromium.available, true, "Chromium must execute the installed VFX-06 mounted timeline.");
    verifyInstalledSdkResources(consumer.installed, consumer.manifest);
    assertSdkSourceUnchanged(consumer.manifest.source, captureSdkSourceFingerprint(repositoryRoot));
    assert.equal(sha(sharedProbe), evidence.sharedProbeSha256, "Shared timeline specimen changed during installed acceptance.");
    evidence.passed = true;
    console.log("VFX-06 installed consumer passed for supported engines: actual mounted PCM seek/pause/rate/loop, renderer cancellation, processed title canvas and teardown. See per-engine capability results.");
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

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
