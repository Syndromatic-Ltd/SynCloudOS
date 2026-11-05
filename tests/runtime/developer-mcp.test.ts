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
import { hostEntryFor, runLaunchCheck } from "../../scripts/developer-mcp/launch-check.mjs";
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
  put("node_modules/@syndromatic/syncloudos/package.json", JSON.stringify({ name: "@syndromatic/syncloudos", version: "1.0.0-beta.2", exports: { ".": { types: "./index.d.ts" }, "./sdk": { types: "./sdk.d.ts" }, "./nse/controls": { types: "./nse-controls.d.ts" }, "./nse/styles.css": "./nse/styles.css" } }));
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
  it("scaffolds a working NSEPushButton content application-menu trigger only when explicitly requested", async () => {
    const result = await scaffold({ projectRoot: project, bundleIdentifier: "org.example.primary", name: "Primary", route: "/primary", policy: { public: true }, contentApplicationMenu: true });
    const manifest = parseManifest(resolve(project, result.createdPaths[0]));
    expect(manifest.applicationMenu).toEqual({ trigger: "content" });
    expect(readFileSync(resolve(project, "applications/Primary.app/Contents/index.tsx"), "utf8")).toContain("extends NSEApplication");
    const code = ts.transpileModule(readFileSync(resolve(project, "applications/Primary.app/Contents/Views/ApplicationMenuButton.tsx"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const anchors: unknown[] = [];
    let toggles = 0;
    let port: { setAnchor(element: unknown): void; toggle(): void; label: string; open: boolean } | null = { setAnchor: element => { anchors.push(element); }, toggle: () => { toggles++; }, label: "Application menu", open: true };
    type GeneratedButton = { type: unknown; props: { disabled: boolean; ref(element: unknown): void; onClick(): void } };
    const NSEPushButton = function NSEPushButton() { return null; };
    const module: { exports: { ApplicationMenuButton?: () => GeneratedButton } } = { exports: {} };
    const require = createRequire(import.meta.url);
    new Function("require", "module", "exports", code)((name: string) => name === "@syndromatic/syncloudos" ? { useApplicationMenuTrigger: () => port } : name === "@syndromatic/syncloudos/nse/controls" ? { NSEPushButton } : require(name), module, module.exports);
    const render = module.exports.ApplicationMenuButton!;
    const button = render();
    expect(button.type).toBe(NSEPushButton);
    expect(button.props).toMatchObject({ disabled: false, "aria-haspopup": "menu", "aria-expanded": true, children: "Application menu" });
    button.props.ref("anchor");
    button.props.onClick();
    expect(anchors).toEqual(["anchor"]);
    expect(toggles).toBe(1);
    port = null;
    expect(render().props.disabled).toBe(true);
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
  it.each([
    "authentication: \"disabled\", application: { bundleIdentifier: \"org.example.primary\" }",
    "application: { bundleIdentifier: \"org.example.primary\" }",
  ])("flags a primary that requires sign-in on a host that disables it: %s", async (options) => {
    await scaffold({ projectRoot: project, bundleIdentifier: "org.example.primary", name: "Primary", route: "/primary", policy: { requiresLogin: true } });
    put("src/main.tsx", `import { mountSynCloudOS } from "@syndromatic/syncloudos/browser"; mountSynCloudOS({ ${options} });`);
    const result = await validateProject({ projectRoot: project, typescript: false, launch: false });
    expect(result.findings).toContainEqual(expect.objectContaining({ file: "applications/Primary.app/Contents/Info.ts", rule: "synware.public-policy", message: expect.stringContaining("remove requiresLogin") }));
    expect(result.ok).toBe(false);
  });
  it("does not ask a primary on a no-sign-in host to be public", async () => {
    await scaffold({ projectRoot: project, bundleIdentifier: "org.example.primary", name: "Primary", route: "/primary" });
    put("src/main.tsx", 'import { mountSynCloudOS } from "@syndromatic/syncloudos/browser"; mountSynCloudOS({ application: { bundleIdentifier: "org.example.primary" } });');
    const result = await validateProject({ projectRoot: project, typescript: false, launch: false });
    expect(result.findings.filter((finding: { rule: string }) => finding.rule === "synware.public-policy")).toEqual([]);
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
  it("reports no idiom warnings for the default class scaffold", async () => {
    await scaffold({ projectRoot: project, bundleIdentifier: "org.example.field", name: "Field", route: "/field", policy: { public: true }, contentApplicationMenu: true });
    const result = await validateProject({ projectRoot: project, typescript: false });
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.idiomAudit.applications).toEqual([expect.objectContaining({ bundleIdentifier: "org.example.field", classAuthoring: true, rawControls: 0, unmanagedLifecycle: 0, preferenceDocumentWrites: 0 })]);
  });
  it("audits a valid but unidiomatic application with warnings that keep ok true", async () => {
    put("applications/Lab.app/Contents/Info.ts", 'export default { bundleIdentifier: "org.example.lab", displayName: "Lab", version: "1.0.0" } as const;\n');
    put("applications/Lab.app/Contents/index.tsx", 'import App from "../../../lib/App";\nexport default App;\n');
    put("lib/App.tsx", [
      'import { useEffect, useState } from "react";',
      'import { SCOS } from "@syndromatic/syncloudos";',
      'import "./theme.css";',
      'export default function App() {',
      '  const [count, setCount] = useState(0);',
      '  const [rows] = useState<number[]>([]);',
      '  useEffect(() => { const frame = requestAnimationFrame(() => {}); const worker = new Worker("x.js"); return () => { cancelAnimationFrame(frame); worker.terminate(); }; }, []);',
      '  useEffect(() => { SCOS.preferences.set("runs", { rows, count }); SCOS.preferences.set("theme", "light"); }, [rows, count]);',
      '  return <main><button onClick={() => setCount(count + 1)}>Run</button><input type="range" /><input type="hidden" /><select /><table /></main>;',
      '}',
      '',
    ].join("\n"));
    put("lib/theme.css", `/* Atmo-Onyx dark palette */\n${Array.from({ length: 14 }, (_, index) => `.c${index} { color: #${String(index).padStart(3, "0")}; }`).join("\n")}\n`);
    put("src/legacy.css", ".x { background: rgb(0 0 0); }\n");
    const result = await validateProject({ projectRoot: project, typescript: false });
    expect(result.ok).toBe(true);
    expect(result.findings.every((finding: { severity?: string }) => finding.severity === "warning")).toBe(true);
    const rules = result.findings.map((finding: { rule: string }) => finding.rule);
    expect(new Set(rules)).toEqual(new Set(["idiom.cocoa-class-authoring", "idiom.nse-controls", "idiom.managed-lifecycle", "idiom.document-state", "idiom.atmo-appearance"]));
    const message = (rule: string, text: string) => result.findings.find((finding: { rule: string; message: string }) => finding.rule === rule && finding.message.includes(text));
    expect(message("idiom.cocoa-class-authoring", "2 useState")).toBeDefined();
    expect(message("idiom.nse-controls", "NSEPushButton")).toMatchObject({ file: "lib/App.tsx", line: 9 });
    expect(message("idiom.nse-controls", "1 raw <input>")).toBeDefined();
    expect(message("idiom.nse-controls", "NSETable")).toBeDefined();
    expect(message("idiom.managed-lifecycle", "requestAnimationFrame")?.message).toContain("manageDisplayLink");
    expect(message("idiom.managed-lifecycle", "new Worker")?.message).toContain("managedTask");
    expect(rules.filter((rule: string) => rule === "idiom.document-state")).toHaveLength(1);
    expect(message("idiom.atmo-appearance", "Atmo-Onyx is an obsolete raster theme")).toMatchObject({ file: "lib/theme.css" });
    expect(message("idiom.atmo-appearance", "14 colour literals")).toMatchObject({ file: "lib/theme.css" });
    expect(result.findings.some((finding: { file: string }) => finding.file === "src/legacy.css")).toBe(false);
    expect(result.idiomAudit.applications[0]).toMatchObject({ classAuthoring: false, stateHooks: 2, rawControls: 4, unmanagedLifecycle: 2, preferenceDocumentWrites: 1, legacyThemeMentions: 1 });
    expect(result.idiomAudit.stylesheets).toMatchObject({ scanned: 2, colourLiterals: 15 });
    expect((await validateProject({ projectRoot: project, typescript: false, idioms: false })).findings).toEqual([]);
  });
  it("returns each SDK symbol once with its entries, outlining long declarations", async () => {
    const members = Array.from({ length: 40 }, (_, index) => "  /** Member " + index + ". */\n  member" + index + "(value: string): string;").join("\n");
    put("node_modules/@syndromatic/syncloudos/shared.d.ts", "export declare class Widget {\n" + members + "\n  private secret;\n}\nexport declare function makeWidget(): Widget;\n");
    put("node_modules/@syndromatic/syncloudos/a.d.ts", 'export * from "./shared";\n');
    put("node_modules/@syndromatic/syncloudos/b.d.ts", 'export * from "./shared";\n');
    put("node_modules/@syndromatic/syncloudos/package.json", JSON.stringify({ name: "@syndromatic/syncloudos", version: "1.0.0-beta.2", exports: { "./a": { types: "./a.d.ts" }, "./b": { types: "./b.d.ts" } } }));
    const result = await lookupSdk({ projectRoot: project, query: "Widget" });
    const widget = result.symbols.filter((symbol: { name: string }) => symbol.name === "Widget");
    expect(widget).toHaveLength(1);
    expect(widget[0]).toMatchObject({ entry: "a", entries: ["a", "b"], outlined: true, file: "shared.d.ts", line: 1 });
    expect(widget[0].signature).toContain("member39(value: string): string;");
    expect(widget[0].signature).not.toContain("Member 3.");
    expect(widget[0].signature).not.toContain("secret");
    const full = await lookupSdk({ projectRoot: project, query: "Widget", full: true });
    expect(full.symbols.find((symbol: { name: string }) => symbol.name === "Widget").signature).toContain("Member 3.");
  });
  it("finds the host entry and reports why the launch check was skipped", async () => {
    put("index.html", '<!doctype html><div id="root"></div><script src="./src/main.tsx" type="module"></script>\n');
    expect(hostEntryFor(project)).toBe("/src/main.tsx");
    const result = await validateProject({ projectRoot: project, typescript: false, idioms: false });
    expect(result.launch).toEqual({ ran: false, reason: "Install vite and jsdom in the project to run the launch check." });
    expect((await validateProject({ projectRoot: project, typescript: false, idioms: false, launch: false })).launch).toEqual({ ran: false, reason: "Skipped by launch: false." });
  });
  it("launches the host entry in a page and reports launch failures and system alerts", async () => {
    // The fixture SDK ships no Vite plugin, and this page needs none.
    rmSync(resolve(project, "vite.config.ts"), { force: true });
    for (const name of ["vite", "jsdom"]) symlinkSync(resolve(repository, "node_modules", name), resolve(project, "node_modules", name), "junction");
    put("index.html", '<!doctype html><div id="root"></div><script type="module" src="/src/main.ts"></script>\n');
    put("src/main.ts", 'new Worker("worker.js").postMessage(1);\ndocument.getElementById("root")!.textContent = "Ready";\n');
    const clean = await runLaunchCheck(project);
    expect(clean).toMatchObject({ ran: true, entry: "/src/main.ts", findings: [] });
    expect(clean.limits.length).toBeGreaterThan(0);
    put("src/main.ts", 'throw new Error("The workspace could not be opened");\n');
    expect((await runLaunchCheck(project)).findings).toEqual([expect.objectContaining({ rule: "launch.failed", message: expect.stringContaining("The workspace could not be opened") })]);
    put("src/main.ts", [
      'console.error("TypeError: Cannot read properties of undefined");',
      'document.getElementById("root")!.innerHTML = \'<div class="syncloudos-system-alert"><h2>Notes could not complete that action.</h2><button class="nse-alert-disclosure">Technical details</button></div>\';',
      'document.querySelector(".nse-alert-disclosure")!.addEventListener("click", () => { document.querySelector(".syncloudos-system-alert")!.insertAdjacentHTML("beforeend", \'<pre class="nse-alert-details-text">Code: APP_CONTENT_FAILED</pre>\'); });',
      "",
    ].join("\n"));
    const alert = (await runLaunchCheck(project)).findings;
    expect(alert).toHaveLength(1);
    expect(alert[0]).toMatchObject({ rule: "launch.stopped" });
    expect(alert[0].severity).toBeUndefined();
    expect(alert[0].message).toContain("Notes could not complete that action.");
    expect(alert[0].message).toContain("Code: APP_CONTENT_FAILED");
    expect(alert[0].message).toContain("Cannot read properties of undefined");
  }, 120000);
  it("type-checks each project a solution-style tsconfig references", async () => {
    // A bare tsc --noEmit on { "files": [], "references": [...] } checks no file at all.
    symlinkSync(resolve(repository, "node_modules/typescript"), resolve(project, "node_modules/typescript"), "junction");
    put("tsconfig.json", JSON.stringify({ files: [], references: [{ path: "./tsconfig.app.json" }] }));
    put("tsconfig.app.json", JSON.stringify({ compilerOptions: { noEmit: true, strict: true, skipLibCheck: true, types: [] }, include: ["lib"] }));
    put("lib/broken.ts", 'export const count: number = "seven";\n');
    const result = await validateProject({ projectRoot: project, typescript: true, idioms: false });
    expect(result.typescript).toMatchObject({ ran: true, projects: ["tsconfig.app.json"] });
    expect(result.typescript.exitCode).not.toBe(0);
    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(expect.objectContaining({ file: "lib/broken.ts", line: 1, rule: "TS2322" }));
  });
  it("reports only visibly structured preference values as document state", async () => {
    put("applications/Prefs.app/Contents/Info.ts", 'export default { bundleIdentifier: "org.example.prefs", displayName: "Prefs", version: "1.0.0" } as const;\n');
    put("applications/Prefs.app/Contents/index.tsx", 'export { default } from "../../../lib/prefs";\n');
    put("lib/prefs.ts", [
      'import { SCOS, type NSEPreferenceDescriptor } from "@syndromatic/syncloudos";',
      "export default function prefs(opacity: number, saved: readonly string[]) {",
      '  SCOS.preferences.set("opacity", opacity);',
      '  SCOS.preferences.set("theme", "light");',
      "  const next = [...saved, \"run\"].slice(-50);",
      '  SCOS.preferences.set("runs", next);',
      '  SCOS.preferences.setJSON("history", saved);',
      "}",
      'export const RUNS: NSEPreferenceDescriptor<readonly { id: string }[]> = { key: "runs", version: 0, parse: () => [] } as never;',
      'export const SIZE: NSEPreferenceDescriptor<number> = { key: "size", version: 0, parse: () => 1 } as never;',
      "",
    ].join("\n"));
    const result = await validateProject({ projectRoot: project, typescript: false });
    const lines = result.findings.filter((finding: { rule: string }) => finding.rule === "idiom.document-state").map((finding: { line: number }) => finding.line);
    expect(lines).toEqual([6, 7, 9]);
    expect(result.idiomAudit.applications[0].preferenceDocumentWrites).toBe(3);
  });
  it("reports var(--nse-*) tokens the installed SDK does not define", async () => {
    put("node_modules/@syndromatic/syncloudos/nse/styles.css", ":root { --nse-app-foreground: #000; }\n");
    put("node_modules/@syndromatic/syncloudos/appearance.js", 'export const set = (element) => element.style.setProperty("--nse-runtime-tint", "red");\n');
    put("lib/app.css", [
      ":root { --nse-own-gap: 4px; }",
      ".a { color: var(--nse-app-foreground); background: var(--nse-runtime-tint); gap: var(--nse-own-gap); }",
      ".b { color: var(--nse-label-primary, CanvasText); border-color: var( --nse-separator-color); }",
      "",
    ].join("\n"));
    const result = await validateProject({ projectRoot: project, typescript: false });
    const tokens = result.findings.filter((finding: { rule: string }) => finding.rule === "idiom.nse-token");
    expect(tokens).toEqual([expect.objectContaining({ file: "lib/app.css", line: 3, severity: "warning" })]);
    expect(tokens[0].message).toContain("does not define: --nse-label-primary, --nse-separator-color. ");
    expect(result.idiomAudit.stylesheets.unknownTokens).toBe(2);
    expect(result.ok).toBe(true);
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
  it("picks the known failure a pasted message matches under a generic code", async () => {
    const result = await explainError({ projectRoot: project, query: "Code: APP_CONTENT_FAILED\nMessage: NSEMenuBar requires an NSEOverlayProvider." });
    expect(result.matches[0]).toMatchObject({ code: "APP_CONTENT_FAILED", diagnosis: { docs: expect.stringContaining("menus-toolbars-and-inspectors.md") } });
    expect(result.nextSteps[0]).toMatch(/known failure/u);
    const plain = await explainError({ projectRoot: project, query: "Code: APP_CONTENT_FAILED\nMessage: x is undefined" });
    expect(plain.matches[0].diagnosis).toBeNull();
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
      expect(listed.tools.find(tool=>tool.name==="scaffold")?.inputSchema.required).toEqual(["name"]);
      expect(listed.tools.find(tool=>tool.name==="scaffold")?.inputSchema.properties?.contentApplicationMenu).toMatchObject({ type: "boolean" });
      const invalidLimit = await client.callTool({ name: "lookup_sdk", arguments: { limit: 101 } });
      expect(invalidLimit.isError).toBe(true);
      const invalidPolicy = await client.callTool({ name: "scaffold", arguments: { name: "Rejected", policy: { allowEverything: true } } });
      expect(invalidPolicy.isError).toBe(true);
      expect((await inspectProject({ projectRoot: project })).bundles).toHaveLength(0);
      const scaffolded = await client.callTool({ name: "scaffold", arguments: { bundleIdentifier: "org.example.menu", name: "Menu", route: "/menu", contentApplicationMenu: true } });
      expect(scaffolded.isError).not.toBe(true);
      expect(parseManifest(resolve(project, "applications/Menu.app/Contents/Info.ts")).applicationMenu).toEqual({ trigger: "content" });
      const response = await client.callTool({name:"inspect_project",arguments:{}});
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
