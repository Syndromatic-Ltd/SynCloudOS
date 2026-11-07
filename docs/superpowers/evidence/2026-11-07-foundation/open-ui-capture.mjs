/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";
import { chromium } from "playwright";

const framework = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const site = path.resolve(framework, "../site");
const dpr = Number(process.argv.find(arg => arg.startsWith("--dpr="))?.slice(6) ?? 1);
const outputTag = process.argv.find(arg => arg.startsWith("--output-tag="))?.slice(13);
if (outputTag && !/^[a-z0-9-]+$/u.test(outputTag)) throw new TypeError("Invalid evidence output tag.");
const output = path.join(framework, "docs/superpowers/evidence/2026-11-07-open-panel-ui", ...(dpr === 1 ? [] : [`dpr-${dpr}`]), ...(outputTag ? [outputTag] : []));
await mkdir(output, { recursive: true });
const receipt = JSON.parse(await readFile(path.join(site, "vendor/framework-receipt.json"), "utf8"));
const pictures = await Promise.all(["core-glow.png", "galaxy-supernova.png", "star-nebula.png"].map(async name => ({
  name, base64: (await sharp(await readFile(path.join(framework, "public/assets/chronosphere/vortex", name))).resize(480, 320, { fit: "inside" }).png().toBuffer()).toString("base64"),
})));
const browser = await chromium.launch({ headless: true });
const results = [];
const settle = async page => { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(550); };
const navigate = async (page, name) => {
  await page.getByRole("searchbox", { name: "Search NSE controls" }).fill(name); await settle(page);
  const compactResults = page.getByRole("tree", { name: "Search results", exact: true });
  const results = await compactResults.isVisible() ? compactResults : page.getByRole("tree", { name: "NSE control sections", exact: true });
  await results.focus(); await results.press("Home"); await results.press("ArrowRight"); await results.press("End"); await results.press("Enter");
  await settle(page);
};
async function capture(page, name, selector = ".nse-open-panel") {
  await settle(page); await page.screenshot({ path: path.join(output, `${name}.png`), scale: "css" });
  return page.locator(selector).evaluate(element => {
    const surface = element.closest("[role=dialog]") ?? element;
    const rect = node => node?.getBoundingClientRect().toJSON();
    const style = getComputedStyle(surface);
    const pseudo = getComputedStyle(surface, "::after");
    const backdrop = surface.parentElement?.querySelector(".nse-overlay-popup-backdrop");
    return { surface: rect(surface), panel: rect(element), viewport: { width: innerWidth, height: innerHeight }, dpr: devicePixelRatio,
      presentation: surface.getAttribute("data-nse-presentation"), shadow: style.filter, plate: pseudo.backgroundImage,
      dimming: backdrop ? getComputedStyle(backdrop).backgroundColor : null,
      buttons: [...element.querySelectorAll("button")].map(button => ({ title: button.getAttribute("aria-label") ?? button.textContent,
        size: button.getAttribute("data-size"), bezel: button.getAttribute("data-bezel-style"), bounds: rect(button) })),
      thumbnails: [...element.querySelectorAll('[data-thumbnail-ready="true"] img')].map(image => ({ src: image.src, width: image.naturalWidth, height: image.naturalHeight })),
      images: [...element.querySelectorAll(".nse-open-source-icon img, .nse-open-workspace-icon img")].map(image => ({ loaded: image.complete && image.naturalWidth > 0, width: image.naturalWidth })),
    };
  });
}
try {
  for (const compact of [false, true]) for (const colourScheme of ["light", "dark"]) {
    const name = `${compact ? "phone" : "desktop"}-${colourScheme}`;
    const caseArg = process.argv.find(arg => arg.startsWith("--case="))?.slice(7);
    if (caseArg && caseArg !== name) continue;
    const resizedPhone = compact && process.argv.includes("--resize-phone");
    const context = await browser.newContext({ viewport: compact && !resizedPhone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, colorScheme: colourScheme, reducedMotion: "reduce", deviceScaleFactor: dpr });
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    const errors = []; const consoleErrors = []; page.on("pageerror", error => errors.push(String(error)));
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          await page.goto("http://127.0.0.1:5199/__dev/login?to=%2F__syncloudos%2Fnse-gallery");
          await page.getByRole("searchbox", { name: "Search NSE controls" }).waitFor();
          break;
        }
        catch (error) { if (attempt >= 2 || !/ERR_CONNECTION_(REFUSED|RESET)|Timeout/u.test(String(error))) throw error; console.log(`${name}: local preview retry ${attempt + 1}`); await page.waitForTimeout(1000); }
      }
      if (process.argv.includes("--buttons-only")) {
        await navigate(page, "Buttons");
        await page.getByRole("button", { name: "New draft", exact: true }).click(); await settle(page);
        await page.screenshot({ path: path.join(output, `${name}-gallery-buttons.png`), scale: "css" });
        const buttons = await page.locator('.nse-control-button').evaluateAll(elements => elements.filter(element => ["New draft", "Save"].includes(element.textContent)).map(element => {
          const style = getComputedStyle(element), face = getComputedStyle(element, "::after");
          return { title: element.textContent, bezel: element.getAttribute("data-bezel-style"), tone: element.getAttribute("data-tone"), size: element.getAttribute("data-size"), height: element.getBoundingClientRect().height, fill: face.backgroundImage, colour: style.color };
        }));
        await writeFile(path.join(output, `${name}-gallery-buttons.json`), JSON.stringify({ receipt: { commit: receipt.commit, archiveSha256: receipt.archiveSha256 }, buttons, errors, consoleErrors }, null, 2));
        continue;
      }
      if (resizedPhone && !process.argv.includes("--menu-only")) { await page.setViewportSize({ width: 390, height: 844 }); await settle(page); }
      if (process.argv.includes("--menu-only")) {
        await navigate(page, "Menus & Popups");
        if (resizedPhone) { await page.setViewportSize({ width: 390, height: 844 }); await settle(page); }
        await page.getByRole("group", { name: "Popup menu sample", exact: true }).getByRole("button", { name: "Sample actions" }).click();
        const selector = `.nse-overlay-popup--menu[data-nse-presentation="${compact ? "sheet" : "anchored"}"]`;
        await page.locator(selector).waitFor();
        const menu = await capture(page, `${name}-menu-sheet`, selector);
        console.log(JSON.stringify({ name, menu, errors }));
        continue;
      }
      await page.evaluate(async ({ pictures }) => {
        const root = await navigator.storage.getDirectory();
        const test = await root.getDirectoryHandle("OpenPanelUI-20261107", { create: true });
        const documents = await test.getDirectoryHandle("Documents", { create: true });
        const photos = await documents.getDirectoryHandle("Photos", { create: true });
        await documents.getDirectoryHandle("Drafts", { create: true });
        for (const picture of pictures) {
          const file = await photos.getFileHandle(picture.name, { create: true }); const stream = await file.createWritable();
          await stream.write(Uint8Array.from(atob(picture.base64), char => char.charCodeAt(0))); await stream.close();
        }
        const downloads = await test.getDirectoryHandle("Downloads", { create: true });
        const music = await test.getDirectoryHandle("Music", { create: true });
        const db = await new Promise((resolve, reject) => { const request = indexedDB.open("SynCloudOS.OpenPanel", 1);
          request.onupgradeneeded = () => request.result.createObjectStore("bookmarks"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
        await new Promise((resolve, reject) => { const transaction = db.transaction("bookmarks", "readwrite");
          transaction.objectStore("bookmarks").put([documents, downloads, music].map(handle => ({ id: handle.name.toLowerCase(), name: handle.name, handle })), "com.syndromatic.nse-control-gallery");
          transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); }); db.close();
      }, { pictures });
      await navigate(page, "Open Panel Media Sources");
      await page.getByRole("button", { name: "Choose a picture", exact: true }).click();
      await page.getByRole("dialog", { name: "Open", exact: true }).waitFor();
      const sources = await capture(page, `${name}-${compact ? "sources" : "sheet"}`);
      assert(sources.images.length >= 6 && sources.images.every(image => image.loaded));
      await page.locator(".nse-open-sources").getByText("Documents", { exact: true }).click();
      await page.locator(".nse-open-collection").getByText("Photos", { exact: true }).waitFor();
      const collection = await capture(page, `${name}-collection`);
      const photos = page.locator(".nse-open-collection").getByText("Photos", { exact: true });
      if (compact) await photos.click(); else await photos.dblclick();
      await page.waitForFunction(() => document.querySelectorAll('.nse-open-item-picture [data-thumbnail-ready="true"]').length === 3);
      await page.locator(".nse-open-collection").getByText("galaxy-supernova.png", { exact: true }).click();
      assert(await page.getByRole("button", { name: "Open", exact: true }).isEnabled());
      const thumbnails = await capture(page, `${name}-thumbnails`);
      await writeFile(path.join(output, `${name}-panel.json`), JSON.stringify({ name, journey: resizedPhone ? "desktop launch then resize to phone" : "cold launch at target viewport", receipt: { commit: receipt.commit, archiveSha256: receipt.archiveSha256 }, sources, collection, thumbnails, errors, consoleErrors }, null, 2));
      console.log(`${name}: panel, sources, collection and three decoded thumbnails captured`);
      assert.equal(thumbnails.thumbnails.length, 3);
      assert(thumbnails.thumbnails.every(image => image.width > 0 && image.height > 0));
      if (compact) { assert(sources.surface.top > 120); assert(sources.surface.height < 700); assert(Math.abs(sources.surface.bottom - 844) < 2); }
      await page.keyboard.press("Escape"); await page.getByRole("dialog", { name: "Open", exact: true }).waitFor({ state: "hidden" });
      await writeFile(path.join(output, `${name}-after-close.json`), JSON.stringify({ url: page.url(), errors, consoleErrors, rootChildren: await page.locator("#root").evaluate(element => element.childElementCount) }, null, 2));
      const menuPage = await context.newPage();
      menuPage.on("pageerror", error => errors.push(String(error)));
      menuPage.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
      await menuPage.goto("http://127.0.0.1:5199/__syncloudos/nse-gallery");
      await menuPage.getByRole("searchbox", { name: "Search NSE controls" }).waitFor();
      await navigate(menuPage, "Menus & Popups");
      if (compact) { await menuPage.setViewportSize({ width: 390, height: 844 }); await settle(menuPage); }
      await menuPage.getByRole("group", { name: "Popup menu sample", exact: true }).getByRole("button", { name: "Sample actions" }).click();
      const menuSelector = `.nse-overlay-popup--menu[data-nse-presentation="${compact ? "sheet" : "anchored"}"]`;
      await menuPage.locator(menuSelector).waitFor();
      const menu = await capture(menuPage, `${name}-menu-sheet`, menuSelector);
      if (compact) {
        assert.equal(sources.dimming, menu.dimming); assert.equal(sources.shadow, menu.shadow); assert.equal(sources.plate, menu.plate);
        await sharp({ create: { width: 780, height: 844, channels: 4, background: "#000" } }).composite([
          { input: path.join(output, `${name}-sources.png`), left: 0, top: 0 }, { input: path.join(output, `${name}-menu-sheet.png`), left: 390, top: 0 },
        ]).png().toFile(path.join(output, `${name}-comparison.png`));
      }
      assert.deepEqual(errors, []);
      results.push({ name, journey: resizedPhone ? "desktop launch then resize to phone" : "cold launch at target viewport", receipt: { commit: receipt.commit, archiveSha256: receipt.archiveSha256 }, sources, collection, thumbnails, menu, errors, consoleErrors });
      await writeFile(path.join(output, "browser-results.json"), JSON.stringify(results, null, 2));
    } catch (error) {
      await page.screenshot({ path: path.join(output, `${name}-failure.png`) });
      await writeFile(path.join(output, `${name}-failure.json`), JSON.stringify({ error: String(error), errors, consoleErrors, url: page.url(), body: await page.locator("body").innerText() }, null, 2)); throw error;
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
console.log(JSON.stringify(results.map(({ name, sources, thumbnails, errors }) => ({ name, bounds: sources.surface, thumbnails: thumbnails.thumbnails.length, errors })), null, 2));
