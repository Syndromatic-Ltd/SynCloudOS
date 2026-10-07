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
const output = resolve(repositoryRoot, ".artifacts/synapp-sdk/fx-text-consumer.json");
const sha = path => createHash("sha256").update(readFileSync(path)).digest("hex");
const write = (root, path, contents) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), contents); };

function staticServer(directory) {
  const mime = { ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript", ".css": "text/css", ".wasm": "application/wasm", ".ttf": "font/ttf" };
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
import { createSynWare, TFXFontDescriptor, useSynWare } from "@syndromatic/syncloudos/sdk";
import { TFXAttributedString, TFXFontCollection, TFXTypesetter, TFX_VERTICAL_ORIENTATION_UNICODE_VERSION, tfxVerticalOrientationForGrapheme } from "@syndromatic/syncloudos/fx/text";
import { defineWebspring, type WebspringViewProps } from "@syndromatic/syncloudos/webspring";
declare global { interface Window { fxText: any; } }
window.fxText = { ready: false };

async function bytes(path: string) {
  const response = await fetch(path);
  if (!response.ok) throw new Error("font fetch failed: " + response.status + " " + path);
  return new Uint8Array(await response.arrayBuffer());
}

function Probe() {
  const app = useSynWare();
  useEffect(() => {
    void (async () => {
      const readiness: Array<{ state: string; generation: number; registrationId: string }> = [];
      const unsubscribe = app.textLayout.subscribeFontReadiness(change => readiness.push({ state: change.state, generation: change.generation, registrationId: change.registrationId }));
      const initialGeneration = app.textLayout.fontReadinessGeneration;
      const primary = await app.textLayout.registerFont(await bytes("/vertical.ttf"), new TFXFontDescriptor({ family: "FX16 Primary", size: 14 }));
      const vertical = await app.textLayout.registerFont(await bytes("/vertical.ttf"), new TFXFontDescriptor({ family: "FX16 Vertical", size: 20 }));
      const arabic = await app.textLayout.registerFont(await bytes("/arabic.ttf"), new TFXFontDescriptor({ family: "FX16 Arabic", size: 28 }));
      const devanagari = await app.textLayout.registerFont(await bytes("/devanagari.ttf"), new TFXFontDescriptor({ family: "FX16 Devanagari", size: 24 }));
      const readyGeneration = app.textLayout.fontReadinessGeneration;

      const verticalText = "日12本";
      const verticalLine = new TFXTypesetter(new TFXAttributedString(verticalText, [{
        start: 0, end: verticalText.length, font: vertical.font, language: "ja", verticalOrientation: "auto", textCombine: "digits2",
      }]), "ltr", "vertical").createLine(0, verticalText.length);
      const combined = verticalLine.runs.find(run => run.start === 1 && run.end === 3);

      const mixedText = "日 مرحبًا नमस्ते";
      const cascade = new TFXFontCollection([primary.font, arabic.font, devanagari.font]);
      const mixed = new TFXTypesetter(new TFXAttributedString(mixedText, [{ start: 0, end: mixedText.length, font: primary.font, fallbackFonts: cascade }])).createLine(0, mixedText.length);
      const fallbackSizes = [...new Set(mixed.runs.map(run => run.font.descriptor.size))].sort((left, right) => left - right);
      const primaryAscent = primary.font.ascent;
      const emojiText = "A👩‍💻B";
      const emoji = new TFXTypesetter(new TFXAttributedString(emojiText, [{ start: 0, end: emojiText.length, font: primary.font }])).createLine(0, emojiText.length);
      const insideEmoji = emoji.textPositionForUTF16Offset(3);

      primary.dispose(); vertical.dispose(); arabic.dispose(); devanagari.dispose();
      const releasedGeneration = app.textLayout.fontReadinessGeneration;
      unsubscribe();
      window.fxText = {
        ready: true,
        unicodeVersion: TFX_VERTICAL_ORIENTATION_UNICODE_VERSION,
        orientation: { han: tfxVerticalOrientationForGrapheme("日"), latin: tfxVerticalOrientationForGrapheme("A") },
        verticalPresentations: verticalLine.runs.map(run => run.verticalPresentation ?? null),
        combinedText: combined?.shaped.text ?? null,
        combinedAdvance: combined?.inlineAdvanceOverride ?? null,
        combinedCaretSpan: verticalLine.offsetForStringIndex(3).primary - verticalLine.offsetForStringIndex(1).primary,
        insideEmoji,
        fallbackSizes,
        mixedAscent: mixed.ascent,
        primaryAscent,
        readiness,
        generations: { initial: initialGeneration, ready: readyGeneration, released: releasedGeneration },
      };
    })().catch(error => { window.fxText = { ready: false, error: error instanceof Error ? error.stack ?? error.message : String(error) }; });
  }, [app]);
  return <p id="probe">FX-16 installed text probe</p>;
}

function Website({ actions, applicationOutlet }: WebspringViewProps) {
  return <main><button id="open" onClick={() => { void actions.openApp("org.example.fx16"); }}>Open FX-16 probe</button>{applicationOutlet}</main>;
}
const shell = defineWebspring({ manifest: { schemaVersion: 1, id: "org.example.fx16-shell", version: "1.0.0", title: "FX-16 shell", webspringShell: {
  views: [{ id: "website", presentations: ["desktop", "tablet", "mobile"], mode: "persistent" }],
  defaults: { desktop: "website", tablet: "website", mobile: "website" }, homeRoute: "/", branding: { name: { key: "brand", fallback: "FX-16" } },
}}, components: { website: Website } });
const app = createSynWare({ manifest: { schemaVersion: 1, id: "org.example.fx16", version: "1.0.0", title: "FX-16 Probe", runtime: { policy: { public: true } }, presentations: ["desktop", "tablet", "mobile"], routes: [{ path: "/fx16", primary: true }], webspring: { visible: true, order: 1 } }, root: Probe });
const element = document.getElementById("root")!;
mountSynCloudOS({ element, bundles: [app], shell, authentication: "disabled" }).then(host => { window.fxText.dispose = () => host.dispose("FX-16 consumer verification"); }).catch(error => { window.fxText = { ready: false, error: String(error) }; });
`;

async function main() {
  const consumer = createInstalledConsumer(repositoryRoot, "synware-fx-text-");
  const evidence = { archiveSha256: sha(consumer.archive), integrity: consumer.integrity, commit: consumer.manifest.commit,
    sourceSha256: consumer.sourceSha256, resourcesSha256: consumer.resourcesSha256,
    installedOutsideRepository: true, typecheck: false, packageGraph: null, runtime: null, passed: false };
  let browser;
  try {
    mkdirSync(join(consumer.root, "public"), { recursive: true });
    copyFileSync(join(repositoryRoot, "tests/fixtures/fx/fonts/notosansjp-vertical-subset.ttf"), join(consumer.root, "public/vertical.ttf"));
    copyFileSync(join(repositoryRoot, "tests/fixtures/fx/fonts/notosansarabic-NotoSansArabic[wdth,wght].ttf"), join(consumer.root, "public/arabic.ttf"));
    copyFileSync(join(repositoryRoot, "tests/fixtures/fx/fonts/notosansdevanagari-NotoSansDevanagari[wdth,wght].ttf"), join(consumer.root, "public/devanagari.ttf"));
    write(consumer.root, "tsconfig.json", JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx", lib: ["ES2022", "DOM", "DOM.Iterable"], strict: true, skipLibCheck: false, noEmit: true, types: ["vite/client"] }, include: ["src"] }));
    write(consumer.root, "src/main.tsx", probeSource);
    write(consumer.root, "index.html", '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>');
    write(consumer.root, "vite.config.mjs", 'import { writeFileSync } from "node:fs"; export default { plugins: [{ name: "record-inputs", generateBundle() { writeFileSync("resolved-modules.json", JSON.stringify([...this.getModuleIds()].sort(), null, 2)); } }], build: { sourcemap: false } };');
    runNode([join(consumer.root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], consumer.root, { log: join(consumer.root, "typecheck.log") });
    evidence.typecheck = true;
    runNode([join(consumer.root, "node_modules/vite/bin/vite.js"), "build"], consumer.root, { log: join(consumer.root, "build.log") });
    const moduleIds = JSON.parse(readFileSync(join(consumer.root, "resolved-modules.json"), "utf8"));
    assertIndependentModules(consumer.root, moduleIds);
    evidence.packageGraph = { modules: moduleIds.length, allResolvedInsideInstallation: true };

    browser = await chromium.launch({ headless: true });
    const hosted = await staticServer(join(consumer.root, "dist"));
    try {
      const page = await browser.newPage();
      const requests = [], errors = [], failures = [], consoleMessages = [];
      page.on("request", request => requests.push(request.url()));
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => consoleMessages.push(`${message.type()}: ${message.text()}`));
      page.on("response", response => { if (response.status() >= 400) failures.push(response.url()); });
      await page.goto(hosted.url);
      await page.waitForLoadState("networkidle");
      const bootstrap = await page.evaluate(() => ({ hasOpen: Boolean(document.querySelector("#open")), fxText: window.fxText ?? null }));
      assert(bootstrap.hasOpen || bootstrap.fxText?.error, `Installed FX-16 entry did not bootstrap. Console: ${consoleMessages.join(" | ")}; errors: ${errors.join(" | ")}; failures: ${failures.join(" | ")}`);
      const mountError = await page.evaluate(() => window.fxText?.error ?? null);
      assert.equal(mountError, null, `Installed FX-16 shell failed before app launch: ${mountError ?? errors.join("; ")}`);
      await page.locator("#open").click();
      await page.waitForFunction(() => window.fxText?.ready || window.fxText?.error, { timeout: 30000 });
      const result = await page.evaluate(() => window.fxText);
      assert.equal(result.error, undefined);
      assert.match(result.unicodeVersion, /^17\./u);
      assert.deepEqual(result.orientation, { han: "upright", latin: "sideways" });
      assert.deepEqual(result.verticalPresentations, ["upright", "combined", "upright"]);
      assert.equal(result.combinedText, "12");
      assert.equal(result.combinedAdvance, 20);
      assert.equal(result.combinedCaretSpan, 20);
      assert.equal(result.insideEmoji.graphemeBoundary, false);
      assert.deepEqual(result.fallbackSizes, [14, 24, 28]);
      assert(result.mixedAscent > result.primaryAscent);
      assert.deepEqual(result.readiness.map(change => change.state), ["ready", "ready", "ready", "ready", "released", "released", "released", "released"]);
      assert.deepEqual(result.generations, { initial: 0, ready: 4, released: 8 });
      const harfbuzzRequests = requests.filter(url => /harfbuzz(?:-[A-Za-z0-9_-]+)?\.wasm(?:\?|$)/u.test(url));
      assert(harfbuzzRequests.length > 0, "Installed FX-16 consumer did not execute packaged HarfBuzz WASM.");
      const criticalFailures = failures.filter(url => /\.(?:js|mjs|wasm|ttf)(?:\?|$)/u.test(url));
      assert.deepEqual(errors, []);
      assert.deepEqual(criticalFailures, []);
      evidence.runtime = { ...result, harfbuzzRequests: harfbuzzRequests.length, errors, failedRequests: failures, criticalFailedRequests: criticalFailures, csp: "not-asserted" };
      await page.evaluate(() => window.fxText.dispose?.());
      await page.close();
    } finally { await new Promise(accept => hosted.server.close(accept)); }
    assertSdkSourceUnchanged(consumer.manifest.source, captureSdkSourceFingerprint(repositoryRoot));
    evidence.passed = true;
    console.log("FX-16 installed consumer passed: mounted font readiness, HarfBuzz shaping, vertical combine, fallback metrics, and package-only graph.");
  } catch (error) {
    evidence.error = error instanceof Error ? error.stack : String(error);
    evidence.retainedConsumer = consumer.root;
    throw error;
  } finally {
    if (browser) await browser.close();
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n");
    if (evidence.passed && !process.argv.includes("--keep")) rmSync(consumer.root, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
