/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import {chromium} from 'playwright';
const b=await chromium.launch();const p=await b.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
p.setDefaultTimeout(10000);await p.goto('http://127.0.0.1:5199/__dev/login?to=%2Fsoftware');await p.waitForTimeout(2000);
console.log(await p.locator('button,[role=tab]').evaluateAll(es=>es.map(e=>({tag:e.tagName,text:e.textContent?.slice(0,30),role:e.getAttribute('role'),label:e.getAttribute('aria-label')})).filter(e=>e.text==='More'||e.label?.includes('More'))));
await p.getByText('More',{exact:true}).click();await p.waitForTimeout(500);console.log((await p.locator('body').innerText()).slice(-1800));
await p.getByText('MediaSonic',{exact:true}).click();await p.waitForTimeout(500);console.log('back',await p.locator('[data-nse-application-navigation-back]').count());await p.screenshot({path:'docs/superpowers/evidence/2026-11-07-named-images/before-stage-light.png'});
await p.getByRole('button',{name:'User Info'}).click();await p.waitForTimeout(500);console.log('prefs', (await p.locator('body').innerText()).slice(-1500));await b.close();
