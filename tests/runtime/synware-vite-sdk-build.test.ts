/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mergeConfig, resolveConfig } from "vite";
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
    expect(plugin.config({}, { command: "serve", mode: "development" })).not.toHaveProperty("optimizeDeps.esbuildOptions.define.__SYNCLOUDOS_SDK_BUILD__");
  });

  it("changes when only the packed FX virtual-module generator changes", () => {
    const base = { "package.json": "{}", "fx-app-module-source.mjs": "export const version = 1;", "nse.js": "" };
    expect(sdkBuildFingerprint(sdk(base))).not.toBe(sdkBuildFingerprint(sdk({ ...base, "fx-app-module-source.mjs": "export const version = 2;" })));
  });
});


it("keeps every SDK subpath in one dev graph without disabling other dependency optimisation", () => {
  const plugin = synCloudOS({ webspringEntry: false });
  const config = mergeConfig({ optimizeDeps: { include: ["react"], exclude: ["another-library"] } }, plugin.config({}, { command: "serve", mode: "development" }));
  expect(config.optimizeDeps.exclude).toEqual(["another-library", "@syndromatic/syncloudos"]);
  expect(config.optimizeDeps.include).toEqual(["react", "react", "react-dom", "react-dom/client", "react/jsx-runtime"]);
  expect(config.optimizeDeps.noDiscovery).not.toBe(true);
});


it("removes only SDK package entries from a host's explicit optimisation list before Vite resolves it", async () => {
  const root = sdk({ "package.json": '{"version":"1.0.0"}' });
  const config = await resolveConfig({ configFile: false, root, plugins: [synCloudOS({ webspringEntry: false })],
    optimizeDeps: { include: ["react", "@syndromatic/syncloudos", "@syndromatic/syncloudos/sdk", "@syndromatic/syncloudos/fx/pass", "@syndromatic/syncloudos-extra", "@other/syncloudos"] },
  }, "serve");
  const expected = ["react", "@syndromatic/syncloudos-extra", "@other/syncloudos", "react", "react-dom", "react-dom/client", "react/jsx-runtime"];
  expect(config.optimizeDeps.include).toEqual(expected);
  expect(config.environments.client.optimizeDeps.include).toEqual(expected);
  expect(config.optimizeDeps.exclude).toContain("@syndromatic/syncloudos");
});
