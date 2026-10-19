#!/usr/bin/env node
/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createInstalledConsumer, runNode } from "./installed-consumer.mjs";
const repositoryRoot=resolve(import.meta.dirname,"../..");
const consumer=createInstalledConsumer(repositoryRoot,"syncloudos-mcp-consumer-");
const companion=consumer.manifest.developerMcp;
assert.equal(companion?.package,"@syndromatic/syncloudos-developer-mcp");
const archive=resolve(repositoryRoot,".artifacts/synapp-sdk",companion.archive);
const bytes=readFileSync(archive);
assert.equal(createHash("sha256").update(bytes).digest("hex"),companion.archiveSha256);
assert.equal("sha512-"+createHash("sha512").update(bytes).digest("base64"),companion.integrity);
let client;
try {
  runNode([consumer.npm,"install","--prefer-offline","--ignore-scripts","--package-lock=false",archive],consumer.root);
  writeFileSync(resolve(consumer.root,"vite.config.ts"),'import { synCloudOS } from "@syndromatic/syncloudos/vite"; export default {plugins:[synCloudOS({webspringEntry:false})]};\n');
  writeFileSync(resolve(consumer.root,"tsconfig.json"),JSON.stringify({compilerOptions:{target:"ES2022",module:"ESNext",moduleResolution:"Bundler",jsx:"react-jsx",strict:true,skipLibCheck:true,noEmit:true},include:["src"]}));
  const server=resolve(consumer.root,"node_modules/@syndromatic/syncloudos-developer-mcp/scripts/developer-mcp/server.mjs");
  const transport=new StdioClientTransport({command:process.execPath,args:[server,"--project",consumer.root],cwd:consumer.root,stderr:"pipe"});
  let stderr="";
  transport.stderr?.on("data",chunk=>{stderr+=chunk;});
  client=new Client({name:"installed-consumer-smoke",version:"1.0.0"});
  await client.connect(transport);
  const listed=await client.listTools();
  assert.deepEqual(listed.tools.map(tool=>tool.name).sort(),["syncloudos.explain_error","syncloudos.inspect_project","syncloudos.lookup_sdk","syncloudos.scaffold","syncloudos.validate"]);
  async function call(name,input={}) {
    const response=await client.callTool({name:"syncloudos."+name,arguments:input});
    assert(!response.isError,JSON.stringify(response));
    return response.structuredContent ?? JSON.parse(response.content[0].text);
  }
  const inspected=await call("inspect_project");
  assert.equal(inspected.sdk.version,companion.version);
  assert.equal(inspected.sdk.buildReceipt.sourceSha256,consumer.sourceSha256);
  const entries=await call("lookup_sdk");
  assert(entries.entries.includes("sdk"));
  const lookup=await call("lookup_sdk",{entry:"sdk",query:"createSynWare"});
  assert.equal(lookup.symbols[0].name,"createSynWare");
  assert(lookup.symbols[0].signature.includes("createSynWare"));
  assert(lookup.docs.length>0,"Installed docs must be available offline.");
  const created=await call("scaffold",{id:"org.example.hello",name:"Hello",route:"/hello"});
  assert.equal(created.createdPaths.length,3);
  const checked=await call("validate");
  assert.equal(checked.ok,true,JSON.stringify(checked.findings));
  assert.equal(checked.typescript.ran,true);
  const explained=await call("explain_error",{query:'Controller "open-account" is disposed.'});
  assert.equal(explained.matches[0].code,"NSE_CONTROLLER_DISPOSED");
  assert.equal(stderr,"");
  process.stdout.write(JSON.stringify({ok:true,sdkVersion:companion.version,tools:listed.tools.map(tool=>tool.name),archive:companion.archive,checks:["independent SDK tgz install","independent MCP tgz install","stdio listTools","inspect_project receipt","lookup_sdk installed declarations and docs","scaffold -> validate including tsc --noEmit","explain_error pasted message"]},null,2)+"\n");
} finally {
  await client?.close();
  rmSync(consumer.root,{recursive:true,force:true});
}
