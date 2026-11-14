/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
/**
 * Resolves React's JSX runtime to the mirroring one, so every host element built by the project
 * (framework, applications and third-party views) gets its contract hooks' classes in the same commit.
 */
import { fileURLToPath } from "node:url";

const normalise = path => path.replaceAll("\\", "/");
const runtimes = new Map([
  ["react/jsx-runtime", normalise(fileURLToPath(new URL("../../src/NSE/Theme/contract/hookMirrorJSXRuntime.mjs", import.meta.url)))],
  ["react/jsx-dev-runtime", normalise(fileURLToPath(new URL("../../src/NSE/Theme/contract/hookMirrorJSXDevRuntime.mjs", import.meta.url)))],
]);
const wrappers = new Set(runtimes.values());

/** The mirroring module for a JSX runtime specifier, or null: the wrappers themselves import React's own. */
export function resolveHookMirrorJSX(id, importer) {
  const target = runtimes.get(id);
  if (!target || importer && wrappers.has(normalise(importer.split("?")[0]))) return null;
  return target;
}

/** A Vite plugin for configurations that do not use the SynWare project plugin (the framework's own tests). */
export function hookMirrorJSX() {
  return { name: "syncloudos:hook-mirror-jsx", enforce: "pre", resolveId: resolveHookMirrorJSX };
}
