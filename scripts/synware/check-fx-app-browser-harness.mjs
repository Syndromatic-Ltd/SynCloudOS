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
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "playwright";
import { assertIndependentModules, createInstalledConsumer, isWithin, runNode } from "./installed-consumer.mjs";
import { assertSdkSourceUnchanged, captureSdkSourceFingerprint } from "./sdk-package-manifest.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

const MIME_TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
});

/** Normalizes a Vite base path so both "/" and "/nested/product/" work consistently. */
export function normalizeBase(base = "/") {
  const trimmed = String(base ?? "/").trim();
  if (!trimmed || trimmed === "/") return "/";
  const withLeading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

/** Parses --base and --keep flags used by browser acceptance consumer runners. */
export function parseConsumerArgs(args = process.argv.slice(2)) {
  const baseIndex = args.indexOf("--base");
  const rawBase = baseIndex >= 0 ? args[baseIndex + 1] : "/";
  assert(baseIndex < 0 || Boolean(rawBase && !rawBase.startsWith("--")), "Expected a value after --base.");
  return {
    base: normalizeBase(rawBase),
    keep: args.includes("--keep"),
  };
}

function writeRelative(root, path, contents) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

/** Serves a Vite dist directory scoped to its configured base path on an ephemeral loopback port. */
export function startRelocatedStaticServer(directory, base = "/") {
  const normalizedBase = normalizeBase(base);
  const stripPrefix = normalizedBase === "/" ? "" : normalizedBase.slice(0, -1);
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
    let relativePath = pathname;
    if (stripPrefix) {
      if (pathname === stripPrefix) {
        response.writeHead(302, { Location: normalizedBase }).end();
        return;
      }
      if (!pathname.startsWith(normalizedBase)) {
        response.writeHead(404).end("Not found");
        return;
      }
      relativePath = pathname.slice(stripPrefix.length) || "/";
    }
    const target = resolve(directory, "." + (relativePath === "/" ? "/index.html" : relativePath));
    if (!isWithin(directory, target)) {
      response.writeHead(403).end();
      return;
    }
    if (!existsSync(target)) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Content-Type", MIME_TYPES[extname(target)] ?? "application/octet-stream");
    response.end(readFileSync(target));
  });
  return new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert(address && typeof address === "object", "Static server must bind an ephemeral loopback port.");
      accept({
        server,
        url: `http://127.0.0.1:${address.port}${normalizedBase}`,
      });
    });
  });
}

/**
 * Installs the packed SDK into an isolated temp consumer, compiles it with Vite + synCloudOS(),
 * typechecks with strict tsc, and verifies the probe across Chromium, Firefox, and WebKit.
 */
export async function runInstalledAppBrowserCheck({
  prefix,
  receiptFileName,
  base = "/",
  keep = false,
  files,
  verifyPage,
}) {
  const normalizedBase = normalizeBase(base);
  const consumer = createInstalledConsumer(repositoryRoot, prefix);
  const output = resolve(repositoryRoot, ".artifacts/synapp-sdk", receiptFileName);
  const archiveSha256 = createHash("sha256").update(readFileSync(consumer.archive)).digest("hex");
  const evidence = {
    archiveSha256,
    integrity: consumer.integrity,
    commit: consumer.manifest.commit,
    sourceSha256: consumer.sourceSha256,
    resourcesSha256: consumer.resourcesSha256,
    base: normalizedBase,
    installedOutsideRepository: true,
    typecheck: false,
    packageGraph: null,
    browsers: null,
    passed: false,
  };
  let hosted;
  try {
    writeRelative(consumer.root, "tsconfig.json", JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        jsx: "react-jsx",
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        strict: true,
        skipLibCheck: false,
        noEmit: true,
        types: ["vite/client"],
      },
      include: ["src"],
    }, null, 2));
    writeRelative(
      consumer.root,
      "index.html",
      '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n',
    );
    writeRelative(
      consumer.root,
      "vite.config.mjs",
      `import { writeFileSync } from "node:fs";
import { synCloudOS } from "@syndromatic/syncloudos/vite";

export default {
  base: ${JSON.stringify(normalizedBase)},
  plugins: [
    synCloudOS({ webspringEntry: false }),
    {
      name: "record-installed-fx-inputs",
      generateBundle() {
        writeFileSync("resolved-modules.json", JSON.stringify([...this.getModuleIds()].sort(), null, 2));
      },
    },
  ],
  build: { sourcemap: false },
};
`,
    );
    for (const [relativePath, contents] of Object.entries(files)) {
      writeRelative(consumer.root, relativePath, contents);
    }

    runNode([join(consumer.root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], consumer.root, {
      log: join(consumer.root, "typecheck.log"),
    });
    evidence.typecheck = true;

    runNode([join(consumer.root, "node_modules/vite/bin/vite.js"), "build"], consumer.root, {
      log: join(consumer.root, "build.log"),
    });
    const moduleIds = JSON.parse(readFileSync(join(consumer.root, "resolved-modules.json"), "utf8"));
    const consumerAppsRoot = realpathSync.native(resolve(consumer.root, "src/SynWare"));
    const nonAppModuleIds = moduleIds.filter(id => {
      if (id.startsWith("\0")) return true;
      const cleanPath = id.split("?", 1)[0];
      const resolved = existsSync(cleanPath) ? realpathSync.native(cleanPath) : resolve(cleanPath);
      return !isWithin(consumerAppsRoot, resolved);
    });
    assertIndependentModules(consumer.root, nonAppModuleIds);
    evidence.packageGraph = { modules: moduleIds.length, allResolvedInsideInstallation: true };

    hosted = await startRelocatedStaticServer(join(consumer.root, "dist"), normalizedBase);
    const browsers = {};
    for (const [engine, browserType] of [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]]) {
      const browser = await browserType.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const pageErrors = [];
        const failedRequests = [];
        const consoleErrors = [];
        page.on("pageerror", error => pageErrors.push(error.message));
        page.on("console", message => {
          if (message.type() === "error") consoleErrors.push(message.text());
        });
        page.on("response", response => {
          if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`);
        });
        await page.goto(hosted.url);
        const engineResult = await verifyPage({ engine, page, pageErrors, failedRequests, consoleErrors, base: normalizedBase });
        assert.deepEqual(pageErrors, [], `${engine} reported pageerrors: ${JSON.stringify(pageErrors)}`);
        const criticalFailures = failedRequests.filter(entry => /\.(?:js|mjs|wasm)(?:\?|$)/u.test(entry));
        assert.deepEqual(criticalFailures, [], `${engine} failed module/worker/wasm loads: ${JSON.stringify(criticalFailures)}`);
        browsers[engine] = { ...engineResult, pageErrors, failedRequests, consoleErrors };
      } finally {
        await browser.close();
      }
    }
    evidence.browsers = browsers;
    assertSdkSourceUnchanged(consumer.manifest.source, captureSdkSourceFingerprint(repositoryRoot));
    evidence.passed = true;
  } catch (error) {
    evidence.error = error instanceof Error ? error.stack ?? error.message : String(error);
    evidence.retainedConsumer = consumer.root;
    throw error;
  } finally {
    if (hosted) await new Promise(accept => hosted.server.close(accept));
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n");
    if (evidence.passed && !keep) rmSync(consumer.root, { recursive: true, force: true });
  }
  return evidence;
}
