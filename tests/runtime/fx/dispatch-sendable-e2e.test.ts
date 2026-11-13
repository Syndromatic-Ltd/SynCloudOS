/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { execFileSync } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { extname, join, resolve } from "node:path";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";
import { build, createServer as createViteServer } from "vite";
import { expect, it, vi } from "vitest";
import { createInstalledConsumer } from "../../../scripts/synware/installed-consumer.mjs";
import { createWorkerSafeClassifier, synCloudOS } from "../../../scripts/synware/vite-plugin.mjs";
import { synWarePackageName, synWareSdkEntries } from "../../../scripts/synware/sdk-entries.mjs";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function sdkResolveAliases(repoRoot: string) {
  return [
    { find: /^react-dom\/client$/, replacement: resolve(repoRoot, "node_modules/react-dom/client.js") },
    { find: /^react-dom$/, replacement: resolve(repoRoot, "node_modules/react-dom/index.js") },
    { find: /^react$/, replacement: resolve(repoRoot, "node_modules/react/index.js") },
  ];
}

function localSdkFallbackPlugin(repoRoot: string) {
  const entries = new Map<string, string>([
    ...Object.entries(synWareSdkEntries).map(([entry, target]): [string, string] => [
      `${synWarePackageName}${entry === "index" ? "" : `/${entry}`}`,
      resolve(repoRoot, target),
    ]),
    ["@syndromatic/syncloudos/nse/styles.css", resolve(repoRoot, "src/NSE/public/styles.css")],
    ["react/jsx-dev-runtime", resolve(repoRoot, "node_modules/react/jsx-dev-runtime.js")],
    ["react/jsx-runtime", resolve(repoRoot, "node_modules/react/jsx-runtime.js")],
  ]);
  return {
    name: "local-sdk-fallback",
    resolveId(id: string) {
      return entries.get(id) ?? null;
    },
  };
}

async function getFreePort(): Promise<number> {
  return await new Promise((resolvePromise, rejectPromise) => {
    const netServer = createNetServer();
    netServer.unref();
    netServer.on("error", rejectPromise);
    netServer.listen(0, "127.0.0.1", () => {
      const address = netServer.address();
      const port = typeof address === "object" && address ? address.port : 0;
      netServer.close(() => resolvePromise(port));
    });
  });
}

