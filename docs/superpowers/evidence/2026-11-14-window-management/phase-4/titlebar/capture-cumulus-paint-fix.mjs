import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const base = dirname(fileURLToPath(import.meta.url)), framework = resolve(base, "../../../../../..");
const titlebarOutput = resolve(base, "cumulus-paint-fix"), menuOutput = resolve(base, "../../phase-5/menu/cumulus-paint-fix");
const cssPath = resolve(framework, "src/NSE/Windows/WindowTitlebarView.css");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const sourceHash = hash(await readFile(cssPath));
const browser = await chromium.launch({ headless: true }), titlebars = [], menus = [];
await mkdir(titlebarOutput, { recursive: true }); await mkdir(menuOutput, { recursive: true });
async function capture(page, output, file, entry) {
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  const row = await page.locator("[data-window-titlebar-row]").boundingBox(), glass = await page.locator(".nse-app-topbar-base").boundingBox();
  const menu = entry.state === "edit-open" ? await page.getByRole("menu").boundingBox() : null;
  const menuItems = entry.state === "edit-open" ? await page.getByRole("menu").getByRole("menuitem").allTextContents() : [];
  if (entry.state === "edit-open" && (!menu || menu.height < 50 || menuItems.length !== 2)) throw new Error(`The menu did not settle in ${file}`);
  if (!row || !glass || Math.abs(glass.y - row.y + 1) > 0.5 || Math.abs(glass.height - row.height - 2) > 0.5) throw new Error(`Glass does not track the row in ${file}`);
  const png = await page.screenshot({ path: resolve(output, file), fullPage: false, animations: "disabled", caret: "hide" });
  return { ...entry, file, url: page.url(), row, glass, menu, menuItems, sha256: hash(png) };
}
try {
  for (const viewport of [{ name: "desktop", width: 1280, height: 850 }, { name: "phone", width: 390, height: 844 }]) for (const scheme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1, colorScheme: scheme, reducedMotion: "reduce" });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const url = `http://127.0.0.1:5418/tests/e2e/fixtures/window-titlebar-layout.html?style=unified&width=${viewport.width - 40}&scheme=${scheme}&cumulus`;
    await page.goto(url, { waitUntil: "networkidle" });
    await page.getByRole("toolbar").waitFor({ state: "visible" });
    titlebars.push(await capture(page, titlebarOutput, `after-${viewport.name}-${scheme}-cumulus.png`, { viewport, scheme, material: "cumulus", state: "after", errors }));
    await page.goto(`${url}&menu`, { waitUntil: "networkidle" });
    await page.getByRole("menubar").waitFor({ state: "visible" });
    menus.push(await capture(page, menuOutput, `closed-${viewport.name}-${scheme}-cumulus.png`, { viewport, scheme, material: "cumulus", state: "closed", errors }));
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
    await page.getByRole("menu").waitFor({ state: "visible" });
    await page.getByRole("menuitem", { name: "Undo", exact: true }).waitFor({ state: "visible" });
    menus.push(await capture(page, menuOutput, `open-${viewport.name}-${scheme}-cumulus.png`, { viewport, scheme, material: "cumulus", state: "edit-open", errors }));
    await context.close();
    process.stdout.write(`${viewport.name}-${scheme}: corrected titlebar and menu captured\n`);
  }
} finally { await browser.close(); }
const receipt = { capturedAt: new Date().toISOString(), root: framework, head: execFileSync("git", ["-C", framework, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), browserVersion: browser.version(), deviceScaleFactor: 1, sourceFile: "src/NSE/Windows/WindowTitlebarView.css", sourceHash, sourceStableDuringCapture: sourceHash === hash(await readFile(cssPath)), issueReceipt: "../receipt.json", change: "Only the attached Cumulus paint geometry: a grid cell anchors glass and shadow to the actual title row after the menu. Palette unchanged." };
await writeFile(resolve(titlebarOutput, "receipt.json"), `${JSON.stringify({ ...receipt, captures: titlebars }, null, 2)}\n`);
await writeFile(resolve(menuOutput, "receipt.json"), `${JSON.stringify({ ...receipt, captures: menus }, null, 2)}\n`);
if ([...titlebars, ...menus].some(entry => entry.errors.length)) throw new Error("Browser errors were recorded.");
