/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import {chromium} from 'playwright';
const b=await chromium.launch();const p=await b.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});p.setDefaultTimeout(15000);
try{
await p.goto('http://127.0.0.1:5199/__dev/login?to=%2F__syncloudos%2Fnse-gallery');const search=p.getByRole('searchbox',{name:'Search NSE controls'});await search.waitFor();await search.fill('Buttons');await p.waitForTimeout(400);
const tree=p.getByRole('tree',{name:'Search results',exact:true});await tree.focus();await tree.press('Home');await tree.press('ArrowRight');await tree.press('End');await tree.press('Enter');await p.waitForTimeout(500);
console.log('stage',await p.locator('.nse-window-titlebar-back,[data-nse-application-navigation-back]').count());console.log((await p.locator('body').innerText()).slice(0,600));await p.screenshot({path:'docs/superpowers/evidence/2026-11-07-named-images/before-stage-light.png'});
await p.getByRole('button',{name:'User Info',exact:true}).click();await p.getByRole('menuitem',{name:/System Preferences/}).click();await p.getByRole('button',{name:/Appearance Auto/}).click();await p.waitForTimeout(500);await p.screenshot({path:'docs/superpowers/evidence/2026-11-07-named-images/before-preferences-light.png'});console.log((await p.locator('body').innerText()).slice(-450));
}catch(e){console.log(String(e));console.log((await p.locator('body').innerText()).slice(-800));}finally{await b.close()}
