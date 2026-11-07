import assert from 'node:assert/strict';
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
const before = JSON.parse(await readFile(new URL('preferences-before.json',import.meta.url),'utf8'));
const after = JSON.parse(await readFile(new URL('browser-results-desktop-light.json',import.meta.url),'utf8'))[0];
const original = before.prefs.find(item=>item.class.includes('nse-prefs-header')).rect;
const current = after.prefsMetrics.bounds;
const maximumGeometryDifference = Math.max(...['x','y','width','height'].map(key => Math.abs(current[key]-original[key])));
assert.ok(maximumGeometryDifference <= 1/32, `cap geometry changed by ${maximumGeometryDifference}px`);
const region={left:Math.round(original.x)+14,top:Math.round(original.y)+3,width:original.width-28,height:original.height-6};
const old = await sharp(await readFile(new URL('preferences-before.png',import.meta.url))).extract(region).removeAlpha().raw().toBuffer();
const next = await sharp(await readFile(new URL('preferences-appearance-desktop-light.png',import.meta.url))).extract(region).removeAlpha().raw().toBuffer();
let changed=0,absolute=0,maximum=0;
for(let i=0;i<old.length;i++) {const delta=Math.abs(old[i]-next[i]); if(delta)changed++; absolute+=delta;maximum=Math.max(maximum,delta);}
const result={geometryUnchanged:maximumGeometryDifference===0,maximumGeometryDifference,bounds:current,region,changedChannels:changed,totalChannels:old.length,meanAbsoluteChannelDifference:absolute/old.length,maximumChannelDifference:maximum,note:'Opaque cap interior, excluding antialiased corners; original screenshot is Software, replacement screenshot is the gallery. Geometry allows 1/32 CSS pixel of subpixel centring.'};
await writeFile(new URL('preferences-cap-comparison.json',import.meta.url),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
