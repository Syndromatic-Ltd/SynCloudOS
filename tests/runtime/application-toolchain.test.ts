import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { transform as esbuildTransform } from "esbuild";
import react from "@vitejs/plugin-react";
import { createServer, type Plugin, type ViteDevServer } from "vite";
import { afterEach, describe, expect, it } from "vitest";
import { createApplicationToolchain } from "../../scripts/synware/application-toolchain.mjs";
import { decoratorEsbuildOptions } from "../../scripts/synware/decorators.mjs";
import { analyseApplicationModule } from "../../scripts/synware/hot-applications.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");

interface Analysis {
  readonly defaultClass: string;
  readonly classes: readonly string[];
  readonly signatures: ReadonlyMap<string, string>;
  readonly ignoredExports: readonly string[];
}

function analyse(source: string): Analysis {
  const analysis = analyseApplicationModule(source) as Analysis | null;
  if (!analysis) throw new Error("The module was not recognised as an application module.");
  return analysis;
}

const notes = (body: string, extras = "") => `
import { NSEApplication, observable } from "@syndromatic/syncloudos/nse";
${extras}
export default class NotesApp extends NSEApplication {
${body}
}
`;

describe("application hot reload signatures", () => {
  const baseline = analyse(notes(`
  @observable accessor count = 0;
  readonly items: string[] = [];
  open() { return 1; }
`));

  it("does not change when only method bodies change", () => {
    const edited = analyse(notes(`
  @observable accessor count = 0;
  readonly items: string[] = [];
  open() { return 2; }
  added() { return 3; }
`));
    expect(edited.signatures.get("NotesApp")).toBe(baseline.signatures.get("NotesApp"));
  });

  it("changes when a field is added, removed or given another initialiser", () => {
    const signature = (body: string) => analyse(notes(body)).signatures.get("NotesApp");
    const original = baseline.signatures.get("NotesApp");
    expect(signature(`@observable accessor count = 0; readonly items: string[] = []; extra = 1; open() { return 1; }`)).not.toBe(original);
    expect(signature(`@observable accessor count = 0; open() { return 1; }`)).not.toBe(original);
    expect(signature(`@observable accessor count = 5; readonly items: string[] = []; open() { return 1; }`)).not.toBe(original);
    expect(signature(`accessor count = 0; readonly items: string[] = []; open() { return 1; }`)).not.toBe(original);
  });

  it("changes when the constructor, the extends clause or a class decorator changes", () => {
    const original = baseline.signatures.get("NotesApp");
    const withConstructor = analyse(notes(`
  @observable accessor count = 0;
  readonly items: string[] = [];
  constructor() { super(); this.count = 1; }
  open() { return 1; }
`));
    expect(withConstructor.signatures.get("NotesApp")).not.toBe(original);
    const otherBase = analyse(notes(`@observable accessor count = 0; readonly items: string[] = []; open() { return 1; }`).replace("extends NSEApplication", "extends OtherApplication"));
    expect(otherBase.signatures.get("NotesApp")).not.toBe(original);
    const decorated = analyse(notes(`@observable accessor count = 0; readonly items: string[] = []; open() { return 1; }`).replace("export default class", "@sealed export default class"));
    expect(decorated.signatures.get("NotesApp")).not.toBe(original);
  });

  it("signs the whole class when it has private members, so any edit relaunches", () => {
    const withPrivate = (method: string) => analyse(notes(`#secret = 1; open() { return ${method}; }`)).signatures.get("NotesApp");
    expect(withPrivate("1")).not.toBe(withPrivate("2"));
    const withPrivateMethod = (method: string) => analyse(notes(`#hidden() { return 1; } open() { return ${method}; }`)).signatures.get("NotesApp");
    expect(withPrivateMethod("1")).not.toBe(withPrivateMethod("2"));
  });

  it("changes a subclass's signature when a superclass declared in the same module changes its fields", () => {
    const module = (baseField: string, subclassMethod: string) => `
import { NSEApplication } from "@syndromatic/syncloudos/nse";
class Base extends NSEApplication { ${baseField} }
export default class Mail extends Base { read() { return ${subclassMethod}; } }
`;
    const original = analyse(module("a = 1;", "1")).signatures.get("Mail");
    expect(analyse(module("a = 1;", "2")).signatures.get("Mail")).toBe(original);
    expect(analyse(module("a = 2;", "1")).signatures.get("Mail")).not.toBe(original);
  });

  it("reports the default class, every top-level class and the exports Fast Refresh must ignore", () => {
    const analysis = analyse(`
import { NSEApplication } from "@syndromatic/syncloudos/nse";
export class Helper {}
class Local {}
export { Local as Exposed };
export const answer = 42;
export default class Notes extends NSEApplication {}
`);
    expect(analysis.defaultClass).toBe("Notes");
    expect([...analysis.classes].sort()).toEqual(["Helper", "Local", "Notes"]);
    expect([...analysis.ignoredExports].sort()).toEqual(["Exposed", "Helper", "default"]);
  });

  it("recognises `export default Identifier` of a local class", () => {
    expect(analyse(`class Notes extends Base {}\nexport default Notes;`).defaultClass).toBe("Notes");
  });

  it("does not recognise modules whose default export is not a class that extends something", () => {
    expect(analyseApplicationModule(`export default function App() { return null; }`)).toBeNull();
    expect(analyseApplicationModule(`export default class Plain {}`)).toBeNull();
    expect(analyseApplicationModule(`export const x = 1;`)).toBeNull();
    expect(analyseApplicationModule(`export default class { broken`)).toBeNull();
  });
});

