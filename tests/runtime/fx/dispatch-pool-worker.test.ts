/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { createServer as createNetServer } from "node:net";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { expect, it } from "vitest";

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

it("runs WorkerPool against a real Chromium module worker chunk", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dfx-pool-chromium-")));
  const requestedPort = await getFreePort();
  const server = await createServer({
    configFile: false,
    root,
    server: { host: "127.0.0.1", port: requestedPort, strictPort: true, fs: { strict: false } },
    resolve: {
      alias: {
        "@dfx-pool": resolve("src/FX/DispatchFX/internal/pool"),
      },
    },
    optimizeDeps: { noDiscovery: true, include: [] },
    logLevel: "silent",
  });

  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    writeFileSync(
      join(root, "chunk.js"),
      `export const __dfxClosures = {
        sumAndDouble(a, b) {
          return [(a + b) * 2];
        },
        failCase() {
          throw new TypeError("boom in worker");
        },
      };\n`,
    );
    writeFileSync(
      join(root, "index.html"),
      `<!doctype html><html><body><script type="module" src="/main.js"></script></body></html>`,
    );
    writeFileSync(
      join(root, "main.js"),
      `import { WorkerPool } from "@dfx-pool/WorkerPool.ts";

      (async () => {
        try {
          const pool = new WorkerPool({ cores: 2 });
          const chunkURL = new URL("/chunk.js", import.meta.url).href;

          const value = await new Promise((resolvePromise, rejectPromise) => {
            pool.submit({
              appId: "com.example.smoke",
              closureId: "sumAndDouble",
              chunkURL,
              captures: [10, 11],
              qos: { qosClass: "userInitiated", relativePriority: 0 },
              queueKey: null,
              onResult: (values) => resolvePromise(values),
              onError: (err) => rejectPromise(err),
            });
          });

          const workerError = await new Promise((resolvePromise) => {
            pool.submit({
              appId: "com.example.smoke",
              closureId: "failCase",
              chunkURL,
              captures: [],
              qos: { qosClass: "default", relativePriority: 0 },
              queueKey: null,
              onResult: () => resolvePromise(null),
              onError: (err) => resolvePromise({ name: err.name, message: err.message, hasStack: Boolean(err.stack) }),
            });
          });

          globalThis.__poolSmoke = { value, workerError };
        } catch (error) {
          globalThis.__poolSmoke = { fatal: error instanceof Error ? error.stack ?? error.message : String(error) };
        }
      })();
      `,
    );

    await server.listen();
    const address = server.httpServer?.address();
    const port = typeof address === "object" && address ? address.port : 0;
    expect(port).toBeGreaterThan(0);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    const consoleMessages: string[] = [];
    const responses: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("requestfailed", req => failedRequests.push(`${req.url()}: ${req.failure()?.errorText}`));
    page.on("response", res => { if (res.status() >= 400) responses.push(`${res.status()} ${res.url()}`); });
    page.on("console", msg => consoleMessages.push(`${msg.type()}: ${msg.text()}`));

    await page.goto(`http://127.0.0.1:${port}/`);
    try {
      await page.waitForFunction(() => Boolean((globalThis as { __poolSmoke?: unknown }).__poolSmoke), undefined, { timeout: 6_000 });
    } catch (waitError) {
      throw new Error(`Timed out: ${String(waitError)}\npageErrors=${JSON.stringify(pageErrors)}\nfailedRequests=${JSON.stringify(failedRequests)}\nresponses=${JSON.stringify(responses)}\nconsole=${JSON.stringify(consoleMessages)}`);
    }
    const result = await page.evaluate(() => (globalThis as { __poolSmoke?: unknown }).__poolSmoke);

    expect({ pageErrors, failedRequests, consoleMessages: consoleMessages.filter(m => m.startsWith("error:")) }).toEqual({
      pageErrors: [],
      failedRequests: [],
      consoleMessages: [],
    });
    expect(result).toEqual({
      value: [42],
      workerError: { name: "TypeError", message: "boom in worker", hasStack: true },
    });
  } finally {
    await browser?.close();
    await server.close();
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);
