import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const output = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(output, "../../../../../site");
const receipt = JSON.parse(await readFile(path.join(site, "vendor/framework-receipt.json"), "utf8"));
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const capabilities of ["no-folders", "no-storage", "media-only"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    await context.addInitScript(capabilities => {
      if (capabilities !== "no-storage") Object.defineProperty(window, "showDirectoryPicker", { value: undefined, configurable: true });
      if (capabilities !== "no-folders") Object.defineProperty(navigator.storage, "getDirectory", { value: undefined, configurable: true });
    }, capabilities);
    const page = await context.newPage();
    const errors = []; page.on("pageerror", error => errors.push(String(error)));
    await page.goto("http://127.0.0.1:5199/__dev/login?to=%2F__syncloudos%2Fnse-gallery");
    const search = page.getByRole("searchbox", { name: "Search NSE controls" });
    await search.fill("Open Panel Media Sources");
    await page.locator(".gallery-sidebar-list").getByText("Open Panel Media Sources", { exact: true }).click();
    await page.getByRole("button", { name: "Choose a picture", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Open", exact: true });
    await dialog.waitFor();
    const sources = dialog.locator(".nse-open-sources");
    await expectCount(sources.getByText("Folders", { exact: true }), capabilities === "no-storage" ? 1 : 0);
    await expectCount(sources.getByText("App Storage", { exact: true }), capabilities === "no-folders" ? 1 : 0);
    await expectCount(sources.getByText("Gallery Pictures", { exact: true }), 1);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    let nativeFallback = false;
    if (capabilities === "media-only") {
      await page.reload({ waitUntil: "domcontentloaded" });
      await search.fill("Windows & Dialogs");
      await page.getByText("Windows & Dialogs", { exact: true }).filter({ visible: true }).first().click();
      const chooserEvent = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "Open text file…", exact: true }).click();
      const chooser = await chooserEvent;
      assert.equal(await page.locator(".nse-open-panel").count(), 0);
      await chooser.setFiles({ name: "fallback.txt", mimeType: "text/plain", buffer: Buffer.from("Native fallback") });
      await page.getByText("fallback.txt", { exact: true }).waitFor();
      nativeFallback = true;
    }
    assert.deepEqual(errors, []);
    results.push({ capabilities, sourcesHiddenCorrectly: true, mediaAvailable: true, nativeFallback, errors });
    await context.close();
  }
} finally { await browser.close(); }
async function expectCount(locator, count) { assert.equal(await locator.count(), count); }
await writeFile(path.join(output, "capability-fallbacks.json"), JSON.stringify({ commit: receipt.commit, archiveSha256: receipt.archiveSha256, results }, null, 2));
console.log(JSON.stringify(results, null, 2));
