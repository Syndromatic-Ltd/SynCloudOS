import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { createInstalledConsumer, runNode, verifyInstalledSdkResources } from "../../../scripts/synware/installed-consumer.mjs";

it("proves compiled hook identity and all seven hook declaration boundaries in the immutable installed SDK", () => {
  const consumer = createInstalledConsumer(process.cwd(), "hooks-attribution-packed-");
  cpSync(resolve("tests/fixtures/network-attribution"), consumer.root, { recursive: true, filter: path => !path.replaceAll("\\", "/").split("/").includes("node_modules") });
  const versions = ["vitest", "jsdom"].map(name => `${name}@${JSON.parse(readFileSync(resolve("node_modules", name, "package.json"), "utf8")).version}`);
  runNode([consumer.npm, "install", "--prefer-offline", "--ignore-scripts", "--package-lock=false", ...versions], consumer.root);
  writeFileSync(join(consumer.root, "vitest.config.mjs"), `import { defineConfig } from "vitest/config"; import { synCloudOS } from "@syndromatic/syncloudos/vite";
export default defineConfig({plugins:[synCloudOS({webspringEntry:false})],test:{environment:"jsdom",include:["consumer.test.tsx"]}});`);
  expect(runNode(["node_modules/vitest/vitest.mjs", "run"], consumer.root)).toMatch(/3 passed/);
  writeFileSync(join(consumer.root, "entry.ts"), 'export * from "./src/SynWare/First.app/Contents/index";');
  writeFileSync(join(consumer.root, "vite.config.mjs"), `import {synCloudOS} from "@syndromatic/syncloudos/vite";
export default {plugins:[synCloudOS({webspringEntry:false}),{name:"record-graph",generateBundle(){this.emitFile({type:"asset",fileName:"modules.json",source:JSON.stringify([...this.getModuleIds()])});}}],build:{lib:{entry:"entry.ts",formats:["es"],fileName:"proof"},rollupOptions:{external:["react","react-dom","react-dom/client","react/jsx-runtime"]}}};`);
  expect(runNode(["node_modules/vite/bin/vite.js", "build"], consumer.root)).toContain("built in");
  const modules = JSON.parse(readFileSync(join(consumer.root, "dist/modules.json"), "utf8")) as string[];
  expect(modules.some(id => id.replaceAll("\\", "/").includes(process.cwd().replaceAll("\\", "/")))).toBe(false);
  expect(modules.filter(id => id.replaceAll("\\", "/").endsWith("/fx-attribution-runtime.js"))).toHaveLength(1);
  writeFileSync(join(consumer.root, "verify.mjs"), `import assert from "node:assert/strict";import * as app from "./dist/proof.js";
assert.equal(typeof app.NetworkHookProbe,"function");assert.throws(()=>new app.NWFXPathMonitor(),app.NWFXError);
const sdk=await import("@syndromatic/syncloudos/sdk");for(const name of ["useNetwork","useSpeech","useContacts","usePayment","useNFC","useBluetooth","useXR"])assert.equal(typeof sdk[name],"function");assert.ok(!("usePass" in sdk));`);
  runNode(["verify.mjs"], consumer.root);
  writeFileSync(join(consumer.root, "types.ts"), `import {useNetwork,useSpeech,useContacts,usePayment,useNFC,useBluetooth,useXR,SCOS} from "@syndromatic/syncloudos/sdk";
import type {NWFXPathMonitor} from "@syndromatic/syncloudos/fx/network";
import type {SPFXSpeechRecognizer} from "@syndromatic/syncloudos/fx/speech";
import type {CNFXContactStore} from "@syndromatic/syncloudos/fx/contacts";
import {PKFXPaymentRequest,type PKFXPaymentAuthorizationController} from "@syndromatic/syncloudos/fx/pass";
import type {NFXNDEFReaderSession} from "@syndromatic/syncloudos/fx/nfc";
import type {BTFXCentralManager} from "@syndromatic/syncloudos/fx/bluetooth";
import type {XRFXSession} from "@syndromatic/syncloudos/fx/xr";
const network:NWFXPathMonitor=useNetwork(),speech:SPFXSpeechRecognizer=useSpeech(),contacts:CNFXContactStore=useContacts(),payment:PKFXPaymentAuthorizationController=usePayment(new PKFXPaymentRequest()),nfc:NFXNDEFReaderSession=useNFC({readerSessionDidInvalidateWithError(){}}),bluetooth:BTFXCentralManager=useBluetooth(),xr:XRFXSession=useXR();
void [network,speech,contacts,payment,nfc,bluetooth,xr];
// @ts-expect-error No invented Pass alias.
import {usePass} from "@syndromatic/syncloudos/sdk";
// @ts-expect-error Removed context factory.
SCOS.network;
// @ts-expect-error Removed context factory.
SCOS.speech;
// @ts-expect-error Removed context factory.
SCOS.contacts;
// @ts-expect-error Removed context factory.
SCOS.payment;
// @ts-expect-error Removed context factory.
SCOS.nfc;
// @ts-expect-error Removed context factory.
SCOS.bluetooth;
// @ts-expect-error Removed context factory.
SCOS.xr;`);
  writeFileSync(join(consumer.root, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx", strict: true, skipLibCheck: false, noEmit: true, lib: ["ES2022", "DOM", "DOM.Iterable"], types: ["vite/client"] }, files: ["types.ts"] }));
  runNode(["node_modules/typescript/bin/tsc", "-p", "tsconfig.json"], consumer.root);
  writeFileSync(join(consumer.root, "graph.mjs"), `import ts from "typescript";import {resolve} from "node:path";import {writeFileSync} from "node:fs";import assert from "node:assert/strict";
const report={};for(const name of ["index","sdk","sdk/testing","browser",...['network','speech','contacts','pass','nfc','bluetooth','xr'].map(name=>'fx/'+name)]){const program=ts.createProgram([resolve("node_modules/@syndromatic/syncloudos",name+".d.ts")],{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler});const leaked=program.getSourceFiles().filter(file=>{const path=file.fileName.replaceAll(String.fromCharCode(92),"/");return /\\/(NetworkFX|SpeechFX|ContactsFX|PassFX|NFCFX|BluetoothFX|XRFX)\\/internal\\//.test(path)||/\\/(mounted(Network|Speech|Contacts|Payment|NFC|Bluetooth|XR)(Port|Client)|Browser(NetworkPath|Speech|Contacts|Payment|NFC|Bluetooth|XR)Adapter)\\.d\\.ts$/.test(path);});assert.deepEqual(leaked.map(file=>file.fileName),[]);report[name]={familyInternalModules:leaked.length};}writeFileSync("declaration-graph.json",JSON.stringify(report,null,2));`);
  runNode(["graph.mjs"], consumer.root);
  verifyInstalledSdkResources(consumer.installed, consumer.manifest);
  writeFileSync(resolve("docs/superpowers/evidence/2026-11-08-fx-fidelity/hooks-installed.json"), JSON.stringify({ archiveSha256: consumer.archiveSha256, integrity: consumer.integrity, sourceSha256: consumer.sourceSha256, resourcesSha256: consumer.resourcesSha256, installedOutsideRepository: true, linked: false, compiledAppTests: 3, productionBuild: true, productionImports: true, strictInstalledTypes: true, sharedSDKGraph: true, declarationGraph: JSON.parse(readFileSync(join(consumer.root, "declaration-graph.json"), "utf8")), resourceIntegrityAfterProof: true }, null, 2) + "\n");
}, 240_000);