function createStaticServer(distRoot: string) {
  return createHttpServer((req, res) => {
    const reqPath = (req.url ?? "/").split("?")[0];
    const rel = reqPath === "/" ? "index.html" : reqPath.replace(/^\/+/, "");
    const full = join(distRoot, rel);
    try {
      const bytes = readFileSync(full);
      res.writeHead(200, { "Content-Type": MIME_TYPES[extname(full)] ?? "application/octet-stream" });
      res.end(bytes);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
}

function writeAppModule(appDir: string, multiplier: number) {
  writeFileSync(
    join(appDir, "index.tsx"),
    `import { NSEApplication } from "@syndromatic/syncloudos";
import { DFXGroup, DFXQoS, DFXQoSClass, DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
import { NSEData } from "@syndromatic/syncloudos/foundation";

export default class WorkerProbe extends NSEApplication {}

export function computeSingle(input: number): Promise<{ onWorker: boolean; value: number }> {
  return new Promise((resolvePromise) => {
    DFXQueue.global(DFXQoSClass.userInitiated).async(() => {
      const onWorker = typeof self !== "undefined" && typeof (globalThis as { window?: unknown }).window === "undefined";
      const value = input * ${multiplier};
      DFXQueue.main.async(() => resolvePromise({ onWorker, value }));
    });
  });
}

export function startStuckWork(): void {
  (globalThis as Record<string, unknown>).__stuckContinuationRan = false;
  const stuckQueue = new DFXQueue("stuck.probe");
  stuckQueue.async(() => {
    const until = Date.now() + 2600;
    let spins = 0;
    while (Date.now() < until) {
      spins += 1;
    }
    (globalThis as { __stuckSpins?: number }).__stuckSpins = spins;
    DFXQueue.main.async(() => {
      (globalThis as Record<string, unknown>).__stuckContinuationRan = true;
    });
  });
}

export function verifyRecoveredAfterStuck(): Promise<{ onWorker: boolean; continuationRan: boolean }> {
  return new Promise((resolvePromise) => {
    const recoveryQueue = new DFXQueue("recovered.probe");
    recoveryQueue.async(() => {
      const onWorker = typeof self !== "undefined" && typeof (globalThis as { window?: unknown }).window === "undefined";
      DFXQueue.main.async(() => {
        resolvePromise({
          onWorker,
          continuationRan: Boolean((globalThis as { __stuckContinuationRan?: boolean }).__stuckContinuationRan),
        });
      });
    });
  });
}

function readWorkerPostLength(transferQueue: DFXQueue, transferredLen: number): Promise<{ transferredLen: number; workerAfterPostLen: number }> {
  return new Promise((resolvePromise) => {
    setTimeout(() => {
      transferQueue.async(() => {
        const afterLen = (globalThis as { __lastProducedByteLength?: number }).__lastProducedByteLength ?? -1;
        DFXQueue.main.async(() => resolvePromise({ transferredLen, workerAfterPostLen: afterLen }));
      });
    }, 30);
  });
}

export function runSendableChecks() {
  return new Promise((resolvePromise) => {
    const output: Record<string, unknown> = {};
    const mainQueue = DFXQueue.main;
    const globalQueue = DFXQueue.global(DFXQoSClass.userInitiated);
    const group1 = new DFXGroup();

    // 1. global.async closure runs on worker and main.async continuation updates main state
    const factor = 21;
    let mainState = 0;
    group1.enter();
    globalQueue.async(() => {
      const onWorker = typeof self !== "undefined" && typeof (globalThis as { window?: unknown }).window === "undefined";
      const computed = factor * ${multiplier};
      DFXQueue.main.async(() => {
        mainState = computed;
        output.case1 = { onWorker, mainState };
        group1.leave();
      });
    });

    // 2. captured NSEData is not detached on caller
    const raw = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const data = NSEData.from(raw);
    const bytes = data.bytes;
    group1.enter();
    globalQueue.async(() => {
      const sum = new Uint8Array(bytes).reduce((a, b) => a + b, 0);
      DFXQueue.main.async(() => {
        output.case2 = { workerSum: sum, callerByteLength: data.count, callerFirst: data.bytes[0], capturedBytesLen: bytes.byteLength };
        group1.leave();
      });
    });

    // 3. mutating a captured clone throws in worker
    const bag = { nested: { count: 1 } };
    group1.enter();
    globalQueue.async(() => {
      let threw = false;
      try {
        (bag.nested as { count: number }).count = 99;
      } catch (err) {
        threw = err instanceof TypeError;
      }
      DFXQueue.main.async(() => {
        output.case3 = { threw, mainCount: bag.nested.count };
        group1.leave();
      });
    });

    // 4. results transferred not cloned: byteLength === 0 on the pinned serial worker after posting
    const transferQueue = new DFXQueue("transfer.probe");
    group1.enter();
    transferQueue.async(() => {
      const produced = new Uint8Array(1024);
      produced[0] = 77;
      setTimeout(() => {
        (globalThis as { __lastProducedByteLength?: number }).__lastProducedByteLength = produced.byteLength;
      }, 0);
      DFXQueue.main.async(() => {
        const len = produced.byteLength;
        void readWorkerPostLength(transferQueue, len).then((res) => {
          output.case4 = res;
          group1.leave();
        });
      });
    });

    // 5. non-sendable closure runs in-realm at its QoS
    const fallbackQueue = new DFXQueue("fallback.serial", { qos: DFXQoS.utility });
    group1.enter();
    fallbackQueue.async(() => {
      const titleType = typeof document.title;
      const inWindow = typeof window !== "undefined";
      output.case5 = { inWindow, titleType, qosUtility: fallbackQueue.qos.qosClass === DFXQoSClass.utility };
      group1.leave();
    });

    group1.notify(mainQueue, () => resolvePromise(output));
  });
}
`,
  );
}

function writeAppFixture(root: string, multiplier = 2) {
  const appDir = join(root, "src/SynWare/WorkerProbe.app/Contents");
  mkdirSync(appDir, { recursive: true });
  writeFileSync(
    join(root, "index.html"),
    `<!doctype html><html><body><script type="module" src="/src/main.ts"></script></body></html>\n`,
  );
  writeFileSync(
    join(appDir, "Info.ts"),
    `export default { bundleIdentifier: "com.example.worker-probe", displayName: "WorkerProbe", version: "1.0.0", routes: [{ path: "/probe", primary: true }] };\n`,
  );
  writeAppModule(appDir, multiplier);
  writeFileSync(
    join(root, "src/main.ts"),
    `import { createSynWareTestHost } from "@syndromatic/syncloudos/sdk/testing";
import WorkerProbe, * as probe from "./SynWare/WorkerProbe.app/Contents/index";
import info from "./SynWare/WorkerProbe.app/Contents/Info";

let currentHost: ReturnType<typeof createSynWareTestHost> | null = null;
async function mountHost() {
  currentHost = createSynWareTestHost({
    application: WorkerProbe,
    manifest: { schemaVersion: 1, ...info },
    document,
  });
  await currentHost.render();
}
await mountHost();

const api = {
  computeSingle: (n: number) => probe.computeSingle(n),
  runSendableChecks: () => probe.runSendableChecks(),
  runStuckCancelCheck: async () => {
    probe.startStuckWork();
    await new Promise(resolveDelay => setTimeout(resolveDelay, 60));
    await currentHost!.dispose();
    await mountHost();
    await new Promise(resolveDelay => setTimeout(resolveDelay, 2200));
    return await probe.verifyRecoveredAfterStuck();
  },
};
(globalThis as Record<string, unknown>).__probe = api;
if (import.meta.hot) {
  import.meta.hot.accept("./SynWare/WorkerProbe.app/Contents/index", (nextMod) => {
    if (nextMod) api.computeSingle = nextMod.computeSingle;
  });
}
`,
  );
  return appDir;
}

it("runs sendable closures end-to-end in Vite build and Chromium (cases 1-6)", async () => {
  const repoRoot = realpathSync.native(process.cwd());
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "dfx-sendable-build-")));
  const warnings: string[] = [];
  const warnSpy = vi.spyOn(console, "warn").mockImplementation((...args) => {
    warnings.push(args.map(String).join(" "));
  });

  try {
    writeAppFixture(root, 2);

    const buildOutput = await build({
      configFile: false,
      root,
      logLevel: "silent",
      plugins: [synCloudOS({ webspringEntry: false }), localSdkFallbackPlugin(repoRoot)],
      resolve: { alias: sdkResolveAliases(repoRoot) },
      build: {
        outDir: "dist",
        minify: false,
        rollupOptions: {
          onwarn(warning) {
            warnings.push(warning.message);
          },
        },
      },
    });
    warnSpy.mockRestore();
    expect(buildOutput).toBeTruthy();

    // Case 5 build diagnostic check: non-sendable document usage printed its reason.
    expect(warnings.some(w => w.includes("document") && w.includes("not sendable")), JSON.stringify(warnings)).toBe(true);

    const distServer = createStaticServer(join(root, "dist"));
    const distPort = await getFreePort();
    await new Promise<void>(resolveListen => distServer.listen(distPort, "127.0.0.1", resolveListen));

    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const pageErrors: string[] = [];
      page.on("pageerror", e => pageErrors.push(e.message));
      await page.goto(`http://127.0.0.1:${distPort}/`);
      await page.waitForFunction(() => Boolean((globalThis as { __probe?: unknown }).__probe));

      const res = await page.evaluate(() => (globalThis as unknown as { __probe: { runSendableChecks(): Promise<unknown> } }).__probe.runSendableChecks()) as Record<string, any>;
      expect(pageErrors).toEqual([]);
      expect(res.case1).toEqual({ onWorker: true, mainState: 42 });
      expect(res.case2).toEqual({ workerSum: 36, callerByteLength: 8, callerFirst: 1, capturedBytesLen: 8 });
      expect(res.case3).toEqual({ threw: true, mainCount: 1 });
      expect(res.case4.transferredLen).toBe(1024);
      expect(res.case4.workerAfterPostLen).toBe(0);
      expect(res.case5).toEqual({ inWindow: true, titleType: "string", qosUtility: true });

      const stuckRes = await page.evaluate(() => (globalThis as unknown as { __probe: { runStuckCancelCheck(): Promise<{ onWorker: boolean; continuationRan: boolean }> } }).__probe.runStuckCancelCheck());
      expect(stuckRes).toEqual({ onWorker: true, continuationRan: false });
      expect(pageErrors).toEqual([]);
    } finally {
      await browser.close();
      await new Promise<void>(resolveClose => distServer.close(() => resolveClose()));
    }
  } finally {
    warnSpy.mockRestore();
    rmSync(root, { recursive: true, force: true });
  }
}, 60_000);

