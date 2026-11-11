/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import {chromium} from 'playwright';
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
await p.goto('http://127.0.0.1:5199/__dev/login?to=%2Fsoftware'); await p.getByRole('tab',{name:'SynCloudOS',exact:true}).click();
await p.getByRole('button',{name:'Next: Cocoa for the web',exact:true}).click(); await p.waitForTimeout(500);
console.log('back',await p.locator('[data-nse-application-navigation-back]').count());
await p.screenshot({path:'docs/superpowers/evidence/2026-11-07-named-images/before-stage-light.png'});
await p.getByRole('button',{name:'User Info',exact:true}).click(); await p.waitForTimeout(400); console.log(await p.locator('body').innerText());
await b.close();
