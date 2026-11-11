/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
page.on('pageerror',e=>console.log('PAGEERROR',String(e)));
await page.goto('http://127.0.0.1:5199/__dev/login?to=%2Fsoftware');
await page.waitForTimeout(2500);
console.log(await page.locator('body').innerText());
await page.screenshot({path:'docs/superpowers/evidence/2026-11-07-named-images/before-software-root.png'});
await browser.close();
