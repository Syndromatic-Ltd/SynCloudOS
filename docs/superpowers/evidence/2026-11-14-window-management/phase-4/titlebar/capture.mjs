import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const output = dirname(fileURLToPath(import.meta.url));
const framework = resolve(output, "../../../../../..");
const baseline = "C:/Users/Kavish Krishnakumar/.codex/worktrees/window-transfer-spike/framework";
const menuOutput = resolve(output, "../../phase-5/menu");
const sourceFiles = ["src/NSE/Windows/WindowTitlebarView.tsx", "src/NSE/Windows/WindowTitlebarView.css", "src/NSE/Toolbars/nse-toolbars.css", "src/Themes/Atmo.scostheme/Contents/Resources/atmo.window-titlebar.css"];
const hash = async path => createHash("sha256").update(await readFile(path)).digest("hex");
const git = (root, ...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
const provenance = {
  capturedAt: new Date().toISOString(),
  after: { root: framework, head: git(framework, "rev-parse", "HEAD"), status: git(framework, "status", "--porcelain", "-uno"), sourceHashes: Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, await hash(resolve(framework, file))]))) },
  before: { root: baseline, head: git(baseline, "rev-parse", "HEAD"), status: git(baseline, "status", "--porcelain", "-uno"), titlebarAndThemeDiff: git(baseline, "diff", "--name-only", "--", "src/NSE/Windows", "src/NSE/Toolbars", "src/Themes/Atmo.scostheme", "tests/e2e/fixtures/theme-baseline") },
  matrix: { viewports: [{ name: "desktop", width: 1280, height: 850 }, { name: "phone", width: 390, height: 844 }], schemes: ["light", "dark"], materials: ["cumulus", "metal"], deviceScaleFactor: 1 },
  comparisonLimit: "Different real fixtures: before is the unchanged legacy TopBar catalogue, with only its outer catalogue framing normalized; after is the shared-titlebar layout fixture with a configured toolbar and accessories. These are visual references, not pixel-equivalence pairs or production-stage acceptance.",
  baselineFramingCSS: "#theme-baseline-surface { margin:20px; padding:0; width:calc(100% - 40px); min-height:300px; position:relative; }",
};
if (provenance.before.titlebarAndThemeDiff) throw new Error("The selected baseline's titlebar/theme sources are dirty.");
await mkdir(output, { recursive: true }); await mkdir(menuOutput, { recursive: true });
const browser = await chromium.launch({ headless: true });
provenance.browserVersion = browser.version();
const titlebarCaptures = [], menuCaptures = [];
async function settle(page, selector) {
  await page.locator(selector).first().waitFor({ state: "visible", timeout: 120_000 });
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
}
async function capture(page, target, file, url, metadata, selector) {
  const geometry = await page.locator(selector).first().boundingBox();
  if (!geometry || geometry.width <= 0 || geometry.height <= 0) throw new Error(`Missing rendered surface for ${file}`);
  const bytes = await page.screenshot({ path: resolve(target, file), fullPage: false, animations: "disabled", caret: "hide" });
  return { ...metadata, file, url, geometry, sha256: createHash("sha256").update(bytes).digest("hex") };
}
try {
  for (const viewport of provenance.matrix.viewports) for (const scheme of provenance.matrix.schemes) for (const material of provenance.matrix.materials) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1, colorScheme: scheme, reducedMotion: "reduce" });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => { errors.push(error.message); process.stderr.write(`${name}: ${error.message}\n`); });
    const name = `${viewport.name}-${scheme}-${material}`;
    const beforeUrl = `http://127.0.0.1:5422/tests/e2e/fixtures/theme-baseline/index.html?surface=top-bar-${material === "metal" ? "atmoMetal" : "atmoCumulus"}-${scheme}&scheme=${scheme}`;
    await page.goto(beforeUrl, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await settle(page, ".nse-app-topbar");
    await page.addStyleTag({ content: provenance.baselineFramingCSS });
    await settle(page, ".nse-app-topbar");
    titlebarCaptures.push(await capture(page, output, `before-${name}.png`, beforeUrl, { viewport, scheme, material, state: "before", errors: [...errors] }, ".nse-app-topbar"));
    errors.length = 0;
    const afterUrl = `http://127.0.0.1:5418/tests/e2e/fixtures/window-titlebar-layout.html?style=unified&width=${viewport.width - 40}&scheme=${scheme}${material === "cumulus" ? "&cumulus" : ""}`;
    await page.goto(afterUrl, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await settle(page, '[role="toolbar"]');
    titlebarCaptures.push(await capture(page, output, `after-${name}.png`, afterUrl, { viewport, scheme, material, state: "after", errors: [...errors] }, "[data-window-titlebar]"));
    errors.length = 0;
    const menuUrl = `${afterUrl}&menu`;
    await page.goto(menuUrl, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await settle(page, '[role="menubar"]');
    menuCaptures.push(await capture(page, menuOutput, `closed-${name}.png`, menuUrl, { viewport, scheme, material, state: "closed", errors: [...errors] }, '[role="menubar"]'));
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
    await settle(page, '[role="menu"]');
    menuCaptures.push(await capture(page, menuOutput, `open-${name}.png`, menuUrl, { viewport, scheme, material, state: "edit-open", errors: [...errors] }, '[role="menu"]'));
    await page.keyboard.press("Escape");
    await context.close();
    process.stdout.write(`${name}: before, after, menu closed/open captured\n`);
  }
} finally { await browser.close(); }
const finalHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, await hash(resolve(framework, file))])));
const receipt = { ...provenance, finalSourceHashes: finalHashes, sourceStableDuringCapture: JSON.stringify(finalHashes) === JSON.stringify(provenance.after.sourceHashes), captures: titlebarCaptures };
await writeFile(resolve(output, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
await writeFile(resolve(menuOutput, "receipt.json"), `${JSON.stringify({ ...receipt, comparisonLimit: "Current-source NSEMenuBar semantic fixture, not the production runtime-owned application menu or compact-collapse acceptance. Menu admission is recorded without executing app commands; Redo is intentionally disabled.", captures: menuCaptures }, null, 2)}\n`);
if (titlebarCaptures.some(entry => entry.errors.length) || menuCaptures.some(entry => entry.errors.length)) throw new Error("Some captures recorded browser errors; inspect receipts.");
