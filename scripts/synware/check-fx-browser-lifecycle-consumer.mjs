#!/usr/bin/env node
/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "playwright";
import { assertIndependentModules, createInstalledConsumer, isWithin, runNode } from "./installed-consumer.mjs";
import { assertSdkSourceUnchanged, captureSdkSourceFingerprint } from "./sdk-package-manifest.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const output = resolve(repositoryRoot, ".artifacts/synapp-sdk/fx-browser-lifecycle-consumer.json");

const BROWSER_LIFECYCLE_FAMILIES = Object.freeze(["animation", "haptics", "motion", "midi", "location"]);

function write(root, path, contents) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function parseBase(args) {
  const inline = args.find(argument => argument.startsWith("--base="));
  const index = args.indexOf("--base");
  const base = inline ? inline.slice(7) : index >= 0 ? args[index + 1] : "/nested/product/";
  assert(typeof base === "string" && base.startsWith("/") && base.endsWith("/"), "--base must be an absolute URL path ending in /.");
  return base;
}

function staticServer(directory, base) {
  const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".wasm": "application/wasm" };
  const server = createServer((request, response) => {
    const requested = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (!requested.startsWith(base)) { response.writeHead(404).end(); return; }
    const relative = requested.slice(base.length);
    const path = resolve(directory, relative === "" ? "index.html" : relative);
    if (!isWithin(directory, path)) { response.writeHead(403).end(); return; }
    if (!existsSync(path)) { response.writeHead(404).end(); return; }
    response.setHeader("Content-Type", mime[extname(path)] ?? "application/octet-stream");
    response.end(readFileSync(path));
  });
  return new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const origin = `http://127.0.0.1:${server.address().port}`;
      accept({ server, origin, url: origin + base });
    });
  });
}

