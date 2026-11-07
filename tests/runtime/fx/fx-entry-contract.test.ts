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

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { synWareSdkEntries } from "../../../scripts/synware/sdk-entries.mjs";
import * as contract from "../../../scripts/synware/sdk-package-manifest.mjs";

// Intentionally independent of the entry generator: omission cannot shrink both sides.
const families = ["animation", "graphics", "image", "text", "audio", "haptics", "motion", "media", "video", "midi", "location", "lumina", "compression"].sort();

describe("literal thirteen-family package contract", () => {
  it("has exactly thirteen portable roots", () => {
    expect(Object.keys(synWareSdkEntries).filter(key => /^fx\/[^/]+$/u.test(key)).map(key => key.slice(3)).sort()).toEqual(families);
    expect(synWareSdkEntries["fx/video/webm"]).toBe("src/FX/VideoFX/webm.ts");
    for (const family of families) expect(existsSync(resolve(synWareSdkEntries[`fx/${family}`]))).toBe(true);
  });

  it("allows only reviewed Foundation and CompressionFX package artifacts", () => {
    expect(() => contract.assertReviewedPackageFiles(["foundation.js", "foundation.d.ts", "fx/compression.js", "fx/compression.d.ts"])).not.toThrow();
    for (const file of ["foundation.css", "fx/compression.css", "foundation/private.js"]) expect(() => contract.assertReviewedPackageFiles([file])).toThrow();
    expect(synWareSdkEntries.foundation).toBe("src/Foundation/public.ts");
  });

  it.each(["tsconfig.app.json", "tsconfig.synware.json"])("resolves every exact public alias in %s", path => {
    const config = ts.parseJsonConfigFileContent(ts.readConfigFile(path, ts.sys.readFile).config, ts.sys, process.cwd());
    for (const family of families) {
      const specifier = `@syndromatic/syncloudos/fx/${family}`;
      expect(config.options.paths?.[specifier], specifier).toHaveLength(1);
      const actual = ts.resolveModuleName(specifier, resolve("src/package-contract-consumer.ts"), config.options, ts.sys).resolvedModule;
      expect(actual?.resolvedFileName.replaceAll("\\", "/"), specifier).toBe(resolve(synWareSdkEntries[`fx/${family}`]).replaceAll("\\", "/"));
    }
  });

  it("rejects a missing family, an invented family, and a private package route, but accepts only the SynCloudOS root entry", () => {
    expect(contract.assertFxPackageExports).toBeTypeOf("function");
    const exports = Object.fromEntries(families.map(family => [`./fx/${family}`, { import: `./fx/${family}.js`, types: `./fx/${family}.d.ts` }]));
    exports["./fx/video/webm"] = { import: "./fx/video/webm.js", types: "./fx/video/webm.d.ts" };
    expect(() => contract.assertFxPackageExports(exports)).not.toThrow();
    const { "./fx/lumina": _omitted, ...missing } = exports;
    expect(() => contract.assertFxPackageExports(missing)).toThrow(/thirteen|lumina/i);
    for (const key of ["./fx/private", "./types/internal", "./src/runtime", "./sdk/internal/runtime", "./*"]) {
      expect(() => contract.assertFxPackageExports({ ...exports, [key]: "./host.js" }), key).toThrow();
    }
    expect(() => contract.assertFxPackageExports({ ...exports, "./fx/media": { import: "../host.js", types: "./fx/media.d.ts" } })).toThrow();
    const root = { import: "./index.js", types: "./index.d.ts" };
    expect(() => contract.assertFxPackageExports({ ...exports, ".": root })).not.toThrow();
    expect(() => contract.assertFxPackageExports({ ...exports, ".": { import: "./src/index.js", types: "./index.d.ts" } })).toThrow();
    expect(() => contract.assertFxPackageExports({ ...exports, ".": "./host.js" })).toThrow();
  });
});
