/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
/**
 * Traces style recalculation on a running SynCloudOS site.
 *
 *   node scripts/perf/style-recalc.mjs --base http://127.0.0.1:5387 [--runs 5] [--cpu] [--json out.json]
 *
 * Each scenario prints one JSON line holding the median of its runs. "styleMs" sums Chromium's
 * UpdateLayoutTree events; "fullRecalcMs" forces every element to re-match its rules. Pass --cpu
 * to sample V8 frames and print main-thread tasks over 50 ms with their top self-time function.
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const option = (name, fallback) => { const at = args.indexOf(`--${name}`); return at < 0 ? fallback : args[at + 1]; };
const base = option("base", "http://127.0.0.1:5387");
const runs = Number(option("runs", "5"));
const cpu = args.includes("--cpu");
const jsonPath = option("json", null);
const galleryRoute = "/__syncloudos/nse-gallery";
const gallerySections = ["Tables & Trees", "Buttons", "Menus & Popups"];

const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const round = value => Math.round(value * 10) / 10;

/** Who a profile frame belongs to: the engine, a DOM call, the collector, React, dev tooling, the framework or the site. */
function frameOwner(frame) {
  const url = frame.url ?? "";
  if (!url) {
    if (frame.functionName === "(program)") return "engine";
    if (frame.functionName === "(garbage collector)") return "gc";
    return "dom";
  }
  if (url.includes("/@vite/") || url.includes("@react-refresh")) return "tooling";
  if (/\/\.vite\/deps\/(react|scheduler)/u.test(url)) return "react";
  if (url.includes("@syndromatic/syncloudos")) return "framework";
  return "site";
}

function extractCpuTasks(longTasks, profile) {
  if (!longTasks.length || !profile?.samples?.length) return [];
  const nodeById = new Map((profile.nodes ?? []).map(node => [node.id, node]));
  const parentOf = new Map();
  for (const node of profile.nodes ?? []) for (const child of node.children ?? []) parentOf.set(child, node.id);
  const samples = profile.samples;
  const deltas = profile.timeDeltas ?? [];
  const timedSamples = [];
  let cursorUs = profile.startTime ?? 0;
  for (let index = 0; index < samples.length; index++) {
    cursorUs += deltas[index] ?? 0;
    const durationUs = index + 1 < deltas.length ? deltas[index + 1] : Math.max(0, (profile.endTime ?? cursorUs) - cursorUs);
    timedSamples.push({ ts: cursorUs, dur: durationUs, nodeId: samples[index] });
  }

  return [...longTasks]
    .sort((a, b) => b.dur - a.dur)
    .map(task => {
      const start = task.ts;
      const end = task.ts + task.dur;
      const byFrame = new Map();
      const owners = {};
      const inclusive = new Map();
      for (const sample of timedSamples) {
        if (sample.ts < start || sample.ts > end) continue;
        const frame = nodeById.get(sample.nodeId)?.callFrame;
        if (!frame) continue;
        const functionName = frame.functionName || "(anonymous)";
        if (functionName === "(root)" || functionName === "(idle)") continue;
        const owner = frameOwner(frame);
        owners[owner] = (owners[owner] ?? 0) + sample.dur;
        // Charge the sample once to every framework or site function on its stack.
        const seen = new Set();
        for (let id = sample.nodeId; id !== undefined; id = parentOf.get(id)) {
          const caller = nodeById.get(id)?.callFrame;
          if (!caller?.url) continue;
          const callerOwner = frameOwner(caller);
          if (callerOwner !== "framework" && callerOwner !== "site") continue;
          const callerKey = `${caller.functionName || "(anonymous)"}\t${caller.url}\t${caller.lineNumber + 1}`;
          if (seen.has(callerKey)) continue;
          seen.add(callerKey);
          inclusive.set(callerKey, (inclusive.get(callerKey) ?? 0) + sample.dur);
        }
        const file = frame.url || "(native)";
        const line = typeof frame.lineNumber === "number" && frame.lineNumber >= 0 ? frame.lineNumber + 1 : 0;
        const key = `${functionName}\t${file}\t${line}`;
        const existing = byFrame.get(key) ?? { functionName, file, line, selfUs: 0 };
        existing.selfUs += sample.dur;
        byFrame.set(key, existing);
      }
      const top = [...byFrame.values()].sort((a, b) => b.selfUs - a.selfUs)[0] ?? { functionName: "(no JS sample)", file: "(native)", line: 0, selfUs: 0 };
      const ownerMs = Object.fromEntries(Object.entries(owners).sort((a, b) => b[1] - a[1]).map(([owner, us]) => [owner, round(us / 1000)]));
      const callers = [...inclusive.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([key, us]) => {
        const [functionName, file, line] = key.split("\t");
        return { functionName, file, line: Number(line), inclusiveMs: round(us / 1000) };
      });
      return { taskMs: round(task.dur / 1000), selfMs: round(top.selfUs / 1000), functionName: top.functionName, file: top.file, line: top.line, ownerMs, callers };
    });
}

