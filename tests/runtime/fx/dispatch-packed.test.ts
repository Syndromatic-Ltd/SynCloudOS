import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { createInstalledConsumer, runNode, verifyInstalledSdkResources } from "../../../scripts/synware/installed-consumer.mjs";

it("packed third-party consumer gets per-app DFXQueue in compiled apps with one immutable SDK graph", () => {
  const consumer = createInstalledConsumer(process.cwd(), "dispatch-attribution-packed-");
  cpSync(resolve("tests/fixtures/dispatch-attribution"), consumer.root, { recursive: true });
  const versions = ["vitest", "jsdom"].map(name => `${name}@${JSON.parse(readFileSync(resolve("node_modules", name, "package.json"), "utf8")).version}`);
  runNode([consumer.npm, "install", "--prefer-offline", "--ignore-scripts", "--package-lock=false", ...versions], consumer.root);
  mkdirSync(join(consumer.root, "sdk-copy/fx"), { recursive: true });
  for (const file of ["fx-attribution-runtime.js", "chunks", "assets", "fx/dispatch.js"]) cpSync(join(consumer.installed, file), join(consumer.root, "sdk-copy", file), { recursive: true });
  writeFileSync(join(consumer.root, "copy-proof.test.ts"), `
import { expect, it } from "vitest";
import { createSynWareTestHost } from "@syndromatic/syncloudos/sdk/testing";
import First, { DFXQueue } from "./src/SynWare/First.app/Contents/index";
import info from "./src/SynWare/First.app/Contents/Info";
import { bindFXFamily } from "./sdk-copy/fx-attribution-runtime.js";
import { DFXQueue as CopyQueue } from "./sdk-copy/fx/dispatch.js";
it("separate SDK copies never share the mounted-session registry", async () => {
 const Copy = bindFXFamily({ DFXQueue: CopyQueue }, "com.example.first").DFXQueue;
 const host = createSynWareTestHost({ application: First, manifest: {schemaVersion:1,...info}, document });
 try { await host.render(); expect(DFXQueue.main).toBeInstanceOf(DFXQueue); expect(()=>Copy.main).toThrow(/notRunning/); }
 finally { await host.dispose(); }
});
`);
  writeFileSync(join(consumer.root, "vitest.config.mjs"), `import { defineConfig } from "vitest/config"; import { synCloudOS } from "@syndromatic/syncloudos/vite";
export default defineConfig({ plugins:[synCloudOS({webspringEntry:false})],test:{environment:"jsdom",include:["consumer.test.tsx","copy-proof.test.ts"]} });`);
  expect(runNode(["node_modules/vitest/vitest.mjs", "run"], consumer.root)).toMatch(/2 passed/);
  cpSync(resolve("tests/fixtures/synware-authoring/6e"), join(consumer.root, "six-e"), { recursive: true });
  expect(runNode(["../node_modules/vitest/vitest.mjs", "run"], join(consumer.root, "six-e"))).toMatch(/1 passed/);
  writeFileSync(join(consumer.root, "entry.ts"), 'export { DFXQueue as FirstQueue } from "./src/SynWare/First.app/Contents/index"; export { DFXQueue as SecondQueue } from "./src/SynWare/Second.app/Contents/index";');
  writeFileSync(join(consumer.root, "vite.config.mjs"), `import { synCloudOS } from "@syndromatic/syncloudos/vite";
export default { plugins:[synCloudOS({webspringEntry:false}),{name:"record-graph",generateBundle(){this.emitFile({type:"asset",fileName:"modules.json",source:JSON.stringify([...this.getModuleIds()])});}}],build:{lib:{entry:"entry.ts",formats:["es"],fileName:"proof"},rollupOptions:{external:["react","react-dom","react-dom/client","react/jsx-runtime"]}}};`);
  expect(runNode(["node_modules/vite/bin/vite.js", "build"], consumer.root)).toContain("built in");
  const modules = JSON.parse(readFileSync(join(consumer.root, "dist/modules.json"), "utf8")) as string[];
  expect(modules.some(id => id.replaceAll("\\", "/").includes(process.cwd().replaceAll("\\", "/")))).toBe(false);
  expect(modules.some(id => id.includes("/node_modules/@syndromatic/syncloudos/fx/dispatch.js"))).toBe(true);
  expect(modules.filter(id => id.replaceAll("\\", "/").endsWith("/fx-attribution-runtime.js"))).toHaveLength(1);
  writeFileSync(join(consumer.root, "verify.mjs"), `import assert from "node:assert/strict";
import {FirstQueue,SecondQueue} from "./dist/proof.js";
assert.notEqual(FirstQueue,SecondQueue); assert.throws(()=>FirstQueue.main,/notRunning/); assert.throws(()=>SecondQueue.main,/notRunning/);
for(const name of ["", "/sdk", "/fx/dispatch"]){const entry=await import("@syndromatic/syncloudos"+name);for(const helper of ["systemDispatch","dispatchQueueForSession","bindFXFamily","fxAttributedClass","fxApplicationID","observeFXSessionEnd"]) assert.ok(!(helper in entry));}
await assert.rejects(import("@syndromatic/syncloudos/fx-attribution-runtime.js"),error=>error.code==="ERR_PACKAGE_PATH_NOT_EXPORTED");
console.log("Installed Dispatch attribution passed");`);
  expect(runNode(["verify.mjs"], consumer.root)).toContain("Installed Dispatch attribution passed");
  const declarationRoot = join(consumer.installed, "types/FX/DispatchFX");
  const declarations = readdirSync(declarationRoot).filter(name => name.endsWith(".d.ts")).map(name => readFileSync(join(declarationRoot, name), "utf8")).join("\n");
  expect(declarations).not.toMatch(/fxAttributedClass|fxBoundApplication|FXAppSession|DispatchLifetime|classForLifetime|systemDispatch|runtimeContracts|sessionBinding/);
  writeFileSync(join(consumer.root, "types.ts"), `import {DFXQueue, DFXSource, DFXWorkItem} from "@syndromatic/syncloudos/fx/dispatch";
const queue = new DFXQueue("installed"); queue.async(()=>1); queue.async(new DFXWorkItem(()=>2)); DFXSource.makeTimerSource({queue});
// @ts-expect-error Dispatch work is synchronous.
queue.async(async()=>{});
// @ts-expect-error Framework helpers are not public.
import { systemDispatch } from "@syndromatic/syncloudos/fx/dispatch";
`);
  writeFileSync(join(consumer.root, "tsconfig.json"), JSON.stringify({compilerOptions:{target:"ES2022",module:"ESNext",moduleResolution:"Bundler",jsx:"react-jsx",strict:true,skipLibCheck:false,noEmit:true,lib:["ES2022","DOM","DOM.Iterable"],types:["vite/client"]},files:["types.ts"]}));
  runNode(["node_modules/typescript/bin/tsc", "-p", "tsconfig.json"], consumer.root);
  verifyInstalledSdkResources(consumer.installed, consumer.manifest);
  writeFileSync(resolve("docs/superpowers/evidence/2026-11-08-dispatchfx/task-6-installed.json"), JSON.stringify({
    archiveSha256: consumer.archiveSha256, integrity: consumer.integrity, sourceSha256: consumer.sourceSha256,
    resourcesSha256: consumer.resourcesSha256, dispatch: consumer.manifest.entries["@syndromatic/syncloudos/fx/dispatch"],
    installedOutsideRepository: true, linked: false, compiledAppTests: 2, authoring6eTests: 1,
    productionBuild: true, productionImports: true, declarationGraph: true, strictInstalledTypes: true,
    sharedSDKGraph: true, separateCopyRegistryIsolation: true, resourceIntegrityAfterProof: true,
  }, null, 2) + "\n");
}, 180_000);
