/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error The plugin is plain ESM without declarations for this internal export.
import { sdkBuildFingerprint, synCloudOS } from "../../scripts/synware/vite-plugin.mjs";

const directories: string[] = [];
function sdk(files: Record<string, string>): string {
  const directory = mkdtempSync(join(tmpdir(), "syncloudos-sdk-"));
  directories.push(directory);
  mkdirSync(join(directory, "chunks"));
  for (const [path, contents] of Object.entries(files)) { mkdirSync(join(directory, path, ".."), { recursive: true }); writeFileSync(join(directory, path), contents); }
  return directory;
}
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe("the SDK build in Vite's pre-bundle key", () => {
  it("changes when an entry or a chunk of the installed SDK changes", () => {
    const base = { "package.json": "{\"version\":\"1.0.0\"}", "nse.js": "export const a = 1;", "chunks/scos-AAAA.js": "" };
    const fingerprint = sdkBuildFingerprint(sdk(base));
    expect(fingerprint).toMatch(/^[0-9a-f]{16}$/u);
    expect(sdkBuildFingerprint(sdk(base))).toBe(fingerprint);
    expect(sdkBuildFingerprint(sdk({ ...base, "nse.js": "export const a = 2;" }))).not.toBe(fingerprint);
    expect(sdkBuildFingerprint(sdk({ ...base, "chunks/scos-BBBB.js": "" }))).not.toBe(fingerprint);
  });

  it("leaves the key alone in a source checkout, where no built SDK sits beside the plugin", () => {
    expect(sdkBuildFingerprint(join(import.meta.dirname, "../../scripts/synware"))).toBeNull();
    const plugin = synCloudOS({ webspringEntry: false });
    expect(plugin.config({}, { command: "serve", mode: "development" })).not.toHaveProperty("optimizeDeps");
  });

  it("changes when only the packed FX virtual-module generator changes", () => {
    const base = { "package.json": "{}", "fx-app-module-source.mjs": "export const version = 1;", "nse.js": "" };
    expect(sdkBuildFingerprint(sdk(base))).not.toBe(sdkBuildFingerprint(sdk({ ...base, "fx-app-module-source.mjs": "export const version = 2;" })));
  });
});
