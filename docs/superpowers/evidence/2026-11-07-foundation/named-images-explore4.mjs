/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import {chromium} from 'playwright';
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}); p.setDefaultTimeout(8000);
try{
await p.goto('http://127.0.0.1:5199/__dev/login?to=%2Fsoftware');
await p.getByRole('button',{name:'More destinations'}).click(); await p.waitForTimeout(350);
console.log('more',await p.locator('body').innerText());
await p.getByRole('tab',{name:'Mediasonic',exact:true}).click(); await p.waitForTimeout(350);
console.log('back',await p.locator('[data-nse-application-navigation-back]').count());
await p.screenshot({path:'docs/superpowers/evidence/2026-11-07-named-images/before-stage-light.png'});
await p.getByRole('button',{name:'User Info',exact:true}).click(); await p.waitForTimeout(350); console.log('prefs',await p.locator('body').innerText());
}catch(e){console.log(String(e));console.log(await p.locator('body').innerText());}finally{await b.close()}
