#!/usr/bin/env node
/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { inspectProject, lookupSdk, validateProject, scaffold, explainError } from "./tools.mjs";
const manifest=JSON.parse(readFileSync(new URL("../../package.json",import.meta.url),"utf8"));
const args=process.argv.slice(2);
if (args.length && (args.length!==2 || args[0]!=="--project")) {
  process.stderr.write("Usage: syncloudos-mcp [--project <consumer-project>]\n");
  process.exitCode=1;
} else {
  const projectRoot=resolve(args[1] ?? process.cwd());
  const server=new McpServer({name:"syncloudos-developer-mcp",version:manifest.version});
  const common={projectRoot:z.string().optional().describe("Consumer project path; defaults to the server's --project or working directory.")};
  const discovery={...common,appsDirectory:z.string().optional().describe("Override static Vite appsDirectory; default src/SynWare."),webspringEntry:z.union([z.string(),z.literal(false)]).optional().describe("Override shell entry; false disables the shell.")};
  const result=value=>({content:[{type:"text",text:JSON.stringify(value,null,2)}],structuredContent:value});
  function register(name,description,inputSchema,handler,readOnlyHint) {
    server.registerTool("syncloudos."+name,{description,inputSchema,annotations:{readOnlyHint,destructiveHint:false,openWorldHint:false}},async input=>{
      try {return result(await handler({projectRoot,...input}));}
      catch (error) {return {isError:true,content:[{type:"text",text:error instanceof Error?error.message:String(error)}]};}
    });
  }
  register("inspect_project","Inspect the installed SDK, build receipt, static Vite configuration, application bundles, shell and dependencies. Does not execute Vite configuration.",discovery,inspectProject,true);
  register("lookup_sdk","List package entries or find exported symbols, exact declarations, JSDoc and offline framework documentation from the installed SDK.",{...common,entry:z.string().optional(),query:z.string().optional(),limit:z.number().int().min(1).max(100).default(20)},lookupSdk,true);
  register("validate","Run the shipped SynWare validator and installed manifest schema, then the project's TypeScript compiler with --noEmit. No project scripts or Vite configuration are executed.",{...discovery,typescript:z.boolean().default(true)},validateProject,false);
  register("scaffold","Create Name.app/Contents/{Info.ts,index.tsx,Resources/Localised/Base.locale/Localisable.strings}. Refuses existing bundles; never overwrites files.",{...discovery,id:z.string(),name:z.string(),route:z.string()},scaffold,false);
  register("explain_error","Explain an error code or fuzzy-match a pasted message using the installed SDK's error catalogue.",{...common,query:z.string().min(1),limit:z.number().int().min(1).max(20).default(5)},explainError,true);
  await server.connect(new StdioServerTransport());
}
