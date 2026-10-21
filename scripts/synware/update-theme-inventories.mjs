/** Refresh checked-in first-party CSS inventories after theme authoring changes. */
import { existsSync,readFileSync,writeFileSync } from 'node:fs';
import { dirname,resolve,relative } from 'node:path';
import postcss from 'postcss';
import { ident } from 'css-tree';
import { readThemePackage,themeFontCSS } from './theme-packages.mjs';
for(const theme of ['Atmo','Metro']) {
  const contents=resolve(`src/Themes/${theme}.scostheme/Contents`),seen=new Set(),names=new Set();
  function visit(file) {
    if(seen.has(file))return;seen.add(file);
    const css=postcss.parse(readFileSync(file,'utf8'));
    css.walkAtRules('import',rule=>{const match=/^(["'])([^"']+)\1\s*$/u.exec(rule.params);if(!match)throw new TypeError(`Unsupported import ${file}`);visit(resolve(dirname(file),match[2]));});
    css.walkDecls(decl=>{const name=ident.decode(decl.prop);if(/^--nse-[a-z][a-z0-9-]*$/u.test(name))names.add(name);});
  }
  visit(resolve(contents,'styles.css'));
  if(existsSync(resolve(contents,'Fonts.json')))for(const role of Object.keys(JSON.parse(readFileSync(resolve(contents,'Fonts.json'),'utf8')).roles??{}))names.add(`--nse-theme-font-${role}`);
  const path=resolve(contents,'Theme.json'),definition=JSON.parse(readFileSync(path,'utf8'));
  definition.styleTokenNames=[...names].sort();writeFileSync(path,JSON.stringify(definition,null,2)+'\n');
  const captured=readThemePackage(dirname(contents));
  if(captured.fonts) {
    const urls=Object.fromEntries(captured.fonts.resources.map(resource=>[resource.id,'./'+relative(resolve(contents,'Resources'),resource.file).replaceAll('\\','/')]));
    const emitted=themeFontCSS(captured,urls), scope=`[data-nse-theme="${captured.definition.id}"]`, start=emitted.indexOf(scope);
    const css=emitted.slice(0,start)+`@scope (${scope}) to ([data-nse-theme]:not(${scope})) {\n`+':scope'+emitted.slice(start)+'\n}\n';
    writeFileSync(resolve(contents,'Resources/fonts.css'),css);
  }
  console.log(`${theme}: ${names.size} active theme properties`);
}
