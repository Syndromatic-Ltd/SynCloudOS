/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
/**
 * Times the phases of an application launch, cold and then warm, from the runtime's own events.
 *
 *   node scripts/perf/launch-timeline.mjs --base http://127.0.0.1:5387 --runs 3 --json launch.json
 *
 * The runtime is found through React's tree and its event bus is wrapped in the page, so nothing
 * in the framework changes for the measurement. Times are milliseconds after the launch request.
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const option = (name, fallback) => { const at = args.indexOf(`--${name}`); return at < 0 ? fallback : args[at + 1]; };
const base = option("base", "http://127.0.0.1:5387");
const runs = Number(option("runs", "3"));
const out = option("json", null);
const wanted = option("apps", "About,Journal,/__syncloudos/nse-gallery").split(",");
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const round = value => Math.round(value * 10) / 10;

/** Finds the runtime, records every event it publishes, and notes style, long tasks and resources. */
function install() {
  const container = [...document.querySelectorAll("*")].find(node => Object.keys(node).some(key => key.startsWith("__reactContainer$")));
  const rootFiber = container?.[Object.keys(container).find(key => key.startsWith("__reactContainer$"))];
  let runtime = null;
  const visit = fiber => {
    for (let at = fiber; at && !runtime; at = at.sibling) {
      for (const candidate of [at.memoizedProps?.value, at.memoizedProps?.runtime]) {
        if (candidate && typeof candidate === "object" && candidate.launchServices && candidate.events?.publish) runtime = candidate;
      }
      if (at.child) visit(at.child);
    }
  };
  visit(rootFiber);
  if (!runtime) throw new Error("No SynCloudOS runtime found in the React tree.");
  const log = (window.__launchLog = []);
  const publish = runtime.events.publish;
  runtime.events.publish = function (type, payload, label) {
    log.push({ at: performance.now(), type, stage: payload?.stage, appId: payload?.appId ?? payload?.request?.appId ?? label });
    return publish.call(this, type, payload, label);
  };
  if (runtime.events.publish === publish) throw new Error("The event bus could not be wrapped.");
  new PerformanceObserver(list => { for (const entry of list.getEntries()) log.push({ at: entry.startTime, type: "longtask", ms: entry.duration }); }).observe({ entryTypes: ["longtask"] });
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) log.push({ at: entry.startTime, type: "resource", ms: entry.duration, name: entry.name.replace(location.origin, "").slice(0, 120), kind: entry.initiatorType });
  }).observe({ entryTypes: ["resource"] });
  new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) {
      if (node.nodeName === "STYLE" || (node.nodeName === "LINK" && node.rel === "stylesheet")) log.push({ at: performance.now(), type: "stylesheet", name: (node.getAttribute("data-vite-dev-id") ?? node.href ?? "").split("/").slice(-3).join("/") });
    }
  }).observe(document.head, { childList: true });
  window.__runtime = runtime;
  return runtime.apps.getDisplayApps().map(app => ({ id: app.bundleIdentifier, name: app.displayName ?? app.packageName }));
}

/** Requests a launch and resolves two frames after `app.launch.complete`. */
function launch(appId) {
  const runtime = window.__runtime;
  const log = window.__launchLog;
  log.length = 0;
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const timer = setTimeout(() => reject(new Error(`Launch of ${appId} did not complete: ${JSON.stringify(log.filter(entry => entry.type.startsWith("app.")).map(entry => entry.type))}`)), 30_000);
    const off = runtime.events.subscribe("app.launch.complete", () => {
      off();
      const complete = performance.now();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        clearTimeout(timer);
        const frame = performance.now();
        setTimeout(() => resolve({ start, complete, frame, log: log.map(entry => ({ ...entry, at: entry.at - start })) }), 1500);
      }));
    });
    runtime.launchServices.openApp(appId, { source: "developer" });
  });
}

function phases(result) {
  const first = (type, test = () => true) => result.log.find(entry => entry.type === type && test(entry))?.at;
  const within = result.log.filter(entry => entry.at >= 0 && entry.at <= result.frame - result.start);
  const sum = type => within.filter(entry => entry.type === type).reduce((total, entry) => total + entry.ms, 0);
  return {
    started: first("app.launch.started"),
    authorised: first("app.launch.authorised"),
    bundleLoadBegin: first("bundle.load.begin"),
    bundleReady: first("bundle.load.complete"),
    lifecycleCommitted: first("app.lifecycle", entry => entry.stage === "launch" || entry.stage === "resume" || entry.stage === "activate"),
    complete: result.complete - result.start,
    firstFrame: result.frame - result.start,
    stylesheetsAdded: within.filter(entry => entry.type === "stylesheet").length,
    resources: within.filter(entry => entry.type === "resource").length,
    longTaskMs: sum("longtask"),
  };
}

async function pass(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${base}/`, { waitUntil: "load" });
  await page.getByRole("button", { name: /Sign in locally/u }).click();
  await page.getByRole("button", { name: "Open About" }).first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(2500);
  const apps = await page.evaluate(install);
  const results = {};
  for (const name of wanted) {
    // A name beginning with "/" is a route: applications kept off the board are reached that way.
    const app = name.startsWith("/")
      ? await page.evaluate(route => { const id = window.__runtime.routes.resolveRoute(route).app?.bundleIdentifier; return id ? { id } : null; }, name)
      : apps.find(candidate => candidate.name === name || candidate.id === name);
    if (!app) { results[name] = { missing: apps.map(candidate => candidate.name) }; continue; }
    const cold = await page.evaluate(launch, app.id);
    await page.evaluate(() => window.__runtime.commands.dispatch("workspace.returnToWebspring", undefined, { source: "system" }));
    await page.waitForTimeout(2500);
    const warm = await page.evaluate(launch, app.id);
    await page.evaluate(() => window.__runtime.commands.dispatch("workspace.returnToWebspring", undefined, { source: "system" }));
    await page.waitForTimeout(2500);
    results[name] = { cold: phases(cold), warm: phases(warm), coldLog: cold.log };
  }
  await context.close();
  return results;
}

const browser = await chromium.launch();
const version = browser.version();
const passes = [];
for (let run = 0; run < runs; run++) passes.push(await pass(browser));
await browser.close();

const summary = { base, runs, chromium: version, recordedAt: new Date().toISOString(), apps: {} };
for (const name of wanted) {
  if (passes[0][name].missing) { summary.apps[name] = passes[0][name]; continue; }
  summary.apps[name] = {};
  for (const temperature of ["cold", "warm"]) {
    const row = {};
    for (const key of Object.keys(passes[0][name][temperature])) {
      const samples = passes.map(result => result[name][temperature][key]).filter(value => typeof value === "number");
      row[key] = samples.length ? round(median(samples)) : null;
    }
    summary.apps[name][temperature] = row;
  }
  // One cold pass in full, so the order of fetches and stylesheet insertions can be read.
  summary.apps[name].coldLog = passes[0][name].coldLog.filter(entry => entry.at >= 0).map(entry => ({ ...entry, at: round(entry.at), ms: entry.ms === undefined ? undefined : round(entry.ms) }));
}
if (out) writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);
for (const [name, rows] of Object.entries(summary.apps)) {
  if (rows.missing) { console.log(name, "not found among", rows.missing.join(", ")); continue; }
  for (const temperature of ["cold", "warm"]) console.log(`${name} ${temperature}`.padEnd(28), JSON.stringify(rows[temperature]));
}
