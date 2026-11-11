import { describe, expect, it } from "vitest";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { nseUnowned } from "../../src/NSE/Controllers/ownership";
import { managedTask } from "../../src/NSE/Tasks/managedTask";
import { registerApplicationHotModule, trackLiveApplicationObject } from "../../src/SynCloudOS/AppHosting/applicationHotReload";
import { transform } from "esbuild";
// @ts-expect-error ESM toolchain options.
import { decoratorEsbuildOptions } from "../../scripts/synware/decorators.mjs";
// @ts-expect-error ESM build tooling.
import { analyseApplicationModule } from "../../scripts/synware/hot-applications.mjs";
// @ts-expect-error ESM scaffold tooling.
import { scaffoldProjectFiles } from "../../scripts/synware/create-synware.mjs";

const source = (body: string, declarations = "") => `${declarations}\nclass Search extends NSEViewController { ${body} }\nexport default class App extends NSEApplication { static mainViewController = Search; }`;
const signature = (text: string) => analyseApplicationModule(text).signatures.get("Search");

describe("6E authoring HMR signatures", () => {
  it("keeps inline rendering and unchanged observation method edits compatible", () => {
    const view = (text: string) => source(`@observes("query", { lifetime: "visible" }) changed(value) { console.log(${text}, value); } renderView() { return <p>${text}</p>; }`);
    expect(signature(view("before"))).toBe(signature(view("after")));
  });
  it("relaunches when method observation descriptors change", () => {
    const observer = (lifetime: string) => source(`@observes("query", { lifetime: "${lifetime}" }) changed() {}`);
    expect(signature(observer("mounted"))).not.toBe(signature(observer("visible")));
  });
  it("relaunches when static dependency declarations change", () => {
    const dependencies = (key: string) => source(`static viewDependencies(controller) { return [controller.${key}]; } renderView() { return null; }`);
    expect(signature(dependencies("first"))).not.toBe(signature(dependencies("second")));
  });
  it("includes module-local resource descriptors referenced by fields", () => {
    const resource = (lifetime: string) => source(`readonly work = managedTask(this, taskOptions);`, `const taskOptions = { lifetime: "${lifetime}", policy: "latest", run: () => 1 };`);
    expect(signature(resource("mounted"))).not.toBe(signature(resource("visible")));
  });
  it("does not change an unrelated class for a different local descriptor", () => {
    const text = (value: number) => source(`readonly value = 1;`, `const unrelated = { value: ${value} };`);
    expect(signature(text(1))).toBe(signature(text(2)));
  });
  it("retires old task publication when a descriptor update relaunches its owning app", async () => {
    let finish!: () => void;
    let commit!: () => boolean;
    let writes = 0;
    class Before extends NSEViewController {
      readonly work = managedTask(this, { lifetime: "owner", policy: "latest", run: async (_: undefined, context) => {
        commit = () => context.commit(() => { writes += 1; });
        await new Promise<void>(resolve => { finish = resolve; });
        return 1;
      } });
      override renderView() { return null; }
    }
    class After extends NSEViewController { override renderView() { return null; } }
    class BeforeApp extends NSEApplication { static override mainViewController = Before; }
    class AfterApp extends NSEApplication { static override mainViewController = After; }
    const id = "6e:descriptor-task-lifetime";
    const hot = { invalidate() {} }, refreshHost = {};
    const record = (App: typeof BeforeApp | typeof AfterApp, Search: typeof Before | typeof After, lifetime: string) => ({
      id, defaultClass: "App", classes: { App, Search }, ignoredExports: ["default"], refreshHost,
      signatures: Object.fromEntries(analyseApplicationModule(source(`readonly work = managedTask(this, { lifetime: "${lifetime}", policy: "latest", run() {} });`)).signatures),
    });
    registerApplicationHotModule(hot, record(BeforeApp, Before, "mounted"));
    const view = new Before({ owner: nseUnowned });
    const stop = trackLiveApplicationObject(view, { appName: "Search", relaunch: () => view.dispose() });
    try {
      const run = view.work.run(undefined);
      registerApplicationHotModule(hot, record(AfterApp, After, "visible"));
      expect(await run.finished).toMatchObject({ status: "cancelled", reason: "owner-disposed" });
      expect(commit()).toBe(false);
      finish(); await Promise.resolve();
      expect(writes).toBe(0);
    } finally { stop(); view.dispose(); }
  });
});

describe("6E scaffolds", () => {
  it.each(["inline", "separate"])("generates the %s class pattern with real bindings and typed actions", authoring => {
    const files = scaffoldProjectFiles({ name: "Search", kind: "application", authoring });
    const entry = files.get("Contents/index.tsx");
    expect(entry).toContain("extends NSEApplication");
    expect(entry).toContain("extends NSEViewController");
    expect(entry).toContain('bind<SearchViewController, "query">(this, "query")');
    expect(entry).toContain('actionRef(SearchViewController, "clearSearch")');
    if (authoring === "inline") expect(entry).toContain("renderView()");
    else expect(files.get("Contents/Views/SearchView.tsx")).toContain("binding={controller.queryBinding}");
  });
  it("scaffolds class authoring by default and keeps the function component scaffold as an explicit choice", () => {
    const files = scaffoldProjectFiles({ name: "Search", kind: "application" });
    expect(files.get("Contents/index.tsx")).toContain("export default class SynWareApplication extends NSEApplication");
    expect(files.get("Contents/Views/SearchView.tsx")).toContain("<NSEButton");
    expect(scaffoldProjectFiles({ name: "Search", kind: "application", authoring: "function" }).get("Contents/index.tsx")).toContain("export default function");
  });
  it.each(["separate", "inline", "function"] as const)("renders the %s content application-menu trigger as an NSEButton", authoring => {
    const files = scaffoldProjectFiles({ name: "Search", kind: "application", authoring, contentApplicationMenu: true });
    expect(files.get("Contents/Info.ts")).toContain('applicationMenu: { trigger: "content" }');
    const source = [...files].filter(([path]) => path.endsWith(".tsx") && !path.includes("__tests__")).map(([, text]) => text).join("\n");
    expect(source).toContain("useApplicationMenuTrigger()");
    expect(source).toMatch(/<NSEButton ref=\{element => menu\?\.setAnchor\(element\)\}/);
    expect(source).not.toMatch(/<(button|input|select|table)\b/);
  });
  it.each(["inline", "separate"])("lowers the %s decorated scaffold using the shared standard-decorator transform", async authoring => {
    const files = scaffoldProjectFiles({ name: "Search", kind: "application", authoring });
    for (const [path, text] of files) {
      if (!path.endsWith(".tsx") || path.includes("__tests__")) continue;
      const output = await transform(text, { loader: "tsx", target: "esnext", ...decoratorEsbuildOptions });
      expect(output.code).not.toContain("@observable");
      expect(output.code).not.toContain("@action");
      expect(output.warnings).toEqual([]);
    }
  });
});
