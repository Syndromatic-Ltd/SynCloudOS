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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { assertIndependentModules, createInstalledConsumer, isWithin, runNode, verifyInstalledSdkResources } from "./installed-consumer.mjs";
import { assertSdkSourceUnchanged, captureSdkSourceFingerprint } from "./sdk-package-manifest.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const receiptPath = join(repositoryRoot, ".artifacts/synapp-sdk/custom-text-system-consumer.json");
const applicationEntries = Object.freeze(["sdk", "sdk/testing", "nse/text", "fx/text", "fx/graphics"]);
const publicEntries = Object.freeze([...applicationEntries, "browser", "webspring"]);
const externalImports = new Set(["react", "react-dom/client", "react/jsx-runtime", ...applicationEntries.map(entry => `@syndromatic/syncloudos/${entry}`)]);
const hostImports = new Set(["@syndromatic/syncloudos/browser", "@syndromatic/syncloudos/webspring", "@syndromatic/syncloudos/browser/styles.css"]);
const exampleFiles = ["Info.ts", "model.ts", "layout.ts", "example.ts", "image.ts", "view.tsx", "index.tsx", "style.css"];
const hostFile = "examples/TextSystem.app/Host/bootstrap.tsx";
const fontDirectory = "tests/fixtures/fx/fonts/";
const fontFile = "notosans-NotoSans[wdth,wght].ttf", licenseFile = "notosans-OFL.txt";
const fixturePath = "tests/e2e/fixtures/custom-text-surface.tsx";
const htmlPath = "tests/e2e/fixtures/custom-text-surface.html";
const sourcePaths = [...exampleFiles.map(file => `examples/TextSystem.app/Contents/${file}`), hostFile, fixturePath, htmlPath,
  fontDirectory + fontFile, fontDirectory + licenseFile, fontDirectory + "sources.json"];
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const write = (root, path, bytes) => { const target = join(root, path); assert(isWithin(root, target)); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes); };

/** Application source, not installed framework implementation, must use this small public surface. */
export function assertCustomTextSystemSourceBoundary(source, fileName, localFiles) {
  assert(fileName.startsWith("src/"), "Consumer source must live under src.");
  const tree = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  assert.equal(tree.parseDiagnostics.length, 0, `Invalid consumer source: ${fileName}`);
  const known = new Set(localFiles);
  const isHost = fileName === "src/example/Host/bootstrap.tsx";
  function checkSpecifier(node) {
    assert(node && ts.isStringLiteralLike(node), `Consumer imports must be literal: ${fileName}`);
    const specifier = node.text;
    if (externalImports.has(specifier)) return;
    if (isHost && hostImports.has(specifier)) return;
    assert(specifier.startsWith("./") || specifier.startsWith("../"), `Nonpublic consumer import: ${specifier}`);
    assert(!specifier.includes("\\") && !specifier.includes("\0"), `Invalid consumer-local import: ${specifier}`);
    const [path, query] = specifier.split("?");
    assert(query === undefined || (query === "url" && path.endsWith(".ttf")), `Invalid consumer-local import query: ${specifier}`);
    const target = posix.normalize(posix.join(posix.dirname(fileName), path));
    const hostTarget = target === "src/example/Host/bootstrap" || target === "src/example/Host/bootstrap.tsx";
    assert(!hostTarget || fileName === "src/main.tsx", `Application cannot import the private host bootstrap: ${specifier}`);
    assert(target === "src/example/Contents" || target.startsWith("src/example/Contents/") || target.startsWith("src/assets/") || hostTarget, `Consumer-local import escapes the private example: ${specifier}`);
    const candidates = [target, ...[".ts", ".tsx", "/index.ts", "/index.tsx"].map(suffix => target + suffix)];
    assert(candidates.some(candidate => known.has(candidate)), `Unresolved consumer-local import: ${specifier}`);
  }
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) checkSpecifier(node.moduleSpecifier);
    } else if (ts.isImportTypeNode(node)) {
      assert(ts.isLiteralTypeNode(node.argument), "Consumer type imports must be literal"); checkSpecifier(node.argument.literal);
    } else if (ts.isImportEqualsDeclaration(node)) {
      assert.fail("Consumer require/import-equals escapes are forbidden");
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) checkSpecifier(node.arguments[0]);
      if (ts.isIdentifier(node.expression) && node.expression.text === "require") assert.fail("Consumer require escapes are forbidden");
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
}

