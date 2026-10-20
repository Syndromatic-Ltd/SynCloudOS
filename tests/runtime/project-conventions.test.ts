import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import ts from "typescript";
// @ts-expect-error Plain ESM build tooling.
import { discoverSynWareProject, synCloudOS } from "../../scripts/synware/vite-plugin.mjs";
// @ts-expect-error Plain ESM shared derivation.
import * as derivation from "../../scripts/synware/project-derivation.mjs";
// @ts-expect-error Plain ESM validator.
import { createSynWareValidator } from "../../scripts/synware/validation-core.mjs";
import * as webspring from "../../src/Webspring/public";
import { definePreferencePane } from "../../src/SynCloudOS/Preferences";
import type { SynCloudOSProjectComposition } from "../../src/SynCloudOSReact/projectComposition";
import type { SynWareManifestV1 } from "../../src/SynCloudOS/AppSDK/manifest";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "scos-project-")); roots.push(root);
  const modules = new Map<string, unknown>();
  function put(path: string, source: string, module?: unknown) {
    const file = resolve(root, path); mkdirSync(resolve(file, ".."), { recursive: true }); writeFileSync(file, source);
    if (module) modules.set(file.replaceAll("\\", "/"), module);
    return file;
  }
  put("package.json", JSON.stringify({ version: "2.3.4" }));
  mkdirSync(resolve(root, "src/SynWare"), { recursive: true });
  function app(name: string, info: object = { bundleIdentifier: `com.example.${name.toLowerCase()}`, displayName: name, version: "1.0.0" }) {
    put(`src/SynWare/${name}.app/Contents/index.tsx`, "export default function App() { return null; }");
    put(`src/SynWare/${name}.app/Contents/Info.ts`, `export default ${JSON.stringify(info)};`, { default: info });
  }
  function project(options = {}, development = true) {
    const discovered = discoverSynWareProject(root, { webspringEntry: false, ...options });
    const code = ts.transpileModule(discovered.code.replaceAll("import.meta.env.DEV", String(development)), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const exports = {} as Omit<SynCloudOSProjectComposition, "bundles"> & { bundles: { manifest: SynWareManifestV1; localeResources: unknown }[] };
    const require = (id: string) => {
      if (id === "@syndromatic/syncloudos/webspring") return webspring;
      if (id.endsWith("project-derivation.mjs")) return derivation;
      const path = id.replace(/^\/@fs\//u, "").split("?")[0];
      if (id.endsWith("?url")) return { default: path };
      if (id.endsWith("?raw")) return { default: readFileSync(path, "utf8") };
      if (modules.has(path)) return modules.get(path);
      throw new Error(`Unexpected import ${id}`);
    };
    new Function("require", "exports", code)(require, exports);
    return exports;
  }
  const schema = JSON.parse(readFileSync(new URL("../../src/SynCloudOS/AppSDK/manifest/synapp-manifest.schema.json", import.meta.url), "utf8"));
  const validate = (name: string) => createSynWareValidator({ schema, allowedImports: [] }).validate(resolve(root, `src/SynWare/${name}.app`));
  return { root, put, app, project, validate };
}

describe("folder-derived projects with explicit app identity", () => {
  it("discovers every folder kind, preserves identity and defaults only schema, icons and locale files", () => {
    const f = fixture(); f.app("NSEControlGallery", { bundleIdentifier: "com.example.NSEControlGallery", displayName: "NSE Control Gallery", version: "1.2.0" });
    f.put("src/SynWare/NSEControlGallery.app/Contents/Resources/AppIcon.svg", "<svg/>");
    f.put("src/SynWare/NSEControlGallery.app/Contents/Resources/AppIcon.png", "png");
    f.put("src/SynWare/NSEControlGallery.app/Contents/Resources/Localised/Base.locale/Localisable.strings", '"hello" = "Hello";');
    const pane = definePreferencePane({ id: "billing", title: "Billing", order: 2, view: () => null });
    f.put("src/Preferences/Billing.prefPane/index.tsx", "export default definePreferencePane({});", { default: pane });
    const widget = webspring.defineWidget({ id: "latest", title: "Latest", load: async () => "Latest", view: () => null, whenEmpty: "hide" });
    f.put("src/Widgets/Latest.widget/index.tsx", "export default defineWidget({});", { default: widget });
    f.put("src/Integrations/Journal.integration.ts", "export default defineIntegration({});", { default: webspring.defineIntegration({ owners: ["com.example.nsecontrolgallery"], install() {} }) });
    const project = f.project();
    expect(project.bundles[0].manifest).toMatchObject({ schemaVersion: 1, bundleIdentifier: "com.example.NSEControlGallery", displayName: "NSE Control Gallery", version: "1.2.0", webspring: { icon: "./Resources/AppIcon.svg" } });
    expect(project.bundles[0].localeResources).toEqual({ "Base.locale": { "Localisable.strings": '"hello" = "Hello";' } });
    expect(project.preferences).toEqual([pane]); expect(project.widgets).toEqual([widget]); expect(project.contributions).toHaveLength(1);
    expect(f.validate("NSEControlGallery").manifest).toEqual(project.bundles[0].manifest);
  });
  it("removes development applications and their integrations", () => {
    const f = fixture(); f.app("AnimationFX", { bundleIdentifier: "com.example.AnimationFX", displayName: "Effects", version: "5.0.0" });
    f.app("Diagnostics", { bundleIdentifier: "com.example.diagnostics", displayName: "Diagnostics", version: "1.0.0", availability: "development" });
    f.put("src/Integrations/Diagnostics.integration.ts", "export default defineIntegration({});", { default: webspring.defineIntegration({ owners: ["com.example.diagnostics"], install() {} }) });
    expect(f.project({}, false).bundles.map(bundle => bundle.manifest.bundleIdentifier)).toEqual(["com.example.AnimationFX"]);
    expect(f.project({}, false).contributions).toEqual([]);
    expect(f.project({ applications: ["COM.EXAMPLE.ANIMATIONFX"] }).contributions).toEqual([]);
  });
  it.each(["bundleIdentifier", "displayName", "version"])("plugin and validator reject missing %s without package fallbacks", key => {
    const f = fixture();
    const info: Record<string, string> = { bundleIdentifier: "com.example.notes", displayName: "Notes", version: "1.0.0" }; delete info[key];
    f.app("Notes", info);
    expect(() => f.project()).toThrow(new RegExp(`Notes.app.*${key}|${key}.*Notes.app`));
    const result = f.validate("Notes"); expect(result.ok).toBe(false); expect(result.error).toContain(key);
  });
  it("requires Info.ts instead of inferring identity from the folder", () => {
    const f = fixture(); f.put("src/SynWare/Notes.app/Contents/index.tsx", "export default function Notes() { return null; }");
    expect(() => f.project()).toThrow(/Notes.app.*Info.ts/); expect(f.validate("Notes").ok).toBe(false);
  });
  it.each(["notes", "example.notes", "com.example.bad_name", "com..notes", "com.example.notes "])("plugin and validator reject invalid identifier %s", bundleIdentifier => {
    const f = fixture(); f.app("Notes", { bundleIdentifier, displayName: "Notes", version: "1.0.0" });
    expect(() => f.project()).toThrow(/bundleIdentifier/); expect(f.validate("Notes").ok).toBe(false);
  });
  it("rejects case-only duplicate identities", () => {
    const f = fixture(); f.app("First", { bundleIdentifier: "com.example.Notes", displayName: "First", version: "1.0.0" });
    f.app("Second", { bundleIdentifier: "COM.EXAMPLE.notes", displayName: "Second", version: "1.0.0" });
    expect(() => f.project()).toThrow(/duplicate|collision|same.*identifier/i);
  });
  it.each(["src/SynWare/Notes.app/Contents/index.tsx", "src/Preferences/Billing.prefPane/index.tsx", "src/Widgets/Latest.widget/index.tsx", "src/Integrations/Journal.integration.ts"])("rejects missing default exports with the folder name: %s", path => {
    const f = fixture(); if (path.includes("Notes.app")) f.app("Notes"); f.put(path, "export const value = 1;"); expect(() => f.project()).toThrow(/default-export/);
  });
  it("rejects wrong pane exports with the expected declaration", () => {
    const f = fixture(); f.put("src/Preferences/Billing.prefPane/index.tsx", "export default {};", { default: {} }); expect(() => f.project()).toThrow(/Billing.prefPane.*definePreferencePane/);
  });
  it.each(["export default 42;", "export default {};", "// export default Fake\nexport const value = 1;"])("rejects an invalid application export during discovery: %s", source => {
    const f = fixture(); f.app("Notes"); f.put("src/SynWare/Notes.app/Contents/index.tsx", source); expect(() => f.project()).toThrow(/Notes.app.*default-export/);
  });
  it("binds root imports using the case-insensitive canonical lookup key", async () => {
    const f = fixture(); f.app("AnimationFX", { bundleIdentifier: "com.example.AnimationFX", displayName: "Effects", version: "1.0.0" });
    const plugin = synCloudOS({ webspringEntry: false }); await plugin.configResolved({ root: f.root, command: "serve" });
    expect(await plugin.resolveId("@syndromatic/syncloudos", resolve(f.root, "src/SynWare/AnimationFX.app/Contents/view.tsx"))).toBe("\0virtual:syncloudos/app/com.example.animationfx");
    expect(await plugin.resolveId("@syndromatic/syncloudos", resolve(f.root, "src/shared.ts"))).toBeNull();
  });
});
