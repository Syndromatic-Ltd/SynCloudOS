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
import { inspectProject, lookupSdk, validateProject, scaffold, explainError, scaffoldTheme, validateTheme } from "./tools.mjs";
const manifest=JSON.parse(readFileSync(new URL("../../package.json",import.meta.url),"utf8"));
const args=process.argv.slice(2);
if (args.length && (args.length!==2 || args[0]!=="--project")) {
  process.stderr.write("Usage: syncloudos-mcp [--project <consumer-project>]\n");
  process.exitCode=1;
} else {
  const projectRoot=resolve(args[1] ?? process.cwd());
  const server=new McpServer({name:"syncloudos-developer-mcp",version:manifest.version});
  const common={projectRoot:z.string().optional().describe("Consumer project path; defaults to the server's --project or working directory.")};
  const discovery={...common,appsDirectory:z.string().optional().describe("Override static Vite appsDirectory; default src/SynWare."),preferencesDirectory:z.string().optional(),widgetsDirectory:z.string().optional(),integrationsDirectory:z.string().optional(),webspringEntry:z.union([z.string(),z.literal(false)]).optional().describe("Override shell entry; false disables the shell.")};
  const result=value=>({content:[{type:"text",text:JSON.stringify(value,null,2)}],structuredContent:value});
  function register(name,description,inputSchema,handler,readOnlyHint) {
    server.registerTool(name,{description,inputSchema,annotations:{readOnlyHint,destructiveHint:false,openWorldHint:false}},async input=>{
      try {return result(await handler({projectRoot,...input}));}
      catch (error) {return {isError:true,content:[{type:"text",text:error instanceof Error?error.message:String(error)}]};}
    });
  }
  register("inspect_project","Inspect the installed SDK, build receipt, static Vite configuration, application bundles, shell and dependencies. Does not execute Vite configuration.",discovery,inspectProject,true);
  register("lookup_sdk","List package entries or find exported symbols, declarations, JSDoc and offline framework documentation from the installed SDK. Each symbol appears once with every entry that exports it; long classes and interfaces come back as an outline (outlined: true) unless full is true. Doc excerpts are capped; read the named file for the rest.",{...common,entry:z.string().optional(),query:z.string().optional(),limit:z.number().int().min(1).max(100).default(8),full:z.boolean().default(false).describe("Return complete declarations instead of outlines for long classes and interfaces.")},lookupSdk,true);
  register("validate","Validate bundles, host declarations, TypeScript and launch; audit application, host and Webspring code for NSE authoring errors and heuristic warnings. Error findings make ok false. idiomatic is false for any idiom finding; idiomAudit lists errors, warnings, reasoned opt-outs and renderer exemptions. Custom themes are supported; no theme is mandatory. Launch executes the project Vite configuration when enabled.",{...discovery,typescript:z.boolean().default(true),idioms:z.boolean().default(true),launch:z.boolean().default(true).describe("Launch the host entry in jsdom through the project Vite config. Needs vite and jsdom; reports launch.ran false otherwise.")},validateProject,false);
  register("scaffold_theme","Create a custom NSE appearance with every neutral required colour value in light and dark, plus its definition and stylesheet. Refuses existing targets; no Atmo dependency.",{...common,name:z.string().min(1),directory:z.string().optional().describe("New project-relative theme directory; defaults to src/Themes/<name>.")},scaffoldTheme,false);
  register("validate_theme","Validate a theme manifest and actual stylesheet against the installed neutral NSE appearance contract. Lists missing or malformed values for light and dark without executing code.",{...common,path:z.string().min(1).describe("Project-relative theme directory or theme.json path.")},validateTheme,true);
  const policy=z.object({public:z.boolean().optional(),requiresLogin:z.boolean().optional(),requiredCapabilities:z.array(z.string().min(1)).optional(),requiredAccessClasses:z.array(z.enum(["team","external"])).optional()}).strict().optional().describe("Explicit runtime.policy access declaration. Omitted policy does not make an app public; disabled/optional-auth primaries must explicitly declare public: true.");
  register("scaffold","Create a folder-discovered application with explicit identity, preference pane, widget or integration. Refuses existing targets; never overwrites files.",{...discovery,kind:z.enum(["application","preferencePane","widget","integration"]).default("application"),id:z.string().optional().describe("Contribution ID for non-application entries only."),bundleIdentifier:z.string().optional(),organisation:z.string().default("com.example"),name:z.string(),route:z.string().optional(),owners:z.array(z.string()).optional(),policy,presentation:z.enum(["appView","windowedView","systemSheet","backgroundService"]).optional(),contentApplicationMenu:z.boolean().optional().describe("Declare applicationMenu.trigger \"content\" and render an NSEButton application-menu trigger in the view."),authoring:z.enum(["separate","inline","function"]).optional().describe("Defaults to separate: an NSEApplication subclass, an NSEViewController with @observable state, bindings and @action, and a view file using NSE controls. function is an explicit opt-in.")},scaffold,false);
  register("explain_error","Identify exact runtime catalogue codes or exported SDK error classes from installed declarations. Classify TypeScript diagnostics and npm warnings outside that catalogue. Fuzzy related suggestions (score >= 0.3) are not diagnoses and never appear in matches.",{...common,query:z.string().min(1),limit:z.number().int().min(1).max(20).default(5)},explainError,true);
  await server.connect(new StdioServerTransport());
}
