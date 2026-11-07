import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
const excluded = [];
try {
  await build({ entryPoints: ['src/SynCloudOSReact/DevInspectorRegion.tsx'], bundle: true, write: false, metafile: true, format: 'esm', platform: 'browser', minifySyntax: true, external: ['react','react/jsx-runtime','../../NSE/*'], loader: { '.css':'empty' }, define: { 'import.meta.env.DEV':'true' }, logLevel: 'silent', plugins: [{ name:'exclude-page-curl-for-diagnosis', setup(build) { build.onResolve({filter: /NSEPageController|(?:^|\/)Page\//}, args => { excluded.push({path:args.path, importer:args.importer}); return {path:args.path,external:true}; }); }}] });
  throw new Error('Expected reproduction did not fail');
} catch (error) {
  if (!error.errors) throw error;
  const result = { snapshot:'57761ff', pageCurlExternalised:excluded, errors:error.errors.map(e => ({file:e.location?.file,text:e.text})) };
  writeFileSync(new URL('./after/inspector-isolation.json', import.meta.url), JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
}
