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
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assertIndependentModules, createInstalledConsumer, isWithin, runNode } from "./installed-consumer.mjs";
import { assertSdkSourceUnchanged, captureSdkSourceFingerprint } from "./sdk-package-manifest.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const output = resolve(repositoryRoot, ".artifacts/synapp-sdk/fx-pdf-consumer.json");
const sha = path => createHash("sha256").update(readFileSync(path)).digest("hex");
const write = (root, path, contents) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), contents); };

function staticServer(directory) {
  const mime = { ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript", ".css": "text/css", ".wasm": "application/wasm" };
  const server = createServer((request, response) => {
    const requested = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const path = resolve(directory, "." + (requested === "/" ? "/index.html" : requested));
    if (!isWithin(directory, path)) { response.writeHead(403).end(); return; }
    if (!existsSync(path)) { response.writeHead(404).end(); return; }
    response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; worker-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'");
    response.setHeader("Content-Type", mime[extname(path)] ?? "application/octet-stream");
    response.end(readFileSync(path));
  });
  return new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => accept({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

const probeSource = `import { GFXColour, GFXPath, GFXPDFContext, GFXPDFDocument, GFXPDFScanner } from "@syndromatic/syncloudos/fx/graphics";
import { TFXAttributedString, TFXFont, TFXFontDescriptor, TFXGlyphDrawing, TFXTypesetter } from "@syndromatic/syncloudos/fx/text";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
declare global { interface Window { fxPdf: any; } }
window.fxPdf = { ready: false };
void (async () => {
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const shape = async (url: string, text: string, y: number) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error("font fetch failed: " + response.status);
    const font = await TFXFont.create(new Uint8Array(await response.arrayBuffer()), new TFXFontDescriptor({ size: 16 }));
    const line = new TFXTypesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font }])).createLine(0, text.length);
    return { font, runs: TFXGlyphDrawing.pdfTextRunsForLine(line, { x: 4, y }) };
  };
  const latin = await shape("/notosans.ttf", "office", 18);
  const arabic = await shape("/notosans-arabic.ttf", "مرحبا", 38);
  const indic = await shape("/notosans-devanagari.ttf", "नमस्ते", 58);
  const writer = new GFXPDFContext({ title: "Installed FX-09" });
  writer.setLanguage("en-GB");
  writer.beginPage({ width: 160, height: 80 });
  writer.drawPositionedText(latin.runs);
  writer.drawPositionedText(arabic.runs);
  writer.drawPositionedText(indic.runs);
  writer.beginMarkedContent({ tag: "P", actualText: "Installed structured paragraph" });
  writer.fill(GFXPath.rect({ x: 120, y: 4, width: 30, height: 14 }), GFXColour.rgba(0, 0, 1));
  writer.endMarkedContent();
  writer.addLink({ rect: { x: 120, y: 24, width: 30, height: 14 }, uri: "https://example.test/read" });
  writer.endPage();
  writer.addOutline({ title: "Introduction", pageIndex: 0 });
  const bytes = await writer.finish();
  latin.font.dispose(); arabic.font.dispose(); indic.font.dispose();
  const readerTask = getDocument({ data: bytes.slice(), disableFontFace: true });
  const reader = await readerTask.promise;
  const readerPage = await reader.getPage(1);
  const textContent = await readerPage.getTextContent();
  const extracted = textContent.items.map(item => "str" in item ? item.str : "").join("");
  const outline = await reader.getOutline();
  const annotations = await readerPage.getAnnotations({ intent: "display" });
  const document = await GFXPDFDocument.open(bytes, { maximumOperationMilliseconds: 10000 });
  const scanner = new GFXPDFScanner(document, 1024 * 1024);
  const objects = scanner.objects();
  const streamOperators = [] as string[];
  for (const object of objects.filter(entry => entry.kind === "stream")) {
    try { streamOperators.push(...(await scanner.contentOperators(object.reference)).map(entry => entry.operator)); }
    catch { /* font/image streams are intentionally not content streams */ }
  }
  const destination = new GFXPDFContext({ title: "Installed embedded FX-09" });
  destination.beginPage({ width: 160, height: 80 });
  destination.drawPDFPage(document, 0, { x: 0, y: 0, width: 160, height: 80 });
  destination.endPage();
  const embeddedBytes = await destination.finish();
  const reopened = await GFXPDFDocument.open(embeddedBytes, { maximumOperationMilliseconds: 10000 });
  window.fxPdf = {
    ready: true,
    title: document.metadata.title,
    pageCount: document.pageCount,
    objectCount: objects.length,
    extracted,
    outlineTitle: outline?.[0]?.title ?? null,
    linkUrl: annotations.find(annotation => annotation.subtype === "Link")?.url ?? null,
    hasBDC: streamOperators.includes("BDC"),
    hasEMC: streamOperators.includes("EMC"),
    embeddedBytes: embeddedBytes.length,
    embeddedPageCount: reopened.pageCount,
    geometry: reopened.page(0).mediaBox,
  };
  reopened.dispose();
  document.dispose();
  await readerTask.destroy();
})().catch(error => { window.fxPdf = { ready: false, error: error instanceof Error ? error.stack ?? error.message : String(error) }; });
`;

async function main() {
  const consumer = createInstalledConsumer(repositoryRoot, "synware-fx-pdf-");
  const evidence = { archiveSha256: sha(consumer.archive), integrity: consumer.integrity, commit: consumer.manifest.commit,
    sourceSha256: consumer.sourceSha256, resourcesSha256: consumer.resourcesSha256,
    installedOutsideRepository: true, typecheck: false, packageGraph: null, runtime: null, passed: false };
  let browser;
  try {
    const pdfjsVersion = JSON.parse(readFileSync(join(repositoryRoot, "node_modules/pdfjs-dist/package.json"), "utf8")).version;
    runNode([consumer.npm, "install", "--prefer-offline", "--ignore-scripts", "--package-lock=false", `pdfjs-dist@${pdfjsVersion}`], consumer.root, { log: join(consumer.root, "reader-install.log") });
    const workerAssets = readdirSync(join(consumer.installed, "assets")).filter(name => /^pdf-document\.worker-[A-Za-z0-9_-]+\.js$/u.test(name));
    assert.equal(workerAssets.length, 1, "Installed SDK must contain exactly one PDF document worker asset.");
    mkdirSync(join(consumer.root, "public"), { recursive: true });
    copyFileSync(join(repositoryRoot, "tests/fixtures/fx/fonts/notosans-NotoSans[wdth,wght].ttf"), join(consumer.root, "public/notosans.ttf"));
    copyFileSync(join(repositoryRoot, "tests/fixtures/fx/fonts/notosansarabic-NotoSansArabic[wdth,wght].ttf"), join(consumer.root, "public/notosans-arabic.ttf"));
    copyFileSync(join(repositoryRoot, "tests/fixtures/fx/fonts/notosansdevanagari-NotoSansDevanagari[wdth,wght].ttf"), join(consumer.root, "public/notosans-devanagari.ttf"));
    write(consumer.root, "tsconfig.json", JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", lib: ["ES2022", "DOM", "DOM.Iterable"], strict: true, skipLibCheck: false, noEmit: true, types: ["vite/client"] }, include: ["src"] }));
    write(consumer.root, "src/main.ts", probeSource);
    write(consumer.root, "index.html", '<!doctype html><html><body><main id="probe">FX-09 package probe</main><script type="module" src="/src/main.ts"></script></body></html>');
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
      const requests = [], errors = [], failures = [];
      page.on("request", request => requests.push(request.url()));
      page.on("pageerror", error => errors.push(error.message));
      page.on("response", response => { if (response.status() >= 400) failures.push(response.url()); });
      await page.goto(hosted.url);
      await page.waitForFunction(() => window.fxPdf?.ready || window.fxPdf?.error, { timeout: 30000 });
      const result = await page.evaluate(() => window.fxPdf);
      assert.equal(result.error, undefined);
      assert.equal(result.title, "Installed FX-09");
      assert.equal(result.pageCount, 1);
      assert(result.objectCount > 0);
      assert(result.extracted.includes("office"), "Installed reader did not extract Latin source text.");
      assert(result.extracted.includes("مرحبا"), "Installed reader did not extract Arabic source text.");
      assert(result.extracted.includes("नमस्ते"), "Installed reader did not extract Devanagari source text.");
      assert.equal(result.outlineTitle, "Introduction");
      assert.equal(result.linkUrl, "https://example.test/read");
      assert.equal(result.hasBDC, true);
      assert.equal(result.hasEMC, true);
      assert(result.embeddedBytes > 100);
      assert.equal(result.embeddedPageCount, 1);
      assert.deepEqual(result.geometry, { x: 0, y: 0, width: 160, height: 80 });
      const pdfWorkerRequests = requests.filter(url => /\/assets\/pdf-document\.worker-[A-Za-z0-9_-]+\.js(?:\?|$)/u.test(url));
      assert(pdfWorkerRequests.length >= 3, "Installed consumer did not execute packaged PDF document workers for open/embed/reopen.");
      assert.deepEqual(errors, []);
      assert.deepEqual(failures, []);
      evidence.runtime = { ...result, pdfWorkerRequests: pdfWorkerRequests.length, errors, failedRequests: failures, csp: "self-only workers/scripts with wasm-unsafe-eval" };
      await page.close();
    } finally { await new Promise(accept => hosted.server.close(accept)); }
    assertSdkSourceUnchanged(consumer.manifest.source, captureSdkSourceFingerprint(repositoryRoot));
    evidence.passed = true;
    console.log("FX-09 installed consumer passed: package-only graph, multilingual extraction, structure, strict CSP, and packaged PDF workers executed.");
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
