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
const dir=dirname(fileURLToPath(import.meta.url)),browser=await chromium.launch(),errors=[];
try{const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});await page.goto('http://127.0.0.1:5199/__dev/login?to=%2Fabout',{waitUntil:'networkidle'});await page.waitForTimeout(2500);await page.screenshot({path:join(dir,'faithful-about-preflight.png')});const result={url:page.url(),panes:await page.locator('.about-pane').count(),text:(await page.locator('body').innerText()).slice(0,2000),errors};writeFileSync(join(dir,'faithful-about-preflight.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));}finally{await browser.close()}