function replaceFixtureContract(source, before, after, expected = 1) {
  assert.equal(source.split(before).length - 1, expected, `Custom fixture contract changed: ${before}`);
  return source.split(before).join(after);
}

/** Copy the real browser fixture; instrument only private test output and a later canonical edit. */
export function createCustomTextSystemFixtureSource(source) {
  source = replaceFixtureContract(source, "../../../examples/TextSystem.app/Contents", "./example/Contents", 3);
  source = replaceFixtureContract(source, "../../../examples/TextSystem.app/Host/bootstrap", "./example/Host/bootstrap", 2);
  source = replaceFixtureContract(source, "../../fixtures/fx/fonts/" + fontFile + "?url", "./assets/ExampleFont.ttf?url");
  source = replaceFixtureContract(source, "const output = await prepared.output.exportPDF();",
    'if (window.customInstalledCaptureRace) value.insertText("caption", "Later captured edit ");\n        const output = await prepared.output.exportPDF();');
  source = replaceFixtureContract(source, "pdf = { revision: output.receipt.revision!, byteLength: output.bytes.length }; return pdf;",
    "window.customInstalledPDF = { bytes: Array.from(output.bytes), revision: output.receipt.revision!, pages: output.receipt.pages.length };\n        pdf = { revision: output.receipt.revision!, byteLength: output.bytes.length }; return pdf;");
  return source + "\ndeclare global { interface Window { customInstalledCaptureRace?: boolean; customInstalledPDF?: { bytes: number[]; revision: number; pages: number } } }\n";
}

export function customTextSystemCompilerOptions() {
  return { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx", strict: true,
    skipLibCheck: false, noEmit: true, lib: ["ES2022", "DOM", "DOM.Iterable"], types: ["vite/client"] };
}

const publicTypeProbe = `import type React from "react";
import * as text from "@syndromatic/syncloudos/nse/text";
import * as sdk from "@syndromatic/syncloudos/sdk";
import type { NSETextGeometryProvider, NSEShapedTextProjectionOptions, NSEStringDrawingOptions } from "@syndromatic/syncloudos/nse/text";
import type { TFXTextGeometryCapabilities, TFXTextLayoutResult } from "@syndromatic/syncloudos/fx/text";
import type { TFXTextGeometryCapabilities as SDKGeometryCapabilities, TFXTextLayoutResult as SDKLayoutResult } from "@syndromatic/syncloudos/sdk";
export type GeometryContract = NSETextGeometryProvider;
export type ProjectionContract = NSEShapedTextProjectionOptions;
export type DrawingContract = NSEStringDrawingOptions;
export type PortableLayoutContract = { capabilities: TFXTextGeometryCapabilities; result: TFXTextLayoutResult };
export type SDKLayoutContract = { capabilities: SDKGeometryCapabilities; result: SDKLayoutResult };
declare const app: sdk.SynWareContextValue;
declare const port: ReturnType<typeof sdk.createSynWareNSETextLayoutPort>;
const mountedCapability: TFXTextGeometryCapabilities | undefined = app.textLayout.geometryCapabilities;
const bridgedCapability: TFXTextGeometryCapabilities | undefined = port.geometryCapabilities;
void [mountedCapability, bridgedCapability];
// @ts-expect-error The retired backend editor is not a public text contract.
void text.NSEEditor;
// @ts-expect-error Canonical history admission is private to mounted document machinery.
void sdk.DocumentEditAdmission;
// @ts-expect-error Framework text does not supply an application page-master engine.
void text.NSEPageMaster;
// @ts-expect-error Private examples are not SDK products.
void sdk.TextSystemExample;
// @ts-expect-error Native input authoring props cannot accept backend objects.
void ({} as React.ComponentProps<typeof text.NSETextInputHost>).editor;
`;
const viteConfig = `import { writeFileSync } from "node:fs";
export default { plugins: [{ name: "independent-input-records", generateBundle() {
  writeFileSync("resolved-modules.json", JSON.stringify([...this.getModuleIds()].sort(), null, 2));
} }] };
`;

