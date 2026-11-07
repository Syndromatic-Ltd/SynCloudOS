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


// Live stills and motion after installed-package adoption; compare with the retained baseline.
import { chromium } from '../../../../node_modules/playwright/index.mjs';
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { freezeHMR } from '../2026-11-07-about-repair/freeze-hmr.mjs';
const dir=dirname(fileURLToPath(import.meta.url));
const browser=await chromium.launch();
const errors=[], samples=[], motion=[];
const sections=['company','framework','team'];
const state=page=>page.evaluate(()=>[...document.querySelectorAll('.about-pane')].map(pane=>{
 const art=pane.querySelector('.about-hero-art'), image=art.querySelector('img'), imageView=art.querySelector('.nse-control-image-view'), hero=pane.querySelector('.about-hero'), scroll=pane.querySelector('.about-pane-scroll');
 const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
 const effects=e=>e?.getAnimations().map(a=>({state:a.playState,time:a.currentTime,frames:a.effect.getKeyframes(),timing:{...a.effect.getTiming(),iterations:String(a.effect.getTiming().iterations)}}));
 return {section:pane.dataset.section,pane:rect(pane),art:rect(art),image:rect(image),imageView:rect(imageView),hero:rect(hero),scroll:rect(scroll),scrollHeight:scroll.scrollHeight,scrollTop:scroll.scrollTop,opacity:Number(getComputedStyle(pane).opacity),artOpacity:Number(getComputedStyle(imageView).opacity),artTransform:getComputedStyle(imageView).transform,paneEffects:effects(pane),artEffects:effects(imageView)};
}));
try {
 for(const [device,viewport] of Object.entries({desktop:{width:1440,height:900},phone:{width:390,height:844}})) {
  const page=await browser.newPage({viewport,deviceScaleFactor:1}); await freezeHMR(page);
  page.on('pageerror',e=>errors.push({device,type:'pageerror',message:e.message}));
  page.on('console',m=>{if(m.type()==='error')errors.push({device,type:'console',message:m.text()});});
  await page.goto('http://127.0.0.1:5199/__dev/login?to=%2Fabout',{waitUntil:'domcontentloaded',timeout:120000});
  await page.locator('.about-pane').waitFor({timeout:120000});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(3000);
  for(let i=0;i<3;i++) {
   await page.locator('.about-app [role="tab"]:visible').nth(i).click();await page.waitForTimeout(1900);
   await page.waitForFunction(expected=>{const panes=[...document.querySelectorAll('.about-pane')];return panes.length===1&&panes[0].dataset.section===expected;},sections[i]);
   const name=`faithful-about-${device}-${sections[i]}.png`;await page.screenshot({path:join(dir,name)});
   samples.push({device,section:sections[i],geometry:(await state(page))[0]});
   await sharp({create:{width:viewport.width*2,height:viewport.height,channels:3,background:'#000'}}).composite([{input:join(dir,`faithful-access-baseline-${device}-${sections[i]}.png`),left:0,top:0},{input:join(dir,name),left:viewport.width,top:0}]).png().toFile(join(dir,`faithful-compare-${device}-${sections[i]}.png`));
  }
  if(device==='desktop') {
   await page.locator('.about-app [role="tab"]:visible').nth(0).click();await page.waitForTimeout(1900);
   await page.locator('.about-pane-scroll').evaluate(e=>{e.scrollTop=650;e.dispatchEvent(new Event('scroll'));});await page.waitForTimeout(600);
   await page.screenshot({path:join(dir,'faithful-about-scrolled.png')});samples.push({device,section:'scrolled',geometry:(await state(page))[0]});
   await page.locator('.about-pane-scroll').evaluate(e=>{e.scrollTop=0;e.dispatchEvent(new Event('scroll'));});await page.waitForTimeout(200);
   for(const reduced of [false,true]) {
    await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});await page.waitForTimeout(300);
    await page.locator('.about-app [role="tab"]:visible').nth(0).click();await page.waitForTimeout(1700);
    await page.locator('.about-app [role="tab"]:visible').nth(1).click();
    const frames=[];const started=Date.now();
    for(let i=0;i<(reduced?9:20);i++){if(i)await page.waitForTimeout(reduced?40:80);frames.push({elapsed:Date.now()-started,panes:await state(page)});}
    motion.push({reduced,frames});
    await page.waitForTimeout(1000);
   }
   await page.emulateMedia({reducedMotion:'no-preference'});
   await page.locator('.about-app [role="tab"]:visible').nth(0).click();await page.waitForTimeout(1600);
   await page.locator('.about-app [role="tab"]:visible').nth(1).click();await page.waitForTimeout(620);
   const rapidBefore=await state(page);await page.locator('.about-app [role="tab"]:visible').nth(2).click();const rapidAfter=await state(page);
   await page.waitForTimeout(2000);const rapidFinal=await state(page);
   motion.push({rapid:{before:rapidBefore,after:rapidAfter,final:rapidFinal}});
  }
  await page.close();
 }
 const hidpi=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});await freezeHMR(hidpi);
 hidpi.on('pageerror',e=>errors.push({device:'desktop-dpr2',type:'pageerror',message:e.message}));
 await hidpi.goto('http://127.0.0.1:5199/__dev/login?to=%2Fabout',{waitUntil:'domcontentloaded',timeout:120000});await hidpi.locator('.about-pane').waitFor({timeout:120000});await hidpi.evaluate(()=>document.fonts.ready);await hidpi.waitForTimeout(3000);
 await hidpi.screenshot({path:join(dir,'faithful-about-desktop-dpr2.png')});samples.push({device:'desktop-dpr2',section:'company',geometry:(await state(hidpi))[0]});await hidpi.close();
 writeFileSync(join(dir,'faithful-about-browser.json'),JSON.stringify({errors,samples,motion},null,2));
 console.log(JSON.stringify({errors,samples,motionSamples:motion.map(m=>m.frames?.length??'rapid')}));
}finally{await browser.close();}
