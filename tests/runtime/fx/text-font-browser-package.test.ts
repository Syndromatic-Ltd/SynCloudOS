/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { build, createLogger } from "vite";
import type { RollupOutput } from "rollup";
import { expect, it } from "vitest";
import { sdkBrowserDependencies } from "../../../scripts/synware/sdk-browser-dependencies.mjs";

it("packages TextFX without a Node HarfBuzz import or browser compatibility warning", async () => {
  const root = process.cwd();
  const artifacts = resolve(root, ".artifacts");
  mkdirSync(artifacts, { recursive: true });
  const directory = mkdtempSync(resolve(artifacts, "textfx-browser-package-"));
  const warnings: string[] = [];
  const logger = createLogger("silent");
  logger.warn = message => { warnings.push(message); };
  const dependencies = sdkBrowserDependencies(root);
  try {
    const packaged = await build({
      configFile: false, publicDir: false, customLogger: logger,
      resolve: { alias: dependencies.aliases },
      build: {
        outDir: directory, minify: false, target: "esnext", copyPublicDir: false,
        lib: { entry: resolve(root, "src/FX/TextFX/TFXFont.ts"), formats: ["es"], fileName: "textfx" },
        rollupOptions: { external: dependencies.external },
      },
    }) as RollupOutput | RollupOutput[];
    const packageChunks = (Array.isArray(packaged) ? packaged : [packaged]).flatMap(result => result.output).filter(output => output.type === "chunk");
    expect(packageChunks.flatMap(chunk => [...chunk.imports, ...chunk.dynamicImports])).not.toContain("harfbuzzjs");
    expect(packageChunks.some(chunk => chunk.code.includes('import("module")'))).toBe(false);
    const consumed = await build({
      configFile: false, publicDir: false, customLogger: logger,
      build: {
        write: false, minify: false, target: "esnext",
        lib: { entry: resolve(directory, "textfx.js"), formats: ["es"] },
      },
    }) as RollupOutput | RollupOutput[];
    expect((Array.isArray(consumed) ? consumed : [consumed]).flatMap(result => result.output).some(output => output.type === "chunk" && output.code.includes("WebAssembly"))).toBe(true);
    expect(warnings.filter(message => /externalized for browser compatibility|browser-external|Node\.js built-in/u.test(message))).toEqual([]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}, 60_000);