function captureExampleSource() {
  const files = sourcePaths.slice().sort().map(path => { const bytes = readFileSync(join(repositoryRoot, path)); return { path, bytes: bytes.length, sha256: sha256(bytes) }; });
  return { sha256: sha256(JSON.stringify(files)), files };
}

/** Git may materialize OFL text with CRLF. Binary font identity never permits normalization. */
export function verifyCustomTextSystemLicensedResource(bytes, provenance) {
  assert(provenance && (provenance.file === fontFile || provenance.file === licenseFile), "Missing licensed example resource provenance");
  const canonical = provenance.file === licenseFile ? bytes.toString("utf8").replaceAll("\r\n", "\n") : bytes;
  assert.equal(sha256(canonical), provenance.sha256, `Licensed example resource fingerprint differs: ${provenance.file}`);
}

/** Pure preparation: reads owned example/fixture and licensed resources, with no writes or installation. */
export function createCustomTextSystemConsumerSources() {
  const files = new Map(exampleFiles.map(file => [`src/example/Contents/${file}`, readFileSync(join(repositoryRoot, "examples/TextSystem.app/Contents", file))]));
  const hostSource = readFileSync(join(repositoryRoot, hostFile));
  const hostTree = ts.createSourceFile(hostFile, hostSource.toString(), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert(hostTree.statements.some(node => ts.isImportDeclaration(node) && !node.importClause &&
    ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "@syndromatic/syncloudos/browser/styles.css"),
  "Private host bootstrap must load the public browser stylesheet.");
  files.set("src/example/Host/bootstrap.tsx", hostSource);
  const sources = JSON.parse(readFileSync(join(repositoryRoot, fontDirectory, "sources.json"), "utf8"));
  for (const [name, target] of [[fontFile, "src/assets/ExampleFont.ttf"], [licenseFile, "src/assets/ExampleFont-OFL.txt"]]) {
    const bytes = readFileSync(join(repositoryRoot, fontDirectory, name));
    verifyCustomTextSystemLicensedResource(bytes, sources.find(source => source.file === name));
    files.set(target, bytes);
  }
  files.set("src/assets/sources.json", JSON.stringify(sources.filter(source => source.file === fontFile || source.file === licenseFile), null, 2));
  files.set("src/main.tsx", createCustomTextSystemFixtureSource(readFileSync(join(repositoryRoot, fixturePath), "utf8")));
  files.set("src/public-contracts.ts", publicTypeProbe);
  const html = readFileSync(join(repositoryRoot, htmlPath), "utf8");
  files.set("index.html", replaceFixtureContract(html, 'src="./custom-text-surface.tsx"', 'src="/src/main.tsx"'));
  files.set("tsconfig.json", JSON.stringify({ compilerOptions: customTextSystemCompilerOptions(), include: ["src"] }, null, 2));
  files.set("vite.config.mjs", viteConfig);
  for (const [file, bytes] of files) if (/\.tsx?$/u.test(file)) assertCustomTextSystemSourceBoundary(bytes.toString(), file, [...files.keys()]);
  return files;
}

function serve(directory) {
  return createServer((request, response) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname); } catch { response.writeHead(400).end(); return; }
    const path = resolve(directory, "." + (pathname === "/" ? "/index.html" : pathname));
    if (!isWithin(directory, path) || !existsSync(path)) { response.writeHead(404).end(); return; }
    response.setHeader("Content-Type", ({ ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".wasm": "application/wasm", ".ttf": "font/ttf",
      ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" })[extname(path)] ?? "application/octet-stream");
    response.end(readFileSync(path));
  });
}

async function browserContract(page, errors) {
  const snapshot = () => page.evaluate(() => window.customTextSurface.getSnapshot());
  const ready = async () => {
    await page.waitForFunction(() => {
      const state = window.customTextSurface?.getSnapshot();
      return state?.geometryReady && state.inputClients.length === 3 || !!document.getElementById("fixture-error")?.textContent;
    });
    assert.equal(await page.locator("#fixture-error").textContent(), "");
    assert.equal((await snapshot()).error, null);
  };
  await ready();
  const initial = await snapshot();
  assert.deepEqual(initial.inputClients.slice().sort(), ["body", "bodyMirror", "caption"]);
  const body = page.getByRole("textbox", { name: "Body", exact: true });
  await page.evaluate(() => { window.customTextSurface.select("bodyMirror", 8); window.customTextSurface.select("body", 0, 5); });
  await body.focus(); await body.pressSequentially("Hello");
  await page.waitForFunction(() => window.customTextSurface.getSnapshot().bodyText.startsWith("Hello engines"));
  const edited = await snapshot();
  assert.equal(edited.revision, initial.revision + 5, "Each native edit must be one canonical document transaction.");
  assert.equal(edited.captionText, initial.captionText); assert.deepEqual(edited.selections.bodyMirror, { location: 8, length: 0 });
  assert.equal(await page.getByRole("textbox", { name: "Body mirror", exact: true }).inputValue(), edited.bodyText);
  for (let i = 0; i < 5; i++) await page.getByTestId("undo").click();
  await page.waitForFunction(expected => window.customTextSurface.getSnapshot().bodyText === expected, initial.bodyText);
  for (let i = 0; i < 5; i++) await page.getByTestId("redo").click();
  await page.waitForFunction(expected => window.customTextSurface.getSnapshot().bodyText === expected, edited.bodyText);
  assert.equal((await snapshot()).captionText, initial.captionText);

  await page.evaluate(() => window.customTextSurface.select("body", 0, 20));
  await page.waitForFunction(() => document.querySelector('[data-testid="font-size-state"]').textContent === "mixed");
  await page.getByTestId("font-size-input").fill("21"); const beforeInspector = await snapshot();
  await page.evaluate(() => window.customTextSurface.activate("caption"));
  await page.getByTestId("font-size-apply").click();
  await page.evaluate(() => window.customTextSurface.activate("body"));
  await page.waitForFunction(() => document.querySelector('[data-testid="font-size-state"]').textContent === "21px"); await ready();
  const formatted = await snapshot(); assert.equal(formatted.revision, beforeInspector.revision + 1);
  assert.equal(formatted.captionText, initial.captionText); assert(formatted.fontGeneration > beforeInspector.fontGeneration);

  await body.focus(); await page.evaluate(() => window.customTextSurface.select("body", 0));
  const beforeGeometry = await snapshot();
  const first = await page.evaluate(() => window.customTextSurface.firstRect("body", { location: 0, length: 0 })); assert.equal(first?.status, "ready");
  await page.evaluate(() => window.customTextSurface.setZoom(1.5));
  const zoomed = await page.evaluate(() => window.customTextSurface.firstRect("body", { location: 0, length: 0 })); assert.equal(zoomed?.status, "ready");
  assert(Math.abs(zoomed.rect.rect.height / first.rect.rect.height - 1.5) < .00001); assert(zoomed.rect.transformRevision > first.rect.transformRevision);
  const bounds = await page.getByTestId("body-surface").locator("svg").first().boundingBox(); assert(bounds);
  await page.mouse.click(bounds.x + 30, bounds.y + 39); assert(await body.evaluate(element => document.activeElement === element));
  await page.evaluate(() => { document.querySelector('[data-testid="body-surface"] .shaped-boxes').scrollTop = 70; });
  await page.waitForFunction(revision => {
    const rect = window.customTextSurface.firstRect("body", { location: 0, length: 0 });
    return rect?.status === "ready" && rect.rect.transformRevision > revision;
  }, zoomed.rect.transformRevision);
  const scrolled = await page.evaluate(() => window.customTextSurface.firstRect("body", { location: 0, length: 0 }));
  assert.equal(scrolled.status, "ready"); assert(scrolled.rect.rect.y < zoomed.rect.rect.y);
  assert.equal((await snapshot()).revision, beforeGeometry.revision); assert.equal((await snapshot()).bodyText, beforeGeometry.bodyText);

  const beforePDF = await snapshot();
  const ordinaryPDF = await page.evaluate(() => window.customTextSurface.exportPDF());
  assert(ordinaryPDF.byteLength > 1000); assert.equal(ordinaryPDF.revision, beforePDF.revision);
  assert.equal((await snapshot()).revision, beforePDF.revision); assert.deepEqual((await snapshot()).history, beforePDF.history);
  await page.evaluate(() => { window.customInstalledCaptureRace = true; });
  const capturedPDF = await page.evaluate(() => window.customTextSurface.exportPDF());
  const captured = await page.evaluate(() => { window.customInstalledCaptureRace = false; return window.customInstalledPDF; });
  assert.equal(capturedPDF.revision, beforePDF.revision); const afterCapture = await snapshot();
  assert.equal(afterCapture.revision, beforePDF.revision + 1); assert(afterCapture.captionText.startsWith("Later captured edit "));
  assert.equal(afterCapture.bodyText, beforePDF.bodyText);
  const bytes = Uint8Array.from(captured.bytes); assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), "%PDF-"); assert(captured.pages > 0);
  // Independent Node verifier only; neither PDF.js nor a backend is an app authoring import.
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: bytes.slice(), useSystemFonts: false, disableFontFace: true });
  let extracted = "", pageCount;
  try {
    const pdf = await task.promise; pageCount = pdf.numPages;
    for (let i = 1; i <= pdf.numPages; i++) { const content = await (await pdf.getPage(i)).getTextContent(); extracted += content.items.map(item => "str" in item ? item.str : "").join(""); }
  } finally { await task.destroy(); }
  assert.equal(pageCount, captured.pages); assert(extracted.includes("engines")); assert(extracted.includes("Figure 1.")); assert(!extracted.includes("Later captured edit"));
  await page.getByTestId("undo").click(); await page.waitForFunction(expected => window.customTextSurface.getSnapshot().captionText === expected, beforePDF.captionText); await ready();
  assert.equal((await snapshot()).bodyText, beforePDF.bodyText);
  assert.equal(await page.getByRole("textbox").count(), 3); assert.equal(await page.locator("[data-input-error]").count(), 0);
  await page.evaluate(() => window.customTextSurface.dispose());
  const disposed = await snapshot(); assert.equal(disposed.disposed, true); assert.equal(disposed.geometryReady, false); assert.deepEqual(errors, []);
  return { codecAdmission: true, nativeTransactions: 5, sharedHistoryUndoRedo: true, independentSelectionsAndFlows: true,
    retainedMixedInspector: true, fontReflow: true, zoom: 1.5, scrollHitTesting: true, zoomSemanticRevisionUnchanged: true,
    capturedPDF: { revision: captured.revision, byteLength: bytes.length, pages: pageCount, sha256: sha256(bytes), searchable: true, laterEditExcluded: true },
    outputDoesNotDirtyHistory: true, disposed: true, errors };
}

