import { chromium } from "playwright";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const destination = resolve(process.argv[2] ?? "docs/superpowers/evidence/2026-11-14-window-management/phase-7/split-layout");
await mkdir(destination, { recursive: true });
const records = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const variant of ["before", "after"]) for (const size of ["desktop", "phone"]) for (const scheme of ["light", "dark"]) for (const material of ["cumulus", "metal"]) {
    const viewport = size === "desktop" ? { width: 1200, height: 800 } : { width: 390, height: 844 };
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "no-preference" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(String(error)));
    const prefix = `${variant}-${size}-${scheme}-${material}`;
    await page.goto(`http://127.0.0.1:${variant === "before" ? 5420 : 5419}/?scheme=${scheme}&material=${material}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.locator(".study-content [data-pane-id]").first().waitFor();
    await page.waitForFunction(() => Boolean(window.splitLayoutStudy));
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    const snapshot = () => page.evaluate(() => {
      const controller = window.splitLayoutStudy.controller;
      return { presentation: controller.snapshot.presentation, items: controller.snapshot.items,
        lifetime: { ...window.splitLayoutStudy.lifetime }, focused: document.activeElement?.closest("[data-pane-id]")?.getAttribute("data-pane-id"),
        overflow: document.documentElement.scrollWidth > innerWidth,
        panes: [...document.querySelectorAll("[data-pane-id]")].map(pane => ({ id: pane.dataset.paneId, width: pane.getBoundingClientRect().width, height: pane.getBoundingClientRect().height, inert: pane.inert, hidden: pane.getAttribute("aria-hidden") })),
        seams: [...document.querySelectorAll('[data-nse-part="split-divider"]')].map(seam => ({ background: getComputedStyle(seam, "::before").backgroundColor, shadow: getComputedStyle(seam, "::before").boxShadow })) };
    });
    const expanded = await snapshot();
    await page.screenshot({ path: resolve(destination, `${prefix}-expanded.png`) });
    if (expanded.overflow) throw new Error(`${prefix}: horizontal document overflow`);
    if (size === "desktop") {
      if (expanded.panes.length !== 3) throw new Error(`${prefix}: expected three desktop panes`);
      await page.getByRole("textbox", { name: "Inspector note" }).fill("Retained after collapse");
      await page.evaluate(() => {
        const records = [];
        window.splitLayoutSamples = records;
        const start = performance.now();
        const sample = () => {
          const pane = document.querySelector('[data-pane-id="inspector"]');
          records.push({ time: performance.now() - start, width: pane?.getBoundingClientRect().width ?? 0, inert: pane?.inert ?? true });
          if (performance.now() - start < 350) requestAnimationFrame(sample);
        };
        window.splitLayoutStudy.controller.toggleInspector();
        requestAnimationFrame(sample);
      });
      await page.waitForFunction(() => !document.querySelector('[data-pane-id="inspector"]'));
      await page.waitForFunction(() => window.splitLayoutSamples.at(-1)?.time >= 350);
      await page.screenshot({ path: resolve(destination, `${prefix}-collapsed.png`) });
      const samples = await page.evaluate(() => window.splitLayoutSamples);
      if (variant === "after" && !samples.some(sample => sample.width > 0 && sample.width < expanded.panes[2].width)) throw new Error(`${prefix}: no intermediate width frame`);
      if (variant === "after" && samples.some(sample => sample.width > 0 && !sample.inert)) throw new Error(`${prefix}: collapsing inspector remained interactive`);
      await page.getByRole("button", { name: "Toggle inspector" }).click();
      await page.waitForFunction(() => !document.querySelector('[data-split-animating="true"]'));
      if (await page.getByRole("textbox", { name: "Inspector note" }).inputValue() !== "Retained after collapse") throw new Error(`${prefix}: inspector draft lost`);
      records.push({ prefix, expanded, restored: await snapshot(), samples, errors });
    } else {
      await page.getByRole("button", { name: "Open document" }).click();
      await page.getByRole("textbox", { name: "Document text" }).waitFor();
      await page.screenshot({ path: resolve(destination, `${prefix}-document.png`) });
      await page.getByRole("button", { name: "Toggle inspector" }).click();
      await page.getByRole("textbox", { name: "Inspector note" }).waitFor();
      await page.screenshot({ path: resolve(destination, `${prefix}-inspector.png`) });
      records.push({ prefix, expanded, compact: await snapshot(), errors });
    }
    if (errors.length) throw new Error(`${prefix}: ${errors.join("; ")}`);
    await context.close();
  }
  const paths = ["src/NSE/DataViews/Split/splitViewControllerView.tsx", "src/NSE/DataViews/Split/splitViewController.css"];
  const sources = await Promise.all(paths.map(async path => ({ path, currentSha256: createHash("sha256").update(await readFile(path)).digest("hex"),
    baselineSha256: createHash("sha256").update(execFileSync("git", ["show", `170b71c6:${path}`])).digest("hex") })));
  await writeFile(resolve(destination, "receipt.json"), JSON.stringify({ baseline: "170b71c6", scope: "Only the split renderer and its local stylesheet are substituted for before captures; all other current framework sources and the fixture are shared.", viewportDpr: 1, sources, records }, null, 2));
  console.log(JSON.stringify({ destination, cases: records.length, screenshots: records.length * 2 + 8, pageErrors: records.flatMap(record => record.errors) }));
} finally { await browser.close(); }