const installedBrowserLifecycleProbeSource = `import { useEffect, useRef, useState } from "react";
import { mountSynCloudOS } from "@syndromatic/syncloudos/browser";
import {
  createSynWare,
  useSynWareAnimations,
  useSynWareHaptics,
  useSynWareLocation,
  useSynWareMIDI,
  useSynWareMotion,
} from "@syndromatic/syncloudos/sdk";
import { defineWebspring, type WebspringViewProps } from "@syndromatic/syncloudos/webspring";

declare global { interface Window { installedFxLifecycle: any; } }
window.installedFxLifecycle = { hostReady: false, probeReady: false, interactionDone: false, unmounted: false, afterUnmountReady: false };

function LifecycleProbe() {
  const animations = useSynWareAnimations();
  const haptics = useSynWareHaptics();
  const motion = useSynWareMotion();
  const midi = useSynWareMIDI();
  const location = useSynWareLocation();
  const targetRef = useRef<HTMLDivElement>(null);
  const compositorRef = useRef<HTMLDivElement>(null);
  const watchRef = useRef<{ dispose(): void } | null>(null);

  useEffect(() => {
    const state = window.installedFxLifecycle;
    const target = targetRef.current;
    if (!target) throw new Error("Missing installed animation target.");
    const compositorTarget = compositorRef.current;
    if (!compositorTarget) throw new Error("Missing installed compositor layer target.");
    target.style.opacity = "0.33";
    state.animationTarget = target;
    state.passive = {
      haptics: haptics.capabilities,
      motion: motion.capabilities,
      midi: midi.getCapabilities(),
    };
    const layer = animations.bindLayer(target);
    layer.opacity = 0.4;
    const compositorLayer = animations.bindLayer(compositorTarget);
    compositorLayer.actions = { opacity: { duration: 120, timing: "linear" } };
    compositorLayer.opacity = 0;
    state.compositor = {
      nativeAnimations: compositorTarget.getAnimations().length,
      model: compositorLayer.model.opacity,
      presentation: compositorLayer.presentation.opacity,
    };
    const owner = animations.acquireOwner("installed-browser-lifecycle");
    const short = animations.animate(target, {
      animations: [{ targetId: "installed-animation-target", keyPath: "opacity", from: 0.4, to: 0.8 }],
      duration: 0.08,
    }, owner);
    let long: ReturnType<typeof animations.animate> | null = null;
    void short.finished.then((settlement) => {
      state.animationShort = settlement;
      state.animationOpacityAfterShort = target.style.opacity;
      long = animations.animate(target, {
        animations: [{ targetId: "installed-animation-target", keyPath: "opacity", from: 0.8, to: 0.1 }],
        duration: 120,
        reducedMotion: "never",
      }, owner);
      void long.finished.then((next) => { state.animationLong = next; });
      state.probeReady = true;
    }).catch(error => { state.error = error instanceof Error ? error.stack ?? error.message : String(error); });
    return () => {
      watchRef.current?.dispose();
      watchRef.current = null;
      long?.cancel("component unmounted");
      owner.dispose();
      layer.dispose();
      compositorLayer.dispose();
      state.compositorAfterUnmount = compositorTarget.getAnimations().length;
      state.animationOpacityAfterUnmount = target.style.opacity;
      state.afterUnmount = {
        haptics: haptics.capabilities,
        motion: motion.capabilities,
        midi: midi.getCapabilities(),
      };
      state.unmounted = true;
      void location.getAuthorizationStatus().then((status) => {
        state.afterUnmount.location = status;
        state.afterUnmountReady = true;
      });
    };
  }, [animations, haptics, location, midi, motion]);

  async function requestCapabilities() {
    const state = window.installedFxLifecycle;
    const interaction: any = {};
    try {
      interaction.haptics = haptics.isSupported ? await haptics.trigger("selection", { audio: false }).then(() => "triggered") : "unavailable";
    } catch (error) { interaction.haptics = error instanceof Error ? error.name : String(error); }
    try { interaction.motion = await motion.requestAuthorization(); }
    catch (error) { interaction.motion = error instanceof Error ? error.name : String(error); }
    try { interaction.midi = await midi.requestAuthorization({ sysex: false }); }
    catch (error) { interaction.midi = { state: error instanceof Error ? error.name : String(error), sysex: false }; }
    try {
      interaction.locationStatus = await location.getAuthorizationStatus();
      const fix = await location.current({ accuracy: "high", timeoutSeconds: 5 });
      interaction.location = {
        latitude: fix.coordinate.latitude,
        longitude: fix.coordinate.longitude,
        accuracy: fix.horizontalAccuracyMetres,
      };
      watchRef.current = location.watch({ accuracy: "high" }, (value) => {
        state.locationWatch = { latitude: value.coordinate.latitude, longitude: value.coordinate.longitude };
      });
    } catch (error) {
      interaction.location = { error: error instanceof Error ? error.name : String(error) };
    }
    state.interaction = interaction;
    state.interactionDone = true;
  }

  return <section id="installed-lifecycle-probe" style={{ position: "relative", paddingTop: 48 }}>
    <div id="installed-animation-target" ref={targetRef}>Animation target</div>
    <div id="installed-compositor-target" ref={compositorRef}>Compositor target</div>
    <button id="request-capabilities" onClick={() => { void requestCapabilities(); }}>Request capabilities</button>
  </section>;
}

function Probe() {
  const [mounted, setMounted] = useState(true);
  useEffect(() => { window.installedFxLifecycle.unmount = () => setMounted(false); }, []);
  return mounted ? <LifecycleProbe /> : <p id="installed-probe-unmounted">Unmounted</p>;
}

function Website({ actions, applicationOutlet }: WebspringViewProps) {
  useEffect(() => { window.installedFxLifecycle.open = () => actions.openApp("org.example.fx-browser-lifecycle"); }, [actions]);
  async function openProbe() {
    window.installedFxLifecycle.openDone = false;
    window.installedFxLifecycle.openResult = await actions.openApp("org.example.fx-browser-lifecycle");
    window.installedFxLifecycle.openDone = true;
  }
  return <main><button id="open-probe" onClick={() => { void openProbe(); }}>Open probe</button>{applicationOutlet}</main>;
}

const shell = defineWebspring({
  manifest: {
    schemaVersion: 1, id: "org.example.fx-browser-shell", version: "1.0.0", title: "FX Browser Shell",
    webspringShell: {
      views: [{ id: "website", presentations: ["desktop", "tablet", "mobile"], mode: "persistent" }],
      defaults: { desktop: "website", tablet: "website", mobile: "website" },
      homeRoute: "/", branding: { name: { key: "brand", fallback: "Installed FX Browser" } },
    },
  },
  components: { website: Website },
});

const app = createSynWare({
  manifest: {
    schemaVersion: 1,
    id: "org.example.fx-browser-lifecycle",
    version: "1.0.0",
    title: "Installed FX Browser Lifecycle",
    runtime: { policy: { public: true } },
    presentations: ["desktop", "tablet", "mobile"],
    routes: [{ path: "/fx-browser-lifecycle", primary: true }],
    permissions: ["haptics.play", "motion.read", "motion.requestAuthorization", "midi.access", "location.read", "location.request"],
    webspring: { visible: true, order: 1 },
  },
  root: Probe,
});

const element = document.getElementById("root");
if (!element) throw new Error("Missing installed FX browser root.");
mountSynCloudOS({
  element,
  bundles: [app],
  shell,
  authentication: "disabled",
  deploymentBasePath: __SYNCLOUDOS_DEPLOYMENT_BASE_PATH__,
}).then(host => {
  window.installedFxLifecycle.hostReady = true;
  window.installedFxLifecycle.dispose = () => host.dispose("installed FX browser verification");
}).catch(error => { window.installedFxLifecycle.error = error instanceof Error ? error.stack ?? error.message : String(error); });
`;

