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


import {chromium} from '../../../../node_modules/playwright/index.mjs';
import {writeFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {freezeHMR} from '../2026-11-07-about-repair/freeze-hmr.mjs';
const dir=dirname(fileURLToPath(import.meta.url)),browser=await chromium.launch(),errors=[];
try{
const page=await browser.newPage({viewport:{width:1440,height:900}});await freezeHMR(page);
page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{window.__nativeCalls=[];const original=Element.prototype.animate;Element.prototype.animate=function(frames,options){window.__nativeCalls.push({className:String(this.className),tag:this.tagName,at:performance.now(),frames,options});return original.call(this,frames,options)}});
await page.goto('http://127.0.0.1:5199/__dev/login?to=%2Fabout',{waitUntil:'domcontentloaded',timeout:120000});await page.locator('.about-pane').waitFor({timeout:120000});await page.waitForTimeout(3500);
await page.evaluate(()=>{
window.__nativeCalls=[];window.__samples=[];const started=performance.now();
const inspect=()=>[...document.querySelectorAll('.about-pane')].map(p=>{const image=p.querySelector('.about-hero-image')??p.querySelector('.about-hero-art img');const r=image.getBoundingClientRect();return {section:p.dataset.section,opacity:getComputedStyle(p).opacity,imageTransform:getComputedStyle(image).transform,imageOpacity:getComputedStyle(image).opacity,imageRect:{x:r.x,y:r.y,width:r.width,height:r.height},effects:image.getAnimations({subtree:true}).map(a=>({target:a.effect.target.className,frames:a.effect.getKeyframes(),time:a.currentTime})),ancestors:[image.parentElement,image.parentElement.parentElement].map(e=>({name:e.className,transform:getComputedStyle(e).transform}))}});
document.querySelectorAll('.about-app [role="tab"]')[1].click();
function sample(){window.__samples.push({elapsed:performance.now()-started,panes:inspect()});if(performance.now()-started<1400)requestAnimationFrame(sample)}sample();
});
await page.waitForTimeout(1900);const result=await page.evaluate(()=>({calls:window.__nativeCalls,samples:window.__samples}));result.errors=errors;writeFileSync(join(dir,process.argv[2]??'faithful-native-artwork.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({errors,calls:result.calls.map(c=>({className:c.className,tag:c.tag,frames:c.frames,options:c.options})),samples:result.samples.length}));
}finally{await browser.close()}
