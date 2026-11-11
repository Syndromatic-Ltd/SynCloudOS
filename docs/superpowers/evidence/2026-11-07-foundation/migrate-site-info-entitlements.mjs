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

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
const site='../site'; const changed=[]; const skipped=[];
const paths=execFileSync('git',['-C',site,'ls-files','src/**/Info.ts'],{encoding:'utf8'}).trim().split('\n');
const name=p=>p?.name&&(ts.isIdentifier(p.name)||ts.isStringLiteral(p.name))?p.name.text:'';
for(const path of paths) {
 const full=`${site}/${path}`,source=fs.readFileSync(full,'utf8');
 if(!source.includes('permissions'))continue;
 if(execFileSync('git',['-C',site,'status','--porcelain','--',path],{encoding:'utf8'}).trim()){skipped.push(path);continue;}
 const sf=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS); const edits=[];
 function walk(n){
  if(ts.isObjectLiteralExpression(n)&&n.properties.some(p=>name(p)==='bundleIdentifier')){
   const permission=n.properties.find(p=>name(p)==='permissions');
   if(permission&&ts.isPropertyAssignment(permission)&&ts.isArrayLiteralExpression(permission.initializer)){
    const capabilities=permission.initializer.elements.map(e=>ts.isStringLiteral(e)?e.text:null);
    if(capabilities.some(v=>v===null))throw new Error(`Computed site entitlements: ${path}`);
    edits.push({start:permission.name.getStart(sf),end:permission.name.end,text:'entitlements'});
    edits.push({start:permission.initializer.getStart(sf),end:permission.initializer.end,text:JSON.stringify(capabilities.filter(v=>v!=='app.open.public'))});
    const runtime=n.properties.find(p=>name(p)==='runtime');
    const publicIntent=capabilities.includes('app.open.public'),systemIntent=capabilities.includes('diagnostics.view');
    if(runtime&&ts.isPropertyAssignment(runtime)&&ts.isObjectLiteralExpression(runtime.initializer)){
     const added=[];
     if(systemIntent&&!runtime.initializer.properties.some(p=>name(p)==='type'))added.push('type: "system"');
     if(publicIntent&&!runtime.initializer.properties.some(p=>name(p)==='policy'))added.push('policy: { public: true }');
     if(added.length)edits.push({start:runtime.initializer.getStart(sf)+1,end:runtime.initializer.getStart(sf)+1,text:` ${added.join(', ')},`});
    }else if(!runtime&&(publicIntent||systemIntent)){
     const fields=[...(systemIntent?['type: "system"']:[]),...(publicIntent?['policy: { public: true }']:[])];
     edits.push({start:n.getStart(sf)+1,end:n.getStart(sf)+1,text:`\n  runtime: { ${fields.join(', ')} },`});
    }
   }
  }
  ts.forEachChild(n,walk);
 }
 walk(sf);let output=source;for(const edit of edits.sort((a,b)=>b.start-a.start))output=output.slice(0,edit.start)+edit.text+output.slice(edit.end);
 if(output!==source){fs.writeFileSync(full,output.replace(/\r\n/g,'\n'));changed.push(path);}
}
fs.writeFileSync('docs/superpowers/evidence/2026-11-07-foundation/entitlement-site-owned.json',JSON.stringify({changed,skipped},null,2)+'\n');
console.log(JSON.stringify({changed,skipped}));
