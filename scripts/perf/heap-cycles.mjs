/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
/**
 * Measures JS heap growth and detached DOM nodes across repeated About launch/quit cycles.
 *
 *   node scripts/perf/heap-cycles.mjs --base http://127.0.0.1:5387 [--cycles 10] [--json heap.json]
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const option = (name, fallback) => { const at = args.indexOf(`--${name}`); return at < 0 ? fallback : args[at + 1]; };
const base = option("base", "http://127.0.0.1:5387");
const cycles = Number(option("cycles", "10"));
const jsonPath = option("json", null);

const toMB = bytes => Math.round((bytes / (1024 * 1024)) * 100) / 100;

async function sampleHeap(page, cdp) {
  await cdp.send("HeapProfiler.collectGarbage");
  await page.waitForTimeout(100);
  await cdp.send("HeapProfiler.collectGarbage");
  const { metrics } = await cdp.send("Performance.getMetrics");
  const metric = name => metrics.find(entry => entry.name === name)?.value ?? 0;
  // Counters only: asking the DOM agent for detached nodes pins every tree it reports, which the next sample then counts.
  const jsHeapUsedSize = metric("JSHeapUsedSize");
  return { jsHeapUsedSize, jsHeapUsedMB: toMB(jsHeapUsedSize), domNodes: metric("Nodes"), eventListeners: metric("JSEventListeners") };
}

async function runCycle(page) {
  await page.getByRole("button", { name: "Open About" }).first().click();
  const returnButton = page.getByRole("button", { name: "Return to Webspring" }).first();
  await returnButton.waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  await returnButton.click();

  const quitButton = page.getByRole("button", { name: "Quit" }).first();
  try {
    await quitButton.waitFor({ state: "visible", timeout: 2500 });
    await quitButton.click();
  } catch {
    // Returning without open windows closes directly without a confirmation sheet.
  }
  await page.getByRole("button", { name: "Open About" }).first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(1000);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("HeapProfiler.enable");
await cdp.send("Performance.enable");

await page.goto(`${base}/`, { waitUntil: "load" });
const signInButton = page.getByRole("button", { name: /Sign in locally/u });
await signInButton.waitFor({ timeout: 30_000 });
await signInButton.click();
await page.getByRole("button", { name: "Open About" }).first().waitFor({ timeout: 30_000 });
await page.waitForTimeout(2000);

const samples = [];
for (let cycle = 1; cycle <= cycles; cycle++) {
  await runCycle(page);
  if (cycle === 1 || cycle === cycles) {
    const snapshot = { cycle, ...await sampleHeap(page, cdp) };
    samples.push(snapshot);
    console.log(JSON.stringify(snapshot));
  }
}

await browser.close();

const first = samples[0];
const last = samples[samples.length - 1];
const summary = {
  base,
  cycles,
  recordedAt: new Date().toISOString(),
  cycle1: first,
  cycleLast: last,
  delta: {
    jsHeapUsedBytes: last.jsHeapUsedSize - first.jsHeapUsedSize,
    jsHeapUsedMB: toMB(last.jsHeapUsedSize - first.jsHeapUsedSize),
    domNodes: last.domNodes - first.domNodes,
    eventListeners: first.eventListeners !== null && last.eventListeners !== null ? last.eventListeners - first.eventListeners : null,
  },
};

console.log(JSON.stringify({ delta: summary.delta }));
if (jsonPath) writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
