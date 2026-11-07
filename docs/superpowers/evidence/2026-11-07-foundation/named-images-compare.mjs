/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import {readFile,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
const root='docs/superpowers/evidence/2026-11-07-named-images';const rows=[];
for(const dpr of [1,2]){
const before=JSON.parse(await readFile(`${root}/before-results-dpr${dpr}.json`,'utf8'));const after=JSON.parse(await readFile(`${root}/after-results-dpr${dpr}.json`,'utf8'));
for(const b of before){const a=after.find(x=>x.colourScheme===b.colourScheme);for(const key of ['stage','preferences','history','phone']){
const name={stage:'stage',preferences:'preferences',history:'open-history',phone:'open-phone'}[key];const suffix=`${name}-${b.colourScheme}-dpr${dpr}-control.png`;
const old=await sharp(`${root}/before-${suffix}`).ensureAlpha().raw().toBuffer({resolveWithObject:true});const next=await sharp(`${root}/after-${suffix}`).ensureAlpha().raw().toBuffer({resolveWithObject:true});let changed=0,total=0,max=0;
if(old.data.length===next.data.length)for(let i=0;i<old.data.length;i+=4){let delta=0;for(let c=0;c<3;c++){const d=Math.abs(old.data[i+c]-next.data[i+c]);total+=d;delta=Math.max(delta,d);max=Math.max(max,d)}if(delta>1)changed++}
rows.push({dpr,scheme:b.colourScheme,control:key,before:b[key]?.bounds,after:a[key]?.bounds,boundsEqual:JSON.stringify(b[key]?.bounds)===JSON.stringify(a[key]?.bounds),imageBefore:b[key]?.image?.bounds,imageAfter:a[key]?.image?.bounds,changedPixelsAboveOne:changed,meanChannelDifference:total/(old.info.width*old.info.height*3),maxChannelDifference:max,errors:a.errors,backInteraction:a.galleryBackReturnsToSections});
}}
}
await writeFile(`${root}/comparison.json`,JSON.stringify(rows,null,2));console.log(rows.map(r=>({dpr:r.dpr,scheme:r.scheme,control:r.control,boundsEqual:r.boundsEqual,changed:r.changedPixelsAboveOne,mean:r.meanChannelDifference})));
