import { afterEach, describe, expect, it } from 'vitest';
import { build } from 'vite';
import postcss from 'postcss';
import { mkdtempSync,mkdirSync,readFileSync,rmSync,symlinkSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { discoverThemePackages,readThemePackage,themeFontCSS } from '../../scripts/synware/theme-packages.mjs';
import { discoverSynWareProject,synCloudOS } from '../../scripts/synware/vite-plugin.mjs';

const roots:string[]=[];
const wrap=(value:string)=>`@scope ([data-nse-theme="org.example.paper"]) to ([data-nse-theme]:not([data-nse-theme="org.example.paper"])) { [data-nse-theme="org.example.paper"] { ${value} } }`;
function fixture() {
 const root=mkdtempSync(resolve(tmpdir(),'scos-theme-'));roots.push(root);
 const path=resolve(root,'Paper.scostheme');mkdirSync(resolve(path,'Contents/Resources'),{recursive:true});
 const metadata={bundleIdentifier:'org.example.paper',displayName:'Paper',version:'1.0.0',themeContractVersion:1,definition:'Theme.json',stylesheet:'styles.css'};
 const definition={id:metadata.bundleIdentifier,displayName:metadata.displayName,metadata:{version:'1.0.0',themeContractVersion:1,supportedAppearances:['light','dark']}};
 writeFileSync(resolve(path,'Contents/Info.ts'),`export default ${JSON.stringify(metadata)} as const;`);
 writeFileSync(resolve(path,'Contents/Theme.json'),JSON.stringify(definition));
 writeFileSync(resolve(path,'Contents/styles.css'),'@import "./Resources/paper.css";');
 const css=resolve(path,'Contents/Resources/paper.css');writeFileSync(css,wrap('color:black;'));
 return {root,path,css,definition:resolve(path,'Contents/Theme.json')};
}
function fonts(f:ReturnType<typeof fixture>) {
 const declaration={resources:{regular:'Resources/paper.woff2'},families:[{id:'paper',label:'Paper',defaultFaceId:'regular',faces:[{id:'regular',label:'Regular',resource:'regular',browserFamily:'Paper',weight:400,style:'normal'}]}],roles:{body:{face:'regular'},title:{family:'Paper'}}};
 writeFileSync(resolve(f.path,'Contents/Fonts.json'),JSON.stringify(declaration));writeFileSync(resolve(f.path,'Contents/Resources/paper.woff2'),'fixture-font');
}
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
describe('static .scostheme contract',()=>{
 it('keeps Metro typography and motion off arbitrary application content',()=>{
  const css=postcss.parse(readFileSync('src/Themes/Metro.scostheme/Contents/Resources/metro.css','utf8'));
  css.walkRules(rule=>{
   if(rule.selector==='[data-nse-theme="com.syndromatic.metro"]')expect(rule.nodes.filter(node=>node.type==='decl').map(node=>node.prop)).not.toEqual(expect.arrayContaining(['font-family']));
   if(rule.nodes.some(node=>node.type==='decl'&&['font','font-family'].includes(node.prop)))expect(rule.selector).toMatch(/\.(?:nse-(?!theme-provider)[\w-]+)|\[data-nse-control=/);
  });
 });
 it('bundles the complete Metro-only stylesheet with local fonts and without Atmo artwork',async()=>{
  const root=mkdtempSync(resolve(tmpdir(),'scos-metro-consumer-'));roots.push(root);
  const entry=resolve(root,'entry.js');writeFileSync(entry,`import ${JSON.stringify(resolve('src/Themes/Metro.scostheme/Contents/styles.css'))};`);
  const result=await build({configFile:false,root,base:'/nested/',logLevel:'silent',build:{write:false,assetsInlineLimit:0,rollupOptions:{input:entry}}});
  const output=(Array.isArray(result)?result[0]:result).output;
  const css=output.filter(item=>item.type==='asset'&&item.fileName.endsWith('.css')).map(item=>String(item.source)).join('');
  expect(css).toContain('com.syndromatic.metro-1.0.0-Selawik');expect(css).toContain('--nse-theme-font-body');expect(css).not.toContain('com.syndromatic.atmo');
  expect(output.filter(item=>item.fileName.endsWith('.woff'))).toHaveLength(3);
  expect(output.some(item=>/\.(?:png|jpe?g|svg)$/u.test(item.fileName))).toBe(false);
 });
 it('ships licensed cross-platform Metro font weights and matching direct CSS registrations',()=>{
  const theme=readThemePackage('src/Themes/Metro.scostheme');
  expect(theme.fonts.declaration.faces.map(face=>face.weight)).toEqual([300,400,600]);
  const css=readFileSync('src/Themes/Metro.scostheme/Contents/Resources/fonts.css','utf8');
  for(const face of theme.fonts.declaration.faces)expect(css).toContain(`font-family: "${face.browserFamily}"`);
  for(const resource of theme.fonts.resources)expect(readFileSync(resource.file).subarray(0,4).toString()).toBe('wOFF');
  expect(readFileSync('src/Themes/Metro.scostheme/Contents/Licences/Selawik-OFL.txt','utf8')).toContain('SIL OPEN FONT LICENSE');
  expect(css).not.toContain('--font-ui:');
 });
 it('discovers third-party static data without executing package code',()=>{const f=fixture();expect(discoverThemePackages(f.root)[0].definition.id).toBe('org.example.paper');});
 it.each(['Atmo','Metro'])('validates %s through the identical package path',name=>{const theme=readThemePackage(`src/Themes/${name}.scostheme`);expect(theme.definition.id).toBe(`com.syndromatic.${name.toLowerCase()}`);expect(theme.definition.styleTokenNames.length).toBeGreaterThan(20);expect(theme.licences.length).toBeGreaterThan(0);});
 it.each(['body {color:red;}','body:has([data-nse-theme="org.example.paper"]) {color:red;}','@import "https://example.com/remote.css";'])('rejects unsafe stylesheet %s',css=>{const f=fixture();writeFileSync(f.css,css);expect(()=>readThemePackage(f.path)).toThrow();});
 it.each(['URL("https://example.com/a.png")',String.raw`u\72l("https://example.com/a.png")`,String.raw`u\72l(https://example.com/a.png)`,'image-set("https://example.com/a.png" 1x)','image-set("../../../../secret.png" 1x)',String.raw`image-set("\68ttps://example.com/a.png" 1x)`,'image-set(var(--unverified) 1x)','url(var(--unverified))'])('rejects CSS resource escape %s',value=>{const f=fixture();writeFileSync(f.css,wrap(`background-image:${value};`));expect(()=>readThemePackage(f.path)).toThrow();});
 it.each(['URL("./pixel.png")',String.raw`u\72l("./pixel.png")`,'image-set("./pixel.png" 1x,URL("./pixel.png") 2x)'])('accepts static local image %s',value=>{const f=fixture();writeFileSync(resolve(f.path,'Contents/Resources/pixel.png'),'fixture');writeFileSync(f.css,wrap(`background-image:${value};`));expect(()=>readThemePackage(f.path)).not.toThrow();});
 it('rejects executable entries and metadata without evaluating either',()=>{const f=fixture();writeFileSync(resolve(f.path,'Contents/index.ts'),'throw new Error("never execute");');expect(()=>readThemePackage(f.path)).toThrow(/static data/);rmSync(resolve(f.path,'Contents/index.ts'));writeFileSync(resolve(f.path,'Contents/Info.ts'),'throw new Error("never execute"); export default {};');expect(()=>readThemePackage(f.path)).toThrow(/static declarations/);});
 it('rejects symlinks and case collisions',()=>{const f=fixture();symlinkSync(f.definition,resolve(f.path,'Contents/Resources/link.json'));expect(()=>readThemePackage(f.path)).toThrow(/symbolic links/);rmSync(resolve(f.path,'Contents/Resources/link.json'));writeFileSync(resolve(f.path,'Contents/Resources/PAPER.css'),'');expect(()=>readThemePackage(f.path)).toThrow(/case collision/);});
 it('rejects cyclic imports and inspects uppercase CSS resources',()=>{const f=fixture();writeFileSync(f.css,'@import "../styles.css";');expect(()=>readThemePackage(f.path)).toThrow(/Cyclic/);writeFileSync(f.css,wrap('color:red;'));writeFileSync(resolve(f.path,'Contents/Resources/OTHER.CSS'),'body {background:URL(https://example.com/a.png)}');expect(()=>readThemePackage(f.path)).toThrow();});
 it.each(['<script>alert(1)</script>','<rect onclick="alert(1)"/>','<foreignObject/>','<use href="https://example.com/a.svg"/>','<rect fill="URL(//example.com/a.svg)"/>',String.raw`<rect fill="u\72l(//example.com/a.svg)"/>`,'<rect style="fill:URL(//example.com/a.svg)"/>',String.raw`<rect style="fill:u\72l(//example.com/a.svg)"/>`])('rejects executable or external SVG %s',body=>{const f=fixture();writeFileSync(resolve(f.path,'Contents/Resources/art.svg'),`<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`);expect(()=>readThemePackage(f.path)).toThrow();});
 it('sanitizes both percent-encoded and base64 inline SVG resources',()=>{
  const f=fixture();
  for(const encoding of ['uri','base64'])for(const script of [false,true]) {
   const svg='<svg xmlns="http://www.w3.org/2000/svg">'+(script?'<script>alert(1)</script>':'<path d="M0 0h1"/>')+'</svg>';
   const url=encoding==='base64'?'data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64'):'data:image/svg+xml,'+encodeURIComponent(svg);
   writeFileSync(f.css,wrap(`background-image:url("${url}");`));
   if(script)expect(()=>readThemePackage(f.path)).toThrow(/SVG element/);else expect(()=>readThemePackage(f.path)).not.toThrow();
  }
 });
 it('rejects local font probing, dynamic sources and nonunique CSS family names',()=>{const f=fixture();for(const src of ['local("Arial")','var(--font-source)']){writeFileSync(f.css,`@font-face {font-family:"org.example.paper-font";src:${src}}`);expect(()=>readThemePackage(f.path)).toThrow();}writeFileSync(f.css,'@font-face {font-family:"Arial";src:url("./font.woff2")}');expect(()=>readThemePackage(f.path)).toThrow(/package-unique/);});
 it('namespaces Fonts.json and emits scoped roles without replacing host fonts',()=>{const f=fixture();fonts(f);const theme=readThemePackage(f.path);expect(theme.fonts.declaration.faces[0].browserFamily).toBe('org.example.paper-1.0.0-Paper');expect(theme.definition.styleTokenNames).toEqual(['--nse-theme-font-body','--nse-theme-font-title']);const css=themeFontCSS(theme,{regular:'/nested/font.woff2'});expect(css).toContain('--nse-theme-font-body:');expect(css).not.toContain(':root');expect(css).not.toContain('--font-ui:');});
 it('builds virtual font CSS and assets beneath a nested base',async()=>{const f=fixture();fonts(f);const entry=resolve(f.root,'entry.js');writeFileSync(entry,'import "virtual:syncloudos/theme-fonts/org.example.paper.css";');const result=await build({configFile:false,root:f.root,base:'/nested/',logLevel:'silent',plugins:[synCloudOS({themesDirectory:'.',webspringEntry:false})],build:{write:false,rollupOptions:{input:entry}}});const output=(Array.isArray(result)?result[0]:result).output;const css=output.filter(item=>item.type==='asset'&&item.fileName.endsWith('.css')).map(item=>String(item.source)).join('');expect(css).toContain('--nse-theme-font-body');expect(css).toContain('/nested/assets/');expect(output.some(item=>item.fileName.endsWith('.woff2'))).toBe(true);});
 it('rejects missing font resources and unsupported semantic roles',()=>{const f=fixture();fonts(f);rmSync(resolve(f.path,'Contents/Resources/paper.woff2'));expect(()=>readThemePackage(f.path)).toThrow(/missing/);fonts(f);const path=resolve(f.path,'Contents/Fonts.json');const data=JSON.parse(readFileSync(path,'utf8'));data.roles.unbounded=data.roles.body;writeFileSync(path,JSON.stringify(data));expect(()=>readThemePackage(f.path)).toThrow(/Unsupported theme font role/);});
 it('retains licence notices and localised metadata',()=>{const f=fixture();mkdirSync(resolve(f.path,'Contents/Licences'));writeFileSync(resolve(f.path,'Contents/Licences/LICENSE'),'notice');mkdirSync(resolve(f.path,'Contents/Resources/Localised/Base.locale'),{recursive:true});writeFileSync(resolve(f.path,'Contents/Resources/Localised/Base.locale/Localisable.strings'),'"displayName" = "Paper";');const theme=readThemePackage(f.path);expect(theme.licences).toHaveLength(1);expect(theme.localizedMetadata).toHaveLength(1);});
 it('derives only entry-reachable styleTokenNames and rejects stale inventory',()=>{const f=fixture();writeFileSync(f.css,wrap('--nse-active: white;'));writeFileSync(resolve(f.path,'Contents/Resources/unused.css'),wrap('--nse-unimported: red;'));expect(readThemePackage(f.path).definition.styleTokenNames).toEqual(['--nse-active']);const data=JSON.parse(readFileSync(f.definition,'utf8'));data.styleTokenNames=['--nse-active','--nse-unimported'];writeFileSync(f.definition,JSON.stringify(data));expect(()=>readThemePackage(f.path)).toThrow(/exactly match/);});
 it('exports themes/styles and tracks resources in project composition',()=>{const f=fixture();const project=discoverSynWareProject(f.root,{themesDirectory:'.',webspringEntry:false});expect(project.themes).toHaveLength(1);expect(project.code).toContain('export const themes = Object.freeze([defineNSETheme(');expect(project.code).toContain('/Contents/styles.css');expect(project.watchPaths).toContain(f.css);expect(discoverSynWareProject(f.root,{themesDirectory:false,webspringEntry:false}).themes).toHaveLength(0);});
 it('preserves Atmo provider ink after the naming migration',()=>{const css=readFileSync('src/Themes/Atmo.scostheme/Contents/Resources/atmo.css','utf8');expect(css).toContain('.nse-theme-provider:scope[data-nse-theme="com.syndromatic.atmo"]');expect(css).not.toContain('.nse-appearance-provider');expect(css).toContain('--nse-atmo-content-ink: #e3e8ee');});
});

it('anchors first-party theme and font boundary rules to the CSS scope root',()=>{
 for (const [theme, file] of [['Atmo','atmo.css'],['Metro','metro.css'],['Metro','fonts.css']]) {
  const css=readFileSync(`src/Themes/${theme}.scostheme/Contents/Resources/${file}`,'utf8');
  expect(css).toContain(`:scope[data-nse-theme="com.syndromatic.${theme.toLowerCase()}"] {`);
 }
});
