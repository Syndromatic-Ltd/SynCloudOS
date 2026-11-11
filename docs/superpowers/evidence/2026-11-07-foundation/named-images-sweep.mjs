/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import {readdirSync,readFileSync,writeFileSync} from 'node:fs';import path from 'node:path';import ts from 'typescript';
const rows=[],svg=[];
for(const root of ['src','../site/src']){
const walk=dir=>{for(const entry of readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory()){if(!/tests?|node_modules|vendor/.test(entry.name))walk(file);continue}if(!/\.(tsx?|strings)$/.test(file)||/\.(test|spec)\./.test(file))continue;const text=readFileSync(file,'utf8');if(file.endsWith('.strings')){text.split(/\r?\n/).forEach((line,i)=>{const m=line.match(/^"([^"]+)"\s*=\s*"([^"]*)"/);if(m&&/^[‹›«»<>]|[‹›«»<>]$/.test(m[2].trim()))rows.push({file,line:i+1,key:m[1],value:m[2]})});continue}
const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
const visit=node=>{if((ts.isStringLiteralLike(node)||ts.isJsxText(node))&&/^[‹›«»<>]|[‹›«»<>]$/.test(node.text.trim())){const parent=node.parent;const name=ts.isJsxAttribute(parent)?parent.name.getText(source):ts.isPropertyAssignment(parent)?parent.name.getText(source):'';if(/title|label/i.test(name)||ts.isJsxText(node))rows.push({file,line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,name,value:node.text.trim()})}if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)){if(node.tagName.getText(source)==='svg')svg.push({file,line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1})}ts.forEachChild(node,visit)};visit(source);
}};walk(root)
}
const output={arrowTitlesOrLabels:rows,inlineSVGInventory:svg};writeFileSync('docs/superpowers/evidence/2026-11-07-foundation/named-images-sweep.json',JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));
