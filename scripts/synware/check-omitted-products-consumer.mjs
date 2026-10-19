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
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assertIndependentModules, createInstalledConsumer, isWithin, runNode } from "./installed-consumer.mjs";
import { assertSdkSourceUnchanged, captureSdkSourceFingerprint } from "./sdk-package-manifest.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const productIds = ["journal", "journal-publisher", "syncal"];
const themes = { atmo: "atmoAppearance" };
const output = resolve(repositoryRoot, ".artifacts/synapp-sdk/omitted-products-consumer.json");
const sha = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const files = (root) => readdirSync(root, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(root, entry.name)) : [join(root, entry.name)]);

function write(root, path, contents) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), contents); }

function staticServer(directory) {
  const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
  const server = createServer((request, response) => {
    const requested = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const path = resolve(directory, "." + (requested === "/" ? "/index.html" : requested));
    if (!isWithin(directory, path)) { response.writeHead(403).end(); return; }
    if (!existsSync(path)) { response.writeHead(404).end(); return; }
    response.setHeader("Content-Type", mime[extname(path)] ?? "application/octet-stream");
    response.end(readFileSync(path));
  });
  return new Promise((accept, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => accept({ server, url: `http://127.0.0.1:${server.address().port}` })); });
}

const probeSource = `import { useEffect } from "react";
import { mountSynCloudOS } from "@syndromatic/syncloudos/browser";
import { createSynWare, defineSynWareServiceToken, useSynWare, useSynWareLumina } from "@syndromatic/syncloudos/sdk";
import { LUFXSearchableItem } from "@syndromatic/syncloudos/fx/lumina";
import { defineWebspring, type WebspringViewProps } from "@syndromatic/syncloudos/webspring";
import "@syndromatic/syncloudos/nse/styles.css";
declare global { interface Window { consumer: any; } }
window.consumer = { ready: false };
const journalProbeToken = defineSynWareServiceToken<unknown>({ id: "journal.content", minimumVersion: "2.0.0", contractVersion: "journal.content.v2" });
const synCalProbeToken = defineSynWareServiceToken<unknown>({ id: "syncal.calendar", minimumVersion: "1.0.0", contractVersion: "syncal.calendar.v1" });
function Probe() {
  const app = useSynWare();
  const lumina = useSynWareLumina();
  useEffect(() => {
    void (async () => {
      const index = lumina.createIndex();
      try {
        const item = new LUFXSearchableItem({
          id: "installed-lumina-item",
          domain: "consumer.notes",
          contentType: "note",
          title: "Installed Lumina worker",
          activation: { kind: "named-route", version: 1, routeName: "probe.item", parameters: { id: "installed-lumina-item" } },
          revision: "r1",
        });
        const committed = await index.upsert(item, "installed-lumina-mutation");
        const snapshot = await index.snapshot();
        const lexical = await index.query({ text: "installed lumina worker", locale: "en", limit: 5 });
        window.consumer.lumina = {
          committed,
          state: snapshot.state,
          ids: snapshot.items.map(entry => entry.id),
          query: {
            tokenizerVersion: lexical.tokenizerVersion,
            rankerVersion: lexical.rankerVersion,
            ids: lexical.results.map(entry => entry.item.id),
          },
        };
        window.consumer.services = Object.fromEntries([
          [journalProbeToken.id, app.services.optional(journalProbeToken).available],
          [synCalProbeToken.id, app.services.optional(synCalProbeToken).available],
        ]);
        window.consumer.documentTypes = Object.fromEntries(["com.syndromatic.journal-post", "com.syndromatic.syncal-event", "journal.post", "syncal.event"].map(id => [id, app.documents.workspaceDocuments.hasType(id)]));
        window.consumer.ready = true;
      } finally { index.dispose(); }
    })().catch(error => { window.consumer.error = String(error); });
  }, [app, lumina]);
  return <p id="probe">Independent installed application</p>;
}
function Website({ model, actions, applicationOutlet }: WebspringViewProps) {
  useEffect(() => { window.consumer.model = model; window.consumer.actions = actions; }, [model, actions]);
  return <main><button id="open" onClick={() => { void actions.openApp("org.example.probe"); }}>Open probe</button>{applicationOutlet}</main>;
}
const shell = defineWebspring({ manifest: { schemaVersion: 1, id: "org.example.shell", version: "1.0.0", title: "Independent shell", webspringShell: {
  views: [{ id: "website", presentations: ["desktop", "tablet", "mobile"], mode: "persistent" }],
  defaults: { desktop: "website", tablet: "website", mobile: "website" }, homeRoute: "/", branding: { name: { key: "brand", fallback: "Independent" } }
}}, components: { website: Website } });
const app = createSynWare({ manifest: { schemaVersion: 1, id: "org.example.probe", version: "1.0.0", title: "Probe", runtime: { policy: { public: true } }, presentations: ["desktop", "tablet", "mobile"], routes: [{ path: "/probe", primary: true }], permissions: ["lumina.index", "lumina.query"], services: [{ id: "journal.content", required: false }, { id: "syncal.calendar", required: false }], webspring: { visible: true, order: 1 } }, root: Probe });
const element = document.getElementById("root")!;
mountSynCloudOS({ element, bundles: [app], shell, authentication: "disabled" }).then(host => { window.consumer.dispose = () => host.dispose("consumer verification"); }).catch(error => { window.consumer.error = String(error); });
`;

