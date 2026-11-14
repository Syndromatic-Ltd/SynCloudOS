/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
/**
 * Runs DispatchFX workloads and payload crossover measurements in headless Chromium.
 *
 *   node scripts/perf/dispatchfx-bench.mjs --workload <name|all> [--runs 3] [--isolated] [--json out.json]
 */
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const option = (name, fallback) => { const at = args.indexOf(`--${name}`); return at < 0 ? fallback : args[at + 1]; };
const workloadArg = option("workload", "all");
const runs = Number(option("runs", "3"));
const isolated = args.includes("--isolated");
const jsonPath = option("json", null);

const fixtureRoot = resolve(import.meta.dirname, "fixtures/dispatchfx");
const mimeTypes = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const round = value => Math.round(value * 10) / 10;

function startFixtureServer() {
  return new Promise((resolveServer, reject) => {
    const server = createServer((req, res) => {
      const urlPath = (req.url ?? "/").split("?")[0];
      const relPath = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/u, "");
      const filePath = resolve(fixtureRoot, relPath);
      if (!filePath.startsWith(fixtureRoot)) { res.writeHead(403).end(); return; }
      try {
        const body = readFileSync(filePath);
        const headers = { "Content-Type": mimeTypes[extname(filePath)] ?? "application/octet-stream" };
        if (isolated) {
          headers["Cross-Origin-Opener-Policy"] = "same-origin";
          headers["Cross-Origin-Embedder-Policy"] = "require-corp";
          headers["Cross-Origin-Resource-Policy"] = "same-origin";
        }
        res.writeHead(200, headers);
        res.end(body);
      } catch {
        res.writeHead(404).end();
      }
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolveServer({ server, url: `http://127.0.0.1:${address.port}/` });
    });
  });
}

async function measureWorkload(page, cdp, workload) {
  const timer = setInterval(() => {
    void cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: 50, y: 50, button: "left", clickCount: 1 }).catch(() => {});
    void cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 50, y: 50, button: "left", clickCount: 1 }).catch(() => {});
  }, 50);
  try {
    return await page.evaluate(name => window.__dfxBench.runWorkload(name), workload);
  } finally {
    clearInterval(timer);
  }
}

const { server, url } = await startFixtureServer();
try {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await page.goto(url, { waitUntil: "load" });
  const available = await page.evaluate(() => window.__dfxBench.workloadNames);
  const targets = workloadArg === "all" ? available : [workloadArg];
  for (const name of targets) {
    if (!available.includes(name)) throw new Error(`Unknown workload "${name}". Available: ${available.join(", ")}`);
  }

  const workloads = {};
  for (const name of targets) {
    const samples = [];
    for (let run = 0; run < runs; run++) samples.push(await measureWorkload(page, cdp, name));
    const summary = {
      workload: name,
      longestTaskMs: round(median(samples.map(sample => sample.longestTaskMs))),
      p95InputDelayMs: round(median(samples.map(sample => sample.p95InputDelayMs))),
      wallMs: round(median(samples.map(sample => sample.wallMs))),
    };
    workloads[name] = summary;
    console.log(JSON.stringify(summary));
  }

  const crossover = await page.evaluate(() => window.__dfxBench.runCrossover());
  console.log(JSON.stringify({ crossover }));

  const report = { isolated, runs, chromium: browser.version(), recordedAt: new Date().toISOString(), workloads, crossover };
  if (jsonPath) writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
} finally {
  server.close();
}
