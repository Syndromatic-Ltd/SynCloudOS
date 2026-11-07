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

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
const dir=dirname(fileURLToPath(import.meta.url));
const read=name=>JSON.parse(readFileSync(join(dir,name),'utf8'));
const live=read('faithful-about-browser.json');
const before=read('faithful-access-baseline.json');
const controlled=read('faithful-controlled-motion.json');
const raw=read('faithful-current-raw-controlled-motion.json');
const reference=JSON.parse(readFileSync(join(dir,'../2026-11-07-about-repair/controlled-motion.json'),'utf8'));
const sections=['company','framework','team'];
const geometry=live.samples.filter(s=>sections.includes(s.section)).map(sample=>{
 const baseline=before.samples.find(old=>old.device===(sample.device==='desktop-dpr2'?'desktop':sample.device)&&old.section===sections.indexOf(sample.section));
 const differences=[];
 for(const name of ['pane','art','image','hero','scroll'])for(const key of ['x','y','width','height'])differences.push(Math.abs(sample.geometry[name][key]-baseline.geometry[name][key]));
 return {device:sample.device,section:sample.section,maximumRectangleDelta:Math.max(...differences),scrollHeightDelta:sample.geometry.scrollHeight-baseline.geometry.scrollHeight};
});
const motion={};
const currentSDKComparison={};
for(const key of ['standard','reduced']) {
 let maximumOpacityDelta=0,maximumPositionDelta=0;
 for(const sample of controlled[key])for(const pane of sample.panes){
  const old=reference[key]?.find(frame=>frame.time===sample.time)?.panes.find(old=>old.section===pane.section);
  if(old){maximumOpacityDelta=Math.max(maximumOpacityDelta,Math.abs(old.opacity-pane.opacity));maximumPositionDelta=Math.max(maximumPositionDelta,Math.abs(old.x-pane.x));}
 }
 motion[key]={frames:controlled[key].length,minimumVisiblePaneOpacity:Math.min(...controlled[key].map(frame=>Math.max(0,...frame.panes.map(p=>p.opacity)))),maximumReferenceOpacityDelta:maximumOpacityDelta,maximumReferencePositionDelta:maximumPositionDelta};
 const delta={paneX:0,paneOpacity:0,artX:0,artY:0,artWidth:0,artHeight:0,artOpacity:0};
 for(const sample of controlled[key])for(const pane of sample.panes){
  const old=raw[key].find(frame=>frame.time===sample.time)?.panes.find(old=>old.section===pane.section);
  if(!old)continue;
  delta.paneX=Math.max(delta.paneX,Math.abs(old.x-pane.x));
  delta.paneOpacity=Math.max(delta.paneOpacity,Math.abs(old.opacity-pane.opacity));
  for(const [field,target] of [['x','artX'],['y','artY'],['width','artWidth'],['height','artHeight'],['opacity','artOpacity']])if(old.art&&pane.art)delta[target]=Math.max(delta[target],Math.abs(old.art[field]-pane.art[field]));
 }
 currentSDKComparison[key]={frames:controlled[key].length,maximumAbsoluteDelta:delta};
 const indices=key==='standard'?[0,4,8,12,19]:[0,2,4,6,8];
 const previous=key==='standard'?'tab-controlled':'reduced-controlled';
 const current=key==='standard'?'faithful-tab-controlled':'faithful-reduced-controlled';
 await sharp({create:{width:2880,height:900*indices.length,channels:3,background:'#000'}}).composite(indices.flatMap((index,row)=>[
  {input:join(dir,'../2026-11-07-about-repair',previous,`${String(index).padStart(2,'0')}.png`),left:0,top:row*900},
  {input:join(dir,current,`${String(index).padStart(2,'0')}.png`),left:1440,top:row*900},
 ])).png().toFile(join(dir,`faithful-motion-${key}-comparison.png`));
 await sharp({create:{width:2880,height:900*indices.length,channels:3,background:'#000'}}).composite(indices.flatMap((index,row)=>[
  {input:join(dir,`faithful-current-raw-${previous}`,`${String(index).padStart(2,'0')}.png`),left:0,top:row*900},
  {input:join(dir,current,`${String(index).padStart(2,'0')}.png`),left:1440,top:row*900},
 ])).png().toFile(join(dir,`faithful-current-motion-${key}-comparison.png`));
}
const results={geometry,motion,currentSDKComparison,errors:{live:live.errors,controlled:controlled.errors,raw:raw.errors},liveAnimationSamples:live.motion.filter(item=>item.frames).map(item=>({reduced:item.reduced,frames:item.frames.length,artworkFramesWithNativeEffects:item.frames.filter(frame=>frame.panes.some(p=>p.artEffects.length>0)).length})),tests:{}};
for(const name of ['faithful-site-full.json','faithful-site-final-full.json','faithful-site-last-full.json','faithful-site-tip-full.json','faithful-site-handoff-full.json','faithful-full-framework-final-result.json','faithful-last-failure-recheck.json'])if(existsSync(join(dir,name))){
 const data=read(name);
 results.tests[name]={success:data.success,total:data.numTotalTests,passed:data.numPassedTests,failed:data.numFailedTests,pending:data.numPendingTests,failures:data.testResults.flatMap(suite=>suite.assertionResults.filter(test=>test.status==='failed').map(test=>({file:suite.name,name:test.fullName,message:test.failureMessages?.[0]?.replace(/\u001b\[[0-9;]*m/g,'').slice(0,400)})))};
}
writeFileSync(join(dir,'faithful-verification-summary.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
