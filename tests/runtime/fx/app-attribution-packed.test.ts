import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { createInstalledConsumer, runNode } from "../../../scripts/synware/installed-consumer.mjs";

it("compiles attributed apps from the immutable installed SDK and emits their PWA chunks", () => {
  const consumer = createInstalledConsumer(process.cwd(), "fx-attribution-packed-");
  cpSync(resolve("tests/fixtures/fx-attribution"), consumer.root, { recursive: true });
  const versions = ["vitest", "jsdom"].map(name => `${name}@${JSON.parse(readFileSync(resolve("node_modules", name, "package.json"), "utf8")).version}`);
  runNode([consumer.npm, "install", "--prefer-offline", "--ignore-scripts", "--package-lock=false", ...versions], consumer.root);
  mkdirSync(join(consumer.root, "sdk-copy"));
  for (const file of ["fx-attribution-runtime.js", "chunks", "assets"]) cpSync(join(consumer.installed, file), join(consumer.root, "sdk-copy", file), { recursive: true });
  writeFileSync(join(consumer.root, "copy-proof.test.ts"), `
import {expect,it} from "vitest";
import {createSynWareTestHost} from "@syndromatic/syncloudos/sdk/testing";
import First from "./src/SynWare/First.app/Contents/index";
import info from "./src/SynWare/First.app/Contents/Info";
import {bindFXFamily,fxAttributedClass,createFXSessionBinding} from "./sdk-copy/fx-attribution-runtime.js";
it("does not share mounted sessions with a separate SDK copy",async()=>{
 class CopyProbe {
   static [fxAttributedClass]=true;
   session=createFXSessionBinding(new.target,reason=>Object.assign(new Error(reason),{reason}));
   use(){return this.session.resolve();}
 }
 const Bound=bindFXFamily({CopyProbe},"com.example.first").CopyProbe;
 const host=createSynWareTestHost({application:First,manifest:{schemaVersion:1,...info},document});
 try{await host.render();expect(host.application.early.use()).toBe(host.appContext.runtimeInfo.id);expect(()=>new Bound().use()).toThrow(expect.objectContaining({reason:"notRunning"}));}
 finally{await host.dispose();}
});
`);
  writeFileSync(join(consumer.root, "vitest.config.mjs"), `
import { defineConfig } from "vitest/config";
import { synCloudOS } from "@syndromatic/syncloudos/vite";
import { resolve } from "node:path";
import { normalizePath } from "vite";
export default defineConfig({ plugins:[synCloudOS({webspringEntry:false}),{name:"private-probe",enforce:"pre",resolveId(id){if(id==="private:fx-attribution-contracts")return normalizePath(resolve("node_modules/@syndromatic/syncloudos/fx-attribution-runtime.js"));if(id==="@syndromatic/syncloudos/fx/motion")return normalizePath(resolve("probe.ts"));}}],test:{environment:"jsdom",include:["consumer.test.tsx","copy-proof.test.ts"]} });
`);
  expect(runNode(["node_modules/vitest/vitest.mjs", "run"], consumer.root)).toMatch(/2 passed/);
  cpSync(resolve("tests/fixtures/synware-authoring/6e"), join(consumer.root, "six-e"), { recursive: true });
  expect(runNode(["../node_modules/vitest/vitest.mjs", "run"], join(consumer.root, "six-e"))).toMatch(/1 passed/);
  writeFileSync(join(consumer.root, "src/SynWare/First.app/Contents/Info.ts"), 'export default {bundleIdentifier:"com.example.First",displayName:"First",version:"1.0.0",routes:[{path:"/first",primary:true}],webApp:{scope:"/first",startURL:"/first",icons:[{src:"/icon.svg",sizes:"any",type:"image/svg+xml"}]}};');
  mkdirSync(join(consumer.root, "public"));
  writeFileSync(join(consumer.root, "public/index.html"), "<!doctype html><title>Installed FX binding proof</title>");
  writeFileSync(join(consumer.root, "public/icon.svg"), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M0 0h32v32H0z"/></svg>');
  writeFileSync(join(consumer.root, "entry.ts"), 'export * from "./src/SynWare/First.app/Contents/index"; export { Probe as SecondProbe } from "./src/SynWare/Second.app/Contents/index";');
  writeFileSync(join(consumer.root, "vite.config.mjs"), `
import { synCloudOS } from "@syndromatic/syncloudos/vite";
import { resolve } from "node:path";
import { normalizePath } from "vite";
export default {base:"/nested/fx/",plugins:[synCloudOS({webspringEntry:false}),{name:"private-probe",enforce:"pre",resolveId(id){if(id==="private:fx-attribution-contracts")return normalizePath(resolve("node_modules/@syndromatic/syncloudos/fx-attribution-runtime.js"));if(id==="@syndromatic/syncloudos/fx/motion")return normalizePath(resolve("probe.ts"));}}],build:{lib:{entry:"entry.ts",formats:["es"],fileName:"proof"},rollupOptions:{external:["react","react-dom","react-dom/client","react/jsx-runtime"]}}};
`);
  expect(runNode(["node_modules/vite/bin/vite.js", "build"], consumer.root)).toContain("built in");
  writeFileSync(join(consumer.root, "verify.mjs"), `
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import * as app from "./dist/proof.js";
assert.equal(app.Probe.identity(),"com.example.first");
assert.equal(app.SecondProbe.identity(),"com.example.second");
assert.notEqual(app.Probe,app.SecondProbe);
assert.equal((await app.afterAwait()).appID,"com.example.first");
assert.equal((await app.afterTimer()).appID,"com.example.first");
assert.throws(()=>app.createProbe().use(),error=>error.reason==="notRunning");
const sw=readFileSync("dist/syncloudos-sw.js","utf8");
assert.ok(sw.includes("/nested/fx/proof.js"));
for(const name of ["", "/sdk", "/fx/crypto", "/fx/compression"]){
 const publicEntry=await import("@syndromatic/syncloudos"+name);
 for(const helper of ["bindFXFamily","fxAttributedClass","fxApplicationID","createFXSessionBinding"])assert.ok(!(helper in publicEntry));
}
await assert.rejects(import("@syndromatic/syncloudos/fx-attribution-runtime.js"),error=>error.code==="ERR_PACKAGE_PATH_NOT_EXPORTED");
console.log("Installed app attribution and emitted PWA bindings passed");
`);
  expect(runNode(["verify.mjs"], consumer.root)).toContain("Installed app attribution and emitted PWA bindings passed");
}, 180_000);
