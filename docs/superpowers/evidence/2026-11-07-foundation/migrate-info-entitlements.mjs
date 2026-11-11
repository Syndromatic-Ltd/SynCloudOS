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
const root = process.cwd();
const excluded = new Set(['tests/runtime/info-entitlements.test.ts','tests/runtime/fx/location-requests.test.ts','tests/runtime/fx/location-mounted.test.tsx','tests/runtime/fx/midi-mounted.test.ts','tests/runtime/fx/video-capture-mounted.test.tsx']);
const explicit = new Set(['tests/runtime/bundle-loader-runtime.test.ts','tests/runtime/registry-policy-lifecycle.test.ts','tests/runtime/synware-fx-authoring.test.ts','tests/runtime/synware-fx-capabilities.test.ts']);
const all = execFileSync('git',['ls-files','tests'],{encoding:'utf8'}).trim().split('\n').filter(p => /\.(?:ts|tsx|mjs|json)$/.test(p));
const changed=[]; const skipped=[];
function clean(path) { return !execFileSync('git',['status','--porcelain','--',path],{encoding:'utf8'}).trim(); }
function name(p) { return p?.name && (ts.isIdentifier(p.name)||ts.isStringLiteral(p.name)) ? p.name.text : ''; }
function manifestObject(n) {
 const names = new Set(n.properties.map(name));
 if (names.has('schemaVersion') || names.has('bundleIdentifier') || names.has('synWareManifest')) return true;
 if (ts.isPropertyAssignment(n.parent) && ['manifest','synWareManifest'].includes(name(n.parent))) return true;
 if (n.properties.some(p => ts.isSpreadAssignment(p) && /(?:\.manifest|\.synWareManifest|publisherBase)$/.test(p.expression.getText()))) return true;
 if (ts.isCallExpression(n.parent) && /(?:createTestBundle|registerTestSynWare)$/.test(n.parent.expression.getText())) return true;
 return false;
}
for (const path of all) {
 if (excluded.has(path)) continue;
 const source=fs.readFileSync(path,'utf8'); if(!source.includes('permissions')) continue;
 if(!clean(path)) { skipped.push(path);continue; }
 let output=source;
 if(explicit.has(path)) output=output.replace(/\bpermissions\b/g,'entitlements');
 else {
  const sf=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,path.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  const edits=[];
  function walk(n) {
   if((ts.isPropertyAssignment(n)||ts.isShorthandPropertyAssignment(n))&&name(n)==='permissions'&&ts.isObjectLiteralExpression(n.parent)&&manifestObject(n.parent)) edits.push({start:n.name.getStart(sf),end:n.name.end,text:ts.isShorthandPropertyAssignment(n)?'entitlements: permissions':'entitlements'});
   if((ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))&&n.text.includes('permissions')&&/(?:schemaVersion|bundleIdentifier)/.test(n.text)) {
    const next=n.text.replace(/\bpermissions(?=\s*:\s*(?:\[|Object\.freeze\(\[))/g,'entitlements');
    if(next!==n.text) edits.push({start:n.getStart(sf),end:n.end,text:JSON.stringify(next)});
   }
   ts.forEachChild(n,walk);
  }
  walk(sf);
  edits.sort((a,b)=>b.start-a.start); for(const e of edits)output=output.slice(0,e.start)+e.text+output.slice(e.end);
 }
 if(output!==source) {fs.writeFileSync(path,output.replace(/\r\n/g,'\n'));changed.push(path);}
}
fs.writeFileSync('docs/superpowers/evidence/2026-11-07-foundation/entitlement-fixture-owned.json',JSON.stringify({changed,skipped},null,2)+'\n');
console.log(JSON.stringify({changed:changed.length,skipped}));