async function runBrowser(browserName, browserType, hosted, evidence) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ geolocation: { latitude: 53.483, longitude: -2.244 } });
  try {
    await context.grantPermissions(["geolocation"], { origin: hosted.origin });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    const pageErrors = [];
    const failedRequests = [];
    const requests = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("request", request => requests.push(request.url()));
    page.on("response", response => { if (response.status() >= 400) failedRequests.push({ status: response.status(), url: response.url() }); });
    await page.goto(hosted.url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.installedFxLifecycle?.hostReady || window.installedFxLifecycle?.error);
    assert.equal(await page.evaluate(() => window.installedFxLifecycle.error ?? null), null);
    await page.locator("#open-probe").click();
    await page.waitForFunction(() => window.installedFxLifecycle?.probeReady || window.installedFxLifecycle?.error);
    await page.waitForFunction(() => window.installedFxLifecycle?.openDone || window.installedFxLifecycle?.error);
    assert.equal(await page.evaluate(() => window.installedFxLifecycle.error ?? null), null);
    assert.equal(await page.evaluate(() => window.installedFxLifecycle.openResult?.status), "completed");
    const initial = await page.evaluate(() => ({
      passive: window.installedFxLifecycle.passive,
      animationShort: window.installedFxLifecycle.animationShort,
      animationOpacityAfterShort: window.installedFxLifecycle.animationOpacityAfterShort,
      compositor: window.installedFxLifecycle.compositor,
    }));
    assert.equal(initial.animationShort?.state, "completed");
    assert.equal(initial.compositor?.nativeAnimations, 1);
    assert.equal(initial.compositor?.model, 0);
    assert(initial.compositor?.presentation > 0 && initial.compositor?.presentation <= 1);
    assert(["available", "unavailable"].includes(initial.passive.haptics.state));
    assert.equal(typeof initial.passive.midi.apiAvailable, "boolean");
    assert(Object.values(initial.passive.motion).every(capability => typeof capability.state === "string"));

    await page.locator("#request-capabilities").click();
    await page.waitForFunction(() => window.installedFxLifecycle?.interactionDone);
    const interaction = await page.evaluate(() => window.installedFxLifecycle.interaction);
    assert(["triggered", "unavailable", "NotAllowedError", "SecurityError"].includes(interaction.haptics));
    assert(["available", "permission-required", "denied", "unavailable", "suspended"].includes(interaction.motion));
    assert(interaction.midi && typeof interaction.midi.state === "string");
    assert(typeof interaction.locationStatus === "string");
    if (!("error" in interaction.location)) {
      assert(Math.abs(interaction.location.latitude - 53.483) < 0.01);
      assert(Math.abs(interaction.location.longitude + 2.244) < 0.01);
    } else {
      assert(["NotAllowedError", "NotSupportedError", "SecurityError", "TimeoutError"].includes(interaction.location.error));
    }

    await page.evaluate(() => window.installedFxLifecycle.unmount());
    await page.waitForFunction(() => window.installedFxLifecycle?.afterUnmountReady);
    await page.waitForFunction(() => Boolean(window.installedFxLifecycle?.animationLong));
    const afterUnmount = await page.evaluate(() => ({
      state: window.installedFxLifecycle.afterUnmount,
      animationLong: window.installedFxLifecycle.animationLong,
      animationOpacityAfterUnmount: window.installedFxLifecycle.animationOpacityAfterUnmount,
      compositorAfterUnmount: window.installedFxLifecycle.compositorAfterUnmount,
      unmounted: window.installedFxLifecycle.unmounted,
    }));
    assert.equal(afterUnmount.unmounted, true);
    assert.equal(afterUnmount.animationLong?.state, "cancelled");
    assert.equal(afterUnmount.animationOpacityAfterUnmount, "0.33");
    assert.equal(afterUnmount.compositorAfterUnmount, 0);
    assert.equal(afterUnmount.state.haptics.state, "unavailable");
    assert(Object.values(afterUnmount.state.motion).every(capability => capability.state === "unavailable"));
    assert.equal(afterUnmount.state.midi.authorization, "unavailable");
    assert.equal(afterUnmount.state.location, "unavailable");
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(failedRequests, []);
    await page.evaluate(() => window.installedFxLifecycle.dispose());
    evidence.browsers[browserName] = {
      version: browser.version(),
      initial,
      interaction,
      afterUnmount,
      pageErrors,
      failedRequests,
      assetRequests: requests.filter(url => /\/assets\//u.test(url)).length,
      passed: true,
    };
    await page.close();
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
  const base = parseBase(process.argv.slice(2));
  const consumer = createInstalledConsumer(repositoryRoot, "synware-fx-browser-lifecycle-");
  const evidence = {
    schemaVersion: 1,
    kind: "installed-fx-browser-lifecycle",
    families: BROWSER_LIFECYCLE_FAMILIES,
    base,
    commit: consumer.manifest.commit,
    archiveSha256: consumer.archiveSha256,
    integrity: consumer.integrity,
    sourceSha256: consumer.sourceSha256,
    resourcesSha256: consumer.resourcesSha256,
    installedOutsideRepository: true,
    typecheck: false,
    packageGraph: null,
    relocatedOutput: false,
    browsers: {},
    passed: false,
  };
  let hosted;
  try {
    write(consumer.root, "tsconfig.json", JSON.stringify({
      compilerOptions: {
        target: "ES2022", module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx",
        lib: ["ES2022", "DOM", "DOM.Iterable"], strict: true, skipLibCheck: false,
        noEmit: true, types: ["vite/client"],
      },
      include: ["src"],
    }));
    write(
      consumer.root,
      "src/main.tsx",
      installedBrowserLifecycleProbeSource.replace(
        "__SYNCLOUDOS_DEPLOYMENT_BASE_PATH__",
        JSON.stringify(base),
      ),
    );
    write(consumer.root, "index.html", '<!doctype html><html><head><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>');
    write(consumer.root, "vite.config.mjs", 'import { writeFileSync } from "node:fs"; export default { plugins: [{ name: "record-installed-fx-inputs", generateBundle() { writeFileSync("resolved-modules.json", JSON.stringify([...this.getModuleIds()].sort(), null, 2)); } }], build: { sourcemap: false } };');
    runNode([join(consumer.root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], consumer.root, { log: join(consumer.root, "typecheck.log") });
    evidence.typecheck = true;
    runNode([join(consumer.root, "node_modules/vite/bin/vite.js"), "build", "--base", base], consumer.root, { log: join(consumer.root, "build.log") });
    const moduleIds = JSON.parse(readFileSync(join(consumer.root, "resolved-modules.json"), "utf8"));
    assertIndependentModules(consumer.root, moduleIds);
    evidence.packageGraph = { modules: moduleIds.length, allResolvedInsideInstallation: true };

    const relocated = join(consumer.root, "relocated/browser-bundle");
    cpSync(join(consumer.root, "dist"), relocated, { recursive: true });
    rmSync(join(consumer.root, "dist"), { recursive: true, force: true });
    evidence.relocatedOutput = true;
    hosted = await staticServer(relocated, base);
    for (const [browserName, browserType] of Object.entries({ chromium, firefox, webkit })) {
      await runBrowser(browserName, browserType, hosted, evidence);
    }
    assertSdkSourceUnchanged(consumer.manifest.source, captureSdkSourceFingerprint(repositoryRoot));
    evidence.passed = true;
    process.stdout.write(`Installed FX browser lifecycle passed for ${BROWSER_LIFECYCLE_FAMILIES.join(", ")} across Chromium, Firefox and WebKit.\n`);
  } catch (error) {
    evidence.error = error instanceof Error ? error.stack : String(error);
    evidence.retainedConsumer = consumer.root;
    throw error;
  } finally {
    if (hosted) {
      hosted.server.closeAllConnections?.();
      await new Promise(accept => hosted.server.close(accept));
    }
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n");
    if (evidence.passed && !process.argv.includes("--keep")) rmSync(consumer.root, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