/** A second PUBLIC host architecture, with a new runtime/store/mount on each admission. */
async function freshHostContract(page, errors) {
  const snapshot = () => page.evaluate(() => window.customTextSurface.getSnapshot());
  const native = () => page.evaluate(() => window.customTextSurface.nativeSnapshot());
  const ready = async () => {
    await page.waitForFunction(() => window.customTextSurface?.getSnapshot().geometryReady && window.customTextSurface.getSnapshot().inputClients.length === 3 || !!document.getElementById("fixture-error")?.textContent);
    assert.equal(await page.locator("#fixture-error").textContent(), "");
    assert.equal((await snapshot()).error, null);
  };
  await page.evaluate(() => window.customTextSurface.startFreshHost()); await ready();
  // Wait for real launch presentation to expose normal-sized controls, then verify the installed host layout.
  await page.waitForFunction(() => document.querySelector('[data-testid="undo"]')?.getBoundingClientRect().width >= 40);
  const hostLayout = await page.evaluate(() => {
    const stage = document.querySelector(".webspring-apps-container"), frame = document.querySelector(".webspring-app-view-frame");
    return { stage: stage ? getComputedStyle(stage).position : null, frame: frame ? getComputedStyle(frame).position : null };
  });
  assert.deepEqual(hostLayout, { stage: "fixed", frame: "absolute" }, "Installed public host stylesheet must supply application stage layout.");
  assert.equal(await page.getByRole("alertdialog").count(), 0, "A real resource-error guard must not obstruct the application.");
  const initial = await native();
  await page.evaluate(() => window.customTextSurface.insertImage()); await ready();
  const withAsset = await native(), firstAsset = await page.evaluate(() => window.customTextSurface.assetReceipt());
  assert.equal(withAsset.dirtyRevision, initial.dirtyRevision + 1); assert.equal(withAsset.model.assets.length, 1);
  assert.equal(firstAsset.assetDurability, "durable"); assert.equal(firstAsset.active, true);
  assert.equal(withAsset.model.assets[0].hash, "sha256:" + sha256(Uint8Array.from(firstAsset.bytes)));
  await page.getByTestId("undo").click(); assert.deepEqual((await native()).model.assets, []);
  await page.getByTestId("redo").click(); assert.deepEqual((await native()).model.assets, withAsset.model.assets); await ready();

  const beforeMove = await native();
  await page.getByTestId("object-preview").click();
  assert((await snapshot()).objectPreview); assert.deepEqual((await native()).model, beforeMove.model);
  const refusals = await page.evaluate(async () => {
    const pdf = await window.customTextSurface.exportPDF().then(() => false, error => /refused/.test(String(error)));
    const save = await window.customTextSurface.saveNative().then(() => false, error => /object|editing|settle|preview/i.test(String(error)));
    return { pdf, save };
  });
  assert.deepEqual(refusals, { pdf: true, save: true }); assert.equal((await native()).dirtyRevision, beforeMove.dirtyRevision);
  await page.getByTestId("object-cancel").click(); assert.equal((await snapshot()).objectPreview, null);
  await page.getByTestId("object-preview").click(); await page.getByTestId("object-commit").click(); await ready();
  const moved = await native(); assert.equal(moved.dirtyRevision, beforeMove.dirtyRevision + 1);
  assert.notDeepEqual(moved.model.object, beforeMove.model.object); assert.deepEqual(moved.model.flows, beforeMove.model.flows);
  await page.getByTestId("undo").click(); assert.deepEqual((await native()).model.object, beforeMove.model.object);
  await page.getByTestId("redo").click(); assert.deepEqual((await native()).model.object, moved.model.object); await ready();

  // Native input has the same canonical owner after this independently mounted browser host.
  await page.evaluate(() => window.customTextSurface.select("body", 0, 5));
  const body = page.getByRole("textbox", { name: "Body", exact: true }); await body.focus(); await body.pressSequentially("Saved");
  await page.waitForFunction(() => window.customTextSurface.getSnapshot().bodyText.startsWith("Saved engines")); await ready();
  const beforeSave = await native(), saved = await page.evaluate(() => window.customTextSurface.saveNative());
  assert.equal(saved.state, "clean"); assert.equal(saved.dirtyRevision, beforeSave.dirtyRevision); assert.deepEqual(saved.model, beforeSave.model);
  const record = await page.evaluate(() => window.customNativeRecord); assert.deepEqual(record.content, saved.model); assert.deepEqual(record.version, saved.currentVersion);
  const manifest = JSON.parse(record.metadata["syncloudos.document.assets.v1"]);
  assert.deepEqual(manifest.assets, saved.model.assets); assert.deepEqual(manifest.scope, saved.model.assets[0].scope);
  const firstPDF = await page.evaluate(() => window.customTextSurface.exportPDF()); assert.equal(firstPDF.revision, saved.dirtyRevision); assert(firstPDF.byteLength > 1000);
  await page.evaluate(() => window.customTextSurface.startFreshHost(true)); await ready();
  const reopened = await native(), freshAsset = await page.evaluate(() => window.customTextSurface.assetReceipt());
  assert.notEqual(reopened.id, saved.id); assert.deepEqual(reopened.model, saved.model); assert.deepEqual(reopened.currentVersion, saved.currentVersion);
  assert.notEqual(freshAsset.descriptor.leaseId, firstAsset.descriptor.leaseId); assert.equal(freshAsset.active, true);
  assert.deepEqual(freshAsset.bytes, firstAsset.bytes); assert.equal(reopened.model.assets[0].hash, "sha256:" + sha256(Uint8Array.from(freshAsset.bytes)));
  assert.equal(await page.evaluate(lease => window.customTextSurface.isAssetLeaseActive(lease), firstAsset.descriptor), false);
  assert.deepEqual({ width: freshAsset.width, height: freshAsset.height }, { width: 2, height: 2 });
  const reopenedPDF = await page.evaluate(() => window.customTextSurface.exportPDF()); assert.equal(reopenedPDF.revision, reopened.dirtyRevision);
  const pdfBytes = Uint8Array.from((await page.evaluate(() => window.customInstalledPDF)).bytes);
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: pdfBytes.slice(), useSystemFonts: false, disableFontFace: true }); let extracted = "";
  try { const pdf = await task.promise; for (let i = 1; i <= pdf.numPages; i++) { const text = await (await pdf.getPage(i)).getTextContent(); extracted += text.items.map(item => "str" in item ? item.str : "").join(""); } }
  finally { await task.destroy(); }
  assert(extracted.includes("Saved")); assert(extracted.includes("Figure 1."));
  await page.evaluate(() => { window.customTextSurface.select("body", 0, 5); });
  const freshBody = page.getByRole("textbox", { name: "Body", exact: true }); await freshBody.focus(); await freshBody.pressSequentially("Fresh");
  await page.waitForFunction(() => window.customTextSurface.getSnapshot().bodyText.startsWith("Fresh engines"));
  for (let i = 0; i < 5; i++) await page.getByTestId("undo").click(); assert.deepEqual((await native()).model, reopened.model); await ready();
  // Return to the clean saved revision before disposing the real host; no close-dialog automation.
  await page.evaluate(() => window.customTextSurface.saveNative());
  const finalAsset = await page.evaluate(() => window.customTextSurface.assetReceipt());
  await page.evaluate(() => window.customTextSurface.dispose());
  assert.equal(await page.evaluate(lease => window.customTextSurface.isAssetLeaseActive(lease), finalAsset.descriptor), false);
  const hostReceipt = await page.evaluate(() => window.customHostReceipt);
  assert.equal(hostReceipt.storesCreated, 2); assert.equal(hostReceipt.storesDisposed, 2); assert.equal(hostReceipt.hostsMounted, 2);
  assert.equal(hostReceipt.runtimeIds.length, 2); assert.notEqual(hostReceipt.runtimeIds[0], hostReceipt.runtimeIds[1]);
  assert.deepEqual(hostReceipt.previousLease, { leaseId: firstAsset.descriptor.leaseId, wasActive: true, revoked: true, rejectedByFreshHost: true });
  assert.deepEqual(errors, []);
  return { nativeDurability: "memory", assetDurability: "durable", crossStoreAtomicity: false, fullPageReload: false,
    hostArchitecture: "public-browser-host-contribution", freshRuntimes: 2, runtimeIds: hostReceipt.runtimeIds, nativeLocation: hostReceipt.nativeLocation, scope: hostReceipt.scope,
    savedVersion: saved.currentVersion, firstDocumentId: saved.id, reopenedDocumentId: reopened.id,
    firstLeaseId: firstAsset.descriptor.leaseId, freshLeaseId: freshAsset.descriptor.leaseId,
    oldLeaseRevoked: true, originalCapabilityObjectChecked: hostReceipt.previousLease, newLeaseActive: true, identicalVerifiedBytes: true, bytesSha256: sha256(Uint8Array.from(freshAsset.bytes)),
    decodedImage: { width: freshAsset.width, height: freshAsset.height }, manifestPreserved: true, assetHistoryUndoRedo: true,
    objectPreviewCancel: true, previewSaveExportRefused: true, objectSingleCommitUndoRedo: true, nativeInputAfterReopen: true,
    searchableCapturedAssetPDF: { byteLength: pdfBytes.length, revision: reopenedPDF.revision, sha256: sha256(pdfBytes) }, disposed: true };
}