async function session(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  if (cpu) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
  }
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));

  /** Runs `action`, waits for the page to settle, and returns the trace's totals. */
  async function traced(action, settleMs = 3000, cpuTarget = null, label = null) {
    const events = [];
    const collect = chunk => { for (const event of chunk.value) events.push(event); };
    cdp.on("Tracing.dataCollected", collect);
    await cdp.send("Tracing.start", { transferMode: "ReportEvents", traceConfig: { includedCategories: ["devtools.timeline", "toplevel", "blink.user_timing"] } });
    if (cpu) await cdp.send("Profiler.start");
    await action();
    await page.waitForTimeout(settleMs);
    const profile = cpu ? (await cdp.send("Profiler.stop")).profile : null;
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
    const longTasks = tasks.filter(event => event.dur > 50_000);
    if (cpu && cpuTarget && label) cpuTarget[label] = extractCpuTasks(longTasks, profile);
    return {
      styleMs: total("UpdateLayoutTree"), styleCount: named("UpdateLayoutTree").length, maxStyleMs: longest(named("UpdateLayoutTree")),
      parseCssMs: total("ParseAuthorStyleSheet"), layoutMs: total("Layout"), scriptMs: total("FunctionCall") + total("EvaluateScript"),
      longestTaskMs: longest(tasks), tasksOver50: longTasks.length,
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
  const cpuTasks = {};
  const { page, context, traced, fullRecalc, signIn, errors } = await session(browser);
  results["cold-load-board"] = await traced(() => page.goto(`${base}/`, { waitUntil: "load" }), 5000, cpuTasks, "cold-load-board");
  await signIn();
  results["launch-about"] = await traced(() => page.getByRole("button", { name: "Open About" }).first().click(), 4000, cpuTasks, "launch-about");
  results["about-full-recalc"] = { fullRecalcMs: await fullRecalc(), elements: await page.evaluate(() => document.querySelectorAll("*").length) };
  const quickSwitch = page.getByRole("button", { name: "Open QuickSwitch" }).first();
  if (await quickSwitch.count()) {
    results["quickswitch-open"] = await traced(() => quickSwitch.click(), 2500, cpuTasks, "quickswitch-open");
    const option = page.getByRole("dialog", { name: "QuickSwitch" }).getByRole("option").first();
    if (await option.count()) results["quickswitch-select"] = await traced(() => option.click(), 4000, cpuTasks, "quickswitch-select");
  }
  const home = page.getByRole("button", { name: "Return to Webspring" }).first();
  if (await home.count() && await home.isVisible()) results["return-to-webspring"] = await traced(() => home.click(), 3000, cpuTasks, "return-to-webspring");
  results["cold-load-gallery"] = await traced(() => page.goto(`${base}${galleryRoute}`, { waitUntil: "load" }), 9000, cpuTasks, "cold-load-gallery");
  results["gallery-full-recalc"] = { fullRecalcMs: await fullRecalc(), elements: await page.evaluate(() => document.querySelectorAll("*").length) };
  results["gallery-hover-sweep"] = await traced(async () => {
    for (let step = 0; step <= 40; step++) await page.mouse.move(20 + step * 34, 26 + (step % 2) * 8);
    for (let step = 0; step <= 40; step++) await page.mouse.move(120, 80 + step * 18);
    await page.mouse.move(0, 0);
  }, 1000, cpuTasks, "gallery-hover-sweep");
  for (const section of gallerySections) {
    const label = `gallery-section:${section}`;
    results[label] = await traced(() => page.getByText(section, { exact: true }).first().click(), 3000, cpuTasks, label);
  }
  if (errors.length) results.pageErrors = errors;
  if (cpu) results.cpuTasks = cpuTasks;
  await context.close();
  return results;
}

const browser = await chromium.launch();
const version = browser.version();
const passes = [];
for (let run = 0; run < runs; run++) passes.push(await pass(browser));
await browser.close();

const summary = { base, runs, chromium: version, recordedAt: new Date().toISOString(), scenarios: {} };
if (cpu) summary.cpuTasks = {};
for (const label of Object.keys(passes[0])) {
  if (label === "pageErrors" || label === "cpuTasks") continue;
  const samples = passes.map(result => result[label]).filter(Boolean);
  const row = {};
  for (const key of Object.keys(samples[0])) row[key] = round(median(samples.map(sample => sample[key])));
  summary.scenarios[label] = row;
  console.log(JSON.stringify({ label, ...row }));
  if (cpu && typeof row.longestTaskMs === "number") {
    const representative = passes.reduce((best, candidate) => {
      if (!candidate[label] || !candidate.cpuTasks?.[label]) return best;
      if (!best) return candidate;
      const bestDiff = Math.abs(best[label].longestTaskMs - row.longestTaskMs);
      const nextDiff = Math.abs(candidate[label].longestTaskMs - row.longestTaskMs);
      return nextDiff < bestDiff ? candidate : best;
    }, null);
    const tasks = representative?.cpuTasks?.[label] ?? [];
    summary.cpuTasks[label] = tasks;
    for (const task of tasks) {
      const location = task.line ? `${task.file}:${task.line}` : task.file;
      console.log(`  CPU >50ms [${label}] ${task.taskMs} ms (${task.selfMs} ms self) ${task.functionName} — ${location}`);
    }
  }
}
const pageErrors = [...new Set(passes.flatMap(result => result.pageErrors ?? []))];
if (pageErrors.length) { summary.pageErrors = pageErrors; console.log(JSON.stringify({ pageErrors })); }
if (jsonPath) writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
