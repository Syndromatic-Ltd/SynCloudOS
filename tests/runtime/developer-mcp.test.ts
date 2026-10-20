/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import { inspectProject, lookupSdk, validateProject, scaffold, explainError } from "../../scripts/developer-mcp/tools.mjs";
import { errorCatalogue } from "../../src/SynCloudOS/ErrorManager/errorCatalogue";
import { parseManifest } from "../../scripts/synware/validation-core.mjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { writeDeveloperMcpPackage, writeDeveloperSdkData } from "../../scripts/developer-mcp/build-package.mjs";
import { discoverSynWareProject } from "../../scripts/synware/vite-plugin.mjs";

const repository = resolve(import.meta.dirname, "../..");
let project: string;
function put(path: string, text: string) { const file = resolve(project, path); mkdirSync(resolve(file, ".."), { recursive: true }); writeFileSync(file, text); }
beforeEach(() => {
  project = mkdtempSync(resolve(tmpdir(), "syncloudos-mcp-test-"));
  put("package.json", JSON.stringify({ name: "consumer", version: "2.3.4", dependencies: { "@syndromatic/syncloudos": "1.0.0-beta.2" } }));
  put("vite.config.ts", 'import { synCloudOS } from "@syndromatic/syncloudos/vite"; export default {plugins:[synCloudOS({appsDirectory:"applications",webspringEntry:false})]};');
  put("node_modules/@syndromatic/syncloudos/package.json", JSON.stringify({ name: "@syndromatic/syncloudos", version: "1.0.0-beta.2", exports: { ".": { types: "./index.d.ts" }, "./sdk": { types: "./sdk.d.ts" } } }));
  const sdk = resolve(project, "node_modules/@syndromatic/syncloudos");
  cpSync(resolve(repository, "tests/fixtures/developer-mcp/sdk.d.ts"), resolve(sdk, "sdk.d.ts"));
  put("node_modules/@syndromatic/syncloudos/index.d.ts", "export declare const SCOS: { app: { bundleIdentifier: string; displayName: string; version: string } };\n");
  mkdirSync(resolve(sdk, "tooling"));
  cpSync(resolve(repository, "src/SynCloudOS/AppSDK/manifest/synapp-manifest.schema.json"), resolve(sdk, "tooling/manifest.schema.json"));
  put("node_modules/@syndromatic/syncloudos/tooling/error-catalogue.json", JSON.stringify(errorCatalogue));
  put("node_modules/@syndromatic/syncloudos/tooling/build-receipt.json", '{"commit":"fixture"}');
  put("node_modules/@syndromatic/syncloudos/docs/framework/sdk.md", '# SDK\n\n## createSynWare\n\nUse createSynWare to define an application.\n');
});
afterEach(() => rmSync(project, { recursive: true, force: true }));
describe("developer MCP tools", () => {
  it("finds project roots, installed receipts and static Vite options", async () => {
    mkdirSync(resolve(project, "nested"));
    const result = await inspectProject({ projectRoot: resolve(project, "nested") });
    expect(result.projectRoot).toBe(project);
    expect(result.sdk.version).toBe("1.0.0-beta.2");
    expect(result.sdk.buildReceipt.commit).toBe("fixture");
    expect(result.vite.options.appsDirectory).toBe("applications");
    expect(result.shell.enabled).toBe(false);
  });
  it("resolves explicit Info.ts consistently with the plugin and validator", async () => {
    put("applications/NSEControlGallery.app/Contents/index.tsx", "export default function Gallery() { return null; }");
    put("applications/NSEControlGallery.app/Contents/Info.ts", 'export default { bundleIdentifier: "com.example.NSEControlGallery", displayName: "NSE Control Gallery", version: "1.0.0" };');
    const inspected = await inspectProject({ projectRoot: project });
    expect(inspected.bundles[0].resolvedManifest).toMatchObject({ bundleIdentifier: "com.example.NSEControlGallery", displayName: "NSE Control Gallery", version: "1.0.0", schemaVersion: 1 });
    const validated = await validateProject({ projectRoot: project, typescript: false });
    expect(validated.ok).toBe(true);
    expect(validated.bundles[0].manifest).toEqual(inspected.bundles[0].resolvedManifest);
    const plugin = discoverSynWareProject(project, { appsDirectory: "applications", webspringEntry: false });
    expect(plugin.bundles[0].manifest).toEqual(inspected.bundles[0].resolvedManifest);
  });
  it.each(["preferencePane", "widget", "integration"])("scaffolds and validates %s", async kind => {
    await scaffold({ projectRoot: project, name: "Latest", kind, owners: ["com.example.notes"] });
    expect((await inspectProject({ projectRoot: project })).folders).toHaveLength(1);
    expect((await validateProject({ projectRoot: project, typescript: false })).ok).toBe(true);
  });
  it("lists entries and returns signatures, JSDoc and relevant offline sections", async () => {
    expect((await lookupSdk({ projectRoot: project })).entries).toContain("sdk");
    const result = await lookupSdk({ projectRoot: project, entry: "sdk", query: "createSynWre" });
    expect(result.symbols[0].name).toBe("createSynWare");
    expect(result.symbols[0].signature).toContain("options:");
    expect(result.symbols[0].jsDoc).toContain("runnable SynWare");
    expect(result.docs[0].text).toContain("define an application");
    expect((await lookupSdk({ projectRoot: project, entry: "sdk", query: "noSuchUnrelatedSymbol" })).symbols).toEqual([]);
  });
  it.each(["application menu", "settings", "preferences", "account"])("prioritises the public application-menu entry and example for %s", async query => {
    put("node_modules/@syndromatic/syncloudos/sdk.d.ts", [
      "export declare function useApplicationMenuTrigger(): { open(anchor: HTMLElement): void } | null;",
      "export interface SynWareApplicationMenuManifest { trigger?: 'content'; preferences?: { commandId: string }; }",
      "export interface NSEApplicationMenuProps { settings: unknown; }",
      "export declare function getAccountAvailability(): boolean;",
    ].join("\n"));
    put("node_modules/@syndromatic/syncloudos/docs/framework/menu.md", '# Menus\n\n## Application menu and Preferences\n\nAccount opens through System Preferences. Declare applicationMenu: { trigger: "content" }.\n\n```tsx\nconst menu = useApplicationMenuTrigger();\n```\n');
    put("node_modules/@syndromatic/syncloudos/docs/framework/low-level.md", "# Low-level settings and account\n\nNSEApplicationMenuProps configures menu props.\n");
    const result = await lookupSdk({ projectRoot: project, query });
    expect(result.symbols[0].name).toBe("useApplicationMenuTrigger");
    expect(result.symbols[1].name).toBe("SynWareApplicationMenuManifest");
    expect(result.docs[0].file).toBe("docs/framework/menu.md");
    expect(result.docs[0].text).toContain("```tsx");
  });
  it("keeps access private by default and returns host-mode next steps", async () => {
    const result = await scaffold({ projectRoot: project, bundleIdentifier: "org.example.private", name: "Private", route: "/private" });
    expect(parseManifest(resolve(project, result.createdPaths[0])).runtime?.policy?.public).toBeUndefined();
    expect(result.nextSteps.length).toBeGreaterThan(0);
  });
  it.each([true, false])("preserves an explicit public=%s policy and windowed presentation", async isPublic => {
    const policy = { public: isPublic, requiresLogin: !isPublic, requiredCapabilities: ["documents.read"], requiredAccessClasses: ["team"] };
    const result = await scaffold({ projectRoot: project, bundleIdentifier: "org.example.inspector", name: "Inspector", route: "/inspector", policy, presentation: "windowedView" });
    expect(parseManifest(resolve(project, result.createdPaths[0])).runtime).toEqual({ policy, presentation: "windowedView" });
    expect((await validateProject({ projectRoot: project, typescript: false })).ok).toBe(true);
  });
  it("rejects policy fields and presentations outside the installed manifest schema before writing", async () => {
    await expect(scaffold({ projectRoot: project, bundleIdentifier: "org.example.bad", name: "Bad", route: "/bad", policy: { access: "public" } })).rejects.toThrow();
    await expect(scaffold({ projectRoot: project, bundleIdentifier: "org.example.bad", name: "Bad", route: "/bad", presentation: "window" })).rejects.toThrow();
    expect((await inspectProject({ projectRoot: project })).bundles).toEqual([]);
  });
  it("scaffolds a working content application-menu button only when explicitly requested", async () => {
    const result = await scaffold({ projectRoot: project, bundleIdentifier: "org.example.primary", name: "Primary", route: "/primary", policy: { public: true }, contentApplicationMenu: true });
    const manifest = parseManifest(resolve(project, result.createdPaths[0]));
    expect(manifest.applicationMenu).toEqual({ trigger: "content" });
    const code = ts.transpileModule(readFileSync(resolve(project, "applications/Primary.app/Contents/index.tsx"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const anchors: unknown[] = [];
    let toggles = 0;
    let port: { setAnchor(element: unknown): void; toggle(): void; label: string; open: boolean } | null = { setAnchor: element => { anchors.push(element); }, toggle: () => { toggles++; }, label: "Application menu", open: true };
    type GeneratedButton = { type: string; props: { disabled: boolean; ref(element: unknown): void; onClick(): void } };
    const module: { exports: { default?: () => { props: { children: GeneratedButton[] } } } } = { exports: {} };
    const require = createRequire(import.meta.url);
    new Function("require", "module", "exports", code)((name: string) => name === "@syndromatic/syncloudos" ? { SCOS: { app: { bundleIdentifier: "org.example.primary", displayName: "Primary", version: "1.0.0" } }, useApplicationMenuTrigger: () => port } : require(name), module, module.exports);
    const root = module.exports.default!;
    const button = root().props.children.find(child => child.type === "button")!;
    expect(button.props).toMatchObject({ disabled: false, "aria-haspopup": "menu", "aria-expanded": true, children: "Application menu" });
    button.props.ref("anchor");
    button.props.onClick();
    expect(anchors).toEqual(["anchor"]);
    expect(toggles).toBe(1);
    port = null;
    expect(root().props.children.find(child => child.type === "button")!.props.disabled).toBe(true);
  });
  it("keeps public scaffolds without a content menu explicit about authenticated fullscreen hosting", async () => {
    const result = await scaffold({ projectRoot: project, bundleIdentifier: "org.example.primary", name: "Primary", route: "/primary", policy: { public: true } });
    expect(parseManifest(resolve(project, result.createdPaths[0])).applicationMenu).toBeUndefined();
    expect(result.nextSteps.some((step: string) => step.includes("optional") && step.includes("required") && step.includes("applicationMenu"))).toBe(true);
  });
  it("keeps the content-menu next step when explicit policy and presentation flags are given, but not for a windowed secondary", async () => {
    const primary = await scaffold({ projectRoot: project, bundleIdentifier: "org.example.primary", name: "Primary", route: "/primary", policy: { public: true, requiresLogin: false }, presentation: "appView", contentApplicationMenu: false });
    expect(primary.nextSteps.some((step: string) => step.includes('applicationMenu: { trigger: "content" }') && step.includes("useApplicationMenuTrigger"))).toBe(true);
    const secondary = await scaffold({ projectRoot: project, bundleIdentifier: "org.example.secondary", name: "Secondary", route: "/secondary", policy: { public: true }, presentation: "windowedView" });
    expect(secondary.nextSteps.some((step: string) => step.includes("applicationMenu"))).toBe(false);
  });
  it.each([
    ["authentication: \"optional\", application: { bundleIdentifier: \"org.example.primary\" }", undefined],
    ["authentication: { policy: \"required\" }, application: { bundleIdentifier: \"org.example.primary\", frame: \"fullscreen\" }", "windowedView"],
    ["authentication: \"required\", application: { bundleIdentifier: \"org.example.primary\", frame: \"declared\" }", "appView"],
  ])("finds a missing content-menu declaration in a literal primary mount: %s", async (options, presentation) => {
    await scaffold({ projectRoot: project, bundleIdentifier: "org.example.primary", name: "Primary", route: "/primary", presentation });
    put("src/main.tsx", `import { mountSynCloudOS as mount } from "@syndromatic/syncloudos/browser"; mount({ ${options} });`);
    const result = await validateProject({ projectRoot: project, typescript: false });
    expect(result.host.status).toBe("checked");
    expect(result.findings).toContainEqual(expect.objectContaining({ file: "applications/Primary.app/Contents/Info.ts", rule: "synware.application-menu" }));
    expect(result.ok).toBe(false);
  });
  it.each([
    ["authentication: \"disabled\", application: { bundleIdentifier: \"org.example.primary\" }", undefined, false],
    ["application: { bundleIdentifier: \"org.example.primary\" }", undefined, false],
    ["authentication: \"optional\", application: { bundleIdentifier: \"org.example.primary\", frame: \"declared\" }", "windowedView", false],
    ["authentication: \"required\", application: { bundleIdentifier: \"org.example.primary\" }", undefined, true],
  ])("does not flag supported literal host configurations: %s", async (options, presentation, contentApplicationMenu) => {
    await scaffold({ projectRoot: project, bundleIdentifier: "org.example.primary", name: "Primary", route: "/primary", presentation, contentApplicationMenu });
    put("src/main.tsx", `import { mountSynCloudOS } from "@syndromatic/syncloudos/browser"; mountSynCloudOS({ ${options} });`);
    const result = await validateProject({ projectRoot: project, typescript: false });
    expect(result.host.status).toBe("checked");
    expect(result.ok).toBe(true);
  });
  it("reads a top-level awaited mount whose unrelated options use shorthand properties", async () => {
    await scaffold({ projectRoot: project, bundleIdentifier: "org.example.primary", name: "Primary", route: "/primary" });
    put("src/main.tsx", "import { mountSynCloudOS } from \"@syndromatic/syncloudos/browser\"; const element = document.body, bundles = []; const host = await mountSynCloudOS({ element, bundles, application: { bundleIdentifier: \"org.example.primary\", frame: \"fullscreen\" }, authentication: \"optional\" });");
    const result = await validateProject({ projectRoot: project, typescript: false });
    expect(result.host).toMatchObject({ status: "checked", authentication: "optional", application: { bundleIdentifier: "org.example.primary", frame: "fullscreen" } });
    expect(result.findings).toContainEqual(expect.objectContaining({ rule: "synware.application-menu" }));
  });
  it("leaves a shorthand authentication or application value unresolved", async () => {
    await scaffold({ projectRoot: project, bundleIdentifier: "org.example.primary", name: "Primary", route: "/primary" });
    put("src/main.tsx", "import { mountSynCloudOS } from \"@syndromatic/syncloudos/browser\"; const authentication = \"optional\"; mountSynCloudOS({ application: { bundleIdentifier: \"org.example.primary\" }, authentication });");
    expect((await validateProject({ projectRoot: project, typescript: false })).host.status).toBe("unresolved");
  });
  it.each([
    "mountSynCloudOS(options)",
    "mountSynCloudOS({ ...options, application: { bundleIdentifier: \"org.example.primary\" }, authentication: \"optional\" })",
    "mountSynCloudOS({ application: { bundleIdentifier: primaryId }, authentication: \"optional\" })",
    "mountSynCloudOS({ application: { bundleIdentifier: \"org.example.primary\" }, authentication: auth })",
    "mountSynCloudOS({ application: { bundleIdentifier: \"org.example.primary\", frame: frameMode }, authentication: \"optional\" })",
    "mountSynCloudOS({ application: { bundleIdentifier: \"org.example.primary\", ...application }, authentication: \"optional\" })",
    "mountSynCloudOS({ application: { bundleIdentifier: \"org.example.primary\" }, authentication: { ...auth, policy: \"optional\" } })",
    "mountSynCloudOS({ application: { bundleIdentifier: \"org.example.primary\" }, authentication: \"disabled\", authentication: auth })",
    "function start(mountSynCloudOS) { mountSynCloudOS({ application: { bundleIdentifier: \"org.example.primary\" }, authentication: \"optional\" }); }",
  ])("does not guess computed host configuration: %s", async call => {
    await scaffold({ projectRoot: project, bundleIdentifier: "org.example.primary", name: "Primary", route: "/primary" });
    put("src/main.tsx", `import { mountSynCloudOS } from "@syndromatic/syncloudos/browser"; ${call};`);
    const result = await validateProject({ projectRoot: project, typescript: false });
    expect(result.host.status).toBe("unresolved");
    expect(result.findings).toEqual([]);
  });
  it("leaves ambiguous mounts unresolved and ignores unrelated similarly named functions", async () => {
    await scaffold({ projectRoot: project, bundleIdentifier: "org.example.primary", name: "Primary", route: "/primary" });
    put("src/main.tsx", "import { mountSynCloudOS } from \"@syndromatic/syncloudos/browser\"; mountSynCloudOS({ application: { bundleIdentifier: \"org.example.primary\" }, authentication: \"optional\" }); mountSynCloudOS({ shell });");
    expect((await validateProject({ projectRoot: project, typescript: false })).host.status).toBe("unresolved");
    put("src/main.tsx", "function mountSynCloudOS(options: unknown) {} mountSynCloudOS({ application: { bundleIdentifier: \"org.example.primary\" }, authentication: \"optional\" });");
    const result = await validateProject({ projectRoot: project, typescript: false });
    expect(result.host.status).toBe("not-found");
    expect(result.findings).toEqual([]);
  });
  it("scaffolds a valid app without overwriting any existing bundle", async () => {
    const result = await scaffold({ projectRoot: project, bundleIdentifier: "org.example.notes", name: "Notes", route: "/notes" });
    expect(result.createdPaths).toContain("applications/Notes.app/Contents/Info.ts");
    const checked = await validateProject({ projectRoot: project, typescript: false });
    expect(checked.ok).toBe(true);
    expect((await inspectProject({ projectRoot: project })).bundles[0].bundleIdentifier).toBe("org.example.notes");
    await expect(scaffold({ projectRoot: project, bundleIdentifier: "org.example.notes", name: "Notes", route: "/notes" })).rejects.toThrow(/exist/i);
    await expect(scaffold({ projectRoot: project, bundleIdentifier: "org.example.bad", name: "../Escape", route: "/bad" })).rejects.toThrow();
  });
  it("reports manifest, missing bundle entry and TypeScript findings structurally", async () => {
    await scaffold({ projectRoot: project, bundleIdentifier: "org.example.notes", name: "Notes", route: "/notes" });
    put("applications/Notes.app/Contents/Info.ts", 'export default { bundleIdentifier: "INVALID ID", displayName: "Notes", version: "1.0.0" };');
    let result = await validateProject({ projectRoot: project, typescript: false });
    expect(result.ok).toBe(false);
    expect(result.findings[0]).toMatchObject({ rule: "synware.manifest", line: expect.any(Number), file: expect.stringContaining("Info.ts") });
    rmSync(resolve(project, "applications/Notes.app/Contents/index.tsx"));
    result = await validateProject({ projectRoot: project, typescript: false });
    expect(result.findings.some((finding: {rule:string}) => finding.rule === "synware.structure")).toBe(true);
    symlinkSync(resolve(repository, "node_modules/typescript"), resolve(project, "node_modules/typescript"), "junction");
    put("tsconfig.json", JSON.stringify({compilerOptions:{strict:true,types:[],skipLibCheck:true},include:["src"]}));
    put("src/broken.ts", "\n\nconst value: string = 3;\n");
    result = await validateProject({ projectRoot: project });
    expect(result.findings).toContainEqual({file:"src/broken.ts",line:3,column:7,rule:"TS2322",message:"Type 'number' is not assignable to type 'string'."});
  });
  it.each(["[NSE_CONTROLLER_DISPOSED]", "AFX_LAYER_DISPOSED"])("explains exact code tokens in pasted messages: %s", async code => {
    const result = await explainError({ projectRoot: project, query: `Resource is no longer available. ${code}` });
    expect(result.matches[0].code).toBe(code.replace(/[[\]]/gu, ""));
    expect(result.classification.kind).toBe("catalogue");
    expect(result.related).toEqual([]);
  });
  it("keeps fuzzy symptoms separate from diagnoses and excludes partial code tokens", async () => {
    const result = await explainError({ projectRoot: project, query: "optional authentication login session account UI missing" });
    expect(result.matches).toEqual([]);
    expect(result.classification.kind).toBe("unclassified");
    expect(result.relatedThreshold).toBe(0.3);
    expect(result.related.every((entry: {score:number}) => entry.score >= result.relatedThreshold)).toBe(true);
    expect((await explainError({ projectRoot: project, query: "NOT_APP_NOT_FOUND_SUFFIX" })).matches).toEqual([]);
    const disposed = await explainError({ projectRoot: project, query: 'Controller "open-account" is disposed.' });
    expect(disposed.matches).toEqual([]);
    expect(disposed.related.some((entry: {code:string}) => entry.code === "NSE_CONTROLLER_DISPOSED")).toBe(true);
  });
  it("recognises public SDK error classes through installed declaration re-exports", async () => {
    put("node_modules/@syndromatic/syncloudos/sdk.d.ts", 'export { GFXColourParseError } from "./graphics.js";');
    put("node_modules/@syndromatic/syncloudos/graphics.d.ts", '/** Invalid colour input. */\nexport declare class GFXColourParseError extends Error { readonly reason: string; }\ndeclare class PrivateParseError extends Error {}');
    put("node_modules/@syndromatic/syncloudos/docs/framework/graphics.md", '# Graphics\n\n## Colour parsing\n\nCatch GFXColourParseError and inspect its reason.\n');
    const result = await explainError({ projectRoot: project, query: 'GFXColourParseError: Cannot parse colour "definitely-not-a-colour": syntax.' });
    expect(result.classification.kind).toBe("sdk-error");
    expect(result.matches).toEqual([]);
    expect(result.sdkErrors[0]).toMatchObject({ name: "GFXColourParseError", file: "graphics.d.ts" });
    expect(result.sdkErrors[0].signature).toContain("extends Error");
    expect(result.sdkErrors[0].docs[0].file).toBe("docs/framework/graphics.md");
    expect((await explainError({ projectRoot: project, query: "PrivateParseError: invalid" })).sdkErrors).toEqual([]);
  });
  it("classifies TypeScript diagnostics outside the runtime catalogue with symbol lookup guidance", async () => {
    const result = await explainError({ projectRoot: project, query: "src/main.tsx(9,36): error TS2345: Argument of type 'MountSynCloudOSOptions' is not assignable." });
    expect(result.classification).toMatchObject({ kind: "typescript", catalogue: false, codes: ["TS2345"] });
    expect(result.matches).toEqual([]);
    expect(result.related).toEqual([]);
    expect(result.suggestedLookups).toContain("MountSynCloudOSOptions");
    expect(result.nextSteps.length).toBeGreaterThan(0);
  });
  it.each(["npm warn 1 package had install scripts blocked: esbuild", "npm WARN deprecated example@1.0.0"])("classifies npm warnings outside the runtime catalogue: %s", async query => {
    const result = await explainError({ projectRoot: project, query });
    expect(result.classification).toMatchObject({ kind: "npm-warning", catalogue: false });
    expect(result.matches).toEqual([]);
    expect(result.related).toEqual([]);
    expect(result.nextSteps.length).toBeGreaterThan(0);
  });
  it("follows declaration re-exports without exposing private declarations", async () => {
    put("node_modules/@syndromatic/syncloudos/sdk.d.ts", 'export { publicFunction as renamedFunction } from "./inner.js";');
    put("node_modules/@syndromatic/syncloudos/inner.d.ts", '/** Public operation. */\nexport declare function publicFunction(value: string): number;\ndeclare const privateValue: number;');
    const result = await lookupSdk({projectRoot:project,entry:"sdk",query:"renamedFunction"});
    expect(result.symbols[0]).toMatchObject({name:"renamedFunction",jsDoc:"Public operation."});
    expect(result.symbols[0].signature).toContain("value: string");
    expect((await lookupSdk({projectRoot:project,entry:"sdk",query:"privateValue"})).symbols).toEqual([]);
  });
  it("requires matching versions and explicit overrides for computed Vite options", async () => {
    put("vite.config.ts", 'import { synCloudOS as os } from "@syndromatic/syncloudos/vite"; const apps = "elsewhere"; export default {plugins:[os({appsDirectory:apps,webspringEntry:false})]};');
    await expect(inspectProject({projectRoot:project})).rejects.toThrow(/Computed Vite/);
    expect((await inspectProject({projectRoot:project,appsDirectory:"elsewhere"})).vite.options.appsDirectory).toBe("elsewhere");
    put("node_modules/@syndromatic/syncloudos/package.json", JSON.stringify({name:"@syndromatic/syncloudos",version:"9.0.0"}));
    await expect(inspectProject({projectRoot:project})).rejects.toThrow(/requires installed SDK/);
  });
  it("reports unsupported imports and a missing project compiler without passing", async () => {
    await scaffold({projectRoot:project,bundleIdentifier:"org.example.notes",name:"Notes",route:"/notes"});
    put("applications/Notes.app/Contents/index.tsx", 'import secret from "framework/private"; export default secret;');
    const result = await validateProject({projectRoot:project});
    expect(result.ok).toBe(false);
    expect(result.findings.map((finding:{rule:string})=>finding.rule)).toContain("synware.imports");
    expect(result.findings.map((finding:{rule:string})=>finding.rule)).toContain("typescript.missing");
  });
  it("serves real MCP tool schemas and structured results over stdio", async () => {
    const client = new Client({name:"unit-test",version:"1.0.0"});
    const transport = new StdioClientTransport({command:process.execPath,args:[resolve(repository,"scripts/developer-mcp/server.mjs"),"--project",project],stderr:"pipe"});
    try {
      await client.connect(transport);
      const listed = await client.listTools();
      expect(listed.tools.map(tool=>tool.name)).toHaveLength(5);
      expect(listed.tools.find(tool=>tool.name==="syncloudos.scaffold")?.inputSchema.required).toEqual(["name"]);
      expect(listed.tools.find(tool=>tool.name==="syncloudos.scaffold")?.inputSchema.properties?.contentApplicationMenu).toMatchObject({ type: "boolean" });
      const scaffolded = await client.callTool({ name: "syncloudos.scaffold", arguments: { bundleIdentifier: "org.example.menu", name: "Menu", route: "/menu", contentApplicationMenu: true } });
      expect(scaffolded.isError).not.toBe(true);
      expect(parseManifest(resolve(project, "applications/Menu.app/Contents/Info.ts")).applicationMenu).toEqual({ trigger: "content" });
      const response = await client.callTool({name:"syncloudos.inspect_project",arguments:{}});
      expect(response.isError).not.toBe(true);
      expect(response.structuredContent).toMatchObject({sdk:{version:"1.0.0-beta.2"}});
    } finally {await client.close();}
  });
  it("assembles a lockstep companion and generates offline SDK data from framework sources", async () => {
    const sdk = resolve(project,"node_modules/@syndromatic/syncloudos");
    await writeDeveloperSdkData({repositoryRoot:repository,directory:sdk,commit:"fixture",source:{sha256:"fixture-source"}});
    expect(JSON.parse(readFileSync(resolve(sdk,"tooling/error-catalogue.json"),"utf8"))).toEqual(errorCatalogue);
    expect(JSON.parse(readFileSync(resolve(sdk,"tooling/build-receipt.json"),"utf8"))).toMatchObject({commit:"fixture",sourceSha256:"fixture-source"});
    expect(readFileSync(resolve(sdk,"docs/framework/developer-mcp.md"),"utf8")).toContain("mcp_servers.syncloudos");
    const companion = resolve(project,"companion");
    const manifest = writeDeveloperMcpPackage({repositoryRoot:repository,directory:companion,sdkVersion:"1.0.0-beta.2"});
    expect(manifest.peerDependencies).toEqual({"@syndromatic/syncloudos":"1.0.0-beta.2"});
    expect(manifest.bin).toEqual({"syncloudos-mcp":"scripts/developer-mcp/server.mjs"});
    expect(manifest.dependencies["@modelcontextprotocol/sdk"]).toBeTruthy();
    expect(readFileSync(resolve(companion,"scripts/synware/validation-core.mjs"),"utf8")).toContain("createSynWareValidator");
  });
});
