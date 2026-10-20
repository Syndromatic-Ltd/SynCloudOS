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
  function app(name: string, overrides?: object) {
    put(`src/SynWare/${name}.app/Contents/index.tsx`, "export default function App() { return null; }");
    if (overrides) put(`src/SynWare/${name}.app/Contents/Info.ts`, `export default ${JSON.stringify(overrides)};`, { default: overrides });
  }
  function project(options = {}, development = true) {
    const discovered = discoverSynWareProject(root, { webspringEntry: false, ...options });
    const code = ts.transpileModule(discovered.code.replaceAll("import.meta.env.DEV", String(development)), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    // The real generated module is evaluated below; assertions inspect its public exports.
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
  return { root, put, app, project };
}

describe("folder-derived projects", () => {
  it("discovers every folder kind and derives capital runs, version, icons and locale files", () => {
    const f = fixture(); f.app("NSEControlGallery");
    f.put("src/SynWare/NSEControlGallery.app/Contents/Resources/AppIcon.svg", "<svg/>");
    f.put("src/SynWare/NSEControlGallery.app/Contents/Resources/AppIcon.png", "png");
    f.put("src/SynWare/NSEControlGallery.app/Contents/Resources/Localised/Base.locale/Localisable.strings", '"hello" = "Hello";');
    const pane = definePreferencePane({ id: "billing", title: "Billing", order: 2, view: () => null });
    f.put("src/Preferences/Billing.prefPane/index.tsx", "export default definePreferencePane({});", { default: pane });
    const widget = webspring.defineWidget({ id: "latest", title: "Latest", load: async () => "Latest", view: () => null, whenEmpty: "hide" });
    f.put("src/Widgets/Latest.widget/index.tsx", "export default defineWidget({});", { default: widget });
    const integration = webspring.defineIntegration({ owners: ["nse-control-gallery"], install() {} });
    f.put("src/Integrations/Journal.integration.ts", "export default defineIntegration({});", { default: integration });
    const project = f.project();
    expect(project.bundles[0].manifest).toMatchObject({ schemaVersion: 1, id: "nse-control-gallery", title: "NSE Control Gallery", version: "2.3.4", webspring: { icon: "./Resources/AppIcon.svg" } });
    expect(project.bundles[0].localeResources).toEqual({ "Base.locale": { "Localisable.strings": '"hello" = "Hello";' } });
    expect(project.preferences).toEqual([pane]); expect(project.widgets).toEqual([widget]); expect(project.contributions).toHaveLength(1);
  });
  it("honours overrides and removes development applications and their integrations", () => {
    const f = fixture(); f.app("AnimationFX", { id: "animationfx", title: "Effects", version: "5.0.0" }); f.app("Diagnostics", { availability: "development" });
    f.put("src/Integrations/Diagnostics.integration.ts", "export default defineIntegration({});", { default: webspring.defineIntegration({ owners: ["diagnostics"], install() {} }) });
    const project = f.project({}, false);
    expect(project.bundles.map(bundle => bundle.manifest.id)).toEqual(["animationfx"]);
    expect(project.bundles[0].manifest).toMatchObject({ title: "Effects", version: "5.0.0" });
    expect(project.contributions).toEqual([]);
    expect(f.project({ applications: ["animationfx"] }).contributions).toEqual([]);
  });
  it.each(["src/SynWare/Notes.app/Contents/index.tsx", "src/Preferences/Billing.prefPane/index.tsx", "src/Widgets/Latest.widget/index.tsx", "src/Integrations/Journal.integration.ts"])("rejects missing default exports with the folder name: %s", path => {
    const f = fixture(); f.put(path, "export const value = 1;");
    expect(() => f.project()).toThrow(/default-export/);
  });
  it("rejects wrong pane exports with the expected declaration", () => {
    const f = fixture(); f.put("src/Preferences/Billing.prefPane/index.tsx", "export default {};", { default: {} });
    expect(() => f.project()).toThrow(/Billing.prefPane.*definePreferencePane/);
  });
  it.each(["export default 42;", "export default {};", "// export default Fake\nexport const value = 1;"])("rejects an invalid application export during discovery: %s", source => {
    const f = fixture(); f.put("src/SynWare/Notes.app/Contents/index.tsx", source);
    expect(() => f.project()).toThrow(/Notes.app.*default-export/);
  });
  it("shares the plugin manifest with the static validator without Info.ts", () => {
    const f = fixture(); f.app("JournalPublisher");
    const schema = JSON.parse(readFileSync(new URL("../../src/SynCloudOS/AppSDK/manifest/synapp-manifest.schema.json", import.meta.url), "utf8"));
    const result = createSynWareValidator({ schema, allowedImports: [] }).validate(resolve(f.root, "src/SynWare/JournalPublisher.app"));
    expect(result.ok).toBe(true); expect(result.manifest).toEqual(f.project().bundles[0].manifest);
  });
  it("binds root imports inside an app to its explicit application ID only", async () => {
    const f = fixture(); f.app("AnimationFX", { id: "animationfx" });
    const plugin = synCloudOS({ webspringEntry: false }); await plugin.configResolved({ root: f.root, command: "serve" });
    expect(await plugin.resolveId("@syndromatic/syncloudos", resolve(f.root, "src/SynWare/AnimationFX.app/Contents/view.tsx"))).toBe("\0virtual:syncloudos/app/animationfx");
    expect(await plugin.resolveId("@syndromatic/syncloudos", resolve(f.root, "src/shared.ts"))).toBeNull();
  });
});
