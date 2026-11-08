import { spawn } from "node:child_process";
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { expect, it, vi } from "vitest";
import { createInstalledConsumer, runNode, verifyInstalledSdkResources } from "../../../scripts/synware/installed-consumer.mjs";

it("keeps attributed classes and sessions in one installed SDK graph with real dev optimisation and HMR", async () => {
  const consumer = createInstalledConsumer(process.cwd(), "fx-attribution-dev-");
  cpSync(resolve("tests/fixtures/fx-dev-attribution"), consumer.root, { recursive: true });
  const reactPluginVersion = JSON.parse(readFileSync(resolve("node_modules/@vitejs/plugin-react/package.json"), "utf8")).version;
  runNode([consumer.npm, "install", "--prefer-offline", "--ignore-scripts", "--package-lock=false", `@vitejs/plugin-react@${reactPluginVersion}`], consumer.root);
  writeFileSync(join(consumer.root, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx", strict: true, skipLibCheck: false, noEmit: true, lib: ["ES2022", "DOM", "DOM.Iterable"], types: ["vite/client"] }, files: ["main.ts"] }));
  runNode(["node_modules/typescript/bin/tsc", "-p", "tsconfig.json"], consumer.root);
  const child = spawn(process.execPath, ["serve.mjs"], { cwd: consumer.root, stdio: ["ignore", "pipe", "pipe", "ipc"] });
  let serverLog = "";
  child.stdout.on("data", data => { serverLog += data; });
  child.stderr.on("data", data => { serverLog += data; });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const requests: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const browserConsole: string[] = [];
  const hmrFrames: string[] = [];
  try {
    await vi.waitFor(() => { expect(child.exitCode, serverLog).toBeNull(); expect(existsSync(join(consumer.root, "dev-server.json")), serverLog).toBe(true); }, { timeout: 30_000 });
    const server = JSON.parse(readFileSync(join(consumer.root, "dev-server.json"), "utf8"));
    expect(new URL(server.url).port).not.toMatch(/^(5173|5210|5387|5199)$/);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on("request", request => { requests.push(request.url()); });
    page.on("websocket", socket => socket.on("framereceived", frame => { hmrFrames.push(String(frame.payload)); }));
    page.on("pageerror", error => { pageErrors.push(error.message); });
    page.on("requestfailed", request => { failedRequests.push(`${request.url()}: ${request.failure()?.errorText}`); });
    page.on("console", message => { browserConsole.push(`${message.type()}: ${message.text()}`); });
    await page.goto(server.url);
    try {
      await page.waitForFunction(() => ["ready", "error"].includes((globalThis as any).__devAttribution?.phase));
    } catch (error) {
      const state = await page.evaluate(() => (globalThis as any).__devAttribution ?? null);
      writeFileSync(resolve("docs/superpowers/evidence/2026-11-08-fx-fidelity/dev-binding-readiness-diagnostic.json"), JSON.stringify({ state, pageErrors, failedRequests, browserConsole, serverLog, requests }, null, 2) + "\n");
      throw error;
    }
    const initial = await page.evaluate(() => {
      const state = (globalThis as any).__devAttribution;
      return { phase: state.phase, error: state.error, stack: state.stack, first: state.first, bootToken: state.bootToken };
    });
    if (initial.phase !== "ready") {
      const runtimeURLs = requests.filter(url => new URL(url).pathname.endsWith("/fx-attribution-runtime.js"));
      const familyURL = requests.find(url => new URL(url).pathname.endsWith("/fx/pass.js"));
      const identity = await page.evaluate(async ({ runtimeURLs, familyURL }) => {
        const importModule = new Function("url", "return import(url)") as (url: string) => Promise<any>;
        const runtimes = await Promise.all(runtimeURLs.map(importModule));
        const family = familyURL ? await importModule(familyURL) : null;
        return { runtimeURLs, sameMarker: runtimes.length === 2 ? runtimes[0].fxAttributedClass === runtimes[1].fxAttributedClass : null,
          familyMarkers: runtimes.map(runtime => family ? Reflect.get(family.PKFXPaymentAuthorizationController, runtime.fxAttributedClass) === true : null) };
      }, { runtimeURLs, familyURL });
      writeFileSync(resolve("docs/superpowers/evidence/2026-11-08-fx-fidelity/dev-binding-url-identity-diagnostic.json"), JSON.stringify({ initial, identity, pageErrors, serverLog, requests }, null, 2) + "\n");
    }
    expect(initial.phase, JSON.stringify({ initial, pageErrors, serverLog })).toBe("ready");
    const expectedCase = { paymentsType: "boolean", boundMonitor: true, baseMonitor: true, boundQueue: true, baseQueue: true, stableMain: true, sameQueue: true };
    expect(initial.first).toEqual({ version: "before HMR", appID: "com.example.dev-attribution", sharedPreferences: "shared session", separateBoundClasses: true, sameApplication: true, cases: [expectedCase, expectedCase, expectedCase] });
    expect(server.noDiscovery).not.toBe(true);
    expect(server.include.filter((id: string) => id === "@syndromatic/syncloudos" || id.startsWith("@syndromatic/syncloudos/"))).toEqual([]);
    expect(requests.some(url => /\/node_modules\/.vite\/deps\/react(?:_dom_client|_jsx-runtime)?\.js/.test(url))).toBe(true);
    expect(requests.some(url => new URL(url).pathname.endsWith("/node_modules/.vite/deps/react-dom.js"))).toBe(true);
    expect(requests.filter(url => /\/node_modules\/.vite\/deps\/@syndromatic_syncloudos/.test(url))).toEqual([]);
    expect(requests.filter(url => new URL(url).pathname.endsWith("/fx-attribution-runtime.js"))).toHaveLength(1);
    const entry = join(consumer.root, "src/SynWare/Probe.app/Contents/index.tsx");
    writeFileSync(entry, readFileSync(entry, "utf8").replace('return "before HMR"', 'return "after HMR"'));
    await page.waitForFunction(() => (globalThis as any).__devAttribution?.version?.() === "after HMR");
    const updatedBootToken = await page.evaluate(() => (globalThis as any).__devAttribution.bootToken);
    if (updatedBootToken !== initial.bootToken) {
      const servedModule = await (await page.request.get(server.url + "src/SynWare/Probe.app/Contents/index.tsx")).text();
      writeFileSync(resolve("docs/superpowers/evidence/2026-11-08-fx-fidelity/dev-binding-hmr-module.log"), servedModule);
      writeFileSync(resolve("docs/superpowers/evidence/2026-11-08-fx-fidelity/dev-binding-hmr-diagnostic.json"), JSON.stringify({ before: initial.bootToken, after: updatedBootToken, registersHotModule: servedModule.includes("registerApplicationHotModule"), hmrFrames, browserConsole, serverLog }, null, 2) + "\n");
    }
    expect(updatedBootToken).toBe(initial.bootToken);
    expect(await page.evaluate(() => (globalThis as any).__devAttribution.check())).toEqual({ ...initial.first, version: "after HMR" });
    expect(await page.evaluate(() => (globalThis as any).__devAttribution.dispose())).toBe(true);
    expect(pageErrors).toEqual([]);
    verifyInstalledSdkResources(consumer.installed, consumer.manifest);
    writeFileSync(resolve("docs/superpowers/evidence/2026-11-08-fx-fidelity/dev-binding-installed.json"), JSON.stringify({
      archiveSha256: consumer.archiveSha256, sourceSha256: consumer.sourceSha256, resourcesSha256: consumer.resourcesSha256, integrity: consumer.integrity,
      installedOutsideRepository: true, linked: false, browser: "chromium", realDevServer: true, optimizerEnabled: true, strictInstalledTypes: true, explicitHostSDKIncludesSanitised: true,
      unrelatedReactOptimized: true, reactDomOptimized: true, sdkOptimized: false, awaitTimerCallbackCases: 3, sharedBaseIdentity: true, sharedContext: true,
      hmrLiveMethodUpdate: true, hmrPreservedPageAndApplication: true, terminalSession: true, resourceIntegrityAfterProof: true, devServerLog: serverLog,
    }, null, 2) + "\n");
  } finally {
    await browser?.close();
    await new Promise<void>(resolve => {
      if (child.exitCode !== null) return resolve();
      const timeout = setTimeout(() => child.kill(), 10_000);
      child.once("exit", () => { clearTimeout(timeout); resolve(); });
      child.send("close");
    });
  }
}, 180_000);
