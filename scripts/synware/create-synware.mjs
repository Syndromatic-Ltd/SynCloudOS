#!/usr/bin/env node
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

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const APP_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/;

const fxRecipes = {
  animation: { imports: "AFXTimingFunction", body: 'return `Timing at halfway: ${new AFXTimingFunction("linear").sample(0.5)}`;', expected: "Timing at halfway: 0.5" },
  graphics: { imports: "offsetRect", body: 'const rect = offsetRect({x:2,y:3,width:4,height:5}, 10, 20);\n  return `Offset rectangle: ${rect.x}, ${rect.y}`;', expected: "Offset rectangle: 12, 23" },
  image: { imports: "IFXImage", extra: 'import { GFXColour } from "@syndromatic/syncloudos/fx/graphics";\n', body: 'const image = IFXImage.constant(GFXColour.rgba(1,0,0)).cropped({x:0,y:0,width:32,height:16});\n  if (image.extent.kind !== "finite") throw new Error("Expected a finite crop");\n  return `Cropped extent: ${image.extent.rect.width} x ${image.extent.rect.height}`;', expected: "Cropped extent: 32 x 16" },
  text: { imports: "TFXParagraphStyle", body: 'return `Paragraph alignment: ${new TFXParagraphStyle({alignment:"center"}).alignment}`;', expected: "Paragraph alignment: center" },
  audio: { imports: "AUFXAudioTime", body: 'return `Audio duration: ${new AUFXAudioTime(48000,48000).seconds} second`;', expected: "Audio duration: 1 second" },
  haptics: { imports: "HFXHapticPattern", body: 'const pattern = new HFXHapticPattern([{type:"continuous",relativeTime:0,duration:0.25,intensity:0.5}]);\n  return `Pattern duration: ${pattern.duration} seconds`;', expected: "Pattern duration: 0.25 seconds" },
  motion: { imports: "MFXAttitude", body: 'return `Identity yaw: ${MFXAttitude.fromEuler(0,0,0).yaw}`;', expected: "Identity yaw: 0" },
  media: { imports: "MEFXTime", body: 'return `Media duration: ${MEFXTime.finite(3n,2).toSeconds()} seconds`;', expected: "Media duration: 1.5 seconds" },
  video: { imports: "type VFXCaptureSession", hook: "useSynWareVideo", client: "VFXCaptureSession", permissions: ["video.capture.camera"], label: "Request camera",
    body: 'if (!client.capabilities.camera) return "Camera unavailable";\n  const settings = await client.requestCamera();\n  return `Camera active: ${settings.width ?? "unknown"} x ${settings.height ?? "unknown"}`;' },
  midi: { imports: "type MIFXAccess", hook: "useSynWareMIDI", client: "MIFXAccess", permissions: ["midi.access"], label: "Authorize MIDI",
    body: 'const result = await client.requestAuthorization({sysex:false});\n  return `MIDI authorization: ${result.state}`;' },
  location: { imports: "type LFXLocationManager", hook: "useSynWareLocation", client: "LFXLocationManager", permissions: ["location.read", "location.request"], label: "Request location",
    body: 'const fix = await client.current({timeoutSeconds:10});\n  return `Location: ${fix.coordinate.latitude}, ${fix.coordinate.longitude}`;' },
  lumina: { imports: "LUFXQuery, type LUFXIndexClient", hook: "useSynWareLumina", client: "LUFXIndexClient", permissions: ["lumina.query"], label: "Search for hello",
    body: 'const index = client.createIndex();\n  try {\n    const result = await index.query(new LUFXQuery({text:"hello",limit:10}));\n    return `Search results: ${result.results.length}`;\n  } finally {\n    index.dispose();\n  }' },
};

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function titleFor(appId) {
  const lastPart = appId.split(/[.-]/u).at(-1) ?? appId;
  return lastPart.replace(/(^|[-_])([a-z])/gu, (_match, prefix, character) => `${prefix} ${character.toUpperCase()}`).trim();
}

