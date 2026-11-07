/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { chromium } from 'playwright';
const b=await chromium.launch();const p=await b.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});p.setDefaultTimeout(10000);
await p.goto('http://127.0.0.1:5199/__dev/login?to=%2F__syncloudos%2Fnse-gallery');await p.getByRole('searchbox',{name:'Search NSE controls'}).waitFor();await p.waitForTimeout(600);
console.log((await p.locator('body').innerText()).slice(-2300));
console.log('back',await p.locator('[data-nse-application-navigation-back]').count());
await p.screenshot({path:'docs/superpowers/evidence/2026-11-07-named-images/before-gallery-light.png'});
await p.getByRole('button',{name:'User Info',exact:true}).click();await p.getByRole('menuitem',{name:/System Preferences/}).click();await p.waitForTimeout(500);
console.log('prefs', (await p.locator('body').innerText()).slice(-1500));await b.close();
