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

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const vendorRoot = "src/FX/TextFX/vendor";
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

describe("TextFX browser HarfBuzz backend provenance", () => {
  it("pins the maintained browser wrapper to the installed 1.6.1 source and license", () => {
    const provenance = JSON.parse(readFileSync(`${vendorRoot}/provenance.json`, "utf8"));
    const packageManifest = JSON.parse(readFileSync("node_modules/harfbuzzjs/package.json", "utf8"));
    const installedIndex = readFileSync("node_modules/harfbuzzjs/dist/index.mjs", "utf8");
    const installedEmscripten = readFileSync("node_modules/harfbuzzjs/dist/harfbuzz.js");
    const installedWasm = readFileSync("node_modules/harfbuzzjs/dist/harfbuzz.wasm");
    const installedLicense = readFileSync("node_modules/harfbuzzjs/LICENSE");
    const browserRuntime = readFileSync(`${vendorRoot}/harfbuzzRuntime.mjs`, "utf8");
    const browserEmscripten = readFileSync(`${vendorRoot}/harfbuzzEmscripten.mjs`);
    const browserLicense = readFileSync(`${vendorRoot}/LICENSE.harfbuzzjs`);

    const expectedBrowserEmscripten = installedEmscripten
      .toString("utf8")
      .replace(
        'var ENVIRONMENT_IS_NODE=typeof process=="object"&&process.versions?.node&&process.type!="renderer";if(ENVIRONMENT_IS_NODE){const{createRequire}=await import("module");var require=createRequire(import.meta.url)}',
        "var ENVIRONMENT_IS_NODE=false;",
      )
      .replace(
        'function findWasmBinary(){if(Module["locateFile"]){return locateFile("harfbuzz.wasm")}return new URL("harfbuzz.wasm",import.meta.url).href}',
        'function findWasmBinary(){return locateFile("harfbuzz.wasm")}',
      );

    const expectedRuntime = installedIndex
      .replace(
        'import createHarfBuzz from "./harfbuzz.js";',
        'import createHarfBuzz from "./harfbuzzEmscripten.mjs";\nimport harfbuzzWasmUrl from "harfbuzzjs/dist/harfbuzz.wasm?url";',
      )
      .replace(
        "init(await createHarfBuzz());",
        'init(await createHarfBuzz({ locateFile: (path) => path === "harfbuzz.wasm" ? harfbuzzWasmUrl : path }));',
      );

    expect(packageManifest.version).toBe("1.6.1");
    expect(provenance).toMatchObject({ package: "harfbuzzjs", version: "1.6.1", license: "MIT" });
    expect(browserRuntime).toBe(expectedRuntime);
    expect(browserEmscripten.toString("utf8")).toBe(expectedBrowserEmscripten);
    expect(browserLicense).toEqual(installedLicense);
    expect(digest(installedIndex)).toBe(provenance.installedIndexSha256);
    expect(digest(installedEmscripten)).toBe(provenance.installedEmscriptenSha256);
    expect(digest(installedWasm)).toBe(provenance.installedWasmSha256);
    expect(digest(browserRuntime)).toBe(provenance.browserRuntimeSha256);
    expect(digest(browserEmscripten)).toBe(provenance.browserEmscriptenSha256);
    expect(digest(browserLicense)).toBe(provenance.licenseSha256);
    expect(browserRuntime).not.toMatch(/[A-Za-z]:\\|\/Users\/|\/home\//u);
    expect(browserEmscripten.toString("utf8")).not.toContain('import("module")');
    expect(browserEmscripten.toString("utf8")).not.toContain('new URL("harfbuzz.wasm",import.meta.url)');
  });
});