it("HMR replaces the worker chunk without full reload (case 7)", async () => {
  const repoRoot = realpathSync.native(process.cwd());
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "dfx-sendable-hmr-")));
  const appDir = writeAppFixture(root, 2);
  const devPort = await getFreePort();
  const server = await createViteServer({
    configFile: false,
    root,
    logLevel: "silent",
    server: { host: "127.0.0.1", port: devPort, strictPort: true, fs: { allow: [root, realpathSync(root), repoRoot, realpathSync(repoRoot)] } },
    plugins: [synCloudOS({ webspringEntry: false }), localSdkFallbackPlugin(repoRoot)],
    resolve: { alias: sdkResolveAliases(repoRoot) },
  });
  await server.listen();

  const browser = await chromium.launch({ headless: true });
  const pageErrors: string[] = [];
  const consoleMessages: string[] = [];
  const failedRequests: string[] = [];
  const badResponses: string[] = [];
  try {
    const page = await browser.newPage();
    page.on("pageerror", e => pageErrors.push(e.message));
    page.on("console", m => consoleMessages.push(`${m.type()}: ${m.text()}`));
    page.on("requestfailed", r => failedRequests.push(`${r.url()}: ${r.failure()?.errorText}`));
    page.on("response", r => { if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`); });
    await page.goto(`http://127.0.0.1:${devPort}/`);
    try {
      await page.waitForFunction(() => Boolean((globalThis as { __probe?: unknown }).__probe), undefined, { timeout: 15_000 });
    } catch (error) {
      throw new Error(`HMR page boot timed out; badResponses=${JSON.stringify(badResponses)} errors=${JSON.stringify(pageErrors)} failed=${JSON.stringify(failedRequests)} console=${JSON.stringify(consoleMessages.slice(-10))}: ${String(error)}`);
    }
    await page.evaluate(() => {
      (globalThis as { __hmrAlive?: string }).__hmrAlive = "yes";
    });

    const initial = await page.evaluate(() => (globalThis as unknown as { __probe: { computeSingle(n: number): Promise<{ onWorker: boolean; value: number }> } }).__probe.computeSingle(21));
    expect(initial).toEqual({ onWorker: true, value: 42 });

    writeAppModule(appDir, 10);

    let updated: { onWorker: boolean; value: number } | null = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      updated = await page.evaluate(() => (globalThis as unknown as { __probe: { computeSingle(n: number): Promise<{ onWorker: boolean; value: number }> } }).__probe.computeSingle(21));
      if (updated.value === 210) break;
      await new Promise(resolveDelay => setTimeout(resolveDelay, 150));
    }
    expect(updated).toEqual({ onWorker: true, value: 210 });
    expect(await page.evaluate(() => (globalThis as { __hmrAlive?: string }).__hmrAlive)).toBe("yes");
    expect(pageErrors).toEqual([]);
  } finally {
    await browser.close();
    await server.close();
    rmSync(root, { recursive: true, force: true });
  }
}, 60_000);

