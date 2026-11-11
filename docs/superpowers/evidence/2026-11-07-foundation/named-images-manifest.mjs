/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import {readFile,writeFile,readdir} from 'node:fs/promises';import {createHash} from 'node:crypto';import sharp from 'sharp';
const dir='docs/superpowers/evidence/2026-11-07-named-images';const rows=[];
for(const file of (await readdir(dir)).filter(f=>f.endsWith('.png')&&!f.includes('failure'))){const bytes=await readFile(`${dir}/${file}`);const metadata=await sharp(bytes).metadata();rows.push({file,width:metadata.width,height:metadata.height,sha256:createHash('sha256').update(bytes).digest('hex')})}
await writeFile(`${dir}/screenshot-manifest.json`,JSON.stringify(rows,null,2));console.log(`Recorded ${rows.length} screenshot hashes`);
