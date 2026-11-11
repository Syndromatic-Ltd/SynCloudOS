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


import { chromium } from '../../../../node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const samples = [], errors = [];
try {
 for (const [device, viewport] of Object.entries({desktop:{width:1440,height:900},phone:{width:390,height:844}})) {
  const page=await browser.newPage({viewport});
  page.on('pageerror', e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5199/__dev/login?to=%2Fabout',{waitUntil:'networkidle'});
  await page.waitForTimeout(2800);
  for(let i=0;i<3;i++) {
   if(i) {await page.locator('[role="tab"]:visible').nth(i).click();await page.waitForTimeout(1800);}
   const name=`faithful-access-baseline-${device}-${['company','framework','team'][i]}.png`;
   await page.screenshot({path:join(dir,name)});
   samples.push({device,section:i,geometry:await page.evaluate(()=>{const pane=document.querySelector('.about-pane'), art=pane.querySelector('.about-hero-art'), image=art.querySelector('img'),hero=pane.querySelector('.about-hero'),scroll=pane.querySelector('.about-pane-scroll');const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};return {pane:rect(pane),art:rect(art),image:rect(image),hero:rect(hero),scroll:rect(scroll),scrollHeight:scroll.scrollHeight};})});
  }
  await page.close();
 }
 writeFileSync(join(dir,'faithful-access-baseline.json'),JSON.stringify({samples,errors},null,2));
 console.log(JSON.stringify({samples,errors}));
} finally { await browser.close(); }
