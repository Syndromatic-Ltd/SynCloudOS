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
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { kebabCase, titleFromFolderName } from "./project-derivation.mjs";

const APP_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const BUNDLE_IDENTIFIER = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+){2,}$/u;

export function scaffoldBundleIdentifier(name, organisation = "com.example") {
  const identifier = `${organisation}.${String(name).toLowerCase()}`;
  if (!BUNDLE_IDENTIFIER.test(identifier)) throw new TypeError("Use a reverse-DNS organisation and a folder name containing only letters, digits and hyphens.");
  return identifier;
}

const fxRecipes = {
  animation: { imports: "AFXTimingFunction", body: 'return `Timing at halfway: ${new AFXTimingFunction("linear").sample(0.5)}`;', expected: "Timing at halfway: 0.5" },
  graphics: { imports: "offsetRect", body: 'const rect = offsetRect({x:2,y:3,width:4,height:5}, 10, 20);\n  return `Offset rectangle: ${rect.x}, ${rect.y}`;', expected: "Offset rectangle: 12, 23" },
  image: { imports: "IFXImage", extra: 'import { GFXColour } from "@syndromatic/syncloudos/fx/graphics";\n', body: 'const image = IFXImage.constant(GFXColour.rgba(1,0,0)).cropped({x:0,y:0,width:32,height:16});\n  if (image.extent.kind !== "finite") throw new Error("Expected a finite crop");\n  return `Cropped extent: ${image.extent.rect.width} x ${image.extent.rect.height}`;', expected: "Cropped extent: 32 x 16" },
  text: { imports: "TFXParagraphStyle", body: 'return `Paragraph alignment: ${new TFXParagraphStyle({alignment:"center"}).alignment}`;', expected: "Paragraph alignment: center" },
  audio: { imports: "AUFXAudioTime", body: 'return `Audio duration: ${new AUFXAudioTime(48000,48000).seconds} second`;', expected: "Audio duration: 1 second" },
  haptics: { imports: "HFXHapticPattern", body: 'const pattern = new HFXHapticPattern([{type:"continuous",relativeTime:0,duration:0.25,intensity:0.5}]);\n  return `Pattern duration: ${pattern.duration} seconds`;', expected: "Pattern duration: 0.25 seconds" },
  motion: { imports: "MFXAttitude", body: 'return `Identity yaw: ${MFXAttitude.fromEuler(0,0,0).yaw}`;', expected: "Identity yaw: 0" },
  media: { imports: "MEFXTime", body: 'return `Media duration: ${MEFXTime.finite(3n,2).toSeconds()} seconds`;', expected: "Media duration: 1.5 seconds" },
  video: { imports: "type VFXCaptureSession", hook: "useVideo", client: "VFXCaptureSession", permissions: ["video.capture.camera"], label: "Request camera",
    body: 'if (!client.capabilities.camera) return "Camera unavailable";\n  const settings = await client.requestCamera();\n  return `Camera active: ${settings.width ?? "unknown"} x ${settings.height ?? "unknown"}`;' },
  midi: { imports: "type MIFXAccess", hook: "useMIDI", client: "MIFXAccess", permissions: ["midi.access"], label: "Authorize MIDI",
    body: 'const result = await client.requestAuthorization({sysex:false});\n  return `MIDI authorization: ${result.state}`;' },
  location: { imports: "type LFXLocationManager", hook: "useLocation", client: "LFXLocationManager", permissions: ["location.read", "location.request"], label: "Request location",
    body: 'const fix = await client.current({timeoutSeconds:10});\n  return `Location: ${fix.coordinate.latitude}, ${fix.coordinate.longitude}`;' },
  lumina: { imports: "LUFXQuery, type LUFXIndexClient", hook: "useLumina", client: "LUFXIndexClient", permissions: ["lumina.query"], label: "Search for hello",
    body: 'const index = client.createIndex();\n  try {\n    const result = await index.query(new LUFXQuery({text:"hello",limit:10}));\n    return `Search results: ${result.results.length}`;\n  } finally {\n    index.dispose();\n  }' },
};

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

