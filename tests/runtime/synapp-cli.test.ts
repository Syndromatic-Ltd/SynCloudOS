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

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

const temporaryTargets: string[] = [];

function createTarget() {
  const target = mkdtempSync(join(tmpdir(), "synapp-"));
  temporaryTargets.push(target);
  return target;
}

afterEach(() => {
  for (const target of temporaryTargets.splice(0)) rmSync(target, { recursive: true, force: true });
});

describe("create-synware CLI", () => {
  it("creates an out-of-tree app that imports only the AppSDK and NSE barrels", () => {
    const target = createTarget();
    execFileSync(process.execPath, [
      "scripts/synware/create-synware.mjs",
      target,
      "com.example.cloud",
    ], { encoding: "utf8" });

    const source = readFileSync(join(target, "Contents", "index.tsx"), "utf8");
    expect(source).toContain('from "@syndromatic/syncloudos/sdk"');
    expect(source).toContain('from "@syndromatic/syncloudos/nse"');
    expect(source).not.toMatch(/\.\.\/.*src\//u);
    expect(source).not.toContain(process.cwd());
    expect(existsSync(join(target, "Contents", "Info.ts"))).toBe(true);
    expect(existsSync(join(target, "Contents", "Resources", "Localised", "Base.locale", "Localisable.strings"))).toBe(true);

    expect(execFileSync(process.execPath, ["scripts/synware/validate-synware.mjs", target], { encoding: "utf8" }))
      .toContain("validated com.example.cloud");
  });

  it("refuses invalid identifiers and non-empty target directories", () => {
    const target = createTarget();
    writeFileSync(join(target, "occupied.txt"), "occupied", "utf8");
    expect(() => execFileSync(process.execPath, ["scripts/synware/create-synware.mjs", target, "com.example.cloud"], { encoding: "utf8", stdio: "pipe" }))
      .toThrow(/non-empty/u);

    const cleanTarget = createTarget();
    expect(() => execFileSync(process.execPath, ["scripts/synware/create-synware.mjs", cleanTarget, "Not an identifier"], { encoding: "utf8", stdio: "pipe" }))
      .toThrow(/valid SynWare identifier/u);
  });
});

describe("validate-synware CLI", () => {

  it("discovers sorted governed directories and propagates every invalid-app result", () => {
    const root = createTarget();
    const alpha = join(root, "Alpha.app");
    const zeta = join(root, "Zeta.app");
    const broken = join(root, "Broken.app");

    for (const [target, id] of [[zeta, "com.example.zeta"], [alpha, "com.example.alpha"]] as const) {
      execFileSync(process.execPath, ["scripts/synware/create-synware.mjs", target, id], { encoding: "utf8" });
    }
    mkdirSync(join(broken, "Contents", "Resources", "Localised", "Base.locale"), { recursive: true });
    writeFileSync(join(broken, "Contents", "Info.ts"), "export default { id: 'not-a-valid-id' };\n", "utf8");
    writeFileSync(join(broken, "Contents", "index.tsx"), "export {};\n", "utf8");
    writeFileSync(join(broken, "Contents", "Resources", "Localised", "Base.locale", "Localisable.strings"), "", "utf8");

    const result = JSON.parse(execFileSync(process.execPath, [
      "--input-type=module",
      "-e",
      "const validator = await import('./scripts/synware/validate-synware.mjs'); process.stdout.write(JSON.stringify({ directories: validator.discoverSynWareDirectories(process.argv[1]), result: validator.validateSynWareDirectories(process.argv[1]) }));",
      root,
    ], { cwd: process.cwd(), encoding: "utf8" })) as {
      directories: string[];
      result: { valid: number; invalid: number; ok: boolean; results: Array<{ directory: string; id: string | null; ok: boolean }> };
    };
    expect(result.directories.map((directory) => directory.split(/[\\/]/u).at(-1)))
      .toEqual(["Alpha.app", "Broken.app", "Zeta.app"]);
    const aggregate = result.result;
    expect(aggregate).toMatchObject({ valid: 2, invalid: 1, ok: false });
    expect(aggregate.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ directory: broken, ok: false }),
      expect.objectContaining({ id: "com.example.alpha", ok: true }),
      expect.objectContaining({ id: "com.example.zeta", ok: true }),
    ]));
  });

  it("accepts reviewed runtime dependencies while rejecting undeclared external packages", () => {
    const target = createTarget();
    execFileSync(process.execPath, ["scripts/synware/create-synware.mjs", target, "com.example.dependencies"], { encoding: "utf8" });
    const entry = join(target, "Contents", "index.tsx");
    writeFileSync(entry, 'import { createPortal } from "react-dom"; import { motion } from "framer-motion"; void createPortal; void motion;\n', "utf8");
    expect(execFileSync(process.execPath, ["scripts/synware/validate-synware.mjs", target], { encoding: "utf8" }))
      .toContain("validated com.example.dependencies");

    writeFileSync(entry, 'import thing from "not-a-reviewed-runtime-package"; void thing;\n', "utf8");
    expect(() => execFileSync(process.execPath, ["scripts/synware/validate-synware.mjs", target], { encoding: "utf8", stdio: "pipe" }))
      .toThrow(/unsupported package/u);
  });
});
