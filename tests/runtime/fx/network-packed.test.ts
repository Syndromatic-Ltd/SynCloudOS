import { cpSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { createInstalledConsumer, runNode, verifyInstalledSdkResources } from "../../../scripts/synware/installed-consumer.mjs";
it("installed Network entry compiles real apps and excludes old factories and private types", () => {
  const consumer = createInstalledConsumer(process.cwd(), "network-attribution-packed-");
  cpSync(resolve("tests/fixtures/network-attribution"), consumer.root, { recursive: true });
  const versions = ["vitest", "jsdom"].map(name => `${name}@${JSON.parse(readFileSync(resolve("node_modules", name, "package.json"), "utf8")).version}`);
  runNode([consumer.npm, "install", "--prefer-offline", "--ignore-scripts", "--package-lock=false", ...versions], consumer.root);
  writeFileSync(join(consumer.root, "vitest.config.mjs"), `import { defineConfig } from "vitest/config"; import { synCloudOS } from "@syndromatic/syncloudos/vite";
export default defineConfig({plugins:[synCloudOS({webspringEntry:false})],test:{environment:"jsdom",include:["consumer.test.tsx"]}});`);
  expect(runNode(["node_modules/vitest/vitest.mjs", "run"], consumer.root)).toMatch(/3 passed/);
  writeFileSync(join(consumer.root, "entry.ts"), 'export * from "./src/SynWare/First.app/Contents/index";');
  writeFileSync(join(consumer.root, "vite.config.mjs"), `import { synCloudOS } from "@syndromatic/syncloudos/vite";
export default {plugins:[synCloudOS({webspringEntry:false}),{name:"record-graph",generateBundle(){this.emitFile({type:"asset",fileName:"modules.json",source:JSON.stringify([...this.getModuleIds()])});}}],build:{lib:{entry:"entry.ts",formats:["es"],fileName:"proof"},rollupOptions:{external:["react","react-dom","react-dom/client","react/jsx-runtime"]}}};`);
  expect(runNode(["node_modules/vite/bin/vite.js", "build"], consumer.root)).toContain("built in");
  const modules = JSON.parse(readFileSync(join(consumer.root, "dist/modules.json"), "utf8")) as string[];
  expect(modules.some(id => id.replaceAll("\\", "/").includes(process.cwd().replaceAll("\\", "/")))).toBe(false);
  expect(modules.some(id => id.includes("/node_modules/@syndromatic/syncloudos/fx/network.js"))).toBe(true);
  expect(modules.filter(id => id.replaceAll("\\", "/").endsWith("/fx-attribution-runtime.js"))).toHaveLength(1);
  writeFileSync(join(consumer.root, "verify.mjs"), `import assert from "node:assert/strict";
import * as app from "./dist/proof.js";
assert.throws(()=>new app.NWFXPathMonitor(),app.NWFXError);
const entry=await import("@syndromatic/syncloudos/fx/network");
assert.deepEqual(Object.keys(entry).sort(),["NWFXPathMonitor","NWFXPath","NWFXInterface","NWFXError","NWFXPathStatus","NWFXInterfaceType","NWFXPathUnsatisfiedReason"].sort());
for(const name of ["", "/sdk", "/fx/network"]){const publicEntry=await import("@syndromatic/syncloudos"+name);for(const helper of ["networkPortFor","associateNetworkPort","NetworkPort","bindFXFamily","fxAttributedClass","networkSessionBindings"])assert.ok(!(helper in publicEntry));}
await assert.rejects(import("@syndromatic/syncloudos/FX/NetworkFX/internal/networkPort"),error=>error.code==="ERR_PACKAGE_PATH_NOT_EXPORTED");
console.log("Installed Network attribution passed");`);
  expect(runNode(["verify.mjs"], consumer.root)).toContain("Installed Network attribution passed");
  const declarationRoot = join(consumer.installed, "types/FX/NetworkFX");
  const declarations = readdirSync(declarationRoot).filter(name => name.endsWith(".d.ts")).map(name => readFileSync(join(declarationRoot, name), "utf8")).join("\n");
  expect(declarations).not.toMatch(/NetworkPort|NetworkPathSnapshot|NetworkPathAdapter|networkSessionBindings|fxAttributedClass|fxBoundApplication|FXAppSession|runtimeContracts|internal\//);
  expect(declarations).not.toMatch(/NWFXCapabilities|NWFXAuthorizationStatus|NWFXPathClient|effectiveType|downlinkMegabitsPerSecond|roundTripTimeMilliseconds|readonly source|readonly interfaceType|readonly saveData/);
  for (const name of ["appContextTypes.d.ts", "scos/scosFacade.d.ts"]) expect(readFileSync(join(consumer.installed, "types/SynCloudOS/AppSDK", name), "utf8")).not.toMatch(/network[?:]|NetworkPort|NWFXPathClient|mountedNetwork/);
  writeFileSync(join(consumer.root, "types.ts"), `import {NWFXPathMonitor,NWFXPath,NWFXInterface,NWFXError,NWFXPathStatus,NWFXPathUnsatisfiedReason,NWFXInterfaceType} from "@syndromatic/syncloudos/fx/network";
import {SCOS,useNetwork} from "@syndromatic/syncloudos/sdk";
import {DFXQueue} from "@syndromatic/syncloudos/fx/dispatch";
const monitor: NWFXPathMonitor=useNetwork(); const filtered=new NWFXPathMonitor(NWFXInterfaceType.wifi); const prohibited=new NWFXPathMonitor([NWFXInterfaceType.cellular]);
monitor.pathUpdateHandler=path=>{const status:NWFXPathStatus=path.status;const reason:NWFXPathUnsatisfiedReason=path.unsatisfiedReason;const interfaces:readonly NWFXInterface[]=path.availableInterfaces;const supported:boolean=path.supportsDNS&&path.supportsIPv4&&path.supportsIPv6;void [status,reason,interfaces,supported];};monitor.start(DFXQueue.main);monitor.cancel();
// @ts-expect-error NWPathMonitor.start(queue:) requires a queue.
monitor.start(null);void [filtered,prohibited,NWFXError.posix(13)];
// @ts-expect-error Removed public factory.
SCOS.network;
// @ts-expect-error Removed client type.
import type {NWFXPathClient} from "@syndromatic/syncloudos/fx/network";
// @ts-expect-error No authorization API.
monitor.requestAuthorization();
// @ts-expect-error Private host ports are not exported.
import {networkPortFor} from "@syndromatic/syncloudos/fx/network";
// @ts-expect-error Paths are issued by the framework.
new NWFXPath();
// @ts-expect-error Apple-shaped queue parameter, not a browser callback parameter.
monitor.start(()=>{});
`);
  writeFileSync(join(consumer.root, "tsconfig.json"), JSON.stringify({compilerOptions:{target:"ES2022",module:"ESNext",moduleResolution:"Bundler",jsx:"react-jsx",strict:true,skipLibCheck:false,noEmit:true,lib:["ES2022","DOM","DOM.Iterable"],types:["vite/client"]},files:["types.ts"]}));
  runNode(["node_modules/typescript/bin/tsc", "-p", "tsconfig.json"], consumer.root);
  verifyInstalledSdkResources(consumer.installed, consumer.manifest);
  writeFileSync(resolve("docs/superpowers/evidence/2026-11-08-fx-fidelity/network-installed.json"), JSON.stringify({archiveSha256:consumer.archiveSha256,integrity:consumer.integrity,sourceSha256:consumer.sourceSha256,resourcesSha256:consumer.resourcesSha256,network:consumer.manifest.entries["@syndromatic/syncloudos/fx/network"],installedOutsideRepository:true,linked:false,compiledAppTests:3,productionBuild:true,productionImports:true,declarationGraph:true,strictInstalledTypes:true,sharedSDKGraph:true,resourceIntegrityAfterProof:true},null,2)+"\n");
}, 180_000);

it("strict installed browser and testing signatures hide Network adapters", () => {
  const consumer = createInstalledConsumer(process.cwd(), "network-boundary-packed-");
  cpSync(resolve("tests/fixtures/network-attribution/public-types.ts"), join(consumer.root, "types.ts"));
  writeFileSync(join(consumer.root, "tsconfig.json"), JSON.stringify({compilerOptions:{target:"ES2022",module:"ESNext",moduleResolution:"Bundler",jsx:"react-jsx",strict:true,skipLibCheck:false,noEmit:true,lib:["ES2022","DOM","DOM.Iterable"],types:["vite/client"]},files:["types.ts"]}));
  runNode(["node_modules/typescript/bin/tsc", "-p", "tsconfig.json"], consumer.root);
  verifyInstalledSdkResources(consumer.installed, consumer.manifest);
}, 180_000);
