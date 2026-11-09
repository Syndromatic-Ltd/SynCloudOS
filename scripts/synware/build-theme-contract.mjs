/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const sorted = values => [...values].sort();
/** The rendered catalogue, rather than selectors or private classes, owns this inventory. */
export function createNSEThemeContract(rendered, vocabulary, colours) {
  for (const [name, entry] of rendered) {
    if (!vocabulary.controls.includes(name)) throw new TypeError(`Unknown theme control ${name}.`);
    for (const part of entry.parts) if (!vocabulary.parts.includes(part)) throw new TypeError(`Unknown theme part ${name}.${part}.`);
    for (const variant of entry.variants.keys()) if (!vocabulary.variants.includes(variant)) throw new TypeError(`Unknown theme variant ${variant}.`);
  }
  return {
    themeContractVersion: 1,
    controls: Object.fromEntries([...rendered].sort(([a], [b]) => a.localeCompare(b, "en")).map(([name, entry]) => [name, {
      parts: sorted(entry.parts), states: sorted(entry.states),
      variants: Object.fromEntries([...entry.variants].sort(([a], [b]) => a.localeCompare(b, "en")).map(([name, values]) => [name, sorted(values)])),
    }])),
    colours: [...colours],
    appearance: { "colour-scheme-resolved": ["light", "dark"], contrast: ["normal", "high", "forced"], transparency: ["normal", "reduced"] },
    navigation: { compact: { placement: ["block-start", "block-end"], flow: ["in-flow", "overlay"] }, regular: { placement: ["source-list", "block-start"], flow: ["in-flow", "overlay"] } },
    presentation: { login: ["plain", "ornamented"], notifications: ["plain", "sliced-3d"], materialLighting: ["off", "on"] },
    limits: { minimumHitTarget: { regular: 24, large: 24 }, visibleFocusIndicator: true, reducedMotion: true, semanticProperties: ["display", "visibility", "content"], forbiddenProperties: ["animation", "transition", "font", "font-family", "font-size", "font-weight", "line-height", "letter-spacing"] },
    renamedFrom: { "toolbar.root": "toolbar.background", "circular-slider": "slider[slider-type=circular]", "slider-field": "slider[slider-type=linear]", "ruler": "ruler-view", "scroll-view-frame": "scroll-view", "toolbar-configuration-sheet": "toolbar-customisation-palette", "calendar": "date-picker[date-picker-elements=yearMonthDay]", "time-picker": "date-picker[date-picker-elements=hourMinute]", "date-time-picker": "date-picker[date-picker-elements=yearMonthDay hourMinute]", "date-range-picker": "date-picker[date-picker-mode=range]", "route-picker": "route-picker-view", "file-panel": "save-panel" },
  };
}
/** Read the reviewed result; the drift gate compares it with a fresh render. */
export function deriveNSEThemeContract(repositoryRoot) {
  const contract = JSON.parse(readFileSync(resolve(repositoryRoot, "tooling/nse-theme-contract.json"), "utf8"));
  if (contract.themeContractVersion !== 1 || !contract.controls || !Array.isArray(contract.colours)) throw new Error("Malformed NSE theme contract.");
  return contract;
}
export function generateNSEThemeContract(repositoryRoot) {
  const result = spawnSync(process.execPath, [resolve(repositoryRoot, "node_modules/vitest/vitest.mjs"), "run", "tests/runtime/nse-theme-contract-drift.test.tsx"], { cwd: repositoryRoot, env: { ...process.env, THEME_CONTRACT_WRITE: "1" }, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Theme contract generation failed.");
  return deriveNSEThemeContract(repositoryRoot);
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) generateNSEThemeContract(resolve(fileURLToPath(new URL("../..", import.meta.url))));
