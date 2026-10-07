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

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { afterEach, expect, it, vi } from "vitest";
import * as animation from "../../src/FX/AnimationFX/public";
import * as graphics from "../../src/FX/GraphicsFX/public";
import * as image from "../../src/FX/ImageFX/public";
import * as text from "../../src/FX/TextFX/public";
import * as audio from "../../src/FX/AudioFX/public";
import * as haptics from "../../src/FX/HapticsFX/public";
import * as motion from "../../src/FX/MotionFX/public";
import * as media from "../../src/FX/MediaFX/public";
import * as video from "../../src/FX/VideoFX/public";
import * as midi from "../../src/FX/MIDIFX/public";
import * as location from "../../src/FX/LocationFX/public";
import * as lumina from "../../src/FX/LuminaFX/public";
import { exerciseRecipes, families } from "../fixtures/synware-authoring/exercise-recipes.mjs";
import { auditSynWareCapabilityUsage } from "../../scripts/synware/audit-capability-usage.mjs";
import { auditSynWareImports } from "../../scripts/synware/audit-sdk-imports.mjs";

const roots: string[] = [];
const generator = resolve("scripts/synware/create-synware.mjs");
const fx: Record<string, unknown> = { animation, graphics, image, text, audio, haptics, motion, media, video, midi, location, lumina };
function temporary() { const root = mkdtempSync(join(tmpdir(), "synware-fx-authoring-")); roots.push(root); return root; }
function generate(options: string[] = []) {
  const root = temporary(), app = join(root, "src/SynWare/Example.app");
  execFileSync(process.execPath, [generator, app, "com.example.fx", ...options]);
  return { root, app };
}
function load(path: string, overrides: Record<string, unknown> = {}): any {
  const exports = {};
  const require = (specifier: string) => {
    if (Object.hasOwn(overrides, specifier)) return overrides[specifier];
    if (specifier.startsWith("@syndromatic/syncloudos/fx/")) return fx[specifier.split("/").at(-1)!];
    if (specifier.startsWith(".")) {
      const base = resolve(path, "..", specifier);
      return load(existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`, overrides);
    }
    throw Error(`Unexpected generated dependency: ${specifier}`);
  };
  const output = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("require", "exports", output)(require, exports);
  return exports;
}
afterEach(() => { for (const root of roots.splice(0)) { expect(root.startsWith(join(tmpdir(), "synware-fx-authoring-"))).toBe(true); rmSync(root, { recursive: true, force: true }); } });

it("keeps the default permission-free and rejects unknown recipes/options before writing", () => {
  const { app } = generate();
  expect(load(join(app, "Contents/Info.ts")).default.permissions).toBeUndefined();
  expect(existsSync(join(app, "Contents/recipes"))).toBe(false);
  for (const options of [["--fx", "unknown"], ["--fx"], ["--fxx", "media"], ["--fx", "video", "unexpected"]]) {
    const target = join(temporary(), "invalid");
    expect(spawnSync(process.execPath, [generator, target, "com.example.fx", ...options]).status).toBe(1);
    expect(existsSync(target)).toBe(false);
  }
});

it("executes all twelve actual recipe modules and declares exactly their scoped authority", async () => {
  const { root, app } = generate(["--fx", families.join(",")]);
  expect(load(join(app, "Contents/Info.ts")).default.permissions).toEqual([
    "video.capture.camera", "midi.access", "location.read", "location.request", "lumina.query",
  ]);
  const result = await exerciseRecipes((family: string) => load(join(app, `Contents/recipes/${family}.ts`)));
  expect(() => load(join(app, "Contents/__tests__/recipes.test.ts"))).not.toThrow();
  expect(result.families).toHaveLength(12);
  expect(auditSynWareCapabilityUsage(root).fxViolations).toEqual([]);
  expect(auditSynWareImports(root).internalImports).toEqual([]);
  expect(auditSynWareCapabilityUsage(root).fxUsage.map((record: any) => record.operation)).toEqual(expect.arrayContaining([
    "video.requestCamera", "midi.requestAuthorization", "location.current", "lumina.query",
  ]));
});

it("selects only requested recipes and deduplicates repeated options without granting unrelated authority", () => {
  const { app } = generate(["--fx", "media", "--fx", "location,media"]);
  expect(load(join(app, "Contents/Info.ts")).default.permissions).toEqual(["location.read", "location.request"]);
  expect(existsSync(join(app, "Contents/recipes/video.ts"))).toBe(false);
  expect((readFileSync(join(app, "Contents/index.tsx"), "utf8").match(/id="media"/g) ?? [])).toHaveLength(1);
});

it("runs the generated Lumina recipe against the real query result and disposes its session", async () => {
  const { app } = generate(["--fx", "lumina"]);
  const dispose = vi.fn();
  const index = new lumina.LUFXIndex({
    async mutate() { throw new Error("Unexpected mutation"); },
    async snapshot() { return { state: "ready", schemaVersion: 1, checkpoint: { generation: 1, revision: 0 }, items: [] }; },
    dispose,
  });
  expect(await load(join(app, "Contents/recipes/lumina.ts")).runRecipe({ createIndex: () => index })).toBe("Search results: 0");
  expect(dispose).toHaveBeenCalledOnce();
});

it("does no device work on render and shows explicit action failures rather than success", async () => {
  const { app } = generate(["--fx", "video"]);
  const requestCamera = vi.fn().mockRejectedValue(new Error("Camera denied"));
  const states: unknown[] = [];
  const definition = load(join(app, "Contents/index.tsx"), {
    "react": { useState: () => ["Ready", (value: unknown) => states.push(value)] }, "react/jsx-runtime": jsx,
    "@syndromatic/syncloudos/sdk": { createSynWare: (value: unknown) => value, useSynWare: () => ({appId:"com.example.fx"}), useSynWareVideo: () => ({capabilities:{camera:true},requestCamera}) },
    "@syndromatic/syncloudos/nse": { NSEStackView: "div", NSEStackItem: "div" }, "@syndromatic/syncloudos/nse/styles.css": {},
  }).default;
  const tree = definition.root();
  expect(requestCamera).not.toHaveBeenCalled();
  const buttons: any[] = [];
  function visit(node: any) { if (!node || typeof node !== "object") return; if (node.type === "button") buttons.push(node); for (const child of [node.props?.children].flat()) visit(child); }
  visit(tree); expect(buttons).toHaveLength(1);
  await buttons[0].props.onClick();
  expect(requestCamera).toHaveBeenCalledOnce();
  expect(states.at(-1)).toBe("Camera denied");
});