function scaffoldFiles(appId, selected = []) {
  const title = titleFor(appId);
  const permissions = [...new Set(selected.flatMap(name => fxRecipes[name].permissions ?? []))];
  const hooks = selected.flatMap(name => fxRecipes[name].hook ? [fxRecipes[name].hook] : []);
  const functionName = name => `run${name[0].toUpperCase()}${name.slice(1)}`;
  const recipeImports = selected.map(name => `import { runRecipe as ${functionName(name)} } from "./recipes/${name}";`).join("\n");
  const files = new Map([
    ["Contents/Info.ts", `export default {
  schemaVersion: 1,
  id: "${appId}",
  version: "0.1.0",
  title: "${title}",
  routes: [{ path: "/${appId.replaceAll(".", "-")}", primary: true }],
  presentations: ["desktop", "tablet", "mobile"],
  localeResources: { base: "Resources/Localised/Base.locale/Localisable.strings" },
  webspring: { visible: true },
${permissions.length ? `  permissions: ${JSON.stringify(permissions)},\n` : ""}\
} as const;
`],
    ["Contents/index.tsx", `${selected.length ? 'import { useState } from "react";\n' : ""}import { createSynWare, useSynWare${hooks.length ? `, ${hooks.join(", ")}` : ""} } from "@syndromatic/syncloudos/sdk";
import { NSEStackItem, NSEStackView } from "@syndromatic/syncloudos/nse";
import "@syndromatic/syncloudos/nse/styles.css";
import manifest from "./Info";
${recipeImports}

function SynWareRoot() {
  const app = useSynWare();
${selected.length ? `  const [status, setStatus] = useState("Ready");\n${selected.filter(name => fxRecipes[name].hook).map(name => `  const ${name} = ${fxRecipes[name].hook}();`).join("\n")}\n  async function run(operation: () => string | Promise<string>) {\n    setStatus("Working");\n    try { setStatus(await operation()); }\n    catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }\n  }\n` : ""}\
  return (
    <NSEStackView aria-label="${title} actions" orientation="vertical" spacing={12}>
      <NSEStackItem id="status" visibilityPriority={100}>
        <p>{manifest.title} is running as {app.appId}.</p>
      </NSEStackItem>
${selected.map(name => `      <NSEStackItem id="${name}" visibilityPriority={90}>\n        <button type="button" onClick={() => run(() => ${functionName(name)}(${fxRecipes[name].hook ? name : ""}))}>${fxRecipes[name].label ?? `Run ${name} example`}</button>\n      </NSEStackItem>`).join("\n")}
${selected.length ? '      <NSEStackItem id="result" visibilityPriority={100}><p role="status">{status}</p></NSEStackItem>\n' : ""}\
    </NSEStackView>
  );
}

export default createSynWare({ manifest, root: SynWareRoot });
`],
    ["Contents/Resources/Localised/Base.locale/Localisable.strings", `"app.title" = "${title}";\n`],
    ["Contents/__tests__/app.test.tsx", `import app from "../index";

if (app.manifest.id !== "${appId}") throw new Error("Unexpected manifest id");
`],
    ["README.md", `# ${title}\n\nGenerated with \`create-synware\`. Run \`synware:validate\` before registering this bundle with a SynCloudOS host.\n${selected.length ? `\nSelected FX recipes: ${selected.join(", ")}.\n\nDeclared permissions: ${permissions.join(", ") || "none (pure operations)"}. Device requests run only from their buttons. Hooks own component-scoped resources; the search action releases its index in finally. Denial and unavailable results are displayed without fabricated data.\n\nPure recipe assertions are in Contents/__tests__/recipes.test.ts. Camera/MIDI/location results depend on host policy and device availability; local deterministic tests are not native/device evidence.\n` : ""}`],
  ]);
  for (const name of selected) {
    const recipe = fxRecipes[name];
    files.set(`Contents/recipes/${name}.ts`, `import { ${recipe.imports} } from "@syndromatic/syncloudos/fx/${name}";\n${recipe.extra ?? ""}\nexport ${recipe.client ? "async " : ""}function runRecipe(${recipe.client ? `client: ${recipe.client}` : ""}): ${recipe.client ? "Promise<string>" : "string"} {\n  ${recipe.body}\n}\n`);
  }
  const pure = selected.filter(name => fxRecipes[name].expected);
  if (pure.length) files.set("Contents/__tests__/recipes.test.ts", `${pure.map(name => `import { runRecipe as ${functionName(name)} } from "../recipes/${name}";`).join("\n")}\n\n${pure.map(name => `if (${functionName(name)}() !== ${JSON.stringify(fxRecipes[name].expected)}) throw new Error("Unexpected ${name} recipe result");`).join("\n")}\n`);
  return files;
}

function main() {
  const [targetArgument, appId, ...options] = process.argv.slice(2);
  if (!targetArgument || !appId) {
    fail("Usage: create-synware <directory> <app-id> [--fx animation,graphics,image,text,audio,haptics,motion,media,video,midi,location,lumina]");
    return;
  }
  if (!APP_ID.test(appId)) {
    fail("Provide a valid SynWare identifier such as com.example.cloud.");
    return;
  }
  const selected = [];
  for (let index = 0; index < options.length; index += 2) {
    if (options[index] !== "--fx" || !options[index + 1]) { fail("Expected --fx followed by comma-separated recipe names."); return; }
    for (const name of options[index + 1].split(",")) {
      if (!Object.hasOwn(fxRecipes, name)) { fail(`Unknown FX recipe: ${name}. Available: ${Object.keys(fxRecipes).join(", ")}`); return; }
      if (!selected.includes(name)) selected.push(name);
    }
  }
  const target = resolve(targetArgument);
  if (existsSync(target) && readdirSync(target).length > 0) {
    fail("Refusing to scaffold into a non-empty target directory.");
    return;
  }
  mkdirSync(target, { recursive: true });
  for (const [relativePath, contents] of scaffoldFiles(appId, selected)) {
    const path = resolve(target, relativePath);
    mkdirSync(resolve(path, ".."), { recursive: true });
    writeFileSync(path, contents, "utf8");
  }
  process.stdout.write(`created ${appId} at ${target}\n`);
}

main();
