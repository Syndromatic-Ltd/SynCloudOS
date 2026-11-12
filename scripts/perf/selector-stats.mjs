/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
/**
 * Lists the selectors that cost most when every element in the NSE gallery is re-matched.
 *
 *   node scripts/perf/selector-stats.mjs --base http://127.0.0.1:5387 --json selector-stats.json
 *
 * Uses Blink's selector statistics (the DevTools "Selector stats" data), which slow matching down
 * themselves: read the ranking and the shares, not the absolute times.
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const option = (name, fallback) => { const at = args.indexOf(`--${name}`); return at < 0 ? fallback : args[at + 1]; };
const base = option("base", "http://127.0.0.1:5387");
const out = option("json", null);
const route = option("route", "/__syncloudos/nse-gallery");
const top = Number(option("top", "30"));

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await page.goto(`${base}/`, { waitUntil: "load" });
await page.getByRole("button", { name: /Sign in locally/u }).click();
await page.getByRole("button", { name: "Open About" }).first().waitFor({ timeout: 30_000 });
await page.goto(`${base}${route}`, { waitUntil: "load" });
await page.waitForTimeout(9000);

const events = [];
cdp.on("Tracing.dataCollected", chunk => { for (const event of chunk.value) events.push(event); });
await cdp.send("Tracing.start", { transferMode: "ReportEvents", traceConfig: { includedCategories: ["devtools.timeline", "disabled-by-default-blink.debug"] } });
// One full re-match, forced through a rule that depends on the root.
await page.evaluate(() => {
  const style = document.createElement("style");
  style.textContent = "[data-perf-probe] * { --perf-probe: 1 }";
  document.head.append(style);
  getComputedStyle(document.body).color;
  document.documentElement.toggleAttribute("data-perf-probe");
  getComputedStyle(document.body).color;
  style.remove();
  document.documentElement.removeAttribute("data-perf-probe");
});
const complete = new Promise(resolve => cdp.once("Tracing.tracingComplete", resolve));
await cdp.send("Tracing.end");
await complete;
const elements = await page.evaluate(() => document.querySelectorAll("*").length);
await browser.close();

const bySelector = new Map();
for (const event of events) {
  if (event.name !== "SelectorStats") continue;
  for (const timing of event.args?.selector_stats?.selector_timings ?? []) {
    const entry = bySelector.get(timing.selector) ?? { selector: timing.selector, elapsedMs: 0, attempts: 0, fastRejects: 0, matches: 0, rules: 0 };
    entry.elapsedMs += (timing["elapsed (us)"] ?? 0) / 1000;
    entry.attempts += timing.match_attempts ?? 0;
    entry.fastRejects += timing.fast_reject_count ?? 0;
    entry.matches += timing.match_count ?? 0;
    entry.rules += 1;
    bySelector.set(timing.selector, entry);
  }
}
const all = [...bySelector.values()];
const sum = key => all.reduce((total, entry) => total + entry[key], 0);
const round = value => Math.round(value * 100) / 100;
const rank = key => [...all].sort((a, b) => b[key] - a[key]).slice(0, top).map(entry => ({ ...entry, elapsedMs: round(entry.elapsedMs) }));
const report = {
  base, route, elements, recordedAt: new Date().toISOString(),
  totals: { selectors: all.length, elapsedMs: round(sum("elapsedMs")), attempts: sum("attempts"), fastRejects: sum("fastRejects"), matches: sum("matches") },
  byElapsed: rank("elapsedMs"), byAttempts: rank("attempts"),
};
const everything = option("all", null);
if (everything) writeFileSync(everything, JSON.stringify(all));
if (out) writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.totals));
for (const entry of report.byElapsed) console.log(`${String(entry.elapsedMs).padStart(8)} ms ${String(entry.attempts).padStart(7)} tries ${String(entry.matches).padStart(6)} hit  ${entry.selector.slice(0, 170)}`);
