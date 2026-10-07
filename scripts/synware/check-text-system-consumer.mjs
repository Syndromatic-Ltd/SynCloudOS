#!/usr/bin/env node
/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assertIndependentModules, createInstalledConsumer, isWithin, runNode } from "./installed-consumer.mjs";
import { assertSdkSourceUnchanged, captureSdkSourceFingerprint } from "./sdk-package-manifest.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const output = resolve(repositoryRoot, ".artifacts/synapp-sdk/text-system-consumer.json");
const write = (root, path, source) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), source); };
const source = `import React from "react";
import { createRoot } from "react-dom/client";
import { NSETextView, TextEditingSession, createUndoableNSETextOwner, attributedContent, paragraph, textRun } from "@syndromatic/syncloudos/nse/text";
import * as text from "@syndromatic/syncloudos/nse/text";
import { createIndexedDBDocumentAssetStore } from "@syndromatic/syncloudos/browser";
import { createDocumentOutputPreparation } from "@syndromatic/syncloudos/sdk";
import { GFXPath } from "@syndromatic/syncloudos/fx/graphics";
// @ts-expect-error The retired umbrella is deliberately absent from this distribution.
void text.NSEEditor;
// @ts-expect-error Backend objects cannot be authoring props.
const forbidden: React.ComponentProps<typeof NSETextView> = { editor: {} };
void forbidden;
declare global { interface Window { textSystem: { ready?:boolean; error?:string; text?:string; revision?:number; durable?:boolean; pdfBytes?:number; undo():Promise<unknown> } } }
const owner = createUndoableNSETextOwner({ content: attributedContent([paragraph([textRun("Installed")])]) });
const session = new TextEditingSession({ id: "installed", owner, history: owner.history });
window.textSystem = { undo: () => session.requestHistory("undo") };
session.subscribe(() => { const snapshot = session.getSnapshot(); window.textSystem.text = snapshot.model.text; window.textSystem.revision = snapshot.model.revision; });
createRoot(document.getElementById("root")!).render(<NSETextView session={session} label="Installed text" />);
async function probe() {
 const scope = { authorizationId: "installed-app", documentId: "one" };
 const databaseName = "installed-text-system-" + crypto.randomUUID();
 const first = createIndexedDBDocumentAssetStore({ databaseName });
 const reference = await first.put(scope, { bytes:new Uint8Array([1,2,3]),mimeType:"application/octet-stream" });
 await first.retain({scope,kind:"committed",id:"model"},[reference]); first.dispose();
 const fresh = createIndexedDBDocumentAssetStore({ databaseName });
 const bytes = await fresh.read(scope, reference);
 window.textSystem.durable = fresh.capabilities.durability === "durable" && bytes.join(",") === "1,2,3";
 fresh.dispose();
 const output = await createDocumentOutputPreparation({settle:()=>({status:"settled"}),capture:()=>({documentId:"one",revision:1,model:{text:"native"}})}).prepare({engine:()=>({pages:[{geometry:{width:72,height:96},draw:context=>{context.fill(GFXPath.rect({x:10,y:10,width:20,height:20}));}}]})});
 if(output.status !== "prepared") throw new Error(output.status);
 const pdf = await output.output.exportPDF(); if(pdf.status !== "exported") throw new Error(pdf.status);
 window.textSystem.pdfBytes = pdf.bytes.byteLength; window.textSystem.ready=true;
}
void probe().catch(error => { window.textSystem.error=String(error); });
`;

export async function checkTextSystemConsumer() {
  const consumer = createInstalledConsumer(repositoryRoot, "synware-text-system-");
  const evidence = { schemaVersion: 1, archiveSha256: consumer.archiveSha256, sourceSha256: consumer.sourceSha256, consumerRoot: consumer.root, passed: false };
  let browser, server;
  try {
    const pkg = JSON.parse(readFileSync(join(consumer.installed, "package.json"), "utf8"));
    assert(pkg.exports["./nse/text"]);
    assert.equal(pkg.exports["./nse/editor"], undefined);
    write(consumer.root, "tsconfig.json", JSON.stringify({ compilerOptions: { target:"ES2022",module:"ESNext",moduleResolution:"Bundler",jsx:"react-jsx",strict:true,skipLibCheck:false,noEmit:true,lib:["ES2022","DOM"],types:["vite/client"] }, include:["src"] }));
    write(consumer.root, "src/main.tsx", source);
    write(consumer.root, "index.html", '<!doctype html><html lang="en"><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>');
    write(consumer.root, "vite.config.mjs", 'import {writeFileSync} from "node:fs"; export default {plugins:[{name:"inputs",generateBundle(){writeFileSync("resolved-modules.json",JSON.stringify([...this.getModuleIds()]));}}]};');
    runNode([join(consumer.root,"node_modules/typescript/bin/tsc"),"-p","tsconfig.json"],consumer.root,{log:join(consumer.root,"typecheck.log")});
    runNode([join(consumer.root,"node_modules/vite/bin/vite.js"),"build"],consumer.root,{log:join(consumer.root,"build.log")});
    const modules = JSON.parse(readFileSync(join(consumer.root,"resolved-modules.json"),"utf8"));
    assertIndependentModules(consumer.root,modules); evidence.moduleCount=modules.length;
    const directory=join(consumer.root,"dist");
    server=createServer((request,response)=>{
      const path=resolve(directory,"."+new URL(request.url,"http://localhost").pathname.replace(/^\/$/u,"/index.html"));
      if(!isWithin(directory,path)||!existsSync(path)){response.writeHead(404).end();return;}
      response.setHeader("Content-Type",({".html":"text/html",".js":"application/javascript",".css":"text/css",".wasm":"application/wasm"})[extname(path)]??"application/octet-stream");response.end(readFileSync(path));
    });
    await new Promise((accept,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",accept);});
    browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on("pageerror",error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(()=>window.textSystem?.ready||window.textSystem?.error);
    const result=await page.evaluate(()=>({ ...window.textSystem,undo:undefined }));assert.equal(result.error,undefined);assert.equal(result.durable,true);assert(result.pdfBytes>100);
    const view=page.getByRole("textbox",{name:"Installed text"});await view.click();await view.press("ControlOrMeta+End");await view.pressSequentially("!");
    await page.waitForFunction(()=>window.textSystem.text==="Installed!");
    await page.evaluate(()=>window.textSystem.undo());await page.waitForFunction(()=>window.textSystem.text==="Installed");
    assert.deepEqual(errors,[]);evidence.runtime={...result,typingUndo:true,errors};
    assertSdkSourceUnchanged(consumer.manifest.source,captureSdkSourceFingerprint(repositoryRoot));
    evidence.passed=true;
    console.log("Installed text-system consumer passed: strict public declarations, retired editor absence, native typing/undo, fresh IndexedDB assets, PDF and package-only resolution.");
  } catch(error) { evidence.error=error.stack??String(error);throw error; }
  finally { await browser?.close();if(server)await new Promise(accept=>server.close(accept));mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(evidence,null,2)); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await checkTextSystemConsumer();
  const { checkCustomTextSystemConsumer } = await import("./check-custom-text-system-consumer.mjs");
  await checkCustomTextSystemConsumer();
}
