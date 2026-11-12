/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
/**
 * Traces style recalculation on a running SynCloudOS site.
 *
 *   node scripts/perf/style-recalc.mjs --base http://127.0.0.1:5387 [--runs 5] [--json out.json]
 *
 * Each scenario prints one JSON line holding the median of its runs. "styleMs" sums Chromium's
 * UpdateLayoutTree events; "fullRecalcMs" forces every element to re-match its rules.
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const option = (name, fallback) => { const at = args.indexOf(`--${name}`); return at < 0 ? fallback : args[at + 1]; };
const base = option("base", "http://127.0.0.1:5387");
const runs = Number(option("runs", "5"));
const jsonPath = option("json", null);
const galleryRoute = "/__syncloudos/nse-gallery";
const gallerySections = ["Tables & Trees", "Buttons", "Menus & Popups"];

const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const round = value => Math.round(value * 10) / 10;

async function session(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));

  /** Runs `action`, waits for the page to settle, and returns the trace's totals. */
  async function traced(action, settleMs = 3000) {
    const events = [];
    const collect = chunk => { for (const event of chunk.value) events.push(event); };
    cdp.on("Tracing.dataCollected", collect);
    await cdp.send("Tracing.start", { transferMode: "ReportEvents", traceConfig: { includedCategories: ["devtools.timeline", "toplevel", "blink.user_timing"] } });
    await action();
    await page.waitForTimeout(settleMs);
    const complete = new Promise(resolve => cdp.once("Tracing.tracingComplete", resolve));
    await cdp.send("Tracing.end");
    await complete;
    cdp.off("Tracing.dataCollected", collect);
    const named = name => events.filter(event => event.name === name && event.ph === "X");
    const total = name => named(name).reduce((sum, event) => sum + event.dur / 1000, 0);
    const longest = list => list.reduce((most, event) => Math.max(most, event.dur / 1000), 0);
    // Only the renderer's main thread runs style; it is the thread that recorded UpdateLayoutTree.
    const mainThread = named("UpdateLayoutTree")[0]?.tid;
    const tasks = events.filter(event => event.ph === "X" && event.tid === mainThread && (event.name === "RunTask" || event.name === "ThreadControllerImpl::RunTask"));
    return {
      styleMs: total("UpdateLayoutTree"), styleCount: named("UpdateLayoutTree").length, maxStyleMs: longest(named("UpdateLayoutTree")),
      parseCssMs: total("ParseAuthorStyleSheet"), layoutMs: total("Layout"), scriptMs: total("FunctionCall") + total("EvaluateScript"),
      longestTaskMs: longest(tasks), tasksOver50: tasks.filter(event => event.dur > 50_000).length,
      elements: await page.evaluate(() => document.querySelectorAll("*").length),
    };
  }

  /** Median time to re-match every element, forced through a rule that depends on the root. */
  const fullRecalc = () => page.evaluate(() => {
    const style = document.createElement("style");
    style.textContent = "[data-perf-probe] * { --perf-probe: 1 }";
    document.head.append(style);
    getComputedStyle(document.body).color;
    const samples = [];
    for (let index = 0; index < 9; index++) {
      document.documentElement.toggleAttribute("data-perf-probe");
      const start = performance.now();
      getComputedStyle(document.body).color;
      void document.body.offsetWidth;
      samples.push(performance.now() - start);
    }
    style.remove();
    document.documentElement.removeAttribute("data-perf-probe");
    return samples.sort((a, b) => a - b)[4];
  });

  /** The site's own local test sign-in; nothing is typed. */
  async function signIn() {
    await page.goto(`${base}/`, { waitUntil: "load" });
    const button = page.getByRole("button", { name: /Sign in locally/u });
    await button.waitFor({ timeout: 30_000 });
    await button.click();
    await page.getByRole("button", { name: "Open About" }).first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(2000);
  }
  return { page, context, traced, fullRecalc, signIn, errors };
}

/** One pass over every scenario, in a fresh browser context so each load is cold. */
async function pass(browser) {
  const results = {};
  const { page, context, traced, fullRecalc, signIn, errors } = await session(browser);
  results["cold-load-board"] = await traced(() => page.goto(`${base}/`, { waitUntil: "load" }), 5000);
  await signIn();
  results["launch-about"] = await traced(() => page.getByRole("button", { name: "Open About" }).first().click(), 4000);
  results["about-full-recalc"] = { fullRecalcMs: await fullRecalc(), elements: await page.evaluate(() => document.querySelectorAll("*").length) };
  const quickSwitch = page.getByRole("button", { name: "Open QuickSwitch" }).first();
  if (await quickSwitch.count()) {
    results["quickswitch-open"] = await traced(() => quickSwitch.click(), 2500);
    const option = page.getByRole("dialog", { name: "QuickSwitch" }).getByRole("option").first();
    if (await option.count()) results["quickswitch-select"] = await traced(() => option.click(), 4000);
  }
  const home = page.getByRole("button", { name: "Return to Webspring" }).first();
  if (await home.count() && await home.isVisible()) results["return-to-webspring"] = await traced(() => home.click(), 3000);
  results["cold-load-gallery"] = await traced(() => page.goto(`${base}${galleryRoute}`, { waitUntil: "load" }), 9000);
  results["gallery-full-recalc"] = { fullRecalcMs: await fullRecalc(), elements: await page.evaluate(() => document.querySelectorAll("*").length) };
  results["gallery-hover-sweep"] = await traced(async () => {
    for (let step = 0; step <= 40; step++) await page.mouse.move(20 + step * 34, 26 + (step % 2) * 8);
    for (let step = 0; step <= 40; step++) await page.mouse.move(120, 80 + step * 18);
    await page.mouse.move(0, 0);
  }, 1000);
  for (const section of gallerySections) {
    results[`gallery-section:${section}`] = await traced(() => page.getByText(section, { exact: true }).first().click(), 3000);
  }
  if (errors.length) results.pageErrors = errors;
  await context.close();
  return results;
}

const browser = await chromium.launch();
const version = browser.version();
const passes = [];
for (let run = 0; run < runs; run++) passes.push(await pass(browser));
await browser.close();

const summary = { base, runs, chromium: version, recordedAt: new Date().toISOString(), scenarios: {} };
for (const label of Object.keys(passes[0])) {
  if (label === "pageErrors") continue;
  const samples = passes.map(result => result[label]).filter(Boolean);
  const row = {};
  for (const key of Object.keys(samples[0])) row[key] = round(median(samples.map(sample => sample[key])));
  summary.scenarios[label] = row;
  console.log(JSON.stringify({ label, ...row }));
}
const pageErrors = [...new Set(passes.flatMap(result => result.pageErrors ?? []))];
if (pageErrors.length) { summary.pageErrors = pageErrors; console.log(JSON.stringify({ pageErrors })); }
if (jsonPath) writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