it("packed consumer runs sendable closures on the worker pool in Chromium", async () => {
  const repoRoot = realpathSync.native(process.cwd());
  const consumer = createInstalledConsumer(repoRoot, "dispatch-sendable-packed-");
  const root = realpathSync.native(consumer.root);
  writeAppFixture(root, 3);

  const viteEntry = pathToFileURL(resolve(repoRoot, "node_modules/vite/dist/node/index.js")).href;
  const packedVite = pathToFileURL(join(consumer.installed, "vite.mjs")).href;
  const reactAliases = JSON.stringify(sdkResolveAliases(repoRoot));
  const buildScript = `
    import { build } from ${JSON.stringify(viteEntry)};
    import { synCloudOS } from ${JSON.stringify(packedVite)};
    await build({
      configFile: false,
      root: ${JSON.stringify(root)},
      logLevel: "silent",
      plugins: [synCloudOS({ webspringEntry: false })],
      resolve: { alias: ${reactAliases} },
      build: { outDir: "dist", minify: false },
    });
  `;
  execFileSync(process.execPath, ["--input-type=module", "-e", buildScript], { cwd: root, stdio: "pipe" });

  const distServer = createStaticServer(join(root, "dist"));
  const distPort = await getFreePort();
  await new Promise<void>(resolveListen => distServer.listen(distPort, "127.0.0.1", resolveListen));

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", e => pageErrors.push(e.message));
    await page.goto(`http://127.0.0.1:${distPort}/`);
    await page.waitForFunction(() => Boolean((globalThis as { __probe?: unknown }).__probe));
    const result = await page.evaluate(() => (globalThis as unknown as { __probe: { computeSingle(n: number): Promise<{ onWorker: boolean; value: number }> } }).__probe.computeSingle(14));
    expect(result).toEqual({ onWorker: true, value: 42 });
    expect(pageErrors).toEqual([]);
  } finally {
    await browser.close();
    await new Promise<void>(resolveClose => distServer.close(() => resolveClose()));
  }
}, 120_000);