describe("application toolchain hooks", () => {
  const devContext = { environment: { mode: "dev", config: { consumer: "client" } } };
  const source = notes(`open() { return 1; }`);

  it("registers an application module for hot reload in the dev server only", () => {
    const toolchain = createApplicationToolchain();
    const dev = toolchain.transform.call(devContext, source, "/project/src/SynWare/Notes/index.tsx?t=1") as { code: string } | null;
    expect(dev?.code).toContain("registerApplicationHotModule");
    expect(dev?.code).toContain("import.meta.hot.accept");
    expect(toolchain.transform.call({ environment: { mode: "build", config: { consumer: "client" } } }, source, "/project/src/SynWare/Notes/index.tsx")).toBeNull();
    expect(toolchain.transform.call({ environment: { mode: "dev", config: { consumer: "server" } } }, source, "/project/src/SynWare/Notes/index.tsx")).toBeNull();
    expect(toolchain.transform.call(devContext, source, "/project/node_modules/pkg/index.js")).toBeNull();
    expect(toolchain.transform.call(devContext, source, "/project/src/notes.css")).toBeNull();
  });

  it("lets an application module take its own update, but not a mixed or unrelated one", () => {
    const toolchain = createApplicationToolchain();
    toolchain.transform.call(devContext, source, "/project/src/SynWare/Notes/index.tsx");
    expect(toolchain.acceptsHotUpdate({ modules: [{ file: "/project/src/SynWare/Notes/index.tsx" }] })).toBe(true);
    expect(toolchain.acceptsHotUpdate({ modules: [{ file: "/project/src/SynWare/Notes/index.tsx" }, { file: "/project/src/other.ts" }] })).toBe(false);
    expect(toolchain.acceptsHotUpdate({ modules: [{ file: "/project/src/other.ts" }] })).toBe(false);
    expect(toolchain.acceptsHotUpdate({ modules: [] })).toBe(false);
    // Once the module stops default-exporting an application it is a plain module again.
    toolchain.transform.call(devContext, `export default function Notes() { return null; }`, "/project/src/SynWare/Notes/index.tsx");
    expect(toolchain.acceptsHotUpdate({ modules: [{ file: "/project/src/SynWare/Notes/index.tsx" }] })).toBe(false);
  });

  it("asks esbuild to lower decorators and the React plugin's Babel to parse them", () => {
    const toolchain = createApplicationToolchain();
    expect(toolchain.config()).toEqual({ esbuild: decoratorEsbuildOptions });
    const options: { parserOpts?: { plugins?: unknown[] } } = { parserOpts: { plugins: ["jsx", ["decorators", {}]] } };
    toolchain.api.reactBabel(options);
    toolchain.api.reactBabel(options);
    expect(options.parserOpts?.plugins).toEqual(["jsx", ["decorators", {}], "decoratorAutoAccessors"]);
    const bare: { parserOpts?: { plugins?: unknown[] } } = {};
    toolchain.api.reactBabel(bare);
    expect(bare.parserOpts?.plugins).toEqual(["decorators", "decoratorAutoAccessors"]);
  });
});

