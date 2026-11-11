import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "playwright";

const evidenceRoot = path.dirname(fileURLToPath(import.meta.url));
const outputArg = process.argv.find(argument => argument.startsWith("--output="))?.slice(9);
const output = outputArg ? path.resolve(evidenceRoot, outputArg) : evidenceRoot;
const dpr = Number(process.argv.find(argument => argument.startsWith("--dpr="))?.slice(6) ?? 1);
const caseName = process.argv.slice(2).find(argument => !argument.startsWith("--"));
const site = path.resolve(evidenceRoot, "../../../../../site");
const base = "http://127.0.0.1:5199";
const bundle = "com.syndromatic.nse-control-gallery";
const receipt = JSON.parse(await readFile(path.join(site, "vendor/framework-receipt.json"), "utf8"));
const results = [];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVhcAAAAASUVORK5CYII=", "base64");
let failurePage, failureErrors, failureName;

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400); // source-list expansion and the shared sheet transition
}
async function navigate(page, title) {
  await page.getByRole("searchbox", { name: "Search NSE controls" }).fill(title);
  await page.getByText(title, { exact: true }).filter({ visible: true }).first().click();
}
async function open(page) {
  await page.getByRole("button", { name: "Choose a picture", exact: true }).click();
  await page.getByRole("dialog", { name: "Open", exact: true }).waitFor();
  await settle(page);
}
async function seed(page) {
  return page.evaluate(async bundle => {
    const root = await navigator.storage.getDirectory();
    const test = await root.getDirectoryHandle("OpenPanelVerification-20261107", { create: true });
    const projects = await test.getDirectoryHandle("Projects", { create: true });
    const coast = await projects.getDirectoryHandle("Coastline", { create: true });
    const footage = await coast.getDirectoryHandle("Footage", { create: true });
    await footage.getDirectoryHandle("Drone", { create: true });
    await footage.getDirectoryHandle("B-Roll", { create: true });
    for (const name of ["harbour-01.png", "sunset-02.png", "cliffs-03.jpg", "tide.jpg", "shot-list.txt", "voiceover.wav"]) {
      const handle = await footage.getFileHandle(name, { create: true });
      const writable = await handle.createWritable(); await writable.write("Open panel verification"); await writable.close();
    }
    const locked = await test.getDirectoryHandle("Footage Drive", { create: true });
    const added = await test.getDirectoryHandle("Added Folder", { create: true });
    const applications = await root.getDirectoryHandle("SynCloudOS-Application-Support", { create: true });
    const support = await applications.getDirectoryHandle(encodeURIComponent(bundle), { create: true });
    await support.getDirectoryHandle("Scratch Disk", { create: true });
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("SynCloudOS.OpenPanel", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("bookmarks");
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("bookmarks", "readwrite");
      transaction.objectStore("bookmarks").put([
        { id: "verification-projects", name: "Projects", handle: projects },
        { id: "verification-locked", name: "Footage Drive", handle: locked },
      ], bundle);
      transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error);
    }); db.close();
    const query = FileSystemHandle.prototype.queryPermission;
    const request = FileSystemHandle.prototype.requestPermission;
    let renewed = false; window.__openPanelRenewals = 0;
    FileSystemHandle.prototype.queryPermission = function (options) {
      return this.name === "Footage Drive" && !renewed ? Promise.resolve("prompt") : query.call(this, options);
    };
    FileSystemHandle.prototype.requestPermission = function (options) {
      if (this.name === "Footage Drive") { window.__openPanelRenewals++; renewed = true; return Promise.resolve("granted"); }
      return request.call(this, options);
    };
    window.showDirectoryPicker = async () => added;
    return { root: projects.name, permission: await projects.queryPermission({ mode: "read" }) };
  }, bundle);
}
async function source(page, name) {
  const back = page.getByRole("button", { name: "Sources", exact: true });
  if (await back.isVisible()) await back.click();
  await page.locator(".nse-open-sources").getByText(name, { exact: true }).click();
}
async function capture(page, name) {
  await settle(page);
  await page.screenshot({ path: path.join(output, `${name}.png`), scale: "css" });
  return page.locator(".nse-open-panel").evaluate(element => {
    const sheet = element.closest("[role=dialog]");
    const rect = node => node?.getBoundingClientRect().toJSON();
    const viewport = { width: innerWidth, height: innerHeight };
    const controls = [...element.querySelectorAll("button")].filter(node => node.getClientRects().length).map(node => ({ name: node.textContent, bounds: rect(node) }));
    return { viewport, dpr: devicePixelRatio, panel: rect(sheet), sidebar: rect(element.querySelector(".nse-open-sources")), toolbar: rect(element.querySelector(".nse-open-toolbar")),
      footer: rect(element.querySelector(".nse-open-footer")), controls,
      cells: [...element.querySelectorAll(".nse-collection-item")].map(node => ({ name: node.textContent, bounds: rect(node) })),
      mode: sheet?.getAttribute("data-nse-colour-scheme-resolved"), compact: element.hasAttribute("data-compact"),
      outsideViewport: controls.filter(({ bounds: b }) => b.left < -1 || b.top < -1 || b.right > viewport.width + 1 || b.bottom > viewport.height + 1),
    };
  });
}