function decodeVLQValue(str: string, indexRef: { i: number }): number {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = 0;
  let shift = 0;
  let cont = true;
  while (cont) {
    const digit = chars.indexOf(str[indexRef.i++]);
    cont = (digit & 32) !== 0;
    result += (digit & 31) << shift;
    shift += 5;
  }
  const neg = (result & 1) === 1;
  result >>= 1;
  return neg ? -result : result;
}

function findMappedSourceLine(
  map: { sources: string[]; mappings: string },
  genLineIndex: number,
): { source: string; line: number } | null {
  let srcIdx = 0;
  let srcLine = 0;
  let srcCol = 0;
  const lines = map.mappings.split(";");
  for (let l = 0; l < lines.length; l++) {
    let genCol = 0;
    let firstOnLine: { source: string; line: number } | null = null;
    for (const seg of lines[l].split(",")) {
      if (!seg) continue;
      const ref = { i: 0 };
      genCol += decodeVLQValue(seg, ref);
      if (ref.i < seg.length) {
        srcIdx += decodeVLQValue(seg, ref);
        srcLine += decodeVLQValue(seg, ref);
        srcCol += decodeVLQValue(seg, ref);
        if (!firstOnLine) firstOnLine = { source: map.sources[srcIdx], line: srcLine };
      }
    }
    if (l === genLineIndex) return firstOnLine;
  }
  return null;
}

