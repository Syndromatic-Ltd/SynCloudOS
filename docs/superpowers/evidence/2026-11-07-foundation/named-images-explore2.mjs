/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import {chromium} from 'playwright';
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
await p.goto('http://127.0.0.1:5199/__dev/login?to=%2Fsoftware'); await p.waitForTimeout(1500);
console.log(await p.locator('button').evaluateAll(es=>es.map(e=>({text:e.innerText,label:e.getAttribute('aria-label'),title:e.title})).filter(e=>e.text||e.label)));
await p.getByRole('tab',{name:'SynCloudOS',exact:true}).click(); await p.waitForTimeout(700);
console.log('after',await p.locator('button').evaluateAll(es=>es.map(e=>({text:e.innerText,label:e.getAttribute('aria-label')})).filter(e=>e.text||e.label)));
await p.screenshot({path:'docs/superpowers/evidence/2026-11-07-named-images/before-stage-light.png'});
await b.close();