export function scaffoldFiles(bundleIdentifier, selected = [], title = titleFromFolderName(bundleIdentifier)) {
  if (!BUNDLE_IDENTIFIER.test(bundleIdentifier)) throw new TypeError("Use a reverse-DNS bundleIdentifier with at least two dots.");
  const permissions = [...new Set(selected.flatMap(name => fxRecipes[name].permissions ?? []))];
  const hooks = selected.flatMap(name => fxRecipes[name].hook ? [fxRecipes[name].hook] : []);
  const functionName = name => `run${name[0].toUpperCase()}${name.slice(1)}`;
  const recipeImports = selected.map(name => `import { runRecipe as ${functionName(name)} } from "./recipes/${name}";`).join("\n");
  const files = new Map([
    ["Contents/Info.ts", `export default {
  bundleIdentifier: ${JSON.stringify(bundleIdentifier)},
  displayName: ${JSON.stringify(title)},
  version: "1.0.0",
  webspring: { visible: true },
${permissions.length ? `  permissions: ${JSON.stringify(permissions)},\n` : ""}\
} as const;
`],
    ["Contents/index.tsx", `${selected.length ? 'import { useState } from "react";\n' : ""}import { SCOS${hooks.length ? `, ${hooks.join(", ")}` : ""} } from "@syndromatic/syncloudos";
import { NSEStackItem, NSEStackView } from "@syndromatic/syncloudos/nse";
import "@syndromatic/syncloudos/nse/styles.css";
${recipeImports}

export default function SynWareRoot() {
${selected.length ? `  const [status, setStatus] = useState("Ready");\n${selected.filter(name => fxRecipes[name].hook).map(name => `  const ${name} = ${fxRecipes[name].hook}();`).join("\n")}\n  async function run(operation: () => string | Promise<string>) {\n    setStatus("Working");\n    try { setStatus(await operation()); }\n    catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }\n  }\n` : ""}\
  return (
    <NSEStackView aria-label="${title} actions" orientation="vertical" spacing={12}>
      <NSEStackItem id="status" visibilityPriority={100}>
        <p>{SCOS.app.displayName} is running as {SCOS.app.bundleIdentifier}.</p>
      </NSEStackItem>
${selected.map(name => `      <NSEStackItem id="${name}" visibilityPriority={90}>\n        <button type="button" onClick={() => run(() => ${functionName(name)}(${fxRecipes[name].hook ? name : ""}))}>${fxRecipes[name].label ?? `Run ${name} example`}</button>\n      </NSEStackItem>`).join("\n")}
${selected.length ? '      <NSEStackItem id="result" visibilityPriority={100}><p role="status">{status}</p></NSEStackItem>\n' : ""}\
    </NSEStackView>
  );
}
`],
    ["Contents/Resources/Localised/Base.locale/Localisable.strings", `"app.title" = "${title}";\n`],
    ["Contents/__tests__/app.test.tsx", `import App from "../index";\n\nif (typeof App !== "function") throw new Error("Expected an application component");\n`],
  ]);
  for (const name of selected) {
    const recipe = fxRecipes[name];
    files.set(`Contents/recipes/${name}.ts`, `import { ${recipe.imports} } from "@syndromatic/syncloudos/fx/${name}";\n${recipe.extra ?? ""}\nexport ${recipe.client ? "async " : ""}function runRecipe(${recipe.client ? `client: ${recipe.client}` : ""}): ${recipe.client ? "Promise<string>" : "string"} {\n  ${recipe.body}\n}\n`);
  }
  const pure = selected.filter(name => fxRecipes[name].expected);
  if (pure.length) files.set("Contents/__tests__/recipes.test.ts", `${pure.map(name => `import { runRecipe as ${functionName(name)} } from "../recipes/${name}";`).join("\n")}\n\n${pure.map(name => `if (${functionName(name)}() !== ${JSON.stringify(fxRecipes[name].expected)}) throw new Error("Unexpected ${name} recipe result");`).join("\n")}\n`);
  return files;
}