/** Run only after the parent freezes source and publishes a manifest-backed SDK archive. */
export async function checkCustomTextSystemConsumer(options = {}) {
  const evidence = { schemaVersion: 1, architecture: "private-custom-document-engine", passed: false,
    execution: "started", receiptPath, sourceSha256: null, archiveSha256: null, resourcesSha256: null };
  let consumer, browser, server;
  try {
    const exampleSource = captureExampleSource(), files = createCustomTextSystemConsumerSources();
    consumer = createInstalledConsumer(repositoryRoot, "synware-custom-text-system-", options);
    Object.assign(evidence, { sourceSha256: consumer.sourceSha256, archiveSha256: consumer.archiveSha256, resourcesSha256: consumer.resourcesSha256,
      integrity: consumer.integrity, commit: consumer.manifest.commit, manifestPath: consumer.manifestPath, archive: consumer.archive,
      consumerRoot: consumer.root, installed: consumer.installed, exampleSource, outsideCheckout: !isWithin(repositoryRoot, consumer.root) });
    evidence.nodeVersion = process.version;
    const pkg = JSON.parse(readFileSync(join(consumer.installed, "package.json"), "utf8"));
    for (const entry of publicEntries) assert(pkg.exports[`./${entry}`], `Missing installed public entry: ${entry}`);
    evidence.publicEntries = Object.fromEntries(publicEntries.map(entry => [entry, pkg.exports[`./${entry}`]]));
    assert.equal(pkg.exports["./nse/editor"], undefined);
    for (const entry of Object.keys(pkg.exports)) assert(!/\*|\/(?:src|types|internal|private)(?:\/|$)/u.test(entry), `Installed package has a public deep escape: ${entry}`);
    for (const [file, bytes] of files) write(consumer.root, file, bytes);
    evidence.copiedFiles = [...files].map(([path, bytes]) => ({ path, sha256: sha256(bytes), bytes: Buffer.byteLength(bytes) }));
    evidence.strictCompilerOptions = customTextSystemCompilerOptions();
    runNode([join(consumer.root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], consumer.root, { log: join(consumer.root, "typecheck.log") });
    evidence.strictTSC = true;
    runNode([join(consumer.root, "node_modules/vite/bin/vite.js"), "build"], consumer.root, { log: join(consumer.root, "build.log") });
    const modules = JSON.parse(readFileSync(join(consumer.root, "resolved-modules.json"), "utf8"));
    assertIndependentModules(consumer.root, modules); assert(modules.some(id => id.replaceAll("\\", "/").includes("/node_modules/@syndromatic/syncloudos/")));
    for (const file of ["example.ts", "layout.ts", "view.tsx", "model.ts", "index.tsx", "image.ts"]) assert(modules.some(id => id.replaceAll("\\", "/").endsWith(`/src/example/Contents/${file}`)), `Private engine module not in the installed bundle: ${file}`);
    assert(modules.some(id => id.replaceAll("\\", "/").endsWith("/src/example/Host/bootstrap.tsx")), "Guarded host bootstrap missing from installed module graph.");
    assert(modules.some(id => id.replaceAll("\\", "/").endsWith("/node_modules/@syndromatic/syncloudos/browser/styles.css")), "Required public browser stylesheet missing from installed module graph.");
    evidence.modules = { count: modules.length, independent: true, inputRecords: join(consumer.root, "resolved-modules.json"), sha256: sha256(JSON.stringify(modules)) };
    server = serve(join(consumer.root, "dist"));
    await new Promise((accept, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", accept); });
    const { chromium } = await import("playwright"); browser = await chromium.launch({ headless: true });
    evidence.browser = { name: "chromium", version: browser.version() };
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    // Listen before navigation; begin readiness waits on the loaded document, avoiding a context race.
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    evidence.runtime = await browserContract(page, errors);
    evidence.freshHost = await freshHostContract(page, errors);
    verifyInstalledSdkResources(consumer.installed, consumer.manifest);
    assertSdkSourceUnchanged(consumer.manifest.source, captureSdkSourceFingerprint(repositoryRoot));
    assert.deepEqual(captureExampleSource(), exampleSource, "Private example or licensed fixture changed during package verification.");
    evidence.sourceUnchanged = true; evidence.execution = "completed"; evidence.passed = true;
    console.log("Installed custom text consumer passed: strict public declarations, independent archive bundle, private engine codec, native shared history, inspector, shaped geometry, immutable searchable PDF and disposal.");
    return evidence;
  } catch (error) { evidence.execution = "failed"; evidence.error = error.stack ?? String(error); throw error; }
  finally {
    try { await browser?.close(); } finally {
      try { if (server) await new Promise(accept => server.close(accept)); } finally {
        mkdirSync(dirname(receiptPath), { recursive: true }); writeFileSync(receiptPath, JSON.stringify(evidence, null, 2) + "\n");
      }
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await checkCustomTextSystemConsumer();