try {
  for (const phone of [false, true]) for (const scheme of ["light", "dark"]) {
    const name = `${phone ? "phone" : "desktop"}-${scheme}`;
    if (caseName && caseName !== name) continue;
    const context = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, colorScheme: scheme, reducedMotion: "reduce", deviceScaleFactor: dpr });
    const page = await context.newPage(); page.setDefaultTimeout(25000);
    const errors = []; page.on("pageerror", error => errors.push(String(error)));
    failurePage = page; failureErrors = errors; failureName = name;
    await page.goto(`${base}/__dev/login?to=%2F__syncloudos%2Fnse-gallery`, { waitUntil: "domcontentloaded" });
    await page.getByRole("searchbox", { name: "Search NSE controls" }).waitFor();
    const seeded = await seed(page);
    await navigate(page, "Open Panel Media Sources");
    await open(page);
    assert.equal(await page.getByRole("img", { name: "Needs permission" }).count(), 1);
    const sources = await capture(page, `${name}-sources`);
    assert.equal(sources.compact, phone);
    await source(page, "Projects");
    const into = async label => { const item = page.locator(".nse-open-collection").getByText(label, { exact: true }); if (phone) await item.click(); else await item.dblclick(); };
    await into("Coastline"); await into("Footage");
    await page.locator(".nse-open-collection").getByText("harbour-01.png", { exact: true }).click();
    assert.equal(await page.locator(".nse-open-collection").getByText("shot-list.txt", { exact: true }).count(), 0);
    const folders = await capture(page, `${name}-folders`);
    await page.getByRole("searchbox", { name: "Search Footage" }).fill("harbour");
    await page.waitForFunction(() => document.querySelectorAll(".nse-open-item").length === 1);
    await page.getByRole("searchbox", { name: "Search Footage" }).fill("");
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.locator(".nse-open-collection").getByText("Footage", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Forward", exact: true }).click();
    await page.locator(".nse-open-collection").getByText("harbour-01.png", { exact: true }).waitFor();
    await source(page, "Gallery Pictures");
    await page.locator(".nse-open-item").first().waitFor();
    await page.locator(".nse-collection-item").nth(1).click();
    const media = await capture(page, `${name}-media`);
    assert.deepEqual(media.outsideViewport, []);
    assert.equal(media.mode, scheme);
    if (phone) assert.equal(new Set(media.cells.slice(0, 3).map(cell => Math.round(cell.bounds.top))).size, 1);
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await page.getByRole("dialog", { name: "Open", exact: true }).waitFor({ state: "hidden" });
    assert.match(await page.locator("body").innerText(), /Selected: Cloud workspace/);
    await open(page);
    await source(page, "Footage Drive");
    assert.equal(await page.evaluate(() => window.__openPanelRenewals), 1);
    await source(page, "Add Folder…");
    await page.locator(".nse-open-path").getByText("Added Folder", { exact: true }).waitFor();
    await source(page, "Application Support");
    await page.locator(".nse-open-collection").getByText("Scratch Disk", { exact: true }).waitFor();
    const storage = await capture(page, `${name}-storage`);
    if (phone) await page.getByRole("button", { name: "Sources", exact: true }).click();
    const chooserEvent = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "System Chooser…", exact: true }).click();
    const chooser = await chooserEvent;
    await chooser.setFiles({ name: "outside.png", mimeType: "image/png", buffer: png });
    await page.getByRole("dialog", { name: "Open", exact: true }).waitFor({ state: "hidden" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("searchbox", { name: "Search NSE controls" }).waitFor();
    await navigate(page, "Open Panel Media Sources");
    await open(page);
    if (phone && await page.getByRole("button", { name: "Sources", exact: true }).isVisible()) await page.getByRole("button", { name: "Sources", exact: true }).click();
    await page.locator(".nse-open-sources").getByText("Added Folder", { exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: "Open", exact: true }).waitFor({ state: "hidden" });
    if (!process.argv.includes("--visual-only")) await page.waitForFunction(() => document.activeElement?.textContent === "Choose a picture", undefined, { timeout: 3000 });
    const focusRestored = await page.getByRole("button", { name: "Choose a picture", exact: true }).evaluate(element => element === element.ownerDocument.activeElement);
    if (!process.argv.includes("--visual-only")) assert.equal(focusRestored, true);
    assert.deepEqual(errors, []);
    results.push({ name, receipt: { commit: receipt.commit, archiveSha256: receipt.archiveSha256 }, seeded, sources, folders, media, storage, bookmarkRestoredAfterReload: true, focusRestored, errors });
    await context.close();
    await writeFile(path.join(output, "browser-results.json"), JSON.stringify(results, null, 2));
  }
} catch (error) {
  if (failurePage && !failurePage.isClosed()) {
    await failurePage.screenshot({ path: path.join(output, `${failureName}-failure.png`) });
    await writeFile(path.join(output, `${failureName}-failure.json`), JSON.stringify({ receipt: { commit: receipt.commit }, error: String(error), errors: failureErrors, body: await failurePage.locator("body").innerText() }, null, 2));
  }
  throw error;
} finally { await browser.close(); }
console.log(JSON.stringify(results.map(({ name, media, focusRestored, errors }) => ({ name, panel: media.panel, compact: media.compact, mode: media.mode, focusRestored, errors })), null, 2));