/** The same folder templates are used by the CLI and developer MCP. */
export function scaffoldProjectFiles({ kind = "application", name, organisation = "com.example", bundleIdentifier, id = kebabCase(name), owners = [] }) {
  const title = titleFromFolderName(name);
  if (kind === "application") return scaffoldFiles(bundleIdentifier ?? scaffoldBundleIdentifier(name, organisation), [], title);
  if (kind === "preferencePane") return new Map([["index.tsx", `import { definePreferencePane } from "@syndromatic/syncloudos";\n\nexport default definePreferencePane({ id: ${JSON.stringify(id)}, title: ${JSON.stringify(title)}, order: 100, view: function Preferences() { return <p>${title}</p>; } });\n`]]);
  if (kind === "widget") return new Map([["index.tsx", `import { defineWidget } from "@syndromatic/syncloudos";\n\nexport default defineWidget({ id: ${JSON.stringify(id)}, title: ${JSON.stringify(title)}, load: async () => new Date().toLocaleDateString(), view: ({ data }) => <p>{data}</p>, whenEmpty: "hide" });\n`]]);
  if (kind === "integration") {
    if (!owners.length) throw new TypeError("An integration needs at least one owner application ID.");
    return new Map([["", `import { defineIntegration } from "@syndromatic/syncloudos";\n\nexport default defineIntegration({ owners: ${JSON.stringify(owners)}, install(context) { return context.bootNotifications.register(${JSON.stringify(id)}, () => console.info(${JSON.stringify(`${title} ready`)})); } });\n`]]);
  }
  throw new TypeError(`Unknown project folder kind: ${kind}.`);
}
function main() {
  const [targetArgument, ...options] = process.argv.slice(2);
  if (!targetArgument) {
    fail("Usage: create-synware <Name.app|Name.prefPane|Name.widget|Name.integration.ts> [--organisation com.example] [--owners bundle-identifier,...] [--fx recipe,...]");
    return;
  }
  if (!/\.(?:app|prefPane|widget|integration\.tsx?)$/u.test(targetArgument)) { fail("The target must name an .app, .prefPane, .widget or .integration.ts entry."); return; }
  const name = basename(targetArgument).replace(/\.(?:app|prefPane|widget|integration\.tsx?)$/u, "");
  const kind = targetArgument.endsWith(".prefPane") ? "preferencePane" : targetArgument.endsWith(".widget") ? "widget" : /\.integration\.tsx?$/u.test(targetArgument) ? "integration" : "application";
  const appId = kebabCase(name);
  if (!APP_ID.test(appId)) { fail("Provide a valid application ID."); return; }
  let owners = [];
  let organisation = "com.example";
  const selected = [];
  for (let index = 0; index < options.length; index += 2) {
    if (options[index] === "--owners" && options[index + 1]) { owners = options[index + 1].split(","); continue; }
    if (options[index] === "--organisation" && options[index + 1]) { organisation = options[index + 1]; continue; }
    if (options[index] !== "--fx" || !options[index + 1]) { fail("Expected --fx followed by comma-separated recipe names."); return; }
    for (const name of options[index + 1].split(",")) {
      if (!Object.hasOwn(fxRecipes, name)) { fail(`Unknown FX recipe: ${name}. Available: ${Object.keys(fxRecipes).join(", ")}`); return; }
      if (!selected.includes(name)) selected.push(name);
    }
  }
  const target = resolve(targetArgument);
  if (existsSync(target) && (kind === "integration" || readdirSync(target).length > 0)) {
    fail("Refusing to scaffold into a non-empty target directory.");
    return;
  }
  const files = kind === "application" ? scaffoldFiles(scaffoldBundleIdentifier(name, organisation), selected, titleFromFolderName(name)) : scaffoldProjectFiles({ kind, name, id: appId, owners });
  if (kind !== "integration") mkdirSync(target, { recursive: true });
  for (const [relativePath, contents] of files) {
    const path = relativePath ? resolve(target, relativePath) : target;
    mkdirSync(resolve(path, ".."), { recursive: true });
    writeFileSync(path, contents, "utf8");
  }
  process.stdout.write(`created ${appId} at ${target}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