it("builds reproducible relative closure IDs, rejects unsafe transitive helpers, and preserves JSX hook-mirroring, decorators, and source maps", async () => {
  const repoRoot = realpathSync.native(process.cwd());
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "dfx-repro-safety-")));
  const warnings: string[] = [];
  const warnSpy = vi.spyOn(console, "warn").mockImplementation((...args) => warnings.push(args.map(String).join(" ")));

  try {
    const appDir = join(root, "src/SynWare/SafeProbe.app/Contents");
    mkdirSync(appDir, { recursive: true });
    writeFileSync(join(root, "index.html"), `<!doctype html><html><body><script type="module" src="/src/main.ts"></script></body></html>\n`);
    writeFileSync(join(appDir, "Info.ts"), `export default { bundleIdentifier: "com.example.safe-probe", displayName: "SafeProbe", version: "1.0.0", routes: [{ path: "/safe", primary: true }] };\n`);
    writeFileSync(join(appDir, "styles.css"), `.box { color: red; }\n`);
    writeFileSync(join(appDir, "domHelper.ts"), `export function readDomTitle(): string { return typeof document !== "undefined" ? document.title : "missing"; }\n`);
    writeFileSync(join(appDir, "barrel.ts"), `export { readDomTitle } from "./domHelper";\n`);
    writeFileSync(join(appDir, "pureHelper.ts"), `export function scaleValue(n: number): number { return n * 7; }\n`);

    const appSource = [
      `import { NSEApplication } from "@syndromatic/syncloudos";`,
      `import { DFXQoSClass, DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";`,
      `import { readDomTitle } from "./domHelper";`,
      `import { readDomTitle as readBarrelTitle } from "./barrel";`,
      `import { scaleValue } from "./pureHelper";`,
      `import "./styles.css";`,
      `const trackLog: string[] = [];`,
      `function track(_target: unknown, context: { name: string | symbol }) { trackLog.push(String(context.name)); }`,
      `export default class SafeProbe extends NSEApplication {`,
      `  @track accessor badge = "ok";`,
      `}`,
      `export function ProbeView() { return <div data-nse-hook="title">ok</div>; }`,
      `export function runSafe(input: number): Promise<{ onWorker: boolean; val: number; tracked: string[] }> {`,
      `  return new Promise(res => {`,
      `    DFXQueue.global(DFXQoSClass.userInitiated).async(() => {`,
      `      const val = scaleValue(input);`,
      `      const onWorker = typeof (globalThis as { window?: unknown }).window === "undefined";`,
      `      DFXQueue.main.async(() => res({ onWorker, val, tracked: trackLog }));`,
      `    });`,
      `  });`,
      `}`,
      `export function runUnsafeHelpers(): Promise<{ directTitle: string; barrelTitle: string }> {`,
      `  return new Promise(res => {`,
      `    DFXQueue.global().async(() => {`,
      `      const directTitle = readDomTitle();`,
      `      DFXQueue.main.async(() => res({ directTitle, barrelTitle: readBarrelTitle() }));`,
      `    });`,
      `  });`,
      `}`,
    ].join("\n");
    writeFileSync(join(appDir, "index.tsx"), appSource);

    // Verify classifier directly: unresolved relative, non-script asset, DOM helper, and export-from barrel are rejected; pure helper passes.
    const classify = createWorkerSafeClassifier(join(appDir, "index.tsx"));
    expect(classify("./missing")).toBe(false);
    expect(classify("./styles.css")).toBe(false);
    expect(classify("./domHelper")).toBe(false);
    expect(classify("./barrel")).toBe(false);
    expect(classify("./pureHelper")).toBe(true);

    writeFileSync(
      join(root, "src/main.ts"),
      `import { createSynWareTestHost } from "@syndromatic/syncloudos/sdk/testing";
import SafeProbe, { ProbeView, runSafe, runUnsafeHelpers } from "./SynWare/SafeProbe.app/Contents/index";
import info from "./SynWare/SafeProbe.app/Contents/Info";
const host = createSynWareTestHost({ application: SafeProbe, manifest: { schemaVersion: 1, ...info }, document });
await host.render();
(globalThis as Record<string, unknown>).__safeProbe = { ProbeView, runSafe, runUnsafeHelpers };
`,
    );

    await build({
      configFile: false,
      root,
      mode: "production",
      logLevel: "silent",
      esbuild: { jsxDev: false },
      plugins: [synCloudOS({ webspringEntry: false }), localSdkFallbackPlugin(repoRoot)],
      resolve: { alias: sdkResolveAliases(repoRoot) },
      build: { outDir: "dist", minify: false, sourcemap: true },
    });
    warnSpy.mockRestore();

    // Warnings should reject closures importing domHelper (or missing module in unit check).
    expect(warnings.some(w => w.includes("./domHelper") || w.includes("not worker-safe")), JSON.stringify(warnings)).toBe(true);

    const assetsDir = join(root, "dist/assets");
    const assetFiles = readdirSync(assetsDir);
    const jsAssets = assetFiles.filter(f => f.endsWith(".js"));
    const rootForward = root.replaceAll("\\", "/");
    const repoForward = repoRoot.replaceAll("\\", "/");
    for (const file of jsAssets) {
      const code = readFileSync(join(assetsDir, file), "utf8");
      const snippet = (needle: string) => {
        const i = code.indexOf(needle);
        return i < 0 ? "" : code.slice(Math.max(0, i - 40), i + needle.length + 60);
      };
      expect(code.includes(root), `${file} contains root: ${snippet(root)}`).toBe(false);
      expect(code.includes(rootForward), `${file} contains rootForward: ${snippet(rootForward)}`).toBe(false);
      expect(code.includes(repoRoot), `${file} contains repoRoot: ${snippet(repoRoot)}`).toBe(false);
      expect(code.includes(repoForward), `${file} contains repoForward: ${snippet(repoForward)}`).toBe(false);
    }

    // Hook-mirroring preserved (react/jsx-runtime was intercepted, not bypassed by ts.transpileModule)
    const combinedJs = jsAssets.map(f => readFileSync(join(assetsDir, f), "utf8")).join("\n");
    expect(combinedJs.includes("Contents/index.tsx#0")).toBe(true);
    expect(combinedJs.includes("mirrorProps")).toBe(true);

    // Check source map resolves the closure statement line back to original .tsx line index (15 = `const val = scaleValue(input);`)
    const expectedOrigLine = appSource.split("\n").findIndex(l => l.includes("const val = scaleValue(input);"));
    let resolvedLineMatch = false;
    for (const file of jsAssets) {
      const mapPath = join(assetsDir, `${file}.map`);
      const jsLines = readFileSync(join(assetsDir, file), "utf8").split("\n");
      const targetGenLine = jsLines.findIndex(l => l.includes("scaleValue(input)"));
      if (targetGenLine >= 0) {
        const parsedMap = JSON.parse(readFileSync(mapPath, "utf8")) as { sources: string[]; mappings: string };
        const mapped = findMappedSourceLine(parsedMap, targetGenLine);
        if (mapped && mapped.source.includes("Contents/index.tsx") && mapped.line === expectedOrigLine) {
          resolvedLineMatch = true;
        }
      }
    }
    expect(resolvedLineMatch).toBe(true);

    // Check Vite dev server transforms .tsx with jsxDEV from hookMirrorJSXDevRuntime (when NODE_ENV=test override isn't forcing non-dev JSX)
    const devPort = await getFreePort();
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    let devServer;
    try {
      devServer = await createViteServer({
        configFile: false,
        root,
        mode: "development",
        logLevel: "silent",
        server: { host: "127.0.0.1", port: devPort, strictPort: true, fs: { allow: [root, realpathSync(root), repoRoot, realpathSync(repoRoot)] } },
        plugins: [synCloudOS({ webspringEntry: false }), react(), localSdkFallbackPlugin(repoRoot)],
        resolve: { alias: sdkResolveAliases(repoRoot) },
      });
      const transformed = await devServer.transformRequest("/src/SynWare/SafeProbe.app/Contents/index.tsx");
      expect(transformed?.code.includes("jsxDEV"), transformed?.code.slice(0, 600)).toBe(true);
      expect(transformed?.code.includes("hookMirrorJSXDevRuntime"), transformed?.code.slice(0, 600)).toBe(true);
      expect(transformed?.code.includes("$RefreshReg$"), transformed?.code.slice(0, 600)).toBe(true);
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
      await devServer?.close();
    }
  } finally {
    warnSpy.mockRestore();
    rmSync(root, { recursive: true, force: true });
  }
}, 60_000);
