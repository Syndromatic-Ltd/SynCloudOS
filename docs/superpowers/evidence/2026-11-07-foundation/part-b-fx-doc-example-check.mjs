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

// Typecheck complete edited byte examples in memory; emit no framework artifacts.
import ts from "typescript";
import {readFileSync} from "node:fs";
import {resolve,join} from "node:path";
const changed=["graphics.md","graphics/contexts.md","graphics/paint-and-images.md","graphics/pdf.md","image/analysis-and-raw.md","text.md"];
const snippets=new Map(); const labels=new Map();
for(const path of changed){ const markdown=readFileSync(join("docs/framework/fx",path),"utf8");let n=0; for(const m of markdown.matchAll(/```(?:ts|tsx)\n([\s\S]*?)```/gu)){n++;if(!m[1].includes("syncloudos/foundation")&&!m[1].includes(".toPNG("))continue; const file=resolve("docs/superpowers/evidence/2026-11-07-foundation",`__doc_${snippets.size}.ts`);snippets.set(file,m[1]);labels.set(file,`${path} block ${n}`);}}
const cfg=ts.readConfigFile("tsconfig.app.json",ts.sys.readFile);const parsed=ts.parseJsonConfigFileContent(cfg.config,ts.sys,process.cwd());const options={...parsed.options,noEmit:true};const host=ts.createCompilerHost(options); const originalGet=host.getSourceFile.bind(host), originalRead=host.readFile.bind(host),originalExists=host.fileExists.bind(host);
host.getSourceFile=(file,version,error,newSource)=>snippets.has(resolve(file))?ts.createSourceFile(file,snippets.get(resolve(file)),version,true):originalGet(file,version,error,newSource);
host.readFile=file=>snippets.get(resolve(file))??originalRead(file);host.fileExists=file=>snippets.has(resolve(file))||originalExists(file);
const programme=ts.createProgram([...parsed.fileNames,...snippets.keys()],options,host);const diagnostics=ts.getPreEmitDiagnostics(programme).filter(d=>d.file&&snippets.has(resolve(d.file.fileName)));
console.log(`${snippets.size} complete Foundation byte examples checked against source APIs`);for(const d of diagnostics){const pos=d.file.getLineAndCharacterOfPosition(d.start);console.log(`${labels.get(resolve(d.file.fileName))}:${pos.line+1} TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText," ")}`);}process.exitCode=diagnostics.length?1:0;