describe("decorators through esbuild", () => {
  const decorated = `
function mark(method, context) { context.addInitializer(function () { this.marked = (this.marked ?? []).concat(String(context.name)); }); }
function track(target, context) {
  return { get() { return target.get.call(this) * 2; }, set(value) { target.set.call(this, value); } };
}
export default class Sample {
  @track accessor value = 1;
  @mark run() { return this.value; }
}
`;

  it("leaves decorators unlowered at esnext, which no runtime can load", async () => {
    const output = await esbuildTransform(decorated, { loader: "tsx", target: "esnext" });
    expect(output.code).toContain("@track");
  });

  it("lowers them, and the result runs, with the toolchain's esbuild options", async () => {
    const output = await esbuildTransform(decorated, { loader: "tsx", target: "esnext", ...decoratorEsbuildOptions });
    expect(output.code).not.toContain("@track");
    // A static import cannot work: the module under test is the output of the transform above.
    const module = await import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(output.code).toString("base64")}`) as { default: new () => { value: number; run(): number; marked?: string[] } };
    const sample = new module.default();
    expect(sample.run()).toBe(2);
    expect(sample.marked).toEqual(["run"]);
  });
});

describe("decorated application module through the dev server", () => {
  let server: ViteDevServer | undefined;
  let directory: string | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = undefined;
  });

  it("compiles a decorated class in a .tsx file with Fast Refresh and registers it for hot reload", async () => {
    directory = mkdtempSync(join(repositoryRoot, ".toolchain-probe-"));
    mkdirSync(join(directory, "src"));
    writeFileSync(join(directory, "src", "Notes.tsx"), `
import React from "react";
import { NSEApplication, observable } from "@syndromatic/syncloudos/nse";
import { action } from "@syndromatic/syncloudos/sdk";

export function NotesView() { return <p>Notes</p>; }

export default class NotesApp extends NSEApplication {
  @observable accessor count = 0;
  @action("document.save") save() { this.count += 1; }
}
`);
    const toolchain = createApplicationToolchain();
    const composition: Plugin = { name: "probe:toolchain", enforce: "pre", config: toolchain.config, api: toolchain.api, transform: toolchain.transform };
    server = await createServer({
      root: directory,
      configFile: false,
      logLevel: "silent",
      appType: "custom",
      server: { middlewareMode: true, ws: false },
      optimizeDeps: { noDiscovery: true },
      resolve: { alias: [
        { find: "@syndromatic/syncloudos/nse", replacement: resolve(repositoryRoot, "src/NSE/sdkPackageEntry.ts") },
        { find: "@syndromatic/syncloudos/sdk", replacement: resolve(repositoryRoot, "src/SynCloudOS/AppSDK/sdkPackageEntry.ts") },
      ] },
      plugins: [composition, react()],
    });
    const result = await server.transformRequest("/src/Notes.tsx");
    const code = result?.code ?? "";
    expect(code).not.toMatch(/@observable|@action/u);
    expect(code).toContain("registerApplicationHotModule");
    expect(code).toContain("NSEApplicationHotBoundary");
    expect(code).toContain("$RefreshReg$");
  });
});