async function main() {
  const consumer = createInstalledConsumer(repositoryRoot);
  const { root, installed } = consumer;
  const evidence = { archiveSha256: sha(consumer.archive), integrity: consumer.integrity, commit: consumer.manifest.commit,
    sourceSha256: consumer.sourceSha256, resourcesSha256: consumer.resourcesSha256,
    installedOutsideRepository: true, typecheck: false, packageGraph: {}, runtime: null, themes: [], passed: false };
  let browser;
  try {
    for (const path of files(installed)) {
      assert(!/[/\\]SynWare[/\\]|[/\\]AppearanceAssets[/\\]|[/\\]cappuccino[/\\]/u.test(path), `Product/provenance file shipped: ${path}`);
    }
    write(root, "tsconfig.json", JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx", lib: ["ES2022", "DOM", "DOM.Iterable"], strict: true, skipLibCheck: false, noEmit: true, types: ["vite/client"] }, include: ["src"] }));
    write(root, "src/main.tsx", probeSource);
    write(root, "index.html", '<!doctype html><html><head><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>');
    write(root, "vite.config.mjs", `import { writeFileSync } from "node:fs";
export default { plugins: [{ name: "record-independent-inputs", generateBundle() { writeFileSync("resolved-modules.json", JSON.stringify([...this.getModuleIds()].sort(), null, 2)); } }], esbuild: { jsx: "automatic" }, build: { sourcemap: false } };`);
    runNode([join(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], root, { log: join(root, "typecheck.log") });
    evidence.typecheck = true;
    runNode([join(root, "node_modules/vite/bin/vite.js"), "build"], root, { log: join(root, "build.log") });
    const moduleIds = JSON.parse(readFileSync(join(root, "resolved-modules.json"), "utf8"));
    assertIndependentModules(root, moduleIds);
    evidence.packageGraph = { modules: moduleIds.length, allResolvedInsideInstallation: true, productModules: 0 };
    browser = await chromium.launch({ headless: true });
    const hosted = await staticServer(join(root, "dist"));
    try {
      const page = await browser.newPage();
      const errors = []; const requests = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", (request) => requests.push(request.url()));
      await page.goto(hosted.url);
      await page.waitForFunction(() => window.consumer?.actions || window.consumer?.error, { timeout: 30000 });
      assert.equal(await page.evaluate(() => window.consumer.error ?? null), null);
      await page.locator("#open").click();
      await page.waitForFunction(() => window.consumer.ready, { timeout: 30000 });
      const result = await page.evaluate(async (ids) => {
        const value = window.consumer;
        const routes = [];
        for (const id of ids) routes.push({ id, result: await value.actions.openApp(id) });
        return { apps: value.model.apps.map(app => app.id), services: value.services, documentTypes: value.documentTypes, lumina: value.lumina, widgets: value.model.widgets.map(entry => entry.widget.id), routes };
      }, productIds);
      assert.deepEqual(result.apps, ["org.example.probe"]);
      assert(Object.values(result.services).every(available => available === false));
      assert(Object.values(result.documentTypes).every(available => available === false));
      assert.deepEqual(result.lumina, {
        committed: { mutationId: "installed-lumina-mutation", checkpoint: { generation: 1, revision: 1 }, replayed: false },
        state: "ready",
        ids: ["installed-lumina-item"],
        query: {
          tokenizerVersion: "lufx-tokenizer-v1",
          rankerVersion: "lufx-lexical-v2",
          ids: ["installed-lumina-item"],
        },
      });
      assert(result.routes.every(entry => entry.result.status !== "completed"));
      assert(!requests.some(url => /Journal\.app|JournalPublisher\.app|SynCal\.app|\/SynWare\//u.test(url)));
      assert(requests.some(url => /\/assets\/lumina-index\.worker-[A-Za-z0-9_-]+\.js(?:\?|$)/u.test(url)), "Installed consumer did not execute the packaged Lumina worker asset.");
      assert.deepEqual(errors, []);
      evidence.runtime = { ...result, productAssetRequests: 0, luminaWorkerRequests: requests.filter(url => /\/assets\/lumina-index\.worker-/u.test(url)).length, errors };
      await page.evaluate(() => window.consumer.dispose());
      await page.close();
    } finally { await new Promise(accept => hosted.server.close(accept)); }

    for (const [theme, exported] of [["neutral", null], ...Object.entries(themes)]) {
      const themeImport = exported ? `import { ${exported} as appearance } from "@syndromatic/syncloudos/nse/themes/${theme}";` : 'const appearance = defineNSEAppearance({ id: "independent", displayName: "Independent" });';
      write(root, "src/main.tsx", `import { createRoot } from "react-dom/client";
import { NSEAppearanceProvider, defineNSEAppearance, NSEStackView } from "@syndromatic/syncloudos/nse";
import "@syndromatic/syncloudos/nse/styles.css";
${themeImport}
createRoot(document.getElementById("root")!).render(<NSEAppearanceProvider appearance={appearance}><NSEStackView aria-label="Theme probe"><span>Theme ${theme}</span></NSEStackView></NSEAppearanceProvider>);`);
      runNode([join(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], root);
      runNode([join(root, "node_modules/vite/bin/vite.js"), "build"], root, { log: join(root, `theme-${theme}.log`) });
      const ids = JSON.parse(readFileSync(join(root, "resolved-modules.json"), "utf8"));
      assertIndependentModules(root, ids);
      const importedThemes = ids.filter(id => /\/nse\/themes\/[^/]+\.js(?:\?|$)/u.test(id.replaceAll("\\", "/"))).map(id => id.replaceAll("\\", "/").match(/\/nse\/themes\/([^/]+)\.js/u)[1]).sort();
      assert.deepEqual(importedThemes, exported ? [theme] : []);
      const css = files(join(root, "dist")).filter(path => path.endsWith(".css")).map(path => readFileSync(path, "utf8")).join("\n");
      for (const other of Object.keys(themes).filter(name => name !== theme)) {
        const selector = new RegExp(`\\[data-nse-appearance=(?:["']?)${other}(?:["']?)\\]`, "u");
        assert(!selector.test(css), `${theme} includes ${other} theme styles.`);
      }
      const server = await staticServer(join(root, "dist"));
      try {
        const page = await browser.newPage(); const errors = []; const failures = [];
        page.on("pageerror", error => errors.push(error.message));
        page.on("response", response => { if (response.status() >= 400) failures.push(response.url()); });
        await page.goto(server.url);
        await page.locator(`[data-nse-appearance="${exported ? theme : "independent"}"]`).first().waitFor();
        assert.deepEqual(errors, []);
        evidence.themes.push({ theme, importedThemes, mounted: true, typecheck: true, errors, failedRequests: failures });
        await page.close();
      } finally { await new Promise(accept => server.server.close(accept)); }
    }
    assertSdkSourceUnchanged(consumer.manifest.source, captureSdkSourceFingerprint(repositoryRoot));
    evidence.passed = true;
    console.log("Installed consumer passed: independent npm installation, declarations, browser omissions, and five theme configurations.");
  } catch (error) {
    evidence.error = error instanceof Error ? error.stack : String(error);
    evidence.retainedConsumer = root;
    throw error;
  } finally {
    if (browser) await browser.close();
    mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n");
    if (evidence.passed && !process.argv.includes("--keep")) rmSync(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
